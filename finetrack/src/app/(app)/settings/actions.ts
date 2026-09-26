"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FeeType, Role } from "@prisma/client";
import { requireCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { runMatching } from "@/lib/matching/service";

const num = (v: FormDataEntryValue | null, min: number, max: number) => {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max) throw new Error("out of range");
  return n;
};

export async function saveSettings(f: FormData) {
  const { companyId, company, user } = await requireCompany("ADMIN");
  let data;
  try {
    data = {
      name: String(f.get("name") ?? company.name).trim() || company.name,
      trn: String(f.get("trn") ?? "").trim() || null,
      feeType: (f.get("feeType") === "PERCENT" ? "PERCENT" : "FIXED") as FeeType,
      feeValue: num(f.get("feeValue"), 0, 100000).toFixed(2),
      vatOnFeePercent: num(f.get("vat"), 0, 100).toFixed(2),
      statementPrefix: String(f.get("prefix") ?? "FT").replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "FT",
      matchGraceMinutes: Math.round(num(f.get("grace"), 0, 1440)),
      defaultLocale: f.get("defaultLocale") === "ar" ? "ar" : "en",
    };
  } catch {
    redirect("/settings?error=1");
  }
  await prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: companyId }, data });
    await audit(tx, {
      companyId, actorId: user.id, action: "company.settings", entityType: "Company", entityId: companyId,
      before: { feeType: company.feeType, feeValue: company.feeValue, vatOnFeePercent: company.vatOnFeePercent, matchGraceMinutes: company.matchGraceMinutes },
      after: data,
    });
  });
  if (data.matchGraceMinutes !== company.matchGraceMinutes) await runMatching(companyId);
  revalidatePath("/", "layout");
  redirect("/settings?ok=1");
}

export async function inviteMember(f: FormData) {
  const { companyId, user } = await requireCompany("ADMIN");
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const role = (f.get("role") === "ADMIN" ? "ADMIN" : "MANAGER") as Role;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/settings?error=email");
  await prisma.$transaction(async (tx) => {
    const u = await tx.user.upsert({ where: { email }, update: {}, create: { email } });
    await tx.membership.upsert({
      where: { userId_companyId: { userId: u.id, companyId } },
      update: { role },
      create: { userId: u.id, companyId, role },
    });
    await audit(tx, { companyId, actorId: user.id, action: "member.invite", entityType: "User", entityId: u.id, after: { email, role } });
  });
  revalidatePath("/settings");
  redirect("/settings?ok=1");
}

export async function removeMember(f: FormData) {
  const { companyId, user } = await requireCompany("ADMIN");
  const id = String(f.get("membershipId"));
  const m = await prisma.membership.findFirst({ where: { id, companyId } });
  if (!m || m.userId === user.id) redirect("/settings");
  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({ where: { id: m.id } });
    await audit(tx, { companyId, actorId: user.id, action: "member.remove", entityType: "User", entityId: m.userId, before: { role: m.role } });
  });
  revalidatePath("/settings");
  redirect("/settings?ok=1");
}
