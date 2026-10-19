import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { Types } from 'mongoose';
import {
  Campaign,
  Task,
  TaskAssignment,
  TaskCompletion,
  TaskEvent,
  VerificationEvidence,
} from '../models';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * POST /api/webhooks/tasks/postback/:campaignId
 * Ingests and verifies partner server-to-server postbacks with HMAC-SHA256 signatures.
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
    (req.headers['X-AdPayOn-Signature'] as string);

  if (!signatureHeader) {
    res.status(401).json({
      success: false,
      error: { code: 'MISSING_SIGNATURE', message: 'Missing x-adpayon-signature header' },
    });
    return;
  }

  const rawBodyBuffer = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expectedSignature = crypto
    .createHmac('sha256', campaign.webhookSecret)
    .update(rawBodyBuffer)
    .digest('hex');

  const isValidSignature =
    signatureHeader.length === expectedSignature.length &&
    crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'utf-8'),
      Buffer.from(expectedSignature, 'utf-8')
    );

  if (!isValidSignature) {
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

  // 3. Replay prevention: Timestamp verification (within 5 minutes)
  if (timestamp) {
    const postbackTime = new Date(timestamp).getTime();
    const now = Date.now();
    const maxSkewMs = 5 * 60 * 1000; // 5 minutes
    if (isNaN(postbackTime) || Math.abs(now - postbackTime) > maxSkewMs) {
      res.status(400).json({
        success: false,
        error: { code: 'TIMESTAMP_EXPIRED', message: 'Postback timestamp is expired or outside allowable skew' },
      });
      return;
    }
  }

  // 4. Replay prevention: External transaction ID deduplication
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

  // 5. Match clickId to TaskAssignment
  const assignment = await TaskAssignment.findOne({ clickId });
  if (!assignment) {
    res.status(404).json({
      success: false,
      error: { code: 'ASSIGNMENT_NOT_FOUND', message: 'No assignment matches the supplied clickId' },
    });
    return;
  }

  // 6. Completion idempotency check
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

  const task = await Task.findById(assignment.taskId);
  if (!task) {
    res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'Underlying task not found' },
    });
    return;
  }

  // 7. Record verification evidence
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

  // 8. Create task completion record atomically
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

  // 9. Update assignment state & task completion count
  assignment.status = 'COMPLETED';
  assignment.completedAt = new Date();
  await assignment.save();

  await Task.updateOne({ _id: task._id }, { $inc: { completionsCount: 1 } });

  // 10. Record lifecycle event
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
