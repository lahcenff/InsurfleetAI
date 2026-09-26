"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { DisputeStatus } from "@prisma/client";
import { requireCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, getStorage } from "@/lib/storage";

const backTo = (f: FormData, fallback: string) => {
  const b = String(f.get("back") ?? fallback);
  return b.startsWith("/") ? b : fallback;
};

export async function writeOffOffenses(f: FormData) {
  const { companyId, user } = await requireCompany();
  const ids = f.getAll("ids").map(String);
  await prisma.$transaction(async (tx) => {
    const rows = await tx.offense.findMany({ where: { companyId, id: { in: ids }, billingStatus: "UNBILLED" } });
    await tx.offense.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { billingStatus: "WRITTEN_OFF" } });
    for (const r of rows) {
      await audit(tx, { companyId, actorId: user.id, action: "offense.write_off", entityType: "Offense", entityId: r.id, before: { billingStatus: r.billingStatus }, after: { billingStatus: "WRITTEN_OFF" } });
    }
  });
  revalidatePath("/", "layout");
  redirect(backTo(f, "/offenses"));
}

export async function createDispute(f: FormData) {
  const { companyId, user, db } = await requireCompany();
  const offenseId = String(f.get("offenseId"));
  const reason = String(f.get("reason") ?? "").trim() || "—";
  const offense = await db.offense.findFirstOrThrow({ where: { id: offenseId } });
  const d = await prisma.$transaction(async (tx) => {
    const d = await tx.dispute.upsert({
      where: { offenseId: offense.id },
      update: { reason, status: "TO_DISPUTE" },
      create: { companyId, offenseId: offense.id, reason, createdById: user.id },
    });
    await audit(tx, { companyId, actorId: user.id, action: "dispute.create", entityType: "Dispute", entityId: d.id, after: { offenseId, reason } });
    return d;
  });
  revalidatePath("/disputes");
  redirect(`/disputes?open=${d.id}`);
}

export async function updateDispute(f: FormData) {
  const { companyId, user, db } = await requireCompany();
  const id = String(f.get("id"));
  const status = String(f.get("status")) as DisputeStatus;
  const notes = String(f.get("notes") ?? "");
  const before = await db.dispute.findFirstOrThrow({ where: { id }, include: { offense: true } });
  await prisma.$transaction(async (tx) => {
    await tx.dispute.update({
      where: { id },
      data: {
        status,
        notes,
        submittedAt: status === "SUBMITTED" && !before.submittedAt ? new Date() : undefined,
        resolvedAt: ["ACCEPTED", "REJECTED", "WITHDRAWN"].includes(status) ? new Date() : null,
      },
    });
    // A dispute won with the authority cancels the fine: nothing left to recover.
    if (status === "ACCEPTED" && before.offense.billingStatus === "UNBILLED") {
      await tx.offense.update({ where: { id: before.offenseId }, data: { billingStatus: "WRITTEN_OFF" } });
    }
    await audit(tx, { companyId, actorId: user.id, action: "dispute.update", entityType: "Dispute", entityId: id, before: { status: before.status, notes: before.notes }, after: { status, notes } });
  });
  revalidatePath("/disputes");
  redirect(`/disputes?open=${id}&ok=1`);
}

export async function uploadAttachment(f: FormData) {
  const { companyId, user, db } = await requireCompany();
  const disputeId = String(f.get("disputeId"));
  const file = f.get("file");
  await db.dispute.findFirstOrThrow({ where: { id: disputeId } });
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_ATTACHMENT_BYTES || !ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    redirect(`/disputes?open=${disputeId}&error=file`);
  }
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
  const key = `${companyId}/disputes/${disputeId}/${Date.now()}-${safeName}`;
  await getStorage().put(key, Buffer.from(await file.arrayBuffer()), file.type);
  await prisma.$transaction(async (tx) => {
    const a = await tx.attachment.create({
      data: { companyId, disputeId, fileName: file.name, mimeType: file.type, sizeBytes: file.size, storageKey: key, uploadedById: user.id },
    });
    await audit(tx, { companyId, actorId: user.id, action: "dispute.attachment", entityType: "Dispute", entityId: disputeId, after: { attachmentId: a.id, fileName: file.name } });
  });
  revalidatePath("/disputes");
  redirect(`/disputes?open=${disputeId}&ok=1`);
}
