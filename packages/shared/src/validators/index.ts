import { z } from 'zod';

export const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  sponsorReferralCode: z.string().min(3, 'Valid sponsor code required').toUpperCase(),
  leg: z.enum(['LEFT', 'RIGHT']).optional(), // Backward-compatible optional field
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms and conditions',
  }),
});

export const loginSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  password: z.string().min(1, 'Password is required'),
});

export const otpVerifySchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export const forgotPasswordSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
});

export const resetPasswordSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export const withdrawalRequestSchema = z.object({
  amountPaise: z.number().int().min(10000, 'Minimum withdrawal is ₹100 (10,000 paise)'),
  payoutMethod: z.enum(['UPI', 'BANK_TRANSFER', 'PAYTM']),
  upiId: z
    .string()
    .regex(/^[\w.-]+@[\w.-]+$/, 'Enter a valid UPI ID (e.g. name@upi)')
    .optional(),
  bankAccount: z.string().min(9).max(18).optional(),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format').optional(),
  accountHolderName: z.string().min(3).optional(),
});

export const kycSubmitSchema = z.object({
  panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN number format').toUpperCase(),
  // Aadhaar: Strictly only last 4 digits accepted and stored!
  aadhaarLast4: z.string().length(4, 'Enter exactly last 4 digits of Aadhaar').regex(/^\d{4}$/, 'Must be numeric'),
  bankAccount: z.string().min(9).max(18, 'Account number must be 9-18 digits'),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code').toUpperCase(),
  accountHolderName: z.string().min(3, 'Account holder name required'),
  upiId: z.string().regex(/^[\w.-]+@[\w.-]+$/, 'Invalid UPI ID').optional(),
});

// ============================================================================
// Security & Anti-SSRF URL Validators
// ============================================================================

export function isSafePublicUrl(urlStr: string): { valid: boolean; reason?: string } {
  if (typeof urlStr !== 'string' || urlStr.trim() === '') {
    return { valid: false, reason: 'URL cannot be empty' };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  // Must be http or https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'URL protocol must be HTTP or HTTPS' };
  }

  // Prohibit embedded credentials
  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'URL must not contain embedded user credentials' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const cleanHost = hostname.replace(/^\[|\]$/g, '');

  // Localhost & private network domain suffixes
  if (
    cleanHost === 'localhost' ||
    cleanHost === 'localhost.localdomain' ||
    cleanHost.endsWith('.localhost') ||
    cleanHost.endsWith('.local') ||
    cleanHost.endsWith('.internal') ||
    cleanHost.endsWith('.lan') ||
    cleanHost.endsWith('.corp') ||
    cleanHost === '0.0.0.0'
  ) {
    return { valid: false, reason: 'Local and internal network hostnames are prohibited' };
  }

  // IPv6 loopback and private/link-local
  if (
    cleanHost === '::1' ||
    cleanHost === '0:0:0:0:0:0:0:1' ||
    cleanHost.startsWith('fe80:') ||
    cleanHost.startsWith('fc') ||
    cleanHost.startsWith('fd')
  ) {
    return { valid: false, reason: 'IPv6 loopback and private addresses are prohibited' };
  }

  // IPv4 dotted decimal check
  const ipv4Pattern = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;
  const match = ipv4Pattern.exec(cleanHost);

  if (match) {
    const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
    if (octets.some((o) => o > 255 || isNaN(o))) {
      return { valid: false, reason: 'Invalid IPv4 octet in host' };
    }

    const [o1, o2] = octets;
    if (o1 === 127) return { valid: false, reason: 'Loopback IP addresses (127.0.0.0/8) are prohibited' };
    if (o1 === 0) return { valid: false, reason: 'Current network IP addresses (0.0.0.0/8) are prohibited' };
    if (o1 === 10) return { valid: false, reason: 'Private IP addresses (10.0.0.0/8) are prohibited' };
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return { valid: false, reason: 'Private IP addresses (172.16.0.0/12) are prohibited' };
    if (o1 === 192 && o2 === 168) return { valid: false, reason: 'Private IP addresses (192.168.0.0/16) are prohibited' };
    if (o1 === 169 && o2 === 254) return { valid: false, reason: 'Link-local/cloud metadata addresses (169.254.0.0/16) are prohibited' };
  }

  // Prohibit integer or hex-encoded IPv4 representations (e.g. 2130706433 or 0x7f000001)
  if (/^(0x[0-9a-f]+|\d+)$/i.test(cleanHost)) {
    return { valid: false, reason: 'Raw integer or hex IP addresses are prohibited' };
  }

  // Enforce valid domain structure or public IP
  if (!cleanHost.includes('.') && cleanHost !== 'adpayon.com') {
    return { valid: false, reason: 'Hostname must be a fully qualified domain name or public IP' };
  }

  return { valid: true };
}

export function isSafeContent(content: string): { valid: boolean; reason?: string } {
  if (typeof content !== 'string') return { valid: true };
  const dangerousPatterns = [
    /<script[\s\S]*?>/i,
    /<\/script>/i,
    /javascript:/i,
    /vbscript:/i,
    /data:text\/html/i,
    /<iframe[\s\S]*?>/i,
    /<object[\s\S]*?>/i,
    /<embed[\s\S]*?>/i,
    /on\w+\s*=/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      return { valid: false, reason: 'Content contains potentially unsafe script or HTML tags' };
    }
  }
  return { valid: true };
}

// ============================================================================
// Phase 10.2 Task Engine Configuration Schemas
// ============================================================================

export const appInstallConfigSchema = z.object({
  appName: z.string().trim().min(2, 'App name must contain at least 2 characters').max(100, 'App name cannot exceed 100 characters'),
  packageName: z
    .string()
    .trim()
    .min(3, 'Package name / Bundle ID must contain at least 3 characters')
    .max(150, 'Package name cannot exceed 150 characters')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Package name contains invalid characters'),
  platform: z.enum(['ANDROID', 'IOS', 'CROSS_PLATFORM']),
  storeUrl: z
    .string()
    .trim()
    .max(500, 'Store URL cannot exceed 500 characters')
    .refine((val) => isSafePublicUrl(val).valid, {
      message: 'Store URL must be a valid, public HTTP/HTTPS URL',
    }),
  attributionMethod: z.enum(['SIGNED_POSTBACK', 'MANUAL_REVIEW', 'IN_APP_FEEDBACK']),
  conversionEvent: z.enum(['INSTALL', 'FIRST_OPEN', 'REGISTER', 'IN_APP_PURCHASE']),
  testingSteps: z.string().trim().max(2000, 'Testing steps cannot exceed 2000 characters').optional(),
  feedbackQuestion: z.string().trim().max(500, 'Feedback question cannot exceed 500 characters').optional(),
});

export const comprehensionQuizSchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(5, 'Quiz question must contain at least 5 characters')
      .max(300, 'Quiz question cannot exceed 300 characters')
      .refine((val) => isSafeContent(val).valid, {
        message: 'Quiz question contains invalid or unsafe script/HTML tags',
      }),
    options: z
      .array(z.string().trim().min(1, 'Option cannot be empty').max(150, 'Option cannot exceed 150 characters'))
      .min(2, 'Quiz must have at least 2 options')
      .max(6, 'Quiz cannot have more than 6 options'),
    correctOptionIndex: z
      .number()
      .int('Correct option index must be an integer')
      .min(0, 'Correct option index cannot be negative'),
  })
  .refine((data) => data.correctOptionIndex < data.options.length, {
    message: 'Correct option index must point to a valid option in the options array',
    path: ['correctOptionIndex'],
  });

export const videoWatchConfigSchema = z
  .object({
    videoUrl: z
      .string()
      .trim()
      .max(500, 'Video URL cannot exceed 500 characters')
      .refine((val) => isSafePublicUrl(val).valid, {
        message: 'Video URL must be a valid, public HTTP/HTTPS media URL',
      }),
    videoDurationSeconds: z
      .number()
      .int('Video duration must be an integer')
      .min(5, 'Video duration must be at least 5 seconds')
      .max(7200, 'Video duration cannot exceed 7200 seconds'),
    requiredWatchSeconds: z
      .number()
      .int('Required watch duration must be an integer')
      .min(5, 'Required watch duration must be at least 5 seconds')
      .max(7200, 'Required watch duration cannot exceed 7200 seconds'),
    allowSeeking: z.boolean().default(false),
    sessionTimeoutSeconds: z
      .number()
      .int('Session timeout must be an integer')
      .min(30, 'Session timeout must be at least 30 seconds')
      .max(7200, 'Session timeout cannot exceed 7200 seconds')
      .default(1800),
    completionPolicy: z.enum(['FULL_VIDEO', 'MINIMUM_DURATION']).default('FULL_VIDEO'),
    comprehensionQuiz: comprehensionQuizSchema.optional(),
  })
  .refine((data) => data.requiredWatchSeconds <= data.videoDurationSeconds, {
    message: 'Required watch duration cannot exceed total video duration',
    path: ['requiredWatchSeconds'],
  });

export const articleReadConfigSchema = z.object({
  articleTitle: z
    .string()
    .trim()
    .min(3, 'Article title must contain at least 3 characters')
    .max(200, 'Article title cannot exceed 200 characters')
    .refine((val) => isSafeContent(val).valid, {
      message: 'Article title contains unsafe HTML or script tags',
    }),
  articleContent: z
    .string()
    .trim()
    .min(30, 'Article content must contain at least 30 characters')
    .max(50000, 'Article content cannot exceed 50,000 characters')
    .refine((val) => isSafeContent(val).valid, {
      message: 'Article content contains unsafe HTML or script tags',
    }),
  sourceUrl: z
    .string()
    .trim()
    .max(500, 'Source URL cannot exceed 500 characters')
    .refine((val) => !val || isSafePublicUrl(val).valid, {
      message: 'Source URL must be a valid, public HTTP/HTTPS URL',
    })
    .optional(),
  minReadDurationSeconds: z
    .number()
    .int('Minimum read duration must be an integer')
    .min(5, 'Minimum read duration must be at least 5 seconds')
    .max(1800, 'Minimum read duration cannot exceed 1800 seconds'),
  minScrollPercentage: z
    .number()
    .int('Minimum scroll percentage must be an integer')
    .min(1, 'Minimum scroll percentage must be at least 1')
    .max(100, 'Minimum scroll percentage cannot exceed 100')
    .default(80),
  comprehensionQuiz: comprehensionQuizSchema.optional(),
});

export * from './appInstall';

