import mongoose from 'mongoose';
import { env } from '../config/env';

/**
 * ADPAYON — Strict Read-Only Test Database Connectivity Verification
 *
 * STRICT SAFETY RULES:
 * 1. Only connects to 'adpayon_test'. Refuses execution on dev, sandbox, or prod.
 * 2. Read-only operation: executes only admin().ping().
 * 3. Does not create, update, or delete any records or collections.
 * 4. Never logs credentials or connection strings.
 */
export async function verifyTestDbConnectivity(): Promise<boolean> {
  const targetDb = process.env.MONGODB_TEST_DB_NAME || 'adpayon_test';

  if (targetDb !== 'adpayon_test') {
    console.error(`[SECURITY ERROR] Refusing verification on non-test database '${targetDb}'. Expected 'adpayon_test'.`);
    return false;
  }

  const mongoUri = process.env.MONGODB_TEST_URI || env.MONGODB_URI;
  if (!mongoUri) {
    console.error('[SECURITY ERROR] No MongoDB connection URI configured.');
    return false;
  }

  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }

    await mongoose.connect(mongoUri, {
      dbName: targetDb,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    const connectedDb = mongoose.connection.db?.databaseName;
    if (connectedDb !== targetDb) {
      console.log('===============================================================');
      console.log('   ADPAYON TEST DATABASE CONNECTIVITY VERIFICATION            ');
      console.log('===============================================================');
      console.log('Connection:        FAIL');
      console.log(`Connected DB:      ${connectedDb || 'unknown'} (MISMATCH: expected ${targetDb})`);
      console.log('Status:            SECURITY REJECTION');
      console.log('===============================================================');
      await mongoose.disconnect().catch(() => {});
      return false;
    }

    const pingResult = await mongoose.connection.db?.admin().ping();

    console.log('===============================================================');
    console.log('   ADPAYON TEST DATABASE CONNECTIVITY VERIFICATION            ');
    console.log('===============================================================');
    console.log('Connection:        PASS');
    console.log(`Connected DB:      ${connectedDb}`);
    console.log(`Ping Result:       ${JSON.stringify(pingResult)}`);
    console.log('Status:            READY FOR TEST EXECUTION');
    console.log('===============================================================');

    return true;
  } catch (err: any) {
    // Sanitize any raw error message to ensure no credentials or tokens are printed
    const sanitizedMsg = (err.message || 'Unknown connectivity failure')
      .replace(/mongodb(\+srv)?:\/\/[^@]+@/gi, 'mongodb+srv://<redacted>@')
      .replace(/:\/\/.*:.*@/g, '://<redacted>@');

    console.log('===============================================================');
    console.log('   ADPAYON TEST DATABASE CONNECTIVITY VERIFICATION            ');
    console.log('===============================================================');
    console.log('Connection:        FAIL');
    console.log('Connected DB:      none');
    console.log(`Error:             ${sanitizedMsg}`);
    console.log('===============================================================');
    return false;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
  }
}

if (require.main === module) {
  verifyTestDbConnectivity().then((success) => {
    process.exit(success ? 0 : 1);
  });
}
