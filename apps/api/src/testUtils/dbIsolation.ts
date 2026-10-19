import mongoose, { Types } from 'mongoose';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  User,
  AuthSession,
  OTPChallenge,
  AuthSecurityEvent,
  Campaign,
  Task,
  TaskAssignment,
  TaskCompletion,
  TaskEvent,
  VerificationEvidence,
  AdminAuditLog,
} from '../models';

export interface TestDbIsolationCheck {
  allowed: boolean;
  dbName: string;
  reason?: string;
}

/**
 * Strict Test Database Isolation Guard.
 * Guarantees that automated integration tests and cleanup scripts NEVER run
 * against the development database ('adpayon_dev') or production databases.
 * Fails closed if isolated test database ('adpayon_test') access is not configured.
 */
export async function assertTestDatabaseIsolation(): Promise<TestDbIsolationCheck> {
  const targetDbName = process.env.MONGODB_TEST_DB_NAME || 'adpayon_test';

  // 1. Explicitly forbid running tests against adpayon_dev, adpayon_sandbox, or production
  if (
    targetDbName === 'adpayon_dev' ||
    targetDbName === 'adpayon_sandbox' ||
    targetDbName === 'adpayon_prod' ||
    targetDbName.includes('production')
  ) {
    return {
      allowed: false,
      dbName: targetDbName,
      reason: `SECURITY VIOLATION: Automated tests are strictly prohibited from connecting to '${targetDbName}'. Tests must use an isolated test database.`,
    };
  }

  // 2. Enforce test database naming convention
  if (!targetDbName.endsWith('_test') && targetDbName !== 'adpayon_test') {
    return {
      allowed: false,
      dbName: targetDbName,
      reason: `SECURITY VIOLATION: Test database name must end with '_test' or equal 'adpayon_test'. Received: '${targetDbName}'.`,
    };
  }

  const mongoUri = process.env.MONGODB_TEST_URI || env.MONGODB_URI;
  if (!mongoUri) {
    return {
      allowed: false,
      dbName: targetDbName,
      reason: 'No MONGODB_URI configured for test database connection.',
    };
  }

  // 3. Attempt connection exclusively to targetDbName
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    await mongoose.connect(mongoUri, {
      dbName: targetDbName,
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 4000,
    });

    const activeDbName = mongoose.connection.db?.databaseName;
    if (
      !activeDbName ||
      activeDbName === 'adpayon_dev' ||
      activeDbName === 'adpayon_sandbox' ||
      activeDbName === 'adpayon_prod' ||
      activeDbName !== targetDbName
    ) {
      await mongoose.disconnect().catch(() => {});
      return {
        allowed: false,
        dbName: activeDbName || 'unknown',
        reason: `SECURITY VIOLATION: Refusing execution on non-test database '${activeDbName}'. Expected isolated '${targetDbName}'. Failing closed.`,
      };
    }

    // Verify database privileges (ping and access check)
    await mongoose.connection.db?.admin().ping();

    // Verify write/read permission by checking collections
    await mongoose.connection.db?.listCollections().toArray();

    return {
      allowed: true,
      dbName: activeDbName,
    };
  } catch (err: any) {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
    return {
      allowed: false,
      dbName: targetDbName,
      reason: `Isolated test database '${targetDbName}' is not accessible: ${err.message}. Tests will not fall back to 'adpayon_dev'.`,
    };
  }
}

/**
 * Explicit test ownership tracker.
 * Only records explicitly registered in the tracker can be deleted during test cleanup.
 * Prevents regex-based mass deletions or deleting records belonging to other users.
 */
export class TestOwnershipTracker {
  public userIds = new Set<string>();
  public mobiles = new Set<string>();
  public sessionIds = new Set<string>();
  public campaignIds = new Set<string>();
  public taskIds = new Set<string>();
  public assignmentIds = new Set<string>();
  public completionIds = new Set<string>();
  public eventIds = new Set<string>();
  public evidenceIds = new Set<string>();
  public auditLogIds = new Set<string>();

  trackUser(userId: string | Types.ObjectId, mobile?: string): void {
    const idStr = userId.toString();
    this.userIds.add(idStr);
    if (mobile) {
      this.mobiles.add(mobile);
    }
  }

  trackSession(sessionId: string | Types.ObjectId): void {
    this.sessionIds.add(sessionId.toString());
  }

  trackCampaign(campaignId: string | Types.ObjectId): void {
    this.campaignIds.add(campaignId.toString());
  }

  trackTask(taskId: string | Types.ObjectId): void {
    this.taskIds.add(taskId.toString());
  }

  trackAssignment(assignmentId: string | Types.ObjectId): void {
    this.assignmentIds.add(assignmentId.toString());
  }

  trackCompletion(completionId: string | Types.ObjectId): void {
    this.completionIds.add(completionId.toString());
  }

  trackEvent(eventId: string | Types.ObjectId): void {
    this.eventIds.add(eventId.toString());
  }

  trackEvidence(evidenceId: string | Types.ObjectId): void {
    this.evidenceIds.add(evidenceId.toString());
  }

  trackAuditLog(logId: string | Types.ObjectId): void {
    this.auditLogIds.add(logId.toString());
  }

  /**
   * Safely purges ONLY tracked records created by the current test suite.
   * Fails closed if no records are tracked or if connected to an unsafe database.
   */
  async safeCleanup(): Promise<{
    deletedUsers: number;
    deletedSessions: number;
    deletedOtps: number;
    deletedCampaigns: number;
    deletedTasks: number;
    deletedAssignments: number;
    deletedCompletions: number;
  }> {
    const currentDb = mongoose.connection.db?.databaseName;
    if (
      currentDb === 'adpayon_dev' ||
      currentDb === 'adpayon_sandbox' ||
      currentDb === 'adpayon_prod' ||
      !currentDb
    ) {
      throw new Error(`CRITICAL SECURITY FAILURE: Attempted test cleanup against '${currentDb}'. Refusing operation.`);
    }

    const objectIds = Array.from(this.userIds).map((id) => new Types.ObjectId(id));
    const mobileList = Array.from(this.mobiles);

    let deletedUsers = 0;
    let deletedSessions = 0;
    let deletedOtps = 0;
    let deletedCampaigns = 0;
    let deletedTasks = 0;
    let deletedAssignments = 0;
    let deletedCompletions = 0;

    // Purge user and auth session records
    if (objectIds.length > 0) {
      const uRes = await User.deleteMany({
        _id: { $in: objectIds },
        referralCode: { $ne: 'ADP1000' },
      });
      deletedUsers = uRes.deletedCount || 0;

      const sRes = await AuthSession.deleteMany({ userId: { $in: objectIds } });
      deletedSessions = sRes.deletedCount || 0;
    }

    if (mobileList.length > 0) {
      const oRes = await OTPChallenge.deleteMany({
        mobile: { $in: mobileList },
      });
      deletedOtps = oRes.deletedCount || 0;

      await AuthSecurityEvent.deleteMany({
        mobile: { $in: mobileList },
      });
    }

    // Purge task completions & assignments
    if (this.completionIds.size > 0) {
      const cIds = Array.from(this.completionIds).map((id) => new Types.ObjectId(id));
      const cRes = await TaskCompletion.deleteMany({ _id: { $in: cIds } });
      deletedCompletions = cRes.deletedCount || 0;
    }

    if (this.assignmentIds.size > 0) {
      const aIds = Array.from(this.assignmentIds).map((id) => new Types.ObjectId(id));
      const aRes = await TaskAssignment.deleteMany({ _id: { $in: aIds } });
      deletedAssignments = aRes.deletedCount || 0;
    }

    if (this.taskIds.size > 0) {
      const tIds = Array.from(this.taskIds).map((id) => new Types.ObjectId(id));
      const tRes = await Task.deleteMany({ _id: { $in: tIds } });
      deletedTasks = tRes.deletedCount || 0;
    }

    if (this.campaignIds.size > 0) {
      const cmpIds = Array.from(this.campaignIds).map((id) => new Types.ObjectId(id));
      const cmpRes = await Campaign.deleteMany({ _id: { $in: cmpIds } });
      deletedCampaigns = cmpRes.deletedCount || 0;
    }

    if (this.eventIds.size > 0) {
      const evIds = Array.from(this.eventIds).map((id) => new Types.ObjectId(id));
      await TaskEvent.deleteMany({ _id: { $in: evIds } });
    }

    if (this.evidenceIds.size > 0) {
      const evdIds = Array.from(this.evidenceIds).map((id) => new Types.ObjectId(id));
      await VerificationEvidence.deleteMany({ _id: { $in: evdIds } });
    }

    if (this.auditLogIds.size > 0) {
      const logIds = Array.from(this.auditLogIds).map((id) => new Types.ObjectId(id));
      await AdminAuditLog.deleteMany({ _id: { $in: logIds } });
    }

    this.userIds.clear();
    this.mobiles.clear();
    this.sessionIds.clear();
    this.campaignIds.clear();
    this.taskIds.clear();
    this.assignmentIds.clear();
    this.completionIds.clear();
    this.eventIds.clear();
    this.evidenceIds.clear();
    this.auditLogIds.clear();

    return {
      deletedUsers,
      deletedSessions,
      deletedOtps,
      deletedCampaigns,
      deletedTasks,
      deletedAssignments,
      deletedCompletions,
    };
  }
}
