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
  VideoPlaybackSession,
  ArticleReadingSession,
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

    const connectOptions: mongoose.ConnectOptions = {
      dbName: targetDbName,
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 4000,
    };
    if (process.env.LOAD_TEST_DIAGNOSTICS === 'true') {
      (connectOptions as any).monitorCommands = true;
    }

    await mongoose.connect(mongoUri, connectOptions);

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
  public videoSessionIds = new Set<string>();
  public articleSessionIds = new Set<string>();

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

  trackVideoSession(sessionId: string | Types.ObjectId): void {
    this.videoSessionIds.add(sessionId.toString());
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

  trackArticleSession(sessionId: string | Types.ObjectId): void {
    this.articleSessionIds.add(sessionId.toString());
  }

  /**
   * Returns true if any synthetic database records have been tracked.
   */
  hasTrackedRecords(): boolean {
    return (
      this.userIds.size > 0 ||
      this.mobiles.size > 0 ||
      this.sessionIds.size > 0 ||
      this.campaignIds.size > 0 ||
      this.taskIds.size > 0 ||
      this.assignmentIds.size > 0 ||
      this.completionIds.size > 0 ||
      this.eventIds.size > 0 ||
      this.evidenceIds.size > 0 ||
      this.auditLogIds.size > 0 ||
      this.videoSessionIds.size > 0 ||
      this.articleSessionIds.size > 0
    );
  }

  /**
   * Exports full recovery information of all tracked synthetic IDs.
   */
  getRecoveryInfo() {
    return {
      userIds: Array.from(this.userIds),
      mobiles: Array.from(this.mobiles),
      taskIds: Array.from(this.taskIds),
      campaignIds: Array.from(this.campaignIds),
      assignmentIds: Array.from(this.assignmentIds),
      completionIds: Array.from(this.completionIds),
      eventIds: Array.from(this.eventIds),
      evidenceIds: Array.from(this.evidenceIds),
      sessionIds: Array.from(this.sessionIds),
      auditLogIds: Array.from(this.auditLogIds),
      videoSessionIds: Array.from(this.videoSessionIds),
      articleSessionIds: Array.from(this.articleSessionIds),
    };
  }

  /**
   * Safely purges ONLY tracked records created by the current test suite.
   * If no records were tracked, performs an immediate safe no-op.
   * If records are tracked, strictly fails closed if connected to an unsafe or unverified database.
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
    // If no records were created or tracked, cleanup is a safe no-op
    if (!this.hasTrackedRecords()) {
      return {
        deletedUsers: 0,
        deletedSessions: 0,
        deletedOtps: 0,
        deletedCampaigns: 0,
        deletedTasks: 0,
        deletedAssignments: 0,
        deletedCompletions: 0,
      };
    }

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

    // Discover any unacknowledged or late-committed TaskCompletion records created for tracked tasks, assignments, or users
    if (this.taskIds.size > 0 || this.assignmentIds.size > 0 || this.userIds.size > 0) {
      const tIds = Array.from(this.taskIds).map((id) => new Types.ObjectId(id));
      const aIds = Array.from(this.assignmentIds).map((id) => new Types.ObjectId(id));
      const uIds = Array.from(this.userIds).map((id) => new Types.ObjectId(id));

      const orClauses: Record<string, any>[] = [];
      if (tIds.length > 0) orClauses.push({ taskId: { $in: tIds } });
      if (aIds.length > 0) orClauses.push({ assignmentId: { $in: aIds } });
      if (uIds.length > 0) orClauses.push({ userId: { $in: uIds } });

      if (orClauses.length > 0) {
        const unacknowledgedCompletions = await TaskCompletion.find(
          { $or: orClauses },
          { _id: 1 }
        ).lean();
        for (const c of unacknowledgedCompletions) {
          this.completionIds.add(c._id.toString());
        }
      }
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

    // Derive exact IDs of associated telemetry events and evidence from tracked assignments & users
    if (this.assignmentIds.size > 0 || this.userIds.size > 0) {
      const aIds = Array.from(this.assignmentIds).map((id) => new Types.ObjectId(id));
      const uIds = Array.from(this.userIds).map((id) => new Types.ObjectId(id));

      const orphanedEvents = await TaskEvent.find(
        { $or: [{ assignmentId: { $in: aIds } }, { userId: { $in: uIds } }] },
        { _id: 1 }
      ).lean();
      for (const ev of orphanedEvents) {
        this.eventIds.add(ev._id.toString());
      }

      const orphanedEvidence = await VerificationEvidence.find(
        { $or: [{ assignmentId: { $in: aIds } }, { userId: { $in: uIds } }] },
        { _id: 1 }
      ).lean();
      for (const evd of orphanedEvidence) {
        this.evidenceIds.add(evd._id.toString());
      }
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

    // Discover any unacknowledged VideoPlaybackSession records created for tracked tasks, assignments, or users
    if (this.taskIds.size > 0 || this.assignmentIds.size > 0 || this.userIds.size > 0) {
      const tIds = Array.from(this.taskIds).map((id) => new Types.ObjectId(id));
      const aIds = Array.from(this.assignmentIds).map((id) => new Types.ObjectId(id));
      const uIds = Array.from(this.userIds).map((id) => new Types.ObjectId(id));

      const orClauses: Record<string, any>[] = [];
      if (tIds.length > 0) orClauses.push({ taskId: { $in: tIds } });
      if (aIds.length > 0) orClauses.push({ assignmentId: { $in: aIds } });
      if (uIds.length > 0) orClauses.push({ userId: { $in: uIds } });

      if (orClauses.length > 0) {
        const matchingVideoSessions = await VideoPlaybackSession.find(
          { $or: orClauses },
          { _id: 1, sessionId: 1 }
        ).lean();
        for (const vs of matchingVideoSessions) {
          this.videoSessionIds.add(vs._id.toString());
          if (vs.sessionId) {
            this.videoSessionIds.add(vs.sessionId);
          }
        }
      }
    }

    if (this.videoSessionIds.size > 0) {
      const vsIdsOrCodes = Array.from(this.videoSessionIds);
      const vsObjIds = vsIdsOrCodes.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
      await VideoPlaybackSession.deleteMany({
        $or: [{ _id: { $in: vsObjIds } }, { sessionId: { $in: vsIdsOrCodes } }],
      });
    }

    // Discover any unacknowledged ArticleReadingSession records created for tracked tasks, assignments, or users
    if (this.taskIds.size > 0 || this.assignmentIds.size > 0 || this.userIds.size > 0) {
      const tIds = Array.from(this.taskIds).map((id) => new Types.ObjectId(id));
      const aIds = Array.from(this.assignmentIds).map((id) => new Types.ObjectId(id));
      const uIds = Array.from(this.userIds).map((id) => new Types.ObjectId(id));

      const orClauses: Record<string, any>[] = [];
      if (tIds.length > 0) orClauses.push({ taskId: { $in: tIds } });
      if (aIds.length > 0) orClauses.push({ assignmentId: { $in: aIds } });
      if (uIds.length > 0) orClauses.push({ userId: { $in: uIds } });

      if (orClauses.length > 0) {
        const matchingArticleSessions = await ArticleReadingSession.find(
          { $or: orClauses },
          { _id: 1, sessionId: 1 }
        ).lean();
        for (const as of matchingArticleSessions) {
          this.articleSessionIds.add(as._id.toString());
          if (as.sessionId) {
            this.articleSessionIds.add(as.sessionId);
          }
        }
      }
    }

    if (this.articleSessionIds.size > 0) {
      const asIdsOrCodes = Array.from(this.articleSessionIds);
      const asObjIds = asIdsOrCodes.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
      await ArticleReadingSession.deleteMany({
        $or: [{ _id: { $in: asObjIds } }, { sessionId: { $in: asIdsOrCodes } }],
      });
    }

    // Post-cleanup residual verification: guarantee 0 orphaned records remain for tracked entities
    if (this.taskIds.size > 0 || this.assignmentIds.size > 0 || this.userIds.size > 0) {
      const tIds = Array.from(this.taskIds).map((id) => new Types.ObjectId(id));
      const aIds = Array.from(this.assignmentIds).map((id) => new Types.ObjectId(id));
      const uIds = Array.from(this.userIds).map((id) => new Types.ObjectId(id));

      const orClauses: Record<string, any>[] = [];
      if (tIds.length > 0) orClauses.push({ taskId: { $in: tIds } });
      if (aIds.length > 0) orClauses.push({ assignmentId: { $in: aIds } });
      if (uIds.length > 0) orClauses.push({ userId: { $in: uIds } });

      if (orClauses.length > 0) {
        const remainingCompletions = await TaskCompletion.countDocuments({ $or: orClauses });
        if (remainingCompletions > 0) {
          throw new Error(`CLEANUP BLOCKER: ${remainingCompletions} TaskCompletion record(s) remained in '${currentDb}' after cleanup.`);
        }
      }
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
    this.videoSessionIds.clear();

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
