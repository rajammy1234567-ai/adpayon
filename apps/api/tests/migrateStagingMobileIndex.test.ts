import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectPreconditions,
  validateEnvironmentGuard,
  IndexDefinition,
} from '../src/scripts/migrateStagingMobileIndex';
import { env } from '../src/config/env';

describe('ADPAYON — Phase 11J: Staging Mobile Index Migration Safety Suite', () => {
  it('1. validateEnvironmentGuard() enforces APP_ENV and MONGODB_DB_NAME guards', () => {
    // In our test environment, env.APP_ENV is either test or client_staging depending on loader.
    // If APP_ENV !== 'client_staging', validateEnvironmentGuard() must fail closed.
    if (env.APP_ENV !== 'client_staging') {
      assert.throws(
        () => validateEnvironmentGuard(),
        /CRITICAL SECURITY VIOLATION: APP_ENV must strictly be 'client_staging'/
      );
    } else {
      assert.doesNotThrow(() => validateEnvironmentGuard());
    }
  });

  it('2. inspectPreconditions() correctly flags non-sparse mobile_1 index', async () => {
    const mockIncompatibleCollection: any = {
      dbName: 'adpayon_client_staging',
      indexes: async () => [
        { name: '_id_', key: { _id: 1 } },
        { name: 'mobile_1', key: { mobile: 1 }, unique: true, sparse: false },
      ],
      countDocuments: async () => 0,
    };

    const result = await inspectPreconditions(mockIncompatibleCollection);
    assert.equal(result.totalDocuments, 0);
    assert.equal(result.mobileIndexExists, true);
    assert.equal(result.isMobileIndexUnique, true);
    assert.equal(result.isMobileIndexSparse, false);
    assert.equal(result.emailIndexExists, false);
  });

  it('3. inspectPreconditions() correctly recognizes compliant sparse indexes (idempotent)', async () => {
    const mockCompliantCollection: any = {
      dbName: 'adpayon_client_staging',
      indexes: async () => [
        { name: '_id_', key: { _id: 1 } },
        { name: 'mobile_1', key: { mobile: 1 }, unique: true, sparse: true },
        { name: 'email_1', key: { email: 1 }, unique: true, sparse: true },
      ],
      countDocuments: async () => 0,
    };

    const result = await inspectPreconditions(mockCompliantCollection);
    assert.equal(result.mobileIndexExists, true);
    assert.equal(result.isMobileIndexUnique, true);
    assert.equal(result.isMobileIndexSparse, true);
    assert.equal(result.emailIndexExists, true);
    assert.equal(result.isEmailIndexUnique, true);
    assert.equal(result.isEmailIndexSparse, true);
  });

  it('4. Backup preserves all original index attributes without mutation', async () => {
    const originalIndexes: IndexDefinition[] = [
      { name: '_id_', key: { _id: 1 } },
      { name: 'mobile_1', key: { mobile: 1 }, unique: true, sparse: false },
      { name: 'referralCode_1', key: { referralCode: 1 }, unique: true, sparse: false },
    ];

    const mockCollection: any = {
      dbName: 'adpayon_client_staging',
      indexes: async () => originalIndexes,
      countDocuments: async () => 0,
    };

    const preconditions = await inspectPreconditions(mockCollection);
    const backup = JSON.parse(JSON.stringify(preconditions.existingIndexes));

    assert.equal(backup.length, 3);
    assert.equal(backup[1].name, 'mobile_1');
    assert.equal(backup[1].sparse, false);
    assert.equal(backup[1].unique, true);
  });
});
