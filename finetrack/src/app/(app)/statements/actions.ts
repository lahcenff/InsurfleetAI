"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCompany, appUrl } from "@/lib/auth";
import { generateStatements, setStatementStatus } from "@/lib/billing/statements";
import { notifyParty } from "@/lib/notify";
import { makeT } from "@/lib/i18n/t";
import { getDict } from "@/lib/i18n";
import { formatAed } from "@/lib/money";
import { dubaiToUtc } from "@/lib/time";
import { prisma } from "@/lib/db";

export async function generate(f: FormData) {
  const { companyId, user } = await requireCompany();
  // <input type="month"> → full Dubai calendar months, from start month to end month inclusive.
  const [fy, fm] = String(f.get("from") ?? "").split("-").map(Number);
  const [ty, tm] = String(f.get("to") ?? "").split("-").map(Number);
  if (!fy || !fm || !ty || !tm || ty * 12 + tm < fy * 12 + fm) redirect("/statements?error=period");
  const from = dubaiToUtc(fy, fm, 1);
  const periodEnd = tm === 12 ? dubaiToUtc(ty + 1, 1, 1) : dubaiToUtc(ty, tm + 1, 1);
  const ids = await generateStatements(companyId, user.id, { periodStart: from, periodEnd });
  revalidatePath("/", "layout");
  redirect(`/statements?generated=${ids.length}`);
}

export async function changeStatus(f: FormData) {
  const { companyId, user } = await requireCompany();
  const id = String(f.get("id"));
  const status = String(f.get("status")) as "PAID" | "VOID";
  await setStatementStatus(companyId, user.id, id, status);
  revalidatePath("/", "layout");
  redirect(String(f.get("back") ?? `/statements/${id}`));
}

async function sendOne(companyId: string, userId: string, id: string) {
  const s = await prisma.statement.findFirstOrThrow({ where: { id, companyId }, include: { party: true, company: true } });
  if (s.status === "VOID") return { delivered: false };
  const loc = s.party.preferredLocale === "ar" ? "ar" : "en";
  const t = makeT(getDict(loc));
  const link = `${appUrl()}/s/${s.publicToken}`;
  const vars = { company: s.company.name, name: s.party.fullName, number: s.number, amount: formatAed(s.total, loc), link };
  const res = await notifyParty({
    companyId,
    party: s.party,
    statementId: s.id,
    message: { subject: t("notify.subject", vars), text: t("notify.body", vars) },
  });
  if (res.attempts.length) await setStatementStatus(companyId, userId, s.id, "SENT");
  return res;
}

export async function sendStatement(f: FormData) {
  const { companyId, user } = await requireCompany();
  const id = String(f.get("id"));
  const res = await sendOne(companyId, user.id, id);
  revalidatePath("/statements");
  redirect(`${String(f.get("back") ?? `/statements/${id}`)}${res.delivered ? "?sent=1" : "?nocontact=1"}`);
}

export async function sendAllIssued() {
  const { companyId, user } = await requireCompany();
  const issued = await prisma.statement.findMany({ where: { companyId, status: "ISSUED" }, select: { id: true } });
  let n = 0;
  for (const s of issued) if ((await sendOne(companyId, user.id, s.id)).delivered) n++;
  revalidatePath("/statements");
  redirect(`/statements?sentAll=${n}`);
}
