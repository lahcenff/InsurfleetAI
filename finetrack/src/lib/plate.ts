import type { Emirate } from "@prisma/client";

export const EMIRATES: Emirate[] = ["DXB", "AUH", "SHJ", "AJM", "UAQ", "RAK", "FUJ"];

const EMIRATE_ALIASES: Record<string, Emirate> = {
  dxb: "DXB", dubai: "DXB", "دبي": "DXB", du: "DXB",
  auh: "AUH", ad: "AUH", "abu dhabi": "AUH", abudhabi: "AUH", "أبوظبي": "AUH", "ابوظبي": "AUH", "أبو ظبي": "AUH",
  shj: "SHJ", sharjah: "SHJ", "الشارقة": "SHJ", sh: "SHJ",
  ajm: "AJM", ajman: "AJM", "عجمان": "AJM", aj: "AJM",
  uaq: "UAQ", "umm al quwain": "UAQ", "umm al qaiwain": "UAQ", "أم القيوين": "UAQ", uq: "UAQ",
  rak: "RAK", "ras al khaimah": "RAK", "رأس الخيمة": "RAK",
  fuj: "FUJ", fujairah: "FUJ", "الفجيرة": "FUJ", fu: "FUJ",
};

export function parseEmirate(v: unknown): Emirate | null {
  if (v == null) return null;
  const k = String(v).trim().toLowerCase().replace(/\s+/g, " ");
  return EMIRATE_ALIASES[k] ?? null;
}

export function normalizePlateCode(v: unknown): string {
  return v == null ? "" : String(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizePlateNumber(v: unknown): string {
  const digits = v == null ? "" : String(v).replace(/\D/g, "");
  return digits.replace(/^0+(?=\d)/, "");
}

export function plateKey(emirate: Emirate, code: unknown, number: unknown): string {
  return `${emirate}-${normalizePlateCode(code)}-${normalizePlateNumber(number)}`;
}

/**
 * Best-effort parsing of a free-text plate as found in portal exports:
 * "DXB A 12345", "Dubai/A/12345", "A-12345", "12345 A", "AD 5 12345", "12345".
 */
export function parseRawPlate(raw: string): { emirate: Emirate | null; code: string | null; number: string } {
  let rest = raw.trim().replace(/\s+/g, " ");
  let emirate: Emirate | null = null;
  // Emirate prefix, longest alias first ("abu dhabi" before "ad").
  const lower = rest.toLowerCase();
  for (const alias of ALIASES_BY_LENGTH) {
    if (lower.startsWith(alias) && /^([\s/\-_|,]|$)/.test(lower.slice(alias.length)) && lower.length > alias.length) {
      emirate = EMIRATE_ALIASES[alias];
      rest = rest.slice(alias.length);
      break;
    }
  }
  const parts = rest.split(/[\s/\-_|,]+/).filter(Boolean);
  // The plate number is the longest all-digit token; the code is what remains.
  const numeric = parts.filter((p) => /^\d+$/.test(p)).sort((a, b) => b.length - a.length);
  const number = numeric[0] ?? parts.join("").replace(/\D/g, "");
  const idx = parts.indexOf(number);
  const others = parts.filter((_, i) => i !== idx);
  const code = normalizePlateCode(others.join(""));
  return { emirate, code: code || null, number: normalizePlateNumber(number) };
}

const ALIASES_BY_LENGTH = Object.keys(EMIRATE_ALIASES).sort((a, b) => b.length - a.length);

export function formatPlate(emirate: string | null | undefined, code: string | null | undefined, number: string) {
  return [emirate, code, number].filter(Boolean).join(" ");
}
