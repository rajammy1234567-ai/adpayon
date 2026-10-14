import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { healthRouter } from './routes/health.routes';
import { authRouter } from './routes/auth.routes';
import { notFoundHandler } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): Application {
  const app = express();

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false,
    })
  );

  // Configurable Cross-Origin Resource Sharing
  const allowedOrigins =
    env.CORS_ORIGIN === '*'
      ? '*'
      : env.CORS_ORIGIN.split(',').map((origin) => origin.trim());

  app.use(
    cors({
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Idempotency-Key'],
      credentials: true,
      maxAge: 86400, // 24 hours
    })
  );

  // Safe JSON Body Parsing with strict size limit
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Structured HTTP Request Logging (excluding sensitive headers & test noise)
  if (env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        autoLogging: {
          ignore: (req) => req.url === '/api/health',
        },
        serializers: {
          req(req) {
            return {
              id: req.id,
              method: req.method,
              url: req.url,
            };
          },
          res(res) {
            return {
              statusCode: res.statusCode,
            };
          },
        },
      })
    );
  }

  // API Routes
  app.use('/api', healthRouter);
  app.use('/api', authRouter);

  // 404 Fallback
  app.use(notFoundHandler);

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}

export const app = createApp();
