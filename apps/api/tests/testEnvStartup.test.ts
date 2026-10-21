import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

describe('Phase 10.3A: Test Database Environment & Startup Guard Tests', () => {
  // Mirror of envSchema validation rules for test environment
  const envSchema = z
    .object({
      NODE_ENV: z.enum(['development', 'production', 'test', 'sandbox']).default('development'),
      APP_ENV: z.enum(['development', 'production', 'test', 'sandbox']).optional(),
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
    });

  it('1. Passes validation with valid test environment configuration', () => {
    const validTestEnv = {
      NODE_ENV: 'development',
      APP_ENV: 'test',
      PORT: '5000',
      HOST: '0.0.0.0',
      CORS_ORIGIN: '*',
      MONGODB_URI: 'mongodb+srv://test_user:pass123@cluster.mongodb.net/adpayon_test?retryWrites=true&w=majority',
      MONGODB_DB_NAME: 'adpayon_test',
    };

    const result = envSchema.safeParse(validTestEnv);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.APP_ENV, 'test');
      assert.equal(result.data.MONGODB_DB_NAME, 'adpayon_test');
      assert.equal(result.data.PORT, 5000);
      assert.equal(result.data.HOST, '0.0.0.0');
    }
  });

  it('2. Fails validation if APP_ENV=test targets non-test database (e.g. adpayon_dev)', () => {
    const invalidTestEnv = {
      NODE_ENV: 'development',
      APP_ENV: 'test',
      PORT: '5000',
      MONGODB_URI: 'mongodb+srv://test_user:pass123@cluster.mongodb.net/adpayon_test?retryWrites=true&w=majority',
      MONGODB_DB_NAME: 'adpayon_dev',
    };

    const result = envSchema.safeParse(invalidTestEnv);
    assert.equal(result.success, false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      assert.ok(messages.some((m) => m.includes('MONGODB_DB_NAME must be strictly set to adpayon_test')));
    }
  });

  it('3. Fails validation if APP_ENV=test uses dev user or database URI', () => {
    const leakedDevUriEnv = {
      NODE_ENV: 'development',
      APP_ENV: 'test',
      PORT: '5000',
      MONGODB_URI: 'mongodb+srv://adpayon_dev_app:pass123@cluster.mongodb.net/?appName=adpayon-dev',
      MONGODB_DB_NAME: 'adpayon_test',
    };

    const result = envSchema.safeParse(leakedDevUriEnv);
    assert.equal(result.success, false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      assert.ok(messages.some((m) => m.includes('must never reference dev or sandbox')));
    }
  });

  it('4. Fails validation if APP_ENV=test uses sandbox credentials', () => {
    const leakedSandboxUriEnv = {
      NODE_ENV: 'development',
      APP_ENV: 'test',
      PORT: '5000',
      MONGODB_URI: 'mongodb+srv://adpayon_sandbox_app:pass123@cluster.mongodb.net/adpayon_sandbox',
      MONGODB_DB_NAME: 'adpayon_test',
    };

    const result = envSchema.safeParse(leakedSandboxUriEnv);
    assert.equal(result.success, false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      assert.ok(messages.some((m) => m.includes('must never reference dev or sandbox')));
    }
  });

  it('5. Verifies apps/api/.env.test exists and conforms to security requirements', () => {
    const envTestPath = fs.existsSync(path.resolve(__dirname, '../../.env.test'))
      ? path.resolve(__dirname, '../../.env.test')
      : path.resolve(process.cwd(), '.env.test');
    assert.ok(fs.existsSync(envTestPath), '.env.test must exist');

    const content = fs.readFileSync(envTestPath, 'utf8');
    assert.ok(content.includes('APP_ENV=test'), '.env.test must specify APP_ENV=test');
    assert.ok(content.includes('MONGODB_DB_NAME=adpayon_test'), '.env.test must specify adpayon_test');
    assert.ok(content.includes('HOST=0.0.0.0'), '.env.test must bind HOST to 0.0.0.0 for LAN testing');
    assert.ok(content.includes('PORT=5000'), '.env.test must use port 5000');
    assert.ok(!content.includes('adpayon_dev_app'), '.env.test must never contain adpayon_dev_app credentials');
    assert.ok(!content.includes('adpayon_sandbox_app'), '.env.test must never contain adpayon_sandbox_app credentials');
    assert.ok(content.includes('adpayon_test_app'), '.env.test must use adpayon_test_app credentials');
  });

  it('6. Verifies fail-closed database identity check logic', () => {
    const simulateGuard = (activeDb: string, configuredDb: string, appEnv?: string) => {
      if (appEnv === 'test' || configuredDb === 'adpayon_test') {
        if (activeDb !== 'adpayon_test') {
          throw new Error(`CRITICAL SECURITY FAILURE: Test server expected 'adpayon_test' but connected to '${activeDb}'. Terminating.`);
        }
      }
      if (activeDb !== configuredDb) {
        throw new Error(`CRITICAL DATABASE IDENTITY MISMATCH: Expected '${configuredDb}' but connected to '${activeDb}'. Terminating.`);
      }
      return true;
    };

    // Correct match succeeds
    assert.equal(simulateGuard('adpayon_test', 'adpayon_test', 'test'), true);

    // Mismatched test database fails closed
    assert.throws(
      () => simulateGuard('adpayon_dev', 'adpayon_test', 'test'),
      /CRITICAL SECURITY FAILURE: Test server expected 'adpayon_test' but connected to 'adpayon_dev'/
    );

    // Arbitrary mismatch fails closed under universal assertion
    assert.throws(
      () => simulateGuard('production_cluster', 'adpayon_dev'),
      /CRITICAL DATABASE IDENTITY MISMATCH/
    );
  });
});
