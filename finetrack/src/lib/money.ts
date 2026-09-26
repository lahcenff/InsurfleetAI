// AED amounts are handled as integer fils (1 AED = 100 fils) in business logic,
// and stored as Decimal(12,2) in the database.

export type Fils = number;

export function toFils(v: unknown): Fils {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Math.round(Number((v * 100).toFixed(4)));
  // Prisma Decimal, strings like "1,250.50", "AED 300", "300.00 AED"
  const s = String(v).replace(/AED|د\.إ|,|\s/gi, "");
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${v}`);
  return Math.round(Number((n * 100).toFixed(4)));
}

/** "1250.50" — for Decimal columns and CSV exports. */
export function filsToDecimalString(f: Fils): string {
  const neg = f < 0;
  const a = Math.abs(Math.round(f));
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** "AED 1,250.50" (or Arabic-Indic digits for "ar"). */
export function formatAed(v: unknown, locale = "en"): string {
  const n = toFils(v) / 100;
  const s = new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return locale === "ar" ? `${s} د.إ` : `AED ${s}`;
}

export function formatFils(f: Fils, locale = "en"): string {
  return formatAed(f / 100, locale);
}
