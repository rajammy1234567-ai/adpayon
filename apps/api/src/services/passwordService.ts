import argon2 from 'argon2';

/**
 * Argon2id password hashing parameters conforming to RFC 9106 recommended profile.
 * - type: argon2.argon2id (hybrid resistant to side-channel and GPU attacks)
 * - memoryCost: 65536 KiB (64 MiB)
 * - timeCost: 3 iterations
 * - parallelism: 4 threads
 * - raw: false (returns modular crypt formatted string)
 */
const ARGON2_OPTIONS: argon2.HashOptions & { raw: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  raw: false,
};

/**
 * Computes secure Argon2id hash for a password.
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  if (!plainPassword || plainPassword.length < 6) {
    throw new Error('Password must be at least 6 characters in length');
  }
  return argon2.hash(plainPassword, ARGON2_OPTIONS);
}

/**
 * Verifies a candidate plaintext password against an Argon2id hash.
 * Returns true if valid, false if invalid or on error.
 */
export async function verifyPassword(
  storedHash: string,
  candidatePassword: string
): Promise<boolean> {
  try {
    if (!storedHash || !candidatePassword) {
      return false;
    }
    return await argon2.verify(storedHash, candidatePassword);
  } catch {
    return false;
  }
}
