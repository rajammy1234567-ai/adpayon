import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import mongoose, { Types } from 'mongoose';

// Resolve staging environment if present
const possibleStagingEnvPaths = [
  path.resolve(process.cwd(), '.env.client_staging'),
  path.resolve(process.cwd(), 'apps/api/.env.client_staging'),
  path.resolve(__dirname, '../../.env.client_staging'),
  path.resolve(__dirname, '../../../.env.client_staging'),
];

for (const envPath of possibleStagingEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    process.env.ENV_FILE = envPath;
    break;
  }
}

import { Task, Campaign, User } from '../models';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface DemoTaskDefinition {
  title: string;
  description: string;
  category: 'ARTICLE_READ' | 'VIDEO_WATCH' | 'APP_INSTALL';
  verificationMethod: 'FIRST_PARTY_ACTION';
  rewardPoints: number;
  totalCap: number;
  dailyCapPerUser: number;
  dwellTimeSeconds: number;
  articleReadConfig?: any;
  videoWatchConfig?: any;
  appInstallConfig?: any;
}

export const DEMO_CAMPAIGN_NAME = '[DEMO] ADPAYON Client Staging Showcase';

export const DEMO_TASK_DEFINITIONS: DemoTaskDefinition[] = [
  // 1. Native In-App Article Reading Task
  {
    title: '[DEMO] Financial Literacy: Digital Payments & 2FA Guide (+25 PTS)',
    description:
      'Read our complete guide to digital payment security, two-factor authentication, and safe online transactions. Complete the comprehension check to claim 25 promotional points.',
    category: 'ARTICLE_READ',
    verificationMethod: 'FIRST_PARTY_ACTION',
    rewardPoints: 25,
    totalCap: 500,
    dailyCapPerUser: 1,
    dwellTimeSeconds: 15,
    articleReadConfig: {
      articleTitle: 'Digital Payments Security & Multi-Factor Verification',
      articleContent:
        'Digital financial infrastructure in India processes billions of transactions monthly through the Unified Payments Interface (UPI). To ensure safety across every transaction, always verify the recipient virtual payment address (VPA) before entering your secret UPI PIN.\n\nTwo-Factor Authentication (2FA) adds a critical extra layer of defense beyond passwords. The first factor is something you know (your master password or passkey), while the second is something you have (such as a time-based one-time password or cryptographic hardware token). Never disclose OTP codes, PINs, or recovery phrases to anyone claiming to represent customer care, banks, or lottery portals.\n\nAlways monitor your account statements regularly and configure immediate SMS or push notification alerts for debit transactions.',
      minReadDurationSeconds: 15,
      minScrollPercentage: 70,
      comprehensionQuiz: {
        question: 'Which of the following is safe to share with technical support?',
        options: ['UPI Secret PIN', 'One-Time Password (OTP)', 'Public Virtual Payment Address (VPA)', 'Debit Card CVV'],
        correctOptionIndex: 2,
      },
    },
  },

  // 2. External Partner Article with Return Detection & Timer
  {
    title: '[DEMO] External Partner: Zero Trust Security Architecture (+30 PTS)',
    description:
      'Learn about zero trust enterprise security on an external partner portal. Return to AdPayOn after 20 seconds of verified engagement to claim your promotional reward.',
    category: 'ARTICLE_READ',
    verificationMethod: 'FIRST_PARTY_ACTION',
    rewardPoints: 30,
    totalCap: 500,
    dailyCapPerUser: 1,
    dwellTimeSeconds: 20,
    articleReadConfig: {
      articleTitle: 'Zero Trust Security Model Architecture Overview',
      articleContent:
        'Zero trust architecture is an enterprise security model based on the principle of "never trust, always verify". Even devices located inside an organization\'s network perimeter are treated as untrusted until verified.\n\nKey pillars include explicit identity verification, least-privilege access controls, continuous micro-segmentation, and end-to-end telemetry auditing.',
      sourceUrl: 'https://en.wikipedia.org/wiki/Zero_trust_security_model',
      minReadDurationSeconds: 20,
      minScrollPercentage: 80,
    },
  },

  // 3. App Install: Scoped Package Presence (INSTALL_ONLY)
  {
    title: '[DEMO] SFARMART24: Grocery & Essentials (+25 PTS)',
    description:
      'Discover SFARMART24 on Google Play. Installation is automatically verified using scoped package presence upon your return to AdPayOn. No feedback or claim forms required.',
    category: 'APP_INSTALL',
    verificationMethod: 'FIRST_PARTY_ACTION',
    rewardPoints: 25,
    totalCap: 500,
    dailyCapPerUser: 1,
    dwellTimeSeconds: 0,
    appInstallConfig: {
      appName: 'SFARMART24',
      packageName: 'com.sfarmart.userapp',
      platform: 'ANDROID',
      storeUrl: 'https://play.google.com/store/apps/details?id=com.sfarmart.userapp',
      attributionMethod: 'CLIENT_PACKAGE_PRESENCE',
      conversionEvent: 'INSTALL_ONLY',
    },
  },

  // 4. Native In-App Video Watch Task (Open-Source Animation Sample)
  {
    title: '[DEMO] Video Player: Open-Source Animation Sample (Big Buck Bunny) (+20 PTS)',
    description:
      'Watch this open-source demonstration video clip (Blender Foundation / Creative Commons) to test video playback, seek prevention, timer tracking, and comprehension quiz verification.',
    category: 'VIDEO_WATCH',
    verificationMethod: 'FIRST_PARTY_ACTION',
    rewardPoints: 20,
    totalCap: 500,
    dailyCapPerUser: 1,
    dwellTimeSeconds: 15,
    videoWatchConfig: {
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      videoDurationSeconds: 60,
      requiredWatchSeconds: 15,
      allowSeeking: false,
      sessionTimeoutSeconds: 600,
      completionPolicy: 'MINIMUM_DURATION',
      comprehensionQuiz: {
        question: 'Which animal is the central protagonist in the Big Buck Bunny animation sample?',
        options: [
          'A large, gentle rabbit (Big Buck Bunny)',
          'A tiny blue hummingbird',
          'A desert camel',
          'A deep sea octopus',
        ],
        correctOptionIndex: 0,
      },
    },
  },
];

/**
 * Idempotently seeds the demo campaign and showcase demo tasks on staging.
 * Does not duplicate campaigns or tasks across repeated runs.
 */
export async function seedStagingDemoTasks(dryRun = false) {
  console.log('========================================================');
  console.log(`STAGING DEMO TASK SEED (${dryRun ? 'DRY RUN' : 'EXECUTE'})`);
  console.log('========================================================\n');

  if (dryRun) {
    console.log('[DRY RUN] Target Campaign:', DEMO_CAMPAIGN_NAME);
    console.log(`[DRY RUN] Tasks to seed (${DEMO_TASK_DEFINITIONS.length}):`);
    DEMO_TASK_DEFINITIONS.forEach((t, i) => {
      console.log(`  ${i + 1}. [${t.category}] ${t.title} (${t.rewardPoints} PTS)`);
      if (t.articleReadConfig?.sourceUrl) {
        console.log(`     -> External Article: ${t.articleReadConfig.sourceUrl} (Dwell: ${t.dwellTimeSeconds}s)`);
      }
      if (t.appInstallConfig?.packageName) {
        console.log(`     -> App Install: ${t.appInstallConfig.packageName} (Event: ${t.appInstallConfig.conversionEvent})`);
      }
      if (t.videoWatchConfig?.videoUrl) {
        console.log(`     -> Video Player: ${t.videoWatchConfig.requiredWatchSeconds}s required`);
      }
    });
    console.log('\n[DRY RUN] Complete. No database writes performed.');
    return;
  }

  // Find or create admin user for createdBy attribution
  let admin = await User.findOne({ role: 'ADMIN', status: 'ACTIVE' });
  if (!admin) {
    admin = await User.findOne({ role: 'ADMIN' });
  }
  const adminId = admin?._id || new Types.ObjectId();

  // 1. Idempotently find or create Campaign
  let campaign = await Campaign.findOne({ name: DEMO_CAMPAIGN_NAME });
  if (!campaign) {
    campaign = await Campaign.create({
      name: DEMO_CAMPAIGN_NAME,
      advertiserName: 'AdPayOn Showcase Team',
      description: 'Dedicated demonstration campaign for client staging reviews',
      status: 'ACTIVE',
      isSandbox: false,
      advertiserBudgetPaise: 1000000,
      spentBudgetPaise: 0,
      authorizedAgreementRef: 'AGR-STAGING-DEMO-2026',
      webhookSecret: crypto.randomBytes(32).toString('hex'),
      createdBy: adminId,
    });
    console.log(`[SEED] Created campaign: "${campaign.name}" (${campaign._id})`);
  } else {
    if (campaign.status !== 'ACTIVE') {
      campaign.status = 'ACTIVE';
      await campaign.save();
    }
    console.log(`[SEED] Using existing campaign: "${campaign.name}" (${campaign._id})`);
  }

  // 2. Idempotently upsert each demo task
  for (const taskDef of DEMO_TASK_DEFINITIONS) {
    const existing = await Task.findOne({
      campaignId: campaign._id,
      title: taskDef.title,
    });

    if (existing) {
      existing.description = taskDef.description;
      existing.category = taskDef.category;
      existing.verificationMethod = taskDef.verificationMethod;
      existing.rewardPoints = taskDef.rewardPoints;
      existing.totalCap = taskDef.totalCap;
      existing.dailyCapPerUser = taskDef.dailyCapPerUser;
      existing.dwellTimeSeconds = taskDef.dwellTimeSeconds;
      existing.articleReadConfig = taskDef.articleReadConfig;
      existing.videoWatchConfig = taskDef.videoWatchConfig;
      existing.appInstallConfig = taskDef.appInstallConfig;
      existing.status = 'PUBLISHED';
      await existing.save();
      console.log(`[SEED] Updated existing task: "${taskDef.title}" (${existing._id})`);
    } else {
      const created = await Task.create({
        campaignId: campaign._id,
        ...taskDef,
        completionsCount: 0,
        status: 'PUBLISHED',
        createdBy: adminId,
      });
      console.log(`[SEED] Created new task: "${taskDef.title}" (${created._id})`);
    }
  }

  console.log('\n[SEED COMPLETE] All demo tasks are idempotently synced and PUBLISHED.');
}

// CLI runner when executed directly
if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  if (isDryRun) {
    seedStagingDemoTasks(true).catch(console.error);
  } else {
    mongoose
      .connect(env.MONGODB_URI!, { dbName: env.MONGODB_DB_NAME })
      .then(() => seedStagingDemoTasks(false))
      .then(() => mongoose.disconnect())
      .catch((err) => {
        console.error('[SEED FATAL ERROR]:', err);
        process.exit(1);
      });
  }
}

