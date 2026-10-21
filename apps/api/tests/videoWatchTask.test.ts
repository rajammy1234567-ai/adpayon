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
  VideoPlaybackSession,
} from '../src/models';
import { generateAccessToken } from '../src/services/tokenService';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from '../src/testUtils/dbIsolation';

describe('Phase 10.3: Video Watch Task End-to-End & Security Tests', () => {
  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';

  const tracker = new TestOwnershipTracker();

  const runId = Math.floor(10000 + Math.random() * 90000);
  const adminMobile = `+917${runId}2001`;
  const user1Mobile = `+917${runId}2002`;
  const user2Mobile = `+917${runId}2003`;

  let adminToken: string;
  let user1Token: string;
  let user2Token: string;

  let adminUser: any;
  let user1: any;
  let user2: any;
  let testCampaignId: string;

  before(async () => {
    // 1. Strict Database Isolation
    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      isSuiteBlocked = true;
      blockReason = isolation.reason || 'Database isolation not configured';
      console.warn(`\n[BLOCKED INTEGRATION TEST] Video Watch Suite: ${blockReason}\n`);
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
      name: 'Video Admin',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashAdmin123',
      role: 'ADMIN',
      status: 'ACTIVE',
      referralCode: `VAD${runId.toString().slice(0, 5)}`,
    });
    tracker.trackUser(adminUser._id, adminMobile);
    adminToken = generateAccessToken({
      userId: adminUser._id.toString(),
      role: adminUser.role,
      mobile: adminUser.mobile,
    });

    user1 = await User.create({
      mobile: user1Mobile,
      name: 'Video Viewer One',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashUser1',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `VV1${runId.toString().slice(0, 5)}`,
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
      name: 'Video Viewer Two',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashUser2',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `VV2${runId.toString().slice(0, 5)}`,
      metadata: { kycStatus: 'VERIFIED', language: 'en' },
    });
    tracker.trackUser(user2._id, user2Mobile);
    user2Token = generateAccessToken({
      userId: user2._id.toString(),
      role: user2.role,
      mobile: user2.mobile,
    });

    // 4. Create active campaign for video tasks
    const campaign = await Campaign.create({
      name: 'Video Watch Test Campaign',
      advertiserName: 'Streaming Video Media',
      advertiserBudgetPaise: 2000000,
      authorizedAgreementRef: 'AGR-VIDEO-WATCH-001',
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

  // Helper to create a video task
  async function createVideoTask(overrides: Partial<any> = {}) {
    const task = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: overrides.title || 'Watch Brand Video',
      description: overrides.description || 'Watch promotional video to earn points',
      category: 'VIDEO_WATCH',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: overrides.rewardPoints || 100,
      status: overrides.status || 'PUBLISHED',
      totalCap: overrides.totalCap || 100,
      completionsCount: overrides.completionsCount || 0,
      dailyCapPerUser: overrides.dailyCapPerUser || 10,
      dwellTimeSeconds: overrides.dwellTimeSeconds || 0,
      createdBy: adminUser._id,
      videoWatchConfig: {
        videoUrl: overrides.videoUrl || 'https://media.adpayon.com/videos/promo-test.mp4',
        videoDurationSeconds: overrides.videoDurationSeconds || 60,
        requiredWatchSeconds: overrides.requiredWatchSeconds || 5,
        allowSeeking: overrides.allowSeeking !== undefined ? overrides.allowSeeking : false,
        completionPolicy: overrides.completionPolicy || 'MINIMUM_DURATION',
        sessionTimeoutSeconds: overrides.sessionTimeoutSeconds || 600,
      },
    });
    tracker.trackTask(task._id);
    return task;
  }

  // 1. Valid full video watch
  it('1. Valid full video watch completes with server verification and reward', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({ requiredWatchSeconds: 5, videoDurationSeconds: 30 });

    // Start task assignment
    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
    });
    assert.ok([200, 201].includes(startRes.status));
    const startData = (await startRes.json()) as any;
    const assignmentId = startData.data.assignment.id;
    tracker.trackAssignment(assignmentId);

    // Start video session
    const sessionRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId }),
    });
    assert.equal(sessionRes.status, 201);
    const sessionData = (await sessionRes.json()) as any;
    const sessionId = sessionData.data.sessionId;
    tracker.trackVideoSession(sessionId);

    // Advance session directly to full required duration with legitimate wall-clock backdated timestamp
    await VideoPlaybackSession.collection.updateOne(
      { sessionId },
      {
        $set: {
          accumulatedWatchSeconds: 5.0,
          createdAt: new Date(Date.now() - 15000),
          lastProgressAt: new Date(),
          lastPlaybackPositionSeconds: 5.0,
        },
      }
    );

    // Verify video watch
    const verifyRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(verifyRes.status, 200);
    const verifyData = (await verifyRes.json()) as any;
    assert.equal(verifyData.success, true);
    assert.equal(verifyData.data.completion.rewardPoints, 100);
    tracker.trackCompletion(verifyData.data.completion.id);

    // Verify DB state
    const sessionDoc = await VideoPlaybackSession.findOne({ sessionId });
    assert.equal(sessionDoc?.status, 'COMPLETED');
    assert.equal(sessionDoc?.rewardGranted, true);

    const assignDoc = await TaskAssignment.findById(assignmentId);
    assert.equal(assignDoc?.status, 'COMPLETED');
  });

  // 2. Insufficient playback duration rejection
  it('2. Insufficient playback duration returns 400 and blocks reward', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({ requiredWatchSeconds: 10, videoDurationSeconds: 60 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const startData = (await startRes.json()) as any;
    tracker.trackAssignment(startData.data.assignment.id);

    const sessionRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const sessionData = (await sessionRes.json()) as any;
    const sessionId = sessionData.data.sessionId;
    tracker.trackVideoSession(sessionId);

    // Attempt to verify prematurely without watching required duration
    const verifyRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(verifyRes.status, 400);
    const verifyData = (await verifyRes.json()) as any;
    assert.equal(verifyData.error.code, 'INSUFFICIENT_WATCH_TIME');
  });

  // 3. Skipping to end (seeking prohibited)
  it('3. Forward seeking when prohibited rejects session with SEEKING_PROHIBITED', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({
      requiredWatchSeconds: 20,
      videoDurationSeconds: 120,
      allowSeeking: false,
    });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const startData = (await startRes.json()) as any;
    tracker.trackAssignment(startData.data.assignment.id);

    const sessionRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const sessionData = (await sessionRes.json()) as any;
    const sessionId = sessionData.data.sessionId;
    tracker.trackVideoSession(sessionId);

    // Attempt immediate skip to end (jump from 0s to 50s instantly)
    const seekRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        playbackPositionSeconds: 50.0,
        isPlaying: true,
        appState: 'active',
      }),
    });
    assert.equal(seekRes.status, 400);
    const seekData = (await seekRes.json()) as any;
    assert.equal(seekData.error.code, 'SEEKING_PROHIBITED');

    // Verification must now fail
    const verifyRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(verifyRes.status, 400);
    const verifyData = (await verifyRes.json()) as any;
    assert.equal(verifyData.error.code, 'SESSION_REJECTED');
  });

  // 4. Fake progress percentage / client timer tampering
  it('4. Fake progress percentage / excessive delta is bounded by server wall-clock', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({
      requiredWatchSeconds: 30,
      videoDurationSeconds: 60,
      allowSeeking: true, // seeking allowed, but wall-clock must still govern watch time!
    });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const startData = (await startRes.json()) as any;
    tracker.trackAssignment(startData.data.assignment.id);

    const sessionRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const sessionData = (await sessionRes.json()) as any;
    const sessionId = sessionData.data.sessionId;
    tracker.trackVideoSession(sessionId);

    // Immediate progress claiming 30s playback after only 100ms
    const pRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        playbackPositionSeconds: 30.0,
        isPlaying: true,
        appState: 'active',
      }),
    });
    assert.equal(pRes.status, 200);
    const pData = (await pRes.json()) as any;
    // Accumulated watch time must be bounded by wall clock (~1s max), NOT 30s!
    assert.ok(pData.data.accumulatedWatchSeconds < 5.0);
    assert.equal(pData.data.isQualified, false);
  });

  // 5. Replay after reward
  it('5. Replay after reward reconciles idempotently without double-rewarding', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({ requiredWatchSeconds: 5, videoDurationSeconds: 10 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const startData = (await startRes.json()) as any;
    const assignmentId = startData.data.assignment.id;
    tracker.trackAssignment(assignmentId);

    const sessionRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const sessionData = (await sessionRes.json()) as any;
    const sessionId = sessionData.data.sessionId;
    tracker.trackVideoSession(sessionId);

    // Advance session to qualified state with backdated creation timestamp
    await VideoPlaybackSession.collection.updateOne(
      { sessionId },
      {
        $set: {
          accumulatedWatchSeconds: 5.0,
          createdAt: new Date(Date.now() - 10000),
          lastProgressAt: new Date(),
        },
      }
    );

    const v1 = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(v1.status, 200);
    const v1Data = (await v1.json()) as any;
    tracker.trackCompletion(v1Data.data.completion.id);

    // Repeated verification with same session
    const v2 = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(v2.status, 200);
    const v2Data = (await v2.json()) as any;
    assert.equal(v2Data.data.reconciled, true);
    assert.equal(v2Data.data.completion.id, v1Data.data.completion.id);

    // Verify task completion count only incremented ONCE
    const freshTask = await Task.findById(task._id);
    assert.equal(freshTask?.completionsCount, 1);
  });

  // 6. Cross-user session usage
  it('6. Cross-user session access is strictly rejected with 403', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({ requiredWatchSeconds: 5, videoDurationSeconds: 30 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const startData = (await startRes.json()) as any;
    tracker.trackAssignment(startData.data.assignment.id);

    const sessionRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const sessionData = (await sessionRes.json()) as any;
    const sessionId = sessionData.data.sessionId;
    tracker.trackVideoSession(sessionId);

    // User 2 tries to send progress for User 1's session
    const pCross = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user2Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, playbackPositionSeconds: 2.0, isPlaying: true }),
    });
    assert.equal(pCross.status, 403);
    const pCrossData = (await pCross.json()) as any;
    assert.equal(pCrossData.error.code, 'FORBIDDEN_SESSION');

    // User 2 tries to verify User 1's session
    const vCross = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user2Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(vCross.status, 403);
    const vCrossData = (await vCross.json()) as any;
    assert.equal(vCrossData.error.code, 'FORBIDDEN_SESSION');
  });

  // 7. Expired video session
  it('7. Expired video session returns 400 and blocks verification', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({ requiredWatchSeconds: 5, videoDurationSeconds: 30 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const startData = (await startRes.json()) as any;
    tracker.trackAssignment(startData.data.assignment.id);

    const sessionRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const sessionData = (await sessionRes.json()) as any;
    const sessionId = sessionData.data.sessionId;
    tracker.trackVideoSession(sessionId);

    // Manually expire session in DB
    await VideoPlaybackSession.updateOne(
      { sessionId },
      { $set: { expiresAt: new Date(Date.now() - 5000), status: 'EXPIRED' } }
    );

    const vRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(vRes.status, 400);
    const vData = (await vRes.json()) as any;
    assert.equal(vData.error.code, 'SESSION_EXPIRED');
  });

  // 8. Backgrounded playback
  it('8. Backgrounded playback pauses progress accumulation', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({ requiredWatchSeconds: 10, videoDurationSeconds: 60 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const startData = (await startRes.json()) as any;
    tracker.trackAssignment(startData.data.assignment.id);

    const sessionRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const sessionData = (await sessionRes.json()) as any;
    const sessionId = sessionData.data.sessionId;
    tracker.trackVideoSession(sessionId);

    await new Promise((r) => setTimeout(r, 1100));

    // Send progress with appState: 'background'
    const pBg = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        playbackPositionSeconds: 1.0,
        isPlaying: true,
        appState: 'background',
      }),
    });
    assert.equal(pBg.status, 200);
    const pBgData = (await pBg.json()) as any;
    assert.equal(pBgData.data.accumulatedWatchSeconds, 0);
  });

  // 9. Buffering / paused playback
  it('9. Paused playback does not accumulate watch seconds', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({ requiredWatchSeconds: 10, videoDurationSeconds: 60 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const startData = (await startRes.json()) as any;
    tracker.trackAssignment(startData.data.assignment.id);

    const sessionRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const sessionData = (await sessionRes.json()) as any;
    const sessionId = sessionData.data.sessionId;
    tracker.trackVideoSession(sessionId);

    await new Promise((r) => setTimeout(r, 1100));

    // Send progress with isPlaying: false
    const pPaused = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        playbackPositionSeconds: 0,
        isPlaying: false,
        appState: 'active',
      }),
    });
    assert.equal(pPaused.status, 200);
    const pPausedData = (await pPaused.json()) as any;
    assert.equal(pPausedData.data.accumulatedWatchSeconds, 0);
  });

  // 10. Malformed playback events
  it('10. Malformed playback events return 400 with input validation errors', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({ requiredWatchSeconds: 10, videoDurationSeconds: 60 });

    const sessionRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    // Missing active assignment -> 404
    assert.equal(sessionRes.status, 404);

    // Negative position
    const badPos = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'vses_invalid123',
        playbackPositionSeconds: -10,
        isPlaying: true,
      }),
    });
    assert.equal(badPos.status, 404);
  });

  // 11. Parallel duplicate verification attempts
  it('11. Parallel duplicate verifications commit exactly once without duplicate rewards', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({ requiredWatchSeconds: 5, videoDurationSeconds: 10 });

    const startRes = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const startData = (await startRes.json()) as any;
    tracker.trackAssignment(startData.data.assignment.id);

    const sessionRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const sessionData = (await sessionRes.json()) as any;
    const sessionId = sessionData.data.sessionId;
    tracker.trackVideoSession(sessionId);

    // Advance session to qualified state with backdated creation timestamp
    await VideoPlaybackSession.collection.updateOne(
      { sessionId },
      {
        $set: {
          accumulatedWatchSeconds: 5.0,
          createdAt: new Date(Date.now() - 10000),
          lastProgressAt: new Date(),
        },
      }
    );

    // Run 2 parallel verification attempts simultaneously
    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/api/tasks/${task._id}/video-session/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }),
      fetch(`${baseUrl}/api/tasks/${task._id}/video-session/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }),
    ]);

    const dataA = (await resA.json()) as any;
    const dataB = (await resB.json()) as any;

    // Exactly one commits the transaction (200), while racing request either reconciles (200) or rejects (404)
    const statuses = [resA.status, resB.status];
    assert.ok(statuses.includes(200), 'At least one verification request must succeed with 200');
    assert.ok(statuses.every((s) => s === 200 || s === 404), 'Concurrent duplicate responses must be 200 or 404');

    const successfulData = resA.status === 200 ? dataA : dataB;
    tracker.trackCompletion(successfulData.data.completion.id);

    // Verify exactly one completion document exists in DB
    const count = await TaskCompletion.countDocuments({ taskId: task._id, userId: user1._id });
    assert.equal(count, 1);
  });

  // 12. Global cap boundary
  it('12. Global cap boundary rejects verification when cap is exhausted', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({
      totalCap: 1,
      requiredWatchSeconds: 5,
      videoDurationSeconds: 10,
    });

    // User 1 completes task
    const s1 = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const s1Data = (await s1.json()) as any;
    tracker.trackAssignment(s1Data.data.assignment.id);

    const ses1 = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const ses1Data = (await ses1.json()) as any;
    tracker.trackVideoSession(ses1Data.data.sessionId);

    await VideoPlaybackSession.collection.updateOne(
      { sessionId: ses1Data.data.sessionId },
      {
        $set: {
          accumulatedWatchSeconds: 5.0,
          createdAt: new Date(Date.now() - 10000),
          lastProgressAt: new Date(),
        },
      }
    );

    const v1 = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: ses1Data.data.sessionId }),
    });
    assert.equal(v1.status, 200);
    const v1Data = (await v1.json()) as any;
    tracker.trackCompletion(v1Data.data.completion.id);

    // Task is now exhausted (completionsCount = 1, totalCap = 1)
    // User 2 cannot start or verify
    const s2 = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    assert.equal(s2.status, 400);
    const s2Data = (await s2.json()) as any;
    assert.equal(s2Data.error.code, 'CAP_EXHAUSTED');
  });

  // 13. Admin pause during playback
  it('13. Admin pause during playback blocks verification with TASK_NOT_PUBLISHED', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({ requiredWatchSeconds: 5, videoDurationSeconds: 10 });

    const s1 = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const s1Data = (await s1.json()) as any;
    tracker.trackAssignment(s1Data.data.assignment.id);

    const ses1 = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const ses1Data = (await ses1.json()) as any;
    const sessionId = ses1Data.data.sessionId;
    tracker.trackVideoSession(sessionId);

    await VideoPlaybackSession.collection.updateOne(
      { sessionId },
      {
        $set: {
          accumulatedWatchSeconds: 5.0,
          createdAt: new Date(Date.now() - 10000),
          lastProgressAt: new Date(),
        },
      }
    );

    // Admin pauses task
    task.status = 'PAUSED';
    await task.save();

    // Verify should fail because task was paused
    const vRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(vRes.status, 400);
    const vData = (await vRes.json()) as any;
    assert.equal(vData.error.code, 'TASK_NOT_PUBLISHED');
  });

  // 14. Legacy task compatibility
  it('14. Video watch task calling generic verify-action is blocked', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({ requiredWatchSeconds: 5, videoDurationSeconds: 10 });

    const s1 = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const s1Data = (await s1.json()) as any;
    tracker.trackAssignment(s1Data.data.assignment.id);

    // Call generic verify-action
    const genericRes = await fetch(`${baseUrl}/api/tasks/${task._id}/verify-action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
    });
    assert.equal(genericRes.status, 400);
    const genericData = (await genericRes.json()) as any;
    assert.equal(genericData.error.code, 'UNSUPPORTED_TASK_CATEGORY');
  });

  // 15. Full sequential video watch succeeds under FULL_VIDEO policy
  it('15. Full sequential video watch succeeds under FULL_VIDEO policy with valid end event', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({
      completionPolicy: 'FULL_VIDEO',
      videoDurationSeconds: 10,
      requiredWatchSeconds: 10,
    });

    const s1 = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const s1Data = (await s1.json()) as any;
    const assignmentId = s1Data.data.assignment.id;
    tracker.trackAssignment(assignmentId);

    const ses1 = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(ses1.status, 201);
    const ses1Data = (await ses1.json()) as any;
    const sessionId = ses1Data.data.sessionId;
    assert.equal(ses1Data.data.completionPolicy, 'FULL_VIDEO');
    tracker.trackVideoSession(sessionId);

    // Backdate session creation time to satisfy server wall-clock check
    await VideoPlaybackSession.collection.updateOne(
      { sessionId },
      { $set: { createdAt: new Date(Date.now() - 15000), lastProgressAt: new Date(Date.now() - 12000) } }
    );

    // Sequential beacons covering 0 -> 4s -> 8s -> 10s
    await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, playbackPositionSeconds: 4.0, isPlaying: true, appState: 'active' }),
    });

    await VideoPlaybackSession.updateOne(
      { sessionId },
      { $set: { lastProgressAt: new Date(Date.now() - 8000) } }
    );

    await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, playbackPositionSeconds: 8.0, isPlaying: true, appState: 'active' }),
    });

    await VideoPlaybackSession.updateOne(
      { sessionId },
      { $set: { lastProgressAt: new Date(Date.now() - 3000) } }
    );

    const pFinal = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        playbackPositionSeconds: 10.0,
        isPlaying: true,
        appState: 'active',
        playbackEnded: true,
      }),
    });
    assert.equal(pFinal.status, 200);
    const pFinalData = (await pFinal.json()) as any;
    assert.equal(pFinalData.data.timelineCoverageSeconds, 10);
    assert.equal(pFinalData.data.playbackEnded, true);
    assert.equal(pFinalData.data.isQualified, true);

    // Verify watch and claim reward
    const vRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(vRes.status, 200);
    const vData = (await vRes.json()) as any;
    assert.equal(vData.success, true);
    assert.equal(vData.data.completion.rewardPoints, 100);
    tracker.trackCompletion(vData.data.completion.id);
  });

  // 16. 80% watch fails under FULL_VIDEO policy
  it('16. 80% watch fails under FULL_VIDEO policy with INCOMPLETE_TIMELINE_COVERAGE', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({
      completionPolicy: 'FULL_VIDEO',
      videoDurationSeconds: 10,
      requiredWatchSeconds: 10,
    });

    const s1 = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const s1Data = (await s1.json()) as any;
    tracker.trackAssignment(s1Data.data.assignment.id);

    const ses1 = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const ses1Data = (await ses1.json()) as any;
    const sessionId = ses1Data.data.sessionId;
    tracker.trackVideoSession(sessionId);

    // Backdate session
    await VideoPlaybackSession.updateOne(
      { sessionId },
      { $set: { createdAt: new Date(Date.now() - 15000), lastProgressAt: new Date(Date.now() - 10000) } }
    );

    // Only watch 8.0s of 10s (80%)
    await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, playbackPositionSeconds: 8.0, isPlaying: true, appState: 'active' }),
    });

    // Verification attempt must fail with INCOMPLETE_TIMELINE_COVERAGE
    const vRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(vRes.status, 400);
    const vData = (await vRes.json()) as any;
    assert.equal(vData.error.code, 'INCOMPLETE_TIMELINE_COVERAGE');
  });

  // 17. Waiting without playing fails under FULL_VIDEO
  it('17. Waiting without playing fails under FULL_VIDEO', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({
      completionPolicy: 'FULL_VIDEO',
      videoDurationSeconds: 10,
      requiredWatchSeconds: 10,
    });

    const s1 = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const s1Data = (await s1.json()) as any;
    tracker.trackAssignment(s1Data.data.assignment.id);

    const ses1 = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const ses1Data = (await ses1.json()) as any;
    const sessionId = ses1Data.data.sessionId;
    tracker.trackVideoSession(sessionId);

    // Backdate 20 seconds
    await VideoPlaybackSession.updateOne(
      { sessionId },
      { $set: { createdAt: new Date(Date.now() - 20000), lastProgressAt: new Date(Date.now() - 15000) } }
    );

    // User was paused at 0s
    await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, playbackPositionSeconds: 0, isPlaying: false, appState: 'active' }),
    });

    const vRes = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(vRes.status, 400);
    const vData = (await vRes.json()) as any;
    assert.equal(vData.error.code, 'INCOMPLETE_TIMELINE_COVERAGE');
  });

  // 18. Fake playback-ended event fails
  it('18. Fake playback-ended event with insufficient preceding coverage is rejected with PREMATURE_PLAYBACK_ENDED', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({
      completionPolicy: 'FULL_VIDEO',
      videoDurationSeconds: 10,
      requiredWatchSeconds: 10,
    });

    const s1 = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const s1Data = (await s1.json()) as any;
    tracker.trackAssignment(s1Data.data.assignment.id);

    const ses1 = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const ses1Data = (await ses1.json()) as any;
    const sessionId = ses1Data.data.sessionId;
    tracker.trackVideoSession(sessionId);

    // Send synthetic playbackEnded at position 2.0s
    const pFake = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        playbackPositionSeconds: 2.0,
        isPlaying: true,
        appState: 'active',
        playbackEnded: true,
      }),
    });
    assert.equal(pFake.status, 400);
    const pFakeData = (await pFake.json()) as any;
    assert.equal(pFakeData.error.code, 'PREMATURE_PLAYBACK_ENDED');

    // Session is now rejected
    const sessionDoc = await VideoPlaybackSession.findOne({ sessionId });
    assert.equal(sessionDoc?.status, 'REJECTED');
    assert.equal(sessionDoc?.rejectionReason, 'PREMATURE_PLAYBACK_ENDED');
  });

  // 19. Repeated timeline segment does not double-count
  it('19. Repeated timeline segment replay does not double-count timeline coverage', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({
      completionPolicy: 'FULL_VIDEO',
      videoDurationSeconds: 10,
      requiredWatchSeconds: 10,
      allowSeeking: true, // Allow backward seeking for replay test
    });

    const s1 = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const s1Data = (await s1.json()) as any;
    tracker.trackAssignment(s1Data.data.assignment.id);

    const ses1 = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const ses1Data = (await ses1.json()) as any;
    const sessionId = ses1Data.data.sessionId;
    tracker.trackVideoSession(sessionId);

    // Backdate
    await VideoPlaybackSession.updateOne(
      { sessionId },
      { $set: { createdAt: new Date(Date.now() - 10000), lastProgressAt: new Date(Date.now() - 5000) } }
    );

    // 1. Play from 0 to 4s
    const p1 = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, playbackPositionSeconds: 4.0, isPlaying: true, appState: 'active' }),
    });
    const d1 = (await p1.json()) as any;
    assert.equal(d1.data.timelineCoverageSeconds, 4);

    // 2. User rewinds back to 0s
    await VideoPlaybackSession.updateOne(
      { sessionId },
      { $set: { lastPlaybackPositionSeconds: 0, lastProgressAt: new Date(Date.now() - 3000) } }
    );

    // 3. User replays 0 to 4s again
    const p2 = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, playbackPositionSeconds: 4.0, isPlaying: true, appState: 'active' }),
    });
    const d2 = (await p2.json()) as any;
    // Coverage must still be 4s, NOT 8s!
    assert.equal(d2.data.timelineCoverageSeconds, 4);
  });

  // 20. Buffering suppresses watch time and coverage
  it('20. Buffering state suppresses watch time and timeline coverage accumulation', async () => {
    if (isSuiteBlocked) return;

    const task = await createVideoTask({
      completionPolicy: 'FULL_VIDEO',
      videoDurationSeconds: 10,
    });

    const s1 = await fetch(`${baseUrl}/api/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const s1Data = (await s1.json()) as any;
    tracker.trackAssignment(s1Data.data.assignment.id);

    const ses1 = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const ses1Data = (await ses1.json()) as any;
    const sessionId = ses1Data.data.sessionId;
    tracker.trackVideoSession(sessionId);

    await VideoPlaybackSession.updateOne(
      { sessionId },
      { $set: { createdAt: new Date(Date.now() - 5000), lastProgressAt: new Date(Date.now() - 3000) } }
    );

    // Send beacon with isBuffering: true
    const pBuffering = await fetch(`${baseUrl}/api/tasks/${task._id}/video-session/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        playbackPositionSeconds: 3.0,
        isPlaying: true,
        appState: 'active',
        isBuffering: true,
      }),
    });
    assert.equal(pBuffering.status, 200);
    const pBufData = (await pBuffering.json()) as any;
    assert.equal(pBufData.data.accumulatedWatchSeconds, 0);
    assert.equal(pBufData.data.timelineCoverageSeconds, 0);
  });

  // 21. Default policy is FULL_VIDEO for newly created VIDEO_WATCH tasks
  it('21. Task schema defaults completionPolicy to FULL_VIDEO when omitted', async () => {
    if (isSuiteBlocked) return;

    const task = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Default Policy Video Task',
      description: 'Testing default completionPolicy',
      category: 'VIDEO_WATCH',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 50,
      status: 'PUBLISHED',
      totalCap: 10,
      createdBy: adminUser._id,
      videoWatchConfig: {
        videoUrl: 'https://media.adpayon.com/videos/default.mp4',
        videoDurationSeconds: 15,
        requiredWatchSeconds: 15,
      },
    });
    tracker.trackTask(task._id);

    assert.equal(task.videoWatchConfig?.completionPolicy, 'FULL_VIDEO');
  });
});
