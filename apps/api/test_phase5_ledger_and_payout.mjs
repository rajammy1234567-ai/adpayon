import mongoose from 'mongoose';
import crypto from 'crypto';

const API_BASE = 'http://127.0.0.1:5000/api';

async function step(name, fn) {
  console.log(`\n======================================================`);
  console.log(`>>> STEP: ${name}`);
  console.log(`======================================================`);
  await fn();
}

async function run() {
  console.log('--- STARTING ADPAYON PHASE 5 & 6: DOUBLE-ENTRY LEDGER & WITHDRAWAL TEST ---');

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
      throw new Error(`Admin login step 1 failed: ${JSON.stringify(initData)}`);
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
  const userMobile = `+9178888${Math.floor(10000 + Math.random() * 90000)}`;
  const userPassword = 'TestEarner123!Secure';

  await step('2. Register & Authenticate Fresh Test Earner', async () => {
    const regRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Phase 5 Payout Test User',
        mobile: userMobile,
        password: userPassword,
        acceptTerms: true,
      }),
    });
    const regData = await regRes.json();
    if (!regData.success) {
      throw new Error(`Failed to register test user: ${JSON.stringify(regData)}`);
    }

    const { lookupStagingReviewerOtp } = await import('./dist/src/scripts/lookupStagingReviewerOtp.js');
    const otp = await lookupStagingReviewerOtp(userMobile);
    if (!otp) throw new Error('Could not retrieve registration OTP');

    const verifyRes = await fetch(`${API_BASE}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: userMobile,
        otp,
        purpose: 'REGISTRATION',
      }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success || !verifyData.data?.tokens?.accessToken) {
      throw new Error(`Failed to verify registration: ${JSON.stringify(verifyData)}`);
    }

    userToken = verifyData.data.tokens.accessToken;
    userId = verifyData.data.user.id;
    console.log(`[PASS] Test Earner authenticated: User ID=${userId}`);
  });

  const userHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${userToken}`,
  };

  // Step 3: Check Initial Wallet Summary
  await step('3. Check Initial Wallet Summary & Zero-Balance Ledger', async () => {
    const res = await fetch(`${API_BASE}/wallet/summary`, { headers: userHeaders });
    const data = await res.json();
    if (!data.success) {
      throw new Error(`Failed to get wallet summary: ${JSON.stringify(data)}`);
    }
    if (data.data.availableBalancePaise !== 0) {
      throw new Error(`New user must have 0 available balance, got ${data.data.availableBalancePaise}`);
    }
    console.log(`[PASS] Initial wallet verified: Available=₹${data.data.availableBalanceRupees}, Minimum Withdrawal=₹${data.data.minWithdrawalRupees}`);
  });

  // Step 4: Credit Authorized Test Reward to Ledger Directly
  await step('4. Record Verified Authorized Task Reward to Ledger', async () => {
    const { WalletLedgerEntry } = await import('./dist/src/models/WalletLedgerEntry.js');
    const { connectMongo } = await import('./dist/src/db/mongoose.js');
    await connectMongo();

    await WalletLedgerEntry.create({
      userId: new mongoose.Types.ObjectId(userId),
      entryType: 'TASK_REWARD',
      amountPaise: 10000, // ₹100.00
      pointsEquivalent: 10000,
      status: 'CONFIRMED',
      balanceBeforePaise: 0,
      balanceAfterPaise: 10000,
      notes: 'Authorized contract settlement for Verified Research Campaign',
    });

    console.log('[PASS] ₹100.00 (10,000 paise) credited to double-entry ledger.');
  });

  // Step 5: Check Updated Wallet Summary
  await step('5. Check Authoritative Wallet Summary after Reward', async () => {
    const res = await fetch(`${API_BASE}/wallet/summary`, { headers: userHeaders });
    const data = await res.json();
    if (!data.success || data.data.availableBalancePaise !== 10000) {
      throw new Error(`Wallet balance mismatch: ${JSON.stringify(data)}`);
    }
    console.log(`[PASS] Wallet summary updated: Available=₹${data.data.availableBalanceRupees}, Confirmed=₹${data.data.confirmedBalanceRupees}`);
  });

  // Step 6: Test User KYC Submission
  await step('6. Submit & Verify KYC Information', async () => {
    const kycRes = await fetch(`${API_BASE}/users/kyc`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({
        panNumber: 'ABCDE1234F',
        aadhaarLast4: '5678',
        accountHolderName: 'Phase 5 Payout Test User',
        bankAccount: '123456789012',
        ifscCode: 'SBIN0001234',
      }),
    });
    const kycData = await kycRes.json();
    if (!kycData.success || kycData.data?.kycStatus !== 'VERIFIED') {
      throw new Error(`KYC submission failed: ${JSON.stringify(kycData)}`);
    }
    console.log('[PASS] KYC verified and recorded on user profile.');
  });

  // Step 7: Test Minimum Withdrawal Threshold Enforcement
  await step('7. Test Minimum Withdrawal Limit Defense', async () => {
    const subMinRes = await fetch(`${API_BASE}/wallet/withdraw`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({
        amountPaise: 2000, // ₹20 (under ₹50 min)
        payoutMode: 'UPI',
        beneficiaryDetails: { upiId: 'testearner@okaxis' },
      }),
    });
    const subMinData = await subMinRes.json();
    if (subMinRes.status === 200 && subMinData.success) {
      throw new Error('SECURITY VIOLATION: Withdrawal below minimum ₹50 limit was allowed!');
    }
    console.log(`[PASS] Minimum threshold strictly enforced: HTTP ${subMinRes.status}`);
  });

  // Step 8: Submit Valid Withdrawal Request (₹60 / 6000 paise)
  let withdrawalId;
  await step('8. Submit Valid ₹60.00 Withdrawal Request & Verify Hold', async () => {
    const withRes = await fetch(`${API_BASE}/wallet/withdraw`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({
        amountPaise: 6000, // ₹60.00
        payoutMode: 'UPI',
        beneficiaryDetails: { upiId: 'testearner@okaxis' },
      }),
    });
    const withData = await withRes.json();
    if (!withData.success || !withData.data?.withdrawal?.id) {
      throw new Error(`Withdrawal request failed: ${JSON.stringify(withData)}`);
    }
    withdrawalId = withData.data.withdrawal.id;
    console.log(`[PASS] Withdrawal requested. ID: ${withdrawalId}, Status: ${withData.data.withdrawal.status}`);

    // Verify wallet summary reflects reserved hold
    const sumRes = await fetch(`${API_BASE}/wallet/summary`, { headers: userHeaders });
    const sumData = await sumRes.json();
    if (sumData.data.availableBalancePaise !== 4000 || sumData.data.reservedWithdrawalPaise !== 6000) {
      throw new Error(`Balance reservation failed! Available=${sumData.data.availableBalancePaise}, Reserved=${sumData.data.reservedWithdrawalPaise}`);
    }
    console.log(`[PASS] Wallet hold verified: Available=₹${sumData.data.availableBalanceRupees}, Reserved=₹${sumData.data.reservedWithdrawalRupees}`);
  });

  // Step 9: Admin Review Queue & Reversal Flow
  await step('9. Admin Rejection with Compensating Balance Reversal', async () => {
    // Admin inspects queue
    const listRes = await fetch(`${API_BASE}/admin/withdrawals?status=REQUESTED`, {
      headers: adminHeaders,
    });
    const listData = await listRes.json();
    const found = listData.data?.withdrawals?.find((w) => w.id === withdrawalId);
    if (!found) {
      throw new Error(`Withdrawal ${withdrawalId} not found in admin queue!`);
    }
    console.log(`[PASS] Withdrawal found in Admin Queue: Amount=₹${found.amountRupees}`);

    // Admin rejects with reason
    const revRes = await fetch(`${API_BASE}/admin/withdrawals/${withdrawalId}/review`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        status: 'REJECTED',
        adminReviewNotes: 'Beneficiary UPI handle verification test reversal.',
      }),
    });
    const revData = await revRes.json();
    if (!revData.success || revData.data?.withdrawal?.status !== 'REJECTED') {
      throw new Error(`Admin rejection failed: ${JSON.stringify(revData)}`);
    }
    console.log(`[PASS] Withdrawal marked REJECTED by Admin.`);

    // Verify hold was released and available balance returned to ₹100
    const sumRes = await fetch(`${API_BASE}/wallet/summary`, { headers: userHeaders });
    const sumData = await sumRes.json();
    if (sumData.data.availableBalancePaise !== 10000 || sumData.data.reservedWithdrawalPaise !== 0) {
      throw new Error(`Reversal balance restoration failed! Available=${sumData.data.availableBalancePaise}`);
    }
    console.log(`[PASS] Reversal completed: Reserved=₹0.00, Available restored to ₹${sumData.data.availableBalanceRupees}`);
  });

  // Step 10: Submit New Withdrawal & Admin Approves as PAID
  await step('10. Process Authoritative Payout Approval (PAID)', async () => {
    const withRes = await fetch(`${API_BASE}/wallet/withdraw`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({
        amountPaise: 5000, // ₹50.00
        payoutMode: 'UPI',
        beneficiaryDetails: { upiId: 'testearner@okaxis' },
      }),
    });
    const withData = await withRes.json();
    const newId = withData.data.withdrawal.id;

    // Admin approves as PAID with mock UTR reference
    const payRes = await fetch(`${API_BASE}/admin/withdrawals/${newId}/review`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        status: 'PAID',
        payoutReference: 'SANDBOX-NPCI-UTR-20261023001',
        adminReviewNotes: 'Authoritative sandbox bank transfer confirmed.',
      }),
    });
    const payData = await payRes.json();
    if (!payData.success || payData.data?.withdrawal?.status !== 'PAID') {
      throw new Error(`Admin payout approval failed: ${JSON.stringify(payData)}`);
    }
    console.log(`[PASS] Payout approved: Status=PAID, ProcessedAt=${payData.data.withdrawal.processedAt}`);

    // Verify wallet summary
    const sumRes = await fetch(`${API_BASE}/wallet/summary`, { headers: userHeaders });
    const sumData = await sumRes.json();
    if (sumData.data.totalWithdrawnPaise !== 5000 || sumData.data.availableBalancePaise !== 5000) {
      throw new Error(`Post-payout summary incorrect: ${JSON.stringify(sumData)}`);
    }
    console.log(`[PASS] Post-payout ledger state: Available=₹${sumData.data.availableBalanceRupees}, Withdrawn=₹${sumData.data.totalWithdrawnRupees}`);
  });

  // Step 11: Google Play Required Account Deletion
  await step('11. Google Play Mandatory Account Deletion Verification', async () => {
    const delRes = await fetch(`${API_BASE}/users/delete-account`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' }),
    });
    const delData = await delRes.json();
    if (!delData.success) {
      throw new Error(`Account deletion failed: ${JSON.stringify(delData)}`);
    }
    console.log(`[PASS] Account deletion response: "${delData.message}"`);

    // Verify subsequent requests are denied
    const checkRes = await fetch(`${API_BASE}/wallet/summary`, { headers: userHeaders });
    if (checkRes.status !== 401 && checkRes.status !== 403) {
      throw new Error(`Deleted user session was not revoked! HTTP ${checkRes.status}`);
    }
    console.log(`[PASS] Deleted user session correctly rejected with HTTP ${checkRes.status}.`);
  });

  console.log(`\n======================================================`);
  console.log(`>>> ALL PHASE 5 & 6 LEDGER, PAYOUT & DELETION TESTS PASSED! <<<`);
  console.log(`======================================================`);
  process.exit(0);
}

run().catch((err) => {
  console.error('\n[FATAL] PHASE 5 & 6 TEST FAILED:', err);
  process.exit(1);
});
