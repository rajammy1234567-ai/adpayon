import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Resolves the backend package root directory reliably regardless of whether
 * the application is running from src, dist, or an arbitrary working directory.
 */
function resolveBackendRoot(startDir: string): string {
  let current = startDir;
  while (current !== path.dirname(current)) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === '@adpayon/api') {
          return current;
        }
      } catch {
        // Continue walking up
      }
    }
    current = path.dirname(current);
  }
  return path.resolve(__dirname, '../../../');
}

// Load local environment variables from backend project root (.env)
const backendRoot = resolveBackendRoot(__dirname);
const backendEnvPath = path.join(backendRoot, '.env');

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
} else {
  // Fallback to default search if explicit backend .env does not exist
  dotenv.config();
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z
      .string()
      .default('5000')
      .transform((val) => parseInt(val, 10))
      .refine((val) => val > 0 && val < 65536, 'PORT must be between 1 and 65535'),
    HOST: z.string().default('127.0.0.1'),
    CORS_ORIGIN: z.string().default('*'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    MONGODB_URI: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val || val.trim() === '') return true;
          return val.startsWith('mongodb://') || val.startsWith('mongodb+srv://');
        },
        { message: 'MONGODB_URI must start with mongodb:// or mongodb+srv://' }
      ),
    MONGODB_DB_NAME: z.string().default('adpayon_dev'),
    JWT_ACCESS_SECRET: z.string().min(16).default('adpayon_dev_jwt_access_secret_do_not_use_in_prod'),
    JWT_REFRESH_SECRET: z.string().min(16).default('adpayon_dev_jwt_refresh_secret_do_not_use_in_prod'),
    OTP_HMAC_SECRET: z.string().min(16).default('adpayon_dev_otp_hmac_secret_do_not_use_in_prod'),
    DEV_OTP_ENABLED: z
      .string()
      .default('true')
      .transform((val) => val === 'true' || val === '1'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (!data.MONGODB_URI || data.MONGODB_URI.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MONGODB_URI'],
          message: 'MONGODB_URI is strictly required in production environment',
        });
      }
      if (data.DEV_OTP_ENABLED) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DEV_OTP_ENABLED'],
          message: 'DEV_OTP_ENABLED must never be true in production',
        });
      }
      if (data.JWT_ACCESS_SECRET === 'adpayon_dev_jwt_access_secret_do_not_use_in_prod') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'JWT_ACCESS_SECRET must be explicitly configured in production',
        });
      }
      if (data.JWT_REFRESH_SECRET === 'adpayon_dev_jwt_refresh_secret_do_not_use_in_prod') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'JWT_REFRESH_SECRET must be explicitly configured in production',
        });
      }
      if (data.OTP_HMAC_SECRET === 'adpayon_dev_otp_hmac_secret_do_not_use_in_prod') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OTP_HMAC_SECRET'],
          message: 'OTP_HMAC_SECRET must be explicitly configured in production',
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.format());
  throw new Error('Environment configuration validation failed');
}

export const env = parsed.data;
