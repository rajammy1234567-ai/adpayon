import { Router, Request, Response } from 'express';
import { pingMongo, getMongoConnectionState } from '../db/mongoose';
import { logger } from '../config/logger';

export const healthRouter = Router();

/**
 * Basic application health check (Liveness probe).
 * Reports API process health without requiring an active database.
 * Expected HTTP 200 Response: { status: "ok", service: "adpayon-api" }
 */
healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'adpayon-api',
    version: '1.0.0',
    commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null,
    branch: process.env.RENDER_GIT_BRANCH || null,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

/**
 * Database connectivity health check (Readiness probe).
 * Real ping to verify MongoDB connectivity.
 * Returns HTTP 200 when connected, HTTP 503 when disconnected.
 * Never leaks credentials, cluster URLs, or internal errors.
 */
healthRouter.get('/health/db', async (_req: Request, res: Response) => {
  try {
    const isAlive = await pingMongo();

    if (isAlive) {
      const state = getMongoConnectionState();
      res.status(200).json({
        status: 'ok',
        service: 'adpayon-api',
        database: 'connected',
        cluster: state.name || 'configured',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Ping failed or disconnected
    res.status(503).json({
      status: 'degraded',
      service: 'adpayon-api',
      database: 'disconnected',
      message: 'MongoDB service is currently unreachable',
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.warn(
      { err: error instanceof Error ? error.message : 'Unknown error' },
      'Database health check failed'
    );

    res.status(503).json({
      status: 'degraded',
      service: 'adpayon-api',
      database: 'disconnected',
      message: 'Database service is currently unreachable',
      timestamp: new Date().toISOString(),
    });
  }
});
