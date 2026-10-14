import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './db/prisma';

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info(
    {
      port: env.PORT,
      host: env.HOST,
      environment: env.NODE_ENV,
    },
    `ADPAYON API backend server listening on http://${env.HOST}:${env.PORT}`
  );
});

// Graceful Shutdown
async function gracefulShutdown(signal: string) {
  logger.info({ signal }, `Received ${signal}. Initiating graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed.');
    try {
      await prisma.$disconnect();
      logger.info('Prisma database connection disconnected cleanly.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during database disconnect.');
      process.exit(1);
    }
  });

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
