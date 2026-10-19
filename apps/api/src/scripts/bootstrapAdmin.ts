import readline from 'node:readline';
import mongoose from 'mongoose';
import { User, AdminAuditLog } from '../models';
import { hashPassword } from '../services/passwordService';
import { normalizeIndianMobile, generateReferralCode } from '../controllers/auth.controller';
import { env } from '../config/env';
import { logger } from '../config/logger';

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
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
 * Explicitly invoked Administrative Account Bootstrap.
 * NEVER RUNS AUTOMATICALLY. Must be manually executed by a system administrator.
 */
export async function bootstrapAdminCli(): Promise<void> {
  console.log('\n======================================================');
  console.log('       ADPAYON SECURE ADMIN BOOTSTRAP CLI             ');
  console.log('======================================================\n');

  const args = process.argv.slice(2);
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
  };

  let mobile = getArg('--mobile') || process.env.ADMIN_BOOTSTRAP_MOBILE;
  let name = getArg('--name') || process.env.ADMIN_BOOTSTRAP_NAME;
  let password = getArg('--password') || process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const confirmPromote = args.includes('--confirm-promote') || process.env.ADMIN_CONFIRM_PROMOTE === 'true';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    if (!mobile) {
      mobile = await prompt(rl, 'Enter Admin Mobile Number (+919876543210): ');
    }
    if (!name) {
      name = await prompt(rl, 'Enter Admin Full Name: ');
    }
    if (!password) {
      password = await prompt(rl, 'Enter Secure Admin Password (min 10 chars, mixed case, numbers, special): ');
    }

    if (!mobile || !name || !password) {
      console.error('\n[FATAL] Mobile, Name, and Password are all strictly required.');
      process.exit(1);
    }

    let normalizedMobile: string;
    try {
      normalizedMobile = normalizeIndianMobile(mobile);
    } catch (err: any) {
      console.error(`\n[FATAL] Invalid mobile number: ${err.message}`);
      process.exit(1);
    }

    const passCheck = validateAdminPassword(password);
    if (!passCheck.valid) {
      console.error(`\n[FATAL] Password validation failed: ${passCheck.error}`);
      process.exit(1);
    }

    // Connect to database
    const mongoUri = env.MONGODB_URI;
    if (!mongoUri) {
      console.error('\n[FATAL] MONGODB_URI environment variable is not configured.');
      process.exit(1);
    }

    console.log(`Connecting to database cluster [DB: ${env.MONGODB_DB_NAME}]...`);
    await mongoose.connect(mongoUri, {
      dbName: env.MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 5000,
    });

    console.log('Connected to database. Checking existing records...');

    const existingUser = await User.findOne({ mobile: normalizedMobile });

    if (existingUser) {
      if (existingUser.role === 'ADMIN') {
        console.log(`\n[INFO] User ${normalizedMobile} is already an ACTIVE administrator.`);
        console.log(`Admin ID: ${existingUser._id}`);
        await mongoose.disconnect();
        return;
      }

      if (!confirmPromote) {
        console.error(
          `\n[SECURITY ALERT] User ${normalizedMobile} already exists with role '${existingUser.role}'.` +
            `\nRefusing to promote existing user without explicit '--confirm-promote' flag.`
        );
        await mongoose.disconnect();
        process.exit(1);
      }

      console.log(`Promoting existing user ${normalizedMobile} to ADMIN role...`);
      const passwordHash = await hashPassword(password);
      existingUser.role = 'ADMIN';
      existingUser.status = 'ACTIVE';
      existingUser.passwordHash = passwordHash;
      await existingUser.save();

      await AdminAuditLog.create({
        adminId: existingUser._id,
        action: 'BOOTSTRAP_PROMOTED_ADMIN',
        targetEntity: 'User',
        targetId: existingUser._id.toString(),
        details: { mobile: normalizedMobile, name },
        ipAddress: '127.0.0.1 (CLI)',
      });

      console.log(`\n[SUCCESS] Successfully promoted ${normalizedMobile} to ADMIN role.`);
      await mongoose.disconnect();
      return;
    }

    // Create new admin user
    console.log('Generating Argon2id password hash...');
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

    await mongoose.disconnect();
  } catch (err: any) {
    console.error('\n[FATAL] Bootstrap exception:', err);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  bootstrapAdminCli();
}
