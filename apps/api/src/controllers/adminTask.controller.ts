import { Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { Types } from 'mongoose';
import {
  appInstallConfigSchema,
  videoWatchConfigSchema,
  articleReadConfigSchema,
  isSafePublicUrl,
} from '@adpayon/shared';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { Campaign, Task, TaskCompletion, AdminAuditLog } from '../models';
import { env } from '../config/env';

// Validation Schemas & Helpers

/**
 * Helper to preprocess optional string fields:
 * - Empty string or whitespace-only string -> undefined
 * - null -> undefined
 * - Non-empty string -> trimmed string
 */
const emptyToUndefined = (val: unknown) => {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return val == null ? undefined : val;
};

/**
 * Format Zod validation errors to provide both field-specific mapping
 * and a clear primary error message with the failing field name.
 */
function formatZodError(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.');
    if (field && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  const firstIssue = error.issues[0];
  const fieldName = firstIssue?.path.join('.');
  const primaryMessage = fieldName
    ? `${fieldName}: ${firstIssue.message}`
    : (firstIssue?.message || 'Validation error');

  return {
    message: primaryMessage,
    fieldErrors,
    details: error.format(),
  };
}

export function validateTaskCategoryAndConfigs(
  category: string | undefined,
  verificationMethod: string | undefined,
  configs: {
    appInstallConfig?: any;
    videoWatchConfig?: any;
    articleReadConfig?: any;
  },
  ctx: z.RefinementCtx
) {
  if (!category) return;

  if (category === 'APP_INSTALL') {
    if (!configs.appInstallConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'appInstallConfig is required for APP_INSTALL tasks',
        path: ['appInstallConfig'],
      });
    }
    if (configs.videoWatchConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'videoWatchConfig must not be provided for APP_INSTALL tasks',
        path: ['videoWatchConfig'],
      });
    }
    if (configs.articleReadConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'articleReadConfig must not be provided for APP_INSTALL tasks',
        path: ['articleReadConfig'],
      });
    }
    if (verificationMethod === 'FIRST_PARTY_ACTION' && configs.appInstallConfig?.attributionMethod !== 'IN_APP_FEEDBACK') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'APP_INSTALL tasks with signed postback or manual review cannot use FIRST_PARTY_ACTION verification. Use AUTHENTICATED_WEBHOOK, MANUAL_REVIEW, or select IN_APP_FEEDBACK.',
        path: ['verificationMethod'],
      });
    }
    if (configs.appInstallConfig && verificationMethod) {
      if (configs.appInstallConfig.attributionMethod === 'SIGNED_POSTBACK' && verificationMethod !== 'AUTHENTICATED_WEBHOOK') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'verificationMethod must be AUTHENTICATED_WEBHOOK when attributionMethod is SIGNED_POSTBACK',
          path: ['verificationMethod'],
        });
      }
      if (configs.appInstallConfig.attributionMethod === 'MANUAL_REVIEW' && verificationMethod !== 'MANUAL_REVIEW') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'verificationMethod must be MANUAL_REVIEW when attributionMethod is MANUAL_REVIEW',
          path: ['verificationMethod'],
        });
      }
      if (configs.appInstallConfig.attributionMethod === 'IN_APP_FEEDBACK' && verificationMethod !== 'FIRST_PARTY_ACTION') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'verificationMethod must be FIRST_PARTY_ACTION when attributionMethod is IN_APP_FEEDBACK',
          path: ['verificationMethod'],
        });
      }
    }
  } else if (category === 'VIDEO_WATCH') {
    if (!configs.videoWatchConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'videoWatchConfig is required for VIDEO_WATCH tasks',
        path: ['videoWatchConfig'],
      });
    }
    if (configs.appInstallConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'appInstallConfig must not be provided for VIDEO_WATCH tasks',
        path: ['appInstallConfig'],
      });
    }
    if (configs.articleReadConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'articleReadConfig must not be provided for VIDEO_WATCH tasks',
        path: ['articleReadConfig'],
      });
    }
  } else if (category === 'ARTICLE_READ') {
    if (!configs.articleReadConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'articleReadConfig is required for ARTICLE_READ tasks',
        path: ['articleReadConfig'],
      });
    }
    if (configs.appInstallConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'appInstallConfig must not be provided for ARTICLE_READ tasks',
        path: ['appInstallConfig'],
      });
    }
    if (configs.videoWatchConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'videoWatchConfig must not be provided for ARTICLE_READ tasks',
        path: ['videoWatchConfig'],
      });
    }
  } else {
    // Legacy categories: IN_APP_ACTION, PARTNER_WEBHOOK, SURVEY, MANUAL_VERIFY
    if (configs.appInstallConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'appInstallConfig must not be provided for legacy task category',
        path: ['appInstallConfig'],
      });
    }
    if (configs.videoWatchConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'videoWatchConfig must not be provided for legacy task category',
        path: ['videoWatchConfig'],
      });
    }
    if (configs.articleReadConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'articleReadConfig must not be provided for legacy task category',
        path: ['articleReadConfig'],
      });
    }
  }
}

const createCampaignSchema = z.object({
  name: z.string().trim().min(3, 'Campaign name must contain at least 3 characters').max(120, 'Campaign name cannot exceed 120 characters'),
  advertiserName: z.string().trim().min(2, 'Advertiser name must contain at least 2 characters').max(120, 'Advertiser name cannot exceed 120 characters'),
  description: z.preprocess(emptyToUndefined, z.string().max(1000, 'Description cannot exceed 1000 characters').optional()),
  advertiserBudgetPaise: z.number().int().min(0, 'Budget cannot be negative'),
  authorizedAgreementRef: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(3, 'Agreement reference must contain at least 3 characters').max(100, 'Agreement reference cannot exceed 100 characters').optional()
  ),
  isSandbox: z.boolean().optional().default(false),
  startDate: z.preprocess(emptyToUndefined, z.string().datetime('Start date must be a valid ISO datetime string').optional()),
  endDate: z.preprocess(emptyToUndefined, z.string().datetime('End date must be a valid ISO datetime string').optional()),
});

const updateCampaignSchema = z.object({
  name: z.string().trim().min(3, 'Campaign name must contain at least 3 characters').max(120, 'Campaign name cannot exceed 120 characters').optional(),
  advertiserName: z.string().trim().min(2, 'Advertiser name must contain at least 2 characters').max(120, 'Advertiser name cannot exceed 120 characters').optional(),
  description: z.preprocess(emptyToUndefined, z.string().max(1000, 'Description cannot exceed 1000 characters').optional()),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
  advertiserBudgetPaise: z.number().int().min(0, 'Budget cannot be negative').optional(),
  authorizedAgreementRef: z.preprocess(emptyToUndefined, z.string().min(3, 'Agreement reference must contain at least 3 characters').max(100, 'Agreement reference cannot exceed 100 characters').optional()),
  startDate: z.preprocess(emptyToUndefined, z.string().datetime('Start date must be a valid ISO datetime string').optional()),
  endDate: z.preprocess(emptyToUndefined, z.string().datetime('End date must be a valid ISO datetime string').optional()),
});

const createTaskSchema = z
  .object({
    campaignId: z.string().refine((id) => Types.ObjectId.isValid(id), 'Invalid campaign ID'),
    title: z.string().trim().min(3, 'Title must contain at least 3 characters').max(150, 'Title cannot exceed 150 characters'),
    description: z.preprocess(emptyToUndefined, z.string().min(3, 'Description must contain at least 3 characters').max(1000, 'Description cannot exceed 1000 characters').optional()),
    instructions: z.preprocess(emptyToUndefined, z.string().max(2000, 'Instructions cannot exceed 2000 characters').optional()),
    category: z.enum([
      'IN_APP_ACTION',
      'PARTNER_WEBHOOK',
      'SURVEY',
      'MANUAL_VERIFY',
      'APP_INSTALL',
      'VIDEO_WATCH',
      'ARTICLE_READ',
    ]),
    verificationMethod: z.enum(['FIRST_PARTY_ACTION', 'AUTHENTICATED_WEBHOOK', 'MANUAL_REVIEW']),
    rewardPoints: z.number().int().min(1, 'Reward points must be at least 1'),
    totalCap: z.number().int().min(1, 'Total cap must be at least 1'),
    dailyCapPerUser: z.number().int().min(1, 'Daily cap per user must be at least 1').default(1),
    dwellTimeSeconds: z.number().int().min(0, 'Dwell time cannot be negative').default(0),
    targeting: z
      .object({
        minAncestryDepth: z.number().int().min(0).optional(),
        kycRequired: z.boolean().optional(),
        allowedStates: z.array(z.string()).optional(),
      })
      .optional(),
    externalActionUrl: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .max(500, 'URL cannot exceed 500 characters')
        .refine(
          (val) => {
            if (!val) return true;
            const sanitized = val.replace(/\{click_id\}/gi, 'token123').replace(/\{user_id\}/gi, 'usr123');
            return isSafePublicUrl(sanitized).valid;
          },
          { message: 'Partner URL must be a valid, public HTTP/HTTPS URL' }
        )
        .optional()
    ),
    appInstallConfig: appInstallConfigSchema.optional(),
    videoWatchConfig: videoWatchConfigSchema.optional(),
    articleReadConfig: articleReadConfigSchema.optional(),
    expiresAt: z.preprocess(emptyToUndefined, z.string().datetime().optional()),
  })
  .superRefine((data, ctx) => {
    validateTaskCategoryAndConfigs(data.category, data.verificationMethod, data, ctx);
  });

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(3, 'Title must contain at least 3 characters').max(150, 'Title cannot exceed 150 characters').optional(),
    description: z.preprocess(emptyToUndefined, z.string().min(3, 'Description must contain at least 3 characters').max(1000, 'Description cannot exceed 1000 characters').optional()),
    instructions: z.preprocess(emptyToUndefined, z.string().max(2000, 'Instructions cannot exceed 2000 characters').optional()),
    category: z
      .enum([
        'IN_APP_ACTION',
        'PARTNER_WEBHOOK',
        'SURVEY',
        'MANUAL_VERIFY',
        'APP_INSTALL',
        'VIDEO_WATCH',
        'ARTICLE_READ',
      ])
      .optional(),
    verificationMethod: z.enum(['FIRST_PARTY_ACTION', 'AUTHENTICATED_WEBHOOK', 'MANUAL_REVIEW']).optional(),
    rewardPoints: z.number().int().min(1, 'Reward points must be at least 1').optional(),
    totalCap: z.number().int().min(1, 'Total cap must be at least 1').optional(),
    dailyCapPerUser: z.number().int().min(1, 'Daily cap per user must be at least 1').optional(),
    dwellTimeSeconds: z.number().int().min(0, 'Dwell time cannot be negative').optional(),
    targeting: z
      .object({
        minAncestryDepth: z.number().int().min(0).optional(),
        kycRequired: z.boolean().optional(),
        allowedStates: z.array(z.string()).optional(),
      })
      .optional(),
    externalActionUrl: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .max(500, 'URL cannot exceed 500 characters')
        .refine(
          (val) => {
            if (!val) return true;
            const sanitized = val.replace(/\{click_id\}/gi, 'token123').replace(/\{user_id\}/gi, 'usr123');
            return isSafePublicUrl(sanitized).valid;
          },
          { message: 'Partner URL must be a valid, public HTTP/HTTPS URL' }
        )
        .optional()
    ),
    appInstallConfig: appInstallConfigSchema.optional(),
    videoWatchConfig: videoWatchConfigSchema.optional(),
    articleReadConfig: articleReadConfigSchema.optional(),
    expiresAt: z.preprocess(emptyToUndefined, z.string().datetime().optional()),
  })
  .superRefine((data, ctx) => {
    if (data.category) {
      validateTaskCategoryAndConfigs(data.category, data.verificationMethod, data, ctx);
    }
  });

const reviewCompletionSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  adminReviewNotes: z.preprocess(emptyToUndefined, z.string().max(1000).optional()),
  rejectionReason: z.preprocess(emptyToUndefined, z.string().max(500).optional()),
});

/**
 * POST /api/admin/campaigns
 * Creates a campaign envelope in DRAFT state.
 */
export async function createCampaign(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    const formatted = formatZodError(parsed.error);
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: formatted.message,
        fieldErrors: formatted.fieldErrors,
        details: formatted.details,
      },
    });
    return;
  }

  const { name, advertiserName, description, advertiserBudgetPaise, authorizedAgreementRef, isSandbox, startDate, endDate } =
    parsed.data;

  const isSandboxEnv = env.NODE_ENV === 'sandbox' && env.MONGODB_DB_NAME === 'adpayon_sandbox';

  if (isSandbox) {
    if (!isSandboxEnv) {
      res.status(403).json({
        success: false,
        error: {
          code: 'SANDBOX_CAMPAIGNS_FORBIDDEN',
          message: 'Sandbox QA campaigns can only be created within the adpayon_sandbox environment',
        },
      });
      return;
    }
    if (advertiserBudgetPaise !== 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'SANDBOX_BUDGET_MUST_BE_ZERO',
          message: 'Sandbox QA campaigns must have an advertiser budget of exactly 0 paise (₹0)',
          fieldErrors: { advertiserBudgetPaise: 'Sandbox campaign budget must be 0' },
        },
      });
      return;
    }
  } else {
    // For non-sandbox campaigns, authorizedAgreementRef is required
    if (!authorizedAgreementRef || authorizedAgreementRef.trim() === '') {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'authorizedAgreementRef: Authorized agreement reference is required for commercial campaigns',
          fieldErrors: { authorizedAgreementRef: 'Authorized agreement reference is required' },
        },
      });
      return;
    }
  }

  // Generate high-entropy secret for HMAC-SHA256 signature verification
  const webhookSecret = crypto.randomBytes(32).toString('hex');

  const resolvedAgreementRef = isSandbox
    ? (authorizedAgreementRef || 'SANDBOX_INTERNAL_QA')
    : authorizedAgreementRef!;

  const campaign = await Campaign.create({
    name,
    advertiserName,
    description,
    status: 'DRAFT', // Always created in DRAFT per financial safety rules
    isSandbox: !!isSandbox,
    advertiserBudgetPaise: isSandbox ? 0 : advertiserBudgetPaise,
    spentBudgetPaise: 0,
    authorizedAgreementRef: resolvedAgreementRef,
    webhookSecret,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    createdBy: req.user!._id,
  });

  await AdminAuditLog.create({
    adminId: req.user!._id,
    action: 'CREATE_CAMPAIGN',
    targetEntity: 'Campaign',
    targetId: campaign._id.toString(),
    details: {
      name,
      advertiserName,
      advertiserBudgetPaise: campaign.advertiserBudgetPaise,
      authorizedAgreementRef: resolvedAgreementRef,
      isSandbox: campaign.isSandbox,
    },
    ipAddress: req.ip || '127.0.0.1',
  });

  res.status(201).json({
    success: true,
    data: {
      campaign: {
        id: campaign._id.toString(),
        name: campaign.name,
        advertiserName: campaign.advertiserName,
        status: campaign.status,
        isSandbox: campaign.isSandbox,
        advertiserBudgetPaise: campaign.advertiserBudgetPaise,
        spentBudgetPaise: campaign.spentBudgetPaise,
        authorizedAgreementRef: campaign.authorizedAgreementRef,
        webhookSecret: campaign.webhookSecret, // Returned once upon creation for partner setup
        createdAt: campaign.createdAt,
      },
    },
  });
}

/**
 * GET /api/admin/campaigns
 * Paginated list of campaigns.
 */
export async function listCampaigns(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
  const skip = (page - 1) * limit;

  const [campaigns, total] = await Promise.all([
    Campaign.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Campaign.countDocuments(),
  ]);

  res.status(200).json({
    success: true,
    data: {
      campaigns: campaigns.map((c) => ({
        id: c._id.toString(),
        name: c.name,
        advertiserName: c.advertiserName,
        description: c.description,
        status: c.status,
        isSandbox: !!c.isSandbox,
        advertiserBudgetPaise: c.advertiserBudgetPaise,
        spentBudgetPaise: c.spentBudgetPaise,
        authorizedAgreementRef: c.authorizedAgreementRef,
        createdAt: c.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
}

/**
 * PATCH /api/admin/campaigns/:id
 * Updates campaign properties and handles safe state transitions.
 */
export async function updateCampaign(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid campaign ID format' },
    });
    return;
  }

  const parsed = updateCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    const formatted = formatZodError(parsed.error);
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: formatted.message,
        fieldErrors: formatted.fieldErrors,
        details: formatted.details,
      },
    });
    return;
  }

  const campaign = await Campaign.findById(id);
  if (!campaign) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Campaign not found' },
    });
    return;
  }

  const isSandboxEnv = env.NODE_ENV === 'sandbox' && env.MONGODB_DB_NAME === 'adpayon_sandbox';

  // If campaign is a sandbox campaign:
  if (campaign.isSandbox) {
    if (!isSandboxEnv) {
      res.status(403).json({
        success: false,
        error: {
          code: 'SANDBOX_CAMPAIGNS_FORBIDDEN',
          message: 'Sandbox campaigns can only be managed within the adpayon_sandbox environment',
        },
      });
      return;
    }
    if (parsed.data.advertiserBudgetPaise != null && parsed.data.advertiserBudgetPaise !== 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'SANDBOX_BUDGET_MUST_BE_ZERO',
          message: 'Sandbox QA campaigns must have an advertiser budget of exactly 0 paise (₹0)',
          fieldErrors: { advertiserBudgetPaise: 'Sandbox campaign budget must be 0' },
        },
      });
      return;
    }
  }

  // If transitioning to ACTIVE, enforce environment and financial authorization requirements
  if (parsed.data.status === 'ACTIVE') {
    if (campaign.isSandbox) {
      if (!isSandboxEnv) {
        res.status(403).json({
          success: false,
          error: {
            code: 'SANDBOX_CAMPAIGNS_FORBIDDEN',
            message: 'Sandbox campaigns can only be activated within the adpayon_sandbox environment',
          },
        });
        return;
      }
      // Sandbox campaigns require ₹0 budget; no real advertiser contract required
    } else {
      const agreementRef = parsed.data.authorizedAgreementRef || campaign.authorizedAgreementRef;
      const budget = parsed.data.advertiserBudgetPaise ?? campaign.advertiserBudgetPaise;
      if (!agreementRef || agreementRef.trim() === '') {
        res.status(400).json({
          success: false,
          error: {
            code: 'AGREEMENT_REQUIRED',
            message: 'Cannot activate campaign without authorized agreement reference',
          },
        });
        return;
      }
      if (budget <= 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BUDGET_REQUIRED',
            message: 'Cannot activate campaign without verified non-zero budget',
          },
        });
        return;
      }
    }
  }

  Object.assign(campaign, parsed.data);
  await campaign.save();

  await AdminAuditLog.create({
    adminId: req.user!._id,
    action: 'UPDATE_CAMPAIGN',
    targetEntity: 'Campaign',
    targetId: campaign._id.toString(),
    details: parsed.data,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.status(200).json({
    success: true,
    data: {
      campaign: {
        id: campaign._id.toString(),
        name: campaign.name,
        advertiserName: campaign.advertiserName,
        status: campaign.status,
        isSandbox: campaign.isSandbox,
        advertiserBudgetPaise: campaign.advertiserBudgetPaise,
        spentBudgetPaise: campaign.spentBudgetPaise,
        authorizedAgreementRef: campaign.authorizedAgreementRef,
        updatedAt: campaign.updatedAt,
      },
    },
  });
}

/**
 * POST /api/admin/tasks
 * Creates a targetable task under an existing campaign in DRAFT state.
 */
export async function createTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    const formatted = formatZodError(parsed.error);
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: formatted.message,
        fieldErrors: formatted.fieldErrors,
        details: formatted.details,
      },
    });
    return;
  }

  const campaign = await Campaign.findById(parsed.data.campaignId);
  if (!campaign) {
    res.status(404).json({
      success: false,
      error: { code: 'CAMPAIGN_NOT_FOUND', message: 'Referenced campaign does not exist' },
    });
    return;
  }

  if (campaign.isSandbox) {
    const isSandboxEnv = env.NODE_ENV === 'sandbox' && env.MONGODB_DB_NAME === 'adpayon_sandbox';
    if (!isSandboxEnv) {
      res.status(403).json({
        success: false,
        error: {
          code: 'SANDBOX_CAMPAIGNS_FORBIDDEN',
          message: 'Sandbox tasks can only be created within the adpayon_sandbox environment',
        },
      });
      return;
    }
    if (parsed.data.externalActionUrl && parsed.data.externalActionUrl.trim() !== '') {
      res.status(400).json({
        success: false,
        error: {
          code: 'SANDBOX_NO_EXTERNAL_WEBHOOKS',
          message: 'External advertiser action or webhook URLs are prohibited on sandbox QA tasks',
          fieldErrors: { externalActionUrl: 'External webhook URLs are not allowed for sandbox tasks' },
        },
      });
      return;
    }
    if (parsed.data.category === 'PARTNER_WEBHOOK' || parsed.data.verificationMethod === 'AUTHENTICATED_WEBHOOK') {
      res.status(400).json({
        success: false,
        error: {
          code: 'SANDBOX_NO_EXTERNAL_WEBHOOKS',
          message: 'Partner webhook verification is prohibited for sandbox tasks. Use FIRST_PARTY_ACTION or MANUAL_REVIEW.',
          fieldErrors: { category: 'Partner webhook tasks are not allowed in sandbox' },
        },
      });
      return;
    }
  }

  // Resolve description: explicit description -> earner instructions -> task title
  const resolvedDescription =
    parsed.data.description ||
    parsed.data.instructions ||
    parsed.data.title;

  const task = await Task.create({
    ...parsed.data,
    description: resolvedDescription,
    campaignId: campaign._id,
    status: 'DRAFT', // Always created in DRAFT
    completionsCount: 0,
    createdBy: req.user!._id,
  });

  await AdminAuditLog.create({
    adminId: req.user!._id,
    action: 'CREATE_TASK',
    targetEntity: 'Task',
    targetId: task._id.toString(),
    details: { title: task.title, campaignId: campaign._id.toString(), rewardPoints: task.rewardPoints },
    ipAddress: req.ip || '127.0.0.1',
  });

  res.status(201).json({
    success: true,
    data: {
      task: {
        id: task._id.toString(),
        campaignId: task.campaignId.toString(),
        title: task.title,
        description: task.description,
        instructions: task.instructions,
        externalActionUrl: task.externalActionUrl,
        category: task.category,
        verificationMethod: task.verificationMethod,
        rewardPoints: task.rewardPoints,
        status: task.status,
        totalCap: task.totalCap,
        completionsCount: task.completionsCount,
        dailyCapPerUser: task.dailyCapPerUser,
        targeting: task.targeting,
        dwellTimeSeconds: task.dwellTimeSeconds,
        appInstallConfig: task.appInstallConfig,
        videoWatchConfig: task.videoWatchConfig,
        articleReadConfig: task.articleReadConfig,
        expiresAt: task.expiresAt,
        createdAt: task.createdAt,
      },
    },
  });
}

/**
 * GET /api/admin/tasks
 * Paginated task list with optional status/campaign filter.
 */
export async function listTasks(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (req.query.campaignId && Types.ObjectId.isValid(req.query.campaignId as string)) {
    filter.campaignId = new Types.ObjectId(req.query.campaignId as string);
  }
  if (req.query.status) {
    filter.status = req.query.status;
  }
  if (req.query.category) {
    filter.category = req.query.category;
  }

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate('campaignId', 'name advertiserName status isSandbox')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Task.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      tasks: tasks.map((t) => {
        const camp = t.campaignId as any;
        const isCampObj = camp && typeof camp === 'object';
        const isSandbox = isCampObj ? !!camp.isSandbox : false;
        return {
          id: t._id.toString(),
          campaignId: isCampObj ? camp._id.toString() : t.campaignId.toString(),
          campaign: isCampObj
            ? {
                id: camp._id.toString(),
                name: camp.name,
                advertiserName: camp.advertiserName,
                status: camp.status,
                isSandbox,
              }
            : undefined,
          isSandbox,
          title: t.title,
          description: t.description,
          category: t.category,
          verificationMethod: t.verificationMethod,
          rewardPoints: t.rewardPoints,
          status: t.status,
          totalCap: t.totalCap,
          completionsCount: t.completionsCount,
          dailyCapPerUser: t.dailyCapPerUser,
          targeting: t.targeting,
          dwellTimeSeconds: t.dwellTimeSeconds,
          appInstallConfig: t.appInstallConfig,
          videoWatchConfig: t.videoWatchConfig,
          articleReadConfig: t.articleReadConfig,
          expiresAt: t.expiresAt,
          createdAt: t.createdAt,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
}

/**
 * PATCH /api/admin/tasks/:id
 * Updates task configuration.
 */
export async function updateTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    const formatted = formatZodError(parsed.error);
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: formatted.message,
        fieldErrors: formatted.fieldErrors,
        details: formatted.details,
      },
    });
    return;
  }

  const task = await Task.findById(id);
  if (!task) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Task not found' },
    });
    return;
  }

  const campaign = await Campaign.findById(task.campaignId);
  if (campaign?.isSandbox) {
    if (parsed.data.externalActionUrl && parsed.data.externalActionUrl.trim() !== '') {
      res.status(400).json({
        success: false,
        error: {
          code: 'SANDBOX_NO_EXTERNAL_WEBHOOKS',
          message: 'External advertiser action or webhook URLs are prohibited on sandbox QA tasks',
          fieldErrors: { externalActionUrl: 'External URLs are not allowed for sandbox tasks' },
        },
      });
      return;
    }
    if (parsed.data.category === 'PARTNER_WEBHOOK' || parsed.data.verificationMethod === 'AUTHENTICATED_WEBHOOK') {
      res.status(400).json({
        success: false,
        error: {
          code: 'SANDBOX_NO_EXTERNAL_WEBHOOKS',
          message: 'Partner webhook verification is prohibited for sandbox tasks. Use FIRST_PARTY_ACTION or MANUAL_REVIEW.',
          fieldErrors: { category: 'Partner webhook tasks are not allowed in sandbox' },
        },
      });
      return;
    }
  }

  const effectiveCategory = parsed.data.category || task.category;
  const effectiveVerificationMethod = parsed.data.verificationMethod || task.verificationMethod;
  const effectiveConfigs = {
    appInstallConfig: parsed.data.appInstallConfig !== undefined ? parsed.data.appInstallConfig : task.appInstallConfig,
    videoWatchConfig: parsed.data.videoWatchConfig !== undefined ? parsed.data.videoWatchConfig : task.videoWatchConfig,
    articleReadConfig: parsed.data.articleReadConfig !== undefined ? parsed.data.articleReadConfig : task.articleReadConfig,
  };

  const validationErrors: { path: string; message: string }[] = [];
  const mockCtx: any = {
    addIssue: (issue: any) => {
      validationErrors.push({
        path: issue.path.join('.'),
        message: issue.message,
      });
    },
  };
  validateTaskCategoryAndConfigs(effectiveCategory, effectiveVerificationMethod, effectiveConfigs, mockCtx);

  if (validationErrors.length > 0) {
    const fieldErrors: Record<string, string> = {};
    for (const err of validationErrors) {
      if (!fieldErrors[err.path]) {
        fieldErrors[err.path] = err.message;
      }
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `${validationErrors[0].path}: ${validationErrors[0].message}`,
        fieldErrors,
      },
    });
    return;
  }

  Object.assign(task, parsed.data);
  await task.save();

  await AdminAuditLog.create({
    adminId: req.user!._id,
    action: 'UPDATE_TASK',
    targetEntity: 'Task',
    targetId: task._id.toString(),
    details: parsed.data,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.status(200).json({
    success: true,
    data: {
      task: {
        id: task._id.toString(),
        title: task.title,
        status: task.status,
        category: task.category,
        verificationMethod: task.verificationMethod,
        rewardPoints: task.rewardPoints,
        totalCap: task.totalCap,
        targeting: task.targeting,
        appInstallConfig: task.appInstallConfig,
        videoWatchConfig: task.videoWatchConfig,
        articleReadConfig: task.articleReadConfig,
        expiresAt: task.expiresAt,
        updatedAt: task.updatedAt,
      },
    },
  });
}

/**
 * POST /api/admin/tasks/:id/publish
 * Safe publication check: Verifies parent campaign is ACTIVE and caps are valid.
 */
export async function publishTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  const task = await Task.findById(id);
  if (!task) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Task not found' },
    });
    return;
  }

  if (task.status === 'PUBLISHED') {
    res.status(400).json({
      success: false,
      error: { code: 'ALREADY_PUBLISHED', message: 'Task is already published' },
    });
    return;
  }

  if (task.status === 'ARCHIVED') {
    res.status(400).json({
      success: false,
      error: { code: 'CANNOT_PUBLISH_ARCHIVED', message: 'Archived task cannot be published' },
    });
    return;
  }

  // Safe publication check: Verify parent campaign status
  const campaign = await Campaign.findById(task.campaignId);
  if (!campaign || campaign.status !== 'ACTIVE') {
    res.status(400).json({
      success: false,
      error: {
        code: 'CAMPAIGN_NOT_ACTIVE',
        message: 'Cannot publish task: Parent advertiser campaign is not in ACTIVE status',
      },
    });
    return;
  }

  // Reject publishing sandbox task outside sandbox environment
  const isSandboxEnv = env.NODE_ENV === 'sandbox' && env.MONGODB_DB_NAME === 'adpayon_sandbox';
  if (campaign.isSandbox && !isSandboxEnv) {
    res.status(403).json({
      success: false,
      error: {
        code: 'SANDBOX_CAMPAIGNS_FORBIDDEN',
        message: 'Cannot publish sandbox task outside the adpayon_sandbox environment',
      },
    });
    return;
  }

  if (task.totalCap <= task.completionsCount) {
    res.status(400).json({
      success: false,
      error: {
        code: 'CAP_EXHAUSTED',
        message: 'Cannot publish task: Completion cap is already met or exhausted',
      },
    });
    return;
  }

  // Completeness check before publication: prevent publishing incomplete tasks
  if (task.category === 'ARTICLE_READ') {
    if (
      !task.articleReadConfig ||
      !task.articleReadConfig.articleTitle ||
      !task.articleReadConfig.articleContent ||
      task.articleReadConfig.articleContent.trim().length < 30
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INCOMPLETE_TASK_CONFIG',
          message: 'Cannot publish task: Article title and content (at least 30 characters) are required for ARTICLE_READ tasks',
        },
      });
      return;
    }
  }

  // Expiration check: cannot publish an already-expired task
  if (task.expiresAt && new Date(task.expiresAt) <= new Date()) {
    res.status(400).json({
      success: false,
      error: {
        code: 'TASK_EXPIRED',
        message: 'Cannot publish task: Task expiration date has already passed',
      },
    });
    return;
  }

  task.status = 'PUBLISHED';
  await task.save();

  await AdminAuditLog.create({
    adminId: req.user!._id,
    action: 'PUBLISH_TASK',
    targetEntity: 'Task',
    targetId: task._id.toString(),
    details: { campaignId: campaign._id.toString(), totalCap: task.totalCap },
    ipAddress: req.ip || '127.0.0.1',
  });

  res.status(200).json({
    success: true,
    data: {
      task: {
        id: task._id.toString(),
        title: task.title,
        status: task.status,
        completionsCount: task.completionsCount,
        totalCap: task.totalCap,
      },
    },
  });
}

/**
 * POST /api/admin/tasks/:id/pause
 * Suspends a published task from user feeds.
 */
export async function pauseTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  const task = await Task.findById(id);
  if (!task) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Task not found' },
    });
    return;
  }

  task.status = 'PAUSED';
  await task.save();

  await AdminAuditLog.create({
    adminId: req.user!._id,
    action: 'PAUSE_TASK',
    targetEntity: 'Task',
    targetId: task._id.toString(),
    details: { previousStatus: task.status },
    ipAddress: req.ip || '127.0.0.1',
  });

  res.status(200).json({
    success: true,
    data: {
      task: {
        id: task._id.toString(),
        title: task.title,
        status: task.status,
      },
    },
  });
}

/**
 * POST /api/admin/tasks/:id/expire
 * Immediately expires and archives an earner task.
 */
export async function expireTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  const task = await Task.findById(id);
  if (!task) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Task not found' },
    });
    return;
  }

  const previousStatus = task.status;
  task.status = 'ARCHIVED';
  task.expiresAt = new Date();
  await task.save();

  await AdminAuditLog.create({
    adminId: req.user!._id,
    action: 'EXPIRE_TASK',
    targetEntity: 'Task',
    targetId: task._id.toString(),
    details: { previousStatus, expiredAt: task.expiresAt },
    ipAddress: req.ip || '127.0.0.1',
  });

  res.status(200).json({
    success: true,
    data: {
      task: {
        id: task._id.toString(),
        title: task.title,
        status: task.status,
        expiresAt: task.expiresAt,
      },
    },
  });
}

/**
 * POST /api/admin/tasks/completions/:id/review
 * Manual administrative review for flagged/pending completions.
 */
export async function reviewCompletion(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid completion ID format' },
    });
    return;
  }

  const parsed = reviewCompletionSchema.safeParse(req.body);
  if (!parsed.success) {
    const formatted = formatZodError(parsed.error);
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: formatted.message,
        fieldErrors: formatted.fieldErrors,
        details: formatted.details,
      },
    });
    return;
  }

  const completion = await TaskCompletion.findById(id);
  if (!completion) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Task completion record not found' },
    });
    return;
  }

  completion.status = parsed.data.status;
  completion.adminReviewNotes = parsed.data.adminReviewNotes;
  completion.rejectionReason = parsed.data.rejectionReason;
  completion.reviewedBy = req.user!._id;
  await completion.save();

  await AdminAuditLog.create({
    adminId: req.user!._id,
    action: 'REVIEW_TASK_COMPLETION',
    targetEntity: 'TaskCompletion',
    targetId: completion._id.toString(),
    details: parsed.data,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.status(200).json({
    success: true,
    data: {
      completion: {
        id: completion._id.toString(),
        status: completion.status,
        adminReviewNotes: completion.adminReviewNotes,
        rejectionReason: completion.rejectionReason,
        reviewedBy: completion.reviewedBy?.toString(),
      },
    },
  });
}

/**
 * GET /api/admin/metrics
 * Returns aggregated platform metrics for the admin dashboard.
 */
export async function getAdminMetrics(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const [
    totalCampaigns,
    activeCampaigns,
    draftCampaigns,
    pausedCampaigns,
    totalTasks,
    publishedTasks,
    draftTasks,
    pausedTasks,
    totalCompletions,
    verifiedCompletions,
    flaggedCompletions,
    rejectedCompletions,
    budgetAgg,
    pointsAgg,
  ] = await Promise.all([
    Campaign.countDocuments(),
    Campaign.countDocuments({ status: 'ACTIVE' }),
    Campaign.countDocuments({ status: 'DRAFT' }),
    Campaign.countDocuments({ status: 'PAUSED' }),
    Task.countDocuments(),
    Task.countDocuments({ status: 'PUBLISHED' }),
    Task.countDocuments({ status: 'DRAFT' }),
    Task.countDocuments({ status: 'PAUSED' }),
    TaskCompletion.countDocuments(),
    TaskCompletion.countDocuments({ status: 'VERIFIED' }),
    TaskCompletion.countDocuments({ status: 'FLAGGED' }),
    TaskCompletion.countDocuments({ status: 'REJECTED' }),
    Campaign.aggregate([
      {
        $group: {
          _id: null,
          totalBudgetPaise: { $sum: '$advertiserBudgetPaise' },
          totalSpentPaise: { $sum: '$spentBudgetPaise' },
        },
      },
    ]),
    TaskCompletion.aggregate([
      { $match: { status: 'VERIFIED' } },
      { $group: { _id: null, totalPoints: { $sum: '$rewardPoints' } } },
    ]),
  ]);

  const budget = budgetAgg[0] || { totalBudgetPaise: 0, totalSpentPaise: 0 };
  const points = pointsAgg[0] || { totalPoints: 0 };

  res.status(200).json({
    success: true,
    data: {
      campaigns: {
        total: totalCampaigns,
        active: activeCampaigns,
        draft: draftCampaigns,
        paused: pausedCampaigns,
      },
      tasks: {
        total: totalTasks,
        published: publishedTasks,
        draft: draftTasks,
        paused: pausedTasks,
      },
      completions: {
        total: totalCompletions,
        verified: verifiedCompletions,
        flagged: flaggedCompletions,
        rejected: rejectedCompletions,
      },
      financial: {
        totalBudgetPaise: budget.totalBudgetPaise,
        totalSpentPaise: budget.totalSpentPaise,
        totalRewardPointsAwarded: points.totalPoints,
      },
    },
  });
}

/**
 * GET /api/admin/campaigns/:id
 * Retrieves full details for a single campaign.
 */
export async function getCampaignDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid campaign ID format' },
    });
    return;
  }

  const campaign = await Campaign.findById(id);
  if (!campaign) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Campaign not found' },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      campaign: {
        id: campaign._id.toString(),
        name: campaign.name,
        advertiserName: campaign.advertiserName,
        description: campaign.description,
        status: campaign.status,
        isSandbox: campaign.isSandbox,
        advertiserBudgetPaise: campaign.advertiserBudgetPaise,
        spentBudgetPaise: campaign.spentBudgetPaise,
        authorizedAgreementRef: campaign.authorizedAgreementRef,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      },
    },
  });
}

/**
 * POST /api/admin/campaigns/:id/reveal-secret
 * Explicitly reveals the campaign's webhook secret for integration setup.
 * Strictly audited in AdminAuditLog.
 */
export async function revealCampaignSecret(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid campaign ID format' },
    });
    return;
  }

  const campaign = await Campaign.findById(id).select('+webhookSecret');
  if (!campaign) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Campaign not found' },
    });
    return;
  }

  await AdminAuditLog.create({
    adminId: req.user!._id,
    action: 'REVEAL_CAMPAIGN_SECRET',
    targetEntity: 'Campaign',
    targetId: campaign._id.toString(),
    details: { campaignName: campaign.name },
    ipAddress: req.ip || '127.0.0.1',
  });

  res.status(200).json({
    success: true,
    data: {
      campaignId: campaign._id.toString(),
      webhookSecret: campaign.webhookSecret,
    },
  });
}

/**
 * GET /api/admin/tasks/:id
 * Retrieves full details for a single task.
 */
export async function getTaskDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  const task = await Task.findById(id).populate('campaignId', 'name advertiserName status isSandbox');
  if (!task) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Task not found' },
    });
    return;
  }

  const camp = task.campaignId as any;
  const isCampObj = camp && typeof camp === 'object';
  const isSandbox = isCampObj ? !!camp.isSandbox : false;

  res.status(200).json({
    success: true,
    data: {
      task: {
        id: task._id.toString(),
        campaign: task.campaignId,
        campaignId: isCampObj ? camp._id.toString() : task.campaignId.toString(),
        isSandbox,
        title: task.title,
        description: task.description,
        category: task.category,
        verificationMethod: task.verificationMethod,
        rewardPoints: task.rewardPoints,
        totalCap: task.totalCap,
        completionsCount: task.completionsCount,
        dailyCapPerUser: task.dailyCapPerUser,
        dwellTimeSeconds: task.dwellTimeSeconds,
        targeting: task.targeting,
        externalActionUrl: task.externalActionUrl,
        instructions: task.instructions,
        appInstallConfig: task.appInstallConfig,
        videoWatchConfig: task.videoWatchConfig,
        articleReadConfig: task.articleReadConfig,
        expiresAt: task.expiresAt,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    },
  });
}

/**
 * GET /api/admin/tasks/completions
 * Lists completions with filtering and pagination.
 */
export async function listCompletions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const skip = (page - 1) * limit;

  const filter: any = {};

  const ALLOWED_STATUSES = ['VERIFIED', 'FLAGGED', 'REJECTED'] as const;
  const ALLOWED_METHODS = ['FIRST_PARTY_ACTION', 'AUTHENTICATED_WEBHOOK', 'MANUAL_REVIEW'] as const;

  if (req.query.status && req.query.status !== 'ALL') {
    const statusStr = req.query.status as string;
    if (!ALLOWED_STATUSES.includes(statusStr as any)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Invalid status filter. Allowed values: ${ALLOWED_STATUSES.join(', ')}`,
        },
      });
      return;
    }
    filter.status = statusStr;
  }

  if (req.query.verificationMethod && req.query.verificationMethod !== 'ALL') {
    const methodStr = req.query.verificationMethod as string;
    if (!ALLOWED_METHODS.includes(methodStr as any)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_VERIFICATION_METHOD',
          message: `Invalid verificationMethod filter. Allowed values: ${ALLOWED_METHODS.join(', ')}`,
        },
      });
      return;
    }
    filter.verificationMethod = methodStr;
  }

  if (req.query.taskId) {
    const taskIdStr = req.query.taskId as string;
    if (!Types.ObjectId.isValid(taskIdStr)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid taskId filter format' },
      });
      return;
    }
    filter.taskId = new Types.ObjectId(taskIdStr);
  }

  if (req.query.campaignId) {
    const campIdStr = req.query.campaignId as string;
    if (!Types.ObjectId.isValid(campIdStr)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid campaignId filter format' },
      });
      return;
    }
    filter.campaignId = new Types.ObjectId(campIdStr);
  }

  const [completions, total] = await Promise.all([
    TaskCompletion.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name mobile')
      .populate('taskId', 'title rewardPoints category')
      .populate('campaignId', 'name advertiserName')
      .populate('evidenceId'),
    TaskCompletion.countDocuments(filter),
  ]);

  const items = completions.map((c) => ({
    id: c._id.toString(),
    taskId: c.taskId,
    campaignId: c.campaignId,
    userId: c.userId,
    clickId: c.clickId,
    rewardPoints: c.rewardPoints,
    status: c.status,
    verificationMethod: c.verificationMethod,
    evidence: c.evidenceId,
    completedAt: c.completedAt,
    rejectionReason: c.rejectionReason,
    adminReviewNotes: c.adminReviewNotes,
    reviewedBy: c.reviewedBy,
    createdAt: c.createdAt,
  }));

  res.status(200).json({
    success: true,
    data: {
      completions: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
}

/**
 * GET /api/admin/audit-logs
 * Lists admin audit log entries with pagination and filtering.
 */
export async function listAuditLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 25));
  const skip = (page - 1) * limit;

  const filter: any = {};
  if (req.query.action) {
    filter.action = req.query.action;
  }
  if (req.query.targetEntity) {
    filter.targetEntity = req.query.targetEntity;
  }

  const [logs, total] = await Promise.all([
    AdminAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('adminId', 'name mobile role'),
    AdminAuditLog.countDocuments(filter),
  ]);

  const items = logs.map((l) => ({
    id: l._id.toString(),
    admin: l.adminId,
    action: l.action,
    targetEntity: l.targetEntity,
    targetId: l.targetId,
    details: l.details,
    ipAddress: l.ipAddress,
    createdAt: l.createdAt,
  }));

  res.status(200).json({
    success: true,
    data: {
      logs: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
}
