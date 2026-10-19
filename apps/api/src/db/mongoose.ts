import mongoose, { Connection } from 'mongoose';
import { env } from '../config/env';
import { logger } from '../config/logger';

// Bounded retry parameters
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;
const SERVER_SELECTION_TIMEOUT_MS = 5000;
const CONNECT_TIMEOUT_MS = 10000;
const SOCKET_TIMEOUT_MS = 45000;

export interface MongoConnectionState {
  isConnected: boolean;
  readyState: number;
  host?: string;
  name?: string;
}

let connectionPromise: Promise<Connection | null> | null = null;
let retryCount = 0;

/**
 * Initializes and establishes Mongoose connection with exponential backoff.
 * If MONGODB_URI is not provided in non-production, returns null without crashing.
 */
export async function connectMongo(): Promise<Connection | null> {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  const mongoUri = env.MONGODB_URI;
  if (!mongoUri) {
    if (env.NODE_ENV === 'production') {
      logger.fatal('Cannot connect to MongoDB: MONGODB_URI is required in production.');
      throw new Error('MONGODB_URI missing in production environment');
    }
    logger.warn('MONGODB_URI is not configured. Running in database-disconnected mode.');
    return null;
  }

  const connectWithRetry = async (): Promise<Connection | null> => {
    while (retryCount < MAX_RETRIES) {
      try {
        logger.info(
          { attempt: retryCount + 1, maxRetries: MAX_RETRIES, database: env.MONGODB_DB_NAME },
          'Attempting connection to MongoDB...'
        );

        await mongoose.connect(mongoUri, {
          dbName: env.MONGODB_DB_NAME,
          serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
          connectTimeoutMS: CONNECT_TIMEOUT_MS,
          socketTimeoutMS: SOCKET_TIMEOUT_MS,
          maxPoolSize: env.NODE_ENV === 'production' ? 50 : 10,
          minPoolSize: 2,
          heartbeatFrequencyMS: 10000,
          retryWrites: true,
          w: 'majority',
        });

        const activeDb = mongoose.connection.db;
        const activeDbName = activeDb?.databaseName;

        // Explicit Fail-Closed Database Identity Checks
        if (env.NODE_ENV === 'sandbox' || env.MONGODB_DB_NAME === 'adpayon_sandbox' || env.PORT === 5001) {
          if (activeDbName !== 'adpayon_sandbox') {
            logger.fatal(
              { activeDbName, expected: 'adpayon_sandbox' },
              'CRITICAL SECURITY VIOLATION: Sandbox server connected to unexpected database! Failing closed.'
            );
            await mongoose.disconnect().catch(() => {});
            throw new Error(
              `CRITICAL SECURITY FAILURE: Sandbox server expected 'adpayon_sandbox' but connected to '${activeDbName}'. Terminating.`
            );
          }
        } else if (env.NODE_ENV === 'development' && env.MONGODB_DB_NAME === 'adpayon_dev') {
          if (activeDbName !== 'adpayon_dev') {
            logger.fatal(
              { activeDbName, expected: 'adpayon_dev' },
              'CRITICAL SECURITY VIOLATION: Development server connected to unexpected database! Failing closed.'
            );
            await mongoose.disconnect().catch(() => {});
            throw new Error(
              `CRITICAL SECURITY FAILURE: Development server expected 'adpayon_dev' but connected to '${activeDbName}'. Terminating.`
            );
          }
        }

        retryCount = 0;
        logger.info(
          { database: activeDbName },
          'MongoDB connection established and verified successfully.'
        );
        return mongoose.connection;
      } catch (err: unknown) {
        retryCount++;
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, retryCount - 1);
        logger.error(
          {
            err: err instanceof Error ? err.message : 'Unknown error',
            attempt: retryCount,
            nextRetryInMs: retryCount < MAX_RETRIES ? backoffMs : 0,
          },
          'Failed to connect to MongoDB.'
        );

        if (retryCount >= MAX_RETRIES) {
          logger.error('Max MongoDB connection retries exceeded.');
          throw new Error('Could not establish initial MongoDB connection');
        }

        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
    return null;
  };

  connectionPromise = connectWithRetry().finally(() => {
    connectionPromise = null;
  });

  return connectionPromise;
}

/**
 * Graceful teardown hook for server shutdown.
 */
export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    logger.info('Closing MongoDB connection...');
    await mongoose.disconnect();
    logger.info('MongoDB disconnected cleanly.');
  }
}

/**
 * Non-blocking connection readiness inspector.
 */
export function getMongoConnectionState(): MongoConnectionState {
  const readyState = mongoose.connection.readyState;
  return {
    isConnected: readyState === 1,
    readyState,
    host: readyState === 1 ? mongoose.connection.host : undefined,
    name: readyState === 1 ? mongoose.connection.name : undefined,
  };
}

/**
 * Active ping to verify real database connectivity.
 */
export async function pingMongo(): Promise<boolean> {
  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      return false;
    }
    const result = await mongoose.connection.db.admin().ping();
    return result?.ok === 1;
  } catch (err: unknown) {
    logger.warn(
      { err: err instanceof Error ? err.message : 'Ping error' },
      'MongoDB ping check failed.'
    );
    return false;
  }
}

// Lifecycle Event Listeners (Safe logging without credential leakage)
mongoose.connection.on('connected', () => {
  logger.info('Mongoose event: connected to database cluster.');
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose event: disconnected from database cluster.');
});

mongoose.connection.on('error', (err) => {
  logger.error(
    { err: err instanceof Error ? err.message : 'Mongoose connection error' },
    'Mongoose error occurred.'
  );
});
