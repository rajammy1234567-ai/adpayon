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
  YouTubeLearningSession,
  ArticleReadingSession,
  VideoPlaybackSession,
  WalletLedgerEntry,
  VerificationEvidence,
} from '../src/models';
import { generateAccessToken } from '../src/services/tokenService';
import { createApp } from '../src/app';
import type { Server } from 'node:http';

describe('Simple Task Flows End-to-End Verification (Sandbox)', () => {
  let server: Server;
  let baseUrl: string;
  let adminToken: string;
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

    // 3. Find active sandbox campaign
    let campaign = await Campaign.findOne({ isSandbox: true, status: 'ACTIVE' });
    if (!campaign) {
      campaign = await Campaign.create({
        name: '[SANDBOX] Simple Task Flow QA',
        advertiserName: 'ADPAYON Internal QA',
        advertiserBudgetPaise: 1000000,
        spentBudgetPaise: 0,
        authorizedAgreementRef: 'AGR-SANDBOX-01',
        webhookSecret: 'sandbox_secret_key_123',
        createdBy: new Types.ObjectId(),
        isSandbox: true,
        status: 'ACTIVE',
      });
    }
    campaignId = campaign._id.toString();

    // 4. Create Disposable Earner User
    const earnerMobile = `+9199${Math.floor(10000000 + Math.random() * 90000000)}`;
    earnerUser = await User.create({
      mobile: earnerMobile,
      name: 'Sandbox Flow Tester',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashfordisposablesandboxearneruser',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `TST${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      metadata: { kycStatus: 'VERIFIED' },
    });
    disposableUserIds.push(earnerUser._id.toString());

    // 5. Generate Test JWT Tokens
    earnerToken = generateAccessToken({
      userId: earnerUser._id.toString(),
      role: 'USER',
      mobile: earnerUser.mobile!,
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

    adminToken = generateAccessToken({
      userId: adminUser._id.toString(),
      role: 'ADMIN',
      mobile: adminUser.mobile!,
    });
  });

  after(async () => {
    // Cleanup disposable tasks, assignments, and test users
    if (disposableTaskIds.length > 0) {
      const objIds = disposableTaskIds.map((id) => new Types.ObjectId(id));
      await Task.deleteMany({ _id: { $in: objIds } });
      await TaskAssignment.deleteMany({ taskId: { $in: objIds } });
      await TaskCompletion.deleteMany({ taskId: { $in: objIds } });
      await YouTubeLearningSession.deleteMany({ taskId: { $in: objIds } });
      await ArticleReadingSession.deleteMany({ taskId: { $in: objIds } });
      await VideoPlaybackSession.deleteMany({ taskId: { $in: objIds } });
      await VerificationEvidence.deleteMany({ taskId: { $in: objIds } });
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

  // ==========================================
  // 1. ARTICLE FLOW (Integrated Reader + Quiz)
  // ==========================================
  describe('1. Educational Article Task Flow', () => {
    let articleTaskId: string;
    let articleSessionId: string;

    it('Admin creates and publishes an Educational Article task with comprehension quiz', async () => {
      // 1. Create Article Task in DRAFT
      const createRes = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          campaignId,
          title: 'Understanding Digital UPI PIN Security',
          description: 'Educational safety guide on protecting personal UPI credentials in India.',
          category: 'ARTICLE_READ',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 200,
          totalCap: 100,
          dailyCapPerUser: 1,
          dwellTimeSeconds: 0,
          instructions: '1. Read the article for 5 seconds. 2. Scroll through. 3. Answer the verification question.',
          articleReadConfig: {
            articleTitle: 'Why You Never Enter Your UPI PIN To Receive Money',
            articleContent:
              'A critical safety rule of the Unified Payments Interface (UPI) across India is that your secret 4-digit or 6-digit UPI PIN is only required when money is deducted from your bank account. You never need to enter a PIN to receive incoming transfers or claim promotional refunds.',
            sourceUrl: 'https://example.com/upi-security-guide',
            minReadDurationSeconds: 5,
            minScrollPercentage: 60,
            comprehensionQuiz: {
              question: 'When should you enter your personal UPI PIN?',
              options: [
                'Only when sending money or authorizing an outgoing deduction',
                'Whenever someone claims they are sending you a cashback reward',
                'Whenever an unknown caller asks for verification',
                'To accept an incoming bank transfer',
              ],
              correctOptionIndex: 0,
            },
          },
        }),
      });

      const createData: any = await createRes.json();
      assert.equal(createRes.status, 201, `Failed to create article task: ${JSON.stringify(createData)}`);
      assert.equal(createData.success, true);
      articleTaskId = createData.data.task.id;
      disposableTaskIds.push(articleTaskId);

      // 2. Publish Task
      const pubRes = await fetch(`${baseUrl}/api/admin/tasks/${articleTaskId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const pubData: any = await pubRes.json();
      assert.equal(pubRes.status, 200, `Failed to publish task: ${JSON.stringify(pubData)}`);
      assert.equal(pubData.data.task.status, 'PUBLISHED');
    });

    it('Earner sees the published article in feed and starts reading session', async () => {
      // Verify in Feed
      const feedRes = await fetch(`${baseUrl}/api/tasks/feed`, {
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const feedData: any = await feedRes.json();
      assert.equal(feedRes.status, 200);
      const inFeed = feedData.data.tasks.some((t: any) => t.id === articleTaskId);
      assert.equal(inFeed, true, 'Article task must appear in published earner feed');

      // Start Article Session
      const startRes = await fetch(`${baseUrl}/api/tasks/${articleTaskId}/article-session/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const startData: any = await startRes.json();
      assert.equal(startRes.status, 200);
      assert.equal(startData.success, true);
      assert.ok(startData.data.sessionId);
      assert.equal(startData.data.hasQuiz, true);
      articleSessionId = startData.data.sessionId;
    });

    it('Tracks visible reading time and scroll percentage; rejects wrong quiz answer', async () => {
      // Telemetry Progress Beacon
      const progRes = await fetch(`${baseUrl}/api/tasks/${articleTaskId}/article-session/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({
          sessionId: articleSessionId,
          scrollPercentage: 80,
          readingDeltaSeconds: 5,
          appState: 'active',
        }),
      });
      const progData: any = await progRes.json();
      assert.equal(progRes.status, 200);
      assert.equal(progData.data.maxScrollPercentage, 80);

      // Submit WRONG quiz answer (Option index 1)
      const wrongQuizRes = await fetch(`${baseUrl}/api/tasks/${articleTaskId}/article-session/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({
          sessionId: articleSessionId,
          selectedOptionIndex: 1,
        }),
      });
      const wrongQuizData: any = await wrongQuizRes.json();
      assert.equal(wrongQuizRes.status, 200);
      assert.equal(wrongQuizData.data.correct, false);

      // Wait for anti-spam quiz cooldown (1000ms)
      await new Promise((r) => setTimeout(r, 1100));

      // Submit CORRECT quiz answer (Option index 0)
      const correctQuizRes = await fetch(`${baseUrl}/api/tasks/${articleTaskId}/article-session/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({
          sessionId: articleSessionId,
          selectedOptionIndex: 0,
        }),
      });
      const correctQuizData: any = await correctQuizRes.json();
      assert.equal(correctQuizRes.status, 200);
      assert.equal(correctQuizData.data.correct, true);
    });

    it('Verifies article reading completion, awards reward once, and rejects duplicate claim', async () => {
      // Satisfy reading time and wall-clock anti-tampering requirement in database for the completed quiz session
      await ArticleReadingSession.collection.updateOne(
        { sessionId: articleSessionId },
        {
          $set: {
            createdAt: new Date(Date.now() - 15000),
            accumulatedReadSeconds: 10,
            maxScrollPercentage: 100,
          },
        }
      );

      // Claim Reward
      const verifyRes = await fetch(`${baseUrl}/api/tasks/${articleTaskId}/article-session/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId: articleSessionId }),
      });
      const verifyData: any = await verifyRes.json();
      assert.equal(verifyRes.status, 200);
      assert.equal(verifyData.data.completion.rewardPoints, 200);

      // Duplicate Claim Attempt (Idempotent replay returns 200 with reconciled: true)
      const dupRes = await fetch(`${baseUrl}/api/tasks/${articleTaskId}/article-session/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId: articleSessionId }),
      });
      const dupData: any = await dupRes.json();
      assert.equal(dupRes.status, 200);
      assert.equal(dupData.data.reconciled, true);

      // Verify exactly ONE reward entry in wallet ledger
      const ledgerCount = await WalletLedgerEntry.countDocuments({
        userId: earnerUser._id,
        referenceEntity: 'TaskCompletion',
      });
      assert.equal(ledgerCount, 1, 'Exactly one reward ledger entry must exist for completion');
    });
  });

  // ==========================================
  // 2. DIRECT VIDEO FLOW (Telemetry + Quiz)
  // ==========================================
  describe('2. Direct Video Task Flow', () => {
    let videoTaskId: string;
    let videoSessionId: string;

    it('Admin creates and publishes Direct Video task with watch duration and quiz', async () => {
      const createRes = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          campaignId,
          title: 'Official Merchant QR Code Verification Guide',
          description: 'Watch video demonstrating how to inspect merchant verification badges before paying.',
          category: 'VIDEO_WATCH',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 150,
          totalCap: 50,
          dailyCapPerUser: 1,
          dwellTimeSeconds: 0,
          instructions: 'Watch the full video guide and answer the question to claim points.',
          videoWatchConfig: {
            videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            videoDurationSeconds: 60,
            requiredWatchSeconds: 5,
            completionPolicy: 'MINIMUM_DURATION',
            allowSeeking: true,
            comprehensionQuiz: {
              question: 'What badge indicates an official verified merchant?',
              options: [
                'Verified security checkmark alongside the registered merchant business name',
                'No badge is ever displayed for merchants',
                'Any random phone number with an asterisk',
                'A flashing lottery banner',
              ],
              correctOptionIndex: 0,
            },
          },
        }),
      });

      const createData: any = await createRes.json();
      assert.equal(createRes.status, 201);
      videoTaskId = createData.data.task.id;
      disposableTaskIds.push(videoTaskId);

      // Publish Task
      const pubRes = await fetch(`${baseUrl}/api/admin/tasks/${videoTaskId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const pubData: any = await pubRes.json();
      assert.equal(pubRes.status, 200);
      assert.equal(pubData.data.task.status, 'PUBLISHED');
    });

    it('Tracks genuine playback events; does not count paused or buffered time', async () => {
      // 1. Start Task Assignment first
      const taskStartRes = await fetch(`${baseUrl}/api/tasks/${videoTaskId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      assert.equal(taskStartRes.status, 201);

      // 2. Start Video Session
      const startRes = await fetch(`${baseUrl}/api/tasks/${videoTaskId}/video-session/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const startData: any = await startRes.json();
      assert.equal(startRes.status, 201);
      videoSessionId = startData.data.sessionId;

      // Telemetry Beacon while PAUSED -> Watch time must NOT increase
      const pauseBeaconRes = await fetch(`${baseUrl}/api/tasks/${videoTaskId}/video-session/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({
          sessionId: videoSessionId,
          playbackPositionSeconds: 2,
          isPlaying: false,
          isBuffering: false,
          appState: 'active',
        }),
      });
      const pauseData: any = await pauseBeaconRes.json();
      assert.equal(pauseBeaconRes.status, 200);
      assert.equal(pauseData.data.accumulatedWatchSeconds, 0, 'Paused video must not advance watch seconds');

      // Satisfy watch time in database for playback test verification
      // Satisfy watch time and wall-clock anti-tampering duration in database
      await VideoPlaybackSession.updateOne(
        { sessionId: videoSessionId },
        {
          createdAt: new Date(Date.now() - 15000),
          accumulatedWatchSeconds: 10,
          timelineCoverageSeconds: 10,
        }
      );
    });

    it('Submits video quiz and completes verification', async () => {
      // Submit Correct Answer
      const quizRes = await fetch(`${baseUrl}/api/tasks/${videoTaskId}/video-session/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({
          sessionId: videoSessionId,
          selectedOptionIndex: 0,
        }),
      });
      const quizData: any = await quizRes.json();
      assert.equal(quizRes.status, 200);
      assert.equal(quizData.data.isCorrect, true);

      // Satisfy watch time and wall-clock anti-tampering duration in database after quiz save
      await VideoPlaybackSession.collection.updateOne(
        { sessionId: videoSessionId },
        {
          $set: {
            createdAt: new Date(Date.now() - 15000),
            accumulatedWatchSeconds: 10,
            timelineCoverageSeconds: 10,
          },
        }
      );

      // Verify and Claim Reward
      const verifyRes = await fetch(`${baseUrl}/api/tasks/${videoTaskId}/video-session/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId: videoSessionId }),
      });
      const verifyData: any = await verifyRes.json();
      assert.equal(verifyRes.status, 200, `Video verify failed: ${JSON.stringify(verifyData)}`);
      assert.equal(verifyData.data.completion.rewardPoints, 150);
    });
  });

  // ==========================================
  // 3. YOUTUBE LEARNING FLOW
  // ==========================================
  describe('3. YouTube Learning Task Flow', () => {
    let ytTaskId: string;
    let ytSessionId: string;

    it('Admin creates and publishes YouTube Learning task with auto-extracted videoId', async () => {
      const createRes = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          campaignId,
          title: 'YouTube Learning: Protecting Financial Privacy Online',
          description: 'Educational YouTube session on safeguarding digital payment apps from malware.',
          category: 'YOUTUBE_LEARNING',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 100,
          totalCap: 50,
          dailyCapPerUser: 1,
          dwellTimeSeconds: 0,
          instructions: 'Watch the lesson in YouTube and answer the single comprehension question.',
          youtubeLearningConfig: {
            youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            videoId: 'dQw4w9WgXcQ',
            requiredDurationSeconds: 10,
            sessionDurationSeconds: 10,
            comprehensionQuiz: {
              question: 'Should you install remote screen-sharing tools requested by callers?',
              options: [
                'Never install remote screen-sharing tools for unverified callers',
                'Yes, install whenever someone offers help',
                'Only if the caller claims to be calling from bank technical support',
                'Install and grant full device control',
              ],
              correctOptionIndex: 0,
            },
          },
        }),
      });

      const createData: any = await createRes.json();
      assert.equal(createRes.status, 201, `Failed to create YouTube task: ${JSON.stringify(createData)}`);
      ytTaskId = createData.data.task.id;
      disposableTaskIds.push(ytTaskId);

      // Publish Task
      const pubRes = await fetch(`${baseUrl}/api/admin/tasks/${ytTaskId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const pubData: any = await pubRes.json();
      assert.equal(pubRes.status, 200);
      assert.equal(pubData.data.task.status, 'PUBLISHED');
    });

    it('Initializes session, records engagement progress, and recovers session status', async () => {
      // Start Learning Session
      const startRes = await fetch(`${baseUrl}/api/tasks/${ytTaskId}/youtube-learning/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const startData: any = await startRes.json();
      assert.equal(startRes.status, 200);
      assert.equal(startData.data.videoId, 'dQw4w9WgXcQ');
      ytSessionId = startData.data.sessionId;

      // Heartbeat progress
      const progRes = await fetch(`${baseUrl}/api/tasks/${ytTaskId}/youtube-learning/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({
          sessionId: ytSessionId,
          secondsDelta: 10,
        }),
      });
      const progData: any = await progRes.json();
      assert.equal(progRes.status, 200);
      assert.ok(progData.data.accumulatedSeconds >= 10);

      // Status recovery (restoring progress when returning from YouTube)
      const statusRes = await fetch(`${baseUrl}/api/tasks/${ytTaskId}/youtube-learning/${ytSessionId}`, {
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const statusData: any = await statusRes.json();
      assert.equal(statusRes.status, 200);
      assert.equal(statusData.data.videoId, 'dQw4w9WgXcQ');
      assert.ok(statusData.data.accumulatedSeconds >= 10);
    });

    it('Evaluates comprehension quiz answer and grants single-use promotional reward', async () => {
      // Wrong Quiz Answer Rejection
      const wrongQuiz = await fetch(`${baseUrl}/api/tasks/${ytTaskId}/youtube-learning/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId: ytSessionId, selectedOptionIndex: 1 }),
      });
      const wrongData: any = await wrongQuiz.json();
      assert.equal(wrongQuiz.status, 400);
      assert.equal(wrongData.error.code, 'QUIZ_INCORRECT');

      // Correct Quiz Answer Verification
      const correctQuiz = await fetch(`${baseUrl}/api/tasks/${ytTaskId}/youtube-learning/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId: ytSessionId, selectedOptionIndex: 0 }),
      });
      const correctData: any = await correctQuiz.json();
      assert.equal(correctQuiz.status, 200);
      assert.equal(correctData.data.correct, true);

      // Verify and Claim Promotional Credit
      const verifyRes = await fetch(`${baseUrl}/api/tasks/${ytTaskId}/youtube-learning/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId: ytSessionId }),
      });
      const verifyData: any = await verifyRes.json();
      assert.equal(verifyRes.status, 200);
      assert.equal(verifyData.data.rewardPoints, 100);

      // Replay Rejection on closed session
      const replayRes = await fetch(`${baseUrl}/api/tasks/${ytTaskId}/youtube-learning/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({ sessionId: ytSessionId }),
      });
      const replayData: any = await replayRes.json();
      assert.equal(replayRes.status, 404);
      assert.equal(replayData.error.code, 'SESSION_NOT_FOUND');

      // Duplicate Task Re-Start Rejection
      const restartRes = await fetch(`${baseUrl}/api/tasks/${ytTaskId}/youtube-learning/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const restartData: any = await restartRes.json();
      assert.equal(restartRes.status, 400);
      assert.equal(restartData.error.code, 'TASK_ALREADY_COMPLETED');
    });
  });

  // ==========================================
  // 4. APP TESTING FLOW (Store + Feedback)
  // ==========================================
  describe('4. App Testing & Feedback Flow', () => {
    let appTaskId: string;

    it('Admin creates and publishes App Testing task with package name and feedback config', async () => {
      const createRes = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          campaignId,
          title: 'Try and Review Budget Planner Mobile',
          description: 'Try the budgeting calculator app on Google Play and submit your testing feedback.',
          category: 'APP_INSTALL',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 250,
          totalCap: 20,
          dailyCapPerUser: 1,
          dwellTimeSeconds: 0,
          instructions: '1. Open the Play Store page. 2. Explore the calculator. 3. Submit testing feedback.',
          appInstallConfig: {
            appName: 'Budget Planner Safe',
            packageName: 'com.budget.planner.safe',
            storeUrl: 'https://play.google.com/store/apps/details?id=com.budget.planner.safe',
            testingSteps: '1. Launch app. 2. Create sample budget. 3. Return to review.',
            feedbackQuestion: 'How intuitive was creating your first monthly budget category?',
            attributionMethod: 'IN_APP_FEEDBACK',
            requiredTestingSeconds: 5,
          },
        }),
      });

      const createData: any = await createRes.json();
      assert.equal(createRes.status, 201);
      appTaskId = createData.data.task.id;
      disposableTaskIds.push(appTaskId);

      // Publish Task
      const pubRes = await fetch(`${baseUrl}/api/admin/tasks/${appTaskId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const pubData: any = await pubRes.json();
      assert.equal(pubRes.status, 200);
      assert.equal(pubData.data.task.status, 'PUBLISHED');
    });

    it('Starts assignment, records store visit, submits feedback, and credits points', async () => {
      // 1. Start Task Assignment
      const startRes = await fetch(`${baseUrl}/api/tasks/${appTaskId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const startData: any = await startRes.json();
      assert.equal(startRes.status, 201);

      // 2. Record Store Visit (intent launch)
      const storeRes = await fetch(`${baseUrl}/api/tasks/${appTaskId}/store-visit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const storeData: any = await storeRes.json();
      assert.equal(storeRes.status, 200);
      assert.equal(storeData.success, true);

      // 3. Submit In-App Feedback
      const feedbackRes = await fetch(`${baseUrl}/api/tasks/${appTaskId}/app-feedback/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({
          feedback: 'The budget categories were easy to navigate and transactions loaded without delay.',
          rating: 5,
        }),
      });
      const feedbackData: any = await feedbackRes.json();
      assert.equal(feedbackRes.status, 200);
      assert.equal(feedbackData.success, true);
      assert.equal(feedbackData.data.status, 'VERIFIED');
      assert.equal(feedbackData.data.rewardPoints, 250);

      // 4. Duplicate Feedback Rejection
      const dupFeedbackRes = await fetch(`${baseUrl}/api/tasks/${appTaskId}/app-feedback/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${earnerToken}` },
        body: JSON.stringify({
          feedback: 'Trying to submit feedback again.',
          rating: 5,
        }),
      });
      const dupFeedbackData: any = await dupFeedbackRes.json();
      assert.equal(dupFeedbackRes.status, 400);
      assert.equal(dupFeedbackData.error.code, 'TASK_ALREADY_COMPLETED');
    });
  });

  // ==========================================
  // 5. LIFECYCLE CONTROLS (Pause, Expire, Caps)
  // ==========================================
  describe('5. Lifecycle Controls: Pause, Expiry & Cap Enforcement', () => {
    it('Admin pauses task -> Task disappears from earner feed', async () => {
      // Create and publish task
      const createRes = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          campaignId,
          title: 'Temporary Lifecycle Test Task',
          description: 'Testing pause and feed sync',
          category: 'IN_APP_ACTION',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 50,
          totalCap: 10,
          dailyCapPerUser: 1,
          dwellTimeSeconds: 0,
        }),
      });
      const createData: any = await createRes.json();
      const tempTaskId = createData.data.task.id;
      disposableTaskIds.push(tempTaskId);

      await fetch(`${baseUrl}/api/admin/tasks/${tempTaskId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      // Pause task
      const pauseRes = await fetch(`${baseUrl}/api/admin/tasks/${tempTaskId}/pause`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const pauseData: any = await pauseRes.json();
      assert.equal(pauseRes.status, 200);
      assert.equal(pauseData.data.task.status, 'PAUSED');

      // Verify Feed Excludes Paused Task
      const feedRes = await fetch(`${baseUrl}/api/tasks/feed`, {
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const feedData: any = await feedRes.json();
      const isVisible = feedData.data.tasks.some((t: any) => t.id === tempTaskId);
      assert.equal(isVisible, false, 'Paused task must not be visible in feed');
    });

    it('Fails closed when task completion cap is exhausted', async () => {
      const capTask = await Task.create({
        campaignId: new Types.ObjectId(campaignId),
        title: 'Exhausted Cap Test Task',
        description: 'Cap testing',
        category: 'IN_APP_ACTION',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 50,
        totalCap: 1,
        completionsCount: 1, // Cap already met
        dailyCapPerUser: 1,
        dwellTimeSeconds: 0,
        status: 'PUBLISHED',
        createdBy: new Types.ObjectId(),
      });
      disposableTaskIds.push(capTask._id.toString());

      // Attempt to start capped task
      const startRes = await fetch(`${baseUrl}/api/tasks/${capTask._id}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${earnerToken}` },
      });
      const startData: any = await startRes.json();
      assert.equal(startRes.status, 400);
      assert.equal(startData.error.code, 'CAP_EXHAUSTED');
    });
  });
});
