import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';

export const healthRouter = Router();

/**
 * Basic application health check.
 * Expected HTTP 200 Response: { status: "ok", service: "adpayon-api" }
 */
healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'adpayon-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

/**
 * Database connectivity health check.
 * Performs a minimal test query (SELECT 1).
 * NOTE: For public production gateways, detailed health checks should be internal-only
 * or protected behind private admin/metrics networks to avoid infrastructure reconnaissance.
 */
healthRouter.get('/health/db', async (_req: Request, res: Response) => {
  try {
    // Run minimal ping query
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: 'ok',
      service: 'adpayon-api',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Log the actual error internally with structured logger
    logger.warn({ err: error }, 'Database health check failed');

    // Return non-sensitive status without leaking connection strings or stack traces
    res.status(503).json({
      status: 'degraded',
      service: 'adpayon-api',
      database: 'disconnected',
      message: 'Database service is currently unreachable',
      timestamp: new Date().toISOString(),
    });
  }
});
