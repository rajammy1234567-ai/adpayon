import { ErrorRequestHandler } from 'express';
import { env } from '../config/env';
import { logger } from '../config/logger';

// Centralized error handler
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const statusCode = err.status || err.statusCode || 500;
  const isServerFault = statusCode >= 500;

  // Log internal server errors
  if (isServerFault) {
    logger.error(
      {
        err: {
          name: err.name,
          message: err.message,
          stack: env.NODE_ENV !== 'production' ? err.stack : undefined,
        },
        path: req.originalUrl,
        method: req.method,
      },
      'Unhandled internal application error'
    );
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || (isServerFault ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST'),
      message: isServerFault && env.NODE_ENV === 'production'
        ? 'An unexpected internal error occurred. Please contact support.'
        : err.message || 'Internal Server Error',
      ...(env.NODE_ENV !== 'production' && isServerFault ? { stack: err.stack } : {}),
    },
  });
};
