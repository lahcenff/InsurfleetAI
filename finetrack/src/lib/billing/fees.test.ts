import { describe, expect, it } from "vitest";
import { computeLine, feeSettingsFrom, sumLines } from "./fees";

describe("admin fees", () => {
  it("applies a fixed fee per offense with 5% VAT on the fee only", () => {
    const s = feeSettingsFrom({ feeType: "FIXED", feeValue: "25.00", vatOnFeePercent: "5" });
    expect(computeLine(60000, s)).toEqual({ amount: 60000, fee: 2500, vat: 125, total: 62625 });
  });

  it("applies a percentage fee, rounded half-up to the fil", () => {
    const s = feeSettingsFrom({ feeType: "PERCENT", feeValue: "10", vatOnFeePercent: "5" });
    // 10% of AED 4.00 = 0.40; VAT 5% of 0.40 = 0.02
    expect(computeLine(400, s)).toEqual({ amount: 400, fee: 40, vat: 2, total: 442 });
    // 12.5% of AED 6.00 = 0.75; VAT 0.0375 → 0.04
    expect(computeLine(600, feeSettingsFrom({ feeType: "PERCENT", feeValue: "12.5", vatOnFeePercent: "5" }))).toEqual({ amount: 600, fee: 75, vat: 4, total: 679 });
  });

  it("supports no fee and no VAT", () => {
    const s = feeSettingsFrom({ feeType: "FIXED", feeValue: 0, vatOnFeePercent: 0 });
    expect(computeLine(123456, s)).toEqual({ amount: 123456, fee: 0, vat: 0, total: 123456 });
  });

  it("sums lines exactly (no float drift)", () => {
    const s = feeSettingsFrom({ feeType: "PERCENT", feeValue: "10", vatOnFeePercent: "5" });
    const lines = Array.from({ length: 1000 }, () => computeLine(10, s)); // AED 0.10 each
    expect(sumLines(lines)).toEqual({ amount: 10000, fee: 1000, vat: 0, total: 11000 });
  });
});
