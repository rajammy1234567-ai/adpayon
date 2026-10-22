import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateReviewerPasswordComplexity,
  generateSecureStagingPassword,
  resolveAndValidateBootstrapConfig,
  writeSecureCredentialsHandoffFile,
  verifyUserIndexCompatibility,
  DEMO_REVIEWER_EMAIL,
  ROOT_SPONSOR_REFERRAL_CODE,
} from '../src/scripts/bootstrapClientStagingReviewers';

describe('ADPAYON — Phase 11H: Client Staging Demo Reviewer Bootstrap Suite', () => {
  it('1. Rejects weak passwords failing complexity requirements', () => {
    // Too short (< 10)
    assert.equal(validateReviewerPasswordComplexity('Aa1!').valid, false);
    // Missing uppercase
    assert.equal(validateReviewerPasswordComplexity('abcdef123!@#').valid, false);
    // Missing lowercase
    assert.equal(validateReviewerPasswordComplexity('ABCDEF123!@#').valid, false);
    // Missing digits
    assert.equal(validateReviewerPasswordComplexity('Abcdefghijk!@#').valid, false);
    // Missing special character
    assert.equal(validateReviewerPasswordComplexity('Abcdefghijk123').valid, false);
    // Compliant password
    assert.equal(validateReviewerPasswordComplexity('SecureClientStagingPass1!').valid, true);
  });

  it('2. generateSecureStagingPassword() produces compliant, high-entropy unique passwords', () => {
    const p1 = generateSecureStagingPassword();
    const p2 = generateSecureStagingPassword();

    assert.notEqual(p1, p2, 'Generated passwords must be unique');
    assert.ok(p1.length >= 24, 'Password must have high entropy (>=24 chars)');
    assert.equal(validateReviewerPasswordComplexity(p1).valid, true, 'Generated password must pass complexity validation');
    assert.equal(validateReviewerPasswordComplexity(p2).valid, true, 'Generated password must pass complexity validation');
  });

  it('3. resolveAndValidateBootstrapConfig() binds to dedicated demo reviewer without fake phone numbers', () => {
    const originalEnv = { ...process.env };
    try {
      delete process.env.STAGING_CLIENT_REVIEWER_PASSWORD;
      delete process.env.STAGING_ROOT_SPONSOR_PASSWORD;

      const config = resolveAndValidateBootstrapConfig();
      assert.equal(config.clientReviewer.loginId, DEMO_REVIEWER_EMAIL);
      assert.equal(config.clientReviewer.wasPasswordGenerated, true);
      assert.equal(config.rootSponsor.referralCode, ROOT_SPONSOR_REFERRAL_CODE);
      assert.equal(config.rootSponsor.wasPasswordGenerated, true);
      assert.notEqual(config.clientReviewer.password, config.rootSponsor.password);
    } finally {
      process.env = originalEnv;
    }
  });

  it('4. resolveAndValidateBootstrapConfig() accepts and validates compliant custom passwords', () => {
    const originalEnv = { ...process.env };
    try {
      process.env.STAGING_CLIENT_REVIEWER_PASSWORD = 'ClientCustomSecurePass1!';
      process.env.STAGING_ROOT_SPONSOR_PASSWORD = 'RootCustomSecurePass1!';

      const config = resolveAndValidateBootstrapConfig();
      assert.equal(config.clientReviewer.password, 'ClientCustomSecurePass1!');
      assert.equal(config.clientReviewer.wasPasswordGenerated, false);
      assert.equal(config.rootSponsor.password, 'RootCustomSecurePass1!');
      assert.equal(config.rootSponsor.wasPasswordGenerated, false);
    } finally {
      process.env = originalEnv;
    }
  });

  it('5. resolveAndValidateBootstrapConfig() strictly rejects identical passwords between reviewer and root sponsor', () => {
    const originalEnv = { ...process.env };
    try {
      process.env.STAGING_CLIENT_REVIEWER_PASSWORD = 'SamePassword123!@#';
      process.env.STAGING_ROOT_SPONSOR_PASSWORD = 'SamePassword123!@#';

      assert.throws(
        () => resolveAndValidateBootstrapConfig(),
        /SECURITY VIOLATION: Reviewer account and root sponsor must each have unique, distinct passwords/
      );
    } finally {
      process.env = originalEnv;
    }
  });

  it('6. resolveAndValidateBootstrapConfig() strictly rejects non-compliant custom passwords', () => {
    const originalEnv = { ...process.env };
    try {
      process.env.STAGING_CLIENT_REVIEWER_PASSWORD = 'weak';
      process.env.STAGING_ROOT_SPONSOR_PASSWORD = 'RootCustomSecurePass1!';

      assert.throws(
        () => resolveAndValidateBootstrapConfig(),
        /STAGING_CLIENT_REVIEWER_PASSWORD complexity error/
      );
    } finally {
      process.env = originalEnv;
    }
  });

  it('7. writeSecureCredentialsHandoffFile() creates secure handoff file for demo reviewer', () => {
    const mockConfig = {
      rootSponsor: {
        loginId: 'system.root@adpayon.test',
        name: 'Root Sponsor',
        referralCode: 'ADP1000',
        password: 'RootPass123!@#',
        wasPasswordGenerated: true,
      },
      clientReviewer: {
        loginId: 'client.demo@adpayon.test',
        name: 'Client Reviewer',
        password: 'ClientPass123!@#',
        wasPasswordGenerated: true,
      },
    };

    const filePath = writeSecureCredentialsHandoffFile(mockConfig);
    try {
      assert.ok(fs.existsSync(filePath), 'Handoff file must be created');
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(content.includes('client.demo@adpayon.test'));
      assert.ok(content.includes('ClientPass123!@#'));
      assert.ok(content.includes('ADP1000'));
      assert.ok(content.includes('Demo Login'));
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  it('8. verifyUserIndexCompatibility() performs read-only inspection and fails closed on incompatible indexes', async () => {
    // A. Rejects non-sparse unique mobile index
    const mockIncompatibleCollection: any = {
      indexes: async () => [
        { v: 2, key: { _id: 1 }, name: '_id_' },
        { v: 2, key: { mobile: 1 }, name: 'mobile_1', unique: true, sparse: false },
      ],
    };
    await assert.rejects(
      async () => verifyUserIndexCompatibility(mockIncompatibleCollection),
      /INDEX INCOMPATIBILITY: Existing 'mobile_1' index on 'users' collection is unique but NOT sparse/
    );

    // B. Rejects non-unique email index
    const mockIncompatibleEmailCollection: any = {
      indexes: async () => [
        { v: 2, key: { _id: 1 }, name: '_id_' },
        { v: 2, key: { mobile: 1 }, name: 'mobile_1', unique: true, sparse: true },
        { v: 2, key: { email: 1 }, name: 'email_1', unique: false },
      ],
    };
    await assert.rejects(
      async () => verifyUserIndexCompatibility(mockIncompatibleEmailCollection),
      /INDEX INCOMPATIBILITY: Existing 'email_1' index on 'users' collection is not unique/
    );

    // C. Passes when collection does not exist yet (NamespaceNotFound / Code 26)
    const mockNamespaceNotFoundCollection: any = {
      indexes: async () => {
        const err: any = new Error('ns not found');
        err.code = 26;
        throw err;
      },
    };
    await assert.doesNotReject(async () => verifyUserIndexCompatibility(mockNamespaceNotFoundCollection));

    // D. Passes when indexes are compatible (sparse and unique)
    const mockCompatibleCollection: any = {
      indexes: async () => [
        { v: 2, key: { _id: 1 }, name: '_id_' },
        { v: 2, key: { mobile: 1 }, name: 'mobile_1', unique: true, sparse: true },
        { v: 2, key: { email: 1 }, name: 'email_1', unique: true, sparse: true },
        { v: 2, key: { referralCode: 1 }, name: 'referralCode_1', unique: true },
      ],
    };
    await assert.doesNotReject(async () => verifyUserIndexCompatibility(mockCompatibleCollection));
  });
});
