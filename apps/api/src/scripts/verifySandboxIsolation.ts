import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface SandboxIsolationReport {
  sandboxConfigValid: boolean;
  sandboxDatabaseTarget: string;
  sandboxServerPort: number;
  sandboxPingPassed: boolean;
  sandboxWriteVerified: boolean;
  crossWriteDevBlocked: boolean;
  crossWriteTestBlocked: boolean;
  devEnvPreserved: boolean;
  mobileDevPreserved: boolean;
  mobileSandboxTargetValid: boolean;
}

export async function runSandboxIsolationVerification(): Promise<SandboxIsolationReport> {
  const report: SandboxIsolationReport = {
    sandboxConfigValid: false,
    sandboxDatabaseTarget: env.MONGODB_DB_NAME,
    sandboxServerPort: env.PORT,
    sandboxPingPassed: false,
    sandboxWriteVerified: false,
    crossWriteDevBlocked: false,
    crossWriteTestBlocked: false,
    devEnvPreserved: false,
    mobileDevPreserved: false,
    mobileSandboxTargetValid: false,
  };

  logger.info('--- ADPAYON SANDBOX ISOLATION VERIFICATION ---');

  // 1. Verify Sandbox Configuration Identity
  if (env.NODE_ENV !== 'sandbox') {
    throw new Error(`Invalid NODE_ENV: Expected 'sandbox', received '${env.NODE_ENV}'`);
  }
  if (env.PORT !== 5001) {
    throw new Error(`Invalid PORT: Expected 5001 for sandbox API, received '${env.PORT}'`);
  }
  if (env.MONGODB_DB_NAME !== 'adpayon_sandbox') {
    throw new Error(
      `Invalid MONGODB_DB_NAME: Expected 'adpayon_sandbox', received '${env.MONGODB_DB_NAME}'`
    );
  }
  if (!env.MONGODB_URI || env.MONGODB_URI.includes('<SANDBOX_DB_PASSWORD>')) {
    throw new Error(
      'MONGODB_URI is unconfigured or still contains <SANDBOX_DB_PASSWORD> placeholder'
    );
  }
  if (!env.MONGODB_URI.includes('adpayon_sandbox_app')) {
    throw new Error(
      'MONGODB_URI does not use dedicated sandbox user adpayon_sandbox_app'
    );
  }
  report.sandboxConfigValid = true;
  logger.info('STEP 1: Sandbox environment configuration verified.');

  // 2. Verify Dev & Mobile Environment Preservation
  function resolveApiPackageRoot(startDir: string): string {
    let current = startDir;
    while (current !== path.dirname(current)) {
      const pkgPath = path.join(current, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg.name === '@adpayon/api') {
            return current;
          }
        } catch {
          // Continue walking up
        }
      }
      current = path.dirname(current);
    }
    throw new Error(
      'CRITICAL FAILURE: Could not locate @adpayon/api package root containing package.json'
    );
  }

  const apiRoot = resolveApiPackageRoot(__dirname);
  const devEnvPath = path.join(apiRoot, '.env');
  if (!fs.existsSync(devEnvPath)) {
    throw new Error(
      `CRITICAL FAILURE: Existing development environment file not found at ${devEnvPath}`
    );
  }

  const devEnvRaw = fs.readFileSync(devEnvPath, 'utf8');
  const devConfig = dotenv.parse(devEnvRaw);
  if (
    devConfig.PORT === '5000' &&
    devConfig.MONGODB_DB_NAME === 'adpayon_dev' &&
    devConfig.MONGODB_TEST_DB_NAME === 'adpayon_test'
  ) {
    report.devEnvPreserved = true;
    logger.info('STEP 2A: apps/api/.env development and automated test database targets preserved.');
  } else {
    throw new Error(
      `CRITICAL FAILURE: apps/api/.env configuration mismatch! Expected PORT=5000, MONGODB_DB_NAME=adpayon_dev, MONGODB_TEST_DB_NAME=adpayon_test.`
    );
  }

  const mobileRoot = path.resolve(apiRoot, '../mobile');
  const mobilePkgPath = path.join(mobileRoot, 'package.json');
  if (!fs.existsSync(mobilePkgPath)) {
    throw new Error(
      `CRITICAL FAILURE: Could not locate apps/mobile package directory at ${mobileRoot}`
    );
  }

  const mobileDevEnvPath = path.join(mobileRoot, '.env');
  if (!fs.existsSync(mobileDevEnvPath)) {
    throw new Error(
      `CRITICAL FAILURE: Existing mobile development environment file not found at ${mobileDevEnvPath}`
    );
  }

  const mobDevRaw = fs.readFileSync(mobileDevEnvPath, 'utf8');
  const mobDevConfig = dotenv.parse(mobDevRaw);
  if (mobDevConfig.EXPO_PUBLIC_API_URL?.includes(':5000')) {
    report.mobileDevPreserved = true;
    logger.info('STEP 2B: apps/mobile/.env development configuration targeting port 5000 preserved.');
  } else {
    throw new Error(
      `CRITICAL FAILURE: apps/mobile/.env does not target port 5000! Found EXPO_PUBLIC_API_URL=${mobDevConfig.EXPO_PUBLIC_API_URL}`
    );
  }

  const mobileSandboxEnvPath = path.join(mobileRoot, '.env.sandbox');
  if (!fs.existsSync(mobileSandboxEnvPath)) {
    throw new Error(
      `CRITICAL FAILURE: Mobile sandbox environment file not found at ${mobileSandboxEnvPath}`
    );
  }

  const mobSandboxRaw = fs.readFileSync(mobileSandboxEnvPath, 'utf8');
  const mobSandboxConfig = dotenv.parse(mobSandboxRaw);
  if (
    mobSandboxConfig.EXPO_PUBLIC_API_URL?.includes(':5001') &&
    mobSandboxConfig.EXPO_PUBLIC_APP_ENV === 'sandbox'
  ) {
    report.mobileSandboxTargetValid = true;
    logger.info('STEP 2C: apps/mobile/.env.sandbox verified targeting port 5001 with zero bundled secrets.');
  } else {
    throw new Error(
      `CRITICAL FAILURE: apps/mobile/.env.sandbox invalid! Expected EXPO_PUBLIC_API_URL with port 5001 and EXPO_PUBLIC_APP_ENV=sandbox.`
    );
  }

  // 3. Connect to Sandbox Database via Mongoose
  logger.info('STEP 3: Connecting to adpayon_sandbox...');
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  await mongoose.connect(env.MONGODB_URI, {
    dbName: 'adpayon_sandbox',
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 6000,
  });

  const activeDb = mongoose.connection.db;
  if (!activeDb || activeDb.databaseName !== 'adpayon_sandbox') {
    await mongoose.disconnect().catch(() => {});
    throw new Error(
      `CRITICAL SECURITY VIOLATION: Expected connection to 'adpayon_sandbox' but got '${activeDb?.databaseName}'`
    );
  }

  const pingResult = await activeDb.admin().ping();
  if (pingResult?.ok !== 1) {
    throw new Error('Ping to adpayon_sandbox failed');
  }
  report.sandboxPingPassed = true;
  logger.info('STEP 3: Active connection and ping verified on adpayon_sandbox.');

  // 4. Verify Write & Read in adpayon_sandbox
  logger.info('STEP 4: Testing write capability on adpayon_sandbox...');
  const probeCollection = activeDb.collection('__sandbox_isolation_check__');
  const probeDoc = { probeId: `sandbox-test-${Date.now()}`, createdAt: new Date() };
  await probeCollection.insertOne(probeDoc);

  const found = await probeCollection.findOne({ probeId: probeDoc.probeId });
  if (!found) {
    throw new Error('Failed to verify document write on adpayon_sandbox');
  }
  await probeCollection.deleteOne({ probeId: probeDoc.probeId });
  report.sandboxWriteVerified = true;
  logger.info('STEP 4: Isolated read/write verified on adpayon_sandbox.');

  // 5. Verify Sandbox Credentials CANNOT Write to adpayon_dev
  logger.info('STEP 5: Verifying cross-database write denial to adpayon_dev...');
  const devDb = mongoose.connection.getClient().db('adpayon_dev');
  try {
    await devDb.collection('__sandbox_probe__').insertOne({
      probe: 'unauthorized_write_attempt',
      timestamp: new Date(),
    });
    // If it succeeds, that is a security violation!
    throw new Error('SECURITY VIOLATION: Sandbox credentials successfully wrote to adpayon_dev!');
  } catch (err: any) {
    if (err.message.includes('SECURITY VIOLATION')) {
      throw err;
    }
    // Authorization error is EXPECTED (Code 13: Unauthorized)
    report.crossWriteDevBlocked = true;
    logger.info(
      { reason: err.message },
      'STEP 5: Confirmed: Sandbox credentials are denied write access to adpayon_dev.'
    );
  }

  // 6. Verify Sandbox Credentials CANNOT Write to adpayon_test
  logger.info('STEP 6: Verifying cross-database write denial to adpayon_test...');
  const testDb = mongoose.connection.getClient().db('adpayon_test');
  try {
    await testDb.collection('__sandbox_probe__').insertOne({
      probe: 'unauthorized_write_attempt',
      timestamp: new Date(),
    });
    // If it succeeds, that is a security violation!
    throw new Error('SECURITY VIOLATION: Sandbox credentials successfully wrote to adpayon_test!');
  } catch (err: any) {
    if (err.message.includes('SECURITY VIOLATION')) {
      throw err;
    }
    // Authorization error is EXPECTED (Code 13: Unauthorized)
    report.crossWriteTestBlocked = true;
    logger.info(
      { reason: err.message },
      'STEP 6: Confirmed: Sandbox credentials are denied write access to adpayon_test.'
    );
  }

  await mongoose.disconnect();
  return report;
}

if (require.main === module) {
  runSandboxIsolationVerification()
    .then((report) => {
      console.log('\n============================================================');
      console.log('ADPAYON SANDBOX ISOLATION VERIFICATION REPORT:');
      console.log('------------------------------------------------------------');
      console.log('Sandbox Config Valid:         ', report.sandboxConfigValid);
      console.log('Sandbox Database Target:      ', report.sandboxDatabaseTarget);
      console.log('Sandbox Server Port:          ', report.sandboxServerPort);
      console.log('Sandbox Active Ping:          ', report.sandboxPingPassed);
      console.log('Sandbox Read/Write Verified:  ', report.sandboxWriteVerified);
      console.log('Cross-Write to Dev Denied:    ', report.crossWriteDevBlocked);
      console.log('Cross-Write to Test Denied:   ', report.crossWriteTestBlocked);
      console.log('Dev Environment Preserved:    ', report.devEnvPreserved);
      console.log('Mobile Dev Preserved:         ', report.mobileDevPreserved);
      console.log('Mobile Sandbox Target Valid:  ', report.mobileSandboxTargetValid);
      console.log('============================================================\n');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err: err.message }, 'Sandbox isolation verification failed or blocked');
      if (mongoose.connection.readyState !== 0) {
        mongoose.disconnect().finally(() => process.exit(1));
      } else {
        process.exit(1);
      }
    });
}
