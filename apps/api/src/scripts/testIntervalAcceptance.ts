import mongoose, { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
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

async function runAcceptanceTest() {
  console.log('=== EXTERNAL LINK INTERVAL TIMING ACCEPTANCE TEST ===\n');

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
      name: 'Sandbox Acceptance Campaign',
      advertiserName: 'Sandbox QA Advertiser',
      status: 'ACTIVE',
      isSandbox: true,
      advertiserBudgetPaise: 500000,
      spentBudgetPaise: 0,
      authorizedAgreementRef: 'AGR-SANDBOX-001',
      webhookSecret: 'sandbox_secret_key_12345678901234567890',
      createdBy: earnerUser._id,
    });
  }

  // 3. Create NEW disposable test task (30 seconds, 10 promotional points)
  const disposableTitle = `[DISPOSABLE ACCEPTANCE] Zero Trust Architecture (${Date.now()})`;
  const task = await Task.create({
    campaignId: campaign._id,
    title: disposableTitle,
    description: '30-second external link article engagement with interval tracking',
    category: 'ARTICLE_READ',
    verificationMethod: 'FIRST_PARTY_ACTION',
    rewardPoints: 10,
    totalCap: 100,
    dailyCapPerUser: 1,
    dwellTimeSeconds: 30,
    articleReadConfig: {
      articleTitle: 'Zero Trust Architecture Guide',
      articleContent: 'Zero trust security model overview and principles.',
      sourceUrl: 'https://en.wikipedia.org/wiki/Zero_trust_security_model',
      minReadDurationSeconds: 30,
    },
    createdBy: earnerUser._id,
    status: 'PUBLISHED',
  });

  const taskId = task._id.toString();
  console.log(`3. Created NEW disposable test task: ${task.title} (ID: ${taskId})`);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // STEP A: Start session
  console.log('\n--- STEP A: Start External Link Session ---');
  const startRes = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/start`, {
    method: 'POST',
    headers: authHeaders,
  });
  const startJson: any = await startRes.json();
  console.log('Start Response:', JSON.stringify(startJson));
  const sessionId = startJson.data.sessionId;

  // STEP B: Open/Launch link (Begins 1st away interval)
  console.log('\n--- STEP B: Launch External Link (Begins 1st Away Interval) ---');
  const launchRes = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/launch`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId, success: true }),
  });
  const launchJson: any = await launchRes.json();
  console.log('Launch Response:', JSON.stringify(launchJson));
  console.log(`Interval Started! isAway: ${launchJson.data.isAway}`);

  // STEP C: Simulate 10 seconds spent away in external browser
  console.log('\n--- STEP C: User is Away in Browser for 10 Seconds ---');
  // Fast forward activeIntervalStartedAt by 10 seconds in DB to simulate 10s away accurately
  const tenSecondsAgo = new Date(Date.now() - 10000);
  await ExternalLinkSession.updateOne({ sessionId }, { $set: { activeIntervalStartedAt: tenSecondsAgo } });
  console.log('Simulated 10 seconds elapsed away.');

  // STEP D: User returns to ADPAYON (Closes interval and PAUSES progress immediately)
  console.log('\n--- STEP D: User Returns to ADPAYON -> Calls /external-link/return ---');
  const returnRes = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/return`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId }),
  });
  const returnJson: any = await returnRes.json();
  console.log('Return Response:', JSON.stringify(returnJson));
  console.log(`Accumulated Away Seconds: ${returnJson.data.accumulatedAwaySeconds}s`);
  console.log(`Remaining Seconds: ${returnJson.data.remainingSeconds}s`);
  console.log(`Is Away: ${returnJson.data.isAway}`);
  console.log(`Is Duration Met: ${returnJson.data.isDurationMet}`);

  if (returnJson.data.accumulatedAwaySeconds < 10) {
    throw new Error('Expected at least 10 accumulated away seconds');
  }
  if (returnJson.data.remainingSeconds !== 20 && returnJson.data.remainingSeconds !== 19) {
    console.warn(`Remaining seconds: ${returnJson.data.remainingSeconds} (target was ~20)`);
  }

  // STEP E: Waiting inside ADPAYON must NOT increase progress
  console.log('\n--- STEP E: Waiting inside ADPAYON (Simulating staying on screen) ---');
  console.log('Sleeping 3 seconds inside ADPAYON...');
  await sleep(3000);

  const pausedStatusRes = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/status`, {
    headers: authHeaders,
  });
  const pausedJson: any = await pausedStatusRes.json();
  console.log('Status after waiting inside ADPAYON:', JSON.stringify(pausedJson));
  console.log(`Elapsed Seconds after waiting: ${pausedJson.data.elapsedSeconds}s (Must be equal to ${returnJson.data.accumulatedAwaySeconds}s)`);

  if (pausedJson.data.elapsedSeconds !== returnJson.data.accumulatedAwaySeconds) {
    throw new Error(`PROGRESS LEAK: Elapsed seconds increased inside ADPAYON from ${returnJson.data.accumulatedAwaySeconds} to ${pausedJson.data.elapsedSeconds}!`);
  }
  console.log('SUCCESS: Progress did NOT advance while inside ADPAYON!');

  // STEP F: Attempt Claim while incomplete -> Backend must reject with INSUFFICIENT_DURATION
  console.log('\n--- STEP F: Attempt Verify While Incomplete ---');
  const earlyVerifyRes = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/verify`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId }),
  });
  const earlyVerifyJson: any = await earlyVerifyRes.json();
  console.log(`Early Verify Status: ${earlyVerifyRes.status}`);
  console.log('Early Verify Response:', JSON.stringify(earlyVerifyJson));

  if (earlyVerifyRes.status !== 400 || earlyVerifyJson.status !== 'INCOMPLETE') {
    throw new Error(`Expected HTTP 400 INCOMPLETE, got ${earlyVerifyRes.status}`);
  }
  console.log(`SUCCESS: Backend strictly rejected early claim with message: "${earlyVerifyJson.error.message}"`);

  // STEP G: User taps Resume -> Opens URL and begins 2nd away interval
  console.log('\n--- STEP G: User Taps Resume -> Re-launches URL (Begins 2nd Away Interval) ---');
  const resumeLaunchRes = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/launch`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId, success: true }),
  });
  const resumeLaunchJson: any = await resumeLaunchRes.json();
  console.log('Resume Launch Response:', JSON.stringify(resumeLaunchJson));
  console.log(`2nd Interval Started! isAway: ${resumeLaunchJson.data.isAway}`);

  // STEP H: Simulate remaining 20 seconds away in browser
  console.log('\n--- STEP H: User Spends Remaining 20 Seconds in Browser ---');
  const twentySecondsAgo = new Date(Date.now() - 20000);
  await ExternalLinkSession.updateOne({ sessionId }, { $set: { activeIntervalStartedAt: twentySecondsAgo } });
  console.log('Simulated 20 seconds elapsed away.');

  // STEP I: User returns to ADPAYON (Closes interval and completes requirement)
  console.log('\n--- STEP I: User Returns to ADPAYON -> Calls /external-link/return ---');
  const return2Res = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/return`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId }),
  });
  const return2Json: any = await return2Res.json();
  console.log('2nd Return Response:', JSON.stringify(return2Json));
  console.log(`Total Accumulated Away Seconds: ${return2Json.data.accumulatedAwaySeconds}s / 30s`);
  console.log(`Remaining Seconds: ${return2Json.data.remainingSeconds}s`);
  console.log(`Is Duration Met: ${return2Json.data.isDurationMet}`);

  if (!return2Json.data.isDurationMet || return2Json.data.accumulatedAwaySeconds < 30) {
    throw new Error('Expected duration to be met (at least 30 accumulated away seconds)');
  }
  console.log('SUCCESS: Required 30 seconds away satisfied across intervals!');

  // STEP J: Claim Reward
  console.log('\n--- STEP J: User Taps Claim Promotional Reward ---');
  const verifyRes = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/verify`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId }),
  });
  const verifyJson: any = await verifyRes.json();
  console.log(`Verify Status: ${verifyRes.status}`);
  console.log('Verify Response:', JSON.stringify(verifyJson));

  if (verifyRes.status !== 200 || verifyJson.status !== 'COMPLETED') {
    throw new Error(`Claim failed with status ${verifyRes.status}: ${JSON.stringify(verifyJson)}`);
  }
  console.log(`SUCCESS: Reward verified! Points: ${verifyJson.data.rewardPoints}`);

  // STEP K: Inspect Wallet Ledger Entry
  console.log('\n--- STEP K: Inspect Wallet Ledger Entries ---');
  const ledgerEntries = await WalletLedgerEntry.find({
    userId: earnerUser._id,
    referenceEntity: 'TaskCompletion',
    referenceId: new Types.ObjectId(verifyJson.data.completionId),
  });
  console.log(`Found ${ledgerEntries.length} ledger entry/entries for completion:`);
  for (const entry of ledgerEntries) {
    console.log(`  - Entry ID: ${entry._id}, amountPaise: ${entry.amountPaise}, pointsEquivalent: ${entry.pointsEquivalent}, status: ${entry.status}`);
  }

  if (ledgerEntries.length !== 1) {
    throw new Error(`Expected exactly 1 ledger entry, found ${ledgerEntries.length}`);
  }
  if (ledgerEntries[0].amountPaise !== 0) {
    throw new Error(`Expected amountPaise: 0, found ${ledgerEntries[0].amountPaise}`);
  }
  if (ledgerEntries[0].pointsEquivalent !== 10) {
    throw new Error(`Expected pointsEquivalent: 10, found ${ledgerEntries[0].pointsEquivalent}`);
  }

  // STEP L: Duplicate Claim Attempt (Must NOT grant double credit)
  console.log('\n--- STEP L: Duplicate Claim Attempt ---');
  const dupVerifyRes = await fetch(`${API_BASE}/api/tasks/${taskId}/external-link/verify`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ sessionId }),
  });
  const dupVerifyJson: any = await dupVerifyRes.json();
  console.log(`Duplicate Verify Status: ${dupVerifyRes.status}`);
  console.log('Duplicate Verify Response:', JSON.stringify(dupVerifyJson));

  const totalLedgerEntries = await WalletLedgerEntry.countDocuments({
    userId: earnerUser._id,
    referenceEntity: 'TaskCompletion',
    referenceId: new Types.ObjectId(verifyJson.data.completionId),
  });
  console.log(`Total ledger entries after duplicate claim: ${totalLedgerEntries}`);
  if (totalLedgerEntries !== 1) {
    throw new Error(`DUPLICATE CREDIT LEAK: Found ${totalLedgerEntries} ledger entries!`);
  }
  console.log('SUCCESS: Zero duplicate credits granted on replay!');

  // STEP M: Inspect Verification Evidence
  const evidence = await VerificationEvidence.findById(verifyJson.data.evidenceId);
  console.log('\n--- STEP M: Verification Evidence ---');
  console.log('Evidence Type:', evidence?.evidenceType);
  console.log('Raw Payload:', JSON.stringify(evidence?.rawPayload));

  console.log('\n======================================================');
  console.log('ALL ACCEPTANCE REQUIREMENTS FULLY VERIFIED!');
  console.log('======================================================\n');

  await mongoose.disconnect();
}

runAcceptanceTest().catch((err) => {
  console.error('Acceptance Test Failed:', err);
  process.exit(1);
});
