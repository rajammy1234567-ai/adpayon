import { z } from 'zod';
export declare const signupSchema: z.ZodObject<{
    name: z.ZodString;
    mobile: z.ZodString;
    password: z.ZodString;
    sponsorReferralCode: z.ZodString;
    leg: z.ZodEnum<["LEFT", "RIGHT"]>;
    acceptTerms: z.ZodEffects<z.ZodBoolean, boolean, boolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    mobile: string;
    password: string;
    sponsorReferralCode: string;
    leg: "LEFT" | "RIGHT";
    acceptTerms: boolean;
}, {
    name: string;
    mobile: string;
    password: string;
    sponsorReferralCode: string;
    leg: "LEFT" | "RIGHT";
    acceptTerms: boolean;
}>;
export declare const loginSchema: z.ZodObject<{
    mobile: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    mobile: string;
    password: string;
}, {
    mobile: string;
    password: string;
}>;
export declare const otpVerifySchema: z.ZodObject<{
    mobile: z.ZodString;
    otp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    mobile: string;
    otp: string;
}, {
    mobile: string;
    otp: string;
}>;
export declare const forgotPasswordSchema: z.ZodObject<{
    mobile: z.ZodString;
}, "strip", z.ZodTypeAny, {
    mobile: string;
}, {
    mobile: string;
}>;
export declare const resetPasswordSchema: z.ZodObject<{
    mobile: z.ZodString;
    otp: z.ZodString;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    mobile: string;
    otp: string;
    newPassword: string;
}, {
    mobile: string;
    otp: string;
    newPassword: string;
}>;
export declare const withdrawalRequestSchema: z.ZodObject<{
    amountPaise: z.ZodNumber;
    payoutMethod: z.ZodEnum<["UPI", "BANK_TRANSFER", "PAYTM"]>;
    upiId: z.ZodOptional<z.ZodString>;
    bankAccount: z.ZodOptional<z.ZodString>;
    ifsc: z.ZodOptional<z.ZodString>;
    accountHolderName: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    amountPaise: number;
    payoutMethod: "UPI" | "BANK_TRANSFER" | "PAYTM";
    upiId?: string | undefined;
    bankAccount?: string | undefined;
    ifsc?: string | undefined;
    accountHolderName?: string | undefined;
}, {
    amountPaise: number;
    payoutMethod: "UPI" | "BANK_TRANSFER" | "PAYTM";
    upiId?: string | undefined;
    bankAccount?: string | undefined;
    ifsc?: string | undefined;
    accountHolderName?: string | undefined;
}>;
export declare const kycSubmitSchema: z.ZodObject<{
    panNumber: z.ZodString;
    aadhaarLast4: z.ZodString;
    bankAccount: z.ZodString;
    ifsc: z.ZodString;
    accountHolderName: z.ZodString;
    upiId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    bankAccount: string;
    ifsc: string;
    accountHolderName: string;
    panNumber: string;
    aadhaarLast4: string;
    upiId?: string | undefined;
}, {
    bankAccount: string;
    ifsc: string;
    accountHolderName: string;
    panNumber: string;
    aadhaarLast4: string;
    upiId?: string | undefined;
}>;
//# sourceMappingURL=index.d.ts.map