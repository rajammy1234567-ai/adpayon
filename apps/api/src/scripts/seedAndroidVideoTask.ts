import mongoose, { Types } from 'mongoose';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { Campaign, Task, User, TaskCompletion } from '../models';

async function seedAndroidVideoTask() {
  console.log('===============================================================');
  console.log('   ADPAYON: PHASE 10.3C ANDROID VIDEO TASK SEEDING SCRIPT      ');
  console.log('===============================================================');

  // 1. Strict Database Guard
  if (env.MONGODB_DB_NAME !== 'adpayon_test' || env.APP_ENV !== 'test') {
    throw new Error(`CRITICAL SECURITY FAILURE: Script must only run on adpayon_test with APP_ENV=test. Current: DB=${env.MONGODB_DB_NAME}, APP_ENV=${env.APP_ENV}`);
  }

  await mongoose.connect(env.MONGODB_URI!, { dbName: 'adpayon_test' });

  const activeDb = mongoose.connection.db?.databaseName;
  if (activeDb !== 'adpayon_test') {
    throw new Error(`CRITICAL SECURITY FAILURE: Connected to ${activeDb} instead of adpayon_test`);
  }
  console.log(`Connected Database:  ${activeDb} (VERIFIED)`);

  // 2. Baseline Seed Check
  const baselineCompletions = await TaskCompletion.countDocuments();
  console.log(`Baseline Completions: ${baselineCompletions} (Expected: 15)`);
  if (baselineCompletions !== 15) {
    throw new Error(`Integrity check failed: Expected 15 baseline completions, found ${baselineCompletions}`);
  }

  // 3. Find Admin User for createdBy reference
  const admin = await User.findOne({ role: 'ADMIN' });
  if (!admin) {
    throw new Error('No ADMIN user found in adpayon_test to reference as createdBy');
  }
  console.log(`Creator Reference:   Admin ID ${admin._id}`);

  // 4. Create Dedicated Synthetic Campaign
  const campaign = await Campaign.create({
    name: 'ANDROID_VIDEO_QA Campaign',
    advertiserName: 'Android QA Media Labs',
    description: 'Dedicated synthetic test campaign for physical Android Video Watch verification',
    status: 'ACTIVE',
    isSandbox: false,
    advertiserBudgetPaise: 5000000,
    authorizedAgreementRef: 'AGR-ANDROID-VIDEO-QA-001',
    webhookSecret: crypto.randomBytes(32).toString('hex'),
    createdBy: admin._id,
  });
  console.log(`Created Campaign:    ${campaign._id} ("${campaign.name}")`);

  // 5. Create Dedicated Synthetic Video Watch Task
  // Video duration verified via mp4 mvhd box: 10.026s
  // Required watch: 8s (satisfies approx 10s supported by verified duration)
  const task = await Task.create({
    campaignId: campaign._id,
    title: 'Android QA: Watch Test Video',
    description: 'Watch video to verify playback, progress synchronization and reward verification',
    category: 'VIDEO_WATCH',
    verificationMethod: 'FIRST_PARTY_ACTION',
    rewardPoints: 50,
    status: 'PUBLISHED',
    totalCap: 1,
    dailyCapPerUser: 1,
    dwellTimeSeconds: 0,
    targeting: {
      kycRequired: false,
      minAncestryDepth: 0,
    },
    videoWatchConfig: {
      videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      videoDurationSeconds: 10,
      requiredWatchSeconds: 8,
      allowSeeking: false,
      sessionTimeoutSeconds: 600,
    },
    createdBy: admin._id,
  });
  console.log(`Created Task:        ${task._id} ("${task.title}")`);

  // 6. Verify Post-Creation Baseline Completions Intact
  const postCompletions = await TaskCompletion.countDocuments();
  if (postCompletions !== 15) {
    throw new Error(`CRITICAL VIOLATION: task_completions altered! Count is now ${postCompletions}`);
  }
  console.log(`Post-Seed Completions: ${postCompletions} (INTEGRITY PRESERVED)`);

  // 7. Write Manifest
  const manifest = {
    createdAt: new Date().toISOString(),
    database: activeDb,
    campaign: {
      id: campaign._id.toString(),
      name: campaign.name,
      status: campaign.status,
    },
    task: {
      id: task._id.toString(),
      title: task.title,
      category: task.category,
      verificationMethod: task.verificationMethod,
      rewardPoints: task.rewardPoints,
      status: task.status,
      totalCap: task.totalCap,
      dailyCapPerUser: task.dailyCapPerUser,
      videoWatchConfig: task.videoWatchConfig,
      targeting: task.targeting,
    },
    testUserTarget: '+919876543211',
    cleanupPlan: {
      step1: `Task.deleteOne({ _id: new ObjectId("${task._id}") })`,
      step2: `Campaign.deleteOne({ _id: new ObjectId("${campaign._id}") })`,
    },
  };

  const manifestPath = path.resolve(__dirname, '../../test-manifest-android-video.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Saved Manifest:      ${manifestPath}`);

  // 8. Test Feed Eligibility for Test User
  const testUser = await User.findOne({ mobile: '+919876543211' });
  if (testUser) {
    const isEligible =
      (!task.targeting?.kycRequired || testUser.metadata?.kycStatus === 'VERIFIED') &&
      (!task.targeting?.minAncestryDepth || (testUser.ancestors?.length || 0) >= task.targeting.minAncestryDepth);
    console.log(`Feed Eligibility:    User ${testUser.mobile} eligible = ${isEligible}`);
  }

  console.log('===============================================================');
  console.log('   SETUP SUCCESSFUL: READY FOR PHYSICAL ANDROID TESTING        ');
  console.log('===============================================================');

  await mongoose.disconnect();
}

seedAndroidVideoTask().catch((err) => {
  console.error('[SEED ERROR]', err.message);
  process.exit(1);
});
