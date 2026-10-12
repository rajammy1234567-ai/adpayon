"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kycSubmitSchema = exports.withdrawalRequestSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.otpVerifySchema = exports.loginSchema = exports.signupSchema = void 0;
const zod_1 = require("zod");
exports.signupSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    mobile: zod_1.z.string().regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
    sponsorReferralCode: zod_1.z.string().min(3, 'Valid sponsor code required').toUpperCase(),
    leg: zod_1.z.enum(['LEFT', 'RIGHT'], {
        errorMap: () => ({ message: 'Please select binary leg: LEFT or RIGHT' }),
    }),
    acceptTerms: zod_1.z.boolean().refine((val) => val === true, {
        message: 'You must accept the terms and conditions',
    }),
});
exports.loginSchema = zod_1.z.object({
    mobile: zod_1.z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
exports.otpVerifySchema = zod_1.z.object({
    mobile: zod_1.z.string().regex(/^[6-9]\d{9}$/),
    otp: zod_1.z.string().length(6, 'OTP must be 6 digits'),
});
exports.forgotPasswordSchema = zod_1.z.object({
    mobile: zod_1.z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
});
exports.resetPasswordSchema = zod_1.z.object({
    mobile: zod_1.z.string().regex(/^[6-9]\d{9}$/),
    otp: zod_1.z.string().length(6, 'OTP must be 6 digits'),
    newPassword: zod_1.z.string().min(6, 'New password must be at least 6 characters'),
});
exports.withdrawalRequestSchema = zod_1.z.object({
    amountPaise: zod_1.z.number().int().min(10000, 'Minimum withdrawal is ₹100 (10,000 paise)'),
    payoutMethod: zod_1.z.enum(['UPI', 'BANK_TRANSFER', 'PAYTM']),
    upiId: zod_1.z
        .string()
        .regex(/^[\w.-]+@[\w.-]+$/, 'Enter a valid UPI ID (e.g. name@upi)')
        .optional(),
    bankAccount: zod_1.z.string().min(9).max(18).optional(),
    ifsc: zod_1.z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format').optional(),
    accountHolderName: zod_1.z.string().min(3).optional(),
});
exports.kycSubmitSchema = zod_1.z.object({
    panNumber: zod_1.z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN number format').toUpperCase(),
    // Aadhaar: Strictly only last 4 digits accepted and stored!
    aadhaarLast4: zod_1.z.string().length(4, 'Enter exactly last 4 digits of Aadhaar').regex(/^\d{4}$/, 'Must be numeric'),
    bankAccount: zod_1.z.string().min(9).max(18, 'Account number must be 9-18 digits'),
    ifsc: zod_1.z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code').toUpperCase(),
    accountHolderName: zod_1.z.string().min(3, 'Account holder name required'),
    upiId: zod_1.z.string().regex(/^[\w.-]+@[\w.-]+$/, 'Invalid UPI ID').optional(),
});
//# sourceMappingURL=index.js.map