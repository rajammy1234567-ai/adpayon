import { CommissionConfigData, RankMilestoneConfig } from '../types';
/**
 * Converts integer paise into formatted INR string.
 * @param paise Integer paise amount (e.g., 5000)
 * @param includeDecimals Whether to format with .00 if cents exist (default true)
 * @returns Formatted currency string (e.g., "₹50.00" or "₹50")
 */
export declare function formatPaiseToRupees(paise: number, includeDecimals?: boolean): string;
/**
 * Converts INR floating input into safe integer paise.
 * @param inr Rupees
 * @returns Integer paise
 */
export declare function inrToPaise(inr: number): number;
export declare const DEFAULT_RANKS: RankMilestoneConfig[];
export declare const DEFAULT_COMMISSION_CONFIG: CommissionConfigData;
//# sourceMappingURL=index.d.ts.map