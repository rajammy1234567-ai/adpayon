import { z } from 'zod';

export const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  sponsorReferralCode: z.string().min(3, 'Valid sponsor code required').toUpperCase(),
  leg: z.enum(['LEFT', 'RIGHT'], {
    errorMap: () => ({ message: 'Please select binary leg: LEFT or RIGHT' }),
  }),
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
