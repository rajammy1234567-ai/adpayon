import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.client_staging') });

const API_BASE = 'http://127.0.0.1:5173/api';

async function step(name, fn) {
  console.log(`\n======================================================`);
  console.log(`>>> STEP: ${name}`);
  console.log(`======================================================`);
  return await fn();
}

async function run() {
  console.log('--- STARTING ADPAYON PHASE 3: ADMIN-TO-MOBILE REAL SYNCHRONIZATION TEST ---');

  // 1. Authenticate Admin
  let adminToken;
  await step('1. Authenticate Admin via 2FA', async () => {
    const loginRes = await fetch(`${API_BASE}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: '+919876543210',
        password: 'StagingAdmin!2026Secure',
      }),
    });
    const loginData = await loginRes.json();
    if (!loginData.success || !loginData.data?.mfaSessionToken) {
      throw new Error(`Admin login failed: ${JSON.stringify(loginData)}`);
    }

    const { lookupStagingReviewerOtp } = await import('./dist/src/scripts/lookupStagingReviewerOtp.js');
    const otp = await lookupStagingReviewerOtp('+919876543210');
    if (!otp) throw new Error('Could not retrieve Admin OTP from staging DB');

    const verifyRes = await fetch(`${API_BASE}/admin/auth/mfa-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mfaSessionToken: loginData.data.mfaSessionToken,
        otp,
      }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success || !verifyData.data?.accessToken) {
      throw new Error(`Admin MFA verification failed: ${JSON.stringify(verifyData)}`);
    }
    adminToken = verifyData.data.accessToken;
    console.log('[PASS] Admin authenticated successfully.');
  });

  const adminHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };

  // 2. Authenticate Mobile Test User (+917999900001)
  let userToken;
  let userId;
  const userMobile = '+917999900001';
  const userPassword = 'TestUser123!Secure';

  await step('2. Authenticate Mobile Earner (+917999900001)', async () => {
    // Try login first
    let userLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: userMobile,
        password: userPassword,
      }),
    });
    let userLoginData = await userLoginRes.json();

    if (!userLoginData.success) {
      console.log('User does not exist or not active. Registering new mobile user...');
      const regRes = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Mobile E2E Test Earner',
          mobile: userMobile,
          password: userPassword,
          acceptTerms: true,
        }),
      });
      const regData = await regRes.json();
      console.log('Registration Response:', regRes.status, regData);

      // Lookup OTP from DB
      const { lookupStagingReviewerOtp } = await import('./dist/src/scripts/lookupStagingReviewerOtp.js');
      const regOtp = await lookupStagingReviewerOtp(userMobile);
      if (!regOtp) throw new Error('Could not retrieve registration OTP from staging DB');

      // Verify OTP
      const verifyRegRes = await fetch(`${API_BASE}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile: userMobile,
          otp: regOtp,
          purpose: 'REGISTRATION',
        }),
      });
      userLoginData = await verifyRegRes.json();
      console.log('Verification Response:', verifyRegRes.status, userLoginData);
    }

    if (!userLoginData.success || !userLoginData.data?.tokens?.accessToken) {
      throw new Error(`User authentication failed: ${JSON.stringify(userLoginData)}`);
    }

    userToken = userLoginData.data.tokens.accessToken;
    userId = userLoginData.data.user.id;
    console.log(`[PASS] Mobile user authenticated. User ID: ${userId}`);
  });

  const userHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${userToken}`,
  };

  // Step A: Create a new test campaign in Admin
  let campaignId;
  await step('Step A: Create new test campaign in Admin', async () => {
    const res = await fetch(`${API_BASE}/admin/campaigns`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: `Sync Verification Campaign ${Date.now()}`,
        advertiserName: 'National Financial Security Council',
        advertiserBudgetPaise: 5000000,
        authorizedAgreementRef: `AGR-SYNC-${Date.now()}`,
      }),
    });
    const data = await res.json();
    if (!data.success || !data.data?.campaign?.id) {
      throw new Error(`Failed to create campaign: ${JSON.stringify(data)}`);
    }
    campaignId = data.data.campaign.id;
    console.log(`[PASS] Campaign created successfully. Campaign ID: ${campaignId}`);

    // Activate the campaign so child tasks can be published
    const activateRes = await fetch(`${API_BASE}/admin/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    const actData = await activateRes.json();
    if (!actData.success || actData.data?.campaign?.status !== 'ACTIVE') {
      throw new Error(`Failed to activate campaign: ${JSON.stringify(actData)}`);
    }
    console.log(`[PASS] Campaign activated successfully. Current Status: ${actData.data.campaign.status}`);
  });

  // Step B & C: Create a task associated with that campaign
  let taskId;
  await step('Step B & C: Create Task Specification (Article Read & Quiz)', async () => {
    const res = await fetch(`${API_BASE}/admin/tasks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        campaignId,
        title: 'UPI & Payment Safety Guide',
        description: 'Learn how to protect your mobile bank account and UPI transactions.',
        instructions: '1. Read article for 30s.\n2. Scroll fully.\n3. Answer quiz to earn points.',
        category: 'ARTICLE_READ',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 150,
        totalCap: 500,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 5,
        articleReadConfig: {
          articleTitle: 'Understanding UPI Two-Factor Safety',
          articleContent: 'UPI PIN is only required to SEND money, never to RECEIVE money. Always verify the payee name on your screen before typing your PIN.',
          minReadDurationSeconds: 5,
          minScrollPercentage: 50,
          comprehensionQuiz: {
            question: 'When is your UPI PIN required on your smartphone?',
            options: [
              'Only when sending money or checking bank balance',
              'Whenever someone transfers money to you',
              'When scanning a QR code to claim a lottery prize',
              'Whenever an unknown caller asks for verification',
            ],
            correctOptionIndex: 0,
          },
        },
      }),
    });
    const data = await res.json();
    if (!data.success || !data.data?.task?.id) {
      throw new Error(`Failed to create task: ${JSON.stringify(data)}`);
    }
    taskId = data.data.task.id;
    console.log(`[PASS] Task draft created successfully. Task ID: ${taskId}, Status: ${data.data.task.status}`);
  });

  // Step D: Publish the task
  await step('Step D: Publish Task via Admin Portal', async () => {
    const res = await fetch(`${API_BASE}/admin/tasks/${taskId}/publish`, {
      method: 'POST',
      headers: adminHeaders,
    });
    const data = await res.json();
    if (!data.success || data.data?.task?.status !== 'PUBLISHED') {
      throw new Error(`Failed to publish task: ${JSON.stringify(data)}`);
    }
    console.log(`[PASS] Task published successfully. Current Status: ${data.data.task.status}`);
  });

  // Step E: Confirm it becomes visible to eligible Android test user
  await step('Step E: Mobile User Feed Discovery', async () => {
    const res = await fetch(`${API_BASE}/tasks/feed`, { headers: userHeaders });
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data?.tasks)) {
      throw new Error(`User task feed query failed: ${JSON.stringify(data)}`);
    }
    const found = data.data.tasks.find((t) => t.id === taskId);
    if (!found) {
      throw new Error(`Published task ${taskId} not found in user feed!`);
    }
    if (!found.isEligible) {
      throw new Error(`Task found in feed but marked ineligible: ${found.ineligibilityReason}`);
    }
    console.log(`[PASS] Task discovered in mobile feed: "${found.title}" (+${found.rewardPoints} PTS)`);
  });

  // Step F & G: Modify title and verify synchronization
  const updatedTitle = 'UPI & Payment Safety Guide (2026 Edition)';
  await step('Step F & G: Modify Task Configuration in Admin & Verify Mobile Live Sync', async () => {
    const updateRes = await fetch(`${API_BASE}/admin/tasks/${taskId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        title: updatedTitle,
        description: 'Updated comprehensive safety guide for instant payments.',
      }),
    });
    const updateData = await updateRes.json();
    if (!updateData.success || updateData.data?.task?.title !== updatedTitle) {
      throw new Error(`Admin task update failed: ${JSON.stringify(updateData)}`);
    }
    console.log(`[PASS] Task updated in Admin. New Title: "${updateData.data.task.title}"`);

    // Verify user re-fetch reflects update
    const feedRes = await fetch(`${API_BASE}/tasks/feed`, { headers: userHeaders });
    const feedData = await feedRes.json();
    const updatedTaskInFeed = feedData.data.tasks.find((t) => t.id === taskId);
    if (!updatedTaskInFeed || updatedTaskInFeed.title !== updatedTitle) {
      throw new Error(`Feed does not reflect updated title: ${updatedTaskInFeed?.title}`);
    }
    console.log(`[PASS] Mobile feed verified with synchronized title: "${updatedTaskInFeed.title}"`);
  });

  // Step H: Pause the task and verify participation rules are enforced
  await step('Step H: Pause Task & Verify Participation Rejection', async () => {
    const pauseRes = await fetch(`${API_BASE}/admin/tasks/${taskId}/pause`, {
      method: 'POST',
      headers: adminHeaders,
    });
    const pauseData = await pauseRes.json();
    if (!pauseData.success || pauseData.data?.task?.status !== 'PAUSED') {
      throw new Error(`Failed to pause task: ${JSON.stringify(pauseData)}`);
    }
    console.log(`[PASS] Task paused in Admin. Status: ${pauseData.data.task.status}`);

    // Attempt start from mobile app
    const startRes = await fetch(`${API_BASE}/tasks/${taskId}/start`, {
      method: 'POST',
      headers: userHeaders,
    });
    const startData = await startRes.json();
    if (startRes.status === 200 && startData.success) {
      throw new Error(`SECURITY VIOLATION: Paused task allowed start!`);
    }
    console.log(`[PASS] Paused task correctly rejected attempt with HTTP ${startRes.status}: ${startData.error?.message}`);
  });

  // Step I: Resume the task and claim assignment
  let assignmentId;
  let clickId;
  await step('Step I: Resume Task & Claim Assignment Slot', async () => {
    const resumeRes = await fetch(`${API_BASE}/admin/tasks/${taskId}/publish`, {
      method: 'POST',
      headers: adminHeaders,
    });
    const resumeData = await resumeRes.json();
    if (!resumeData.success || resumeData.data?.task?.status !== 'PUBLISHED') {
      throw new Error(`Failed to resume task: ${JSON.stringify(resumeData)}`);
    }

    const startRes = await fetch(`${API_BASE}/tasks/${taskId}/start`, {
      method: 'POST',
      headers: userHeaders,
    });
    const startData = await startRes.json();
    if (!startData.success || !startData.data?.assignment?.id) {
      throw new Error(`Failed to claim task assignment: ${JSON.stringify(startData)}`);
    }
    assignmentId = startData.data.assignment.id;
    clickId = startData.data.assignment.clickId;
    console.log(`[PASS] Assignment slot claimed. Assignment ID: ${assignmentId}, Click ID: ${clickId}`);
  });

  // Step J: Submit task completion evidence from mobile app
  let completionId;
  await step('Step J: User Completes Article Reading & Verification Quiz', async () => {
    // 1. Start article watchdog session
    const sessionRes = await fetch(`${API_BASE}/tasks/${taskId}/article-session/start`, {
      method: 'POST',
      headers: userHeaders,
    });
    const sessionData = await sessionRes.json();
    if (!sessionData.success || !sessionData.data?.sessionId) {
      throw new Error(`Failed to start article reading session: ${JSON.stringify(sessionData)}`);
    }
    const { sessionId } = sessionData.data;

    // 2. Wait for real server wall-clock reading time (5.5s)
    await new Promise((r) => setTimeout(r, 5500));

    // 3. Submit reading progress (5.5 seconds, 90% scroll, active app)
    const progressRes = await fetch(`${API_BASE}/tasks/${taskId}/article-session/progress`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({
        sessionId,
        appState: 'active',
        readingDeltaSeconds: 5.5,
        scrollPercentage: 90,
      }),
    });
    const progressData = await progressRes.json();
    if (!progressData.success || progressData.data?.remainingReadSeconds > 0) {
      throw new Error(`Reading progress did not satisfy requirements: ${JSON.stringify(progressData)}`);
    }

    // 4. Submit quiz answer (index 0 is correct)
    const quizRes = await fetch(`${API_BASE}/tasks/${taskId}/article-session/quiz`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({
        sessionId,
        selectedOptionIndex: 0,
      }),
    });
    const quizData = await quizRes.json();
    if (!quizData.success || !quizData.data?.correct) {
      throw new Error(`Quiz submission failed or answer rejected: ${JSON.stringify(quizData)}`);
    }

    // 5. Verify & claim points atomically
    const verifyRes = await fetch(`${API_BASE}/tasks/${taskId}/article-session/verify`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({ sessionId }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success || !verifyData.data?.completion?.id) {
      throw new Error(`Verification claim failed: ${JSON.stringify(verifyData)}`);
    }
    completionId = verifyData.data.completion.id;
    console.log(`[PASS] Task completed & verified! Completion ID: ${completionId}, Reward: +${verifyData.data.completion.rewardPoints} PTS`);
  });

  // Step K & L: Verify submission in Admin Completion Monitor and Perform Administrative Review
  await step('Step K & L: Admin Completion Review & Notes', async () => {
    const completionsRes = await fetch(`${API_BASE}/admin/tasks/completions?taskId=${taskId}`, {
      headers: adminHeaders,
    });
    const completionsData = await completionsRes.json();
    if (!completionsData.success || !Array.isArray(completionsData.data?.completions)) {
      throw new Error(`Admin failed to query completions: ${JSON.stringify(completionsData)}`);
    }
    const found = completionsData.data.completions.find((c) => c.id === completionId);
    if (!found) {
      throw new Error(`Completion ${completionId} not present in admin monitor!`);
    }
    console.log(`[PASS] Completion verified in Admin Monitor: Status=${found.status}, Method=${found.verificationMethod}`);

    // Admin adds authoritative review notes
    const reviewRes = await fetch(`${API_BASE}/admin/tasks/completions/${completionId}/review`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        status: 'VERIFIED',
        adminReviewNotes: 'Audited and approved by Lead Release Engineer.',
      }),
    });
    const reviewData = await reviewRes.json();
    if (!reviewData.success || reviewData.data?.completion?.status !== 'VERIFIED') {
      throw new Error(`Admin review failed: ${JSON.stringify(reviewData)}`);
    }
    console.log(`[PASS] Admin review recorded. Notes: "${reviewData.data.completion.adminReviewNotes}"`);
  });

  // Step M: Confirm mobile user summary & history update
  await step('Step M: Confirm Mobile User Aggregate Summary & History', async () => {
    const [summaryRes, historyRes] = await Promise.all([
      fetch(`${API_BASE}/tasks/summary`, { headers: userHeaders }),
      fetch(`${API_BASE}/tasks/history?page=1&limit=10`, { headers: userHeaders }),
    ]);

    const summaryData = await summaryRes.json();
    const historyData = await historyRes.json();

    if (!summaryData.success || summaryData.data?.totalCompleted < 1) {
      throw new Error(`Summary does not reflect completed task: ${JSON.stringify(summaryData)}`);
    }

    const historyItem = historyData.data.completions.find((c) => c.id === completionId);
    if (!historyItem) {
      throw new Error(`Completion ${completionId} not found in user history!`);
    }
    console.log(`[PASS] User aggregate updated: Total Completed=${summaryData.data.totalCompleted}, Points=${summaryData.data.totalRewardPoints}`);
    console.log(`[PASS] User history verified: Title="${historyItem.task?.title}", Points=+${historyItem.rewardPoints}`);
  });

  // Step N: Verify rejection handling
  await step('Step N: Verify Rejection State Handling in Admin Queue', async () => {
    const rejectRes = await fetch(`${API_BASE}/admin/tasks/completions/${completionId}/review`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        status: 'REJECTED',
        rejectionReason: 'Test audit non-payment verification',
        adminReviewNotes: 'Verifying that rejection does not award points.',
      }),
    });
    const rejectData = await rejectRes.json();
    if (!rejectData.success || rejectData.data?.completion?.status !== 'REJECTED') {
      throw new Error(`Rejection review failed: ${JSON.stringify(rejectData)}`);
    }
    console.log(`[PASS] Rejection state verified: Status=${rejectData.data.completion.status}, Reason="${rejectData.data.completion.rejectionReason}"`);

    // Restore to VERIFIED
    await fetch(`${API_BASE}/admin/tasks/completions/${completionId}/review`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        status: 'VERIFIED',
        adminReviewNotes: 'Restored verified status for clean ledger test.',
      }),
    });
  });

  // Step O: Verify duplicate completion prevention
  await step('Step O: Verify Replay / Duplicate Completion Prevention', async () => {
    const dupRes = await fetch(`${API_BASE}/tasks/${taskId}/start`, {
      method: 'POST',
      headers: userHeaders,
    });
    const dupData = await dupRes.json();
    if (dupRes.status === 200 && dupData.success) {
      throw new Error('SECURITY VIOLATION: Duplicate task assignment allowed after verified completion!');
    }
    console.log(`[PASS] Duplicate attempt strictly rejected: HTTP ${dupRes.status} (${dupData.error?.code}) - ${dupData.error?.message}`);
  });

  // Step P: Verify audit logs contain the complete workflow
  await step('Step P: Verify Compliance Audit Logs Contain Full Workflow Trail', async () => {
    const logsRes = await fetch(`${API_BASE}/admin/audit-logs?limit=50`, {
      headers: adminHeaders,
    });
    const logsData = await logsRes.json();
    if (!logsData.success || !Array.isArray(logsData.data?.logs)) {
      throw new Error(`Failed to query audit logs: ${JSON.stringify(logsData)}`);
    }

    const actions = logsData.data.logs.map((l) => l.action);
    console.log('[INFO] Recorded audit actions in staging:', Array.from(new Set(actions)));

    const requiredActions = ['CREATE_CAMPAIGN', 'CREATE_TASK', 'PUBLISH_TASK', 'PAUSE_TASK', 'REVIEW_TASK_COMPLETION'];
    for (const reqAct of requiredActions) {
      if (!actions.includes(reqAct)) {
        throw new Error(`Audit log is missing expected action: ${reqAct}`);
      }
    }
    console.log('[PASS] Full immutable audit trail verified in adpayon_client_staging.');
  });

  console.log('\n======================================================');
  console.log('>>> ALL 16 PHASE 3 SYNCHRONIZATION STEPS (A-P) PASSED! <<<');
  console.log('======================================================\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n[FATAL] PHASE 3 SYNCHRONIZATION FAILED:', err);
  process.exit(1);
});
