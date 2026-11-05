import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { createOfferSchema, offerContentSchema } from '../src/validators/offerContent';
import { ledgerBalance } from '../src/services/wallet/balance';
import { convertRedemption, signQuote, verifyQuote, Quote } from '../src/services/wallet/redemptionQuote';
import { env } from '../src/config/env';
import { escapeHtml } from '../src/controllers/publicOfferPage.controller';

test('content preserves all admin sections, training descriptions and thumbnails', () => {
  const result = createOfferSchema.parse({ title: 'QA Offer', description: 'QA details', categoryId: new Types.ObjectId().toString(), rewardPoints: 1000,
    content: { benefits: ['One', 'Two'], eligibility: ['New users'], documents: ['Document'], terms: ['Rule'], trackingNotes: ['Tracked after verification'], payoutNotes: ['After approval'], marketingBanners: [{ title: 'Banner', imageUrl: 'https://example.test/banner.png' }] },
    trainingLinks: [{ title: 'Training', url: 'https://example.test/video', description: 'Video description', thumbnailUrl: 'https://example.test/thumb.png' }], completionConditions: { actionType: 'CUSTOM' } });
  assert.deepEqual(result.content?.benefits, ['One', 'Two']);
  assert.equal(result.trainingLinks[0].description, 'Video description');
  assert.equal(result.trainingLinks[0].thumbnailUrl, 'https://example.test/thumb.png');
});
test('admin content rejects script URLs, embedded credentials and oversized sections', () => {
  for (const url of ['javascript:alert(1)', 'data:image/png;base64,abc', 'ftp://example.test/image', 'https://user:password@example.test/a']) {
    assert.equal(offerContentSchema.safeParse({ logoUrl: url }).success, false);
  }
  assert.equal(offerContentSchema.safeParse({ benefits: Array(51).fill('test') }).success, false);
});
test('1000 verified points redeem for ₹100, USD uses integer cents rounded down', () => {
  assert.equal(convertRedemption(10000, 'INR'), 10000);
  assert.equal(convertRedemption(10000, 'USD', 8000), 125); // Synthetic QA rate, not a market quote.
  assert.equal(convertRedemption(10000, 'USD', 8333), 120);
  assert.throws(() => convertRedemption(10000, 'USD'));
  assert.throws(() => convertRedemption(10.5, 'INR'));
  assert.throws(() => convertRedemption(Number.MAX_SAFE_INTEGER + 1, 'INR'));
});
test('redemption quote binds account, amount, currency, expiry and purpose', () => {
  const q: Quote = { purpose: 'REDEMPTION', userId: 'QA', amountPaise: 10000, currency: 'USD', payoutMinor: 125, paisePerUsd: 8000, policyVersion: 2 };
  const token = signQuote(q);
  assert.equal(verifyQuote(token, 'QA', 10000, 'USD').payoutMinor, 125);
  assert.throws(() => verifyQuote(token, 'OTHER', 10000, 'USD'));
  assert.throws(() => verifyQuote(token, 'QA', 11000, 'USD'));
  assert.throws(() => verifyQuote(token, 'QA', 10000, 'INR'));
  assert.throws(() => verifyQuote(jwt.sign(q, env.JWT_ACCESS_SECRET, { audience: 'adpayon-redemption', expiresIn: -1 }), 'QA', 10000, 'USD'));
  assert.throws(() => verifyQuote(jwt.sign({ ...q, payoutMinor: 10000 }, env.JWT_ACCESS_SECRET, { audience: 'adpayon-redemption' }), 'QA', 10000, 'USD'));
});
test('legacy points stay promotional; verified rewards, holds, payments and reversals reconcile', () => {
  const credits = [
    { status: 'CONFIRMED', entryType: 'TASK_REWARD', amountPaise: 10000, pointsEquivalent: 1000 },
    { status: 'CONFIRMED', entryType: 'TASK_REWARD', amountPaise: 10000, pointsEquivalent: 1000, metadata: { rewardPolicy: 'REDEEMABLE_V1' } },
    { status: 'CONFIRMED', entryType: 'ADMIN_ADJUSTMENT', amountPaise: -1000 },
  ];
  const b = ledgerBalance(credits); assert.equal(b.availableBalancePaise, 9000); assert.equal(b.pointsBalance, 1000);
  assert.equal(ledgerBalance([...credits, { status: 'PENDING', entryType: 'WITHDRAWAL_HOLD', amountPaise: -5000 }]).availableBalancePaise, 4000);
  assert.equal(ledgerBalance([...credits, { status: 'REVERSED', entryType: 'WITHDRAWAL_HOLD', amountPaise: -5000 }]).availableBalancePaise, 9000);
  assert.equal(ledgerBalance([...credits, { status: 'CONFIRMED', entryType: 'WITHDRAWAL_PAID', amountPaise: -5000 }]).availableBalancePaise, 4000);
});
test('public offer HTML escapes admin-provided content', () => {
  assert.equal(escapeHtml('<script>"&\'</script>'), '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;');
});
