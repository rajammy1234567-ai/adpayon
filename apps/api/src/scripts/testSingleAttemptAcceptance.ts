import mongoose, { Types } from 'mongoose';
import { Task } from '../models/Task';
import { Campaign } from '../models/Campaign';
import { User } from '../models/User';
import { ExternalLinkSession } from '../models/ExternalLinkSession';
import { TaskAssignment } from '../models/TaskAssignment';
import { TaskCompletion } from '../models/TaskCompletion';
import { WalletLedgerEntry } from '../models/WalletLedgerEntry';
import { VerificationEvidence } from '../models/VerificationEvidence';
import { generateAccessToken } from '../services/tokenService';

const API_BASE = 'http://127.0.0.1:5001';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://adpayon_sandbox_app:iVnmAHoCRlvKXHvc@adpayon-dev.3tcl8bz.mongodb.net/adpayon_sandbox?retryWrites=true&w=majority';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runSingleAttemptAcceptanceTest() {
  console.log('=== SINGLE UNINTERRUPTED AWAY ATTEMPT ACCEPTANCE TEST ===\n');

  await mongoose.connect(MONGODB_URI);
  console.log('1. Connected to MongoDB database:', mongoose.connection.name);

  // 1. Identify active sandbox earner user
  const earnerUser = await User.findOne({ mobile: '+919876543216' });
  if (!earnerUser) {
    throw new Error('Earner user +919876543216 not found in adpayon_sandbox');
  }
  console.log(`2. Found earner user: ${earnerUser.name || 'Krishna'} (${earnerUser._id.toString()})`);

  // Generate authentic access token
  const token = generateAccessToken({
    userId: earnerUser._id.toString(),
    mobile: earnerUser.mobile || '+919876543216',
    role: earnerUser.role || 'EARNER',
  });

  // 2. Identify or create sandbox campaign
  let campaign = await Campaign.findOne({ status: 'ACTIVE' });
  if (!campaign) {
    campaign = await Campaign.create({
      name: 'Sandbox Single Attempt Campaign',
      advertiserName: 'Sandbox QA Advertiser',
      status: 'ACTIVE',
      isSandbox: true,
      advertiserBudgetPaise: 500000,
      spentBudgetPaise: 0,
      authorizedAgreementRef: 'AGR-SANDBOX-002',
      webhookSecret: 'sandbox_secret_key_12345678901234567890',
      createdBy: earnerUser._id,
    });
  }

  // 3. Create NEW disposable test task (30 seconds, 10 promotional points)
  const disposableTitle = `[ACCEPTANCE TEST] Single Uninterrupted Away Attempt (${Date.now()})`;
  const task = await Task.create({
    campaignId: campaign._id,
    title: disposableTitle,
    description: '30-second single uninterrupted away attempt testing',
    category: 'ARTICLE_READ',
    verificationMethod: 'FIRST_PARTY_ACTION',
    rewardPoints: 10,
    totalCap: 100,
    dailyCapPerUser: 1,
    dwellTimeSeconds: 30,
    articleReadConfig: {
      articleTitle: 'Single Uninterrupted Attempt Guide',
      articleContent: 'Single uninterrupted away attempt verification model.',
      sourceUrl: 'https://en.wikipedia.org/wiki/Zero_trust_security_model',
      minReadDurationSeconds: 30,
    },
    createdBy: earnerUser._id,
    status: 'PUBLISHED',
  });

  const taskId = task._id.toString();
  console.log(`3. Created NEW test task: ${task.title} (ID: ${taskId})`);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // =========================================================================
  // STEP 1: Start Session
  // =========================================================================
  console.log('\n--- STEP 1: Start External Link Session ---');
  const startRes = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/start`, {
    method: 'POST',
    headers: authHeaders,
  });
  const startJson: any = await startRes.json();
  console.log('Start Response:', JSON.stringify(startJson));
  const sessionId = startJson.data.sessionId;

  // =========================================================================
  // STEP 2: Attempt 1 - Launch link (attempt 1) -> 17 sec away -> Return early
  // =========================================================================
  console.log('\n--- STEP 2: Attempt 1 - Launch Link -> 17s Away -> Return Early ---');
  const launch1Res = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/launch`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId, success: true }),
  });
  const launch1Json: any = await launch1Res.json();
  const attemptId1 = launch1Json.data.attemptId;
  console.log(`Attempt 1 Started! attemptId: ${attemptId1}, isAway: ${launch1Json.data.isAway}`);

  // Fast forward attemptStartedAt by 17 seconds to simulate 17s away accurately
  const seventeenSecondsAgo = new Date(Date.now() - 17000);
  await ExternalLinkSession.updateOne({ sessionId }, { $set: { attemptStartedAt: seventeenSecondsAgo } });
  console.log('Simulated 17 seconds elapsed away in browser.');

  // Return to ADPAYON with attemptId1
  const return1Res = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/return`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId, attemptId: attemptId1 }),
  });
  const return1Json: any = await return1Res.json();
  console.log('Return 1 Response:', JSON.stringify(return1Json));

  if (return1Json.data.status !== 'RETURNED_EARLY') {
    throw new Error(`Expected status RETURNED_EARLY, got ${return1Json.data.status}`);
  }
  if (return1Json.data.elapsedSeconds !== 0) {
    throw new Error(`Expected elapsedSeconds: 0, got ${return1Json.data.elapsedSeconds}`);
  }
  if (return1Json.data.remainingSeconds !== 30) {
    throw new Error(`Expected remainingSeconds: 30, got ${return1Json.data.remainingSeconds}`);
  }
  if (return1Json.data.isDurationMet !== false) {
    throw new Error('Expected isDurationMet: false');
  }
  const expectedMessage = 'You returned early. Open the link again and complete the full 30 seconds.';
  if (return1Json.data.message !== expectedMessage) {
    throw new Error(`Expected message: "${expectedMessage}", got "${return1Json.data.message}"`);
  }
  console.log('✓ PASS: 17s away returned early -> progress reset to 0/30, message correct!');

  // Verify backend strictly rejects claim
  const earlyClaimRes = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/verify`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId }),
  });
  const earlyClaimJson: any = await earlyClaimRes.json();
  if (earlyClaimRes.status !== 400 || earlyClaimJson.status !== 'RETURNED_EARLY') {
    throw new Error(`Expected 400 RETURNED_EARLY, got ${earlyClaimRes.status}`);
  }
  console.log('✓ PASS: Backend strictly rejected claim after returning early (HTTP 400 RETURNED_EARLY)');

  // =========================================================================
  // STEP 3: Waiting inside ADPAYON must NOT advance progress (still 0/30)
  // =========================================================================
  console.log('\n--- STEP 3: Wait Inside ADPAYON (3 seconds) ---');
  await sleep(3000);

  const statusInsideRes = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/status`, {
    headers: authHeaders,
  });
  const statusInsideJson: any = await statusInsideRes.json();
  console.log('Status while waiting inside ADPAYON:', JSON.stringify(statusInsideJson));

  if (statusInsideJson.data.elapsedSeconds !== 0) {
    throw new Error(`Progress leaked inside ADPAYON! elapsedSeconds: ${statusInsideJson.data.elapsedSeconds}`);
  }
  if (statusInsideJson.data.isDurationMet !== false) {
    throw new Error('isDurationMet must remain false while inside ADPAYON');
  }
  console.log('✓ PASS: Waiting inside ADPAYON did NOT advance progress: still 0/30!');

  // =========================================================================
  // STEP 4: Attempt 2 (Try Again) - 15 sec away -> Reset again (never combine!)
  // =========================================================================
  console.log('\n--- STEP 4: Attempt 2 (Try Again) -> 15s Away -> Reset Again ---');
  const launch2Res = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/launch`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId, success: true }),
  });
  const launch2Json: any = await launch2Res.json();
  const attemptId2 = launch2Json.data.attemptId;
  console.log(`Attempt 2 Started! attemptId: ${attemptId2}`);

  if (attemptId2 === attemptId1) {
    throw new Error('Attempt 2 must have a unique attemptId distinct from Attempt 1');
  }

  // Simulate 15s away
  const fifteenSecondsAgo = new Date(Date.now() - 15000);
  await ExternalLinkSession.updateOne({ sessionId }, { $set: { attemptStartedAt: fifteenSecondsAgo } });
  console.log('Simulated 15 seconds elapsed away in browser.');

  // Test delayed return packet from older attempt 1 -> Must be safely ignored
  console.log('Sending delayed return from older Attempt 1 (attemptId1)...');
  const delayedRes = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/return`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId, attemptId: attemptId1 }),
  });
  const delayedJson: any = await delayedRes.json();
  console.log('Delayed packet response:', JSON.stringify(delayedJson));
  if (!delayedJson.data.ignored) {
    throw new Error('Delayed event from older attempt was not ignored!');
  }
  console.log('✓ PASS: Stale attemptId return safely ignored!');

  // Return to ADPAYON with attemptId2
  const return2Res = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/return`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId, attemptId: attemptId2 }),
  });
  const return2Json: any = await return2Res.json();
  console.log('Return 2 Response:', JSON.stringify(return2Json));

  if (return2Json.data.status !== 'RETURNED_EARLY') {
    throw new Error(`Expected status RETURNED_EARLY for Attempt 2, got ${return2Json.data.status}`);
  }
  if (return2Json.data.elapsedSeconds !== 0) {
    throw new Error(`Expected elapsedSeconds: 0 (Never combine time!), got ${return2Json.data.elapsedSeconds}`);
  }
  if (return2Json.data.remainingSeconds !== 30) {
    throw new Error(`Expected remainingSeconds: 30, got ${return2Json.data.remainingSeconds}`);
  }
  console.log('✓ PASS: Attempt 2 (15s away) reset again to 0/30! Time was NEVER combined (17s + 15s != 32s).');

  // =========================================================================
  // STEP 5: Attempt 3 (Try Again) - 30+ sec uninterrupted away -> Eligible
  // =========================================================================
  console.log('\n--- STEP 5: Attempt 3 (Try Again) -> 30+s Uninterrupted Away -> Eligible ---');
  const launch3Res = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/launch`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId, success: true }),
  });
  const launch3Json: any = await launch3Res.json();
  const attemptId3 = launch3Json.data.attemptId;
  console.log(`Attempt 3 Started! attemptId: ${attemptId3}`);

  // Simulate 31 seconds away uninterrupted
  const thirtyOneSecondsAgo = new Date(Date.now() - 31000);
  await ExternalLinkSession.updateOne({ sessionId }, { $set: { attemptStartedAt: thirtyOneSecondsAgo } });
  console.log('Simulated 31 seconds uninterrupted away in browser.');

  // Return to ADPAYON with attemptId3
  const return3Res = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/return`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId, attemptId: attemptId3 }),
  });
  const return3Json: any = await return3Res.json();
  console.log('Return 3 Response:', JSON.stringify(return3Json));

  if (return3Json.data.status !== 'DURATION_MET' || !return3Json.data.isDurationMet) {
    throw new Error(`Expected DURATION_MET, got ${return3Json.data.status}`);
  }
  if (return3Json.data.elapsedSeconds !== 30) {
    throw new Error(`Expected elapsedSeconds: 30, got ${return3Json.data.elapsedSeconds}`);
  }
  if (return3Json.data.remainingSeconds !== 0) {
    throw new Error(`Expected remainingSeconds: 0, got ${return3Json.data.remainingSeconds}`);
  }
  console.log('✓ PASS: Single uninterrupted 31s attempt met! READY TO CLAIM.');

  // =========================================================================
  // STEP 6: Claim Reward - Exactly One Ledger Credit
  // =========================================================================
  console.log('\n--- STEP 6: Claim Reward Verification ---');
  const verifyRes = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/verify`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId }),
  });
  const verifyJson: any = await verifyRes.json();
  console.log(`Verify Status: ${verifyRes.status}`, JSON.stringify(verifyJson));

  if (verifyRes.status !== 200 || verifyJson.status !== 'COMPLETED') {
    throw new Error(`Verification failed: ${JSON.stringify(verifyJson)}`);
  }
  console.log(`✓ PASS: Task verified! Completion ID: ${verifyJson.data.completionId}, Reward: ${verifyJson.data.rewardPoints} pts`);

  // Verify Ledger Entry
  const ledgerEntries = await WalletLedgerEntry.find({
    userId: earnerUser._id,
    referenceEntity: 'TaskCompletion',
    referenceId: new Types.ObjectId(verifyJson.data.completionId),
  });
  console.log(`Found ${ledgerEntries.length} wallet ledger entry/entries:`);
  for (const entry of ledgerEntries) {
    console.log(`  - Entry ID: ${entry._id}, amountPaise: ${entry.amountPaise}, pointsEquivalent: ${entry.pointsEquivalent}, status: ${entry.status}`);
  }

  if (ledgerEntries.length !== 1) {
    throw new Error(`Expected exactly 1 ledger entry, found ${ledgerEntries.length}`);
  }
  if (ledgerEntries[0].amountPaise !== 0) {
    throw new Error(`Expected promotional non-withdrawable points (amountPaise: 0), got ${ledgerEntries[0].amountPaise}`);
  }
  if (ledgerEntries[0].pointsEquivalent !== 10) {
    throw new Error(`Expected pointsEquivalent: 10, got ${ledgerEntries[0].pointsEquivalent}`);
  }
  console.log('✓ PASS: Exactly one promotional ledger entry created with 0 withdrawable paise and 10 points.');

  // Verify Evidence
  const evidence = await VerificationEvidence.findById(verifyJson.data.evidenceId);
  if (!evidence) {
    throw new Error('Evidence record not found');
  }
  console.log('Verification Evidence:', JSON.stringify(evidence.rawPayload));
  if (evidence.rawPayload.evidenceLabel !== 'EXTERNAL_LINK_ELAPSED') {
    throw new Error(`Expected evidenceLabel EXTERNAL_LINK_ELAPSED, got ${evidence.rawPayload.evidenceLabel}`);
  }
  if (!evidence.rawPayload.clientReportedAwayTime) {
    throw new Error('Expected clientReportedAwayTime: true');
  }
  if (!evidence.rawPayload.singleUninterruptedAwayAttempt) {
    throw new Error('Expected singleUninterruptedAwayAttempt: true');
  }
  console.log('✓ PASS: Evidence verified with client-reported away time and single uninterrupted attempt!');

  // =========================================================================
  // STEP 7: Duplicate Claim / Idempotency Test
  // =========================================================================
  console.log('\n--- STEP 7: Duplicate Claim / Idempotency Test ---');
  const dupVerifyRes = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/verify`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId }),
  });
  const dupVerifyJson: any = await dupVerifyRes.json();
  console.log('Duplicate Verify Response:', JSON.stringify(dupVerifyJson));

  if (dupVerifyRes.status !== 200 || !dupVerifyJson.idempotent) {
    throw new Error(`Expected idempotent HTTP 200 replay, got ${dupVerifyRes.status}`);
  }

  const finalLedgerCount = await WalletLedgerEntry.countDocuments({
    userId: earnerUser._id,
    referenceEntity: 'TaskCompletion',
    referenceId: new Types.ObjectId(verifyJson.data.completionId),
  });
  if (finalLedgerCount !== 1) {
    throw new Error(`Duplicate credit detected! Ledger count: ${finalLedgerCount}`);
  }
  console.log('✓ PASS: Re-verifying is strictly idempotent. Exactly 1 ledger entry preserved!');

  console.log('\n======================================================');
  console.log('ALL SINGLE UNINTERRUPTED AWAY ATTEMPT ACCEPTANCE TESTS PASSED!');
  console.log('======================================================');

  await mongoose.disconnect();
}

runSingleAttemptAcceptanceTest().catch((err) => {
  console.error('Acceptance test failed:', err);
  process.exit(1);
});
