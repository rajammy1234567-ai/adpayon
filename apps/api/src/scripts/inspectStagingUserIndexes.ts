import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Ensure .env.client_staging is loaded
const stagingEnvPath = path.resolve(__dirname, '../../.env.client_staging');
if (fs.existsSync(stagingEnvPath)) {
  dotenv.config({ path: stagingEnvPath, override: true });
  process.env.ENV_FILE = stagingEnvPath;
}

import { env } from '../config/env';
import { connectMongo, disconnectMongo, pingMongo } from '../db/mongoose';

/**
 * ADPAYON — Strict Read-Only Staging User Index & Document Inspection
 *
 * SAFETY GUARDS:
 * - Only operates on 'adpayon_client_staging'.
 * - 100% read-only: no collection/index creations, mutations, or drops.
 * - Never logs credentials, URIs, or personal user data.
 */
export async function inspectStagingUserIndexes(): Promise<void> {
  console.log('\n===============================================================');
  console.log('   ADPAYON — READ-ONLY STAGING USER INDEX INSPECTION           ');
  console.log('===============================================================\n');

  if (env.APP_ENV !== 'client_staging') {
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
    throw new Error(`CRITICAL SECURITY ERROR: Connected to unexpected database '${activeDb?.databaseName}'. Expected 'adpayon_client_staging'.`);
  }

  console.log(`[VERIFIED] Connected to database: ${activeDb.databaseName}\n`);

  try {
    const collections = await activeDb.listCollections().toArray();
    const userCollectionExists = collections.some((c) => c.name === 'users');

    console.log(`Collections in ${activeDb.databaseName}:`);
    for (const c of collections) {
      console.log(` - ${c.name}`);
    }

    if (!userCollectionExists) {
      console.log(`\n'users' collection does not exist in ${activeDb.databaseName}.`);
      return;
    }

    const userCollection = activeDb.collection('users');

    // 1. Index inspection
    const indexes = await userCollection.indexes();
    console.log(`\nExisting Indexes on 'users' collection (${indexes.length} total):`);
    for (const idx of indexes) {
      console.log(JSON.stringify({
        name: idx.name,
        key: idx.key,
        unique: idx.unique || false,
        sparse: idx.sparse || false,
        partialFilterExpression: idx.partialFilterExpression || undefined,
      }, null, 2));
    }

    // 2. Document count & mobile distribution (NO personal data logged)
    const totalCount = await userCollection.countDocuments();
    const missingMobileCount = await userCollection.countDocuments({ mobile: { $exists: false } });
    const nullMobileCount = await userCollection.countDocuments({ mobile: null });
    const stringMobileCount = await userCollection.countDocuments({ mobile: { $type: 'string' } });
    const presentEmailCount = await userCollection.countDocuments({ email: { $exists: true, $ne: null } });
    const missingEmailCount = await userCollection.countDocuments({ email: { $exists: false } });

    console.log(`\nDocument Statistics (users):`);
    console.log(` - Total documents:          ${totalCount}`);
    console.log(` - Mobile exists (string):   ${stringMobileCount}`);
    console.log(` - Mobile missing:           ${missingMobileCount}`);
    console.log(` - Mobile null:              ${nullMobileCount}`);
    console.log(` - Email present:            ${presentEmailCount}`);
    console.log(` - Email missing:            ${missingEmailCount}`);

  } finally {
    await disconnectMongo();
    console.log('\n[COMPLETE] Read-only inspection finished cleanly.\n');
  }
}

if (require.main === module) {
  inspectStagingUserIndexes()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[FATAL]', err.message);
      process.exit(1);
    });
}
