process.env.NODE_ENV = 'test';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import crypto from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { app } from '../src/app';
import {
  User,
  Campaign,
  Task,
  ArticleReadingSession,
} from '../src/models';
import { generateAccessToken } from '../src/services/tokenService';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from '../src/testUtils/dbIsolation';

describe('Phase 1: Task Management, Article & Quiz Lifecycle, Expiry and Anti-Tamper Tests', () => {
  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';

  const tracker = new TestOwnershipTracker();

  const runId = Math.floor(10000 + Math.random() * 90000);
  const adminMobile = `+917${runId}4001`;
  const user1Mobile = `+917${runId}4002`;

  let adminToken: string;
  let user1Token: string;

  let adminUser: any;
  let user1: any;
  let testCampaignId: string;

  async function getJson(res: any): Promise<any> {
    return (await res.json()) as any;
  }

  before(async () => {
    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      isSuiteBlocked = true;
      blockReason = isolation.reason || 'Database isolation not configured';
      console.warn(`\n[BLOCKED INTEGRATION TEST] Task Phase 1 Suite: ${blockReason}\n`);
      return;
    }

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    adminUser = await User.create({
      mobile: adminMobile,
      name: 'Phase1 Admin',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticAdminHash',
      role: 'ADMIN',
      status: 'ACTIVE',
      referralCode: `ADM${runId.toString().slice(0, 5)}`,
    });
    tracker.trackUser(adminUser._id, adminMobile);
    adminToken = generateAccessToken({
      userId: adminUser._id.toString(),
      role: adminUser.role,
      mobile: adminUser.mobile,
    });

    user1 = await User.create({
      mobile: user1Mobile,
      name: 'Phase1 Earner',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticEarnerHash',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `ERN${runId.toString().slice(0, 5)}`,
      metadata: { kycStatus: 'VERIFIED', language: 'en' },
    });
    tracker.trackUser(user1._id, user1Mobile);
    user1Token = generateAccessToken({
      userId: user1._id.toString(),
      role: user1.role,
      mobile: user1.mobile,
    });

    const campaign = await Campaign.create({
      name: 'Phase 1 Education Campaign',
      advertiserName: 'Edutech India',
      advertiserBudgetPaise: 5000000,
      authorizedAgreementRef: 'AGR-PHASE1-001',
      webhookSecret: crypto.randomBytes(32).toString('hex'),
      status: 'ACTIVE',
      createdBy: adminUser._id,
    });
    tracker.trackCampaign(campaign._id);
    testCampaignId = campaign._id.toString();
  });

  after(async () => {
    if (isSuiteBlocked) return;
    await tracker.safeCleanup();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('1. Admin creates an ARTICLE_READ task with quiz, dwell time, and future expiry', async () => {
    if (isSuiteBlocked) return;

    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const res = await fetch(`${baseUrl}/api/admin/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        campaignId: testCampaignId,
        title: 'Learn About Sustainable Micro-Investing',
        description: 'Read the short educational article and answer one simple quiz question.',
        instructions: 'Read through the guide and answer the verification question.',
        category: 'ARTICLE_READ',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 40,
        dwellTimeSeconds: 30,
        totalCap: 500,
        dailyCapPerUser: 1,
        expiresAt: futureDate,
        articleReadConfig: {
          articleTitle: 'Sustainable Micro-Investing Basics',
          articleContent: 'Micro-investing allows individuals to invest small sums of money regularly. By compounding returns over time, even modest contributions can grow significantly into substantial savings.',
          minReadDurationSeconds: 15,
          minScrollPercentage: 60,
          sessionTimeoutSeconds: 600,
          comprehensionQuiz: {
            enabled: true,
            question: 'What is the main benefit of micro-investing mentioned in the article?',
            options: [
              'Guaranteed lottery wins',
              'Compounding small regular investments over time',
              'Avoiding all banking regulations',
              'Eliminating the need to work',
            ],
            correctOptionIndex: 1,
            maxAttempts: 3,
          },
        },
      }),
    });

    assert.equal(res.status, 201);
    const json = await getJson(res);
    assert.equal(json.success, true);
    assert.equal(json.data.title, 'Learn About Sustainable Micro-Investing');
    assert.equal(json.data.status, 'DRAFT');
    assert.equal(json.data.category, 'ARTICLE_READ');
    assert.ok(json.data.expiresAt);
    tracker.trackTask(json.data.id);
  });

  it('2. Prevents publishing an incomplete ARTICLE_READ task', async () => {
    if (isSuiteBlocked) return;

    // Create incomplete draft directly
    const incompleteTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Incomplete Draft Task',
      description: 'Draft with empty content',
      category: 'ARTICLE_READ',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 20,
      status: 'DRAFT',
      totalCap: 100,
      dwellTimeSeconds: 15,
      createdBy: adminUser._id,
      articleReadConfig: {
        articleTitle: 'Too Short',
        articleContent: 'Too short', // Under 30 chars
        minReadDurationSeconds: 5,
        minScrollPercentage: 50,
      },
    });
    tracker.trackTask(incompleteTask._id);

    const publishRes = await fetch(`${baseUrl}/api/admin/tasks/${incompleteTask._id}/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });

    assert.equal(publishRes.status, 400);
    const publishJson = await getJson(publishRes);
    assert.equal(publishJson.success, false);
    assert.equal(publishJson.code, 'INCOMPLETE_TASK_CONFIG');
  });

  it('3. Successfully publishes complete task and allows user to fetch it in feed', async () => {
    if (isSuiteBlocked) return;

    const validTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Valid Complete Article',
      description: 'Fully configured article task ready for earners',
      category: 'ARTICLE_READ',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 35,
      status: 'DRAFT',
      totalCap: 200,
      dwellTimeSeconds: 15,
      createdBy: adminUser._id,
      expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
      articleReadConfig: {
        articleTitle: 'Personal Finance Fundamentals',
        articleContent: 'Budgeting is the foundation of financial health. Tracking expenses helps identify wasteful habits and allows you to allocate money toward emergency funds and long-term investments.',
        minReadDurationSeconds: 5,
        minScrollPercentage: 60,
        sessionTimeoutSeconds: 600,
        comprehensionQuiz: {
          enabled: true,
          question: 'What is the foundation of financial health according to the article?',
          options: ['Budgeting', 'Gambling', 'Ignoring bank accounts', 'High-interest loans'],
          correctOptionIndex: 0,
          maxAttempts: 3,
        },
      },
    });
    tracker.trackTask(validTask._id);

    // Publish
    const pubRes = await fetch(`${baseUrl}/api/admin/tasks/${validTask._id}/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });
    assert.equal(pubRes.status, 200);
    const pubJson = await getJson(pubRes);
    assert.equal(pubJson.success, true);
    assert.equal(pubJson.data.status, 'PUBLISHED');

    // User feed should contain it
    const feedRes = await fetch(`${baseUrl}/api/tasks/feed`, {
      headers: {
        Authorization: `Bearer ${user1Token}`,
      },
    });
    assert.equal(feedRes.status, 200);
    const feedJson = await getJson(feedRes);
    assert.equal(feedJson.success, true);
    const found = feedJson.data.tasks.find((t: any) => t.id === validTask._id.toString());
    assert.ok(found, 'Task should appear in user feed');
    assert.equal(found.category, 'ARTICLE_READ');
    assert.ok(found.articleReadConfig);
    assert.ok(found.expiresAt);
  });

  it('4. Admin expires task: task is ARCHIVED and omitted from user feed', async () => {
    if (isSuiteBlocked) return;

    const taskToExpire = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Task To Be Expired',
      description: 'Will be expired by administrator',
      category: 'ARTICLE_READ',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 25,
      status: 'PUBLISHED',
      totalCap: 100,
      dwellTimeSeconds: 15,
      createdBy: adminUser._id,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      articleReadConfig: {
        articleTitle: 'Expiring Soon',
        articleContent: 'This task will be archived and will immediately disappear from feeds.',
        minReadDurationSeconds: 5,
        minScrollPercentage: 50,
      },
    });
    tracker.trackTask(taskToExpire._id);

    // Expire via admin endpoint
    const expRes = await fetch(`${baseUrl}/api/admin/tasks/${taskToExpire._id}/expire`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });
    assert.equal(expRes.status, 200);
    const expJson = await getJson(expRes);
    assert.equal(expJson.success, true);
    assert.equal(expJson.data.status, 'ARCHIVED');

    // Feed check: user feed must NOT contain the expired task
    const feedRes = await fetch(`${baseUrl}/api/tasks/feed`, {
      headers: {
        Authorization: `Bearer ${user1Token}`,
      },
    });
    const feedJson = await getJson(feedRes);
    const found = feedJson.data.tasks.find((t: any) => t.id === taskToExpire._id.toString());
    assert.equal(found, undefined, 'Expired task must not appear in user feed');

    // Attempting to start the expired task directly must return 400 TASK_EXPIRED
    const startRes = await fetch(`${baseUrl}/api/tasks/${taskToExpire._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(startRes.status, 400);
    const startJson = await getJson(startRes);
    assert.equal(startJson.code, 'TASK_EXPIRED');
  });

  it('5. User completes Article & Quiz: wrong answer rejects, correct answer passes, reward granted exactly once', async () => {
    if (isSuiteBlocked) return;

    const quizTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Quiz Verification Article',
      description: 'Read article and take single-question verification quiz',
      category: 'ARTICLE_READ',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 50,
      status: 'PUBLISHED',
      totalCap: 100,
      dwellTimeSeconds: 5,
      createdBy: adminUser._id,
      articleReadConfig: {
        articleTitle: 'How Compound Interest Works',
        articleContent: 'Compound interest is interest calculated on the initial principal, which also includes all of the accumulated interest from previous periods. Albert Einstein famously called it the eighth wonder of the world.',
        minReadDurationSeconds: 5,
        minScrollPercentage: 70,
        sessionTimeoutSeconds: 600,
        comprehensionQuiz: {
          enabled: true,
          question: 'What is compound interest calculated on?',
          options: [
            'Only the initial principal',
            'Initial principal plus accumulated interest',
            'Random stock market fluctuations',
            'Government tax refunds',
          ],
          correctOptionIndex: 1,
          maxAttempts: 3,
        },
      },
    });
    tracker.trackTask(quizTask._id);

    // Step 1: Start reading session
    const startRes = await fetch(`${baseUrl}/api/tasks/${quizTask._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(startRes.status, 200);
    const startJson = await getJson(startRes);
    const sessionId = startJson.data.sessionId;
    assert.ok(sessionId);
    assert.equal(startJson.data.hasQuiz, true);
    // Correct option index MUST NOT be disclosed
    assert.equal(startJson.data.comprehensionQuiz.correctOptionIndex, undefined);

    // Step 2: Simulate legitimate reading dwell & scroll telemetry
    await ArticleReadingSession.collection.updateOne(
      { sessionId },
      {
        $set: {
          createdAt: new Date(Date.now() - 10000),
          lastProgressAt: new Date(Date.now() - 5000),
        },
      }
    );

    const progRes = await fetch(`${baseUrl}/api/tasks/${quizTask._id}/article-session/progress`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        scrollPercentage: 85,
        appState: 'active',
        readingDeltaSeconds: 5,
      }),
    });
    assert.equal(progRes.status, 200);

    // Step 3: Submit INCORRECT quiz answer
    const wrongQuizRes = await fetch(`${baseUrl}/api/tasks/${quizTask._id}/article-session/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        selectedOptionIndex: 0, // Wrong option
      }),
    });
    assert.equal(wrongQuizRes.status, 200);
    const wrongQuizJson = await getJson(wrongQuizRes);
    assert.equal(wrongQuizJson.success, true);
    assert.equal(wrongQuizJson.data.isCorrect, false);
    assert.equal(wrongQuizJson.data.attemptsRemaining, 2);

    // Step 4: Submit CORRECT quiz answer
    const correctQuizRes = await fetch(`${baseUrl}/api/tasks/${quizTask._id}/article-session/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        selectedOptionIndex: 1, // Correct option
      }),
    });
    assert.equal(correctQuizRes.status, 200);
    const correctQuizJson = await getJson(correctQuizRes);
    assert.equal(correctQuizJson.success, true);
    assert.equal(correctQuizJson.data.isCorrect, true);

    // Step 5: Claim Reward
    const claimRes = await fetch(`${baseUrl}/api/tasks/${quizTask._id}/article-session/claim`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(claimRes.status, 200);
    const claimJson = await getJson(claimRes);
    assert.equal(claimJson.success, true);
    assert.equal(claimJson.data.status, 'VERIFIED');
    assert.equal(claimJson.data.rewardPoints, 50);

    // Step 6: Duplicate Claim must be rejected (idempotency & tamper protection)
    const dupClaimRes = await fetch(`${baseUrl}/api/tasks/${quizTask._id}/article-session/claim`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(dupClaimRes.status, 400);
    const dupClaimJson = await getJson(dupClaimRes);
    assert.equal(dupClaimJson.success, false);
    assert.equal(dupClaimJson.code, 'TASK_ALREADY_COMPLETED');
  });
});
