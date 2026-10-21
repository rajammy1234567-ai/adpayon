process.env.NODE_ENV = 'test';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appInstallConversionPostbackSchema,
  validatePostbackTimestamp,
  validateConversionEventMatch,
  validatePackageNameMatch,
  validateAssignmentClickBinding,
  validateCampaignOwnership,
  validateAttributionMethod,
  validateAppInstallPostbackContext,
  AppInstallConversionPostbackPayload,
  AppInstallVerificationContext,
} from '@adpayon/shared';

describe('Phase 10.5B: App Acquisition Conversion Contract & Validation Tests', () => {
  const validPayload: AppInstallConversionPostbackPayload = {
    clickId: 'clk_a1b2c3d4e5f67890',
    externalTransactionId: 'tx_adp_20261021_001',
    event: 'FIRST_OPEN',
    packageName: 'com.bharatfin.app',
    timestamp: Date.now(),
    attributionProvider: 'ADVERTISER_DIRECT',
  };

  const validContext: AppInstallVerificationContext = {
    task: {
      id: 'task_inst_001',
      campaignId: 'camp_inst_001',
      category: 'APP_INSTALL',
      verificationMethod: 'AUTHENTICATED_WEBHOOK',
      rewardPoints: 25,
      totalCap: 100,
      completionsCount: 0,
      status: 'PUBLISHED',
      appInstallConfig: {
        appName: 'Bharat Finance App',
        packageName: 'com.bharatfin.app',
        platform: 'ANDROID',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.bharatfin.app',
        attributionMethod: 'SIGNED_POSTBACK',
        conversionEvent: 'FIRST_OPEN',
      },
    },
    assignment: {
      id: 'asgn_inst_001',
      taskId: 'task_inst_001',
      userId: 'user_tester_001',
      clickId: 'clk_a1b2c3d4e5f67890',
      status: 'IN_PROGRESS',
      assignedAt: new Date(Date.now() - 3600000),
      expiresAt: new Date(Date.now() + 86400000), // 24 hours in future
    },
    campaign: {
      id: 'camp_inst_001',
      status: 'ACTIVE',
      webhookSecret: 'secret_hex_256bit_value',
    },
  };

  // Test 1: Valid signed-postback-shaped conversion payload
  it('1. Successfully parses and validates a well-formed conversion payload', () => {
    const parseResult = appInstallConversionPostbackSchema.safeParse(validPayload);
    assert.equal(parseResult.success, true);

    const contextResult = validateAppInstallPostbackContext(validPayload, validContext);
    assert.equal(contextResult.valid, true);
  });

  // Test 2: Missing clickId
  it('2. Rejects payload with missing or invalid clickId', () => {
    const missingClickId = { ...validPayload, clickId: undefined };
    const parseResult = appInstallConversionPostbackSchema.safeParse(missingClickId);
    assert.equal(parseResult.success, false);

    const invalidPrefix = { ...validPayload, clickId: 'invalid_prefix_12345' };
    const parsePrefix = appInstallConversionPostbackSchema.safeParse(invalidPrefix);
    assert.equal(parsePrefix.success, false);
  });

  // Test 3: Unknown event
  it('3. Rejects payload with unknown or invalid conversion event', () => {
    const unknownEvent = { ...validPayload, event: 'CLICK_BUTTON' as any };
    const parseResult = appInstallConversionPostbackSchema.safeParse(unknownEvent);
    assert.equal(parseResult.success, false);
  });

  // Test 4: Invalid packageName
  it('4. Rejects payload with invalid Android package name syntax', () => {
    const invalidNames = ['invalid', '123.com', 'com..app', 'com.app space', '-com.app'];
    for (const name of invalidNames) {
      const result = appInstallConversionPostbackSchema.safeParse({ ...validPayload, packageName: name });
      assert.equal(result.success, false, `Expected rejection for package name: ${name}`);
    }

    const validNames = ['com.example.app', 'in.co.bank_mobile', 'org.fintech.test.qa'];
    for (const name of validNames) {
      const result = appInstallConversionPostbackSchema.safeParse({ ...validPayload, packageName: name });
      assert.equal(result.success, true, `Expected acceptance for package name: ${name}`);
    }
  });

  // Test 5: Event mismatch
  it('5. Detects conversion event mismatch against configured task expectation', () => {
    // Task expects FIRST_OPEN, incoming postback reports INSTALL
    const mismatchPayload = { ...validPayload, event: 'INSTALL' as const };
    const result = validateConversionEventMatch(
      validContext.task.appInstallConfig!.conversionEvent,
      mismatchPayload.event
    );
    assert.equal(result.valid, false);
    assert.match(result.error!, /Conversion event mismatch/i);

    const fullResult = validateAppInstallPostbackContext(mismatchPayload, validContext);
    assert.equal(fullResult.valid, false);
    assert.equal(fullResult.errorCode, 'CONVERSION_EVENT_MISMATCH');
  });

  // Test 6: Package mismatch
  it('6. Detects Android package name mismatch between postback and task configuration', () => {
    const mismatchPayload = { ...validPayload, packageName: 'com.wrongapp.android' };
    const result = validatePackageNameMatch(
      validContext.task.appInstallConfig!.packageName,
      mismatchPayload.packageName
    );
    assert.equal(result.valid, false);
    assert.match(result.error!, /Package name mismatch/i);

    const fullResult = validateAppInstallPostbackContext(mismatchPayload, validContext);
    assert.equal(fullResult.valid, false);
    assert.equal(fullResult.errorCode, 'PACKAGE_NAME_MISMATCH');
  });

  // Test 7: Missing externalTransactionId
  it('7. Rejects payload with missing or empty externalTransactionId (anti-replay)', () => {
    const missingTx = { ...validPayload, externalTransactionId: '' };
    const parseResult = appInstallConversionPostbackSchema.safeParse(missingTx);
    assert.equal(parseResult.success, false);

    const undefinedTx = { ...validPayload, externalTransactionId: undefined };
    const parseUndefined = appInstallConversionPostbackSchema.safeParse(undefinedTx);
    assert.equal(parseUndefined.success, false);
  });

  // Test 8: Invalid timestamp
  it('8. Rejects invalid timestamp format and excessive clock skew', () => {
    // Invalid type
    const invalidType = { ...validPayload, timestamp: 'not-a-date' };
    const parseResult = appInstallConversionPostbackSchema.safeParse(invalidType);
    assert.equal(parseResult.success, false);

    // Negative timestamp
    const negativeTime = { ...validPayload, timestamp: -500 };
    const parseNegative = appInstallConversionPostbackSchema.safeParse(negativeTime);
    assert.equal(parseNegative.success, false);

    // 15-minute clock skew (exceeds default 5-minute skew tolerance)
    const now = Date.now();
    const staleTime = now - 15 * 60 * 1000;
    const skewCheck = validatePostbackTimestamp(staleTime, 5 * 60 * 1000, now);
    assert.equal(skewCheck.valid, false);
    assert.match(skewCheck.error!, /timestamp skew/i);

    // Fresh timestamp within tolerance
    const freshTime = now - 60 * 1000; // 1 minute old
    const freshCheck = validatePostbackTimestamp(freshTime, 5 * 60 * 1000, now);
    assert.equal(freshCheck.valid, true);

    // ISO-8601 string support
    const isoString = new Date(now - 30 * 1000).toISOString();
    const isoCheck = validatePostbackTimestamp(isoString, 5 * 60 * 1000, now);
    assert.equal(isoCheck.valid, true);
  });

  // Test 9: Unexpected rewardPoints injection
  it('9. Strictly rejects payload containing client-controlled rewardPoints injection', () => {
    const injectedPayload = {
      ...validPayload,
      rewardPoints: 1000000, // Attacker trying to set their own reward
    };
    const parseResult = appInstallConversionPostbackSchema.safeParse(injectedPayload);
    assert.equal(parseResult.success, false);
    assert.match(parseResult.error!.issues[0].message, /unexpected or unauthorized fields/i);
  });

  // Test 10: Attempted identity override (userId / taskId injection)
  it('10. Strictly rejects payload containing arbitrary userId or taskId overrides', () => {
    const injectedUser = {
      ...validPayload,
      userId: '6ad1f5ab09b6cd576fd4d568', // Attacker trying to credit a different user
    };
    const userResult = appInstallConversionPostbackSchema.safeParse(injectedUser);
    assert.equal(userResult.success, false);

    const injectedTask = {
      ...validPayload,
      taskId: '6ad85daab780b43f45236674', // Attacker trying to complete a different task
    };
    const taskResult = appInstallConversionPostbackSchema.safeParse(injectedTask);
    assert.equal(taskResult.success, false);
  });

  // Test 11: Unsupported attribution method
  it('11. Fails closed when task attribution method or category is unsupported', () => {
    // MANUAL_REVIEW task cannot be verified via automated S2S postback
    const manualReviewConfig = {
      ...validContext.task.appInstallConfig!,
      attributionMethod: 'MANUAL_REVIEW' as const,
    };
    const methodCheck = validateAttributionMethod(
      'APP_INSTALL',
      'AUTHENTICATED_WEBHOOK',
      manualReviewConfig
    );
    assert.equal(methodCheck.valid, false);
    assert.match(methodCheck.error!, /Unsupported attribution method/i);

    // FIRST_PARTY_ACTION verification method is invalid for APP_INSTALL
    const firstPartyCheck = validateAttributionMethod(
      'APP_INSTALL',
      'FIRST_PARTY_ACTION',
      validContext.task.appInstallConfig
    );
    assert.equal(firstPartyCheck.valid, false);
    assert.match(firstPartyCheck.error!, /require AUTHENTICATED_WEBHOOK/i);
  });

  // Test 12: Legacy task compatibility
  it('12. Preserves legacy task compatibility and fails closed when category is not APP_INSTALL', () => {
    // Non-APP_INSTALL categories must fail closed when checked against APP_INSTALL contract
    const videoTaskCheck = validateAttributionMethod(
      'VIDEO_WATCH',
      'FIRST_PARTY_ACTION',
      undefined
    );
    assert.equal(videoTaskCheck.valid, false);
    assert.match(videoTaskCheck.error!, /is not an APP_INSTALL task/i);

    const articleTaskCheck = validateAttributionMethod(
      'ARTICLE_READ',
      'FIRST_PARTY_ACTION',
      undefined
    );
    assert.equal(articleTaskCheck.valid, false);
    assert.match(articleTaskCheck.error!, /is not an APP_INSTALL task/i);
  });
});
