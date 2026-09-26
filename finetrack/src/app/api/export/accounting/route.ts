import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth";
import { accountingCsv } from "@/lib/billing/export";
import { dubaiToUtc } from "@/lib/time";

// ?from=2026-01&to=2026-03 → statements issued in those Dubai calendar months (inclusive).
export async function GET(req: NextRequest) {
  const { companyId } = await requireCompany();
  const [fy, fm] = (req.nextUrl.searchParams.get("from") ?? "").split("-").map(Number);
  const [ty, tm] = (req.nextUrl.searchParams.get("to") ?? "").split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return new Response("from/to required (yyyy-MM)", { status: 400 });
  const from = dubaiToUtc(fy, fm, 1);
  const to = tm === 12 ? dubaiToUtc(ty + 1, 1, 1) : dubaiToUtc(ty, tm + 1, 1);
  const csv = await accountingCsv(companyId, from, to);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finetrack-accounting-${fy}-${String(fm).padStart(2, "0")}_${ty}-${String(tm).padStart(2, "0")}.csv"`,
    },
  });
}
