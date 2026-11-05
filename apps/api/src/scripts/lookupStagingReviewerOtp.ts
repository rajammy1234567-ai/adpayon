import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Ensure .env.client_staging is loaded
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

import { env } from '../config/env';
import { connectMongo, disconnectMongo, pingMongo } from '../db/mongoose';
import { decryptOtpForStaging, EncryptedOtpEnvelope } from '../services/sms/stagingManualOtpProvider';
import { computeOtpHash } from '../services/otpService';

/**
 * ADPAYON — Staging Reviewer OTP Lookup Tool (Operator-Only)
 *
 * STRICT SECURITY INVARIANTS:
 * 1. Only runs on the operator's authorized local machine.
 * 2. Strictly verifies connection to 'adpayon_client_staging'. Refuses all other databases.
 * 3. Requires STAGING_OPERATOR_SECRET or valid OTP_HMAC_SECRET in .env.client_staging.
 * 4. Never exposes or logs OTPs to cloud log sinks or public endpoints.
 */
export async function lookupStagingReviewerOtp(targetMobile: string): Promise<string | null> {
  if (env.APP_ENV !== 'client_staging' && env.APP_ENV !== 'staging') {
    throw new Error(`SECURITY VIOLATION: APP_ENV must strictly be 'client_staging'. Found: '${env.APP_ENV}'`);
  }
  if (env.MONGODB_DB_NAME !== 'adpayon_client_staging') {
    throw new Error(`SECURITY VIOLATION: MONGODB_DB_NAME must strictly be 'adpayon_client_staging'. Found: '${env.MONGODB_DB_NAME}'`);
  }

  await connectMongo();
  const isAlive = await pingMongo();
  if (!isAlive) {
    throw new Error('Database ping failed. Cannot reach MongoDB Atlas.');
  }

  const activeDb = mongoose.connection.db;
  if (!activeDb || activeDb.databaseName !== 'adpayon_client_staging') {
    await disconnectMongo();
    throw new Error(`CRITICAL: Connected to unexpected database '${activeDb?.databaseName}'. Expected 'adpayon_client_staging'.`);
  }

  try {
    const normalizedTarget = targetMobile.trim();

    // 1. First check the encrypted staging vault (staging_manual_otps)
    const vaultDoc = await activeDb.collection('staging_manual_otps').findOne({
      mobile: normalizedTarget,
      consumed: false,
      expiresAt: { $gt: new Date() },
    });

    if (vaultDoc && env.STAGING_OPERATOR_SECRET) {
      const envelope: EncryptedOtpEnvelope = {
        ciphertext: vaultDoc.ciphertext,
        iv: vaultDoc.iv,
        tag: vaultDoc.tag,
      };
      const decryptedOtp = decryptOtpForStaging(envelope, env.STAGING_OPERATOR_SECRET);
      const remainingSeconds = Math.max(0, Math.floor((vaultDoc.expiresAt.getTime() - Date.now()) / 1000));

      console.log('\n===============================================================');
      console.log('   ADPAYON — STAGING REVIEWER OTP RETRIEVAL (OPERATOR-ONLY)    ');
      console.log('===============================================================');
      console.log(`Database:          adpayon_client_staging`);
      console.log(`Reviewer Mobile:   ${normalizedTarget}`);
      console.log(`Purpose:           ${vaultDoc.purpose || 'REGISTRATION'}`);
      console.log(`Active Staging OTP:[ ${decryptedOtp} ]`);
      console.log(`Remaining TTL:     ${remainingSeconds} seconds`);
      console.log('===============================================================\n');
      console.log('Share this verification code directly with your client reviewer.');
      console.log('The code expires automatically and is strictly single-use.\n');

      return decryptedOtp;
    }

    // 2. Fallback: Search the active OTPChallenge record in otp_challenges via HMAC derivation
    const challengeDoc = await activeDb.collection('otp_challenges').findOne({
      mobile: normalizedTarget,
      consumed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!challengeDoc) {
      console.log(`\n[LOOKUP RESULT] No active or unexpired OTP challenge found for ${normalizedTarget}.`);
      console.log('Ensure the reviewer requested an OTP within the last 5 minutes.\n');
      return null;
    }

    const purpose = challengeDoc.purpose || 'REGISTRATION';
    const targetHash = challengeDoc.otpHash;

    console.log(`Found active challenge in otp_challenges. Resolving HMAC-SHA256 digest...`);
    let resolvedOtp: string | null = null;

    for (let candidate = 100000; candidate <= 999999; candidate++) {
      const candidateStr = candidate.toString();
      if (computeOtpHash(normalizedTarget, candidateStr, purpose) === targetHash) {
        resolvedOtp = candidateStr;
        break;
      }
    }

    if (resolvedOtp) {
      const remainingSeconds = Math.max(0, Math.floor((challengeDoc.expiresAt.getTime() - Date.now()) / 1000));
      console.log('\n===============================================================');
      console.log('   ADPAYON — STAGING REVIEWER OTP RETRIEVAL (OPERATOR-ONLY)    ');
      console.log('===============================================================');
      console.log(`Database:          adpayon_client_staging`);
      console.log(`Reviewer Mobile:   ${normalizedTarget}`);
      console.log(`Purpose:           ${purpose}`);
      console.log(`Active Staging OTP:[ ${resolvedOtp} ]`);
      console.log(`Remaining TTL:     ${remainingSeconds} seconds`);
      console.log('===============================================================\n');
      console.log('Share this verification code directly with your client reviewer.\n');
      return resolvedOtp;
    }

    console.log(`\n[LOOKUP FAILED] Unable to resolve OTP for challenge.\n`);
    return null;
  } finally {
    await disconnectMongo();
  }
}

// CLI Execution
if (require.main === module) {
  const args = process.argv.slice(2);
  let mobileArg = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mobile' && args[i + 1]) {
      mobileArg = args[i + 1];
      break;
    }
  }

  if (!mobileArg) {
    console.error('\nUsage: npm run otp:staging-lookup -- --mobile <+91XXXXXXXXXX>\n');
    process.exit(1);
  }

  lookupStagingReviewerOtp(mobileArg)
    .then((otp) => process.exit(otp ? 0 : 1))
    .catch((err) => {
      console.error('\n[FATAL LOOKUP ERROR]', err.message);
      process.exit(1);
    });
}
