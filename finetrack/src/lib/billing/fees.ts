import type { FeeType } from "@prisma/client";
import type { Fils } from "../money";

export interface FeeSettings {
  feeType: FeeType;
  /** FIXED: AED amount in fils. PERCENT: percentage × 100 (e.g. 10% = 1000). */
  feeValue: number;
  /** VAT on the admin fee, percentage × 100 (5% = 500). Fines themselves carry no VAT. */
  vatPercent: number;
}

export interface LineAmounts {
  amount: Fils;
  fee: Fils;
  vat: Fils;
  total: Fils;
}

// Half-up rounding on non-negative integer fils.
const pct = (base: Fils, percentTimes100: number) => Math.round((base * percentTimes100) / 10_000);

export function computeLine(amount: Fils, s: FeeSettings): LineAmounts {
  const fee = s.feeType === "FIXED" ? s.feeValue : pct(amount, s.feeValue);
  const vat = pct(fee, s.vatPercent);
  return { amount, fee, vat, total: amount + fee + vat };
}

export function sumLines(lines: LineAmounts[]): LineAmounts {
  return lines.reduce(
    (acc, l) => ({ amount: acc.amount + l.amount, fee: acc.fee + l.fee, vat: acc.vat + l.vat, total: acc.total + l.total }),
    { amount: 0, fee: 0, vat: 0, total: 0 },
  );
}

/** Company settings (Decimal columns) → FeeSettings in integer units. */
export function feeSettingsFrom(c: { feeType: FeeType; feeValue: unknown; vatOnFeePercent: unknown }): FeeSettings {
  return {
    feeType: c.feeType,
    feeValue: Math.round(Number(c.feeValue) * 100),
    vatPercent: Math.round(Number(c.vatOnFeePercent) * 100),
  };
}
