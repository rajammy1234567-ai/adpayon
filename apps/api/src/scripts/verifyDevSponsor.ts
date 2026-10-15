import { connectMongo, disconnectMongo, pingMongo } from '../db/mongoose';
import { User, OTPChallenge } from '../models';
import { logger } from '../config/logger';
import { env } from '../config/env';

const TEST_REG_MOBILE = '+919999990888';
const BASE_URL = `http://${env.HOST || '127.0.0.1'}:${env.PORT || 5000}`;

export async function runSponsorVerification(): Promise<void> {
  // 1. Database assertions
  await connectMongo();
  const isAlive = await pingMongo();
  if (!isAlive) throw new Error('MongoDB ping failed');

  logger.info('Verifying ADP1000 in database...');
  const sponsor = await User.findOne({ referralCode: 'ADP1000' });
  if (!sponsor) {
    throw new Error('Sponsor ADP1000 not found in database!');
  }

  if (sponsor.mobile !== '+919999901000') {
    throw new Error(`Unexpected sponsor mobile: ${sponsor.mobile}`);
  }
  if (sponsor.status !== 'ACTIVE') {
    throw new Error(`Sponsor status is not ACTIVE: ${sponsor.status}`);
  }
  if (sponsor.role !== 'USER') {
    throw new Error(`Sponsor role is not USER: ${sponsor.role}`);
  }

  console.log('✔ Database assertion passed: Sponsor ADP1000 exists, status=ACTIVE, role=USER.');

  // Clean any previous test registration user if present
  await User.deleteOne({ mobile: TEST_REG_MOBILE, referralCode: { $ne: 'ADP1000' } });
  await OTPChallenge.deleteMany({ mobile: TEST_REG_MOBILE });

  // 2. Test registration with ADP1000
  logger.info('Testing registration endpoint with sponsorReferralCode: ADP1000...');
  const regResponse = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Synthetic Sponsor Test User',
      mobile: '9999990888',
      password: 'SecurePassword123!',
      sponsorReferralCode: 'ADP1000',
      leg: 'LEFT',
      acceptTerms: true,
    }),
  });

  const regBody = (await regResponse.json()) as any;
  if (regResponse.status !== 201) {
    throw new Error(`Registration failed with status ${regResponse.status}: ${JSON.stringify(regBody)}`);
  }

  // 3. Verify user in database has sponsorId set to ADP1000's _id
  const testUser = await User.findOne({ mobile: TEST_REG_MOBILE });
  if (!testUser) {
    throw new Error('Test registered user not found in database');
  }

  if (!testUser.sponsorId || testUser.sponsorId.toString() !== sponsor._id.toString()) {
    throw new Error(
      `Sponsor linkage mismatch! Expected: ${sponsor._id.toString()}, Got: ${testUser.sponsorId?.toString()}`
    );
  }

  console.log('✔ Registration endpoint accepted ADP1000 and linked sponsorId correctly in MongoDB.');

  // 4. Test registration with invalid sponsor code (must fail with 400 INVALID_SPONSOR)
  const invalidResponse = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Invalid Sponsor Test',
      mobile: '9999990889',
      password: 'SecurePassword123!',
      sponsorReferralCode: 'ADP999999999',
      leg: 'LEFT',
      acceptTerms: true,
    }),
  });

  const invalidBody = (await invalidResponse.json()) as any;
  if (invalidResponse.status !== 400 || invalidBody.error?.code !== 'INVALID_SPONSOR') {
    throw new Error(
      `Expected HTTP 400 INVALID_SPONSOR, got ${invalidResponse.status}: ${JSON.stringify(invalidBody)}`
    );
  }

  console.log('✔ Invalid sponsor code was rejected with HTTP 400 INVALID_SPONSOR as expected.');

  // 5. Cleanup temporary test user and OTP challenges
  await User.deleteOne({ mobile: TEST_REG_MOBILE, referralCode: { $ne: 'ADP1000' } });
  await OTPChallenge.deleteMany({ mobile: TEST_REG_MOBILE });
  console.log('✔ Cleaned up temporary test user and OTP records.');
}

if (require.main === module) {
  runSponsorVerification()
    .then(() => {
      console.log('\n============================================================');
      console.log('ALL SPONSOR VERIFICATION CHECKS PASSED');
      console.log('============================================================\n');
      return disconnectMongo().then(() => process.exit(0));
    })
    .catch((err) => {
      logger.error({ err: err.message }, 'Sponsor verification failed');
      disconnectMongo().finally(() => process.exit(1));
    });
}
