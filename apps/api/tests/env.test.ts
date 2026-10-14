import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

describe('Environment Variable Validation Tests', () => {
  const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z
      .string()
      .default('5000')
      .transform((val) => parseInt(val, 10))
      .refine((val) => val > 0 && val < 65536, 'PORT must be between 1 and 65535'),
    HOST: z.string().default('127.0.0.1'),
    CORS_ORIGIN: z.string().default('*'),
    DATABASE_URL: z.string().min(10),
  });

  it('1. Passes validation with valid environment variables', () => {
    const validEnv = {
      NODE_ENV: 'test',
      PORT: '5000',
      HOST: '127.0.0.1',
      CORS_ORIGIN: '*',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
    };

    const result = envSchema.safeParse(validEnv);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.PORT, 5000);
      assert.equal(result.data.NODE_ENV, 'test');
    }
  });

  it('2. Fails validation on invalid PORT range', () => {
    const invalidEnv = {
      PORT: '99999', // Out of port range
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    };

    const result = envSchema.safeParse(invalidEnv);
    assert.equal(result.success, false);
  });

  it('3. Fails validation on invalid NODE_ENV', () => {
    const invalidEnv = {
      NODE_ENV: 'staging-unknown',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    };

    const result = envSchema.safeParse(invalidEnv);
    assert.equal(result.success, false);
  });
});
