import { z } from 'zod';
import {
  AppInstallConversionEvent,
  AppInstallConversionPostbackPayload,
  AppInstallVerificationContext,
  TaskCategory,
  VerificationMethod,
  AppInstallConfig,
} from '../types';

/**
 * Android Application ID / Package Name Regex:
 * Must contain at least two segments (separated by a dot),
 * each starting with a letter, containing alphanumeric or underscore.
 * Pragmatic check: min 3, max 150 chars, allows dot-separated alphanumeric segments.
 */
export const ANDROID_PACKAGE_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

/**
 * Strict clickId regex: must start with 'clk_' and contain 8 to 64 alphanumeric chars.
 */
export const CLICK_ID_REGEX = /^clk_[a-zA-Z0-9_-]{4,60}$/;

/**
 * Canonical attribution providers recognized for S2S conversion reporting.
 */
export const ATTRIBUTION_PROVIDERS = [
  'ADVERTISER_DIRECT',
  'APPSFLYER',
  'ADJUST',
  'SINGULAR',
  'BRANCH',
] as const;

/**
 * Strict conversion postback schema for APP_INSTALL tasks.
 *
 * Security Invariants:
 * - Uses .strict() to reject injected fields (e.g. rewardPoints, userId, taskId).
 * - Enforces required clickId and externalTransactionId.
 * - Enforces valid canonical conversion event names.
 * - Enforces valid Android package name syntax.
 * - Accepts ISO-8601 string or numeric millisecond timestamps.
 */
export const appInstallConversionPostbackSchema = z
  .object({
    clickId: z
      .string({ required_error: 'clickId is required' })
      .trim()
      .min(8, 'clickId must contain at least 8 characters')
      .max(64, 'clickId cannot exceed 64 characters')
      .regex(CLICK_ID_REGEX, 'clickId format is invalid (expected clk_ prefix followed by alphanumeric characters)'),
    externalTransactionId: z
      .string({ required_error: 'externalTransactionId is required' })
      .trim()
      .min(3, 'externalTransactionId must contain at least 3 characters')
      .max(128, 'externalTransactionId cannot exceed 128 characters')
      .regex(/^[a-zA-Z0-9._:-]+$/, 'externalTransactionId contains invalid characters'),
    event: z.enum(['INSTALL', 'FIRST_OPEN', 'REGISTER', 'IN_APP_PURCHASE'], {
      errorMap: () => ({ message: 'Invalid conversion event name' }),
    }),
    packageName: z
      .string({ required_error: 'packageName is required' })
      .trim()
      .min(3, 'packageName must contain at least 3 characters')
      .max(150, 'packageName cannot exceed 150 characters')
      .regex(ANDROID_PACKAGE_NAME_REGEX, 'Invalid Android package name format (e.g. com.example.app)'),
    timestamp: z.union(
      [
        z
          .number({ invalid_type_error: 'Timestamp number must be positive integer milliseconds' })
          .int('Timestamp must be an integer')
          .positive('Timestamp must be positive'),
        z
          .string({ invalid_type_error: 'Timestamp string must be a valid ISO-8601 datetime' })
          .datetime({ message: 'Timestamp string must be a valid ISO-8601 datetime' }),
      ],
      { required_error: 'timestamp is required' }
    ),
    attributionProvider: z.enum(ATTRIBUTION_PROVIDERS).optional(),
  })
  .strict({
    message: 'Payload contains unexpected or unauthorized fields (identity overrides or client-controlled values are rejected)',
  });

/**
 * Validates a postback timestamp against allowable clock skew.
 *
 * @param timestamp - Numeric epoch ms or ISO string
 * @param maxSkewMs - Allowable time difference in milliseconds (default: 5 minutes)
 * @param referenceTimeMs - Reference epoch ms (default: Date.now())
 */
export function validatePostbackTimestamp(
  timestamp: number | string,
  maxSkewMs = 5 * 60 * 1000,
  referenceTimeMs = Date.now()
): { valid: boolean; epochMs?: number; error?: string } {
  let epochMs: number;

  if (typeof timestamp === 'number') {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return { valid: false, error: 'Timestamp must be a positive finite integer' };
    }
    // Basic sanity check: if timestamp is in seconds (e.g. < 10000000000), convert or reject
    if (timestamp < 10000000000) {
      epochMs = timestamp * 1000;
    } else {
      epochMs = timestamp;
    }
  } else if (typeof timestamp === 'string') {
    const parsed = new Date(timestamp).getTime();
    if (isNaN(parsed) || parsed <= 0) {
      return { valid: false, error: 'Timestamp string is not a valid date' };
    }
    epochMs = parsed;
  } else {
    return { valid: false, error: 'Timestamp must be a number or ISO string' };
  }

  const skew = Math.abs(referenceTimeMs - epochMs);
  if (skew > maxSkewMs) {
    return {
      valid: false,
      epochMs,
      error: `Postback timestamp skew (${Math.round(skew / 1000)}s) exceeds maximum allowed skew (${maxSkewMs / 1000}s)`,
    };
  }

  return { valid: true, epochMs };
}

/**
 * Validates that the postback conversion event matches the task's configured event.
 * Case-insensitive comparison.
 */
export function validateConversionEventMatch(
  configuredEvent: AppInstallConversionEvent,
  incomingEvent: string
): { valid: boolean; error?: string } {
  if (!incomingEvent || typeof incomingEvent !== 'string') {
    return { valid: false, error: 'Incoming conversion event is missing or invalid' };
  }

  const normalizedIncoming = incomingEvent.trim().toUpperCase();
  const normalizedConfigured = String(configuredEvent).trim().toUpperCase();

  if (normalizedIncoming !== normalizedConfigured) {
    return {
      valid: false,
      error: `Conversion event mismatch: expected "${normalizedConfigured}", received "${normalizedIncoming}"`,
    };
  }

  return { valid: true };
}

/**
 * Validates that the postback package name matches the task's configured package name.
 * Case-sensitive exact match.
 */
export function validatePackageNameMatch(
  configuredPackage: string,
  incomingPackage: string
): { valid: boolean; error?: string } {
  if (!incomingPackage || typeof incomingPackage !== 'string') {
    return { valid: false, error: 'Incoming package name is missing or invalid' };
  }

  const trimmedIncoming = incomingPackage.trim();
  const trimmedConfigured = configuredPackage.trim();

  if (trimmedIncoming !== trimmedConfigured) {
    return {
      valid: false,
      error: `Package name mismatch: expected "${trimmedConfigured}", received "${trimmedIncoming}"`,
    };
  }

  return { valid: true };
}

/**
 * Validates that the assignment matches the clickId and taskId, is unexpired, and is active.
 */
export function validateAssignmentClickBinding(
  assignment: {
    id: string;
    clickId: string;
    taskId: string;
    expiresAt: Date | string;
    status: string;
  },
  clickId: string,
  taskId: string,
  referenceTimeMs = Date.now()
): { valid: boolean; error?: string; errorCode?: string } {
  if (assignment.clickId !== clickId) {
    return {
      valid: false,
      errorCode: 'CLICK_ID_MISMATCH',
      error: 'TaskAssignment clickId does not match the postback clickId',
    };
  }

  if (String(assignment.taskId) !== String(taskId)) {
    return {
      valid: false,
      errorCode: 'TASK_ID_MISMATCH',
      error: 'TaskAssignment taskId does not match target task',
    };
  }

  const expiresAtMs = new Date(assignment.expiresAt).getTime();
  if (isNaN(expiresAtMs) || expiresAtMs <= referenceTimeMs) {
    return {
      valid: false,
      errorCode: 'ASSIGNMENT_EXPIRED',
      error: 'Task assignment conversion window has expired',
    };
  }

  const validStatuses = ['ASSIGNED', 'IN_PROGRESS'];
  if (!validStatuses.includes(assignment.status)) {
    return {
      valid: false,
      errorCode: 'INVALID_ASSIGNMENT_STATUS',
      error: `Task assignment status is "${assignment.status}", expected ASSIGNED or IN_PROGRESS`,
    };
  }

  return { valid: true };
}

/**
 * Validates that the task belongs to the campaign receiving the postback.
 */
export function validateCampaignOwnership(
  campaignId: string,
  taskCampaignId: string
): { valid: boolean; error?: string } {
  if (String(campaignId).trim() !== String(taskCampaignId).trim()) {
    return {
      valid: false,
      error: `Campaign mismatch: task belongs to campaign "${taskCampaignId}", but postback targeted "${campaignId}"`,
    };
  }
  return { valid: true };
}

/**
 * Validates that the task category, verification method, and appInstallConfig attribution method are valid.
 */
export function validateAttributionMethod(
  taskCategory: TaskCategory,
  verificationMethod: VerificationMethod,
  appInstallConfig?: AppInstallConfig
): { valid: boolean; error?: string } {
  if (taskCategory !== 'APP_INSTALL') {
    return {
      valid: false,
      error: `Category "${taskCategory}" is not an APP_INSTALL task`,
    };
  }

  if (verificationMethod !== 'AUTHENTICATED_WEBHOOK') {
    return {
      valid: false,
      error: `APP_INSTALL postbacks require AUTHENTICATED_WEBHOOK verification, found "${verificationMethod}"`,
    };
  }

  if (!appInstallConfig) {
    return {
      valid: false,
      error: 'Task is missing required appInstallConfig',
    };
  }

  if (appInstallConfig.attributionMethod !== 'SIGNED_POSTBACK') {
    return {
      valid: false,
      error: `Unsupported attribution method: "${appInstallConfig.attributionMethod}" (expected SIGNED_POSTBACK)`,
    };
  }

  return { valid: true };
}

/**
 * Pure master validation helper for App Acquisition postbacks.
 * Combines all invariants into a single deterministic evaluation.
 */
export function validateAppInstallPostbackContext(
  payload: AppInstallConversionPostbackPayload,
  context: AppInstallVerificationContext,
  options: { maxSkewMs?: number; referenceTimeMs?: number } = {}
): { valid: boolean; error?: string; errorCode?: string } {
  const refTime = options.referenceTimeMs || Date.now();

  // 1. Task attribution method check
  const methodCheck = validateAttributionMethod(
    context.task.category,
    context.task.verificationMethod,
    context.task.appInstallConfig
  );
  if (!methodCheck.valid) {
    return { valid: false, error: methodCheck.error, errorCode: 'UNSUPPORTED_ATTRIBUTION_METHOD' };
  }

  // 2. Campaign ownership check
  const campaignCheck = validateCampaignOwnership(context.campaign.id, context.task.campaignId);
  if (!campaignCheck.valid) {
    return { valid: false, error: campaignCheck.error, errorCode: 'CAMPAIGN_MISMATCH' };
  }

  // 3. Campaign active check
  if (context.campaign.status !== 'ACTIVE') {
    return { valid: false, error: 'Target campaign is not currently active', errorCode: 'CAMPAIGN_INACTIVE' };
  }

  // 4. Task published check
  if (context.task.status !== 'PUBLISHED') {
    return { valid: false, error: 'Target task is not currently published', errorCode: 'TASK_NOT_PUBLISHED' };
  }

  // 5. Global cap check
  if (context.task.completionsCount >= context.task.totalCap) {
    return { valid: false, error: 'Task global completion cap has been reached', errorCode: 'CAP_EXHAUSTED' };
  }

  // 6. Assignment click binding check
  const assignmentCheck = validateAssignmentClickBinding(
    context.assignment,
    payload.clickId,
    context.task.id,
    refTime
  );
  if (!assignmentCheck.valid) {
    return { valid: false, error: assignmentCheck.error, errorCode: assignmentCheck.errorCode };
  }

  // 7. Package identity check
  const packageCheck = validatePackageNameMatch(
    context.task.appInstallConfig!.packageName,
    payload.packageName
  );
  if (!packageCheck.valid) {
    return { valid: false, error: packageCheck.error, errorCode: 'PACKAGE_NAME_MISMATCH' };
  }

  // 8. Conversion event match check
  const eventCheck = validateConversionEventMatch(
    context.task.appInstallConfig!.conversionEvent,
    payload.event
  );
  if (!eventCheck.valid) {
    return { valid: false, error: eventCheck.error, errorCode: 'CONVERSION_EVENT_MISMATCH' };
  }

  // 9. Timestamp skew check
  const timeCheck = validatePostbackTimestamp(payload.timestamp, options.maxSkewMs, refTime);
  if (!timeCheck.valid) {
    return { valid: false, error: timeCheck.error, errorCode: 'TIMESTAMP_EXPIRED' };
  }

  return { valid: true };
}
