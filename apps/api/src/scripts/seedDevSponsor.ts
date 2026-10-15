import crypto from 'node:crypto';
import { connectMongo, disconnectMongo, pingMongo } from '../db/mongoose';
import { User } from '../models';
import { hashPassword } from '../services/passwordService';
import { logger } from '../config/logger';
import { env } from '../config/env';

export const DEV_SPONSOR_CONFIG = {
  referralCode: 'ADP1000',
  name: 'ADPAYON Dev Sponsor',
  mobile: '+919999901000',
  role: 'USER' as const,
  status: 'ACTIVE' as const,
};

export interface SeedDevSponsorResult {
  action: 'CREATED' | 'ALREADY_EXISTS';
  user: {
    id: string;
    mobile: string;
    name: string;
    referralCode: string;
    role: string;
    status: string;
    createdAt: Date;
  };
  database: string;
}

export async function seedDevSponsor(): Promise<SeedDevSponsorResult> {
  // 1. Strict Environment Safety Assertions
  if (env.NODE_ENV !== 'development') {
    throw new Error(
      `Safety guard violation: seedDevSponsor is strictly restricted to NODE_ENV=development. Current: ${env.NODE_ENV}`
    );
  }

  if (env.MONGODB_DB_NAME !== 'adpayon_dev') {
    throw new Error(
      `Safety guard violation: Database must strictly be 'adpayon_dev'. Current: ${env.MONGODB_DB_NAME}`
    );
  }

  // 2. Connect to MongoDB
  await connectMongo();
  const isAlive = await pingMongo();
  if (!isAlive) {
    throw new Error('Database ping failed. Cannot connect to MongoDB Atlas.');
  }

  logger.info(
    { database: env.MONGODB_DB_NAME, sponsorCode: DEV_SPONSOR_CONFIG.referralCode },
    'Checking development sponsor existence...'
  );

  // 3. Idempotent check by referralCode
  const existingByRef = await User.findOne({ referralCode: DEV_SPONSOR_CONFIG.referralCode });
  const existingByMobile = await User.findOne({ mobile: DEV_SPONSOR_CONFIG.mobile });

  if (existingByRef) {
    // Verify it matches the dev sponsor
    if (existingByRef.mobile !== DEV_SPONSOR_CONFIG.mobile) {
      throw new Error(
        `Conflicting record: Referral code ${DEV_SPONSOR_CONFIG.referralCode} belongs to mobile ${existingByRef.mobile}, not ${DEV_SPONSOR_CONFIG.mobile}`
      );
    }

    logger.info(
      { userId: existingByRef._id.toString(), referralCode: existingByRef.referralCode },
      'Development sponsor ADP1000 already exists and is valid. No changes made.'
    );

    return {
      action: 'ALREADY_EXISTS',
      user: {
        id: existingByRef._id.toString(),
        mobile: existingByRef.mobile,
        name: existingByRef.name,
        referralCode: existingByRef.referralCode,
        role: existingByRef.role,
        status: existingByRef.status,
        createdAt: existingByRef.createdAt,
      },
      database: env.MONGODB_DB_NAME,
    };
  }

  if (existingByMobile) {
    throw new Error(
      `Conflicting record: Mobile ${DEV_SPONSOR_CONFIG.mobile} already registered with referral code ${existingByMobile.referralCode}`
    );
  }

  // 4. Secure Credential Generation (Never expose plaintext, securely hashed via Argon2id)
  const syntheticPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = await hashPassword(syntheticPassword);

  // 5. Create the single authorized synthetic development sponsor
  const sponsor = await User.create({
    mobile: DEV_SPONSOR_CONFIG.mobile,
    name: DEV_SPONSOR_CONFIG.name,
    passwordHash,
    role: DEV_SPONSOR_CONFIG.role,
    status: DEV_SPONSOR_CONFIG.status,
    referralCode: DEV_SPONSOR_CONFIG.referralCode,
    sponsorId: null,
    metadata: {
      language: 'en',
      kycStatus: 'NOT_SUBMITTED',
    },
  });

  logger.info(
    {
      userId: sponsor._id.toString(),
      referralCode: sponsor.referralCode,
      mobile: sponsor.mobile,
    },
    'Development sponsor ADP1000 bootstrapped successfully.'
  );

  return {
    action: 'CREATED',
    user: {
      id: sponsor._id.toString(),
      mobile: sponsor.mobile,
      name: sponsor.name,
      referralCode: sponsor.referralCode,
      role: sponsor.role,
      status: sponsor.status,
      createdAt: sponsor.createdAt,
    },
    database: env.MONGODB_DB_NAME,
  };
}

// Standalone execution entrypoint
if (require.main === module) {
  seedDevSponsor()
    .then((result) => {
      console.log('\n============================================================');
      console.log('DEVELOPMENT SPONSOR BOOTSTRAP RESULT:');
      console.log('------------------------------------------------------------');
      console.log('Action:          ', result.action);
      console.log('Database:        ', result.database);
      console.log('User ID:         ', result.user.id);
      console.log('Referral Code:   ', result.user.referralCode);
      console.log('Display Name:    ', result.user.name);
      console.log('Mobile (Synth):  ', result.user.mobile);
      console.log('Role:            ', result.user.role);
      console.log('Status:          ', result.user.status);
      console.log('Created At:      ', result.user.createdAt);
      console.log('============================================================\n');
      return disconnectMongo().then(() => process.exit(0));
    })
    .catch((err) => {
      logger.error({ err: err.message }, 'Development Sponsor Bootstrap Failed');
      disconnectMongo().finally(() => process.exit(1));
    });
}
