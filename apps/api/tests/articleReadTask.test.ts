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
  TaskAssignment,
  TaskCompletion,
  ArticleReadingSession,
  VerificationEvidence,
  TaskEvent,
} from '../src/models';
import { generateAccessToken } from '../src/services/tokenService';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from '../src/testUtils/dbIsolation';

describe('Phase 10.4: Article Reading Task End-to-End & Security Tests', () => {
  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';

  const tracker = new TestOwnershipTracker();

  const runId = Math.floor(10000 + Math.random() * 90000);
  const adminMobile = `+917${runId}3001`;
  const user1Mobile = `+917${runId}3002`;
  const user2Mobile = `+917${runId}3003`;

  let adminToken: string;
  let user1Token: string;
  let user2Token: string;

  let adminUser: any;
  let user1: any;
  let user2: any;
  let testCampaignId: string;

  async function getJson(res: any): Promise<any> {
    return (await res.json()) as any;
  }

  before(async () => {
    // 1. Strict Database Isolation
    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      isSuiteBlocked = true;
      blockReason = isolation.reason || 'Database isolation not configured';
      console.warn(`\n[BLOCKED INTEGRATION TEST] Article Read Suite: ${blockReason}\n`);
      return;
    }

    // 2. Start HTTP server
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // 3. Setup test admin and users
    adminUser = await User.create({
      mobile: adminMobile,
      name: 'Article Admin',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashAdmin123',
      role: 'ADMIN',
      status: 'ACTIVE',
      referralCode: `AAD${runId.toString().slice(0, 5)}`,
    });
    tracker.trackUser(adminUser._id, adminMobile);
    adminToken = generateAccessToken({
      userId: adminUser._id.toString(),
      role: adminUser.role,
      mobile: adminUser.mobile,
    });

    user1 = await User.create({
      mobile: user1Mobile,
      name: 'Article Reader One',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashUser1',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `AR1${runId.toString().slice(0, 5)}`,
      metadata: { kycStatus: 'VERIFIED', language: 'en' },
    });
    tracker.trackUser(user1._id, user1Mobile);
    user1Token = generateAccessToken({
      userId: user1._id.toString(),
      role: user1.role,
      mobile: user1.mobile,
    });

    user2 = await User.create({
      mobile: user2Mobile,
      name: 'Article Reader Two',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashUser2',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `AR2${runId.toString().slice(0, 5)}`,
      metadata: { kycStatus: 'VERIFIED', language: 'en' },
    });
    tracker.trackUser(user2._id, user2Mobile);
    user2Token = generateAccessToken({
      userId: user2._id.toString(),
      role: user2.role,
      mobile: user2.mobile,
    });

    // 4. Create active campaign for article tasks
    const campaign = await Campaign.create({
      name: 'Article Reading Test Campaign',
      advertiserName: 'Digital Content Media',
      advertiserBudgetPaise: 2000000,
      authorizedAgreementRef: 'AGR-ARTICLE-READ-001',
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

  // Helper to create an article task
  async function createArticleTask(overrides: Partial<any> = {}) {
    const task = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: overrides.title || 'Read Sponsored Financial Insights',
      description: overrides.description || 'Read promotional financial guide to earn points',
      category: 'ARTICLE_READ',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: overrides.rewardPoints || 50,
      status: overrides.status || 'PUBLISHED',
      totalCap: overrides.totalCap || 100,
      completionsCount: overrides.completionsCount || 0,
      dailyCapPerUser: overrides.dailyCapPerUser || 10,
      dwellTimeSeconds: overrides.dwellTimeSeconds || 0,
      createdBy: adminUser._id,
      articleReadConfig: {
        articleTitle: overrides.articleTitle || 'Top Investment Strategies in 2026',
        articleContent:
          overrides.articleContent ||
          'Paragraph 1: Diversification is critical in modern portfolio theory.\n\nParagraph 2: Asset allocation determines over 90% of returns over extended horizons.\n\nParagraph 3: Rebalance systematically every quarter.',
        sourceUrl: overrides.sourceUrl || 'https://adpayon.com/insights/investing',
        minReadDurationSeconds: overrides.minReadDurationSeconds || 5, // minimum allowed by schema is 5
        minScrollPercentage: overrides.minScrollPercentage || 80,
        sessionTimeoutSeconds: overrides.sessionTimeoutSeconds || 600,
        comprehensionQuiz: overrides.comprehensionQuiz || {
          enabled: true,
          question: 'What determines over 90% of returns over extended horizons?',
          options: ['Market timing', 'Asset allocation', 'Meme stock picking', 'Day trading'],
          correctOptionIndex: 1,
          maxAttempts: 3,
        },
      },
    });
    tracker.trackTask(task._id);
    return task;
  }

  // Helper to simulate legitimate reading qualification on a session
  async function advanceSessionToQualified(sessionId: string, readSeconds = 5.0, scroll = 90) {
    await ArticleReadingSession.collection.updateOne(
      { sessionId },
      {
        $set: {
          accumulatedReadSeconds: readSeconds,
          maxScrollPercentage: scroll,
          lastScrollPercentage: scroll,
          createdAt: new Date(Date.now() - (readSeconds + 5) * 1000),
          lastProgressAt: new Date(),
        },
      }
    );
  }

  // 1. Valid Complete Reading Session Flow
  it('1. Completes valid article reading session with telemetry, quiz, and reward verification', async () => {
    if (isSuiteBlocked) return;

    const task = await createArticleTask({ minReadDurationSeconds: 5, minScrollPercentage: 80 });

    // Step A: Start session
    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(startRes.status, 200);
    const startJson = await getJson(startRes);
    assert.equal(startJson.success, true);
    assert.ok(startJson.data.sessionId);
    assert.equal(startJson.data.hasQuiz, true);
    // CRITICAL SECURITY: correctOptionIndex must never be exposed to client
    assert.equal(startJson.data.quizCorrectOptionIndex, undefined);
    assert.equal(startJson.data.comprehensionQuiz?.correctOptionIndex, undefined);

    const sessionId = startJson.data.sessionId;

    // Step B: Backdate baseline and submit progress telemetry
    await ArticleReadingSession.collection.updateOne(
      { sessionId },
      {
        $set: {
          createdAt: new Date(Date.now() - 10000),
          lastProgressAt: new Date(Date.now() - 6000),
        },
      }
    );

    const progRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/progress`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        scrollPercentage: 90,
        appState: 'active',
        readingDeltaSeconds: 5,
      }),
    });
    assert.equal(progRes.status, 200);
    const progJson = await getJson(progRes);
    assert.equal(progJson.success, true);
    assert.equal(progJson.data.maxScrollPercentage, 90);
    assert.ok(progJson.data.accumulatedReadSeconds >= 5);

    // Step C: Submit correct quiz answer
    const quizRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        selectedOptionIndex: 1, // Correct answer
      }),
    });
    assert.equal(quizRes.status, 200);
    const quizJson = await getJson(quizRes);
    assert.equal(quizJson.success, true);
    assert.equal(quizJson.data.correct, true);
    assert.equal(quizJson.data.isQualified, true);

    // Step D: Verify reward
    const verifyRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(verifyRes.status, 200);
    const verifyJson = await getJson(verifyRes);
    assert.equal(verifyJson.success, true);
    assert.equal(verifyJson.data.completion.rewardPoints, 50);

    // Database assertions
    const completion = await TaskCompletion.findById(verifyJson.data.completion.id);
    assert.ok(completion);
    assert.equal(completion.rewardPoints, 50);
    tracker.trackCompletion(completion._id);

    const evidence = await VerificationEvidence.findOne({ taskId: task._id, userId: user1._id });
    assert.ok(evidence);
    assert.equal(evidence.evidenceType, 'FIRST_PARTY_TELEMETRY');
    assert.equal((evidence.rawPayload as any)?.method, 'ARTICLE_READ_SESSION');

    const auditEvent = await TaskEvent.findOne({ taskId: task._id, eventType: 'VERIFY_SUCCESS' });
    assert.ok(auditEvent);

    const updatedTask = await Task.findById(task._id);
    assert.equal(updatedTask?.completionsCount, 1);
  });

  // 2. Insufficient Reading Duration Failure
  it('2. Rejects verification when reading duration is below configured minimum', async () => {
    if (isSuiteBlocked) return;

    const task = await createArticleTask({ minReadDurationSeconds: 15, minScrollPercentage: 80 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const startJson = await getJson(startRes);
    const sessionId = startJson.data.sessionId;

    // Send only 2s of read time
    await ArticleReadingSession.collection.updateOne(
      { sessionId },
      { $set: { lastProgressAt: new Date(Date.now() - 3000) } }
    );
    await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/progress`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        scrollPercentage: 100,
        appState: 'active',
        readingDeltaSeconds: 2,
      }),
    });

    // Submit quiz
    await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, selectedOptionIndex: 1 }),
    });

    // Attempt verify -> must fail closed
    const verifyRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(verifyRes.status, 400);
    const verifyJson = await getJson(verifyRes);
    const errCode = verifyJson.error?.code || verifyJson.code;
    assert.equal(errCode, 'INSUFFICIENT_READ_TIME');
  });

  // 3. Insufficient Scroll Coverage Failure
  it('3. Rejects verification when scroll coverage is below configured minimum', async () => {
    if (isSuiteBlocked) return;

    const task = await createArticleTask({ minReadDurationSeconds: 5, minScrollPercentage: 80 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const startJson = await getJson(startRes);
    const sessionId = startJson.data.sessionId;

    // Advance duration to 5s but scroll only to 30%
    await advanceSessionToQualified(sessionId, 5.0, 30);

    // Submit quiz
    await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, selectedOptionIndex: 1 }),
    });

    const verifyRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(verifyRes.status, 400);
    const verifyJson = await getJson(verifyRes);
    const errCode = verifyJson.error?.code || verifyJson.code;
    assert.equal(errCode, 'INSUFFICIENT_SCROLL_COVERAGE');
  });

  // 4. Instant Scroll-to-Bottom Abuse
  it('4. Rejects instant scroll-to-bottom without elapsed foreground read time', async () => {
    if (isSuiteBlocked) return;

    const task = await createArticleTask({ minReadDurationSeconds: 10, minScrollPercentage: 80 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const startJson = await getJson(startRes);
    assert.ok(startJson.data?.sessionId);
    const sessionId = startJson.data.sessionId;

    // Instant jump to 100% scroll with 0s delta
    await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/progress`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        scrollPercentage: 100,
        appState: 'active',
        readingDeltaSeconds: 0,
      }),
    });

    const verifyRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(verifyRes.status, 400);
    const verifyJson = await getJson(verifyRes);
    const errCode = verifyJson.error?.code || verifyJson.code;
    assert.equal(errCode, 'INSUFFICIENT_READ_TIME');
  });

  // 5. Backgrounded Reading Protection
  it('5. Does not accumulate foreground read time while application is backgrounded', async () => {
    if (isSuiteBlocked) return;

    const task = await createArticleTask({ minReadDurationSeconds: 5, minScrollPercentage: 50 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const startJson = await getJson(startRes);
    const sessionId = startJson.data.sessionId;

    // Report telemetry while in background
    const bgRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/progress`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        scrollPercentage: 60,
        appState: 'background',
        readingDeltaSeconds: 10, // Attempted 10s accumulation in background
      }),
    });
    const bgJson = await getJson(bgRes);
    assert.equal(bgJson.data.accumulatedReadSeconds, 0); // No foreground credit

    const verifyRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(verifyRes.status, 400);
    const verifyJson = await getJson(verifyRes);
    const errCode = verifyJson.error?.code || verifyJson.code;
    assert.equal(errCode, 'INSUFFICIENT_READ_TIME');
  });

  // 6. Overlapping Session Protection / Idempotency
  it('6. Re-uses existing active session idempotently without double-counting', async () => {
    if (isSuiteBlocked) return;

    const task = await createArticleTask({ minReadDurationSeconds: 5 });

    // Start 1
    const res1 = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const json1 = await getJson(res1);
    const sessionId1 = json1.data.sessionId;

    // Start 2 -> must return identical sessionId
    const res2 = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const json2 = await getJson(res2);
    assert.equal(json2.data.sessionId, sessionId1);

    const count = await ArticleReadingSession.countDocuments({ taskId: task._id, userId: user1._id });
    assert.equal(count, 1);
  });

  // 7. Wrong Quiz Answer Rejection
  it('7. Rejects incorrect quiz answer and prevents reward verification', async () => {
    if (isSuiteBlocked) return;

    const task = await createArticleTask({ minReadDurationSeconds: 5 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const startJson = await getJson(startRes);
    const sessionId = startJson.data.sessionId;

    // Satisfy read time and scroll
    await advanceSessionToQualified(sessionId, 5.0, 90);

    // Submit wrong answer
    const quizRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        selectedOptionIndex: 0, // Wrong answer
      }),
    });
    assert.equal(quizRes.status, 200);
    const quizJson = await getJson(quizRes);
    assert.equal(quizJson.data.correct, false);
    assert.equal(quizJson.data.isQualified, false);

    // Attempt verify -> fails
    const verifyRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(verifyRes.status, 400);
    const verifyJson = await getJson(verifyRes);
    const errCode = verifyJson.error?.code || verifyJson.code;
    assert.equal(errCode, 'QUIZ_NOT_PASSED');
  });

  // 8. Quiz Attempt Limits and Brute-Force Protection
  it('8. Locks comprehension quiz after exhausting configured max attempts', async () => {
    if (isSuiteBlocked) return;

    const task = await createArticleTask({
      minReadDurationSeconds: 5,
      comprehensionQuiz: {
        enabled: true,
        question: 'What is 2+2?',
        options: ['3', '4', '5'],
        correctOptionIndex: 1,
        maxAttempts: 2,
      },
    });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const startJson = await getJson(startRes);
    const sessionId = startJson.data.sessionId;

    // Attempt 1: wrong
    await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, selectedOptionIndex: 0 }),
    });

    // Attempt 2: wrong
    await ArticleReadingSession.updateOne(
      { sessionId },
      { $set: { lastQuizAttemptAt: new Date(Date.now() - 2000) } }
    );
    const res2 = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, selectedOptionIndex: 2 }),
    });
    const json2 = await getJson(res2);
    assert.equal(json2.data.remainingAttempts, 1);

    // Attempt 3: wrong (last allowed attempt)
    await ArticleReadingSession.updateOne(
      { sessionId },
      { $set: { lastQuizAttemptAt: new Date(Date.now() - 2000) } }
    );
    const res3 = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, selectedOptionIndex: 0 }),
    });
    const json3 = await getJson(res3);
    assert.equal(json3.data.remainingAttempts, 0);

    // Attempt 4: exhausted
    await ArticleReadingSession.updateOne(
      { sessionId },
      { $set: { lastQuizAttemptAt: new Date(Date.now() - 2000) } }
    );
    const res4 = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, selectedOptionIndex: 1 }), // Even if correct now
    });
    assert.equal(res4.status, 400);
    const json4 = await getJson(res4);
    const errCode = json4.error?.code || json4.code;
    assert.equal(errCode, 'QUIZ_ATTEMPTS_EXHAUSTED');
  });

  // 9. Replay Protection and Duplicate Claim Idempotency
  it('9. Returns idempotent success without duplicate rewards on repeated verify calls', async () => {
    if (isSuiteBlocked) return;

    const task = await createArticleTask({ minReadDurationSeconds: 5, minScrollPercentage: 50 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const startJson = await getJson(startRes);
    const sessionId = startJson.data.sessionId;

    await advanceSessionToQualified(sessionId, 5.0, 80);

    await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, selectedOptionIndex: 1 }),
    });

    // Claim 1
    const verifyRes1 = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(verifyRes1.status, 200);
    const verifyJson1 = await getJson(verifyRes1);
    const completionId = verifyJson1.data.completion.id;
    tracker.trackCompletion(completionId);

    // Claim 2 (Replay)
    const verifyRes2 = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(verifyRes2.status, 200);
    const verifyJson2 = await getJson(verifyRes2);
    assert.equal(verifyJson2.data.completion.id, completionId);
    assert.equal(verifyJson2.data.reconciled, true);

    // Exactly one completion in DB
    const count = await TaskCompletion.countDocuments({ taskId: task._id, userId: user1._id });
    assert.equal(count, 1);
  });

  // 10. Cross-User and Cross-Task Ownership Checks
  it('10. Blocks cross-user access to another user article reading session', async () => {
    if (isSuiteBlocked) return;

    const task = await createArticleTask({ minReadDurationSeconds: 5 });

    // User 1 starts session
    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const startJson = await getJson(startRes);
    const sessionId = startJson.data.sessionId;

    // User 2 attempts progress update on User 1's sessionId
    const crossProgRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/progress`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user2Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        scrollPercentage: 90,
        appState: 'active',
        readingDeltaSeconds: 3,
      }),
    });
    assert.equal(crossProgRes.status, 403);
    const crossProgJson = await getJson(crossProgRes);
    const errCode1 = crossProgJson.error?.code || crossProgJson.code;
    assert.equal(errCode1, 'FORBIDDEN_SESSION');

    // User 2 attempts verify on User 1's sessionId
    const crossVerifyRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user2Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(crossVerifyRes.status, 403);
    const crossVerifyJson = await getJson(crossVerifyRes);
    const errCode2 = crossVerifyJson.error?.code || crossVerifyJson.code;
    assert.equal(errCode2, 'FORBIDDEN_SESSION');
  });

  // 11. Expired Assignment and Session Rejection
  it('11. Rejects verification when reading session has expired', async () => {
    if (isSuiteBlocked) return;

    const task = await createArticleTask({ minReadDurationSeconds: 5 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const startJson = await getJson(startRes);
    const sessionId = startJson.data.sessionId;

    // Manually expire session in DB
    await ArticleReadingSession.updateOne(
      { sessionId },
      { $set: { expiresAt: new Date(Date.now() - 10000) } }
    );

    const verifyRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(verifyRes.status, 400);
    const verifyJson = await getJson(verifyRes);
    const errCode = verifyJson.error?.code || verifyJson.code;
    assert.equal(errCode, 'SESSION_EXPIRED');
  });

  // 12. Admin Pause Protection
  it('12. Fails closed and prevents verification when admin pauses the task mid-session', async () => {
    if (isSuiteBlocked) return;

    const task = await createArticleTask({ minReadDurationSeconds: 5 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const startJson = await getJson(startRes);
    const sessionId = startJson.data.sessionId;

    // Qualify session
    await advanceSessionToQualified(sessionId, 5.0, 90);
    await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, selectedOptionIndex: 1 }),
    });

    // Admin pauses task
    await Task.updateOne({ _id: task._id }, { $set: { status: 'PAUSED' } });

    const verifyRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(verifyRes.status, 400);
    const verifyJson = await getJson(verifyRes);
    const errCode = verifyJson.error?.code || verifyJson.code;
    assert.equal(errCode, 'TASK_NOT_PUBLISHED');
  });

  // 13. Concurrent Last-Slot Cap Race
  it('13. Enforces strict atomic task cap under concurrent last-slot completion race', async () => {
    if (isSuiteBlocked) return;

    // Task with totalCap = 1
    const task = await createArticleTask({
      minReadDurationSeconds: 5,
      totalCap: 1,
    });

    // User 1 session
    const res1 = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const s1 = (await getJson(res1)).data.sessionId;

    // User 2 session
    const res2 = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user2Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const s2 = (await getJson(res2)).data.sessionId;

    // Both qualify
    for (const [tkn, sid] of [[user1Token, s1], [user2Token, s2]]) {
      await advanceSessionToQualified(sid, 5.0, 90);
      await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/quiz`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tkn}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, selectedOptionIndex: 1 }),
      });
    }

    // Concurrent verify calls
    const [raceRes1, raceRes2] = await Promise.all([
      fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: s1 }),
      }),
      fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user2Token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: s2 }),
      }),
    ]);

    const statuses = [raceRes1.status, raceRes2.status].sort();
    assert.deepEqual(statuses, [200, 400]); // Exactly one 200, one 400 (CAP_EXHAUSTED)

    // Exactly one completion registered
    const totalCompletions = await TaskCompletion.countDocuments({ taskId: task._id });
    assert.equal(totalCompletions, 1);
  });

  // 14. Network Timeout Reconciliation
  it('14. Safely reconciles client retry after simulated network timeout', async () => {
    if (isSuiteBlocked) return;

    const task = await createArticleTask({ minReadDurationSeconds: 5 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const startJson = await getJson(startRes);
    const sessionId = startJson.data.sessionId;

    await advanceSessionToQualified(sessionId, 5.0, 90);

    await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, selectedOptionIndex: 1 }),
    });

    // Initial verify executes
    const firstVerify = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(firstVerify.status, 200);
    const firstJson = await getJson(firstVerify);
    tracker.trackCompletion(firstJson.data.completion.id);

    // Client timed out waiting for response and retried
    const retryVerify = await fetch(`${baseUrl}/api/tasks/${task._id}/article-session/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(retryVerify.status, 200);
    const retryJson = await getJson(retryVerify);
    assert.equal(retryJson.data.reconciled, true);
    assert.equal(retryJson.data.completion.id, firstJson.data.completion.id);
  });

  // 15. Generic verify-action Bypass Rejection
  it('15. Rejects attempts to bypass dedicated article verification via POST /tasks/:id/verify-action', async () => {
    if (isSuiteBlocked) return;

    const task = await createArticleTask();

    // Start assignment (POST /start returns 201)
    const assignRes = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(assignRes.status, 201);
    const assignJson = await getJson(assignRes);
    const assignmentId = assignJson.data.assignment.id;
    tracker.trackAssignment(assignmentId);

    // Attempt generic verify-action
    const bypassRes = await fetch(`${baseUrl}/api/tasks/${task._id}/verify-action`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assignmentId,
        metadata: { clientBypass: true },
      }),
    });
    assert.equal(bypassRes.status, 400);
    const bypassJson = await getJson(bypassRes);
    const errCode = bypassJson.error?.code || bypassJson.code;
    assert.equal(errCode, 'UNSUPPORTED_TASK_CATEGORY');
  });

  // 16. Legacy Task Compatibility
  it('16. Preserves existing standard task dwell-time verification without regression', async () => {
    if (isSuiteBlocked) return;

    // Standard task
    const standardTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Legacy Survey Task',
      description: 'Standard link task',
      category: 'SURVEY',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 25,
      status: 'PUBLISHED',
      totalCap: 10,
      completionsCount: 0,
      dailyCapPerUser: 1,
      dwellTimeSeconds: 1,
      createdBy: adminUser._id,
    });
    tracker.trackTask(standardTask._id);

    // Start assignment (POST /start returns 201)
    const assignRes = await fetch(`${baseUrl}/api/tasks/${standardTask._id}/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(assignRes.status, 201);
    const assignJson = await getJson(assignRes);
    const assignmentId = assignJson.data.assignment.id;
    tracker.trackAssignment(assignmentId);

    // Backdate assignedAt by 10 seconds and give 5s dwell time
    await TaskAssignment.updateOne(
      { _id: new Types.ObjectId(assignmentId) },
      {
        $set: {
          assignedAt: new Date(Date.now() - 10000),
          dwellTimeAccumulatedSeconds: 5,
        },
      }
    );

    // Generic verify-action works for legacy SURVEY task
    const verifyRes = await fetch(`${baseUrl}/api/tasks/${standardTask._id}/verify-action`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignmentId }),
    });
    assert.equal(verifyRes.status, 200);
    const verifyJson = await getJson(verifyRes);
    assert.equal(verifyJson.data.completion.rewardPoints, 25);
    tracker.trackCompletion(verifyJson.data.completion.id);
  });
});
