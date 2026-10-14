import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const isTest = env.NODE_ENV === 'test';

/**
 * Rate limiter for authentication attempts (registration, login).
 * Enforces max 15 requests per 15 minutes per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication attempts. Please try again after 15 minutes.',
    },
  },
});

/**
 * Strict rate limiter for OTP dispatching.
 * Enforces max 5 OTP requests per 10 minutes per IP.
 */
export const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: isTest ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'OTP_RATE_LIMIT_EXCEEDED',
      message: 'Too many verification code requests. Please wait before requesting another.',
    },
  },
});
