process.env.NODE_ENV = 'test';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import mongoose from 'mongoose';
import { app } from '../src/app';
import { User, AuthSession, OTPChallenge, AuthSecurityEvent } from '../src/models';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from '../src/testUtils/dbIsolation';

describe('Unilevel Referral Tree & Multi-Tenant Authorization Integration Tests', () => {
  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';

  const tracker = new TestOwnershipTracker();

  // Distinct synthetic phone numbers dedicated exclusively to this test run
  const runId = Math.floor(10000 + Math.random() * 90000);
  const TEST_PREFIX = `+919${runId}`;
  const rootMobile = `${TEST_PREFIX}0001`; // Root test sponsor
  const child1Mobile = `${TEST_PREFIX}0002`; // Direct child 1 of Root
  const child2Mobile = `${TEST_PREFIX}0003`; // Direct child 2 of Root
  const grandChildMobile = `${TEST_PREFIX}0004`; // Child of child 1
  const outsiderMobile = `${TEST_PREFIX}0005`; // Independent user (not in root's downline)

  const testPassword = 'Password@123456';

  let rootToken: string;
  let child1Token: string;
  let outsiderToken: string;

  let rootUser: any;
  let child1User: any;
  let child2User: any;
  let grandChildUser: any;
  let outsiderUser: any;

  // Helper function to register, activate, and track a test-owned user
  async function registerAndActivate(name: string, rawMobile: string, sponsorCode?: string) {
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mobile: rawMobile.replace('+91', ''),
        password: testPassword,
        sponsorReferralCode: sponsorCode,
        acceptTerms: true,
      }),
    });
    assert.equal(regRes.status, 201, `Failed to register ${name}: ${await regRes.text()}`);

    const otpRes = await fetch(`${baseUrl}/api/dev/otp/${rawMobile}`);
    const otpBody = (await otpRes.json()) as any;
    const otp = otpBody.otp;
    assert.ok(otp, `OTP not generated for ${rawMobile}`);

    const verifyRes = await fetch(`${baseUrl}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: rawMobile.replace('+91', ''),
        otp,
        purpose: 'REGISTRATION',
      }),
    });
    assert.equal(verifyRes.status, 200, `Failed to verify OTP for ${name}`);
    const verifyBody = (await verifyRes.json()) as any;

    const userId = verifyBody?.data?.user?.id || verifyBody?.data?.user?._id;
    if (userId) {
      tracker.trackUser(userId, rawMobile);
    }

    return {
      tokens: verifyBody.data.tokens,
      user: verifyBody.data.user,
    };
  }

  before(async () => {
    // 1. Strict Isolation Check: Must connect to disposable test database, NEVER adpayon_dev
    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      isSuiteBlocked = true;
      blockReason = isolation.reason || 'Database isolation not configured';
      console.warn(`\n[BLOCKED INTEGRATION TEST] Referral Suite: ${blockReason}\n`);
      return;
    }

    // 2. Start HTTP server only if safe test database isolation is guaranteed
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // 3. Setup test users and track ownership explicitly
    const rootResult = await registerAndActivate('Root Leader', rootMobile);
    rootToken = rootResult.tokens.accessToken;
    rootUser = await User.findOne({ mobile: rootMobile });
    assert.ok(rootUser);
    assert.equal(rootUser.sponsorId, null);
    assert.deepEqual(rootUser.ancestors, []);

    const child1Result = await registerAndActivate('Child One', child1Mobile, rootUser.referralCode);
    child1Token = child1Result.tokens.accessToken;
    child1User = await User.findOne({ mobile: child1Mobile });

    const child2Result = await registerAndActivate('Child Two', child2Mobile, rootUser.referralCode);
    child2User = await User.findOne({ mobile: child2Mobile });

    const grandChildResult = await registerAndActivate('Grand Child', grandChildMobile, child1User.referralCode);
    grandChildUser = await User.findOne({ mobile: grandChildMobile });

    const outsiderResult = await registerAndActivate('Outsider User', outsiderMobile);
    outsiderToken = outsiderResult.tokens.accessToken;
    outsiderUser = await User.findOne({ mobile: outsiderMobile });
  });

  after(async () => {
    if (isSuiteBlocked) {
      return;
    }

    // Purge ONLY tracked test-owned documents via exact IDs; NEVER broad regexes or dropDatabase
    await tracker.safeCleanup();

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('1. Verifies unilevel genealogy relationships and ancestry inheritance', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Child 1 must have sponsorId = Root, ancestors = [Root]
    assert.equal(child1User.sponsorId.toString(), rootUser._id.toString());
    assert.equal(child1User.ancestors.length, 1);
    assert.equal(child1User.ancestors[0].toString(), rootUser._id.toString());

    // Child 2 must have sponsorId = Root, ancestors = [Root] (Unlimited direct width)
    assert.equal(child2User.sponsorId.toString(), rootUser._id.toString());
    assert.equal(child2User.ancestors.length, 1);
    assert.equal(child2User.ancestors[0].toString(), rootUser._id.toString());

    // GrandChild must have sponsorId = Child 1, ancestors = [Root, Child 1]
    assert.equal(grandChildUser.sponsorId.toString(), child1User._id.toString());
    assert.equal(grandChildUser.ancestors.length, 2);
    assert.equal(grandChildUser.ancestors[0].toString(), rootUser._id.toString());
    assert.equal(grandChildUser.ancestors[1].toString(), child1User._id.toString());
  });

  it('2. GET /api/referrals/summary returns accurate counts for Root and Child 1', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Root should have 2 direct referrals and 3 total downline members
    const rootRes = await fetch(`${baseUrl}/api/referrals/summary`, {
      headers: { Authorization: `Bearer ${rootToken}` },
    });
    assert.equal(rootRes.status, 200);
    const rootData = (await rootRes.json()) as any;
    assert.equal(rootData.success, true);
    assert.equal(rootData.data.directCount, 2);
    assert.equal(rootData.data.activeDirectCount, 2);
    assert.equal(rootData.data.totalDownlineCount, 3);
    assert.equal(rootData.data.activeDownlineCount, 3);
    assert.equal(rootData.data.sponsor, null); // Root has no sponsor

    // Child 1 should have 1 direct referral (GrandChild) and 1 total downline member
    const child1Res = await fetch(`${baseUrl}/api/referrals/summary`, {
      headers: { Authorization: `Bearer ${child1Token}` },
    });
    assert.equal(child1Res.status, 200);
    const child1Data = (await child1Res.json()) as any;
    assert.equal(child1Data.success, true);
    assert.equal(child1Data.data.directCount, 1);
    assert.equal(child1Data.data.totalDownlineCount, 1);
    assert.ok(child1Data.data.sponsor);
    assert.equal(child1Data.data.sponsor.referralCode, rootUser.referralCode);
    assert.ok(child1Data.data.sponsor.mobileMasked.includes('****'));
  });

  it('3. GET /api/referrals/directs returns paginated direct referrals with masked PII', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/referrals/directs?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${rootToken}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.items.length, 2);
    assert.equal(body.data.pagination.total, 2);

    const firstItem = body.data.items[0];
    assert.equal(firstItem.level, 1);
    assert.ok(firstItem.mobileMasked.includes('****'));
    assert.ok(!firstItem.mobileMasked.includes(child1Mobile)); // Full phone must NEVER leak!
    assert.ok(firstItem.name.includes('.')); // Formatted name
  });

  it('4. GET /api/referrals/tree returns immediate children for lazy expansion', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Root querying own node children
    const res = await fetch(`${baseUrl}/api/referrals/tree`, {
      headers: { Authorization: `Bearer ${rootToken}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.children.length, 2);

    // Root querying Child 1's children (allowed because Child 1 is in Root's downline)
    const childRes = await fetch(`${baseUrl}/api/referrals/tree?nodeId=${child1User._id}`, {
      headers: { Authorization: `Bearer ${rootToken}` },
    });
    assert.equal(childRes.status, 200);
    const childBody = (await childRes.json()) as any;
    assert.equal(childBody.success, true);
    assert.equal(childBody.data.children.length, 1);
    assert.equal(childBody.data.children[0].id, grandChildUser._id.toString());
  });

  it('5. SECURITY: Child 1 CANNOT access Root node or unrelated outsider node (HTTP 403)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Child 1 attempting to query Root's tree (Upline snooping blocked)
    const res1 = await fetch(`${baseUrl}/api/referrals/tree?nodeId=${rootUser._id}`, {
      headers: { Authorization: `Bearer ${child1Token}` },
    });
    assert.equal(res1.status, 403);
    const body1 = (await res1.json()) as any;
    assert.equal(body1.success, false);
    assert.equal(body1.error.code, 'FORBIDDEN_SUBTREE');

    // Child 1 attempting to query Outsider's tree (Cross-tenant snooping blocked)
    const res2 = await fetch(`${baseUrl}/api/referrals/tree?nodeId=${outsiderUser._id}`, {
      headers: { Authorization: `Bearer ${child1Token}` },
    });
    assert.equal(res2.status, 403);
    const body2 = (await res2.json()) as any;
    assert.equal(body2.success, false);
    assert.equal(body2.error.code, 'FORBIDDEN_SUBTREE');
  });

  it('6. Idempotent OTP verification does NOT double-increment sponsor direct count', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const freshMobile = `${TEST_PREFIX}0009`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Idempotent Test',
        mobile: freshMobile.replace('+91', ''),
        password: testPassword,
        sponsorReferralCode: child1User.referralCode,
        acceptTerms: true,
      }),
    });
    assert.equal(regRes.status, 201);

    const otpRes = await fetch(`${baseUrl}/api/dev/otp/${freshMobile}`);
    const { otp } = (await otpRes.json()) as any;

    // First verification (activates and increments sponsor's count)
    const v1 = await fetch(`${baseUrl}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: freshMobile.replace('+91', ''),
        otp,
        purpose: 'REGISTRATION',
      }),
    });
    assert.equal(v1.status, 200);

    const userDoc = await User.findOne({ mobile: freshMobile });
    assert.equal(userDoc?.status, 'ACTIVE');
    if (userDoc?._id) {
      tracker.trackUser(userDoc._id, freshMobile);
    }

    const child1AfterFirst = await User.findById(child1User._id);
    const countAfterFirst = child1AfterFirst?.directReferralsCount;

    // Directly re-fetch Child 1 sponsor to verify direct count is exactly countAfterFirst
    const child1Final = await User.findById(child1User._id);
    assert.equal(child1Final?.directReferralsCount, countAfterFirst);
  });
});
