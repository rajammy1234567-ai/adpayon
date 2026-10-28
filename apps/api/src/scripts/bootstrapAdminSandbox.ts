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

function promptHidden(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const origWrite = (rl as any)._writeToOutput;
    (rl as any)._writeToOutput = function (stringToWrite: string) {
      if (stringToWrite.includes('\n') || stringToWrite.includes('\r')) {
        process.stdout.write('\n');
      }
    };
    rl.question('', (answer) => {
      (rl as any)._writeToOutput = origWrite;
      resolve(answer.trim());
    });
  });
}

/**
 * Validates administrative password strength:
 * Minimum 10 characters, mixed uppercase, lowercase, numbers, and symbols.
 */
function validateAdminPassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 10) {
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
 * Explicitly invoked Sandbox Administrative Account Bootstrap.
 * Strictly forbidden from running against development or test databases.
 * Requires explicit operator input and fail-closed database verification.
 */
export async function bootstrapAdminSandboxCli(): Promise<void> {
  console.log('\n======================================================');
  console.log('    ADPAYON SECURE SANDBOX ADMIN BOOTSTRAP CLI        ');
  console.log('======================================================\n');

  // 1. Strict Sandbox Environment Configuration Assertion
  if (env.NODE_ENV !== 'sandbox') {
    console.error(`\n[FATAL SECURITY VIOLATION] NODE_ENV must be "sandbox". Received: '${env.NODE_ENV}'. Refusing execution.`);
    process.exit(1);
  }
  if (env.PORT !== 5001) {
    console.error(`\n[FATAL SECURITY VIOLATION] PORT must be 5001 for sandbox. Received: '${env.PORT}'. Refusing execution.`);
    process.exit(1);
  }
  if (env.MONGODB_DB_NAME !== 'adpayon_sandbox') {
    console.error(
      `\n[FATAL SECURITY VIOLATION] MONGODB_DB_NAME must strictly equal 'adpayon_sandbox'. Received: '${env.MONGODB_DB_NAME}'. Refusing execution.`
    );
    process.exit(1);
  }
  if (!env.MONGODB_URI || !env.MONGODB_URI.includes('adpayon_sandbox_app')) {
    console.error('\n[FATAL SECURITY VIOLATION] MONGODB_URI must use dedicated user adpayon_sandbox_app.');
    process.exit(1);
  }
  if (
    env.MONGODB_URI.includes('adpayon_dev') ||
    env.MONGODB_URI.includes('adpayon_test') ||
    env.MONGODB_URI.includes('adpayon_dev_app') ||
    env.MONGODB_URI.includes('adpayon_test_app')
  ) {
    console.error('\n[FATAL SECURITY VIOLATION] Cross-contamination detected in MONGODB_URI. Dev/test credentials forbidden.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
  };

  let mobile = getArg('--mobile') || process.env.SANDBOX_ADMIN_MOBILE;
  let name = getArg('--name') || process.env.SANDBOX_ADMIN_NAME;
  const isAutoConfirmed = args.includes('--confirm') || process.env.SANDBOX_ADMIN_CONFIRM === 'true';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    // 2. Connect to Database & Verify Identity Before Input
    console.log('[SECURITY CHECK 1/3] Connecting to adpayon_sandbox cluster...');
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    await mongoose.connect(env.MONGODB_URI, {
      dbName: 'adpayon_sandbox',
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 6000,
    });

    const activeDbName = mongoose.connection.db?.databaseName;
    if (activeDbName !== 'adpayon_sandbox') {
      await mongoose.disconnect().catch(() => {});
      console.error(
        `\n[FATAL SECURITY VIOLATION] Connected database is '${activeDbName}', NOT 'adpayon_sandbox'. Failing closed.`
      );
      process.exit(1);
    }
    console.log('[SECURITY CHECK 1/3 PASSED] Confirmed active database identity: adpayon_sandbox');

    // 3. Verify Sandbox Permissions (Denial of Dev/Test writes)
    console.log('[SECURITY CHECK 2/3] Verifying sandbox user cannot write to adpayon_dev or adpayon_test...');
    try {
      const devDb = mongoose.connection.getClient().db('adpayon_dev');
      await devDb.collection('__sandbox_probe__').insertOne({ probe: 'unauthorized_write', ts: new Date() });
      await mongoose.disconnect().catch(() => {});
      console.error('\n[FATAL SECURITY VIOLATION] Sandbox credentials wrote to adpayon_dev! Terminating.');
      process.exit(1);
    } catch (err: any) {
      if (err.message.includes('FATAL SECURITY VIOLATION')) throw err;
      // Expected rejection: Code 13 unauthorized
    }

    try {
      const testDb = mongoose.connection.getClient().db('adpayon_test');
      await testDb.collection('__sandbox_probe__').insertOne({ probe: 'unauthorized_write', ts: new Date() });
      await mongoose.disconnect().catch(() => {});
      console.error('\n[FATAL SECURITY VIOLATION] Sandbox credentials wrote to adpayon_test! Terminating.');
      process.exit(1);
    } catch (err: any) {
      if (err.message.includes('FATAL SECURITY VIOLATION')) throw err;
      // Expected rejection: Code 13 unauthorized
    }
    console.log('[SECURITY CHECK 2/3 PASSED] Confirmed: write access to dev & test databases is denied.');

    // 4. Operator Prompts & Account Lookup
    if (!mobile) {
      mobile = await prompt(rl, '\nEnter Sandbox Admin Mobile Number (+91XXXXXXXXXX): ');
    }

    if (!mobile) {
      console.error('\n[FATAL] Mobile number is strictly required.');
      await mongoose.disconnect();
      process.exit(1);
    }

    let normalizedMobile: string;
    try {
      normalizedMobile = normalizeIndianMobile(mobile);
    } catch (err: any) {
      console.error(`\n[FATAL] Invalid mobile number format: ${err.message}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    // 5. Check Existing Account in adpayon_sandbox
    console.log('\n[SECURITY CHECK 3/3] Inspecting adpayon_sandbox user collection...');
    const existingUser = await User.findOne({ mobile: normalizedMobile });

    if (existingUser) {
      if (existingUser.role !== 'ADMIN') {
        console.error(
          `\n[FATAL SECURITY VIOLATION] User ${normalizedMobile} already exists with non-admin role '${existingUser.role}'.` +
            `\nOverwriting or promoting existing unrelated users is strictly prohibited in sandbox.`
        );
        await mongoose.disconnect();
        process.exit(1);
      }

      console.log(`\nAdministrator ${normalizedMobile} (${existingUser.name || 'Admin'}) is registered in adpayon_sandbox.`);
      const updateChoice = await prompt(
        rl,
        `Would you like to set/update the password for this administrator? (Type 'YES' to update): `
      );

      if (updateChoice !== 'YES') {
        console.log(`\n======================================================`);
        console.log(`[IDEMPOTENT RERUN] Administrator ${normalizedMobile} preserved without changes.`);
        console.log(`Admin ID:      ${existingUser._id}`);
        console.log(`Role:          ${existingUser.role}`);
        console.log(`Status:        ${existingUser.status}`);
        console.log(`======================================================\n`);
        await mongoose.disconnect();
        return;
      }

      const password = await promptHidden(rl, 'Enter New Secure Sandbox Admin Password (min 10 chars, mixed case, numbers, special): ');
      const passCheck = validateAdminPassword(password);
      if (!passCheck.valid) {
        console.error(`\n[FATAL] Password validation failed: ${passCheck.error}`);
        await mongoose.disconnect();
        process.exit(1);
      }

      const confirmPassword = await promptHidden(rl, 'Confirm New Sandbox Admin Password: ');
      if (password !== confirmPassword) {
        console.error('\n[FATAL] Passwords do not match.');
        await mongoose.disconnect();
        process.exit(1);
      }

      console.log('\nGenerating cryptographic Argon2id password hash...');
      const passwordHash = await hashPassword(password);
      existingUser.passwordHash = passwordHash;
      existingUser.status = 'ACTIVE';
      await existingUser.save();

      await AdminAuditLog.create({
        adminId: existingUser._id,
        action: 'SANDBOX_BOOTSTRAP_UPDATED_ADMIN_PASSWORD',
        targetEntity: 'User',
        targetId: existingUser._id.toString(),
        details: {
          mobile: normalizedMobile,
          database: 'adpayon_sandbox',
        },
        ipAddress: '127.0.0.1 (Sandbox CLI Bootstrap)',
      });

      console.log('\n======================================================');
      console.log('   SANDBOX ADMINISTRATOR PASSWORD UPDATED SUCCESSFULLY');
      console.log('======================================================');
      console.log(`Admin ID:       ${existingUser._id}`);
      console.log(`Mobile:         ${normalizedMobile}`);
      console.log(`Role:           ADMIN`);
      console.log(`Status:         ACTIVE`);
      console.log(`Database:       adpayon_sandbox`);
      console.log('======================================================\n');

      await mongoose.disconnect();
      return;
    }

    // Account does not exist yet: provision new admin
    if (!name) {
      name = await prompt(rl, 'Enter Sandbox Admin Full Name: ');
    }
    if (!name) {
      console.error('\n[FATAL] Admin name is strictly required.');
      await mongoose.disconnect();
      process.exit(1);
    }

    const password = await promptHidden(rl, 'Enter Secure Sandbox Admin Password (min 10 chars, mixed case, numbers, special): ');
    const passCheck = validateAdminPassword(password);
    if (!passCheck.valid) {
      console.error(`\n[FATAL] Password validation failed: ${passCheck.error}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    const confirmPassword = await promptHidden(rl, 'Confirm Sandbox Admin Password: ');
    if (password !== confirmPassword) {
      console.error('\n[FATAL] Passwords do not match.');
      await mongoose.disconnect();
      process.exit(1);
    }

    // 6. Require Explicit Operator Confirmation
    if (!isAutoConfirmed) {
      const confirmInput = await prompt(
        rl,
        `\nConfirm creation of sandbox administrator '${name}' (${normalizedMobile}) in 'adpayon_sandbox'? (Type 'YES' to proceed): `
      );
      if (confirmInput !== 'YES') {
        console.log('\n[ABORTED] Operator did not enter "YES". Bootstrap aborted without writing any data.');
        await mongoose.disconnect();
        process.exit(0);
      }
    }

    // 7. Create Sandbox Administrator
    console.log('\nGenerating cryptographic Argon2id password hash...');
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

    // 8. Record Administrative Audit Log
    await AdminAuditLog.create({
      adminId: newAdmin._id,
      action: 'SANDBOX_BOOTSTRAP_CREATED_ADMIN',
      targetEntity: 'User',
      targetId: newAdmin._id.toString(),
      details: {
        mobile: normalizedMobile,
        name,
        referralCode,
        database: 'adpayon_sandbox',
      },
      ipAddress: '127.0.0.1 (Sandbox CLI Bootstrap)',
    });

    console.log('\n======================================================');
    console.log('   SANDBOX ADMINISTRATOR BOOTSTRAP COMPLETED          ');
    console.log('======================================================');
    console.log(`Admin ID:       ${newAdmin._id}`);
    console.log(`Mobile:         ${normalizedMobile}`);
    console.log(`Name:           ${name}`);
    console.log(`Role:           ADMIN`);
    console.log(`Status:         ACTIVE`);
    console.log(`Referral Code:  ${referralCode}`);
    console.log(`Database:       adpayon_sandbox`);
    console.log('======================================================\n');

    await mongoose.disconnect();
  } catch (err: any) {
    console.error('\n[FATAL] Sandbox admin bootstrap error:', err.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  bootstrapAdminSandboxCli();
}
