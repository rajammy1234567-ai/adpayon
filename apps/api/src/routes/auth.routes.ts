import { Router } from 'express';
import {
  register,
  sendOtp,
  verifyOtp,
  login,
  refresh,
  logout,
  getProfile,
  getDevOtpEndpoint,
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { authRateLimiter, otpRateLimiter } from '../middleware/rateLimiters';

export const authRouter = Router();

// Public Authentication Flow
authRouter.post('/auth/register', authRateLimiter, register);
authRouter.post('/auth/otp/send', otpRateLimiter, sendOtp);
authRouter.post('/auth/otp/verify', otpRateLimiter, verifyOtp);
authRouter.post('/auth/login', authRateLimiter, login);
authRouter.post('/auth/refresh', refresh);
authRouter.post('/auth/logout', logout);

// Protected User Profile
authRouter.get('/auth/me', requireAuth, getProfile);

// Development Loopback OTP Inspection (only active in development)
authRouter.get('/dev/otp/:mobile', getDevOtpEndpoint);
