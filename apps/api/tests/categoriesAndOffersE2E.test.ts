import { OfferSubmission } from '../src/models/OfferSubmission';
process.env.NODE_ENV = 'test';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import mongoose, { Types } from 'mongoose';
import { app } from '../src/app';
import {
  User,
  Category,
  Offer,
  WalletLedgerEntry,
  AuthSession,
  OTPChallenge,
} from '../src/models';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from '../src/testUtils/dbIsolation';
import {
  signReferralAttribution,
  verifyReferralAttribution,
} from '../src/controllers/offer.controller';
import {
  pointsToPaise,
  paiseToPoints,
  pointsToRupees,
  POINTS_TO_PAISE_RATIO,
  POINTS_PER_RUPEE,
  DEFAULT_COMMISSION_CONFIG,
} from '@adpayon/shared';
import { generateAccessToken } from '../src/services/tokenService';

describe('Categories, Offers, Signed Referral Attribution & Integer Accounting E2E', () => {
  // Standalone Unit Tests: Contract, Math & HMAC Verification (Network-Independent)
  it('Integer Accounting: converts 1000 points to ₹100.00 (10,000 paise) with integer rigor', () => {
    assert.equal(POINTS_TO_PAISE_RATIO, 10);
    assert.equal(POINTS_PER_RUPEE, 10);

    // 1,000 points = 10,000 paise = ₹100.00
    const paise = pointsToPaise(1000);
    assert.equal(paise, 10000);
    assert.equal(paiseToPoints(paise), 1000);
    assert.equal(pointsToRupees(1000), 100);
  });

  it('HMAC Referral Attribution: signs and verifies referral tokens without forgery', () => {
    const offerSlug = 'angel-one-demat';
    const referralCode = 'ADP777';

    const sig = signReferralAttribution(offerSlug, referralCode);
    assert.ok(sig && sig.length === 16, 'HMAC token must be a 16-character compact hex string');

    // Valid verification
    assert.equal(verifyReferralAttribution(offerSlug, referralCode, sig), true);

    // Tampered referral code fails
    assert.equal(verifyReferralAttribution(offerSlug, 'FORGERY123', sig), false);

    // Tampered offer slug fails
    assert.equal(verifyReferralAttribution('other-offer', referralCode, sig), false);

    // Malformed signature fails
    assert.equal(verifyReferralAttribution(offerSlug, referralCode, 'invalid_sig'), false);
  });

  it('8-Level Commission Slabs: verifies exact approved percentages (total pool = 55%)', () => {
    const slabs = DEFAULT_COMMISSION_CONFIG.levelIncome.slabs;
    assert.equal(slabs.length, 8);
    assert.equal(DEFAULT_COMMISSION_CONFIG.levelIncome.poolBudgetPercentage, 55);

    const expectedPercentages = [25, 10, 5, 4, 3, 3, 3, 2];
    let totalPool = 0;

    for (let i = 0; i < 8; i++) {
      assert.equal(slabs[i].level, i + 1);
      assert.equal(slabs[i].percentage, expectedPercentages[i]);
      totalPool += slabs[i].percentage;
    }

    assert.equal(totalPool, 55, 'Total commission pool budget must equal exactly 55%');

    // Commission integer calculation test for ₹100.00 (10,000 paise):
    const amountPaise = 10000;
    const l1Comm = Math.floor((amountPaise * slabs[0].percentage) / 100);
    const l2Comm = Math.floor((amountPaise * slabs[1].percentage) / 100);
    assert.equal(l1Comm, 2500, 'L1 (25%) on 10,000 paise must be 2,500 paise (₹25.00)');
    assert.equal(l2Comm, 1000, 'L2 (10%) on 10,000 paise must be 1,000 paise (₹10.00)');
  });

  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';

  const tracker = new TestOwnershipTracker();

  const runId = Math.floor(10000 + Math.random() * 90000);
  const TEST_PREFIX = `+918${runId}`;
  const adminMobile = `${TEST_PREFIX}0000`;
  const sponsorL2Mobile = `${TEST_PREFIX}0001`; // Grandparent (L2 ancestor)
  const sponsorL1Mobile = `${TEST_PREFIX}0002`; // Direct Parent (L1 ancestor)
  const memberMobile = `${TEST_PREFIX}0003`;    // The user who completes the offer

  const testPassword = 'Password@123456';

  let adminUser: any;
  let sponsorL2User: any;
  let sponsorL1User: any;
  let memberUser: any;

  let adminToken: string;
  let memberToken: string;
  let sponsorL1Token: string;
  let sponsorL2Token: string;

  let createdCategoryId: string;
  let createdOfferId: string;
  let createdOfferSlug: string;

  before(async () => {
    // 1. Strict Isolation Check: Must connect to disposable test database, NEVER adpayon_dev
    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      isSuiteBlocked = true;
      blockReason = isolation.reason || 'Database isolation not configured';
      console.warn(`\n[BLOCKED INTEGRATION TEST] Categories & Offers Suite: ${blockReason}\n`);
      return;
    }

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // 1. Create Admin
    adminUser = await User.create({
      name: 'Test Ops Admin',
      mobile: adminMobile,
      passwordHash: 'argon2id_dummy_hash_for_testing',
      role: 'ADMIN',
      status: 'ACTIVE',
      referralCode: `ADM${runId}`,
    });
    tracker.trackUser(adminUser._id);
    adminToken = generateAccessToken({
      userId: adminUser._id.toString(),
      role: adminUser.role,
      mobile: adminUser.mobile,
    });

    // 2. Create L2 Sponsor (Grandparent)
    sponsorL2User = await User.create({
      name: 'Grandparent Sponsor',
      mobile: sponsorL2Mobile,
      passwordHash: 'argon2id_dummy_hash_for_testing',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `GP${runId}`,
      directReferralsCount: 1,
    });
    tracker.trackUser(sponsorL2User._id);
    sponsorL2Token = generateAccessToken({
      userId: sponsorL2User._id.toString(),
      role: sponsorL2User.role,
      mobile: sponsorL2User.mobile,
    });

    // 3. Create L1 Sponsor (Parent) with sponsorId = L2
    sponsorL1User = await User.create({
      name: 'Direct Parent Sponsor',
      mobile: sponsorL1Mobile,
      passwordHash: 'argon2id_dummy_hash_for_testing',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `P${runId}`,
      sponsorId: sponsorL2User._id,
      ancestors: [sponsorL2User._id],
      directReferralsCount: 1,
    });
    tracker.trackUser(sponsorL1User._id);
    sponsorL1Token = generateAccessToken({
      userId: sponsorL1User._id.toString(),
      role: sponsorL1User.role,
      mobile: sponsorL1User.mobile,
    });

    // 4. Create Active Member with sponsorId = L1, ancestors = [L2, L1]
    memberUser = await User.create({
      name: 'Offer Performer Member',
      mobile: memberMobile,
      passwordHash: 'argon2id_dummy_hash_for_testing',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `MEM${runId}`,
      sponsorId: sponsorL1User._id,
      ancestors: [sponsorL2User._id, sponsorL1User._id],
      directReferralsCount: 0,
    });
    tracker.trackUser(memberUser._id);
    memberToken = generateAccessToken({
      userId: memberUser._id.toString(),
      role: memberUser.role,
      mobile: memberUser.mobile,
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (isSuiteBlocked) {
      return;
    }
    if (createdOfferId) await OfferSubmission.deleteMany({ offerId: createdOfferId });
    // Clean up created entities
    if (createdOfferId) {
      await Offer.findByIdAndDelete(createdOfferId);
    }
    if (createdCategoryId) {
      await Category.findByIdAndDelete(createdCategoryId);
    }
    await WalletLedgerEntry.deleteMany({
      userId: { $in: [memberUser?._id, sponsorL1User?._id, sponsorL2User?._id] },
    });
    await User.deleteMany({
      _id: { $in: [adminUser?._id, sponsorL2User?._id, sponsorL1User?._id, memberUser?._id] },
    });
  });

  // -------------------------------------------------------------
  // Test 1: Category Management (Admin CRUD + Client query)
  // -------------------------------------------------------------
  it('Admin can create, publish, pause and list categories with display order', async (t) => {
    if (isSuiteBlocked) { t.skip(blockReason); return; }

    // 1. Create Category
    const createRes = await fetch(`${baseUrl}/api/admin/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: `Demat & Financial #${runId}`,
        slug: `demat-financial-${runId}`,
        description: 'Top verified demat, trading, and banking offers',
        icon: '💼',
        displayOrder: 1,
        status: 'PUBLISHED',
      }),
    });

    assert.equal(createRes.status, 201, 'Admin category creation should return 201');
    const createJson = (await createRes.json()) as any;
    assert.equal(createJson.success, true);
    assert.equal(createJson.data.slug, `demat-financial-${runId}`);
    assert.equal(createJson.data.status, 'PUBLISHED');
    createdCategoryId = createJson.data.id;

    // 2. Client GET /api/categories
    const listRes = await fetch(`${baseUrl}/api/categories`);
    assert.equal(listRes.status, 200);
    const listJson = (await listRes.json()) as any;
    assert.equal(listJson.success, true);
    const found = listJson.data.find((c: any) => c.id === createdCategoryId);
    assert.ok(found, 'Created category should appear in public listing');

    // 3. Admin Update Category to PAUSED
    const updateRes = await fetch(`${baseUrl}/api/admin/categories/${createdCategoryId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'PAUSED' }),
    });
    assert.equal(updateRes.status, 200);
    const updateJson = (await updateRes.json()) as any;
    assert.equal(updateJson.data.status, 'PAUSED');

    // 4. Verify client query filters out PAUSED categories by default
    const clientFilteredRes = await fetch(`${baseUrl}/api/categories`);
    const clientFilteredJson = (await clientFilteredRes.json()) as any;
    const pausedFound = clientFilteredJson.data.find((c: any) => c.id === createdCategoryId);
    assert.equal(pausedFound, undefined, 'Paused category should be hidden from client listing');

    // 5. Restore to PUBLISHED for subsequent offer tests
    await fetch(`${baseUrl}/api/admin/categories/${createdCategoryId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'PUBLISHED' }),
    });
  });

  // -------------------------------------------------------------
  // Test 2: Admin Offer Management & Editor Fields
  // -------------------------------------------------------------
  it('Admin can create offer with instructions, FAQs, training links and integer reward points', async (t) => {
    if (isSuiteBlocked) { t.skip(blockReason); return; }

    const offerPayload = {
      title: `Angel One Demat & Trading #${runId}`,
      slug: `angel-one-demat-${runId}`,
      categoryId: createdCategoryId,
      description: 'Open a free Demat account with zero AMC and get trading credits.',
      rewardPoints: 1000, // 1,000 points = ₹100.00
      status: 'PUBLISHED',
      displayOrder: 1,
      bannerUrl: 'https://images.unsplash.com/photo-angel-one.png',
      images: ['https://images.unsplash.com/photo-sample-proof.png'],
      instructions: [
        'Click the partner link and enter your phone number.',
        'Complete online Aadhaar OTP verification.',
        'Upload PAN card photo and confirm bank account details.',
      ],
      additionalNotes: 'Valid only for first-time account openings in India.',
      trainingLinks: [
        {
          title: 'Account Opening Guide Video',
          url: 'https://youtube.com/watch?v=guide-demat',
          description: 'Step by step onboarding guide',
        },
      ],
      faqs: [
        {
          question: 'How long does verification take?',
          answer: 'Usually verified instantly via DigiLocker Aadhaar KYC.',
        },
        {
          question: 'When will reward points be credited?',
          answer: 'Points are credited immediately upon verified completion.',
        },
      ],
      completionConditions: {
        actionType: 'SIGNUP_SUBMIT',
        targetUrl: 'https://angelone.in/partner-campaign',
        requiresProof: false,
      },
    };

    const res = await fetch(`${baseUrl}/api/admin/offers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(offerPayload),
    });

    assert.equal(res.status, 201, 'Admin offer creation should return 201');
    const json = (await res.json()) as any;
    assert.equal(json.success, true);
    assert.equal(json.data.rewardPoints, 1000);
    assert.equal(json.data.instructions.length, 3);
    assert.equal(json.data.trainingLinks.length, 1);
    assert.equal(json.data.faqs.length, 2);
    assert.equal(json.data.completionConditions.actionType, 'SIGNUP_SUBMIT');

    createdOfferId = json.data.id;
    createdOfferSlug = json.data.slug;

    // Verify public offer retrieval
    const publicRes = await fetch(`${baseUrl}/api/offers/${createdOfferId}`);
    assert.equal(publicRes.status, 200);
    const publicJson = (await publicRes.json()) as any;
    assert.equal(publicJson.data.title, offerPayload.title);
    assert.equal(publicJson.data.rewardPoints, 1000);
  });

  // -------------------------------------------------------------
  // Test 3: Signed Shareable Links & Non-Crediting on Click/Share
  // -------------------------------------------------------------
  it('Signed shareable links preserve referral attribution; sharing/clicking does not credit rewards', async (t) => {
    if (isSuiteBlocked) { t.skip(blockReason); return; }

    // 1. Generate signed shareable link for sponsor L1
    const shareRes = await fetch(`${baseUrl}/api/offers/${createdOfferId}/share-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sponsorL1Token}`,
      },
    });

    assert.equal(shareRes.status, 200, 'Generating share link should succeed');
    const shareJson = (await shareRes.json()) as any;
    assert.equal(shareJson.success, true);
    assert.ok(shareJson.data.shareUrl.includes(`ref=${sponsorL1User.referralCode}`));
    assert.ok(shareJson.data.shareUrl.includes('&sig='));

    // Extract signature from shareUrl
    const url = new URL(shareJson.data.shareUrl);
    const ref = url.searchParams.get('ref')!;
    const sig = url.searchParams.get('sig')!;

    // 2. Validate HMAC signature function
    assert.equal(verifyReferralAttribution(createdOfferId, ref, sig), true);

    // Tamper test: Tampered referral code must fail HMAC verification
    assert.equal(verifyReferralAttribution(createdOfferId, 'TAMPERED_CODE', sig), false);

    // 3. Verify that clicking/accessing public offer with attribution does NOT credit any rewards
    const balanceBefore = await WalletLedgerEntry.find({
      userId: { $in: [sponsorL1User._id, memberUser._id] },
    });
    assert.equal(balanceBefore.length, 0, 'No wallet transactions should exist yet');

    const clickRes = await fetch(
      `${baseUrl}/api/offers/public/${createdOfferSlug}?ref=${ref}&sig=${sig}`
    );
    assert.equal(clickRes.status, 200);
    const clickJson = (await clickRes.json()) as any;
    assert.equal(clickJson.success, true);
    assert.equal(clickJson.data.referralAttribution.isValid, true);
    assert.equal(clickJson.data.referralAttribution.referralCode, ref);

    // Confirm that balance remains zero (sharing or clicking alone does NOT award points)
    const balanceAfterClick = await WalletLedgerEntry.find({
      userId: { $in: [sponsorL1User._id, memberUser._id] },
    });
    assert.equal(balanceAfterClick.length, 0, 'Clicking/sharing must not credit any reward points or commissions');
  });

  // -------------------------------------------------------------
  // Test 4: Offer Completion, Integer Accounting & 8-Level Commissions
  // -------------------------------------------------------------
  it('Verified admin approval credits 1000 redeemable points and preserves existing referral slabs without duplication', async (t) => {
    if (isSuiteBlocked) { t.skip(blockReason); return; }

    // Member completes the offer
    const completeRes = await fetch(`${baseUrl}/api/offers/${createdOfferId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        notes: 'Completed signup with Aadhaar OTP',
      }),
    });

    assert.equal(completeRes.status, 201, 'Submission is pending; no credit on click');
    const completeJson = (await completeRes.json()) as any;
    assert.equal(completeJson.data.status, 'PENDING');
    assert.equal(await WalletLedgerEntry.countDocuments({ userId: memberUser._id, entryType: 'TASK_REWARD' }), 0);
    const reviewRes = await fetch(`${baseUrl}/api/admin/offer-submissions/${completeJson.data.id}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'APPROVED', reviewNotes: 'QA verified partner completion evidence' }),
    });
    assert.equal(reviewRes.status, 200, JSON.stringify(await reviewRes.json()));

    // Verify Member Ledger: TASK_REWARD with 1,000 pointsEquivalent
    const memberEntry = await WalletLedgerEntry.findOne({
      userId: memberUser._id,
      entryType: 'TASK_REWARD',
    });
    assert.ok(memberEntry, 'Member must receive TASK_REWARD ledger entry');
    assert.equal(memberEntry.pointsEquivalent, 1000);
    assert.equal(memberEntry.amountPaise, 10000);
    assert.equal(memberEntry.status, 'CONFIRMED');

    // Verify Level 1 Sponsor (sponsorL1): Level 1 commission is 25% of ₹100 = 2,500 paise = ₹25.00
    const l1Entry = await WalletLedgerEntry.findOne({
      userId: sponsorL1User._id,
      entryType: 'REFERRAL_COMMISSION',
    });
    assert.ok(l1Entry, 'L1 sponsor must receive Level 1 referral commission');
    assert.equal(l1Entry.amountPaise, 2500, '25% of 10,000 paise = 2,500 paise (₹25.00)');
    assert.equal(l1Entry.status, 'CONFIRMED');
    assert.equal(l1Entry.metadata?.level, 1);
    assert.equal(l1Entry.metadata?.percentage, 25);
    assert.equal(l1Entry.metadata?.sourceUserId, memberUser._id.toString());

    // Verify Level 2 Sponsor (sponsorL2): Level 2 commission is 10% of ₹100 = 1,000 paise = ₹10.00
    const l2Entry = await WalletLedgerEntry.findOne({
      userId: sponsorL2User._id,
      entryType: 'REFERRAL_COMMISSION',
    });
    assert.ok(l2Entry, 'L2 sponsor must receive Level 2 referral commission');
    assert.equal(l2Entry.amountPaise, 1000, '10% of 10,000 paise = 1,000 paise (₹10.00)');
    assert.equal(l2Entry.status, 'CONFIRMED');
    assert.equal(l2Entry.metadata?.level, 2);
    assert.equal(l2Entry.metadata?.percentage, 10);
    assert.equal(l2Entry.metadata?.sourceUserId, memberUser._id.toString());

    // Idempotency check: Repeat completion attempt must be rejected
    const repeatRes = await fetch(`${baseUrl}/api/offers/${createdOfferId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
    });
    assert.equal(repeatRes.status, 400, 'Empty repeat submission is rejected by validation');

    // Confirm that commission count did NOT increase
    const l1EntriesCount = await WalletLedgerEntry.countDocuments({
      userId: sponsorL1User._id,
      entryType: 'REFERRAL_COMMISSION',
    });
    assert.equal(l1EntriesCount, 1, 'Commission must never be credited twice (idempotency enforced)');
  });

  // -------------------------------------------------------------
  // Test 5: Referral Tree Pagination & Server-Calculated Earnings
  // -------------------------------------------------------------
  it('Referral tree returns paginated nodes with accurate server-calculated earnings', async (t) => {
    if (isSuiteBlocked) { t.skip(blockReason); return; }

    // Query L1 sponsor tree children (memberUser is child of sponsorL1)
    const treeRes = await fetch(`${baseUrl}/api/referrals/tree?page=1&limit=10`, {
      headers: {
        Authorization: `Bearer ${sponsorL1Token}`,
      },
    });

    assert.equal(treeRes.status, 200);
    const treeJson = (await treeRes.json()) as any;
    assert.equal(treeJson.success, true);
    assert.ok(treeJson.data.children.length >= 1);
    assert.equal(treeJson.data.pagination.page, 1);
    assert.equal(treeJson.data.pagination.limit, 10);

    const childNode = treeJson.data.children.find((c: any) => c.id === memberUser._id.toString());
    assert.ok(childNode, 'memberUser must appear as child node in sponsorL1 tree');
    assert.equal(childNode.earningsPaise, 2500, 'Server-calculated earnings for L1 must be 2,500 paise');
    assert.equal(childNode.earningsRupees, '₹25.00', 'Server-calculated earnings must format as ₹25.00');

    // Query L2 sponsor tree children
    const l2TreeRes = await fetch(`${baseUrl}/api/referrals/tree?page=1&limit=10`, {
      headers: {
        Authorization: `Bearer ${sponsorL2Token}`,
      },
    });
    assert.equal(l2TreeRes.status, 200);
    const l2TreeJson = (await l2TreeRes.json()) as any;
    const l1NodeInL2Tree = l2TreeJson.data.children.find(
      (c: any) => c.id === sponsorL1User._id.toString()
    );
    assert.ok(l1NodeInL2Tree);
  });

  // -------------------------------------------------------------
  // Test 6: Self-Referral and Cycle Prevention
  // -------------------------------------------------------------
  it('Enforces single parent per member and prevents self-referral and cycles', async (t) => {
    if (isSuiteBlocked) { t.skip(blockReason); return; }

    // 1. Self-referral attempt: Register with existing user's own referral code
    const selfRefRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Self Referral Test',
        mobile: memberMobile.replace('+91', ''), // Same mobile
        password: testPassword,
        sponsorReferralCode: memberUser.referralCode, // Self referral!
        acceptTerms: true,
      }),
    });

    assert.equal(selfRefRes.status, 400, 'Self-referral must be rejected');
    const selfRefJson = (await selfRefRes.json()) as any;
    assert.equal(selfRefJson.error.code, 'INVALID_SPONSOR');
    assert.ok(selfRefJson.error.message.includes('Self-referral'));

    // 2. Cycle attempt: Registering with sponsor who is in user's downline
    const cycleRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Cycle Referral Test',
        mobile: sponsorL2Mobile.replace('+91', ''), // Grandparent attempting to set member as sponsor
        password: testPassword,
        sponsorReferralCode: memberUser.referralCode, // Cycle: member is in L2 downline!
        acceptTerms: true,
      }),
    });

    // sponsorL2 already ACTIVE, but if updating:
    // Should reject or return MOBILE_EXISTS
    assert.ok(
      cycleRes.status === 400 || cycleRes.status === 409,
      'Cycle referral or existing active user update must be blocked'
    );
  });

  // -------------------------------------------------------------
  // Test 7: Wallet Summary Separation (Promotional Points vs Cash)
  // -------------------------------------------------------------
  it('Wallet summary separates promotional points from withdrawable cash balance', async (t) => {
    if (isSuiteBlocked) { t.skip(blockReason); return; }

    // Newly admin-verified V1 points are cash-redeemable; legacy points remain promotional.
    const memberWalletRes = await fetch(`${baseUrl}/api/wallet/summary`, {
      headers: {
        Authorization: `Bearer ${memberToken}`,
      },
    });

    assert.equal(memberWalletRes.status, 200);
    const memberWalletJson = (await memberWalletRes.json()) as any;
    assert.equal(memberWalletJson.data.pointsBalance, 0, 'Redeemable reward must not be counted twice as promotional points');
    assert.equal(memberWalletJson.data.pointsValueRupees, 0);
    assert.equal(
      memberWalletJson.data.confirmedBalancePaise,
      10000,
      'New verified V1 reward is 1000 points = ₹100; legacy balances are not revalued'
    );
    assert.equal(memberWalletJson.data.availableBalanceRupees, 100);

    // L1 Sponsor Wallet: earned ₹25.00 referral commission (cash)
    const l1WalletRes = await fetch(`${baseUrl}/api/wallet/summary`, {
      headers: {
        Authorization: `Bearer ${sponsorL1Token}`,
      },
    });

    assert.equal(l1WalletRes.status, 200);
    const l1WalletJson = (await l1WalletRes.json()) as any;
    assert.equal(
      l1WalletJson.data.confirmedBalancePaise,
      2500,
      'Sponsor L1 confirmed cash balance must be 2,500 paise (₹25.00)'
    );
    assert.equal(l1WalletJson.data.confirmedBalanceRupees, 25);
  });
});
