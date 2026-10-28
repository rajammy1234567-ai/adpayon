import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { env } from '../src/config/env';
import {
  Campaign,
  Task,
  User,
  TaskAssignment,
  TaskCompletion,
  TaskEvent,
  ExternalLinkSession,
  WalletLedgerEntry,
  VerificationEvidence,
} from '../src/models';
import { generateAccessToken } from '../src/services/tokenService';
import { createApp } from '../src/app';
import type { Server } from 'node:http';

describe('External Link Elapsed-Time Completion Verification', () => {
  let server: Server;
  let baseUrl: string;
  let adminToken: string;
  let adminUserId: Types.ObjectId;
  let earnerToken: string;
  let earnerUser: any;
  let campaignId: string;

  const disposableTaskIds: string[] = [];
  const disposableUserIds: string[] = [];

  before(async () => {
    // 1. Database Connection
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI!, { dbName: env.MONGODB_DB_NAME });
    }

    // 2. Start HTTP Test Server on Loopback
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    let adminUser = await User.findOne({ role: 'ADMIN', status: 'ACTIVE' });
    if (!adminUser) {
      adminUser = await User.create({
        mobile: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        name: 'Sandbox Admin QA',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashfordisposablesandboxadminuser',
        role: 'ADMIN',
        status: 'ACTIVE',
        referralCode: `ADM${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      });
      disposableUserIds.push(adminUser._id.toString());
    }
    adminUserId = adminUser._id as Types.ObjectId;

    adminToken = generateAccessToken({
      userId: adminUser._id.toString(),
      role: 'ADMIN',
      mobile: adminUser.mobile!,
    });

    // 3. Find or create active sandbox campaign
    let campaign = await Campaign.findOne({ isSandbox: true, status: 'ACTIVE' });
    if (!campaign) {
      campaign = await Campaign.create({
        name: '[SANDBOX] External Link Elapsed QA',
        advertiserName: 'ADPAYON External QA',
        advertiserBudgetPaise: 1000000,
        spentBudgetPaise: 0,
        authorizedAgreementRef: 'AGR-EXT-01',
        webhookSecret: 'sandbox_secret_key_123',
        createdBy: adminUserId,
        isSandbox: true,
        status: 'ACTIVE',
      });
    }
    campaignId = campaign._id.toString();

    // 4. Create Disposable Earner User
    const earnerMobile = `+9199${Math.floor(10000000 + Math.random() * 90000000)}`;
    earnerUser = await User.create({
      mobile: earnerMobile,
      name: 'External Elapsed Tester',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashfordisposablesandboxearneruser',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `EXT${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      metadata: { kycStatus: 'VERIFIED' },
    });
    disposableUserIds.push(earnerUser._id.toString());

    // 5. Generate Test JWT Tokens
    earnerToken = generateAccessToken({
      userId: earnerUser._id.toString(),
      role: 'USER',
      mobile: earnerUser.mobile!,
    });
  });

  after(async () => {
    // Teardown created disposable documents
    if (disposableTaskIds.length > 0) {
      const objIds = disposableTaskIds.map((id) => new Types.ObjectId(id));
      await Task.deleteMany({ _id: { $in: objIds } });
      await TaskAssignment.deleteMany({ taskId: { $in: objIds } });
      await TaskCompletion.deleteMany({ taskId: { $in: objIds } });
      await ExternalLinkSession.deleteMany({ taskId: { $in: objIds } });
      await VerificationEvidence.deleteMany({ taskId: { $in: objIds } });
      await TaskEvent.deleteMany({ taskId: { $in: objIds } });
      await WalletLedgerEntry.deleteMany({ userId: earnerUser._id });
    }
    if (disposableUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: disposableUserIds.map((id) => new Types.ObjectId(id)) } });
    }

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  // ========================================================
  // SCENARIO 1: LINK LAUNCH FAILURE -> NOT ELIGIBLE
  // ========================================================
  describe('1. Link Launch Failure Validation', () => {
    let taskId: string;
    let sessionId: string;

    it('Admin creates and publishes an external YouTube task', async () => {
      const task = await Task.create({
        campaignId: new Types.ObjectId(campaignId),
        title: 'Learn Cyber Hygiene Video',
        description: 'Watch safety guidelines on YouTube',
        category: 'YOUTUBE_LEARNING',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 100,
        totalCap: 50,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 10,
        youtubeLearningConfig: {
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          videoId: 'dQw4w9WgXcQ',
          requiredDurationSeconds: 10,
        },
        createdBy: adminUserId,
        status: 'PUBLISHED',
      });
      taskId = task._id.toString();
      disposableTaskIds.push(taskId);
    });

    it('Start external link session creates active session with linkLaunched=false', async () => {
      const res = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const data: any = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.ok(data.data.sessionId);
      assert.equal(data.data.linkLaunched, false);
      assert.equal(data.data.requiredDurationSeconds, 10);
      sessionId = data.data.sessionId;
    });

    it('Reporting launch failure records failure and keeps linkLaunched=false', async () => {
      const res = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({
          sessionId,
          success: false,
          failureReason: 'ActivityNotFound: No app to handle URL',
        }),
      });
      const data: any = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.data.linkLaunched, false);
      assert.equal(data.data.launchFailure, true);
      assert.equal(data.data.launchFailureReason, 'ActivityNotFound: No app to handle URL');
    });

    it('Verification rejects with LINK_NOT_LAUNCHED when link was not launched', async () => {
      const res = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId }),
      });
      const data: any = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.status, 'NOT_ELIGIBLE');
      assert.equal(data.error.code, 'LINK_NOT_LAUNCHED');
    });
  });

  // ========================================================
  // SCENARIO 2: EARLY RETURN -> INCOMPLETE with remainingSeconds
  // ========================================================
  describe('2. Early Return Handling (Insufficient Duration)', () => {
    let taskId: string;
    let sessionId: string;

    it('Creates external article task with 15-second requirement', async () => {
      const task = await Task.create({
        campaignId: new Types.ObjectId(campaignId),
        title: 'Read Digital Security Guide',
        description: 'Read the comprehensive guide on external portal',
        category: 'ARTICLE_READ',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 120,
        totalCap: 50,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 15,
        articleReadConfig: {
          articleTitle: 'Digital Security Guide',
          articleContent: 'Detailed content on digital protection...',
          sourceUrl: 'https://example.com/security-article',
          minReadDurationSeconds: 15,
        },
        createdBy: adminUserId,
        status: 'PUBLISHED',
      });
      taskId = task._id.toString();
      disposableTaskIds.push(taskId);
    });

    it('Starts session and successfully launches link', async () => {
      const startRes = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const startData: any = await startRes.json();
      assert.equal(startRes.status, 200);
      sessionId = startData.data.sessionId;

      const launchRes = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId, success: true }),
      });
      const launchData: any = await launchRes.json();
      assert.equal(launchRes.status, 200);
      assert.equal(launchData.data.linkLaunched, true);
    });

    it('Immediate verification rejects with INCOMPLETE and server-calculated remainingSeconds', async () => {
      const res = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId }),
      });
      const data: any = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.status, 'INCOMPLETE');
      assert.equal(data.error.code, 'INSUFFICIENT_DURATION');
      assert.ok(data.data.remainingSeconds > 0, 'Must provide positive remainingSeconds');
      assert.equal(data.data.requiredDurationSeconds, 15);
      assert.ok(data.data.elapsedSeconds < 15);
    });
  });

  // ========================================================
  // SCENARIO 3: APP RESTART & REPEATED START -> RESUMES WITHOUT RESET
  // ========================================================
  describe('3. App Restart & Session Resume (No Timer Reset)', () => {
    let taskId: string;
    let originalSessionId: string;
    let originalStartedAt: string;
    let originalLaunchedAt: string;

    it('Starts session, launches link, and verifies timestamps', async () => {
      const task = await Task.create({
        campaignId: new Types.ObjectId(campaignId),
        title: 'Resume Test External Task',
        description: 'Verify timer persistence across app restart',
        category: 'ARTICLE_READ',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 75,
        totalCap: 50,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 20,
        articleReadConfig: {
          articleTitle: 'Resume Test',
          articleContent: 'Content...',
          sourceUrl: 'https://example.com/resume-article',
          minReadDurationSeconds: 20,
        },
        createdBy: adminUserId,
        status: 'PUBLISHED',
      });
      taskId = task._id.toString();
      disposableTaskIds.push(taskId);

      const startRes = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const startData: any = await startRes.json();
      assert.equal(startRes.status, 200);
      originalSessionId = startData.data.sessionId;
      originalStartedAt = startData.data.startedAt;

      // Report launch
      const launchRes = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId: originalSessionId, success: true }),
      });
      const launchData: any = await launchRes.json();
      assert.equal(launchRes.status, 200);
      originalLaunchedAt = launchData.data.linkLaunchedAt;
    });

    it('Repeated start (simulating app relaunch) returns same session and does NOT reset timer', async () => {
      // Simulate waiting 1 second
      await new Promise((r) => setTimeout(r, 1100));

      const resumeRes = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const resumeData: any = await resumeRes.json();
      assert.equal(resumeRes.status, 200);
      assert.equal(resumeData.data.sessionId, originalSessionId, 'Must return identical sessionId');
      assert.equal(resumeData.data.resumed, true, 'Must indicate resumed session');
      assert.equal(
        new Date(resumeData.data.startedAt).toISOString(),
        new Date(originalStartedAt).toISOString(),
        'startedAt must NOT be overwritten'
      );
      assert.equal(
        new Date(resumeData.data.linkLaunchedAt).toISOString(),
        new Date(originalLaunchedAt).toISOString(),
        'linkLaunchedAt must NOT be reset'
      );
      assert.ok(resumeData.data.elapsedSeconds >= 1, 'Elapsed seconds must reflect time passed');
    });

    it('Status query returns accurate elapsed progress without tracking user in background', async () => {
      const statusRes = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/status`, {
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const statusData: any = await statusRes.json();
      assert.equal(statusRes.status, 200);
      assert.equal(statusData.data.sessionId, originalSessionId);
      assert.equal(statusData.data.linkLaunched, true);
      assert.ok(statusData.data.elapsedSeconds >= 1);
      assert.ok(statusData.data.remainingSeconds <= 19);
    });
  });

  // ========================================================
  // SCENARIO 4: LATE RETURN -> ELIGIBILITY, CAPS & COMPLETION
  // ========================================================
  describe('4. Late Return Completion & Idempotent Rewards', () => {
    let taskId: string;
    let sessionId: string;
    let completionId: string;

    it('Creates published task with 10-second requirement', async () => {
      const task = await Task.create({
        campaignId: new Types.ObjectId(campaignId),
        title: 'Full Lifecycle External Link Task',
        description: 'Complete after full duration',
        category: 'YOUTUBE_LEARNING',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 200,
        totalCap: 50,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 10,
        youtubeLearningConfig: {
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          videoId: 'dQw4w9WgXcQ',
          requiredDurationSeconds: 10,
        },
        createdBy: adminUserId,
        status: 'PUBLISHED',
      });
      taskId = task._id.toString();
      disposableTaskIds.push(taskId);

      // Start and launch
      const startRes = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const startData: any = await startRes.json();
      sessionId = startData.data.sessionId;

      await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId, success: true }),
      });
    });

    it('Completes task after required duration has elapsed', async () => {
      // Simulate required duration passed in database server timestamp
      const pastTime = new Date(Date.now() - 15000); // 15 seconds ago (required is 10s)
      await ExternalLinkSession.collection.updateOne(
        { sessionId },
        {
          $set: {
            startedAt: pastTime,
            linkLaunchedAt: pastTime,
            activeIntervalStartedAt: pastTime,
            accumulatedAwaySeconds: 15,
          },
        }
      );

      const verifyRes = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId }),
      });
      const verifyData: any = await verifyRes.json();
      assert.equal(verifyRes.status, 200, `Verify failed: ${JSON.stringify(verifyData)}`);
      assert.equal(verifyData.status, 'COMPLETED');
      assert.equal(verifyData.data.rewardPoints, 200);
      assert.equal(verifyData.data.evidenceLabel, 'EXTERNAL_LINK_ELAPSED');
      completionId = verifyData.data.completionId;

      // Verify Evidence in database
      const evidence = await VerificationEvidence.findById(verifyData.data.evidenceId);
      assert.ok(evidence);
      assert.equal(evidence.evidenceType, 'EXTERNAL_LINK_ELAPSED');
      assert.equal((evidence.rawPayload as any).evidenceLabel, 'EXTERNAL_LINK_ELAPSED');
      assert.equal((evidence.rawPayload as any).sessionId, sessionId);

      // Verify single WalletLedgerEntry created
      const ledgerEntries = await WalletLedgerEntry.find({
        userId: earnerUser._id,
        referenceEntity: 'TaskCompletion',
        referenceId: new Types.ObjectId(completionId),
      });
      assert.equal(ledgerEntries.length, 1, 'Exactly one wallet ledger entry must be created');
      assert.equal(ledgerEntries[0].amountPaise, 0);
      assert.equal(ledgerEntries[0].pointsEquivalent, 200);
      assert.equal(ledgerEntries[0].status, 'CONFIRMED');

      // Verify task completion count incremented
      const updatedTask = await Task.findById(taskId);
      assert.equal(updatedTask?.completionsCount, 1);
    });

    // ========================================================
    // SCENARIO 5: DUPLICATE CREDIT PREVENTION / IDEMPOTENCY
    // ========================================================
    it('Subsequent verify calls on completed session are idempotent and prevent duplicate credits', async () => {
      const replayRes = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId }),
      });
      const replayData: any = await replayRes.json();
      assert.equal(replayRes.status, 200);
      assert.equal(replayData.idempotent, true);
      assert.equal(replayData.data.completion.id, completionId);

      // Verify wallet ledger entry count remains EXACTLY 1 (no double credit)
      const ledgerEntries = await WalletLedgerEntry.find({
        userId: earnerUser._id,
        referenceEntity: 'TaskCompletion',
        referenceId: new Types.ObjectId(completionId),
      });
      assert.equal(ledgerEntries.length, 1, 'Ledger entry count must remain strictly 1');

      // Verify task completionsCount was not incremented again
      const task = await Task.findById(taskId);
      assert.equal(task?.completionsCount, 1, 'completionsCount must remain strictly 1');
    });

    it('Attempting to start the task again rejects with TASK_ALREADY_COMPLETED', async () => {
      const restartRes = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const restartData: any = await restartRes.json();
      assert.equal(restartRes.status, 400);
      assert.equal(restartData.error.code, 'TASK_ALREADY_COMPLETED');
    });
  });

  // ========================================================
  // SCENARIO 5: CONCURRENT STARTS & CLAIMS (DOUBLE TAP GUARD)
  // ========================================================
  describe('5. Concurrency & Double-Tap Resilience', () => {
    let taskId: string;

    it('Concurrent start requests return the same session without duplicates', async () => {
      const task = await Task.create({
        campaignId: new Types.ObjectId(campaignId),
        title: 'Concurrent Task Test',
        description: 'Test double-tap starts',
        category: 'ARTICLE_READ',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 50,
        totalCap: 10,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 5,
        articleReadConfig: {
          articleTitle: 'Concurrent Article',
          articleContent: 'Content...',
          sourceUrl: 'https://example.com/concurrent',
          minReadDurationSeconds: 5,
        },
        createdBy: adminUserId,
        status: 'PUBLISHED',
      });
      taskId = task._id.toString();
      disposableTaskIds.push(taskId);

      // Fire 2 concurrent start requests
      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/api/tasks/${taskId}/external-link/start`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${earnerToken}` },
        }),
        fetch(`${baseUrl}/api/tasks/${taskId}/external-link/start`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${earnerToken}` },
        }),
      ]);

      const [data1, data2]: any[] = await Promise.all([res1.json(), res2.json()]);
      assert.equal(res1.status, 200);
      assert.equal(res2.status, 200);
      assert.equal(data1.data.sessionId, data2.data.sessionId, 'Both concurrent calls must bind to the same session');

      const sessionId = data1.data.sessionId;

      // Launch link
      await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId, success: true }),
      });

      // Fast forward time in database
      await ExternalLinkSession.collection.updateOne(
        { sessionId },
        {
          $set: {
            startedAt: new Date(Date.now() - 10000),
            linkLaunchedAt: new Date(Date.now() - 10000),
            activeIntervalStartedAt: new Date(Date.now() - 10000),
            accumulatedAwaySeconds: 10,
          },
        }
      );

      // Fire 2 concurrent verify requests (double-tap claim)
      const [vRes1, vRes2] = await Promise.all([
        fetch(`${baseUrl}/api/tasks/${taskId}/external-link/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
          body: JSON.stringify({ sessionId }),
        }),
        fetch(`${baseUrl}/api/tasks/${taskId}/external-link/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
          body: JSON.stringify({ sessionId }),
        }),
      ]);

      const [vData1, vData2]: any[] = await Promise.all([vRes1.json(), vRes2.json()]);
      assert.ok(vRes1.status === 200 && vRes2.status === 200);

      // Verify exactly ONE ledger credit exists in wallet
      const ledgerCredits = await WalletLedgerEntry.find({
        userId: earnerUser._id,
        referenceEntity: 'TaskCompletion',
      });
      // Filter entries specifically for this task's completion
      const taskCompletions = await TaskCompletion.find({ taskId });
      assert.equal(taskCompletions.length, 1, 'Only one completion record must be created');
      const completionId = taskCompletions[0]._id;

      const matchingLedger = ledgerCredits.filter((e) => e.referenceId?.toString() === completionId.toString());
      assert.equal(matchingLedger.length, 1, 'Exactly one ledger credit must exist for this completion');
    });
  });

  // ========================================================
  // SCENARIO 6: CROSS-USER SESSION ISOLATION (403 FORBIDDEN)
  // ========================================================
  describe('6. Cross-User Session Isolation', () => {
    let taskId: string;
    let userASessionId: string;
    let userBToken: string;
    let userB: any;

    before(async () => {
      // Create second disposable user B
      userB = await User.create({
        mobile: `+9199${Math.floor(10000000 + Math.random() * 90000000)}`,
        name: 'Attacker User B',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashforuserb',
        role: 'USER',
        status: 'ACTIVE',
        referralCode: `ATT${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        metadata: { kycStatus: 'VERIFIED' },
      });
      disposableUserIds.push(userB._id.toString());

      userBToken = generateAccessToken({
        userId: userB._id.toString(),
        role: 'USER',
        mobile: userB.mobile!,
      });
    });

    it('Creates session for User A', async () => {
      const task = await Task.create({
        campaignId: new Types.ObjectId(campaignId),
        title: 'Session Isolation Task',
        description: 'Verify cross-user session boundaries',
        category: 'YOUTUBE_LEARNING',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 60,
        totalCap: 10,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 5,
        youtubeLearningConfig: {
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          videoId: 'dQw4w9WgXcQ',
          requiredDurationSeconds: 5,
        },
        createdBy: adminUserId,
        status: 'PUBLISHED',
      });
      taskId = task._id.toString();
      disposableTaskIds.push(taskId);

      const startRes = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const startData: any = await startRes.json();
      assert.equal(startRes.status, 200);
      userASessionId = startData.data.sessionId;
    });

    it('User B cannot inspect User A session status (403 FORBIDDEN_SESSION)', async () => {
      const statusRes = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/${userASessionId}`, {
        headers: { Authorization: `Bearer ${userBToken}` },
      });
      const statusData: any = await statusRes.json();
      assert.equal(statusRes.status, 403);
      assert.equal(statusData.error.code, 'FORBIDDEN_SESSION');
    });

    it('User B cannot report launch for User A session (403 FORBIDDEN_SESSION)', async () => {
      const launchRes = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userBToken}` },
        body: JSON.stringify({ sessionId: userASessionId, success: true }),
      });
      const launchData: any = await launchRes.json();
      assert.equal(launchRes.status, 403);
      assert.equal(launchData.error.code, 'FORBIDDEN_SESSION');
    });

    it('User B cannot verify or claim reward using User A session (403 FORBIDDEN_SESSION)', async () => {
      const verifyRes = await fetch(`${baseUrl}/api/tasks/${taskId}/external-link/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userBToken}` },
        body: JSON.stringify({ sessionId: userASessionId }),
      });
      const verifyData: any = await verifyRes.json();
      assert.equal(verifyRes.status, 403);
      assert.equal(verifyData.error.code, 'FORBIDDEN_SESSION');
    });
  });

  // ========================================================
  // SCENARIO 7: PAUSED / EXPIRED / EXHAUSTED CAP CONTROLS
  // ========================================================
  describe('7. Task Lifecycle Controls (Paused, Expired, Cap Exhausted)', () => {
    it('Rejects verification if task is PAUSED', async () => {
      const task = await Task.create({
        campaignId: new Types.ObjectId(campaignId),
        title: 'Paused Task Test',
        description: 'Paused task test',
        category: 'ARTICLE_READ',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 50,
        totalCap: 10,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 5,
        articleReadConfig: {
          articleTitle: 'Paused Article',
          articleContent: 'Content...',
          sourceUrl: 'https://example.com/paused',
          minReadDurationSeconds: 5,
        },
        createdBy: adminUserId,
        status: 'PUBLISHED',
      });
      const tId = task._id.toString();
      disposableTaskIds.push(tId);

      // Start session while published
      const startRes = await fetch(`${baseUrl}/api/tasks/${tId}/external-link/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const startData: any = await startRes.json();
      const sId = startData.data.sessionId;

      // Admin pauses task
      await Task.updateOne({ _id: task._id }, { $set: { status: 'PAUSED' } });

      // Verification must fail
      const verifyRes = await fetch(`${baseUrl}/api/tasks/${tId}/external-link/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId: sId }),
      });
      const verifyData: any = await verifyRes.json();
      assert.equal(verifyRes.status, 400);
      assert.equal(verifyData.error.code, 'TASK_NOT_AVAILABLE');
    });

    it('Rejects verification if task has EXPIRED', async () => {
      const task = await Task.create({
        campaignId: new Types.ObjectId(campaignId),
        title: 'Expired Task Test',
        description: 'Expired task test',
        category: 'ARTICLE_READ',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 50,
        totalCap: 10,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 5,
        articleReadConfig: {
          articleTitle: 'Expired Article',
          articleContent: 'Content...',
          sourceUrl: 'https://example.com/expired',
          minReadDurationSeconds: 5,
        },
        expiresAt: new Date(Date.now() + 60000), // initially valid
        createdBy: adminUserId,
        status: 'PUBLISHED',
      });
      const tId = task._id.toString();
      disposableTaskIds.push(tId);

      const startRes = await fetch(`${baseUrl}/api/tasks/${tId}/external-link/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const startData: any = await startRes.json();
      const sId = startData.data.sessionId;

      // Task expires in wall-clock time
      await Task.updateOne({ _id: task._id }, { $set: { expiresAt: new Date(Date.now() - 5000) } });

      const verifyRes = await fetch(`${baseUrl}/api/tasks/${tId}/external-link/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId: sId }),
      });
      const verifyData: any = await verifyRes.json();
      assert.equal(verifyRes.status, 400);
      assert.equal(verifyData.error.code, 'TASK_EXPIRED');
    });
  });
});
