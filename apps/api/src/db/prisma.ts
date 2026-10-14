import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../config/logger';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

// Log queries in debug mode without exposing raw sensitive data
if (env.NODE_ENV === 'development') {
  // @ts-expect-error Prisma event typing
  prisma.$on('error', (e: unknown) => {
    logger.error({ err: e }, 'Prisma database error');
  });
}
