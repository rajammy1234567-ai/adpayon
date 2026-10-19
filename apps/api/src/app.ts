import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { healthRouter } from './routes/health.routes';
import { authRouter } from './routes/auth.routes';
import { referralRouter } from './routes/referral.routes';
import { adminAuthRouter } from './routes/adminAuth.routes';
import { adminTaskRouter } from './routes/adminTask.routes';
import { userTaskRouter } from './routes/userTask.routes';
import { webhookTaskRouter } from './routes/webhookTask.routes';
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
      ? true
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

  // Safe JSON Body Parsing with strict size limit & rawBody preservation for webhooks
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
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
  app.use('/api/referrals', referralRouter);
  app.use('/api', adminAuthRouter);
  app.use('/api', adminTaskRouter);
  app.use('/api', userTaskRouter);
  app.use('/api', webhookTaskRouter);

  // 404 Fallback
  app.use(notFoundHandler);

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}

export const app = createApp();
