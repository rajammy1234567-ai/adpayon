import mongoose, { Types } from 'mongoose';
import crypto from 'node:crypto';
import { Task } from '../models/Task';
import { Campaign } from '../models/Campaign';
import { User } from '../models/User';
import { TaskAssignment } from '../models/TaskAssignment';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://adpayon_sandbox_app:iVnmAHoCRlvKXHvc@adpayon-dev.3tcl8bz.mongodb.net/adpayon_sandbox?retryWrites=true&w=majority';

async function createPhoneTestTask() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB database:', mongoose.connection.name);

  // 1. Find earner Krishna
  const earnerUser = await User.findOne({ mobile: '+919876543216' });
  if (!earnerUser) {
    throw new Error('Earner user Krishna (+919876543216) not found');
  }
  console.log(`Found earner user: ${earnerUser.name} (${earnerUser._id.toString()})`);

  // 2. Find or create Campaign
  let campaign = await Campaign.findOne({ status: 'ACTIVE' });
  if (!campaign) {
    campaign = await Campaign.create({
      name: 'Sandbox Active Campaign',
      advertiserName: 'ADPAYON QA',
      status: 'ACTIVE',
      isSandbox: true,
      advertiserBudgetPaise: 1000000,
      spentBudgetPaise: 0,
      authorizedAgreementRef: 'AGR-SANDBOX-PHONE-TEST',
      webhookSecret: crypto.randomBytes(20).toString('hex'),
      createdBy: earnerUser._id,
    });
  }
  console.log(`Using campaign: ${campaign.name} (${campaign._id.toString()})`);

  // 3. Create the Task
  const taskTitle = '[PHONE TEST] Away Timer 30 Seconds';
  const task = await Task.create({
    campaignId: campaign._id,
    title: taskTitle,
    description: 'External article engagement task for phone timer verification. Stay away in browser for 30 seconds total across intervals.',
    category: 'ARTICLE_READ',
    verificationMethod: 'FIRST_PARTY_ACTION',
    rewardPoints: 10,
    totalCap: 100,
    dailyCapPerUser: 5,
    dwellTimeSeconds: 30,
    articleReadConfig: {
      articleTitle: taskTitle,
      articleContent: 'Zero Trust is an essential cybersecurity paradigm where no user or device inside or outside the network is trusted by default. Strict verification is required for every access request.',
      sourceUrl: 'https://en.wikipedia.org/wiki/Zero_trust_security_model',
      minReadDurationSeconds: 30,
    },
    createdBy: earnerUser._id,
    status: 'PUBLISHED',
  });
  console.log(`Created Task: "${task.title}" (ID: ${task._id.toString()})`);

  // 4. Create TaskAssignment for Krishna
  const clickId = `click_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

  const assignment = await TaskAssignment.create({
    taskId: task._id,
    campaignId: campaign._id,
    userId: earnerUser._id,
    clickId,
    status: 'ASSIGNED',
    assignedAt: new Date(),
    expiresAt,
    dwellTimeAccumulatedSeconds: 0,
  });
  console.log(`Created TaskAssignment for Krishna: ID ${assignment._id.toString()} (Status: ${assignment.status})`);
  console.log('\nTask is ready for phone testing. Unstarted and unclaimed through API.');

  await mongoose.disconnect();
}

createPhoneTestTask().catch((err) => {
  console.error('Failed to create task:', err);
  process.exit(1);
});
