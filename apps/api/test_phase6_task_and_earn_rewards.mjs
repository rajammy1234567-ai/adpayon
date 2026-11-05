import mongoose from 'mongoose';

const API_BASE = 'http://127.0.0.1:5000/api';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function step(name, fn) {
  console.log(`\n======================================================`);
  console.log(`>>> STEP: ${name}`);
  console.log(`======================================================`);
  await fn();
}

async function run() {
  console.log('--- STARTING ADPAYON PHASE 6: REAL TASK & EARN REWARDS SYSTEM E2E TEST ---');

  // STEP 1: Authenticate Admin via 2FA
  let adminToken;
  await step('1. Authenticate Staging Admin via 2FA', async () => {
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
      throw new Error(`Admin login initiation failed: ${JSON.stringify(initData)}`);
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
    console.log('[PASS] Admin authenticated successfully with token.');
  });

  const adminHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };

  // STEP 2: Authenticate Staging Earner 1 and Earner 2
  let user1Token, user1Id, user2Token, user2Id;
  const user1Mobile = '+917999900001';
  const user2Mobile = '+917999900002';
  const userPassword = 'TestUser123!Secure';

  await step('2. Authenticate Mobile Earners (User 1 and User 2)', async () => {
    // User 1
    const res1 = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: user1Mobile, password: userPassword }),
    });
    const data1 = await res1.json();
    if (!data1.success) throw new Error(`User 1 login failed: ${JSON.stringify(data1)}`);
    user1Token = data1.data.tokens.accessToken;
    user1Id = data1.data.user.id;
    console.log(`[PASS] User 1 logged in. ID: ${user1Id}`);

    // User 2: Try login, if not present seed User 2 with same credentials
    let res2 = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: user2Mobile, password: userPassword }),
    });
    let data2 = await res2.json();

    if (!data2.success) {
      console.log('User 2 not found in staging. Auto-provisioning User 2 in database...');
      const { User } = await import('./dist/src/models/index.js');
      const { connectMongo, disconnectMongo } = await import('./dist/src/db/mongoose.js');
      const { hashPassword } = await import('./dist/src/services/passwordService.js');
      const passwordHash = await hashPassword(userPassword);
      await connectMongo();
      await User.findOneAndUpdate(
        { mobile: user2Mobile },
        {
          $set: {
            mobile: user2Mobile,
            passwordHash,
            name: 'Mobile E2E Test Earner 2',
            role: 'USER',
            status: 'ACTIVE',
            referralCode: 'ADP5D0C5C',
          },
        },
        { upsert: true, new: true }
      );
      await disconnectMongo();

      // Retry login
      res2 = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: user2Mobile, password: userPassword }),
      });
      data2 = await res2.json();
    }

    if (!data2.success) throw new Error(`User 2 login failed: ${JSON.stringify(data2)}`);
    user2Token = data2.data.tokens.accessToken;
    user2Id = data2.data.user.id;
    console.log(`[PASS] User 2 logged in. ID: ${user2Id}`);
  });

  const user1Headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${user1Token}`,
  };
  const user2Headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${user2Token}`,
  };

  // STEP 3: Admin Creates a Campaign
  let campaignId;
  await step('3. Admin Creates & Publishes Staging Campaign', async () => {
    const cRes = await fetch(`${API_BASE}/admin/campaigns`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: `Campaign_Phase6_${Date.now()}`,
        advertiserName: 'Fintech Rewards India',
        advertiserBudgetPaise: 5000000,
        authorizedAgreementRef: `AGR-${Date.now()}`,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
      }),
    });
    const cData = await cRes.json();
    if (!cData.success) throw new Error(`Campaign creation failed: ${JSON.stringify(cData)}`);
    campaignId = cData.data.campaign.id;

    // Activate campaign
    await fetch(`${API_BASE}/admin/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    console.log(`[PASS] Campaign created and activated. ID: ${campaignId}`);
  });

  // STEP 4: Admin Creates All 5 Real Task Types
  let articleTaskId, videoTaskId, youtubeTaskId, appTestingTaskId, targetedTaskId;

  await step('4. Admin Creates All 5 Real Task Types', async () => {
    // 4A: ARTICLE_READ Task
    const artRes = await fetch(`${API_BASE}/admin/tasks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        campaignId,
        title: 'UPI Payment Safety & 2FA Guide',
        description: 'Read the comprehensive guide on UPI transaction safety.',
        category: 'ARTICLE_READ',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 100,
        totalCap: 500,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 5,
        articleReadConfig: {
          articleTitle: 'Understanding UPI Safety Protocols',
          articleContent: 'Unified Payments Interface (UPI) provides instant account-to-account transfers. Never enter your UPI PIN to receive money. Always check payee identity.',
          minReadDurationSeconds: 5,
          minScrollPercentage: 80,
          comprehensionQuiz: {
            question: 'When should you enter your UPI PIN?',
            options: ['Only when sending money', 'When receiving cashback', 'When someone calls requesting it', 'Never'],
            correctOptionIndex: 0,
          },
        },
      }),
    });
    const artData = await artRes.json();
    if (!artData.success) throw new Error(`Article task create failed: ${JSON.stringify(artData)}`);
    articleTaskId = artData.data.task.id;
    await fetch(`${API_BASE}/admin/tasks/${articleTaskId}/publish`, { method: 'POST', headers: adminHeaders });
    console.log(`[PASS] 4A. Article Read task published: ${articleTaskId}`);

    // 4B: VIDEO_WATCH Task (Direct MP4/HLS)
    const vidRes = await fetch(`${API_BASE}/admin/tasks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        campaignId,
        title: 'Digital Payments Merchant Verification',
        description: 'Learn how to verify QR codes and merchant badges.',
        category: 'VIDEO_WATCH',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 150,
        totalCap: 500,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 5,
        videoWatchConfig: {
          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          videoDurationSeconds: 60,
          requiredWatchSeconds: 5,
          completionPolicy: 'MINIMUM_DURATION',
          comprehensionQuiz: {
            question: 'What indicates a genuine payment QR?',
            options: ['Verified merchant checkmark', 'No merchant name', 'Handwritten stickers', 'Random link'],
            correctOptionIndex: 0,
          },
        },
      }),
    });
    const vidData = await vidRes.json();
    if (!vidData.success) throw new Error(`Video task create failed: ${JSON.stringify(vidData)}`);
    videoTaskId = vidData.data.task.id;
    await fetch(`${API_BASE}/admin/tasks/${videoTaskId}/publish`, { method: 'POST', headers: adminHeaders });
    console.log(`[PASS] 4B. Direct Video Watch task published: ${videoTaskId}`);

    // 4C: YOUTUBE_LEARNING Task
    const ytRes = await fetch(`${API_BASE}/admin/tasks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        campaignId,
        title: 'Cybersecurity: Preventing Phishing & OTP Fraud',
        description: 'Watch the authorized financial safety lesson and complete the comprehension quiz.',
        category: 'YOUTUBE_LEARNING',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 200,
        totalCap: 500,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 5,
        youtubeLearningConfig: {
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          sessionDurationSeconds: 5,
          requiredDurationSeconds: 5,
          instructions: 'Watch the video lesson and verify your understanding via the single-question quiz.',
          educationalNotice: 'Educational video learning. Rewards are granted exclusively for verified quiz completion.',
          comprehensionQuiz: {
            question: 'What is the rule regarding sharing your one-time password (OTP)?',
            options: [
              'Never share OTP with anyone under any circumstances',
              'Share with callers who say they work for the bank',
              'Share only the last 2 digits',
              'Post the OTP online',
            ],
            correctOptionIndex: 0,
          },
        },
      }),
    });
    const ytData = await ytRes.json();
    if (!ytData.success) throw new Error(`YouTube task create failed: ${JSON.stringify(ytData)}`);
    youtubeTaskId = ytData.data.task.id;
    await fetch(`${API_BASE}/admin/tasks/${youtubeTaskId}/publish`, { method: 'POST', headers: adminHeaders });
    console.log(`[PASS] 4C. YouTube Learning task published: ${youtubeTaskId}`);

    // 4D: APP_TESTING Task with MANUAL_REVIEW
    const appRes = await fetch(`${API_BASE}/admin/tasks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        campaignId,
        title: 'Test BudgetTracker App & Submit UX Feedback',
        description: 'Explore the BudgetTracker Android app and provide usability feedback.',
        category: 'APP_TESTING',
        verificationMethod: 'MANUAL_REVIEW',
        rewardPoints: 250,
        totalCap: 500,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 5,
        appInstallConfig: {
          appName: 'BudgetTracker',
          packageName: 'com.budget.tracker.test',
          storeUrl: 'https://play.google.com/store/apps/details?id=com.budget.tracker.test',
          attributionMethod: 'MANUAL_REVIEW',
          requiredTestingSeconds: 5,
          completionCode: 'TEST-PARTNER-2026',
          testingSteps: '1. Open Google Play.\n2. Note UI layout.\n3. Return to submit feedback.',
          feedbackQuestion: 'How clear was the main account overview?',
        },
      }),
    });
    const appData = await appRes.json();
    if (!appData.success) throw new Error(`App testing task create failed: ${JSON.stringify(appData)}`);
    appTestingTaskId = appData.data.task.id;
    await fetch(`${API_BASE}/admin/tasks/${appTestingTaskId}/publish`, { method: 'POST', headers: adminHeaders });
    console.log(`[PASS] 4D. App Testing (Manual Review) task published: ${appTestingTaskId}`);

    // 4E: TARGETED Task (Assigned exclusively to User 1)
    const tgtRes = await fetch(`${API_BASE}/admin/tasks`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        campaignId,
        title: 'VIP Exclusive Earner Task',
        description: 'Special task targeted exclusively to designated earners.',
        category: 'ARTICLE_READ',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 300,
        totalCap: 100,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 5,
        targeting: {
          assignedUserIds: [user1Id],
        },
        articleReadConfig: {
          articleTitle: 'VIP Rewards Program Overview',
          articleContent: 'Welcome to the VIP rewards tier. Exclusive promotions and points multiplier active.',
          minReadDurationSeconds: 5,
          minScrollPercentage: 80,
        },
      }),
    });
    const tgtData = await tgtRes.json();
    if (!tgtData.success) throw new Error(`Targeted task create failed: ${JSON.stringify(tgtData)}`);
    targetedTaskId = tgtData.data.task.id;
    await fetch(`${API_BASE}/admin/tasks/${targetedTaskId}/publish`, { method: 'POST', headers: adminHeaders });
    console.log(`[PASS] 4E. Targeted task published for User 1: ${targetedTaskId}`);
  });

  // STEP 5: Verify Task Feed & Audience Targeting
  await step('5. Verify Task Feed & Audience Targeting', async () => {
    // User 1 Feed: MUST include targetedTaskId
    const f1Res = await fetch(`${API_BASE}/tasks/feed`, { headers: user1Headers });
    const f1Data = await f1Res.json();
    const u1TaskIds = f1Data.data.tasks.map((t) => t.id);
    if (!u1TaskIds.includes(targetedTaskId)) {
      throw new Error(`Targeted task ${targetedTaskId} missing from assigned User 1 feed!`);
    }
    console.log('[PASS] Assigned User 1 sees the targeted task in feed.');

    // User 2 Feed: MUST EXCLUDE targetedTaskId
    const f2Res = await fetch(`${API_BASE}/tasks/feed`, { headers: user2Headers });
    const f2Data = await f2Res.json();
    const u2TaskIds = f2Data.data.tasks.map((t) => t.id);
    if (u2TaskIds.includes(targetedTaskId)) {
      throw new Error(`Targeted task ${targetedTaskId} erroneously appeared in unassigned User 2 feed!`);
    }
    console.log('[PASS] Unassigned User 2 does NOT see the targeted task in feed (Audience targeting enforced).');

    // Also verify User 2 cannot start User 1's targeted task
    const forbiddenStartRes = await fetch(`${API_BASE}/tasks/${targetedTaskId}/start`, {
      method: 'POST',
      headers: user2Headers,
    });
    if (forbiddenStartRes.status !== 403) {
      throw new Error(`Unassigned user was not blocked with 403 on targeted task! Status: ${forbiddenStartRes.status}`);
    }
    console.log('[PASS] Backend blocks unassigned User 2 with 403 FORBIDDEN when attempting to start targeted task.');
  });

  // Helper to get wallet ledger balance and transactions
  const getWalletState = async (headers) => {
    const txRes = await fetch(`${API_BASE}/wallet/transactions?page=1&limit=20`, { headers });
    const txData = await txRes.json();
    return {
      balancePaise: txData.data?.wallet?.balancePaise || 0,
      transactions: txData.data?.transactions || [],
    };
  };

  const initialWallet = await getWalletState(user1Headers);
  console.log(`[INFO] User 1 initial wallet balance: ${initialWallet.balancePaise} paise (${initialWallet.balancePaise / 100} PTS)`);

  // STEP 6: Execute & Verify ARTICLE_READ Task
  await step('6. Complete & Verify Article Read Task', async () => {
    // Start session
    const sessRes = await fetch(`${API_BASE}/tasks/${articleTaskId}/article-session/start`, {
      method: 'POST',
      headers: user1Headers,
    });
    const sessData = await sessRes.json();
    if (!sessData.success) throw new Error(`Article session start failed: ${JSON.stringify(sessData)}`);
    const sessionId = sessData.data.sessionId;

    // Wait 5.5s so server-bounded wall clock matches dwell requirement
    await sleep(5500);

    // Record reading progress: 5 seconds, active foreground, 100% scroll
    const progRes = await fetch(`${API_BASE}/tasks/${articleTaskId}/article-session/progress`, {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({ sessionId, appState: 'active', readingDeltaSeconds: 5, scrollPercentage: 100 }),
    });
    const progData = await progRes.json();
    if (!progData.success) throw new Error(`Article progress failed: ${JSON.stringify(progData)}`);

    // Submit Quiz Answer: index 0 is correct
    const quizRes = await fetch(`${API_BASE}/tasks/${articleTaskId}/article-session/quiz`, {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({ sessionId, selectedOptionIndex: 0 }),
    });
    const quizData = await quizRes.json();
    if (!quizData.success || (!quizData.data.correct && !quizData.data.isCorrect)) {
      throw new Error(`Article quiz failed: ${JSON.stringify(quizData)}`);
    }

    // Verify & Claim reward
    const claimRes = await fetch(`${API_BASE}/tasks/${articleTaskId}/article-session/verify`, {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({ sessionId }),
    });
    const claimData = await claimRes.json();
    const status = claimData.data?.completion?.status || claimData.data?.status;
    if (!claimData.success || status !== 'VERIFIED') {
      throw new Error(`Article claim failed: ${JSON.stringify(claimData)}`);
    }
    const rewardPoints = claimData.data?.completion?.rewardPoints || claimData.data?.rewardPoints;
    console.log(`[PASS] Article Read verified: +${rewardPoints} PTS`);

    // Check duplicate claim rejection
    const dupRes = await fetch(`${API_BASE}/tasks/${articleTaskId}/article-session/verify`, {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({ sessionId }),
    });
    const dupData = await dupRes.json();
    if (dupData.success && dupData.data?.completion?.status === 'VERIFIED' && !dupData.data.reconciled) {
      throw new Error('Duplicate claim was erroneously awarded twice!');
    }
    console.log('[PASS] Double-claiming prevented successfully.');
  });

  // STEP 7: Execute & Verify VIDEO_WATCH Task (Direct MP4/HLS)
  await step('7. Complete & Verify Direct Video Watch Task', async () => {
    // 1. Claim task assignment
    const startRes = await fetch(`${API_BASE}/tasks/${videoTaskId}/start`, {
      method: 'POST',
      headers: user1Headers,
    });
    const startData = await startRes.json();
    if (!startData.success) throw new Error(`Video task start failed: ${JSON.stringify(startData)}`);

    // 2. Start session
    const sessRes = await fetch(`${API_BASE}/tasks/${videoTaskId}/video-session/start`, {
      method: 'POST',
      headers: user1Headers,
    });
    const sessData = await sessRes.json();
    if (!sessData.success) throw new Error(`Video session start failed: ${JSON.stringify(sessData)}`);
    const sessionId = sessData.data.sessionId;

    // Wait 5.5s for playback wall-clock time
    await sleep(5500);

    // Progress beacon
    const progRes = await fetch(`${API_BASE}/tasks/${videoTaskId}/video-session/progress`, {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({
        sessionId,
        playbackPositionSeconds: 5.5,
        isPlaying: true,
        appState: 'active',
        isBuffering: false,
        playbackEnded: false,
      }),
    });
    const progData = await progRes.json();
    if (!progData.success) throw new Error(`Video progress failed: ${JSON.stringify(progData)}`);

    // Quiz
    const quizRes = await fetch(`${API_BASE}/tasks/${videoTaskId}/video-session/quiz`, {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({ sessionId, selectedOptionIndex: 0 }),
    });
    const quizData = await quizRes.json();
    if (!quizData.success || (!quizData.data.isCorrect && !quizData.data.correct)) {
      throw new Error(`Video quiz failed: ${JSON.stringify(quizData)}`);
    }

    // Claim
    const claimRes = await fetch(`${API_BASE}/tasks/${videoTaskId}/video-session/claim`, {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({ sessionId }),
    });
    const claimData = await claimRes.json();
    const status = claimData.data?.completion?.status || claimData.data?.status;
    if (!claimData.success || status !== 'VERIFIED') {
      throw new Error(`Video claim failed: ${JSON.stringify(claimData)}`);
    }
    const rewardPoints = claimData.data?.completion?.rewardPoints || claimData.data?.rewardPoints;
    console.log(`[PASS] Direct Video Watch verified: +${rewardPoints} PTS`);
  });

  // STEP 8: Execute & Verify YOUTUBE_LEARNING Task
  await step('8. Complete & Verify YouTube Video Learning Task', async () => {
    // 1. Start YouTube educational learning session
    const startRes = await fetch(`${API_BASE}/tasks/${youtubeTaskId}/youtube-session/start`, {
      method: 'POST',
      headers: user1Headers,
    });
    const startData = await startRes.json();
    if (!startData.success || !startData.data?.sessionId) {
      throw new Error(`YouTube session start failed: ${JSON.stringify(startData)}`);
    }
    const ytSessionId = startData.data.sessionId;
    console.log(`[PASS] YouTube session initialized. SessionId: ${ytSessionId}`);

    // Verify videoId was automatically extracted
    if (startData.data.youtubeConfig.videoId !== 'dQw4w9WgXcQ') {
      throw new Error(`Extracted YouTube videoId mismatch: ${startData.data.youtubeConfig.videoId}`);
    }
    console.log('[PASS] 11-char YouTube Video ID extracted correctly: dQw4w9WgXcQ');

    // 2. Heartbeat progress: record 6 seconds engagement time
    const progRes = await fetch(`${API_BASE}/tasks/${youtubeTaskId}/youtube-session/progress`, {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({ sessionId: ytSessionId, secondsDelta: 6 }),
    });
    const progData = await progRes.json();
    if (!progData.success || !progData.data.isSessionComplete) {
      throw new Error(`YouTube progress failed: ${JSON.stringify(progData)}`);
    }
    console.log('[PASS] YouTube educational learning duration verified on server.');

    // 3. Test wrong quiz answer first
    const wrongQuizRes = await fetch(`${API_BASE}/tasks/${youtubeTaskId}/youtube-session/quiz`, {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({ sessionId: ytSessionId, selectedOptionIndex: 1 }),
    });
    const wrongQuizData = await wrongQuizRes.json();
    if (wrongQuizData.data.correct !== false && wrongQuizData.data.isCorrect !== false) {
      throw new Error('Wrong quiz answer was incorrectly accepted as true!');
    }
    console.log('[PASS] Server rejects incorrect quiz answer choice.');

    // 4. Test correct quiz answer: option 0
    const correctQuizRes = await fetch(`${API_BASE}/tasks/${youtubeTaskId}/youtube-session/quiz`, {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({ sessionId: ytSessionId, selectedOptionIndex: 0 }),
    });
    const correctQuizData = await correctQuizRes.json();
    if (!correctQuizData.data.correct && !correctQuizData.data.isCorrect) {
      throw new Error(`Correct quiz answer was rejected: ${JSON.stringify(correctQuizData)}`);
    }
    console.log('[PASS] Server verifies correct quiz answer choice.');

    // 5. Claim verified educational reward
    const claimRes = await fetch(`${API_BASE}/tasks/${youtubeTaskId}/youtube-learning/verify`, {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({ sessionId: ytSessionId }),
    });
    const claimData = await claimRes.json();
    const status = claimData.data?.completion?.status || claimData.data?.status;
    if (!claimData.success || status !== 'VERIFIED') {
      throw new Error(`YouTube claim failed: ${JSON.stringify(claimData)}`);
    }
    const rewardPoints = claimData.data?.completion?.rewardPoints || claimData.data?.rewardPoints;
    console.log(`[PASS] YouTube Learning verified & claimed: +${rewardPoints} PTS`);
  });

  // STEP 9: Execute & Verify APP_TESTING Task (Manual Review Queue)
  let appTestingCompletionId;
  await step('9. Complete App Testing Task & Process Admin Review Queue', async () => {
    // 1. Start task
    const startRes = await fetch(`${API_BASE}/tasks/${appTestingTaskId}/start`, {
      method: 'POST',
      headers: user1Headers,
    });
    const startData = await startRes.json();
    if (!startData.success) throw new Error(`App task start failed: ${JSON.stringify(startData)}`);

    // 2. Submit testing feedback with partner completion code
    const subRes = await fetch(`${API_BASE}/tasks/${appTestingTaskId}/app-feedback/submit`, {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({
        feedback: 'App navigation was fast, clean fonts, tested budget creation without glitches.',
        rating: 5,
        completionCode: 'TEST-PARTNER-2026',
      }),
    });
    const subData = await subRes.json();
    if (!subData.success) throw new Error(`App feedback submit failed: ${JSON.stringify(subData)}`);
    if (subData.data.status !== 'PENDING_REVIEW') {
      throw new Error(`Expected status PENDING_REVIEW for manual review task, got: ${subData.data.status}`);
    }
    appTestingCompletionId = subData.data.completionId;
    console.log(`[PASS] Submission queued with status PENDING_REVIEW. CompletionId: ${appTestingCompletionId}`);

    // 3. Admin queries Review Queue
    const qRes = await fetch(`${API_BASE}/admin/tasks/completions?status=PENDING_REVIEW`, {
      headers: adminHeaders,
    });
    const qData = await qRes.json();
    const found = qData.data.completions.find((c) => c.id === appTestingCompletionId);
    if (!found) throw new Error(`Completion ${appTestingCompletionId} not found in admin PENDING_REVIEW queue!`);
    console.log('[PASS] Admin sees submission in the PENDING_REVIEW completion queue.');

    // 4. Admin Approves Completion
    const revRes = await fetch(`${API_BASE}/admin/tasks/completions/${appTestingCompletionId}/review`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        status: 'VERIFIED',
        adminReviewNotes: 'Detailed UX feedback verified. Code matches partner token.',
      }),
    });
    const revData = await revRes.json();
    if (!revData.success || revData.data.completion.status !== 'VERIFIED') {
      throw new Error(`Admin review approval failed: ${JSON.stringify(revData)}`);
    }
    console.log(`[PASS] Admin approved submission. Status updated to VERIFIED.`);
  });

  // STEP 10: Verify Double-Entry Wallet Ledger Integrity
  await step('10. Verify Double-Entry Wallet Ledger Integrity', async () => {
    const finalWallet = await getWalletState(user1Headers);
    console.log(`[INFO] Final wallet balance: ${finalWallet.balancePaise} paise (${finalWallet.balancePaise / 100} PTS)`);

    // We completed:
    // Article: 100 PTS = 10000 paise
    // Video: 150 PTS = 15000 paise
    // YouTube: 200 PTS = 20000 paise
    // App Testing: 250 PTS = 25000 paise
    // Total awarded: 700 PTS = 70000 paise
    const expectedGainPaise = (100 + 150 + 200 + 250) * 100;
    const actualGainPaise = finalWallet.balancePaise - initialWallet.balancePaise;

    console.log(`[INFO] Expected gain: ${expectedGainPaise} paise. Actual gain: ${actualGainPaise} paise.`);
    if (actualGainPaise !== expectedGainPaise) {
      throw new Error(`Wallet balance gain mismatch! Expected: ${expectedGainPaise}, Actual: ${actualGainPaise}`);
    }

    // Verify transactions in ledger
    const taskTxs = finalWallet.transactions.filter((tx) => tx.category === 'TASK_REWARD');
    console.log(`[PASS] Verified ${taskTxs.length} TASK_REWARD transactions in ledger history.`);

    // Verify no withdrawable cash leakage
    const cashConversionAttempt = await fetch(`${API_BASE}/wallet/withdraw`, {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({ amountPaise: 1000 }),
    });
    if (cashConversionAttempt.status === 200) {
      throw new Error('Promotional points should not be withdrawable as cash!');
    }
    console.log('[PASS] Promotional points remain non-withdrawable promotional credit; cash payouts disabled.');
  });

  console.log('\n======================================================');
  console.log('🎉 ALL 10 E2E TASK & REWARD INTEGRATION TESTS PASSED!');
  console.log('======================================================\n');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ E2E TEST FAILED:', err);
    process.exit(1);
  });
