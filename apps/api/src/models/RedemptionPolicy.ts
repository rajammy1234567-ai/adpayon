import { Schema, model } from 'mongoose';
const schema = new Schema({
  key: { type: String, default: 'wallet', unique: true },
  usdEnabled: { type: Boolean, default: false },
  // Integer paise for 1 USD; explicit admin rate, never guessed or called a live market rate.
  paisePerUsd: { type: Number, min: 1, validate: Number.isSafeInteger },
  usdInstructions: { type: String, maxlength: 1000, default: '' },
  version: { type: Number, default: 1 },
}, { timestamps: true });
export const RedemptionPolicy = model('RedemptionPolicy', schema);
