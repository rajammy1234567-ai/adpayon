import { Request, Response } from 'express';
import crypto from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import {
  Campaign,
  Task,
  TaskAssignment,
  TaskCompletion,
  TaskEvent,
  VerificationEvidence,
} from '../models';
import {
  appInstallConversionPostbackSchema,
  validatePostbackTimestamp,
  validatePackageNameMatch,
  validateConversionEventMatch,
  AppInstallConversionPostbackPayload,
} from '@adpayon/shared';
import { taskVerificationMutex } from '../utils/keyedMutex';
import { TaskVerificationError } from './userTask.controller';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Validates HMAC-SHA256 signature using timingSafeEqual.
 */
function verifyHmacSignature(rawBody: Buffer, secret: string, signatureHeader?: string): boolean {
  if (!signatureHeader) return false;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(signatureHeader, 'utf-8');
  const expBuf = Buffer.from(expectedSignature, 'utf-8');

  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * POST /api/webhooks/campaigns/:campaignId/install-conversion
 * Dedicated server-to-server app acquisition conversion webhook endpoint.
 * Requires HMAC-SHA256 signature over exact raw body and valid Phase 10.5B payload.
 */
export async function handleAppInstallConversion(req: RawBodyRequest, res: Response): Promise<void> {
  const { campaignId } = req.params;

  if (!Types.ObjectId.isValid(campaignId)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_CAMPAIGN_ID', message: 'Invalid campaign ID format' },
    });
    return;
  }

  // 1. Fetch campaign including webhook secret
  const campaign = await Campaign.findById(campaignId).select('+webhookSecret');
  if (!campaign) {
    res.status(404).json({
      success: false,
      error: { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found' },
    });
    return;
  }

  if (campaign.status !== 'ACTIVE') {
    res.status(400).json({
      success: false,
      error: { code: 'CAMPAIGN_INACTIVE', message: 'Campaign is not currently active' },
    });
    return;
  }

  // 2. Validate HMAC-SHA256 signature
  const signatureHeader =
    (req.headers['x-adpayon-signature'] as string) ||
    (req.headers['X-AdPayOn-Signature'] as string) ||
    (req.headers['x-partner-signature'] as string);

  if (!signatureHeader) {
    res.status(401).json({
      success: false,
      error: { code: 'MISSING_SIGNATURE', message: 'Missing x-adpayon-signature header' },
    });
    return;
  }

  const rawBodyBuffer = req.rawBody || Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  if (!verifyHmacSignature(rawBodyBuffer, campaign.webhookSecret, signatureHeader)) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_SIGNATURE', message: 'Cryptographic signature mismatch' },
    });
    return;
  }

  // 3. Strict Phase 10.5B payload schema validation
  const parsed = appInstallConversionPostbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Conversion payload failed validation',
        fieldErrors: parsed.error.format(),
      },
    });
    return;
  }

  const payload = parsed.data;

  // 4. Timestamp clock skew check (allowable 5 minutes skew)
  const skewCheck = validatePostbackTimestamp(payload.timestamp, 5 * 60 * 1000);
  if (!skewCheck.valid) {
    res.status(400).json({
      success: false,
      error: {
        code: 'TIMESTAMP_EXPIRED',
        message: skewCheck.error || 'Postback timestamp is expired or outside allowable skew',
      },
    });
    return;
  }

  // 5. Execute atomic conversion engine
  await processAppInstallConversion({
    req,
    res,
    campaign,
    payload,
    signatureHeader,
  });
}

/**
 * Shared atomic execution engine for APP_INSTALL postbacks.
 */
async function processAppInstallConversion({
  req,
  res,
  campaign,
  payload,
  signatureHeader,
}: {
  req: Request;
  res: Response;
  campaign: any;
  payload: AppInstallConversionPostbackPayload;
  signatureHeader: string;
}): Promise<void> {
  // 1. Match clickId to TaskAssignment
  const assignment = await TaskAssignment.findOne({ clickId: payload.clickId });
  if (!assignment) {
    res.status(404).json({
      success: false,
      error: { code: 'ASSIGNMENT_NOT_FOUND', message: 'No assignment matches the supplied clickId' },
    });
    return;
  }

  // 2. Strict campaign ownership check (cross-campaign clickId protection)
  if (assignment.campaignId.toString() !== campaign._id.toString()) {
    res.status(403).json({
      success: false,
      error: { code: 'CAMPAIGN_MISMATCH', message: 'Assignment belongs to a different campaign' },
    });
    return;
  }

  // 3. Assignment expiration check
  if (assignment.status === 'EXPIRED' || assignment.expiresAt <= new Date()) {
    res.status(400).json({
      success: false,
      error: { code: 'ASSIGNMENT_EXPIRED', message: 'Task assignment has expired' },
    });
    return;
  }

  if (assignment.status === 'CANCELLED') {
    res.status(400).json({
      success: false,
      error: { code: 'ASSIGNMENT_CANCELLED', message: 'Task assignment is cancelled' },
    });
    return;
  }

  // 4. Task lookup & validation
  const task = await Task.findById(assignment.taskId);
  if (!task) {
    res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'Underlying task not found' },
    });
    return;
  }

  if (task.category !== 'APP_INSTALL') {
    res.status(400).json({
      success: false,
      error: {
        code: 'UNSUPPORTED_TASK_CATEGORY',
        message: `Task category "${task.category}" is not APP_INSTALL`,
      },
    });
    return;
  }

  if (
    task.verificationMethod !== 'AUTHENTICATED_WEBHOOK' ||
    task.appInstallConfig?.attributionMethod !== 'SIGNED_POSTBACK'
  ) {
    res.status(400).json({
      success: false,
      error: {
        code: 'UNSUPPORTED_ATTRIBUTION_METHOD',
        message: 'Task does not support automated signed postback verification',
      },
    });
    return;
  }

  if (task.status !== 'PUBLISHED') {
    res.status(400).json({
      success: false,
      error: { code: 'TASK_NOT_PUBLISHED', message: 'Task is not currently published' },
    });
    return;
  }

  // 5. Package identity & conversion event matching
  const packageCheck = validatePackageNameMatch(task.appInstallConfig.packageName, payload.packageName);
  if (!packageCheck.valid) {
    res.status(400).json({
      success: false,
      error: { code: 'PACKAGE_MISMATCH', message: packageCheck.error },
    });
    return;
  }

  const eventCheck = validateConversionEventMatch(task.appInstallConfig.conversionEvent, payload.event);
  if (!eventCheck.valid) {
    res.status(400).json({
      success: false,
      error: { code: 'EVENT_MISMATCH', message: eventCheck.error },
    });
    return;
  }

  // 6. Attribution window check
  const attributionWindowHours = (task.appInstallConfig as any).attributionWindowHours || 72;
  const maxWindowMs = attributionWindowHours * 60 * 60 * 1000;
  const assignedTimeMs = assignment.assignedAt ? assignment.assignedAt.getTime() : assignment.createdAt.getTime();
  const postbackTimeMs =
    typeof payload.timestamp === 'number'
      ? (payload.timestamp < 10000000000 ? payload.timestamp * 1000 : payload.timestamp)
      : new Date(payload.timestamp).getTime();

  if (postbackTimeMs - assignedTimeMs > maxWindowMs) {
    res.status(400).json({
      success: false,
      error: {
        code: 'ATTRIBUTION_WINDOW_EXPIRED',
        message: 'Conversion occurred outside allowable attribution window',
      },
    });
    return;
  }

  // 7. Anti-replay & Duplicate Reconciliation
  const existingEvidence = await VerificationEvidence.findOne({
    externalTransactionId: payload.externalTransactionId,
  });

  if (existingEvidence) {
    if (existingEvidence.assignmentId.toString() === assignment._id.toString()) {
      // Idempotent retry of the exact same assignment
      const existingCompletion = await TaskCompletion.findOne({ clickId: assignment.clickId });
      res.status(200).json({
        success: true,
        message: 'Postback already processed for this assignment',
        data: {
          completionId: existingCompletion ? existingCompletion._id.toString() : existingEvidence._id.toString(),
          rewardPoints: existingCompletion ? existingCompletion.rewardPoints : task.rewardPoints,
          idempotent: true,
        },
      });
      return;
    } else {
      // Replay attempt using someone else's externalTransactionId
      res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_TRANSACTION',
          message: 'This external transaction ID has already been recorded for a different assignment',
        },
      });
      return;
    }
  }

  // Idempotency: Assignment already completed
  if (assignment.status === 'COMPLETED') {
    const existingCompletion = await TaskCompletion.findOne({ clickId: assignment.clickId });
    res.status(200).json({
      success: true,
      message: 'Postback already processed for this assignment',
      data: {
        completionId: existingCompletion?._id.toString(),
        rewardPoints: existingCompletion?.rewardPoints ?? task.rewardPoints,
        idempotent: true,
      },
    });
    return;
  }

  // 8. Cap Check
  if (task.completionsCount >= task.totalCap) {
    res.status(400).json({
      success: false,
      error: { code: 'CAP_EXHAUSTED', message: 'Task global completion cap has been reached' },
    });
    return;
  }

  // 9. Mutex + Atomic MongoDB Transaction Execution
  try {
    await taskVerificationMutex.run(task._id.toString(), async () => {
      const dbSession = await mongoose.startSession();
      try {
        let completionResult: any = null;

        await dbSession.withTransaction(async () => {
          // Step 1: Claim assignment atomically
          const updatedAssignment = await TaskAssignment.findOneAndUpdate(
            {
              _id: assignment._id,
              status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
            },
            {
              $set: {
                status: 'COMPLETED',
                completedAt: new Date(),
              },
            },
            { session: dbSession, returnDocument: 'after' }
          );

          if (!updatedAssignment) {
            throw new TaskVerificationError(
              409,
              'ASSIGNMENT_ALREADY_COMPLETED',
              'Assignment already completed or inactive'
            );
          }

          // Step 2: Atomically reserve global cap
          const updatedTask = await Task.findOneAndUpdate(
            {
              _id: task._id,
              status: 'PUBLISHED',
              $expr: { $lt: ['$completionsCount', '$totalCap'] },
            },
            { $inc: { completionsCount: 1 } },
            { session: dbSession, returnDocument: 'after' }
          );

          if (!updatedTask) {
            throw new TaskVerificationError(
              400,
              'CAP_EXHAUSTED',
              'Task global completion cap has been reached'
            );
          }

          // Step 3: Insert VerificationEvidence
          const evidenceDocs = await VerificationEvidence.create(
            [
              {
                assignmentId: updatedAssignment._id,
                taskId: task._id,
                userId: assignment.userId,
                evidenceType: 'WEBHOOK_PAYLOAD',
                signatureVerified: true,
                externalTransactionId: payload.externalTransactionId,
                rawPayload: {
                  ...payload,
                  verifiedProvider: payload.attributionProvider || 'ADVERTISER_DIRECT',
                  receivedAt: new Date().toISOString(),
                },
                headers: {
                  'x-adpayon-signature': signatureHeader,
                  'content-type': (req.headers['content-type'] as string) || 'application/json',
                },
                ipAddress: req.ip || '127.0.0.1',
                evaluatedAt: new Date(),
              },
            ],
            { session: dbSession }
          );

          // Step 4: Insert TaskCompletion (award ONLY promotional points from Task model)
          const completionDocs = await TaskCompletion.create(
            [
              {
                taskId: task._id,
                campaignId: campaign._id,
                userId: assignment.userId,
                assignmentId: updatedAssignment._id,
                clickId: updatedAssignment.clickId,
                rewardPoints: task.rewardPoints,
                status: 'VERIFIED',
                verificationMethod: 'AUTHENTICATED_WEBHOOK',
                evidenceId: evidenceDocs[0]._id,
                completedAt: new Date(),
              },
            ],
            { session: dbSession }
          );

          // Step 5: Insert TaskEvent
          await TaskEvent.create(
            [
              {
                assignmentId: updatedAssignment._id,
                taskId: task._id,
                userId: assignment.userId,
                eventType: 'VERIFY_SUCCESS',
                payload: {
                  completionId: completionDocs[0]._id.toString(),
                  externalTransactionId: payload.externalTransactionId,
                  rewardPoints: task.rewardPoints,
                  attributionProvider: payload.attributionProvider || 'ADVERTISER_DIRECT',
                  event: payload.event,
                  packageName: payload.packageName,
                },
                ipAddress: req.ip || '127.0.0.1',
              },
            ],
            { session: dbSession }
          );

          completionResult = {
            completionId: completionDocs[0]._id.toString(),
            rewardPoints: task.rewardPoints,
            completedAt: completionDocs[0].completedAt,
          };
        });

        res.status(200).json({
          success: true,
          message: 'App acquisition conversion successfully verified',
          data: completionResult,
        });
      } finally {
        await dbSession.endSession();
      }
    });
  } catch (err: any) {
    if (err instanceof TaskVerificationError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to process conversion transaction' },
    });
  }
}

/**
 * POST /api/webhooks/tasks/postback/:campaignId
 * General / Legacy partner server-to-server postback.
 * Safely preserves backward compatibility for legacy non-APP_INSTALL tasks,
 * while automatically delegating APP_INSTALL tasks to the secure conversion engine.
 */
export async function handlePartnerPostback(req: RawBodyRequest, res: Response): Promise<void> {
  const { campaignId } = req.params;

  if (!Types.ObjectId.isValid(campaignId)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_CAMPAIGN_ID', message: 'Invalid campaign ID format' },
    });
    return;
  }

  // 1. Fetch campaign including webhook secret
  const campaign = await Campaign.findById(campaignId).select('+webhookSecret');
  if (!campaign) {
    res.status(404).json({
      success: false,
      error: { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found' },
    });
    return;
  }

  if (campaign.status !== 'ACTIVE') {
    res.status(400).json({
      success: false,
      error: { code: 'CAMPAIGN_INACTIVE', message: 'Campaign is not currently active' },
    });
    return;
  }

  // 2. Validate HMAC-SHA256 signature using exact raw body
  const signatureHeader =
    (req.headers['x-adpayon-signature'] as string) ||
    (req.headers['X-AdPayOn-Signature'] as string) ||
    (req.headers['x-partner-signature'] as string);

  if (!signatureHeader) {
    res.status(401).json({
      success: false,
      error: { code: 'MISSING_SIGNATURE', message: 'Missing x-adpayon-signature header' },
    });
    return;
  }

  const rawBodyBuffer = req.rawBody || Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  if (!verifyHmacSignature(rawBodyBuffer, campaign.webhookSecret, signatureHeader)) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_SIGNATURE', message: 'Cryptographic signature mismatch' },
    });
    return;
  }

  const { clickId, externalTransactionId, timestamp } = req.body;

  if (!clickId || typeof clickId !== 'string') {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_CLICK_ID', message: 'Payload must contain a valid clickId' },
    });
    return;
  }

  // Match clickId to TaskAssignment
  const assignment = await TaskAssignment.findOne({ clickId });
  if (!assignment) {
    res.status(404).json({
      success: false,
      error: { code: 'ASSIGNMENT_NOT_FOUND', message: 'No assignment matches the supplied clickId' },
    });
    return;
  }

  const task = await Task.findById(assignment.taskId);
  if (!task) {
    res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'Underlying task not found' },
    });
    return;
  }

  // If task is APP_INSTALL, enforce strict Phase 10.5B validation and atomic conversion engine
  if (task.category === 'APP_INSTALL') {
    const parsed = appInstallConversionPostbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Conversion payload failed validation',
          fieldErrors: parsed.error.format(),
        },
      });
      return;
    }

    const skewCheck = validatePostbackTimestamp(parsed.data.timestamp, 5 * 60 * 1000);
    if (!skewCheck.valid) {
      res.status(400).json({
        success: false,
        error: {
          code: 'TIMESTAMP_EXPIRED',
          message: skewCheck.error || 'Postback timestamp is expired or outside allowable skew',
        },
      });
      return;
    }

    return processAppInstallConversion({
      req,
      res,
      campaign,
      payload: parsed.data,
      signatureHeader,
    });
  }

  // --- Legacy non-APP_INSTALL Postback Handling (Preserves existing integration behavior) ---

  // Replay prevention: Timestamp verification (within 5 minutes)
  if (timestamp) {
    const postbackTime = new Date(timestamp).getTime();
    const now = Date.now();
    const maxSkewMs = 5 * 60 * 1000;
    if (isNaN(postbackTime) || Math.abs(now - postbackTime) > maxSkewMs) {
      res.status(400).json({
        success: false,
        error: { code: 'TIMESTAMP_EXPIRED', message: 'Postback timestamp is expired or outside allowable skew' },
      });
      return;
    }
  }

  // Replay prevention: External transaction ID deduplication
  if (externalTransactionId && typeof externalTransactionId === 'string') {
    const existingEvidence = await VerificationEvidence.findOne({ externalTransactionId });
    if (existingEvidence) {
      res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_TRANSACTION',
          message: 'This external transaction ID has already been recorded',
        },
      });
      return;
    }
  }

  // Completion idempotency check
  const existingCompletion = await TaskCompletion.findOne({ clickId });
  if (existingCompletion) {
    res.status(200).json({
      success: true,
      message: 'Postback already processed for this assignment',
      data: {
        completionId: existingCompletion._id.toString(),
        idempotent: true,
      },
    });
    return;
  }

  // Record verification evidence
  const evidence = await VerificationEvidence.create({
    assignmentId: assignment._id,
    taskId: task._id,
    userId: assignment.userId,
    evidenceType: 'WEBHOOK_PAYLOAD',
    signatureVerified: true,
    externalTransactionId: externalTransactionId || undefined,
    rawPayload: req.body,
    headers: {
      'x-adpayon-signature': signatureHeader,
      'content-type': (req.headers['content-type'] as string) || 'application/json',
    },
    ipAddress: req.ip || '127.0.0.1',
    evaluatedAt: new Date(),
  });

  // Create task completion record atomically
  const completion = await TaskCompletion.create({
    taskId: task._id,
    campaignId: campaign._id,
    userId: assignment.userId,
    assignmentId: assignment._id,
    clickId: assignment.clickId,
    rewardPoints: task.rewardPoints,
    status: 'VERIFIED',
    verificationMethod: 'AUTHENTICATED_WEBHOOK',
    evidenceId: evidence._id,
    completedAt: new Date(),
  });

  // Update assignment state & task completion count
  assignment.status = 'COMPLETED';
  assignment.completedAt = new Date();
  await assignment.save();

  await Task.updateOne({ _id: task._id }, { $inc: { completionsCount: 1 } });

  // Record lifecycle event
  await TaskEvent.create({
    assignmentId: assignment._id,
    taskId: task._id,
    userId: assignment.userId,
    eventType: 'VERIFY_SUCCESS',
    payload: {
      completionId: completion._id.toString(),
      externalTransactionId,
      rewardPoints: task.rewardPoints,
    },
    ipAddress: req.ip || '127.0.0.1',
  });

  res.status(200).json({
    success: true,
    message: 'Partner task completion successfully verified',
    data: {
      completionId: completion._id.toString(),
      rewardPoints: completion.rewardPoints,
      completedAt: completion.completedAt,
    },
  });
}
