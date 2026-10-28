import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// 1. Explicitly resolve and load .env.client_staging before config/env evaluates
const possibleStagingEnvPaths = [
  path.resolve(process.cwd(), '.env.client_staging'),
  path.resolve(process.cwd(), 'apps/api/.env.client_staging'),
  path.resolve(__dirname, '../../.env.client_staging'),
  path.resolve(__dirname, '../../../.env.client_staging'),
  path.resolve(__dirname, '../../../../.env.client_staging'),
];

let loadedEnvPath: string | null = null;
for (const envPath of possibleStagingEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    process.env.ENV_FILE = envPath;
    loadedEnvPath = envPath;
    break;
  }
}

if (!loadedEnvPath) {
  console.error('\n[FATAL] Unable to locate .env.client_staging file. Operation failed closed.');
  process.exit(1);
}

import { env } from '../config/env';
import { User, AdminAuditLog } from '../models';
import { hashPassword } from '../services/passwordService';
import { normalizeIndianMobile, generateReferralCode } from '../controllers/auth.controller';

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

/**
 * Prompts for sensitive input without echoing characters to terminal stdout,
 * preventing credentials from appearing in terminal history, logs, or screen captures.
 */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.setEncoding('utf8');

    let input = '';
    const onData = (ch: string) => {
      // Ctrl+C
      if (ch === '\u0003') {
        if (stdin.setRawMode) stdin.setRawMode(wasRaw || false);
        stdin.pause();
        process.stdout.write('\n');
        process.exit(1);
      }
      // Enter (CR or LF)
      if (ch === '\r' || ch === '\n') {
        process.stdout.write('\n');
        stdin.removeListener('data', onData);
        if (stdin.setRawMode) stdin.setRawMode(wasRaw || false);
        stdin.pause();
        resolve(input);
        return;
      }
      // Backspace (127 or 8)
      if (ch === '\u0008' || ch === '\x7f') {
        if (input.length > 0) {
          input = input.slice(0, -1);
        }
        return;
      }
      input += ch;
    };

    stdin.on('data', onData);
  });
}

/**
 * Validates administrative password strength:
 * Min 10 chars, uppercase, lowercase, digit, special character.
 */
function validateAdminPassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 10) {
    return { valid: false, error: 'Administrative password must be at least 10 characters long' };
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
 * Dedicated Staging Admin Account Provisioning.
 * Fails closed unless strictly targeting client_staging and adpayon_client_staging.
 * Preserves all existing accounts without promotion or overwrite.
 */
export async function bootstrapAdminCli(): Promise<void> {
  console.log('\n======================================================');
  console.log('    ADPAYON SECURE STAGING ADMIN PROVISIONING         ');
  console.log('======================================================\n');

  // Strict Pre-Connection Fail-Closed Guards
  const activeAppEnv = env.APP_ENV;
  const configuredDbName = env.MONGODB_DB_NAME;

  if (activeAppEnv !== 'client_staging' && activeAppEnv !== 'staging') {
    console.error(`\n[FATAL] Security Guard: APP_ENV must strictly be 'client_staging'. Found: '${activeAppEnv}'. Refusing execution.`);
    process.exit(1);
  }

  if (configuredDbName !== 'adpayon_client_staging') {
    console.error(`\n[FATAL] Security Guard: Target database must strictly be 'adpayon_client_staging'. Found: '${configuredDbName}'. Refusing execution.`);
    process.exit(1);
  }

  const mongoUri = env.MONGODB_URI;
  if (!mongoUri) {
    console.error('\n[FATAL] MONGODB_URI environment variable is missing.');
    process.exit(1);
  }

  // Connect to database with strict timeout
  console.log(`Connecting to cluster [Database: ${configuredDbName}]...`);
  await mongoose.connect(mongoUri, {
    dbName: configuredDbName,
    serverSelectionTimeoutMS: 5000,
  });

  // Strict Post-Connection Fail-Closed Guard
  const connectedDb = mongoose.connection.db;
  if (!connectedDb || connectedDb.databaseName !== 'adpayon_client_staging') {
    const connectedName = connectedDb?.databaseName || 'unknown';
    await mongoose.disconnect();
    console.error(`\n[FATAL] Security Guard: Connected database is '${connectedName}'. Expected 'adpayon_client_staging'. Refusing execution.`);
    process.exit(1);
  }

  console.log(`[VERIFIED] Environment: ${activeAppEnv} | Database: ${connectedDb.databaseName}\n`);

  try {
    const mobileInput = await prompt('Enter Admin Mobile Number (+91XXXXXXXXXX): ');
    if (!mobileInput) {
      console.error('\n[FATAL] Mobile number is required.');
      await mongoose.disconnect();
      process.exit(1);
    }

    let normalizedMobile: string;
    try {
      normalizedMobile = normalizeIndianMobile(mobileInput);
    } catch (err: any) {
      console.error(`\n[FATAL] Invalid mobile number: ${err.message}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    // Preserve existing accounts - fail closed if account exists
    const existingUser = await User.findOne({ mobile: normalizedMobile });
    if (existingUser) {
      console.error(
        `\n[ACCOUNT PRESERVED] User with mobile ${normalizedMobile} already exists.` +
        `\nRole: ${existingUser.role} | Status: ${existingUser.status}` +
        `\nAutomatic overwrite or promotion is prohibited. Please use a distinct administrative mobile number.`
      );
      await mongoose.disconnect();
      process.exit(1);
    }

    const name = await prompt('Enter Admin Full Name: ');
    if (!name) {
      console.error('\n[FATAL] Full name is required.');
      await mongoose.disconnect();
      process.exit(1);
    }

    // Hidden password input
    const password = await promptHidden('Enter Secure Admin Password (min 10 chars, mixed case, numbers, special): ');
    const passCheck = validateAdminPassword(password);
    if (!passCheck.valid) {
      console.error(`\n[FATAL] Password validation failed: ${passCheck.error}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    const confirmPassword = await promptHidden('Confirm Admin Password: ');
    if (password !== confirmPassword) {
      console.error('\n[FATAL] Passwords do not match.');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log('\nGenerating Argon2id password hash...');
    const passwordHash = await hashPassword(password);
    const referralCode = `ADM${generateReferralCode().slice(3)}`;

    const newAdmin = await User.create({
      mobile: normalizedMobile,
      name,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      referralCode,
      metadata: {
        kycStatus: 'VERIFIED',
        language: 'en',
      },
    });

    await AdminAuditLog.create({
      adminId: newAdmin._id,
      action: 'BOOTSTRAP_CREATED_ADMIN',
      targetEntity: 'User',
      targetId: newAdmin._id.toString(),
      details: { mobile: normalizedMobile, name, referralCode },
      ipAddress: '127.0.0.1 (CLI)',
    });

    console.log('\n======================================================');
    console.log('       ADMINISTRATOR BOOTSTRAP COMPLETED              ');
    console.log('======================================================');
    console.log(`Admin ID:       ${newAdmin._id}`);
    console.log(`Mobile:         ${normalizedMobile}`);
    console.log(`Name:           ${name}`);
    console.log(`Role:           ADMIN`);
    console.log(`Status:         ACTIVE`);
    console.log(`Referral Code:  ${referralCode}`);
    console.log('======================================================\n');
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  bootstrapAdminCli().catch((err) => {
    console.error('\n[FATAL EXCEPTION]', err.message);
    process.exit(1);
  });
}

