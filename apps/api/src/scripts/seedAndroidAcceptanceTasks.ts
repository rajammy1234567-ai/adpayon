import mongoose, { Types } from 'mongoose';
import { env } from '../config/env';
import { Task, Campaign, User, TaskCompletion, WalletLedgerEntry } from '../models';

async function main() {
  console.log('Connecting to sandbox database...');
  await mongoose.connect(env.MONGODB_URI!, { dbName: env.MONGODB_DB_NAME });
  console.log(`Connected to: ${mongoose.connection.db?.databaseName}`);

  // 1. Locate sandbox campaign
  const campaign = await Campaign.findOne({ isSandbox: true, status: 'ACTIVE' });
  if (!campaign) {
    throw new Error('No active sandbox campaign found');
  }
  console.log(`Using sandbox campaign: "${campaign.name}" (${campaign._id})`);

  // 2. Locate sandbox admin
  const admin = await User.findOne({ role: 'ADMIN', status: 'ACTIVE' });
  if (!admin) {
    throw new Error('No active sandbox admin user found');
  }
  console.log(`Using admin: "${admin.name}" (${admin._id})`);

  // 3. Locate sandbox mobile earner
  const earner = await User.findOne({ mobile: '+919876543216' });
  if (!earner) {
    throw new Error('Sandbox mobile user (+919876543216) not found');
  }
  console.log(`Target Mobile Earner: "${earner.name}" (${earner._id}, Mobile: ${earner.mobile})`);

  // 4. Clean up previous [ANDROID TEST] tasks
  const deleted = await Task.deleteMany({
    title: { $regex: /^\\[ANDROID TEST\\]/i },
  });
  console.log(`Cleaned up ${deleted.deletedCount} previous Android test tasks.`);

  // 5. Create Task 1: External Article Task (30s, 10 PTS)
  const articleTask = await Task.create({
    campaignId: campaign._id,
    title: '[ANDROID TEST] Read Security Best Practices (External Article)',
    description: 'Read security best practices on Wikipedia. Return to app after 30 seconds to claim 10 promotional points.',
    category: 'ARTICLE_READ',
    verificationMethod: 'FIRST_PARTY_ACTION',
    rewardPoints: 10,
    totalCap: 100,
    dailyCapPerUser: 5,
    dwellTimeSeconds: 30,
    articleReadConfig: {
      articleTitle: 'Computer Security Fundamentals',
      articleContent: 'Computer security, cybersecurity, digital security or information technology security (IT security) is the protection of computer systems and networks from attack by malicious actors that may result in unauthorized information disclosure, theft of, or damage to hardware, software, or data, as well as from the disruption or misdirection of the services they provide.\n\nThe field has become increasingly significant due to the expanding reliance on computer systems, the Internet, and wireless network standards such as Bluetooth and Wi-Fi, and due to the growth of smart devices.',
      sourceUrl: 'https://en.wikipedia.org/wiki/Computer_security',
      minReadDurationSeconds: 30,
      minScrollPercentage: 80,
    },
    createdBy: admin._id,
    status: 'PUBLISHED',
  });
  console.log(`Created & Published Task 1 (Article): "${articleTask.title}" (ID: ${articleTask._id})`);

  // 6. Create Task 2: YouTube External-Link Task (30s, 10 PTS)
  const youtubeTask = await Task.create({
    campaignId: campaign._id,
    title: '[ANDROID TEST] Watch Cyber Hygiene Basics (YouTube)',
    description: 'Watch official cyber hygiene tips on YouTube. Return to app after 30 seconds to claim 10 promotional points.',
    category: 'YOUTUBE_LEARNING',
    verificationMethod: 'FIRST_PARTY_ACTION',
    rewardPoints: 10,
    totalCap: 100,
    dailyCapPerUser: 5,
    dwellTimeSeconds: 30,
    youtubeLearningConfig: {
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
      videoTitle: 'Cyber Hygiene Basics',
      requiredDurationSeconds: 30,
      instructions: 'Tap Open in YouTube to view the lesson. Stay for at least 30 seconds, then return to claim your promotional reward.',
      educationalNotice: 'Educational video learning. Rewards are awarded strictly for verified elapsed engagement.',
    },
    createdBy: admin._id,
    status: 'PUBLISHED',
  });
  console.log(`Created & Published Task 2 (YouTube): "${youtubeTask.title}" (ID: ${youtubeTask._id})`);

  // 7. Verify Feed Visibility for Krishna
  const feedTasks = await Task.find({
    status: 'PUBLISHED',
    _id: { $in: [articleTask._id, youtubeTask._id] },
    $or: [
      { 'targeting.assignedUserIds': { $size: 0 } },
      { 'targeting.assignedUserIds': earner._id },
    ],
  }).lean();

  if (feedTasks.length !== 2) {
    throw new Error(`Feed visibility check failed: expected 2 tasks, found ${feedTasks.length}`);
  }
  console.log(`[PASS] Both tasks are eligible and visible in feed for mobile user ${earner.mobile}.`);

  // 8. Record Earner's Starting Promotional Balance
  const completions = await TaskCompletion.find({ userId: earner._id, status: 'VERIFIED' }).lean();
  const startingPromotionalPoints = completions.reduce((acc, c) => acc + (c.rewardPoints || 0), 0);
  const ledgerEntries = await WalletLedgerEntry.find({ userId: earner._id, status: 'CONFIRMED' }).lean();

  console.log('\n======================================================');
  console.log('ACCEPTANCE TESTING PREPARATION COMPLETE:');
  console.log('======================================================');
  console.log(`Earner Mobile:           ${earner.mobile} (${earner.name})`);
  console.log(`Starting Points Balance: ${startingPromotionalPoints} PTS`);
  console.log(`Verified Completions:    ${completions.length}`);
  console.log(`Ledger Entries:          ${ledgerEntries.length}`);
  console.log('\nTASKS READY FOR ANDROID PHONE TESTING:');
  console.log(`1. ARTICLE TASK:`);
  console.log(`   Title:    "${articleTask.title}"`);
  console.log(`   Task ID:  ${articleTask._id}`);
  console.log(`   URL:      ${articleTask.articleReadConfig?.sourceUrl}`);
  console.log(`   Duration: 30 seconds`);
  console.log(`   Reward:   10 promotional points`);
  console.log(`2. YOUTUBE TASK:`);
  console.log(`   Title:    "${youtubeTask.title}"`);
  console.log(`   Task ID:  ${youtubeTask._id}`);
  console.log(`   URL:      ${youtubeTask.youtubeLearningConfig?.youtubeUrl}`);
  console.log(`   Duration: 30 seconds`);
  console.log(`   Reward:   10 promotional points`);
  console.log('======================================================\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
