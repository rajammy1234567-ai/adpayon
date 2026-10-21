process.env.NODE_ENV = 'test';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import mongoose, { Types } from 'mongoose';
import { app } from '../src/app';
import { User, Task } from '../src/models';
import { generateAccessToken } from '../src/services/tokenService';
import { assertTestDatabaseIsolation } from '../src/testUtils/dbIsolation';
import {
  resolveTaskNavigation,
  isLegacyModalAllowed,
  getTaskActionButtonLabel,
} from '@adpayon/shared';

describe('Phase 10.4C: Task Routing & Generic Verification Exclusion Regression Tests', () => {
  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';

  let testUserToken: string;
  const testUserId = new Types.ObjectId('6ad859805103f0ccee6479d5');
  const articleTaskId = '6ad887d5afd0e39b6cd0b4a4';
  const videoTaskId = '6ad85daab780b43f45236674';

  before(async () => {
    // 1. Strict Database Isolation
    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      isSuiteBlocked = true;
      blockReason = isolation.reason || 'Database isolation not configured';
      console.warn(`\n[BLOCKED TEST] Suite: ${blockReason}\n`);
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

    // 3. Generate access token for existing physical Android tester user
    const user = await User.findById(testUserId);
    if (user) {
      testUserToken = generateAccessToken({
        userId: user._id.toString(),
        role: user.role,
        mobile: user.mobile,
      });
    }
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  // --- UNIT TESTS: Navigation Resolution & Modal Disallowance ---

  it('1.1 resolveTaskNavigation routes ARTICLE_READ to ArticleReadTask', () => {
    const dest = resolveTaskNavigation({
      id: 'task123',
      category: 'ARTICLE_READ',
      activeAssignment: { id: 'assign456' },
    });

    assert.equal(dest.screen, 'ArticleReadTask');
    if (dest.screen === 'ArticleReadTask') {
      assert.equal(dest.params.taskId, 'task123');
      assert.equal(dest.params.assignmentId, 'assign456');
    }
  });

  it('1.2 resolveTaskNavigation routes VIDEO_WATCH to VideoWatchTask', () => {
    const dest = resolveTaskNavigation({
      id: 'task789',
      category: 'VIDEO_WATCH',
      activeAssignment: null,
    });

    assert.equal(dest.screen, 'VideoWatchTask');
    if (dest.screen === 'VideoWatchTask') {
      assert.equal(dest.params.taskId, 'task789');
      assert.equal(dest.params.assignmentId, undefined);
    }
  });

  it('1.3 resolveTaskNavigation is case-insensitive and trims whitespace', () => {
    const dest = resolveTaskNavigation({
      id: 'taskABC',
      category: '  article_read  ',
    });
    assert.equal(dest.screen, 'ArticleReadTask');

    const destVideo = resolveTaskNavigation({
      id: 'taskDEF',
      category: 'video_watch',
    });
    assert.equal(destVideo.screen, 'VideoWatchTask');
  });

  it('1.4 resolveTaskNavigation routes legacy categories to LegacyModal', () => {
    const legacyCategories = ['IN_APP_ACTION', 'PARTNER_WEBHOOK', 'SURVEY', 'MANUAL_VERIFY'];
    for (const cat of legacyCategories) {
      const dest = resolveTaskNavigation({
        id: 'legacyTask',
        category: cat,
      });
      assert.equal(dest.screen, 'LegacyModal', `Expected LegacyModal for ${cat}`);
    }
  });

  it('2.1 isLegacyModalAllowed disallows specialized categories', () => {
    assert.equal(isLegacyModalAllowed('ARTICLE_READ'), false);
    assert.equal(isLegacyModalAllowed('VIDEO_WATCH'), false);
    assert.equal(isLegacyModalAllowed('APP_INSTALL'), false);
    assert.equal(isLegacyModalAllowed('article_read'), false);
    assert.equal(isLegacyModalAllowed('video_watch'), false);
    assert.equal(isLegacyModalAllowed(null), false);
    assert.equal(isLegacyModalAllowed(undefined), false);
  });

  it('2.2 isLegacyModalAllowed permits supported legacy categories', () => {
    assert.equal(isLegacyModalAllowed('IN_APP_ACTION'), true);
    assert.equal(isLegacyModalAllowed('PARTNER_WEBHOOK'), true);
    assert.equal(isLegacyModalAllowed('SURVEY'), true);
    assert.equal(isLegacyModalAllowed('MANUAL_VERIFY'), true);
  });

  it('3.1 getTaskActionButtonLabel tailors label to category and state', () => {
    assert.equal(
      getTaskActionButtonLabel({ category: 'ARTICLE_READ', rewardPoints: 25, isEligible: true }),
      'Read Article (+25 PTS)'
    );
    assert.equal(
      getTaskActionButtonLabel({
        category: 'ARTICLE_READ',
        rewardPoints: 25,
        hasActiveAssignment: true,
        isEligible: true,
      }),
      'Resume Reading 📖'
    );
    assert.equal(
      getTaskActionButtonLabel({ category: 'VIDEO_WATCH', rewardPoints: 50, isEligible: true }),
      'Watch Video (+50 PTS)'
    );
    assert.equal(
      getTaskActionButtonLabel({
        category: 'VIDEO_WATCH',
        rewardPoints: 50,
        hasActiveAssignment: true,
        isEligible: true,
      }),
      'Resume Video 🎬'
    );
    assert.equal(
      getTaskActionButtonLabel({ category: 'IN_APP_ACTION', rewardPoints: 10, isEligible: true }),
      'Start Task (+10 PTS)'
    );
  });

  // --- INTEGRATION TESTS: Backend Security Invariants ---

  it('4.1 Generic POST /api/tasks/:id/verify-action fails closed on ARTICLE_READ (HTTP 400)', async (t) => {
    if (isSuiteBlocked || !testUserToken) {
      t.skip(blockReason || 'Test user not found');
      return;
    }

    const res = await fetch(`${baseUrl}/api/tasks/${articleTaskId}/verify-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        intervals: [{ start: Date.now() - 20000, end: Date.now() }],
      }),
    });

    const body: any = await res.json();
    assert.equal(res.status, 400, 'Must return HTTP 400 Bad Request');
    assert.equal(body.success, false);
    assert.equal(body.error?.code, 'UNSUPPORTED_TASK_CATEGORY');
    assert.match(body.error?.message, /dedicated article reader/i);
  });

  it('4.2 Generic POST /api/tasks/:id/verify-action fails closed on VIDEO_WATCH (HTTP 400)', async (t) => {
    if (isSuiteBlocked || !testUserToken) {
      t.skip(blockReason || 'Test user not found');
      return;
    }

    const res = await fetch(`${baseUrl}/api/tasks/${videoTaskId}/verify-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        intervals: [{ start: Date.now() - 20000, end: Date.now() }],
      }),
    });

    const body: any = await res.json();
    assert.equal(res.status, 400, 'Must return HTTP 400 Bad Request');
    assert.equal(body.success, false);
    assert.equal(body.error?.code, 'UNSUPPORTED_TASK_CATEGORY');
    assert.match(body.error?.message, /dedicated video playback/i);
  });

  it('5.1 GET /api/tasks/feed serializes exact ARTICLE_READ category and sanitizes quiz', async (t) => {
    if (isSuiteBlocked || !testUserToken) {
      t.skip(blockReason || 'Test user not found');
      return;
    }

    const res = await fetch(`${baseUrl}/api/tasks/feed`, {
      headers: {
        Authorization: `Bearer ${testUserToken}`,
      },
    });

    const body: any = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data?.tasks));

    const articleItem = body.data.tasks.find((t: any) => t.id === articleTaskId);
    assert.ok(articleItem, 'Article task must appear in feed');
    assert.equal(articleItem.category, 'ARTICLE_READ');
    assert.equal(articleItem.rewardPoints, 25);
    assert.ok(articleItem.articleReadConfig, 'articleReadConfig must be present');
    assert.equal(articleItem.articleReadConfig.minReadDurationSeconds, 15);
    assert.equal(articleItem.articleReadConfig.minScrollPercentage, 80);

    // Quiz options must be present but correctOptionIndex must be strictly omitted
    if (articleItem.articleReadConfig.comprehensionQuiz) {
      assert.ok(Array.isArray(articleItem.articleReadConfig.comprehensionQuiz.options));
      assert.equal(articleItem.articleReadConfig.comprehensionQuiz.options.length, 4);
      assert.equal(
        articleItem.articleReadConfig.comprehensionQuiz.correctOptionIndex,
        undefined,
        'correctOptionIndex must never be leaked to client'
      );
    }
  });
});
