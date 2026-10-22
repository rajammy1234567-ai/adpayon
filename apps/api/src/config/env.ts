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

// Determine target environment file based on ENV_FILE or NODE_ENV/APP_ENV
const backendRoot = resolveBackendRoot(__dirname);
const targetEnvFileName =
  process.env.ENV_FILE ||
  (process.env.NODE_ENV === 'sandbox' || process.env.APP_ENV === 'sandbox'
    ? '.env.sandbox'
    : (process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'test'
      ? '.env.test'
      : (process.env.NODE_ENV === 'client_staging' || process.env.APP_ENV === 'client_staging' || process.env.APP_ENV === 'staging'
        ? '.env.client_staging'
        : '.env')));
const backendEnvPath = path.isAbsolute(targetEnvFileName)
  ? targetEnvFileName
  : path.join(backendRoot, targetEnvFileName);

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath, override: true });
} else {
  // Fallback to default search if explicit backend .env does not exist
  dotenv.config();
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test', 'sandbox']).default('development'),
    APP_ENV: z.enum(['development', 'production', 'test', 'sandbox', 'client_staging', 'staging']).optional(),
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
    SMS_PROVIDER: z.enum(['dev', 'msg91', 'mock', 'staging_manual']).default('dev'),
    MSG91_AUTH_KEY: z.string().optional(),
    MSG91_DLT_TE_ID: z.string().optional(),
    MSG91_SENDER_ID: z.string().optional(),
    MSG91_FLOW_ID: z.string().optional(),
    STAGING_REVIEWER_MOBILES: z.string().optional(),
    STAGING_OPERATOR_SECRET: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.SMS_PROVIDER === 'staging_manual') {
      if (data.APP_ENV !== 'client_staging' && data.APP_ENV !== 'staging') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMS_PROVIDER'],
          message: 'SMS_PROVIDER=staging_manual is strictly permitted only in client_staging environment',
        });
      }
      if (!data.STAGING_OPERATOR_SECRET || data.STAGING_OPERATOR_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STAGING_OPERATOR_SECRET'],
          message: 'STAGING_OPERATOR_SECRET (>=32 chars) is required when SMS_PROVIDER is staging_manual',
        });
      }
    }
    if (data.SMS_PROVIDER === 'msg91') {
      if (!data.MSG91_AUTH_KEY || data.MSG91_AUTH_KEY.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MSG91_AUTH_KEY'],
          message: 'MSG91_AUTH_KEY is strictly required when SMS_PROVIDER is msg91',
        });
      }
      if (!data.MSG91_FLOW_ID && !data.MSG91_DLT_TE_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MSG91_FLOW_ID'],
          message: 'Either MSG91_FLOW_ID or MSG91_DLT_TE_ID is required when SMS_PROVIDER is msg91',
        });
      }
    }
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

    if (data.NODE_ENV === 'sandbox') {
      if (data.PORT !== 5001) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PORT'],
          message: 'PORT must be strictly set to 5001 in sandbox environment',
        });
      }
      if (data.MONGODB_DB_NAME !== 'adpayon_sandbox') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MONGODB_DB_NAME'],
          message: 'MONGODB_DB_NAME must be strictly set to adpayon_sandbox in sandbox environment',
        });
      }
      if (!data.MONGODB_URI || data.MONGODB_URI.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MONGODB_URI'],
          message: 'MONGODB_URI is strictly required in sandbox environment',
        });
      } else {
        if (
          data.MONGODB_URI.includes('adpayon_dev') ||
          data.MONGODB_URI.includes('adpayon_test') ||
          data.MONGODB_URI.includes('adpayon_dev_app') ||
          data.MONGODB_URI.includes('adpayon_test_app')
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['MONGODB_URI'],
            message: 'MONGODB_URI in sandbox must never reference dev or test databases or credentials',
          });
        }
      }
      if (data.CORS_ORIGIN === '*') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGIN'],
          message: 'Wildcard CORS (*) is strictly prohibited in sandbox environment',
        });
      }
      if (
        data.JWT_ACCESS_SECRET === 'adpayon_dev_jwt_access_secret_do_not_use_in_prod' ||
        data.JWT_ACCESS_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'JWT_ACCESS_SECRET must be an isolated, high-entropy secret (>=32 chars) in sandbox',
        });
      }
      if (
        data.JWT_REFRESH_SECRET === 'adpayon_dev_jwt_refresh_secret_do_not_use_in_prod' ||
        data.JWT_REFRESH_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'JWT_REFRESH_SECRET must be an isolated, high-entropy secret (>=32 chars) in sandbox',
        });
      }
      if (
        data.OTP_HMAC_SECRET === 'adpayon_dev_otp_hmac_secret_do_not_use_in_prod' ||
        data.OTP_HMAC_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OTP_HMAC_SECRET'],
          message: 'OTP_HMAC_SECRET must be an isolated, high-entropy secret (>=32 chars) in sandbox',
        });
      }
    }

    if (data.APP_ENV === 'test') {
      if (data.MONGODB_DB_NAME !== 'adpayon_test') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MONGODB_DB_NAME'],
          message: 'MONGODB_DB_NAME must be strictly set to adpayon_test when APP_ENV is test',
        });
      }
      if (!data.MONGODB_URI || data.MONGODB_URI.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MONGODB_URI'],
          message: 'MONGODB_URI is strictly required when APP_ENV is test',
        });
      } else {
        if (
          data.MONGODB_URI.includes('adpayon_dev') ||
          data.MONGODB_URI.includes('adpayon_sandbox') ||
          data.MONGODB_URI.includes('adpayon_dev_app') ||
          data.MONGODB_URI.includes('adpayon_sandbox_app')
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['MONGODB_URI'],
            message: 'MONGODB_URI in test mode must never reference dev or sandbox databases or credentials',
          });
        }
      }
    }

    if (data.APP_ENV === 'client_staging' || data.APP_ENV === 'staging') {
      if (data.MONGODB_DB_NAME !== 'adpayon_client_staging') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MONGODB_DB_NAME'],
          message: 'MONGODB_DB_NAME must be strictly set to adpayon_client_staging in client_staging environment',
        });
      }
      if (!data.MONGODB_URI || data.MONGODB_URI.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MONGODB_URI'],
          message: 'MONGODB_URI is strictly required in client_staging environment',
        });
      } else {
        if (
          data.MONGODB_URI.includes('adpayon_dev') ||
          data.MONGODB_URI.includes('adpayon_sandbox') ||
          data.MONGODB_URI.includes('adpayon_test') ||
          data.MONGODB_URI.includes('adpayon_dev_app') ||
          data.MONGODB_URI.includes('adpayon_sandbox_app') ||
          data.MONGODB_URI.includes('adpayon_test_app')
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['MONGODB_URI'],
            message: 'MONGODB_URI in client_staging must never reference dev, test, or sandbox databases or credentials',
          });
        }
      }
      if (
        data.JWT_ACCESS_SECRET === 'adpayon_dev_jwt_access_secret_do_not_use_in_prod' ||
        data.JWT_ACCESS_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'JWT_ACCESS_SECRET must be an isolated, high-entropy secret (>=32 chars) in client_staging',
        });
      }
      if (
        data.JWT_REFRESH_SECRET === 'adpayon_dev_jwt_refresh_secret_do_not_use_in_prod' ||
        data.JWT_REFRESH_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'JWT_REFRESH_SECRET must be an isolated, high-entropy secret (>=32 chars) in client_staging',
        });
      }
      if (
        data.OTP_HMAC_SECRET === 'adpayon_dev_otp_hmac_secret_do_not_use_in_prod' ||
        data.OTP_HMAC_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OTP_HMAC_SECRET'],
          message: 'OTP_HMAC_SECRET must be an isolated, high-entropy secret (>=32 chars) in client_staging',
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
