"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type AssignmentKind, type Emirate, type PartyType, type VehicleStatus } from "@prisma/client";
import { requireCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { plateKey, normalizePlateCode, normalizePlateNumber, EMIRATES } from "@/lib/plate";
import { parseDubaiDateTime } from "@/lib/time";
import { runMatching } from "@/lib/matching/service";
import { normalizePhone } from "@/lib/import/service";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return v == null || String(v).trim() === "" ? null : String(v).trim();
};
// <input type="datetime-local"> gives "2026-03-15T14:05", interpreted as Dubai time.
const dt = (f: FormData, k: string) => (s(f, k) ? parseDubaiDateTime(s(f, k)!.replace("T", " ")) : null);

export async function addVehicle(f: FormData) {
  const { companyId, user } = await requireCompany();
  const emirate = s(f, "emirate") as Emirate;
  const number = normalizePlateNumber(s(f, "plateNumber"));
  if (!EMIRATES.includes(emirate) || !number) redirect("/vehicles?error=plate");
  const code = normalizePlateCode(s(f, "plateCode"));
  try {
    await prisma.$transaction(async (tx) => {
      const v = await tx.vehicle.create({
        data: {
          companyId, emirate, plateCode: code, plateNumber: number, plateKey: plateKey(emirate, code, number),
          make: s(f, "make"), model: s(f, "model"), year: s(f, "year") ? Number(s(f, "year")) : null,
          status: (s(f, "status") as VehicleStatus) ?? "ACTIVE",
        },
      });
      await audit(tx, { companyId, actorId: user.id, action: "vehicle.create", entityType: "Vehicle", entityId: v.id, after: v });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") redirect("/vehicles?error=exists");
    throw e;
  }
  await runMatching(companyId); // offenses on this plate may now resolve
  revalidatePath("/vehicles");
  redirect("/vehicles?ok=1");
}

export async function setVehicleStatus(f: FormData) {
  const { companyId, user, db } = await requireCompany();
  const id = s(f, "id")!;
  const status = s(f, "status") as VehicleStatus;
  const before = await db.vehicle.findFirstOrThrow({ where: { id } });
  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: before.id }, data: { status } });
    await audit(tx, { companyId, actorId: user.id, action: "vehicle.status", entityType: "Vehicle", entityId: id, before: { status: before.status }, after: { status } });
  });
  revalidatePath("/vehicles");
}

export async function saveParty(f: FormData) {
  const { companyId, user, db } = await requireCompany();
  const id = s(f, "id");
  const data = {
    type: (s(f, "type") as PartyType) ?? "DRIVER",
    fullName: s(f, "fullName") ?? "",
    companyName: s(f, "companyName"),
    whatsappPhone: normalizePhone(s(f, "whatsappPhone")),
    email: s(f, "email")?.toLowerCase() ?? null,
    licenseNumber: s(f, "licenseNumber"),
    licenseExpiry: s(f, "licenseExpiry") ? new Date(`${s(f, "licenseExpiry")}T00:00:00Z`) : null,
    preferredLocale: s(f, "preferredLocale") === "ar" ? "ar" : "en",
  };
  if (!data.fullName) redirect("/parties?error=name");
  await prisma.$transaction(async (tx) => {
    if (id) {
      const before = await db.party.findFirstOrThrow({ where: { id } });
      await tx.party.update({ where: { id: before.id }, data });
      await audit(tx, { companyId, actorId: user.id, action: "party.update", entityType: "Party", entityId: id, before, after: data });
    } else {
      const p = await tx.party.create({ data: { ...data, companyId } });
      await audit(tx, { companyId, actorId: user.id, action: "party.create", entityType: "Party", entityId: p.id, after: data });
    }
  });
  revalidatePath("/parties");
  redirect("/parties?ok=1");
}

export async function saveAssignment(f: FormData) {
  const { companyId, user, db } = await requireCompany();
  const id = s(f, "id");
  const back = s(f, "back") ?? "/assignments";
  const startsAt = dt(f, "startsAt");
  const endsAt = dt(f, "endsAt");
  if (!startsAt || (endsAt && endsAt <= startsAt)) redirect(`${back}${back.includes("?") ? "&" : "?"}error=dates`);
  const vehicle = await db.vehicle.findFirstOrThrow({ where: { id: s(f, "vehicleId")! } });
  const party = await db.party.findFirstOrThrow({ where: { id: s(f, "partyId")! } });
  const data = {
    vehicleId: vehicle.id,
    partyId: party.id,
    startsAt,
    endsAt,
    kind: (s(f, "kind") as AssignmentKind) ?? "RENTAL_CONTRACT",
    reference: s(f, "reference"),
  };
  await prisma.$transaction(async (tx) => {
    if (id) {
      const before = await db.assignment.findFirstOrThrow({ where: { id } });
      await tx.assignment.update({ where: { id: before.id }, data });
      await audit(tx, { companyId, actorId: user.id, action: "assignment.update", entityType: "Assignment", entityId: id, before, after: data });
    } else {
      const a = await tx.assignment.create({ data: { ...data, companyId, channel: "MANUAL" } });
      await audit(tx, { companyId, actorId: user.id, action: "assignment.create", entityType: "Assignment", entityId: a.id, after: data });
    }
  });
  const r = await runMatching(companyId);
  revalidatePath("/assignments");
  redirect(`/assignments?ok=${r.processed}`);
}

export async function endAssignmentNow(f: FormData) {
  const { companyId, user, db } = await requireCompany();
  const id = s(f, "id")!;
  const before = await db.assignment.findFirstOrThrow({ where: { id } });
  const endsAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({ where: { id }, data: { endsAt } });
    await audit(tx, { companyId, actorId: user.id, action: "assignment.end", entityType: "Assignment", entityId: id, before: { endsAt: before.endsAt }, after: { endsAt } });
  });
  await runMatching(companyId);
  revalidatePath("/assignments");
}

export async function deleteAssignment(f: FormData) {
  const { companyId, user, db } = await requireCompany();
  const id = s(f, "id")!;
  const before = await db.assignment.findFirstOrThrow({ where: { id } });
  await prisma.$transaction(async (tx) => {
    // Billed offenses keep their party; only the link to the deleted record goes.
    await tx.assignment.delete({ where: { id } });
    await audit(tx, { companyId, actorId: user.id, action: "assignment.delete", entityType: "Assignment", entityId: id, before });
  });
  const r = await runMatching(companyId);
  revalidatePath("/assignments");
  redirect(`/assignments?ok=${r.processed}`);
}
