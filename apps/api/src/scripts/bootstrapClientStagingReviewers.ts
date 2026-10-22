import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import mongoose, { Types } from 'mongoose';

// 1. Explicitly resolve and load .env.client_staging if present before env validation
const possibleStagingEnvPaths = [
  path.resolve(process.cwd(), '.env.client_staging'),
  path.resolve(process.cwd(), 'apps/api/.env.client_staging'),
  path.resolve(__dirname, '../../.env.client_staging'),
  path.resolve(__dirname, '../../../.env.client_staging'),
  path.resolve(__dirname, '../../../../.env.client_staging'),
];

for (const envPath of possibleStagingEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    process.env.ENV_FILE = envPath;
    break;
  }
}

import { User, IUser } from '../models';
import { hashPassword } from '../services/passwordService';
import { connectMongo, disconnectMongo, pingMongo } from '../db/mongoose';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Generates an 8-character unique alphanumeric referral code (e.g., ADP48927).
 */
function generateReferralCode(): string {
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ADP${randomSuffix}`;
}

export const DEMO_REVIEWER_EMAIL = 'client.demo@adpayon.test';
export const ROOT_SPONSOR_REFERRAL_CODE = 'ADP1000';
export const ROOT_SPONSOR_EMAIL = 'system.root@adpayon.test';

export interface ReviewerAccountConfig {
  loginId: string;
  name: string;
  password: string;
  wasPasswordGenerated: boolean;
}

export interface HardenedBootstrapConfig {
  rootSponsor: ReviewerAccountConfig & { referralCode: string };
  clientReviewer: ReviewerAccountConfig;
}

export interface BootstrapResult {
  rootSponsor: { id: string; referralCode: string; loginId: string; action: 'CREATED' | 'EXISTS' };
  clientReviewer: { id: string; loginId: string; action: 'CREATED' | 'EXISTS' };
  handoffFilePath?: string;
}

/**
 * Validates password complexity: minimum 10 characters, mixed case, numbers, special characters.
 */
export function validateReviewerPasswordComplexity(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 10) {
    return { valid: false, error: 'Password must be at least 10 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must include at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must include at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must include at least one numerical digit' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, error: 'Password must include at least one special character' };
  }
  return { valid: true };
}

/**
 * Generates an RFC-compliant CSPRNG random password with high entropy (24 chars base64url).
 */
export function generateSecureStagingPassword(): string {
  const raw = crypto.randomBytes(18).toString('base64url');
  return `${raw}!Aa1`;
}

/**
 * Reads and strictly validates reviewer configuration from environment.
 * Generates high-entropy passwords when not explicitly provided.
 * Uses dedicated demo reviewer identifier: client.demo@adpayon.test
 */
export function resolveAndValidateBootstrapConfig(): HardenedBootstrapConfig {
  let rootWasGenerated = false;
  let clientWasGenerated = false;

  let rootPassword = process.env.STAGING_ROOT_SPONSOR_PASSWORD?.trim();
  if (!rootPassword) {
    rootPassword = generateSecureStagingPassword();
    rootWasGenerated = true;
  }

  let clientPassword = process.env.STAGING_CLIENT_REVIEWER_PASSWORD?.trim();
  if (!clientPassword) {
    clientPassword = generateSecureStagingPassword();
    clientWasGenerated = true;
  }

  // Validate password complexity
  const rootVal = validateReviewerPasswordComplexity(rootPassword);
  if (!rootVal.valid) throw new Error(`STAGING_ROOT_SPONSOR_PASSWORD complexity error: ${rootVal.error}`);

  const clientVal = validateReviewerPasswordComplexity(clientPassword);
  if (!clientVal.valid) throw new Error(`STAGING_CLIENT_REVIEWER_PASSWORD complexity error: ${clientVal.error}`);

  if (rootPassword === clientPassword) {
    throw new Error('SECURITY VIOLATION: Reviewer account and root sponsor must each have unique, distinct passwords.');
  }

  return {
    rootSponsor: {
      loginId: ROOT_SPONSOR_EMAIL,
      referralCode: ROOT_SPONSOR_REFERRAL_CODE,
      name: process.env.STAGING_ROOT_SPONSOR_NAME?.trim() || 'ADPAYON System Root Sponsor',
      password: rootPassword,
      wasPasswordGenerated: rootWasGenerated,
    },
    clientReviewer: {
      loginId: DEMO_REVIEWER_EMAIL,
      name: process.env.STAGING_CLIENT_REVIEWER_NAME?.trim() || 'Client Reviewer (Staging)',
      password: clientPassword,
      wasPasswordGenerated: clientWasGenerated,
    },
  };
}

/**
 * Writes an ephemeral credentials handoff file containing generated reviewer credentials.
 */
export function writeSecureCredentialsHandoffFile(config: HardenedBootstrapConfig): string {
  const handoffPath = path.resolve(process.cwd(), 'staging-credentials-handoff.txt');
  const now = new Date().toISOString();

  const fileContent = `===============================================================
ADPAYON CLIENT-STAGING REVIEWER CREDENTIALS HANDOFF
Generated At: ${now}
Target Database: adpayon_client_staging
Target Backend: https://adpayon-client-api.onrender.com/api
===============================================================

1. CLIENT REVIEWER ACCOUNT (DEMO LOGIN):
   Login ID: ${config.clientReviewer.loginId}
   Password: ${config.clientReviewer.password}
   Role:     USER
   Status:   ACTIVE
   KYC:      NOT_SUBMITTED
   Instructions: Log in using the "Demo Login" tab on mobile APK

2. SYSTEM ROOT SPONSOR:
   Referral: ${config.rootSponsor.referralCode}
   Login ID: ${config.rootSponsor.loginId}
   Password: ${config.rootSponsor.password}

===============================================================
SECURITY INSTRUCTIONS:
1. Deliver credentials out-of-band to authorized client reviewer.
2. DELETE THIS FILE IMMEDIATELY after delivery.
3. NEVER commit or share this file in Git or cloud builds.
===============================================================
`;

  fs.writeFileSync(handoffPath, fileContent, { mode: 0o600 });
  return handoffPath;
}

/**
 * Read-only index inspection for safety verification.
 * Fails closed without dropping or modifying any MongoDB indexes.
 */
export async function verifyUserIndexCompatibility(userCollection: mongoose.mongo.Collection): Promise<void> {
  let existingIndexes: any[] = [];
  try {
    existingIndexes = await userCollection.indexes();
  } catch (err: any) {
    if (err.code === 26 || err.codeName === 'NamespaceNotFound') {
      return; // Collection does not exist yet; safe to proceed
    }
    throw err;
  }

  // 1. Mobile index check: If present and unique, MUST be sparse
  const mobileIndex = existingIndexes.find((idx) => idx.key && idx.key.mobile === 1);
  if (mobileIndex && mobileIndex.unique && !mobileIndex.sparse) {
    throw new Error(
      "INDEX INCOMPATIBILITY: Existing 'mobile_1' index on 'users' collection is unique but NOT sparse. " +
        "Inserting reviewer accounts without mobile numbers requires a sparse index to avoid collision. " +
        "Refusing execution without dropping or modifying indexes."
    );
  }

  // 2. Email index check: If present, must be unique
  const emailIndex = existingIndexes.find((idx) => idx.key && idx.key.email === 1);
  if (emailIndex && !emailIndex.unique) {
    throw new Error(
      "INDEX INCOMPATIBILITY: Existing 'email_1' index on 'users' collection is not unique. " +
        "Refusing execution without modifying indexes."
    );
  }
}

/**
 * Hardened, environment-guarded CLI bootstrap for Client Staging reviewer account.
 * Strictly forbidden from running against dev, sandbox, test, or production databases.
 */
export async function bootstrapClientStagingReviewers(): Promise<BootstrapResult | null> {
  console.log('\n===============================================================');
  console.log('   ADPAYON CLIENT-STAGING HARDENED REVIEWER BOOTSTRAP         ');
  console.log('===============================================================\n');

  // 1. Strict Environment Safety Guard
  if (env.APP_ENV !== 'client_staging') {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: APP_ENV must strictly equal 'client_staging'. Received: '${env.APP_ENV}'. Refusing execution.`
    );
  }

  if (env.MONGODB_DB_NAME !== 'adpayon_client_staging') {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: Target database must strictly equal 'adpayon_client_staging'. Received: '${env.MONGODB_DB_NAME}'. Refusing execution.`
    );
  }

  // 2. Validate configuration before database connection
  const config = resolveAndValidateBootstrapConfig();

  // 3. Explicit Confirmation Guard
  const args = process.argv.slice(2);
  const isConfirmed = args.includes('--confirm-staging-bootstrap');

  if (!isConfirmed) {
    console.log('[DRY-RUN MODE] Configuration validated successfully.');
    console.log('Target Database: adpayon_client_staging');
    console.log(`Root Sponsor:    ${config.rootSponsor.referralCode} (${config.rootSponsor.loginId})`);
    console.log(`Client Reviewer: ${config.clientReviewer.loginId}`);
    console.log('Role:            USER');
    console.log('Status:          ACTIVE');
    console.log('KYC:             NOT_SUBMITTED');
    console.log('Classification:  CLIENT_STAGING_TEST');
    console.log('\n--confirm-staging-bootstrap flag was not passed.');
    console.log('No database modifications will be executed.');
    console.log('To execute persistent bootstrap, run with explicit confirmation flag:\n');
    console.log('   npm run bootstrap:client-staging -- --confirm-staging-bootstrap\n');
    return null;
  }

  // 4. Connect and Verify Connected Database Identity
  await connectMongo();
  const isAlive = await pingMongo();
  if (!isAlive) {
    throw new Error('Database ping failed. Cannot connect to MongoDB Atlas cluster.');
  }

  const activeDbName = mongoose.connection.db?.databaseName;
  if (activeDbName !== 'adpayon_client_staging') {
    await disconnectMongo();
    throw new Error(
      `CRITICAL SECURITY VIOLATION: Connected to unexpected database '${activeDbName}'. Expected strictly 'adpayon_client_staging'. Terminating.`
    );
  }

  console.log(`[SECURITY GUARD PASSED] Connected to verified database: ${activeDbName}\n`);

  try {
    // 5. Read-only verification of existing MongoDB indexes (fails closed on conflict without modifying indexes)
    await verifyUserIndexCompatibility(User.collection);

    // 6. Ensure Root Sponsor (ADP1000) exists
    let rootSponsorDoc = await User.findOne({ referralCode: ROOT_SPONSOR_REFERRAL_CODE });
    let rootAction: 'CREATED' | 'EXISTS' = 'EXISTS';

    if (rootSponsorDoc) {
      if (rootSponsorDoc.role !== 'USER') {
        throw new Error(
          `ROOT SPONSOR CORRUPTION: referralCode '${ROOT_SPONSOR_REFERRAL_CODE}' has unexpected role '${rootSponsorDoc.role}'. Expected 'USER'.`
        );
      }
      console.log(`[IDEMPOTENT VERIFICATION PASSED] Root Sponsor (${ROOT_SPONSOR_REFERRAL_CODE}) verified intact.`);
    } else {
      console.log(`[BOOTSTRAP] Seeding Root Platform Sponsor (${ROOT_SPONSOR_REFERRAL_CODE})...`);
      const passwordHash = await hashPassword(config.rootSponsor.password);

      rootSponsorDoc = await User.create({
        email: ROOT_SPONSOR_EMAIL,
        name: config.rootSponsor.name,
        passwordHash,
        role: 'USER', // Strictly non-admin
        status: 'ACTIVE',
        referralCode: ROOT_SPONSOR_REFERRAL_CODE,
        sponsorId: null,
        ancestors: [],
        directReferralsCount: 0,
        metadata: {
          language: 'en',
          kycStatus: 'NOT_SUBMITTED',
          accountType: 'SYSTEM_ROOT',
        },
      });
      rootAction = 'CREATED';
      console.log(`[BOOTSTRAP SUCCESS] Root Sponsor created with ID: ${rootSponsorDoc._id}`);
    }

    // 6. Ensure Client Reviewer (client.demo@adpayon.test) exists
    let clientReviewerDoc = await User.findOne({ email: DEMO_REVIEWER_EMAIL });
    let clientAction: 'CREATED' | 'EXISTS' = 'EXISTS';

    if (clientReviewerDoc) {
      if (clientReviewerDoc.role !== 'USER') {
        throw new Error(
          `SECURITY VIOLATION: Existing account for reviewer (${DEMO_REVIEWER_EMAIL}) ` +
            `has unexpected role '${clientReviewerDoc.role}'. Expected strictly 'USER'. Refusing execution.`
        );
      }
      if (clientReviewerDoc.status !== 'ACTIVE') {
        throw new Error(
          `ACCOUNT STATUS CONFLICT: Existing account for reviewer (${DEMO_REVIEWER_EMAIL}) ` +
            `is in state '${clientReviewerDoc.status}'. Expected strictly 'ACTIVE'. Refusing execution.`
        );
      }
      if (!clientReviewerDoc.sponsorId || !clientReviewerDoc.sponsorId.equals(rootSponsorDoc._id)) {
        throw new Error(
          `SPONSOR MISMATCH: Existing client reviewer account is not sponsored by root sponsor ADP1000 (${rootSponsorDoc._id}). ` +
            `Refusing execution to prevent hierarchy corruption.`
        );
      }
      if ((clientReviewerDoc.metadata as any)?.accountType !== 'CLIENT_STAGING_TEST') {
        throw new Error(
          `CLASSIFICATION CONFLICT: Existing account for reviewer (${DEMO_REVIEWER_EMAIL}) ` +
            `lacks 'CLIENT_STAGING_TEST' classification. Refusing execution on unverified/unrelated account.`
        );
      }
      console.log(`[IDEMPOTENT VERIFICATION PASSED] Client Reviewer (${DEMO_REVIEWER_EMAIL}) verified valid and intact.`);
    } else {
      console.log(`[BOOTSTRAP] Seeding Client Reviewer (${DEMO_REVIEWER_EMAIL})...`);
      const passwordHash = await hashPassword(config.clientReviewer.password);

      let referralCode = generateReferralCode();
      while (await User.findOne({ referralCode })) {
        referralCode = generateReferralCode();
      }

      clientReviewerDoc = await User.create({
        email: DEMO_REVIEWER_EMAIL,
        name: config.clientReviewer.name,
        passwordHash,
        role: 'USER', // Strictly non-admin
        status: 'ACTIVE',
        referralCode,
        sponsorId: rootSponsorDoc._id,
        ancestors: [rootSponsorDoc._id],
        directReferralsCount: 0,
        metadata: {
          language: 'en',
          kycStatus: 'NOT_SUBMITTED', // Least-privileged KYC status
          accountType: 'CLIENT_STAGING_TEST',
        },
      });
      clientAction = 'CREATED';
      console.log(`[BOOTSTRAP SUCCESS] Client Reviewer created with ID: ${clientReviewerDoc._id}`);
    }

    // 7. Reconcile directReferralsCount to guarantee exact consistency across retries / partial runs
    const actualActiveDirects = await User.countDocuments({
      sponsorId: rootSponsorDoc._id,
      status: 'ACTIVE',
    });
    await User.findByIdAndUpdate(rootSponsorDoc._id, { directReferralsCount: actualActiveDirects });

    // 8. Secure Credentials Delivery / Handoff Mechanism
    let handoffFilePath: string | undefined;
    const anyPasswordWasGenerated =
      config.rootSponsor.wasPasswordGenerated ||
      config.clientReviewer.wasPasswordGenerated;

    if (anyPasswordWasGenerated) {
      handoffFilePath = writeSecureCredentialsHandoffFile(config);
      console.log(`\n[CREDENTIALS HANDOFF GENERATED] Secure handoff file created: ${handoffFilePath} (Mode 0600)`);
    }

    const revealStdoutFlag = args.includes('--reveal-credentials-stdout');
    if (revealStdoutFlag && process.stdout.isTTY) {
      console.log('\n[AUTHORIZED OPERATOR CREDENTIALS REVEAL]');
      console.log(`Client Reviewer Login:    ${config.clientReviewer.loginId}`);
      console.log(`Client Reviewer Password: ${config.clientReviewer.password}`);
      console.log(`Root Sponsor Referral:    ${config.rootSponsor.referralCode}`);
    } else {
      console.log('\n[SECURITY NOTICE] Plaintext passwords were NOT printed to console logs.');
      if (handoffFilePath) {
        console.log(`Retrieve generated passwords securely from: ${handoffFilePath}`);
      } else {
        console.log('Passwords were set from pre-configured environment variables.');
      }
    }

    console.log('\n===============================================================');
    console.log('   CLIENT-STAGING REVIEWER BOOTSTRAP COMPLETE                 ');
    console.log('===============================================================\n');

    return {
      rootSponsor: {
        id: rootSponsorDoc._id.toString(),
        referralCode: rootSponsorDoc.referralCode,
        loginId: ROOT_SPONSOR_EMAIL,
        action: rootAction,
      },
      clientReviewer: {
        id: clientReviewerDoc._id.toString(),
        loginId: DEMO_REVIEWER_EMAIL,
        action: clientAction,
      },
      handoffFilePath,
    };
  } finally {
    await disconnectMongo();
  }
}

// Direct CLI Invocation (Fails closed without confirmation)
if (require.main === module) {
  bootstrapClientStagingReviewers()
    .then((result) => {
      if (result) {
        console.log('[AUDIT SUMMARY]');
        console.log(`Database: adpayon_client_staging`);
        console.log(`Root Sponsor:    ${result.rootSponsor.referralCode} [${result.rootSponsor.action}]`);
        console.log(`Client Reviewer: ${result.clientReviewer.loginId} [${result.clientReviewer.action}]`);
        if (result.handoffFilePath) {
          console.log(`Handoff File:    ${result.handoffFilePath}`);
        }
        console.log('===============================================================\n');
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n[FATAL BOOTSTRAP ERROR]', err.message);
      process.exit(1);
    });
}
