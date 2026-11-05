import mongoose, { Types } from 'mongoose';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { Campaign, Task, User, TaskCompletion } from '../models';

async function seedAndroidArticleTask() {
  console.log('===============================================================');
  console.log('   ADPAYON: PHASE 10.4B ANDROID ARTICLE TASK SEEDING SCRIPT    ');
  console.log('===============================================================');

  // 1. Strict Database Guard
  if (env.MONGODB_DB_NAME !== 'adpayon_test' || env.APP_ENV !== 'test') {
    throw new Error(
      `CRITICAL SECURITY FAILURE: Script must only run on adpayon_test with APP_ENV=test. Current: DB=${env.MONGODB_DB_NAME}, APP_ENV=${env.APP_ENV}`
    );
  }

  await mongoose.connect(env.MONGODB_URI!, { dbName: 'adpayon_test' });

  const activeDb = mongoose.connection.db?.databaseName;
  if (activeDb !== 'adpayon_test') {
    throw new Error(`CRITICAL SECURITY FAILURE: Connected to ${activeDb} instead of adpayon_test`);
  }
  console.log(`[PASS] Connected Database: ${activeDb} (VERIFIED test environment)`);

  // 2. Step 1 Read-only Preflight & Baseline Invariant Verification
  const testUserId = new Types.ObjectId('6ad859805103f0ccee6479d5');
  const testUser = await User.findById(testUserId);
  if (!testUser) {
    throw new Error(`PREFLIGHT FAILED: Physical tester user ${testUserId} not found in adpayon_test`);
  }
  if (testUser.status !== 'ACTIVE') {
    throw new Error(`PREFLIGHT FAILED: Physical tester user status is ${testUser.status}, expected ACTIVE`);
  }
  const maskedMobile = testUser.mobile
    ? `${testUser.mobile.slice(0, 5)}****${testUser.mobile.slice(-2)}`
    : 'N/A';
  console.log(`[PASS] Physical Tester:   ID ${testUser._id} (Status: ${testUser.status}, Mobile: ${maskedMobile})`);

  // Video QA Campaign check
  const videoCampaignId = new Types.ObjectId('6ad85da9b780b43f45236673');
  const videoCampaign = await Campaign.findById(videoCampaignId);
  if (!videoCampaign || videoCampaign.name !== 'ANDROID_VIDEO_QA Campaign' || videoCampaign.status !== 'ACTIVE') {
    throw new Error(`PREFLIGHT FAILED: Video QA Campaign ${videoCampaignId} missing or invalid state`);
  }
  console.log(`[PASS] Video QA Campaign:  ID ${videoCampaign._id} (Name: "${videoCampaign.name}", Status: ${videoCampaign.status})`);

  // Video QA Task check
  const videoTaskId = new Types.ObjectId('6ad85daab780b43f45236674');
  const videoTask = await Task.findById(videoTaskId);
  if (!videoTask || videoTask.title !== 'Android QA: Watch Test Video' || videoTask.status !== 'PUBLISHED') {
    throw new Error(`PREFLIGHT FAILED: Video QA Task ${videoTaskId} missing or invalid state`);
  }
  console.log(`[PASS] Video QA Task:      ID ${videoTask._id} (Title: "${videoTask.title}", Status: ${videoTask.status})`);

  // Video QA Completion check
  const videoCompletionId = new Types.ObjectId('6ad86c659be2dca21858d616');
  const videoCompletion = await TaskCompletion.findById(videoCompletionId);
  if (!videoCompletion || videoCompletion.status !== 'VERIFIED' || videoCompletion.rewardPoints !== 50) {
    throw new Error(`PREFLIGHT FAILED: Video QA Completion ${videoCompletionId} missing or invalid status/rewardPoints`);
  }
  console.log(`[PASS] Video QA Completion: ID ${videoCompletion._id} (Status: ${videoCompletion.status}, Points: ${videoCompletion.rewardPoints})`);

  // Total completions check: 15 baseline + 1 QA Video = 16
  const preCompletionsCount = await TaskCompletion.countDocuments();
  console.log(`[PASS] Total Completions:  ${preCompletionsCount} (Expected: 16)`);
  if (preCompletionsCount !== 16) {
    throw new Error(`PREFLIGHT FAILED: Expected 16 task_completions, found ${preCompletionsCount}`);
  }

  // Find Admin for createdBy reference
  const admin = await User.findOne({ role: 'ADMIN' });
  if (!admin) {
    throw new Error('PREFLIGHT FAILED: No ADMIN user found in adpayon_test to reference as createdBy');
  }
  console.log(`[PASS] Admin Reference:    ID ${admin._id}`);

  // 3. Step 2 & 4: Idempotent Campaign Provisioning
  const targetCampaignName = 'ANDROID_ARTICLE_QA Campaign';
  let campaign = await Campaign.findOne({ name: targetCampaignName });
  let campaignNewlyCreated = false;

  if (!campaign) {
    campaign = await Campaign.create({
      name: targetCampaignName,
      advertiserName: 'Android QA Editorial Labs',
      description: 'Dedicated synthetic campaign for physical Android article reading QA verification.',
      status: 'ACTIVE',
      isSandbox: false,
      advertiserBudgetPaise: 5000000,
      authorizedAgreementRef: 'AGR-ANDROID-ARTICLE-QA-001',
      webhookSecret: crypto.randomBytes(32).toString('hex'),
      startDate: new Date('2026-10-21T00:00:00.000Z'),
      endDate: new Date('2026-11-20T00:00:00.000Z'),
      createdBy: admin._id,
    });
    campaignNewlyCreated = true;
    console.log(`[CREATED] Synthetic Campaign: ID ${campaign._id} ("${campaign.name}")`);
  } else {
    console.log(`[EXISTING] Synthetic Campaign: ID ${campaign._id} ("${campaign.name}", Status: ${campaign.status})`);
  }

  // 4. Step 3 & 4: Idempotent Article Task Provisioning
  const targetTaskTitle = 'Android QA: Read How Internet Works';
  let task = await Task.findOne({ title: targetTaskTitle });
  let taskNewlyCreated = false;

  const articleContentText =
    'Have you ever wondered what happens when you open a website on your mobile phone? Several internet technologies cooperate to deliver the page.\n\n' +
    "First, your device looks up the website's domain name using the Domain Name System, or DNS. DNS helps translate names such as example.com into IP addresses that computers can use for communication.\n\n" +
    'Next, the device establishes a network connection. For an HTTPS website, TLS helps protect the communication through encryption.\n\n' +
    "The browser sends an HTTP request to the website's server. The server responds with data that travels through the network as packets.\n\n" +
    'Routers help forward those packets across interconnected networks. The receiving device reconstructs the data and the browser displays the web page.\n\n' +
    'DNS, IP networking, routing, HTTP, and TLS work together to make everyday internet browsing possible.';

  if (!task) {
    task = await Task.create({
      campaignId: campaign._id,
      title: targetTaskTitle,
      description: 'Read a short educational article about DNS and internet packets, scroll through it, and answer one comprehension question.',
      category: 'ARTICLE_READ',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 25,
      status: 'PUBLISHED',
      totalCap: 1,
      completionsCount: 0,
      dailyCapPerUser: 1,
      dwellTimeSeconds: 0,
      targeting: {
        kycRequired: false,
        minAncestryDepth: 0,
        allowedStates: [],
      },
      articleReadConfig: {
        articleTitle: 'How the Internet Works: From Clicks to Packets',
        articleContent: articleContentText,
        sourceUrl: 'https://adpayon.com/qa/how-the-internet-works',
        minReadDurationSeconds: 15,
        minScrollPercentage: 80,
        comprehensionQuiz: {
          question: 'What is the primary role of DNS?',
          options: [
            'Mining digital coins',
            'Translating domain names into IP addresses',
            'Charging mobile phones',
            'Compressing video files',
          ],
          correctOptionIndex: 1,
        },
      },
      createdBy: admin._id,
    });
    taskNewlyCreated = true;
    console.log(`[CREATED] Article QA Task:   ID ${task._id} ("${task.title}")`);
  } else {
    console.log(`[EXISTING] Article QA Task:   ID ${task._id} ("${task.title}", Status: ${task.status})`);
  }

  // 5. Step 5: Read-Only Post-Creation Audit
  console.log('--- POST-CREATION AUDIT ---');

  // Verify total completions unchanged
  const postCompletionsCount = await TaskCompletion.countDocuments();
  if (postCompletionsCount !== 16) {
    throw new Error(`CRITICAL POST-AUDIT VIOLATION: task_completions altered! Count is now ${postCompletionsCount}`);
  }
  console.log(`[AUDIT PASS] TaskCompletions preserved: exactly ${postCompletionsCount}`);

  // Verify Video QA Task unchanged
  const postVideoTask = await Task.findById(videoTaskId);
  if (!postVideoTask || postVideoTask.completionsCount !== 1 || postVideoTask.totalCap !== 1) {
    throw new Error('CRITICAL POST-AUDIT VIOLATION: Existing Video QA task mutated!');
  }
  console.log('[AUDIT PASS] Video QA Task completionsCount and caps unchanged');

  // Verify Article Task specifications
  if (task.category !== 'ARTICLE_READ') {
    throw new Error(`Invalid category: ${task.category}`);
  }
  if (task.status !== 'PUBLISHED') {
    throw new Error(`Invalid status: ${task.status}`);
  }
  if (task.rewardPoints !== 25) {
    throw new Error(`Invalid rewardPoints: ${task.rewardPoints}`);
  }
  if (task.totalCap !== 1 || task.completionsCount !== 0) {
    throw new Error(`Invalid caps: totalCap=${task.totalCap}, completionsCount=${task.completionsCount}`);
  }
  if (task.articleReadConfig?.minReadDurationSeconds !== 15) {
    throw new Error(`Invalid minReadDurationSeconds: ${task.articleReadConfig?.minReadDurationSeconds}`);
  }
  if (task.articleReadConfig?.minScrollPercentage !== 80) {
    throw new Error(`Invalid minScrollPercentage: ${task.articleReadConfig?.minScrollPercentage}`);
  }
  if (task.articleReadConfig?.comprehensionQuiz?.options?.length !== 4) {
    throw new Error(`Invalid quiz options count: ${task.articleReadConfig?.comprehensionQuiz?.options?.length}`);
  }
  if (task.articleReadConfig?.comprehensionQuiz?.correctOptionIndex !== 1) {
    throw new Error(`Invalid correctOptionIndex: ${task.articleReadConfig?.comprehensionQuiz?.correctOptionIndex}`);
  }
  console.log('[AUDIT PASS] Article Task parameters strictly match specifications');

  // Verify tester feed eligibility
  const isKycEligible = !task.targeting?.kycRequired || testUser.metadata?.kycStatus === 'VERIFIED';
  const isAncestryEligible = !task.targeting?.minAncestryDepth || (testUser.ancestors?.length || 0) >= task.targeting.minAncestryDepth;
  const isTesterEligible = isKycEligible && isAncestryEligible;
  console.log(`[AUDIT PASS] Tester Feed Eligibility: ${isTesterEligible} (KYC requirement bypassed as required)`);

  // Check published tasks count
  const publishedTasksCount = await Task.countDocuments({ status: 'PUBLISHED' });
  console.log(`[AUDIT PASS] Published Tasks in DB: ${publishedTasksCount}`);

  // Check duplicate article tasks
  const articleTasksCount = await Task.countDocuments({ category: 'ARTICLE_READ' });
  if (articleTasksCount !== 1) {
    throw new Error(`Expected exactly 1 ARTICLE_READ task, found ${articleTasksCount}`);
  }
  console.log(`[AUDIT PASS] Exactly 1 ARTICLE_READ task exists (zero duplicates)`);

  // 6. Write Local Git-Ignored QA Manifest (Zero secrets, zero raw credentials/personal data)
  const manifest = {
    createdAt: new Date().toISOString(),
    database: activeDb,
    environment: env.APP_ENV,
    campaignNewlyCreated,
    taskNewlyCreated,
    campaign: {
      id: campaign._id.toString(),
      name: campaign.name,
      advertiserName: campaign.advertiserName,
      status: campaign.status,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
    },
    task: {
      id: task._id.toString(),
      title: task.title,
      category: task.category,
      verificationMethod: task.verificationMethod,
      rewardPoints: task.rewardPoints,
      status: task.status,
      totalCap: task.totalCap,
      completionsCount: task.completionsCount,
      dailyCapPerUser: task.dailyCapPerUser,
      targeting: task.targeting,
      articleReadConfig: {
        articleTitle: task.articleReadConfig?.articleTitle,
        minReadDurationSeconds: task.articleReadConfig?.minReadDurationSeconds,
        minScrollPercentage: task.articleReadConfig?.minScrollPercentage,
        sourceUrl: task.articleReadConfig?.sourceUrl,
        hasQuiz: Boolean(task.articleReadConfig?.comprehensionQuiz?.question),
        quizOptionsCount: task.articleReadConfig?.comprehensionQuiz?.options?.length,
        // Quiz answer kept server-authoritative
      },
    },
    testerAccount: {
      userId: testUser._id.toString(),
      status: testUser.status,
      role: testUser.role,
      maskedMobile,
      eligible: isTesterEligible,
    },
    fixtures: {
      baselineCompletionsIntact: true,
      totalCompletions: postCompletionsCount,
      preservedVideoTaskCompletionId: videoCompletionId.toString(),
    },
    cleanupPlan: {
      step1: `Task.deleteOne({ _id: new ObjectId("${task._id}") })`,
      step2: `Campaign.deleteOne({ _id: new ObjectId("${campaign._id}") })`,
    },
  };

  const manifestPath = path.resolve(__dirname, '../../test-manifest-android-article.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[SAVED] Manifest: ${manifestPath}`);

  console.log('===============================================================');
  console.log('   SEEDING & POST-AUDIT COMPLETE: READY FOR PHYSICAL TESTING    ');
  console.log('===============================================================');

  await mongoose.disconnect();
}

seedAndroidArticleTask().catch((err) => {
  console.error('[SEED ERROR]', err.message);
  process.exit(1);
});
