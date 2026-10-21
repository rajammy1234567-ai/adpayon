import { Server } from 'node:http';
import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectMongo, disconnectMongo } from './db/mongoose';

let server: Server | null = null;

// Graceful Shutdown
async function gracefulShutdown(signal: string) {
  logger.info({ signal }, `Received ${signal}. Initiating graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        await disconnectMongo();
        logger.info('MongoDB disconnected cleanly.');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during database disconnect.');
        process.exit(1);
      }
    });
  } else {
    try {
      await disconnectMongo();
      process.exit(0);
    } catch {
      process.exit(1);
    }
  }

  // Force close if graceful shutdown exceeds 10 seconds
  setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing process exit.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Promise Rejection detected');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught Exception detected! Terminating process.');
  process.exit(1);
});

async function startServer(): Promise<void> {
  // Pre-flight: Initialize MongoDB connection & assert database identity BEFORE binding port
  if (env.MONGODB_URI) {
    try {
      await connectMongo();
    } catch (err) {
      logger.fatal({ err }, 'Fatal: MongoDB connection or identity verification failed. Halting server startup.');
      process.exit(1);
    }
  } else {
    logger.info('No MONGODB_URI configured. API running in disconnected database mode.');
  }

  server = app.listen(env.PORT, env.HOST, () => {
    logger.info(
      {
        port: env.PORT,
        host: env.HOST,
        environment: env.NODE_ENV,
        appEnv: env.APP_ENV,
        database: env.MONGODB_DB_NAME,
      },
      `ADPAYON API backend server listening on http://${env.HOST}:${env.PORT}`
    );
  });
}

startServer().catch((err) => {
  logger.fatal({ err }, 'Unexpected error during server startup');
  process.exit(1);
});

