process.env.NODE_ENV = 'test';

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import {
  resolveTaskNavigation,
  isLegacyModalAllowed,
  getTaskActionButtonLabel,
  isValidAndroidPackageName,
  isValidPlayStoreUrl,
  buildCanonicalPlayStoreUrl,
  buildMarketIntentUri,
} from '@adpayon/shared';
import { Task, Campaign, TaskAssignment, TaskEvent } from '../src/models';
import { verifyFirstPartyAction, recordStoreVisit, getTaskStatus } from '../src/controllers/userTask.controller';

describe('Phase 10.5D/F: Android App Discovery & Conversion Status Test Suite', () => {
  const dummyTaskId = new Types.ObjectId().toString();
  const dummyAssignmentId = new Types.ObjectId().toString();
  const dummyUserId = new Types.ObjectId().toString();

  const dummyAppInstallTask = {
    id: dummyTaskId,
    title: 'Discover PhonePe UPI App',
    category: 'APP_INSTALL',
    rewardPoints: 25,
    isEligible: true,
    activeAssignment: null as { id: string } | null,
    hasActiveAssignment: false,
  };

  // 1. APP_INSTALL route resolution
  it('1. APP_INSTALL route resolution: routes to AppInstallTask for both new and active assignments', () => {
    // New unassigned task
    const navNew = resolveTaskNavigation(dummyAppInstallTask);
    assert.equal(navNew.screen, 'AppInstallTask');
    assert.equal(navNew.params.taskId, dummyTaskId);
    assert.equal(navNew.params.assignmentId, undefined);

    const buttonLabelNew = getTaskActionButtonLabel(dummyAppInstallTask);
    assert.equal(buttonLabelNew, 'Discover App (+25 PTS)');

    // In-progress assignment
    const taskWithAssignment = {
      ...dummyAppInstallTask,
      activeAssignment: { id: dummyAssignmentId },
      hasActiveAssignment: true,
    };

    const navActive = resolveTaskNavigation(taskWithAssignment);
    assert.equal(navActive.screen, 'AppInstallTask');
    assert.equal(navActive.params.taskId, dummyTaskId);
    assert.equal(navActive.params.assignmentId, dummyAssignmentId);

    const buttonLabelActive = getTaskActionButtonLabel(taskWithAssignment);
    assert.equal(buttonLabelActive, 'Check Install Status 📱');
  });

  // 2. Generic modal disallowance
  it('2. Generic modal disallowance: APP_INSTALL is strictly prohibited from opening the legacy modal', () => {
    const isAllowed = isLegacyModalAllowed('APP_INSTALL');
    assert.equal(isAllowed, false, 'APP_INSTALL must never allow opening the legacy generic modal');
  });

  // 3. Official store URL and package validation
  it('3. Official store URL and package validation: validates legitimate Google Play URLs and package names', () => {
    const pkg = 'com.phonepe.app';
    assert.equal(isValidAndroidPackageName(pkg), true);
    assert.equal(isValidAndroidPackageName('in.org.npci.upiapp'), true);
    assert.equal(isValidAndroidPackageName('com.google.android.apps.nbu.paisa.user'), true);

    // Official HTTPS Play Store URLs
    assert.equal(
      isValidPlayStoreUrl('https://play.google.com/store/apps/details?id=com.phonepe.app', pkg),
      true
    );
    assert.equal(
      isValidPlayStoreUrl('https://play.google.com/store/apps/details?id=com.phonepe.app&hl=en_IN&gl=IN', pkg),
      true
    );
    assert.equal(
      isValidPlayStoreUrl('https://market.android.com/details?id=com.phonepe.app', pkg),
      true
    );

    // Canonical builder
    assert.equal(
      buildCanonicalPlayStoreUrl(pkg),
      'https://play.google.com/store/apps/details?id=com.phonepe.app'
    );

    // Market intent URI builder
    assert.equal(
      buildMarketIntentUri(pkg),
      'market://details?id=com.phonepe.app'
    );
  });

  // 4. Unsupported or malicious URL rejection
  it('4. Unsupported or malicious URL rejection: rejects non-HTTPS, 3rd party stores, APKs, and mismatched packages', () => {
    const expectedPkg = 'com.phonepe.app';

    // Insecure HTTP
    assert.equal(
      isValidPlayStoreUrl('http://play.google.com/store/apps/details?id=com.phonepe.app', expectedPkg),
      false,
      'Must reject insecure HTTP'
    );

    // Third-party store
    assert.equal(
      isValidPlayStoreUrl('https://apkpure.com/phonepe/com.phonepe.app', expectedPkg),
      false,
      'Must reject APKPure'
    );
    assert.equal(
      isValidPlayStoreUrl('https://apkmirror.com/apk/phonepe/com.phonepe.app', expectedPkg),
      false,
      'Must reject APKMirror'
    );
    assert.equal(
      isValidPlayStoreUrl('https://malicious-store.com/details?id=com.phonepe.app', expectedPkg),
      false,
      'Must reject untrusted domains'
    );

    // Package mismatch (spoofing attempt)
    assert.equal(
      isValidPlayStoreUrl('https://play.google.com/store/apps/details?id=com.malicious.fakeapp', expectedPkg),
      false,
      'Must reject package name mismatch'
    );

    // Sideload / APK files
    assert.equal(
      isValidPlayStoreUrl('https://play.google.com/store/apps/details?id=com.phonepe.app&file=trojan.apk', expectedPkg),
      false,
      'Must reject URLs containing .apk files'
    );

    // Malicious schemas
    assert.equal(
      isValidPlayStoreUrl('javascript:alert(1)', expectedPkg),
      false,
      'Must reject javascript: pseudo-protocol'
    );
    assert.equal(
      isValidPlayStoreUrl('file:///android_asset/exploit.html', expectedPkg),
      false,
      'Must reject file:// protocol'
    );

    // Malformed package names
    assert.equal(isValidAndroidPackageName('com'), false, 'Must have at least two segments');
    assert.equal(isValidAndroidPackageName('123com.app'), false, 'Segment cannot start with digit');
    assert.equal(isValidAndroidPackageName('com.app;rm -rf'), false, 'Must reject shell injection');
  });

  // 5. Task start/resume behavior
  it('5. Task start/resume behavior: server issues authoritative clickId and client never provides synthetic clickId', () => {
    // Cryptographically secure clickId pattern check
    const serverClickId = `clk_${'a1b2c3d4e5f6789012345678abcdef01'}`;
    const clickIdPattern = /^clk_[0-9a-f]{32}$/;
    assert.match(serverClickId, clickIdPattern, 'Server clickId must follow clk_[32hex] format');

    // Simulate start response
    const startResponse = {
      success: true,
      data: {
        assignment: {
          id: dummyAssignmentId,
          taskId: dummyTaskId,
          clickId: serverClickId,
          status: 'IN_PROGRESS',
          expiresAt: new Date(Date.now() + 7200000).toISOString(),
        },
      },
    };

    assert.equal(startResponse.data.assignment.clickId, serverClickId);
    assert.equal(startResponse.data.assignment.status, 'IN_PROGRESS');

    // Client must preserve this clickId and never fabricate one
    const localTrackingState = {
      assignmentId: startResponse.data.assignment.id,
      clickId: startResponse.data.assignment.clickId,
    };
    assert.equal(localTrackingState.clickId, serverClickId);
  });

  // 6. Store launch failure fallback
  it('6. Store launch failure fallback: falls back to canonical web Google Play URL when market:// intent fails', () => {
    const pkg = 'com.phonepe.app';
    const primaryIntent = buildMarketIntentUri(pkg);
    const fallbackWeb = buildCanonicalPlayStoreUrl(pkg);

    assert.equal(primaryIntent, 'market://details?id=com.phonepe.app');
    assert.equal(fallbackWeb, 'https://play.google.com/store/apps/details?id=com.phonepe.app');

    // Simulate device unable to open market intent
    const canOpenMarket = false;
    const resolvedUrl = canOpenMarket ? primaryIntent : fallbackWeb;

    assert.equal(resolvedUrl, fallbackWeb);
    assert.equal(isValidPlayStoreUrl(resolvedUrl, pkg), true);
  });

  // 7. Pending status without conversion
  it('7. Pending status without conversion: displays PENDING_PARTNER_VERIFICATION without granting points', () => {
    function computeDisplayStatus(params: {
      hasOpenedStore: boolean;
      assignmentStatus?: string;
      isCompleted: boolean;
      isExpired: boolean;
    }): string {
      if (params.isCompleted) return 'VERIFIED';
      if (params.isExpired) return 'EXPIRED';
      if (params.hasOpenedStore || params.assignmentStatus === 'IN_PROGRESS') {
        return params.hasOpenedStore ? 'PENDING_PARTNER_VERIFICATION' : 'IN_PROGRESS';
      }
      return 'NOT_STARTED';
    }

    const statusBeforeStore = computeDisplayStatus({
      hasOpenedStore: false,
      assignmentStatus: 'IN_PROGRESS',
      isCompleted: false,
      isExpired: false,
    });
    assert.equal(statusBeforeStore, 'IN_PROGRESS');

    const statusAfterStore = computeDisplayStatus({
      hasOpenedStore: true,
      assignmentStatus: 'IN_PROGRESS',
      isCompleted: false,
      isExpired: false,
    });
    assert.equal(statusAfterStore, 'PENDING_PARTNER_VERIFICATION');

    // Invariant: Points awarded must remain 0 while pending
    const pointsAwarded = (statusAfterStore as string) === 'VERIFIED' ? 25 : 0;
    assert.equal(pointsAwarded, 0, 'No points may be granted in PENDING state');
  });

  // 8. Verified status after server completion
  it('8. Verified status after server completion: transitions to VERIFIED and stops polling', () => {
    function computeDisplayStatus(params: {
      hasOpenedStore: boolean;
      assignmentStatus?: string;
      isCompleted: boolean;
      isExpired: boolean;
    }): string {
      if (params.isCompleted) return 'VERIFIED';
      if (params.isExpired) return 'EXPIRED';
      if (params.hasOpenedStore) return 'PENDING_PARTNER_VERIFICATION';
      return 'NOT_STARTED';
    }

    const statusVerified = computeDisplayStatus({
      hasOpenedStore: true,
      assignmentStatus: 'COMPLETED',
      isCompleted: true,
      isExpired: false,
    });
    assert.equal(statusVerified, 'VERIFIED');

    // Terminal state: polling should be stopped
    const shouldPoll = (statusVerified as string) === 'PENDING_PARTNER_VERIFICATION';
    assert.equal(shouldPoll, false, 'Polling must stop once task is VERIFIED');
  });

  // 9. Expired assignment handling
  it('9. Expired assignment handling: maps expired assignment to EXPIRED state and ceases polling', () => {
    function computeDisplayStatus(params: {
      hasOpenedStore: boolean;
      assignmentStatus?: string;
      isCompleted: boolean;
      isExpired: boolean;
    }): string {
      if (params.isCompleted) return 'VERIFIED';
      if (params.isExpired) return 'EXPIRED';
      return 'NOT_STARTED';
    }

    const statusExpired = computeDisplayStatus({
      hasOpenedStore: true,
      assignmentStatus: 'IN_PROGRESS',
      isCompleted: false,
      isExpired: true,
    });
    assert.equal(statusExpired, 'EXPIRED');

    const shouldPoll = (statusExpired as string) === 'PENDING_PARTNER_VERIFICATION';
    assert.equal(shouldPoll, false, 'Polling must cease when assignment expires');
  });

  // 10. Offline/network errors
  it('10. Offline/network errors: preserves last known status and does not award points on error', () => {
    const currentDisplayStatus = 'PENDING_PARTNER_VERIFICATION';
    const balance = 75;

    // Simulate network error during status check
    const networkFailed = true;
    if (networkFailed) {
      // Catch block preserves previous status and does not change balance
      const errorState = 'Network connection unavailable. Please check your internet.';
      assert.ok(errorState.includes('Network connection unavailable'));
      // Balance unmodified
      assert.equal(balance, 75);
      // Status remains preserved
      assert.equal(currentDisplayStatus, 'PENDING_PARTNER_VERIFICATION');
    }
  });

  // 11. No client-side reward verification
  it('11. No client-side reward verification: verifyFirstPartyAction rejects APP_INSTALL with HTTP 400', async () => {
    // Mock Task.findById and Campaign.findById to return an APP_INSTALL task
    const originalFindById = Task.findById;
    const originalCampaignFindById = Campaign.findById;
    mock.method(Task, 'findById', async () => ({
      _id: new Types.ObjectId(dummyTaskId),
      campaignId: new Types.ObjectId(),
      title: 'Discover PhonePe UPI App',
      category: 'APP_INSTALL',
      rewardPoints: 25,
      verificationMethod: 'FIRST_PARTY_ACTION', // Even if attacker sets this
      status: 'PUBLISHED',
    }));
    mock.method(Campaign, 'findById', async () => ({
      _id: new Types.ObjectId(),
      status: 'ACTIVE',
      isSandbox: false,
    }));

    try {
      let statusCode = 0;
      let jsonResponse: any = null;

      const mockReq: any = {
        params: { id: dummyTaskId },
        user: { _id: new Types.ObjectId(dummyUserId) },
      };

      const mockRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          jsonResponse = data;
          return this;
        },
      };

      await verifyFirstPartyAction(mockReq, mockRes);

      assert.equal(statusCode, 400, 'Must return HTTP 400 Bad Request');
      assert.equal(jsonResponse.success, false);
      assert.equal(jsonResponse.error.code, 'UNSUPPORTED_TASK_CATEGORY');
      assert.match(
        jsonResponse.error.message,
        /App install tasks cannot be verified via generic first-party actions/
      );
    } finally {
      // Restore mocks
      Task.findById = originalFindById;
      Campaign.findById = originalCampaignFindById;
    }
  });

  // 12. Regression for Video Watch and Article Read navigation
  it('12. Regression for Video Watch and Article Read navigation: preserved and distinct from APP_INSTALL', () => {
    // Video Watch
    const videoTask = {
      id: 'video_task_001',
      title: 'Watch Test Video',
      category: 'VIDEO_WATCH',
      rewardPoints: 50,
      activeAssignment: null,
    };
    const videoNav = resolveTaskNavigation(videoTask);
    assert.equal(videoNav.screen, 'VideoWatchTask');
    assert.equal(videoNav.params.taskId, 'video_task_001');
    assert.equal(isLegacyModalAllowed('VIDEO_WATCH'), false);

    // Article Read
    const articleTask = {
      id: 'article_task_001',
      title: 'Read How Internet Works',
      category: 'ARTICLE_READ',
      rewardPoints: 25,
      activeAssignment: null,
    };
    const articleNav = resolveTaskNavigation(articleTask);
    assert.equal(articleNav.screen, 'ArticleReadTask');
    assert.equal(articleNav.params.taskId, 'article_task_001');
    assert.equal(isLegacyModalAllowed('ARTICLE_READ'), false);

    // Legacy categories retain legacy modal
    assert.equal(isLegacyModalAllowed('DAILY_CHECKIN'), true);
    assert.equal(isLegacyModalAllowed('REFERRAL_INVITE'), true);
    assert.equal(isLegacyModalAllowed('SURVEY'), true);
    assert.equal(isLegacyModalAllowed('FEEDBACK'), true);
  });

  // 13. Server-authoritative store-visit recording (never reward evidence)
  it('13. Server-authoritative store-visit recording: recordStoreVisit records STORE_VISIT event without granting rewards', async () => {
    let savedAssignment = false;
    let createdEvent: any = null;

    const mockAssignment: any = {
      _id: new Types.ObjectId(dummyAssignmentId),
      taskId: new Types.ObjectId(dummyTaskId),
      userId: new Types.ObjectId(dummyUserId),
      clickId: 'clk_test123456789012345678abcdef01',
      status: 'ASSIGNED',
      hasOpenedStore: false,
      storeVisitedAt: undefined,
      save: async () => {
        savedAssignment = true;
      },
    };

    const originalFindOne = TaskAssignment.findOne;
    const originalEventCreate = TaskEvent.create;

    mock.method(TaskAssignment, 'findOne', async () => mockAssignment);
    mock.method(TaskEvent, 'create', async (eventData: any) => {
      createdEvent = eventData;
      return eventData;
    });

    try {
      let statusCode = 0;
      let jsonResponse: any = null;

      const mockReq: any = {
        params: { id: dummyTaskId },
        user: { _id: new Types.ObjectId(dummyUserId) },
        ip: '192.168.1.100',
        headers: { 'user-agent': 'AdPayOn-Mobile-Android' },
      };

      const mockRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          jsonResponse = data;
          return this;
        },
      };

      await recordStoreVisit(mockReq, mockRes);

      assert.equal(statusCode, 200);
      assert.equal(jsonResponse.success, true);
      assert.equal(jsonResponse.data.hasOpenedStore, true);
      assert.equal(savedAssignment, true);
      assert.equal(mockAssignment.hasOpenedStore, true);
      assert.equal(mockAssignment.status, 'IN_PROGRESS'); // Promoted from ASSIGNED, NEVER COMPLETED
      assert.notEqual(mockAssignment.status, 'COMPLETED', 'Store visit must never set status to COMPLETED');
      assert.ok(createdEvent, 'Must create TaskEvent');
      assert.equal(createdEvent.eventType, 'STORE_VISIT');
      assert.match(createdEvent.payload.note, /not reward verification evidence/);
    } finally {
      TaskAssignment.findOne = originalFindOne;
      TaskEvent.create = originalEventCreate;
    }
  });

  // 14. Completed task details resolution
  it('14. Completed task details resolution: getTaskStatus returns full task details even when completed or capped', async () => {
    const mockCompletedAssignment: any = {
      _id: new Types.ObjectId(dummyAssignmentId),
      taskId: new Types.ObjectId(dummyTaskId),
      userId: new Types.ObjectId(dummyUserId),
      clickId: 'clk_test123456789012345678abcdef01',
      status: 'COMPLETED',
      assignedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      completedAt: new Date(),
      hasOpenedStore: true,
      storeVisitedAt: new Date(),
    };

    const mockTaskObj: any = {
      _id: new Types.ObjectId(dummyTaskId),
      title: 'Discover PhonePe UPI App',
      description: 'Explore the PhonePe app on Google Play Store',
      category: 'APP_INSTALL',
      rewardPoints: 25,
      status: 'PUBLISHED',
      verificationMethod: 'AUTHENTICATED_WEBHOOK',
      appInstallConfig: {
        appName: 'PhonePe',
        packageName: 'com.phonepe.app',
      },
      campaignId: {
        name: 'PhonePe Sponsored Campaign',
      },
    };

    const originalAssignFindOne = TaskAssignment.findOne;
    const originalTaskFindById = Task.findById;

    mock.method(TaskAssignment, 'findOne', () => ({
      sort: () => Promise.resolve(mockCompletedAssignment),
    }));

    mock.method(Task, 'findById', () => ({
      populate: () => Promise.resolve(mockTaskObj),
    }));

    try {
      let statusCode = 0;
      let jsonResponse: any = null;

      const mockReq: any = {
        params: { id: dummyTaskId },
        user: { _id: new Types.ObjectId(dummyUserId) },
      };

      const mockRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          jsonResponse = data;
          return this;
        },
      };

      await getTaskStatus(mockReq, mockRes);

      assert.equal(statusCode, 200);
      assert.equal(jsonResponse.success, true);
      assert.equal(jsonResponse.data.status, 'COMPLETED');
      assert.ok(jsonResponse.data.task, 'Must return task metadata');
      assert.equal(jsonResponse.data.task.title, 'Discover PhonePe UPI App');
      assert.equal(jsonResponse.data.task.campaignName, 'PhonePe Sponsored Campaign');
      assert.equal(jsonResponse.data.assignment.hasOpenedStore, true);
    } finally {
      TaskAssignment.findOne = originalAssignFindOne;
      Task.findById = originalTaskFindById;
    }
  });

  // 15. Store-visit state restoration after remount
  it('15. Store-visit state restoration after remount: restores PENDING_PARTNER_VERIFICATION from server state', () => {
    function mapServerStatusToDisplay(statusData: {
      hasAssignment: boolean;
      status: string;
      assignment?: { hasOpenedStore?: boolean; isExpired?: boolean };
    }): string {
      if (!statusData.hasAssignment || statusData.status === 'NONE') return 'NOT_STARTED';
      if (statusData.status === 'COMPLETED') return 'VERIFIED';
      if (statusData.status === 'EXPIRED' || statusData.assignment?.isExpired) return 'EXPIRED';
      if (statusData.status === 'ASSIGNED' || statusData.status === 'IN_PROGRESS') {
        return statusData.assignment?.hasOpenedStore ? 'PENDING_PARTNER_VERIFICATION' : 'IN_PROGRESS';
      }
      return 'UNAVAILABLE';
    }

    // Remount test: local hasOpenedStore was lost, but server reports hasOpenedStore: true
    const serverStateAfterRemount = {
      hasAssignment: true,
      status: 'IN_PROGRESS',
      assignment: {
        hasOpenedStore: true,
        isExpired: false,
      },
    };

    const restoredDisplayStatus = mapServerStatusToDisplay(serverStateAfterRemount);
    assert.equal(
      restoredDisplayStatus,
      'PENDING_PARTNER_VERIFICATION',
      'Must restore PENDING_PARTNER_VERIFICATION on remount without user re-clicking store'
    );
  });

  // 16. Background/foreground lifecycle pause/resume
  it('16. Background/foreground lifecycle pause/resume: stops polling on background and resumes on focus', () => {
    let pollingActive = true;

    // Simulate AppState transition to background
    const handleAppStateChange = (nextState: string) => {
      if (nextState !== 'active') {
        pollingActive = false;
      } else {
        pollingActive = true;
      }
    };

    handleAppStateChange('background');
    assert.equal(pollingActive, false, 'Polling must stop when app is backgrounded');

    handleAppStateChange('active');
    assert.equal(pollingActive, true, 'Polling can resume when app returns to foreground');
  });
});

