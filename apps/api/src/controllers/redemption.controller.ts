import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { RedemptionPolicy } from '../models/RedemptionPolicy';
import { AdminAuditLog } from '../models';
import { convertRedemption, signQuote, Quote } from '../services/wallet/redemptionQuote';
export async function getRedemptionOptions(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const p = await RedemptionPolicy.findOne({ key: 'wallet' }).lean();
    res.json({ success: true, data: { pointsPerRupee: 10, minWithdrawalPaise: 5000, usdEnabled: !!p?.usdEnabled, paisePerUsd: p?.paisePerUsd || null, usdInstructions: p?.usdInstructions || '', version: p?.version || 1, settlement: 'MANUAL_REVIEW' } });
  } catch { res.status(500).json({ success: false, error: { message: 'Unable to load redemption settings.' } }); }
}
export async function createRedemptionQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
  const input = z.object({ amountPaise: z.number().int().min(5000).max(1000000000), currency: z.enum(['INR', 'USD']) }).safeParse(req.body);
  if (!input.success) { res.status(400).json({ success: false, error: { message: 'Enter a valid amount of at least ₹50.' } }); return; }
  try {
    const p = await RedemptionPolicy.findOne({ key: 'wallet' }).lean();
    if (input.data.currency === 'USD' && (!p?.usdEnabled || !p.paisePerUsd || !p.usdInstructions)) {
      res.status(409).json({ success: false, error: { message: 'USD redemption has not been configured by the administrator.' } }); return;
    }
    const quote: Quote = { ...input.data, userId: req.user!._id.toString(), purpose: 'REDEMPTION', payoutMinor: convertRedemption(input.data.amountPaise, input.data.currency, p?.paisePerUsd), paisePerUsd: p?.paisePerUsd || null, policyVersion: p?.version || 1 };
    res.json({ success: true, data: { ...quote, feePaise: 0, token: signQuote(quote), expiresAt: new Date(Date.now() + 300000).toISOString() } });
  } catch { res.status(500).json({ success: false, error: { message: 'Unable to prepare payout quote.' } }); }
}
export async function updateRedemptionPolicy(req: AuthenticatedRequest, res: Response): Promise<void> {
  const input = z.object({ usdEnabled: z.boolean(), paisePerUsd: z.number().int().min(1).max(100000000).optional().nullable(), usdInstructions: z.string().trim().max(1000) }).refine(p => !p.usdEnabled || (!!p.paisePerUsd && p.usdInstructions.length >= 10), 'Set the USD rate and payment instructions before enabling USD.').safeParse(req.body);
  if (!input.success) { res.status(400).json({ success: false, error: { message: input.error.issues[0].message } }); return; }
  const session = await RedemptionPolicy.startSession();
  try {
    await session.withTransaction(async () => {
      await RedemptionPolicy.findOneAndUpdate({ key: 'wallet' }, { $set: input.data, $inc: { version: 1 } }, { upsert: true, runValidators: true, session });
      await AdminAuditLog.create([{ adminId: req.user!._id, action: 'REDEMPTION_POLICY_UPDATED', targetEntity: 'RedemptionPolicy', details: input.data, ipAddress: req.ip || 'unknown' }], { session });
    });
    await getRedemptionOptions(req, res);
  } catch { res.status(500).json({ success: false, error: { message: 'Redemption settings were not saved.' } }); }
  finally { await session.endSession(); }
}
