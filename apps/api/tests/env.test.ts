import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

describe('Environment Variable Validation Tests', () => {
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
    })
    .superRefine((data, ctx) => {
      if (data.NODE_ENV === 'production' && (!data.MONGODB_URI || data.MONGODB_URI.trim() === '')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MONGODB_URI'],
          message: 'MONGODB_URI is strictly required in production environment',
        });
      }
    });

  it('1. Passes validation with valid MongoDB URI in development', () => {
    const validEnv = {
      NODE_ENV: 'development',
      PORT: '5000',
      HOST: '127.0.0.1',
      CORS_ORIGIN: '*',
      MONGODB_URI: 'mongodb+srv://dev_user:secret_pass@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority',
      MONGODB_DB_NAME: 'adpayon_dev',
    };

    const result = envSchema.safeParse(validEnv);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.PORT, 5000);
      assert.equal(result.data.NODE_ENV, 'development');
      assert.equal(result.data.MONGODB_DB_NAME, 'adpayon_dev');
    }
  });

  it('2. Passes validation in development/test when MONGODB_URI is omitted (offline liveness)', () => {
    const offlineEnv = {
      NODE_ENV: 'test',
      PORT: '5000',
    };

    const result = envSchema.safeParse(offlineEnv);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.MONGODB_URI, undefined);
      assert.equal(result.data.MONGODB_DB_NAME, 'adpayon_dev');
    }
  });

  it('3. Fails validation in production if MONGODB_URI is missing', () => {
    const prodWithoutDb = {
      NODE_ENV: 'production',
      PORT: '5000',
    };

    const result = envSchema.safeParse(prodWithoutDb);
    assert.equal(result.success, false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      assert.ok(messages.some((m) => m.includes('MONGODB_URI is strictly required')));
    }
  });

  it('4. Fails validation if MONGODB_URI does not use mongodb:// or mongodb+srv:// protocol', () => {
    const invalidProtoEnv = {
      NODE_ENV: 'development',
      MONGODB_URI: 'postgresql://user:pass@localhost:5432/adpayon_dev',
    };

    const result = envSchema.safeParse(invalidProtoEnv);
    assert.equal(result.success, false);
  });

  it('5. Fails validation on invalid PORT range', () => {
    const invalidEnv = {
      PORT: '99999',
    };

    const result = envSchema.safeParse(invalidEnv);
    assert.equal(result.success, false);
  });

  it('6. Fails validation on invalid NODE_ENV', () => {
    const invalidEnv = {
      NODE_ENV: 'staging-unknown',
    };

    const result = envSchema.safeParse(invalidEnv);
    assert.equal(result.success, false);
  });
});
