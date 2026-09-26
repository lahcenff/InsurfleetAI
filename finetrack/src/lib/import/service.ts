import { createHash } from "node:crypto";
import type { ImportEntity, OffenseSource, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { audit } from "../audit";
import { filsToDecimalString } from "../money";
import { plateKey } from "../plate";
import { runMatching } from "../matching/service";
import type { ColumnMap } from "./fields";
import { normalizeRows, type NormalizedRecord, type RowError } from "./normalize";
import type { RawRow } from "./parse";

export interface ImportRequest {
  companyId: string;
  userId: string | null;
  entity: ImportEntity;
  source?: OffenseSource | null;
  fileName?: string;
  fileBuffer?: Buffer;
  rows: RawRow[];
  columnMap: ColumnMap;
  dateFormat?: string;
  defaults?: Record<string, string>;
  mappingId?: string | null;
  channel?: "FILE" | "API";
  connectorId?: string;
}

export interface ImportSummary {
  batchId: string;
  totalRows: number;
  inserted: number;
  duplicates: number;
  failed: number;
  errors: RowError[];
  matching?: { processed: number; ASSIGNED: number; TO_REVIEW: number; UNASSIGNED: number };
  sameFileImportedAt?: Date;
}

/** Single ingestion pipeline for files today and API connectors later. */
export async function runImport(req: ImportRequest): Promise<ImportSummary> {
  const fileHash = req.fileBuffer ? createHash("sha256").update(req.fileBuffer).digest("hex") : null;
  const previous = fileHash
    ? await prisma.importBatch.findFirst({ where: { companyId: req.companyId, fileHash, status: "COMPLETED" } })
    : null;

  const batch = await prisma.importBatch.create({
    data: {
      companyId: req.companyId,
      entity: req.entity,
      channel: req.channel ?? "FILE",
      source: req.source ?? null,
      mappingId: req.mappingId ?? null,
      connectorId: req.connectorId ?? null,
      fileName: req.fileName,
      fileHash,
      createdById: req.userId,
      status: "PROCESSING",
      totalRows: req.rows.length,
    },
  });

  const { records, errors } = normalizeRows(req.entity, req.rows, req.columnMap, {
    dateFormat: req.dateFormat,
    defaults: req.defaults,
  });

  let inserted = 0;
  let duplicates = 0;
  let matching: ImportSummary["matching"];
  try {
    const ctx = { companyId: req.companyId, batchId: batch.id, errors };
    switch (req.entity) {
      case "VEHICLE":
        ({ inserted, duplicates } = await importVehicles(ctx, records));
        break;
      case "PARTY":
        ({ inserted, duplicates } = await importParties(ctx, records));
        break;
      case "ASSIGNMENT":
        ({ inserted, duplicates } = await importAssignments(ctx, records));
        break;
      case "OFFENSE": {
        const r = await importOffenses(ctx, records, req.source ?? "OTHER", req.rows);
        inserted = r.inserted;
        duplicates = r.duplicates;
        if (r.newIds.length) matching = await runMatching(req.companyId, { offenseIds: r.newIds });
        break;
      }
    }
    // New assignments can resolve offenses that were waiting for history.
    if (req.entity === "ASSIGNMENT" || req.entity === "VEHICLE") {
      if (inserted > 0) matching = await runMatching(req.companyId);
    }
  } catch (e) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: "FAILED", finishedAt: new Date(), errors: [{ row: 0, field: "", message: String(e) }] },
    });
    throw e;
  }

  const failed = new Set(errors.map((e) => e.row)).size;
  await prisma.$transaction(async (tx) => {
    await tx.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "COMPLETED",
        inserted,
        duplicates,
        failed,
        errors: errors.slice(0, 500) as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
    await audit(tx, {
      companyId: req.companyId,
      actorId: req.userId,
      action: "import.completed",
      entityType: "ImportBatch",
      entityId: batch.id,
      after: { entity: req.entity, source: req.source, fileName: req.fileName, inserted, duplicates, failed },
    });
  });

  return {
    batchId: batch.id,
    totalRows: req.rows.length,
    inserted,
    duplicates,
    failed,
    errors,
    matching,
    sameFileImportedAt: previous?.createdAt,
  };
}

interface Ctx {
  companyId: string;
  batchId: string;
  errors: RowError[];
}
type Rec = { rowNumber: number; record: NormalizedRecord };
const str = (v: unknown) => (v == null || v === "" ? null : String(v));

async function importVehicles(ctx: Ctx, records: Rec[]) {
  const existing = new Set(
    (await prisma.vehicle.findMany({ where: { companyId: ctx.companyId }, select: { plateKey: true } })).map((v) => v.plateKey),
  );
  const data: Prisma.VehicleCreateManyInput[] = [];
  let duplicates = 0;
  for (const { record: r } of records) {
    const key = plateKey(r.emirate as never, r.plateCode, r.plateNumber);
    if (existing.has(key)) {
      duplicates++;
      continue;
    }
    existing.add(key);
    data.push({
      companyId: ctx.companyId,
      emirate: r.emirate as never,
      plateCode: str(r.plateCode) ?? "",
      plateNumber: String(r.plateNumber),
      plateKey: key,
      make: str(r.make),
      model: str(r.model),
      year: (r.year as number) ?? null,
      status: (r.status as never) ?? "ACTIVE",
      externalId: str(r.externalId),
    });
  }
  const res = await prisma.vehicle.createMany({ data });
  return { inserted: res.count, duplicates };
}

async function importParties(ctx: Ctx, records: Rec[]) {
  const existing = await prisma.party.findMany({
    where: { companyId: ctx.companyId },
    select: { licenseNumber: true, externalId: true, fullName: true },
  });
  const seen = new Set(existing.flatMap((p) => [p.licenseNumber && `L:${p.licenseNumber}`, p.externalId && `X:${p.externalId}`].filter(Boolean) as string[]));
  const data: Prisma.PartyCreateManyInput[] = [];
  let duplicates = 0;
  for (const { record: r } of records) {
    const keys = [r.licenseNumber && `L:${r.licenseNumber}`, r.externalId && `X:${r.externalId}`].filter(Boolean) as string[];
    if (keys.some((k) => seen.has(k))) {
      duplicates++;
      continue;
    }
    keys.forEach((k) => seen.add(k));
    data.push({
      companyId: ctx.companyId,
      type: (r.type as never) ?? "DRIVER",
      fullName: String(r.fullName),
      companyName: str(r.companyName),
      whatsappPhone: normalizePhone(str(r.whatsappPhone)),
      email: str(r.email)?.toLowerCase() ?? null,
      licenseNumber: str(r.licenseNumber),
      licenseExpiry: (r.licenseExpiry as Date) ?? null,
      emiratesId: str(r.emiratesId),
      externalId: str(r.externalId),
    });
  }
  const res = await prisma.party.createMany({ data });
  return { inserted: res.count, duplicates };
}

/** UAE numbers: 050 123 4567 → +971501234567. */
export function normalizePhone(v: string | null): string | null {
  if (!v) return null;
  let d = v.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("0")) d = "+971" + d.slice(1);
  if (!d.startsWith("+")) d = d.startsWith("971") ? "+" + d : "+971" + d;
  return d;
}

async function importAssignments(ctx: Ctx, records: Rec[]) {
  const [vehicles, parties, existing] = await Promise.all([
    prisma.vehicle.findMany({ where: { companyId: ctx.companyId }, select: { id: true, emirate: true, plateCode: true, plateNumber: true, plateKey: true } }),
    prisma.party.findMany({ where: { companyId: ctx.companyId }, select: { id: true, fullName: true, licenseNumber: true, externalId: true } }),
    prisma.assignment.findMany({ where: { companyId: ctx.companyId }, select: { vehicleId: true, partyId: true, startsAt: true } }),
  ]);
  const byKey = new Map(vehicles.map((v) => [v.plateKey, v]));
  const byExt = new Map(parties.filter((p) => p.externalId).map((p) => [p.externalId!, p]));
  const byLic = new Map(parties.filter((p) => p.licenseNumber).map((p) => [p.licenseNumber!.toUpperCase(), p]));
  const byName = new Map<string, (typeof parties)[number][]>();
  for (const p of parties) {
    const k = p.fullName.trim().toLowerCase();
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  const seen = new Set(existing.map((a) => `${a.vehicleId}|${a.partyId}|${a.startsAt.getTime()}`));

  const data: Prisma.AssignmentCreateManyInput[] = [];
  let duplicates = 0;
  for (const { rowNumber, record: r } of records) {
    let vehicle = r.emirate ? byKey.get(plateKey(r.emirate as never, r.plateCode, r.plateNumber)) : undefined;
    if (!vehicle) {
      const candidates = vehicles.filter(
        (v) => v.plateNumber === r.plateNumber && (!r.emirate || v.emirate === r.emirate) && (!r.plateCode || v.plateCode === r.plateCode),
      );
      if (candidates.length === 1) vehicle = candidates[0];
    }
    if (!vehicle) {
      ctx.errors.push({ row: rowNumber, field: "plateNumber", message: "unknown vehicle" });
      continue;
    }
    const byNameHits = r.partyName ? byName.get(String(r.partyName).trim().toLowerCase()) ?? [] : [];
    const party =
      (r.partyExternalId && byExt.get(String(r.partyExternalId))) ||
      (r.partyLicense && byLic.get(String(r.partyLicense).toUpperCase())) ||
      (byNameHits.length === 1 ? byNameHits[0] : undefined);
    if (!party) {
      ctx.errors.push({ row: rowNumber, field: "party", message: byNameHits.length > 1 ? "several drivers/customers with this name" : "unknown driver/customer" });
      continue;
    }
    const startsAt = r.startsAt as Date;
    const key = `${vehicle.id}|${party.id}|${startsAt.getTime()}`;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    data.push({
      companyId: ctx.companyId,
      vehicleId: vehicle.id,
      partyId: party.id,
      startsAt,
      endsAt: (r.endsAt as Date) ?? null,
      kind: (r.kind as never) ?? "RENTAL_CONTRACT",
      reference: str(r.reference),
      channel: "FILE",
      importBatchId: ctx.batchId,
    });
  }
  const res = await prisma.assignment.createMany({ data });
  return { inserted: res.count, duplicates };
}

async function importOffenses(ctx: Ctx, records: Rec[], source: OffenseSource, rows: RawRow[]) {
  const refs = records.map((r) => String(r.record.externalRef));
  const existing = new Set(
    (
      await prisma.offense.findMany({
        where: { companyId: ctx.companyId, source, externalRef: { in: refs } },
        select: { externalRef: true },
      })
    ).map((o) => o.externalRef),
  );
  const defaultCategory = source === "SALIK" || source === "DARB" ? "TOLL" : source === "PARKING" ? "PARKING" : "FINE";
  const data: Prisma.OffenseCreateManyInput[] = [];
  let duplicates = 0;
  for (const { rowNumber, record: r } of records) {
    const ref = String(r.externalRef);
    if (existing.has(ref)) {
      duplicates++;
      continue;
    }
    existing.add(ref);
    data.push({
      companyId: ctx.companyId,
      source,
      category: (r.category as never) ?? defaultCategory,
      externalRef: ref,
      channel: "FILE",
      importBatchId: ctx.batchId,
      rawPlate: str(r.rawPlate) ?? [r.emirate, r.plateCode, r.plateNumber].filter(Boolean).join(" "),
      emirate: (r.emirate as never) ?? null,
      plateCode: str(r.plateCode),
      plateNumber: String(r.plateNumber),
      occurredAt: r.occurredAt as Date,
      location: str(r.location),
      description: str(r.description),
      amount: filsToDecimalString(r.amount as number),
      blackPoints: (r.blackPoints as number) ?? null,
      dueDate: (r.dueDate as Date) ?? null,
      rawData: rows[rowNumber - 1] as Prisma.InputJsonValue,
    });
  }
  const created = await prisma.offense.createManyAndReturn({ data, select: { id: true } });
  return { inserted: created.length, duplicates, newIds: created.map((c) => c.id) };
}
