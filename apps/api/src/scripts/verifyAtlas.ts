import mongoose, { Types } from 'mongoose';
import { connectMongo, disconnectMongo, pingMongo, getMongoConnectionState } from '../db/mongoose';
import { User, AuthSession, AdminAuditLog } from '../models';
import { logger } from '../config/logger';
import { env } from '../config/env';

interface VerificationSummary {
  connected: boolean;
  database: string;
  indexesVerified: boolean;
  indexes: {
    user: Record<string, unknown>;
    authSession: Record<string, unknown>;
    adminAuditLog: Record<string, unknown>;
  };
  syntheticCrudPassed: boolean;
  uniqueConstraintsPassed: boolean;
  transactionCommitPassed: boolean;
  transactionRollbackPassed: boolean;
  cleanupSuccessful: boolean;
}

const TEST_MOBILE_PREFIX = '+91999904';
const TEST_REF_PREFIX = 'ATLASREF';

export async function runAtlasVerification(): Promise<VerificationSummary> {
  const summary: VerificationSummary = {
    connected: false,
    database: env.MONGODB_DB_NAME,
    indexesVerified: false,
    indexes: {
      user: {},
      authSession: {},
      adminAuditLog: {},
    },
    syntheticCrudPassed: false,
    uniqueConstraintsPassed: false,
    transactionCommitPassed: false,
    transactionRollbackPassed: false,
    cleanupSuccessful: false,
  };

  const createdUserIds = new Set<string>();
  const createdSessionIds = new Set<string>();
  const createdAuditIds = new Set<string>();

  logger.info({ database: env.MONGODB_DB_NAME }, 'Starting MongoDB Atlas Integration Verification...');

  // 1. Connection & Ping
  await connectMongo();
  const isAlive = await pingMongo();
  if (!isAlive) {
    throw new Error('Database ping failed. MongoDB is not reachable.');
  }
  summary.connected = true;
  logger.info('STEP 1: Database connection and active ping verified.');

  // 2. Sync and Verify Indexes
  logger.info('STEP 2: Syncing and verifying database indexes on Atlas...');
  await User.syncIndexes();
  await AuthSession.syncIndexes();
  await AdminAuditLog.syncIndexes();

  const userIndexes = await User.collection.getIndexes();
  const authSessionIndexes = await AuthSession.collection.getIndexes();
  const adminAuditLogIndexes = await AdminAuditLog.collection.getIndexes();

  summary.indexes.user = userIndexes;
  summary.indexes.authSession = authSessionIndexes;
  summary.indexes.adminAuditLog = adminAuditLogIndexes;

  // Assert required indexes exist
  const hasUserMobileIndex = 'mobile_1' in userIndexes;
  const hasUserReferralIndex = 'referralCode_1' in userIndexes;
  const hasSessionTokenIndex = 'refreshTokenHash_1' in authSessionIndexes;
  const hasSessionTtlIndex = 'expiresAt_1' in authSessionIndexes;

  if (!hasUserMobileIndex || !hasUserReferralIndex || !hasSessionTokenIndex || !hasSessionTtlIndex) {
    throw new Error('Index verification failed: Required indexes missing on collections.');
  }
  summary.indexesVerified = true;
  logger.info('STEP 2: All required unique, reference, and TTL indexes verified on Atlas.');

  const testMobile1 = `${TEST_MOBILE_PREFIX}0001`;
  const testMobile2 = `${TEST_MOBILE_PREFIX}0002`;
  const commitMobile = `${TEST_MOBILE_PREFIX}0003`;
  const rollbackMobile = `${TEST_MOBILE_PREFIX}0004`;
  const exactSyntheticMobiles = [testMobile1, testMobile2, commitMobile, rollbackMobile];

  // Clean only exact synthetic mobiles from prior runs if any exist (never regex)
  const priorUsers = await User.find({ mobile: { $in: exactSyntheticMobiles } }).select('_id');
  const priorIds = priorUsers.map((u) => u._id);
  if (priorIds.length > 0) {
    await User.deleteMany({ _id: { $in: priorIds } });
    await AuthSession.deleteMany({ userId: { $in: priorIds } });
  }

  // 3. Synthetic User CRUD & Validation
  logger.info('STEP 3: Testing synthetic User CRUD operations...');
  const testRef1 = `${TEST_REF_PREFIX}01`;

  const testUser = await User.create({
    mobile: testMobile1,
    name: 'Atlas Test User',
    passwordHash: '$2b$12$syntheticpasswordhashforintegrationtesting123',
    role: 'USER',
    status: 'ACTIVE',
    referralCode: testRef1,
    metadata: { language: 'en', kycStatus: 'NOT_SUBMITTED' },
  });

  if (!testUser._id) {
    throw new Error('Failed to create synthetic user document.');
  }
  createdUserIds.add(testUser._id.toString());

  // Read back and update
  const fetchedUser = await User.findById(testUser._id);
  if (!fetchedUser || fetchedUser.mobile !== testMobile1) {
    throw new Error('Failed to read back synthetic user document.');
  }

  fetchedUser.metadata = { ...fetchedUser.metadata, language: 'hi' };
  await fetchedUser.save();

  const updatedUser = await User.findById(testUser._id);
  if (updatedUser?.metadata?.language !== 'hi') {
    throw new Error('Failed to update synthetic user profile.');
  }
  summary.syntheticCrudPassed = true;
  logger.info('STEP 3: Synthetic User creation, retrieval, and profile update verified.');

  // 4. Unique Constraints Verification
  logger.info('STEP 4: Testing unique index constraint enforcement...');
  let duplicateMobileCaught = false;
  try {
    await User.create({
      mobile: testMobile1, // Duplicate mobile
      name: 'Duplicate Mobile User',
      passwordHash: '$2b$12$anotherhash',
      referralCode: `${TEST_REF_PREFIX}02`,
    });
  } catch (err: any) {
    if (err.code === 11000) {
      duplicateMobileCaught = true;
    }
  }

  let duplicateRefCaught = false;
  try {
    await User.create({
      mobile: testMobile2,
      name: 'Duplicate Referral User',
      passwordHash: '$2b$12$anotherhash',
      referralCode: testRef1, // Duplicate referralCode
    });
  } catch (err: any) {
    if (err.code === 11000) {
      duplicateRefCaught = true;
    }
  }

  // Session token uniqueness
  const testHash1 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const testSession = await AuthSession.create({
    userId: testUser._id,
    refreshTokenHash: testHash1,
    familyId: 'test-family-1',
    expiresAt: new Date(Date.now() + 86400000),
  });
  createdSessionIds.add(testSession._id.toString());

  let duplicateSessionTokenCaught = false;
  try {
    await AuthSession.create({
      userId: testUser._id,
      refreshTokenHash: testHash1, // Duplicate token hash
      familyId: 'test-family-2',
      expiresAt: new Date(Date.now() + 86400000),
    });
  } catch (err: any) {
    if (err.code === 11000) {
      duplicateSessionTokenCaught = true;
    }
  }

  if (!duplicateMobileCaught || !duplicateRefCaught || !duplicateSessionTokenCaught) {
    throw new Error(
      `Unique constraint test failed: mobile=${duplicateMobileCaught}, referralCode=${duplicateRefCaught}, token=${duplicateSessionTokenCaught}`
    );
  }
  summary.uniqueConstraintsPassed = true;
  logger.info('STEP 4: Unique constraints for mobile, referral code, and session token verified.');

  // 5. AdminAuditLog Verification
  logger.info('STEP 5: Testing AdminAuditLog append-only record creation...');
  const testAudit = await AdminAuditLog.create({
    adminId: testUser._id,
    action: 'TEST_INTEGRATION_VERIFY',
    targetEntity: 'User',
    targetId: testUser._id.toString(),
    details: { testRun: true, timestamp: new Date().toISOString() },
    ipAddress: '127.0.0.1',
  });
  if (!testAudit._id) {
    throw new Error('Failed to create AdminAuditLog record.');
  }
  createdAuditIds.add(testAudit._id.toString());
  logger.info('STEP 5: AdminAuditLog document verified.');

  // 6. Multi-Document ACID Transactions
  logger.info('STEP 6: Testing MongoDB Multi-Document ACID Transactions...');

  // Test 6A: Successful Transaction Commit
  const commitRef = `${TEST_REF_PREFIX}03`;
  const commitTokenHash = 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0';

  const session1 = await mongoose.startSession();
  try {
    await session1.withTransaction(async () => {
      const u = await User.create(
        [
          {
            mobile: commitMobile,
            name: 'Committed Tx User',
            passwordHash: '$2b$12$txhash',
            referralCode: commitRef,
          },
        ],
        { session: session1 }
      );

      const s = await AuthSession.create(
        [
          {
            userId: u[0]._id,
            refreshTokenHash: commitTokenHash,
            familyId: 'test-family-committed',
            expiresAt: new Date(Date.now() + 86400000),
          },
        ],
        { session: session1 }
      );

      createdUserIds.add(u[0]._id.toString());
      createdSessionIds.add(s[0]._id.toString());
    });

    // Verify documents exist outside session
    const committedUser = await User.findOne({ mobile: commitMobile });
    const committedSession = await AuthSession.findOne({ refreshTokenHash: commitTokenHash });
    if (!committedUser || !committedSession) {
      throw new Error('Transaction commit test failed: Documents not found after commit.');
    }
    summary.transactionCommitPassed = true;
    logger.info('STEP 6A: Multi-document transaction commit verified successfully.');
  } finally {
    await session1.endSession();
  }

  // Test 6B: Transaction Abort & Rollback
  const rollbackRef = `${TEST_REF_PREFIX}04`;

  const session2 = await mongoose.startSession();
  try {
    await session2.withTransaction(async () => {
      await User.create(
        [
          {
            mobile: rollbackMobile,
            name: 'Rollback Tx User',
            passwordHash: '$2b$12$rollbackhash',
            referralCode: rollbackRef,
          },
        ],
        { session: session2 }
      );

      // Force intentional error to trigger transaction abort
      throw new Error('INTENTIONAL_ROLLBACK_TEST_ERROR');
    });
  } catch (err: any) {
    if (err.message !== 'INTENTIONAL_ROLLBACK_TEST_ERROR') {
      throw err;
    }
  } finally {
    await session2.endSession();
  }

  // Verify document was NOT committed to the database
  const rolledBackUser = await User.findOne({ mobile: rollbackMobile });
  if (rolledBackUser) {
    throw new Error('Transaction rollback test failed: Rolled back document still exists in database!');
  }
  summary.transactionRollbackPassed = true;
  logger.info('STEP 6B: Multi-document transaction rollback verified successfully.');

  // 7. Cleanup only test-owned records via tracked IDs (NEVER broad regexes)
  logger.info('STEP 7: Cleaning up disposable synthetic test data via exact IDs...');
  const userObjIds = Array.from(createdUserIds).map((id) => new Types.ObjectId(id));
  const sessionObjIds = Array.from(createdSessionIds).map((id) => new Types.ObjectId(id));
  const auditObjIds = Array.from(createdAuditIds).map((id) => new Types.ObjectId(id));

  let deletedUsers = 0;
  let deletedSessions = 0;
  let deletedAuditLogs = 0;

  if (userObjIds.length > 0) {
    const userDeleteResult = await User.deleteMany({
      _id: { $in: userObjIds },
      referralCode: { $ne: 'ADP1000' },
    });
    deletedUsers = userDeleteResult.deletedCount || 0;
  }

  if (sessionObjIds.length > 0) {
    const sessionDeleteResult = await AuthSession.deleteMany({
      _id: { $in: sessionObjIds },
    });
    deletedSessions = sessionDeleteResult.deletedCount || 0;
  }

  if (auditObjIds.length > 0) {
    const auditDeleteResult = await AdminAuditLog.deleteMany({
      _id: { $in: auditObjIds },
    });
    deletedAuditLogs = auditDeleteResult.deletedCount || 0;
  }

  logger.info(
    {
      deletedUsers,
      deletedSessions,
      deletedAuditLogs,
    },
    'Synthetic test records purged cleanly using exact ObjectIds.'
  );

  summary.cleanupSuccessful = true;

  return summary;
}

// Direct execution entrypoint
if (require.main === module) {
  runAtlasVerification()
    .then((results) => {
      // Safe output: Log verification summary without secret URI
      console.log('\n============================================================');
      console.log('ATLAS INTEGRATION VERIFICATION SUMMARY:');
      console.log('------------------------------------------------------------');
      console.log('Connected to Atlas:       ', results.connected);
      console.log('Target Database:          ', results.database);
      console.log('Indexes Verified:         ', results.indexesVerified);
      console.log('Synthetic CRUD Passed:    ', results.syntheticCrudPassed);
      console.log('Unique Constraints Passed:', results.uniqueConstraintsPassed);
      console.log('Transaction Commit Passed:', results.transactionCommitPassed);
      console.log('Transaction Rollback Pass:', results.transactionRollbackPassed);
      console.log('Cleanup Successful:       ', results.cleanupSuccessful);
      console.log('============================================================\n');
      return disconnectMongo().then(() => process.exit(0));
    })
    .catch((err) => {
      logger.error({ err: err.message }, 'Atlas Integration Verification Failed');
      disconnectMongo().finally(() => process.exit(1));
    });
}
