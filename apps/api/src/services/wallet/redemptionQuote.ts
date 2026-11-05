import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
export type RedemptionCurrency = 'INR' | 'USD';
export interface Quote { purpose: 'REDEMPTION'; userId: string; amountPaise: number; currency: RedemptionCurrency; payoutMinor: number; paisePerUsd: number | null; policyVersion: number }
export function convertRedemption(amountPaise: number, currency: RedemptionCurrency, paisePerUsd?: number | null): number {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 1 || !['INR', 'USD'].includes(currency)) throw new Error('INVALID_AMOUNT');
  if (currency === 'INR') return amountPaise;
  if (!Number.isSafeInteger(paisePerUsd) || !paisePerUsd || paisePerUsd < 1) throw new Error('USD_NOT_CONFIGURED');
  const cents = Number(BigInt(amountPaise) * 100n / BigInt(paisePerUsd));
  if (!Number.isSafeInteger(cents) || cents < 1) throw new Error('INVALID_PAYOUT');
  return cents;
}
export function signQuote(quote: Quote): string { return jwt.sign(quote, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', expiresIn: '5m', audience: 'adpayon-redemption' }); }
export function verifyQuote(token: string, userId: string, amountPaise: number, currency: RedemptionCurrency): Quote {
  const q = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], audience: 'adpayon-redemption' }) as Quote;
  if (q.purpose !== 'REDEMPTION' || q.userId !== userId || q.amountPaise !== amountPaise || q.currency !== currency || q.payoutMinor !== convertRedemption(amountPaise, currency, q.paisePerUsd)) throw new Error('INVALID_QUOTE');
  return q;
}
