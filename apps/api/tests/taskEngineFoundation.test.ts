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
} from '../src/models';
import { generateAccessToken } from '../src/services/tokenService';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from '../src/testUtils/dbIsolation';

describe('Phase 10.2: Shared Task Engine Backend Foundation Integration Tests', () => {
  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';

  const tracker = new TestOwnershipTracker();

  const runId = Math.floor(10000 + Math.random() * 90000);
  const adminMobile = `+917${runId}1001`;
  const user1Mobile = `+917${runId}1002`;

  let adminToken: string;
  let user1Token: string;

  let adminUser: any;
  let standardUser1: any;
  let testCampaignId: string;

  before(async () => {
    // 1. Strict Database Isolation
    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      isSuiteBlocked = true;
      blockReason = isolation.reason || 'Database isolation not configured';
      console.warn(`\n[BLOCKED INTEGRATION TEST] Task Engine Foundation Suite: ${blockReason}\n`);
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

    // 3. Setup test admin and user
    adminUser = await User.create({
      mobile: adminMobile,
      name: 'Foundation Admin',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashAdmin123',
      role: 'ADMIN',
      status: 'ACTIVE',
      referralCode: `ADM${runId.toString().slice(0, 5)}`,
    });
    tracker.trackUser(adminUser._id, adminMobile);
    adminToken = generateAccessToken({ userId: adminUser._id.toString(), role: adminUser.role, mobile: adminUser.mobile });

    standardUser1 = await User.create({
      mobile: user1Mobile,
      name: 'Foundation Earner',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashUser1',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `USR${runId.toString().slice(0, 5)}1`,
      metadata: { kycStatus: 'VERIFIED', language: 'en' },
    });
    tracker.trackUser(standardUser1._id, user1Mobile);
    user1Token = generateAccessToken({ userId: standardUser1._id.toString(), role: standardUser1.role, mobile: standardUser1.mobile });

    // 4. Create active campaign for tasks
    const campaign = await Campaign.create({
      name: 'Foundation Test Campaign',
      advertiserName: 'Global Ad Networks',
      advertiserBudgetPaise: 1000000,
      authorizedAgreementRef: 'AGR-FOUNDATION-001',
      webhookSecret: crypto.randomBytes(32).toString('hex'),
      status: 'ACTIVE',
      createdBy: adminUser._id,
    });
    tracker.trackCampaign(campaign._id);
    testCampaignId = campaign._id.toString();
  });

  after(async () => {
    if (isSuiteBlocked) {
      return;
    }

    await tracker.safeCleanup();

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  describe('1. Valid Configuration Creation & Serialization', () => {
    it('1.1 Creates valid APP_INSTALL task with SIGNED_POSTBACK and AUTHENTICATED_WEBHOOK', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: testCampaignId,
          title: 'Install FinTech App',
          description: 'Download and install the FinTech app from Google Play.',
          category: 'APP_INSTALL',
          verificationMethod: 'AUTHENTICATED_WEBHOOK',
          rewardPoints: 150,
          totalCap: 100,
          dailyCapPerUser: 1,
          appInstallConfig: {
            appName: 'FinTech India',
            packageName: 'com.fintech.india.app',
            platform: 'ANDROID',
            storeUrl: 'https://play.google.com/store/apps/details?id=com.fintech.india.app',
            attributionMethod: 'SIGNED_POSTBACK',
            conversionEvent: 'INSTALL',
          },
        }),
      });

      assert.equal(res.status, 201);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
      assert.equal(body.data.task.category, 'APP_INSTALL');
      assert.equal(body.data.task.verificationMethod, 'AUTHENTICATED_WEBHOOK');
      assert.equal(body.data.task.appInstallConfig.appName, 'FinTech India');
      assert.equal(body.data.task.appInstallConfig.platform, 'ANDROID');
      tracker.trackTask(body.data.task.id);
    });

    it('1.2 Creates valid VIDEO_WATCH task with playback constraints', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: testCampaignId,
          title: 'Watch Product Launch Trailer',
          description: 'Watch the full 60-second product demonstration.',
          category: 'VIDEO_WATCH',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 50,
          totalCap: 200,
          dailyCapPerUser: 2,
          videoWatchConfig: {
            videoUrl: 'https://media.adpayon.com/videos/product-launch.mp4',
            videoDurationSeconds: 60,
            requiredWatchSeconds: 45,
            allowSeeking: false,
            sessionTimeoutSeconds: 1800,
          },
        }),
      });

      assert.equal(res.status, 201);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
      assert.equal(body.data.task.category, 'VIDEO_WATCH');
      assert.equal(body.data.task.videoWatchConfig.requiredWatchSeconds, 45);
      assert.equal(body.data.task.videoWatchConfig.allowSeeking, false);
      tracker.trackTask(body.data.task.id);
    });

    it('1.3 Creates valid ARTICLE_READ task with comprehension quiz', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: testCampaignId,
          title: 'Read Financial Literacy Guide',
          description: 'Learn the essentials of personal budgeting.',
          category: 'ARTICLE_READ',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 75,
          totalCap: 500,
          dailyCapPerUser: 1,
          articleReadConfig: {
            articleTitle: 'Understanding Compound Interest and Budgeting',
            articleContent: 'Compound interest is the addition of interest to the principal sum of a loan or deposit. It is interest on interest.',
            sourceUrl: 'https://finance.example.com/guides/budgeting',
            minReadDurationSeconds: 45,
            minScrollPercentage: 80,
            comprehensionQuiz: {
              question: 'What is compound interest?',
              options: ['Interest on interest', 'A flat fee', 'A government tax', 'Zero return'],
              correctOptionIndex: 0,
            },
          },
        }),
      });

      assert.equal(res.status, 201);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
      assert.equal(body.data.task.category, 'ARTICLE_READ');
      assert.equal(body.data.task.articleReadConfig.minScrollPercentage, 80);
      assert.equal(body.data.task.articleReadConfig.comprehensionQuiz.question, 'What is compound interest?');
      assert.equal(body.data.task.articleReadConfig.comprehensionQuiz.correctOptionIndex, 0);
      tracker.trackTask(body.data.task.id);
    });
  });

  describe('2. Missing Required Fields & Category Mismatches', () => {
    it('2.1 Rejects APP_INSTALL task when appInstallConfig is missing', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: testCampaignId,
          title: 'Missing Config Task',
          category: 'APP_INSTALL',
          verificationMethod: 'AUTHENTICATED_WEBHOOK',
          rewardPoints: 100,
          totalCap: 10,
        }),
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.ok(body.error.fieldErrors['appInstallConfig']);
    });

    it('2.2 Rejects APP_INSTALL task when configured with FIRST_PARTY_ACTION', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: testCampaignId,
          title: 'Insecure Install Task',
          category: 'APP_INSTALL',
          verificationMethod: 'FIRST_PARTY_ACTION', // Forbidden for installs!
          rewardPoints: 100,
          totalCap: 10,
          appInstallConfig: {
            appName: 'Fake App',
            packageName: 'com.fake.app',
            platform: 'ANDROID',
            storeUrl: 'https://play.google.com/store/apps/details?id=com.fake.app',
            attributionMethod: 'SIGNED_POSTBACK',
            conversionEvent: 'INSTALL',
          },
        }),
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.ok(body.error.fieldErrors['verificationMethod']);
    });

    it('2.3 Rejects APP_INSTALL with videoWatchConfig (mismatch)', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: testCampaignId,
          title: 'Mismatched Task',
          category: 'APP_INSTALL',
          verificationMethod: 'AUTHENTICATED_WEBHOOK',
          rewardPoints: 100,
          totalCap: 10,
          appInstallConfig: {
            appName: 'App Name',
            packageName: 'com.app.name',
            platform: 'ANDROID',
            storeUrl: 'https://play.google.com/store/apps/details?id=com.app.name',
            attributionMethod: 'SIGNED_POSTBACK',
            conversionEvent: 'INSTALL',
          },
          videoWatchConfig: {
            videoUrl: 'https://videos.example.com/test.mp4',
            videoDurationSeconds: 60,
            requiredWatchSeconds: 30,
            allowSeeking: false,
          },
        }),
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.ok(body.error.fieldErrors['videoWatchConfig']);
    });

    it('2.4 Rejects legacy IN_APP_ACTION task with appInstallConfig', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: testCampaignId,
          title: 'Legacy Action with Illegal Config',
          category: 'IN_APP_ACTION',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 20,
          totalCap: 50,
          appInstallConfig: {
            appName: 'Illegal App',
            packageName: 'com.illegal.app',
            platform: 'ANDROID',
            storeUrl: 'https://play.google.com/store/apps/details?id=com.illegal.app',
            attributionMethod: 'SIGNED_POSTBACK',
            conversionEvent: 'INSTALL',
          },
        }),
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.ok(body.error.fieldErrors['appInstallConfig']);
    });
  });

  describe('3. Anti-SSRF and URL Validation', () => {
    it('3.1 Rejects localhost URL in storeUrl', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: testCampaignId,
          title: 'Localhost SSRF Attempt',
          category: 'APP_INSTALL',
          verificationMethod: 'AUTHENTICATED_WEBHOOK',
          rewardPoints: 50,
          totalCap: 10,
          appInstallConfig: {
            appName: 'SSRF App',
            packageName: 'com.ssrf.app',
            platform: 'ANDROID',
            storeUrl: 'http://localhost:8080/exploit',
            attributionMethod: 'SIGNED_POSTBACK',
            conversionEvent: 'INSTALL',
          },
        }),
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.equal(body.success, false);
      assert.ok(body.error.fieldErrors['appInstallConfig.storeUrl']);
    });

    it('3.2 Rejects 169.254.169.254 (Cloud metadata) in videoUrl', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: testCampaignId,
          title: 'Cloud Metadata SSRF Attempt',
          category: 'VIDEO_WATCH',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 50,
          totalCap: 10,
          videoWatchConfig: {
            videoUrl: 'http://169.254.169.254/latest/meta-data',
            videoDurationSeconds: 30,
            requiredWatchSeconds: 20,
            allowSeeking: false,
          },
        }),
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.equal(body.success, false);
      assert.ok(body.error.fieldErrors['videoWatchConfig.videoUrl']);
    });

    it('3.3 Rejects private 192.168.x.x IP address in sourceUrl', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: testCampaignId,
          title: 'Private IP Attempt',
          category: 'ARTICLE_READ',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 50,
          totalCap: 10,
          articleReadConfig: {
            articleTitle: 'Private Article',
            articleContent: 'Legitimate content for testing private IP filtering in source URL.',
            sourceUrl: 'http://192.168.1.100/article.html',
            minReadDurationSeconds: 15,
            minScrollPercentage: 50,
          },
        }),
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.equal(body.success, false);
      assert.ok(body.error.fieldErrors['articleReadConfig.sourceUrl']);
    });
  });

  describe('4. Invalid Durations and Percentages', () => {
    it('4.1 Rejects requiredWatchSeconds exceeding videoDurationSeconds', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: testCampaignId,
          title: 'Excessive Watch Seconds',
          category: 'VIDEO_WATCH',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 50,
          totalCap: 10,
          videoWatchConfig: {
            videoUrl: 'https://cdn.example.com/video.mp4',
            videoDurationSeconds: 60,
            requiredWatchSeconds: 90, // Invalid: exceeds duration
            allowSeeking: false,
          },
        }),
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.equal(body.success, false);
      assert.ok(body.error.fieldErrors['videoWatchConfig.requiredWatchSeconds']);
    });

    it('4.2 Rejects minScrollPercentage outside 1-100 range', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: testCampaignId,
          title: 'Invalid Scroll Percentage',
          category: 'ARTICLE_READ',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 50,
          totalCap: 10,
          articleReadConfig: {
            articleTitle: 'Article Title',
            articleContent: 'Article content of sufficient length for test validation purposes.',
            minReadDurationSeconds: 10,
            minScrollPercentage: 150, // Invalid: > 100
          },
        }),
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.equal(body.success, false);
      assert.ok(body.error.fieldErrors['articleReadConfig.minScrollPercentage']);
    });
  });

  describe('5. Quiz Configuration & Content Sanitization', () => {
    it('5.1 Rejects quiz correctOptionIndex pointing out of options bounds', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: testCampaignId,
          title: 'Out of Bounds Quiz Index',
          category: 'ARTICLE_READ',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 50,
          totalCap: 10,
          articleReadConfig: {
            articleTitle: 'Quiz Article',
            articleContent: 'Sufficient content for testing quiz bounds validation in schema.',
            minReadDurationSeconds: 10,
            minScrollPercentage: 70,
            comprehensionQuiz: {
              question: 'Which option is correct?',
              options: ['Option A', 'Option B'], // Length 2
              correctOptionIndex: 5, // Invalid: >= options.length
            },
          },
        }),
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.equal(body.success, false);
      assert.ok(body.error.fieldErrors['articleReadConfig.comprehensionQuiz.correctOptionIndex']);
    });

    it('5.2 Rejects dangerous script tags in article content (XSS protection)', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: testCampaignId,
          title: 'Dangerous Content Article',
          category: 'ARTICLE_READ',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 50,
          totalCap: 10,
          articleReadConfig: {
            articleTitle: 'XSS Article',
            articleContent: '<script>alert("hacked")</script>Dangerous payload execution test.',
            minReadDurationSeconds: 10,
            minScrollPercentage: 70,
          },
        }),
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.equal(body.success, false);
      assert.ok(body.error.fieldErrors['articleReadConfig.articleContent']);
    });
  });

  describe('6. Client Serialization & Secret Leakage Prevention', () => {
    let publishedArticleTaskId: string;

    before(async () => {
      if (isSuiteBlocked) return;

      const task = await Task.create({
        campaignId: testCampaignId,
        title: 'Published Quiz Article for Feed Inspection',
        description: 'Read and answer the comprehension quiz.',
        category: 'ARTICLE_READ',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 80,
        status: 'PUBLISHED',
        totalCap: 100,
        completionsCount: 0,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 15,
        articleReadConfig: {
          articleTitle: 'Secret Quiz Answers Test',
          articleContent: 'Valid informative text designed to confirm answer omission on feed.',
          minReadDurationSeconds: 15,
          minScrollPercentage: 80,
          comprehensionQuiz: {
            question: 'What is 2 + 2?',
            options: ['3', '4', '5'],
            correctOptionIndex: 1, // Must NEVER be exposed to user
          },
        },
        createdBy: adminUser._id,
      });
      tracker.trackTask(task._id);
      publishedArticleTaskId = task._id.toString();
    });

    it('6.1 User feed strictly DOES NOT leak correctOptionIndex or secrets', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const res = await fetch(`${baseUrl}/api/tasks/feed`, {
        headers: {
          Authorization: `Bearer ${user1Token}`,
        },
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data.tasks));

      const found = body.data.tasks.find((taskItem: any) => taskItem.id === publishedArticleTaskId);
      assert.ok(found, 'Published article task must appear in feed');
      assert.equal(found.articleReadConfig.articleTitle, 'Secret Quiz Answers Test');
      assert.ok(found.articleReadConfig.comprehensionQuiz);
      assert.equal(found.articleReadConfig.comprehensionQuiz.question, 'What is 2 + 2?');
      assert.deepEqual(found.articleReadConfig.comprehensionQuiz.options, ['3', '4', '5']);

      // CRITICAL SECURITY ASSERTION: correctOptionIndex must be undefined in client payload
      assert.strictEqual(
        found.articleReadConfig.comprehensionQuiz.correctOptionIndex,
        undefined,
        'CRITICAL SECURITY BREACH: correctOptionIndex was leaked to the user feed!'
      );

      // Verify no campaign secret is exposed
      assert.strictEqual(found.webhookSecret, undefined);
      assert.strictEqual(found.campaignSecret, undefined);
    });
  });

  describe('7. Verification Safety & Fail-Closed Behavior', () => {
    let installTaskId: string;
    let videoTaskId: string;
    let articleTaskId: string;

    before(async () => {
      if (isSuiteBlocked) return;

      const installTask = await Task.create({
        campaignId: testCampaignId,
        title: 'Published App Install Task',
        description: 'Test install attribution security.',
        category: 'APP_INSTALL',
        verificationMethod: 'AUTHENTICATED_WEBHOOK',
        rewardPoints: 100,
        status: 'PUBLISHED',
        totalCap: 100,
        completionsCount: 0,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 0,
        appInstallConfig: {
          appName: 'Protected App',
          packageName: 'com.protected.app',
          platform: 'ANDROID',
          storeUrl: 'https://play.google.com/store/apps/details?id=com.protected.app',
          attributionMethod: 'SIGNED_POSTBACK',
          conversionEvent: 'INSTALL',
        },
        createdBy: adminUser._id,
      });
      tracker.trackTask(installTask._id);
      installTaskId = installTask._id.toString();

      const videoTask = await Task.create({
        campaignId: testCampaignId,
        title: 'Published Video Watch Task',
        description: 'Test video verification safety.',
        category: 'VIDEO_WATCH',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 50,
        status: 'PUBLISHED',
        totalCap: 100,
        completionsCount: 0,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 10,
        videoWatchConfig: {
          videoUrl: 'https://videos.example.com/protected.mp4',
          videoDurationSeconds: 30,
          requiredWatchSeconds: 20,
          allowSeeking: false,
        },
        createdBy: adminUser._id,
      });
      tracker.trackTask(videoTask._id);
      videoTaskId = videoTask._id.toString();

      const articleTask = await Task.create({
        campaignId: testCampaignId,
        title: 'Published Article Task',
        description: 'Test article verification safety.',
        category: 'ARTICLE_READ',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 40,
        status: 'PUBLISHED',
        totalCap: 100,
        completionsCount: 0,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 10,
        articleReadConfig: {
          articleTitle: 'Protected Article',
          articleContent: 'Informational content verifying telemetry protections.',
          minReadDurationSeconds: 10,
          minScrollPercentage: 80,
        },
        createdBy: adminUser._id,
      });
      tracker.trackTask(articleTask._id);
      articleTaskId = articleTask._id.toString();
    });

    it('7.1 Calling verifyFirstPartyAction on APP_INSTALL fails closed (HTTP 400)', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      // Start task assignment first
      const startRes = await fetch(`${baseUrl}/api/tasks/${installTaskId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` },
      });
      assert.equal(startRes.status, 201);
      const startBody = (await startRes.json()) as any;
      tracker.trackAssignment(startBody.data.assignment.id);

      // Attempt to verify via generic first-party action
      const verifyRes = await fetch(`${baseUrl}/api/tasks/${installTaskId}/verify-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user1Token}`,
        },
        body: JSON.stringify({
          assignmentId: startBody.data.assignment.id,
        }),
      });

      assert.equal(verifyRes.status, 400);
      const verifyBody = (await verifyRes.json()) as any;
      assert.equal(verifyBody.success, false);
      assert.ok(
        verifyBody.error.code === 'METHOD_NOT_SUPPORTED' ||
        verifyBody.error.code === 'UNSUPPORTED_TASK_CATEGORY'
      );
    });

    it('7.2 Calling verifyFirstPartyAction on VIDEO_WATCH fails closed (HTTP 400)', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const startRes = await fetch(`${baseUrl}/api/tasks/${videoTaskId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` },
      });
      assert.equal(startRes.status, 201);
      const startBody = (await startRes.json()) as any;
      tracker.trackAssignment(startBody.data.assignment.id);

      const verifyRes = await fetch(`${baseUrl}/api/tasks/${videoTaskId}/verify-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user1Token}`,
        },
        body: JSON.stringify({
          assignmentId: startBody.data.assignment.id,
        }),
      });

      assert.equal(verifyRes.status, 400);
      const verifyBody = (await verifyRes.json()) as any;
      assert.equal(verifyBody.success, false);
      assert.equal(verifyBody.error.code, 'UNSUPPORTED_TASK_CATEGORY');
    });

    it('7.3 Calling verifyFirstPartyAction on ARTICLE_READ fails closed (HTTP 400)', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      const startRes = await fetch(`${baseUrl}/api/tasks/${articleTaskId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` },
      });
      assert.equal(startRes.status, 201);
      const startBody = (await startRes.json()) as any;
      tracker.trackAssignment(startBody.data.assignment.id);

      const verifyRes = await fetch(`${baseUrl}/api/tasks/${articleTaskId}/verify-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user1Token}`,
        },
        body: JSON.stringify({
          assignmentId: startBody.data.assignment.id,
        }),
      });

      assert.equal(verifyRes.status, 400);
      const verifyBody = (await verifyRes.json()) as any;
      assert.equal(verifyBody.success, false);
      assert.equal(verifyBody.error.code, 'UNSUPPORTED_TASK_CATEGORY');
    });

    it('7.4 Legacy IN_APP_ACTION tasks continue functioning unchanged', async (t) => {
      if (isSuiteBlocked) {
        t.skip(blockReason);
        return;
      }

      // Create and publish a legacy task with dwellTimeSeconds = 0 for instant verification
      const legacyTask = await Task.create({
        campaignId: testCampaignId,
        title: 'Legacy In-App Action Task',
        description: 'Complete in-app action for testing backward compatibility.',
        category: 'IN_APP_ACTION',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 25,
        status: 'PUBLISHED',
        totalCap: 50,
        completionsCount: 0,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 0,
        createdBy: adminUser._id,
      });
      tracker.trackTask(legacyTask._id);

      const startRes = await fetch(`${baseUrl}/api/tasks/${legacyTask._id}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` },
      });
      assert.equal(startRes.status, 201);
      const startBody = (await startRes.json()) as any;
      tracker.trackAssignment(startBody.data.assignment.id);

      const verifyRes = await fetch(`${baseUrl}/api/tasks/${legacyTask._id}/verify-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user1Token}`,
        },
        body: JSON.stringify({
          assignmentId: startBody.data.assignment.id,
        }),
      });

      assert.equal(verifyRes.status, 200);
      const verifyBody = (await verifyRes.json()) as any;
      assert.equal(verifyBody.success, true);
      assert.equal(verifyBody.data.completion.rewardPoints, 25);
      tracker.trackCompletion(verifyBody.data.completion.id);
    });
  });
});
