import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Ensure .env.client_staging is loaded if present before env validation
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

export interface IndexDefinition {
  name: string;
  key: Record<string, number | string>;
  unique?: boolean;
  sparse?: boolean;
  partialFilterExpression?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MigrationPreconditions {
  databaseName: string;
  totalDocuments: number;
  mobileIndexExists: boolean;
  isMobileIndexUnique: boolean;
  isMobileIndexSparse: boolean;
  emailIndexExists: boolean;
  isEmailIndexUnique: boolean;
  isEmailIndexSparse: boolean;
  existingIndexes: IndexDefinition[];
}

export interface MigrationResult {
  status: 'DRY_RUN' | 'ALREADY_COMPLIANT' | 'MIGRATED';
  database: string;
  preconditions: MigrationPreconditions;
  backupIndexDefinitions: IndexDefinition[];
  actionsTaken: string[];
  verifiedIndexes: IndexDefinition[];
}

/**
 * Inspects existing indexes and document state on users collection.
 */
export async function inspectPreconditions(
  collection: mongoose.mongo.Collection
): Promise<MigrationPreconditions> {
  const existingIndexes = (await collection.indexes()) as IndexDefinition[];
  const totalDocuments = await collection.countDocuments();

  const mobileIndex = existingIndexes.find((idx) => idx.name === 'mobile_1');
  const emailIndex = existingIndexes.find((idx) => idx.name === 'email_1');

  return {
    databaseName: collection.dbName,
    totalDocuments,
    mobileIndexExists: !!mobileIndex,
    isMobileIndexUnique: !!mobileIndex?.unique,
    isMobileIndexSparse: !!mobileIndex?.sparse,
    emailIndexExists: !!emailIndex,
    isEmailIndexUnique: !!emailIndex?.unique,
    isEmailIndexSparse: !!emailIndex?.sparse,
    existingIndexes,
  };
}

/**
 * Validates strict environment safeguards before allowing any database operation.
 */
export function validateEnvironmentGuard(): void {
  if (env.APP_ENV !== 'client_staging') {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: APP_ENV must strictly be 'client_staging'. Received: '${env.APP_ENV}'. Refusing execution.`
    );
  }
  if (env.MONGODB_DB_NAME !== 'adpayon_client_staging') {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: Target database must strictly be 'adpayon_client_staging'. Received: '${env.MONGODB_DB_NAME}'. Refusing execution.`
    );
  }
}

/**
 * Executes or simulates the safe migration of the mobile_1 index on adpayon_client_staging.
 *
 * STRICT SAFEGUARDS:
 * 1. Only runs when connected to adpayon_client_staging.
 * 2. Never drops the users collection.
 * 3. Never mutates or deletes documents.
 * 4. Backs up index definitions before any mutation.
 * 5. Requires explicit --confirm-index-migration flag to execute mutations.
 */
export async function migrateStagingMobileIndex(
  options: { confirmMigration?: boolean } = {}
): Promise<MigrationResult> {
  console.log('\n===============================================================');
  console.log('   ADPAYON — STAGING MOBILE INDEX MIGRATION (PHASE 11J)       ');
  console.log('===============================================================\n');

  // 1. Strict environment guard
  validateEnvironmentGuard();

  // 2. Connect to database and verify connection identity
  await connectMongo();
  const isAlive = await pingMongo();
  if (!isAlive) {
    throw new Error('Database ping failed. Cannot reach MongoDB Atlas cluster.');
  }

  const activeDb = mongoose.connection.db;
  if (!activeDb || activeDb.databaseName !== 'adpayon_client_staging') {
    await disconnectMongo();
    throw new Error(
      `CRITICAL SECURITY VIOLATION: Connected to unexpected database '${activeDb?.databaseName}'. Expected strictly 'adpayon_client_staging'. Terminating.`
    );
  }

  console.log(`[SECURITY GUARD PASSED] Connected to verified database: ${activeDb.databaseName}\n`);

  try {
    const userCollection = activeDb.collection('users');
    const preconditions = await inspectPreconditions(userCollection);
    const backupIndexDefinitions = JSON.parse(JSON.stringify(preconditions.existingIndexes));

    console.log(`[PRECONDITION INSPECTION]`);
    console.log(`Database:                 ${preconditions.databaseName}`);
    console.log(`Total User Documents:     ${preconditions.totalDocuments}`);
    console.log(`mobile_1 Index Exists:    ${preconditions.mobileIndexExists}`);
    console.log(`mobile_1 Unique:          ${preconditions.isMobileIndexUnique}`);
    console.log(`mobile_1 Sparse:          ${preconditions.isMobileIndexSparse}`);
    console.log(`email_1 Index Exists:     ${preconditions.emailIndexExists}`);
    console.log(`email_1 Unique:           ${preconditions.isEmailIndexUnique}`);
    console.log(`email_1 Sparse:           ${preconditions.isEmailIndexSparse}`);

    // Check if index is already fully compliant
    if (
      preconditions.mobileIndexExists &&
      preconditions.isMobileIndexUnique &&
      preconditions.isMobileIndexSparse &&
      preconditions.emailIndexExists &&
      preconditions.isEmailIndexUnique &&
      preconditions.isEmailIndexSparse
    ) {
      console.log('\n[IDEMPOTENT CHECK] Indexes on adpayon_client_staging.users are already compliant.');
      console.log('mobile_1: { unique: true, sparse: true }');
      console.log('email_1:  { unique: true, sparse: true }');
      return {
        status: 'ALREADY_COMPLIANT',
        database: preconditions.databaseName,
        preconditions,
        backupIndexDefinitions,
        actionsTaken: ['NO_OP_ALREADY_COMPLIANT'],
        verifiedIndexes: preconditions.existingIndexes,
      };
    }

    const isConfirmed = options.confirmMigration || process.argv.includes('--confirm-index-migration');

    if (!isConfirmed) {
      console.log('\n---------------------------------------------------------------');
      console.log('[DRY-RUN MODE] Preconditions verified. No indexes modified.');
      console.log('Proposed Operations:');
      if (preconditions.mobileIndexExists && !preconditions.isMobileIndexSparse) {
        console.log(" 1. Drop existing non-sparse index 'mobile_1'.");
        console.log(" 2. Create index 'mobile_1' as { mobile: 1 }, { unique: true, sparse: true }.");
      }
      if (!preconditions.emailIndexExists) {
        console.log(" 3. Create index 'email_1' as { email: 1 }, { unique: true, sparse: true }.");
      }
      console.log('\nTo execute index migration, pass the explicit confirmation flag:');
      console.log('   npm run migrate:staging-mobile-index -- --confirm-index-migration');
      console.log('---------------------------------------------------------------\n');

      return {
        status: 'DRY_RUN',
        database: preconditions.databaseName,
        preconditions,
        backupIndexDefinitions,
        actionsTaken: ['DRY_RUN_PRECONDITIONS_VERIFIED'],
        verifiedIndexes: preconditions.existingIndexes,
      };
    }

    // 3. Execution Phase (Only reached when explicitly confirmed)
    console.log('\n[MIGRATION EXECUTION STARTED]');
    const actionsTaken: string[] = [];

    // Step A: Recreate mobile_1 if not sparse
    if (preconditions.mobileIndexExists && !preconditions.isMobileIndexSparse) {
      console.log("Dropping existing non-sparse index 'mobile_1'...");
      await userCollection.dropIndex('mobile_1');
      actionsTaken.push('DROPPED_NON_SPARSE_MOBILE_INDEX');

      console.log("Creating unique sparse index 'mobile_1'...");
      await userCollection.createIndex(
        { mobile: 1 },
        { unique: true, sparse: true, name: 'mobile_1', background: true }
      );
      actionsTaken.push('CREATED_UNIQUE_SPARSE_MOBILE_INDEX');
    } else if (!preconditions.mobileIndexExists) {
      console.log("Creating unique sparse index 'mobile_1'...");
      await userCollection.createIndex(
        { mobile: 1 },
        { unique: true, sparse: true, name: 'mobile_1', background: true }
      );
      actionsTaken.push('CREATED_UNIQUE_SPARSE_MOBILE_INDEX');
    }

    // Step B: Ensure email_1 exists and is unique sparse
    if (!preconditions.emailIndexExists) {
      console.log("Creating unique sparse index 'email_1'...");
      await userCollection.createIndex(
        { email: 1 },
        { unique: true, sparse: true, name: 'email_1', background: true }
      );
      actionsTaken.push('CREATED_UNIQUE_SPARSE_EMAIL_INDEX');
    } else if (!preconditions.isEmailIndexSparse || !preconditions.isEmailIndexUnique) {
      console.log("Dropping incompatible index 'email_1'...");
      await userCollection.dropIndex('email_1');
      actionsTaken.push('DROPPED_INCOMPATIBLE_EMAIL_INDEX');

      console.log("Recreating unique sparse index 'email_1'...");
      await userCollection.createIndex(
        { email: 1 },
        { unique: true, sparse: true, name: 'email_1', background: true }
      );
      actionsTaken.push('CREATED_UNIQUE_SPARSE_EMAIL_INDEX');
    }

    // 4. Post-condition verification
    const verifiedIndexes = (await userCollection.indexes()) as IndexDefinition[];
    const verifiedMobileIndex = verifiedIndexes.find((idx) => idx.name === 'mobile_1');
    const verifiedEmailIndex = verifiedIndexes.find((idx) => idx.name === 'email_1');
    const postCount = await userCollection.countDocuments();

    if (!verifiedMobileIndex || !verifiedMobileIndex.unique || !verifiedMobileIndex.sparse) {
      throw new Error("POST-MIGRATION VERIFICATION FAILED: 'mobile_1' index is not unique and sparse.");
    }

    if (!verifiedEmailIndex || !verifiedEmailIndex.unique || !verifiedEmailIndex.sparse) {
      throw new Error("POST-MIGRATION VERIFICATION FAILED: 'email_1' index is not unique and sparse.");
    }

    if (postCount !== preconditions.totalDocuments) {
      throw new Error(
        `POST-MIGRATION INTEGRITY ERROR: Document count changed from ${preconditions.totalDocuments} to ${postCount}.`
      );
    }

    console.log('\n[POST-MIGRATION VERIFICATION PASSED]');
    console.log(" - Verified index 'mobile_1': { unique: true, sparse: true }");
    console.log(" - Verified index 'email_1':  { unique: true, sparse: true }");
    console.log(` - Verified document count:   ${postCount} (Unchanged)\n`);

    return {
      status: 'MIGRATED',
      database: preconditions.databaseName,
      preconditions,
      backupIndexDefinitions,
      actionsTaken,
      verifiedIndexes,
    };
  } finally {
    await disconnectMongo();
  }
}

// Direct CLI Invocation
if (require.main === module) {
  migrateStagingMobileIndex()
    .then((res) => {
      console.log('[MIGRATION SCRIPT COMPLETED]');
      console.log(`Status:  ${res.status}`);
      console.log(`Actions: ${res.actionsTaken.join(', ')}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n[FATAL MIGRATION ERROR]', err.message);
      process.exit(1);
    });
}
