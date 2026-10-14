import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/services/passwordService';

describe('Password Security Tests (Argon2id)', () => {
  it('1. Computes valid Argon2id hash for secure passwords', async () => {
    const rawPass = 'SecretP@ssw0rd!2026';
    const hash = await hashPassword(rawPass);

    assert.ok(hash);
    assert.ok(hash.startsWith('$argon2id$'));
  });

  it('2. Successfully verifies matching candidate password', async () => {
    const rawPass = 'MySecurePass123';
    const hash = await hashPassword(rawPass);

    const isMatch = await verifyPassword(hash, rawPass);
    assert.equal(isMatch, true);
  });

  it('3. Rejects incorrect candidate password', async () => {
    const rawPass = 'CorrectPassword123';
    const hash = await hashPassword(rawPass);

    const isMatch = await verifyPassword(hash, 'WrongPassword456');
    assert.equal(isMatch, false);
  });

  it('4. Rejects passwords under minimum length of 6 characters', async () => {
    await assert.rejects(async () => {
      await hashPassword('12345');
    }, /Password must be at least 6 characters/);
  });

  it('5. Safe error handling on malformed hash', async () => {
    const isMatch = await verifyPassword('not-a-valid-argon2-hash', 'test');
    assert.equal(isMatch, false);
  });
});
