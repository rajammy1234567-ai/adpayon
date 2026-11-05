import mongoose from 'mongoose';

const API_BASE = 'http://127.0.0.1:5000/api';

async function step(name, fn) {
  console.log(`\n======================================================`);
  console.log(`>>> STEP: ${name}`);
  console.log(`======================================================`);
  await fn();
}

async function run() {
  console.log('--- STARTING ADPAYON PHASE 2: VIDEO LEARNING & APP FEEDBACK E2E TEST ---');

  // Step 1: Authenticate Admin via 2FA
  let adminToken;
  await step('1. Authenticate Admin via 2FA', async () => {
    const adminMobile = '+919876543210';
    const initRes = await fetch(`${API_BASE}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: adminMobile,
        password: 'StagingAdmin!2026Secure',
      }),
    });
    const initData = await initRes.json();
    if (!initData.success || !initData.data?.mfaSessionToken) {
      throw new Error(`Admin login failed: ${JSON.stringify(initData)}`);
    }

    const { lookupStagingReviewerOtp } = await import('./dist/src/scripts/lookupStagingReviewerOtp.js');
    const otp = await lookupStagingReviewerOtp(adminMobile);
    if (!otp) throw new Error('Could not retrieve admin OTP');

    const verifyRes = await fetch(`${API_BASE}/admin/auth/mfa-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mfaSessionToken: initData.data.mfaSessionToken,
        otp,
      }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success || !verifyData.data?.accessToken) {
      throw new Error(`Admin 2FA verify failed: ${JSON.stringify(verifyData)}`);
    }
    adminToken = verifyData.data.accessToken;
    console.log('[PASS] Admin authenticated successfully.');
  });

  const adminHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };

  // Step 2: Authenticate Mobile Earner
  let userToken;
  let userId;
  const userMobile = '+917999900001';
  const userPassword = 'TestUser123!Secure';

  await step('2. Authenticate Mobile Earner (+917999900001)', async () => {
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: userMobile,
        password: userPassword,
      }),
    });
    const loginData = await loginRes.json();
    if (!loginData.success || !loginData.data?.tokens?.accessToken) {
      throw new Error(`User login failed: ${JSON.stringify(loginData)}`);
    }
    userToken = loginData.data.tokens.accessToken;
    userId = loginData.data.user.id;
    console.log(`[PASS] Mobile user authenticated: User ID=${userId}`);
  });

  const userHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${userToken}`,
  };

  // Step 3: Create Active Campaign for Video & App Tasks
  let campaignId;
  await step('3. Create & Activate Staging Campaign in Admin', async () => {
    const campRes = await fetch(`${API_BASE}/admin/campaigns`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: `Interactive Learning Campaign ${Date.now()}`,
        advertiserName: 'National Digital Literacy Mission',
        advertiserBudgetPaise: 10000000, // ₹1,00,000
        authorizedAgreementRef: `AGR-LEARN-${Date.now()}`,
      }),
    });
    const campData = await campRes.json();
    campaignId = campData.data.campaign.id;

    // Activate
    await fetch(`${API_BASE}/admin/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    console.log(`[PASS] Campaign created & activated. ID: ${campaignId}`);
  });

  // Step 4: Create and Publish Video Learning Task
  let videoTaskId;
  await step('4. Create & Publish Video Learning Task (VIDEO_WATCH)', async () => {
    const taskRes = await fetch(`${API_BASE}/admin/tasks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        campaignId,
        title: 'UPI Safety & Fraud Protection Video Guide',
        description: 'Watch the official cybersecurity video guide and answer the verification question.',
        instructions: 'Watch at least 5 seconds of the video, then answer the quiz.',
        category: 'VIDEO_WATCH',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 200,
        totalCap: 500,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 5,
        videoWatchConfig: {
          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          videoDurationSeconds: 15,
          requiredWatchSeconds: 5,
          allowSeeking: false,
          completionPolicy: 'MINIMUM_DURATION',
          comprehensionQuiz: {
            question: 'Should you ever share your UPI PIN to receive money in your account?',
            options: [
              'No, PIN is never required to receive money',
              'Yes, whenever an employer asks',
              'Yes, for cashback rewards',
              'Yes, if the bank calls you',
            ],
            correctOptionIndex: 0,
          },
        },
      }),
    });
    const taskData = await taskRes.json();
    if (!taskData.success) {
      throw new Error(`Failed to create video task: ${JSON.stringify(taskData)}`);
    }
    videoTaskId = taskData.data.task.id;

    // Publish
    const pubRes = await fetch(`${API_BASE}/admin/tasks/${videoTaskId}/publish`, {
      method: 'POST',
      headers: adminHeaders,
    });
    const pubData = await pubRes.json();
    if (!pubData.success) throw new Error(`Failed to publish video task: ${JSON.stringify(pubData)}`);
    console.log(`[PASS] Video Task published. Task ID: ${videoTaskId}`);
  });

  // Step 5: Mobile User Starts Video Playback Session
  let videoSessionId;
  await step('5. Mobile Earner Starts Video Playback Session', async () => {
    // 1. Claim task assignment
    const startRes = await fetch(`${API_BASE}/tasks/${videoTaskId}/start`, {
      method: 'POST',
      headers: userHeaders,
    });
    const startData = await startRes.json();
    if (!startData.success) throw new Error(`Failed to claim task: ${JSON.stringify(startData)}`);

    // 2. Start video playback watchdog session
    const sessionRes = await fetch(`${API_BASE}/tasks/${videoTaskId}/video-session/start`, {
      method: 'POST',
      headers: userHeaders,
    });
    const sessionData = await sessionRes.json();
    if (!sessionData.success || !sessionData.data?.sessionId) {
      throw new Error(`Failed to start video session: ${JSON.stringify(sessionData)}`);
    }
    videoSessionId = sessionData.data.sessionId;
    console.log(`[PASS] Video session started. Session ID: ${videoSessionId}`);
  });

  // Step 6: Progress Video Playback & Complete Quiz
  await step('6. Video Telemetry Watchdog & Comprehension Quiz', async () => {
    // Wait real server wall-clock time (5.5s)
    await new Promise((r) => setTimeout(r, 5500));

    // Submit telemetry
    const progRes = await fetch(`${API_BASE}/tasks/${videoTaskId}/video-session/progress`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({
        sessionId: videoSessionId,
        playbackPositionSeconds: 5.5,
        isPlaying: true,
        appState: 'active',
        isBuffering: false,
        playbackEnded: false,
      }),
    });
    const progData = await progRes.json();
    if (!progData.success) {
      throw new Error(`Video progress rejected: ${JSON.stringify(progData)}`);
    }
    console.log(`[PASS] Video progress recorded. Remaining: ${progData.data?.remainingWatchSeconds}s`);

    // Submit Quiz Answer
    const quizRes = await fetch(`${API_BASE}/tasks/${videoTaskId}/video-session/quiz`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({
        sessionId: videoSessionId,
        selectedOptionIndex: 0,
      }),
    });
    const quizData = await quizRes.json();
    if (!quizData.success || !quizData.data?.isCorrect) {
      throw new Error(`Video quiz failed: ${JSON.stringify(quizData)}`);
    }
    console.log('[PASS] Video comprehension quiz passed.');

    // Claim reward
    const claimRes = await fetch(`${API_BASE}/tasks/${videoTaskId}/video-session/claim`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({ sessionId: videoSessionId }),
    });
    const claimData = await claimRes.json();
    if (!claimData.success || !claimData.data?.completion?.id) {
      throw new Error(`Video claim failed: ${JSON.stringify(claimData)}`);
    }
    console.log(`[PASS] Video reward claimed successfully! Reward: +${claimData.data.completion.rewardPoints} PTS`);
  });

  // Step 7: Create and Publish App Testing & Feedback Task (APP_INSTALL)
  let appId;
  await step('7. Create & Publish App Testing & Feedback Task', async () => {
    const taskRes = await fetch(`${API_BASE}/admin/tasks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        campaignId,
        title: 'Test New Digital Book Reader App',
        description: 'Explore the partner digital reader app on Play Store and provide UX feedback.',
        instructions: '1. Open link.\n2. Explore reader controls.\n3. Submit honest testing feedback.',
        category: 'APP_INSTALL',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 300,
        totalCap: 500,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 5,
        appInstallConfig: {
          appName: 'Digital Reader',
          packageName: 'com.example.digitalreader',
          platform: 'ANDROID',
          storeUrl: 'https://play.google.com/store/apps/details?id=com.example.digitalreader',
          attributionMethod: 'IN_APP_FEEDBACK',
          conversionEvent: 'FIRST_OPEN',
          testingSteps: '1. Open link.\n2. Explore reader controls.\n3. Submit honest testing feedback.',
          feedbackQuestion: 'How easy was it to navigate the chapter index and reader font controls?',
        },
      }),
    });
    const taskData = await taskRes.json();
    if (!taskData.success) throw new Error(`Failed to create app feedback task: ${JSON.stringify(taskData)}`);
    appId = taskData.data.task.id;

    await fetch(`${API_BASE}/admin/tasks/${appId}/publish`, {
      method: 'POST',
      headers: adminHeaders,
    });
    console.log(`[PASS] App Feedback task published. ID: ${appId}`);
  });

  // Step 8: Mobile User Submits App Feedback
  let feedbackCompletionId;
  await step('8. Mobile Earner Claims Assignment & Submits App Testing Feedback', async () => {
    const startRes = await fetch(`${API_BASE}/tasks/${appId}/start`, {
      method: 'POST',
      headers: userHeaders,
    });
    const startData = await startRes.json();
    if (!startData.success) throw new Error(`Failed to start app task: ${JSON.stringify(startData)}`);

    const feedbackRes = await fetch(`${API_BASE}/tasks/${appId}/app-feedback/submit`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({
        feedback: 'The chapter navigation was very intuitive and font scaling was smooth.',
        rating: 5,
      }),
    });
    const feedbackData = await feedbackRes.json();
    if (!feedbackData.success || !feedbackData.data?.completionId) {
      throw new Error(`App feedback submission failed: ${JSON.stringify(feedbackData)}`);
    }
    feedbackCompletionId = feedbackData.data.completionId;
    console.log(`[PASS] App testing feedback submitted! Completion ID: ${feedbackCompletionId}, Status: ${feedbackData.data.status}`);
  });

  // Step 9: Admin Reviews App Feedback Completion
  await step('9. Admin Reviews & Approves App Feedback Submission', async () => {
    const reviewRes = await fetch(`${API_BASE}/admin/tasks/completions/${feedbackCompletionId}/review`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        status: 'VERIFIED',
        adminReviewNotes: 'Genuine constructive feedback verified by QA Lead.',
      }),
    });
    const reviewData = await reviewRes.json();
    if (!reviewData.success || reviewData.data?.completion?.status !== 'VERIFIED') {
      throw new Error(`Admin review failed: ${JSON.stringify(reviewData)}`);
    }
    console.log(`[PASS] Feedback verified by Admin. Status=${reviewData.data.completion.status}`);
  });

  console.log(`\n======================================================`);
  console.log(`>>> ALL VIDEO & APP FEEDBACK TASK FLOWS PASSED! <<<`);
  console.log(`======================================================`);
  process.exit(0);
}

run().catch((err) => {
  console.error('\n[FATAL] VIDEO & APP FEEDBACK TEST FAILED:', err);
  process.exit(1);
});
