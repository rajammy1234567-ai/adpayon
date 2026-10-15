import { connectMongo, disconnectMongo, pingMongo } from '../db/mongoose';
import { User, IUser } from '../models';
import { logger } from '../config/logger';
import { env } from '../config/env';

export interface BackfillAncestryResult {
  totalScanned: number;
  updatedUsers: number;
  unchangedUsers: number;
  database: string;
}

/**
 * Idempotently and non-destructively backfills `ancestors` array and
 * `directReferralsCount` for all existing users in the database.
 * NEVER alters or reassigns existing sponsorId values.
 */
export async function backfillAncestry(): Promise<BackfillAncestryResult> {
  await connectMongo();
  const isAlive = await pingMongo();
  if (!isAlive) throw new Error('Database ping failed. Cannot connect to MongoDB.');

  logger.info({ database: env.MONGODB_DB_NAME }, 'Starting idempotent ancestry backfill...');

  // Sort by createdAt ascending so parents are processed before their descendants
  const users = await User.find({}).sort({ createdAt: 1 });

  let updatedUsers = 0;
  let unchangedUsers = 0;

  for (const user of users) {
    let desiredAncestors: any[] = [];

    if (user.sponsorId) {
      const sponsor = await User.findById(user.sponsorId);
      if (sponsor) {
        desiredAncestors = [...(sponsor.ancestors || []), sponsor._id];
      } else {
        logger.warn(
          { userId: user._id.toString(), sponsorId: user.sponsorId.toString() },
          'Sponsor record not found for user during backfill'
        );
      }
    }

    // Accurate direct referral count (active direct members)
    const activeDirectCount = await User.countDocuments({
      sponsorId: user._id,
      status: 'ACTIVE',
    });

    const currentAncestorsStrings = (user.ancestors || []).map((a) => a.toString());
    const desiredAncestorsStrings = desiredAncestors.map((a) => a.toString());

    const ancestorsMatch =
      currentAncestorsStrings.length === desiredAncestorsStrings.length &&
      currentAncestorsStrings.every((val, idx) => val === desiredAncestorsStrings[idx]);

    const directCountMatch = user.directReferralsCount === activeDirectCount;

    if (!ancestorsMatch || !directCountMatch) {
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            ancestors: desiredAncestors,
            directReferralsCount: activeDirectCount,
          },
        }
      );
      updatedUsers++;
      logger.info(
        {
          userId: user._id.toString(),
          referralCode: user.referralCode,
          ancestorsLength: desiredAncestors.length,
          directCount: activeDirectCount,
        },
        'Backfilled ancestry and direct count for user'
      );
    } else {
      unchangedUsers++;
    }
  }

  logger.info(
    { total: users.length, updated: updatedUsers, unchanged: unchangedUsers },
    'Ancestry backfill completed successfully.'
  );

  return {
    totalScanned: users.length,
    updatedUsers,
    unchangedUsers,
    database: env.MONGODB_DB_NAME,
  };
}

if (require.main === module) {
  backfillAncestry()
    .then((res) => {
      console.log('\n============================================================');
      console.log('ANCESTRY BACKFILL EXECUTION SUMMARY:');
      console.log('------------------------------------------------------------');
      console.log('Database:       ', res.database);
      console.log('Total Scanned:  ', res.totalScanned);
      console.log('Users Updated:  ', res.updatedUsers);
      console.log('Users Unchanged:', res.unchangedUsers);
      console.log('============================================================\n');
      return disconnectMongo().then(() => process.exit(0));
    })
    .catch((err) => {
      logger.error({ err: err.message }, 'Ancestry backfill failed');
      disconnectMongo().finally(() => process.exit(1));
    });
}
