"use server";
import type { ImportEntity, OffenseSource, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseFile } from "@/lib/import/parse";
import { autoMap, missingRequired, type ColumnMap } from "@/lib/import/fields";
import { BUILTIN_PRESETS } from "@/lib/import/presets";
import { runImport, type ImportSummary } from "@/lib/import/service";

const ENTITIES: ImportEntity[] = ["VEHICLE", "PARTY", "ASSIGNMENT", "OFFENSE"];
const SOURCES: OffenseSource[] = ["SALIK", "DARB", "RTA", "POLICE", "PARKING", "OTHER"];

export interface AnalyzeResult {
  ok: boolean;
  error?: string;
  headers: string[];
  preview: Record<string, string>[];
  total: number;
  columnMap: ColumnMap;
  dateFormat: string;
  defaults: Record<string, string>;
}

async function readUpload(f: FormData) {
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("No file");
  if (file.size > 15 * 1024 * 1024) throw new Error("File too large (max 15 MB)");
  const buffer = Buffer.from(await file.arrayBuffer());
  return { file, buffer, parsed: await parseFile(buffer, file.name) };
}

/** Step 1: read headers + preview, and propose a mapping (saved, built-in preset or auto). */
export async function analyzeImport(f: FormData): Promise<AnalyzeResult> {
  const { companyId, db } = await requireCompany();
  const entity = f.get("entity") as ImportEntity;
  const mappingRef = String(f.get("mapping") ?? "");
  try {
    if (!ENTITIES.includes(entity)) throw new Error("Invalid data type");
    const { parsed } = await readUpload(f);
    let columnMap = autoMap(entity, parsed.headers);
    let dateFormat = "auto";
    let defaults: Record<string, string> = {};
    if (mappingRef.startsWith("saved:")) {
      const m = await db.importMapping.findFirst({ where: { id: mappingRef.slice(6), companyId } });
      if (m) ({ columnMap, dateFormat, defaults } = { columnMap: m.columnMap as ColumnMap, dateFormat: m.dateFormat, defaults: (m.defaults ?? {}) as Record<string, string> });
    } else if (mappingRef.startsWith("preset:")) {
      const p = BUILTIN_PRESETS[Number(mappingRef.slice(7))];
      if (p) ({ columnMap, dateFormat, defaults } = { columnMap: p.columnMap, dateFormat: p.dateFormat, defaults: p.defaults });
    }
    // Drop mapped columns that are not in this file (portal versions differ).
    const has = (h: string) => parsed.headers.includes(h);
    const auto = autoMap(entity, parsed.headers);
    for (const [k, v] of Object.entries(columnMap)) {
      const cols = (Array.isArray(v) ? v : [v]).filter(has);
      if (cols.length) columnMap[k] = cols.length === 1 ? cols[0] : cols;
      else if (auto[k]) columnMap[k] = auto[k];
      else delete columnMap[k];
    }
    return {
      ok: true,
      headers: parsed.headers,
      preview: parsed.rows.slice(0, 8).map((r) => Object.fromEntries(parsed.headers.map((h) => [h, String(r[h] ?? "")]))),
      total: parsed.rows.length,
      columnMap,
      dateFormat,
      defaults,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message, headers: [], preview: [], total: 0, columnMap: {}, dateFormat: "auto", defaults: {} };
  }
}

/** Step 2: run the import with the confirmed mapping; optionally save the mapping. */
export async function executeImport(f: FormData): Promise<{ ok: boolean; error?: string; summary?: ImportSummary }> {
  const { companyId, user, db } = await requireCompany();
  try {
    const entity = f.get("entity") as ImportEntity;
    if (!ENTITIES.includes(entity)) throw new Error("Invalid data type");
    const source = entity === "OFFENSE" ? (f.get("source") as OffenseSource) : null;
    if (entity === "OFFENSE" && !SOURCES.includes(source!)) throw new Error("Invalid source");
    const columnMap = JSON.parse(String(f.get("columnMap") ?? "{}")) as ColumnMap;
    const defaults = JSON.parse(String(f.get("defaults") ?? "{}")) as Record<string, string>;
    const dateFormat = String(f.get("dateFormat") ?? "auto") || "auto";
    const missing = missingRequired(entity, columnMap, defaults);
    if (missing.length) throw new Error(`Missing: ${missing.join(", ")}`);

    let mappingId: string | null = null;
    const saveAs = String(f.get("saveAs") ?? "").trim();
    if (saveAs) {
      const data = { entity, source, columnMap: columnMap as Prisma.InputJsonValue, dateFormat, defaults: defaults as Prisma.InputJsonValue };
      const m = await db.importMapping.upsert({
        where: { companyId_name: { companyId, name: saveAs } },
        update: data,
        create: { ...data, name: saveAs, companyId },
      });
      mappingId = m.id;
    }

    const { file, buffer, parsed } = await readUpload(f);
    const summary = await runImport({
      companyId, userId: user.id, entity, source, fileName: file.name, fileBuffer: buffer,
      rows: parsed.rows, columnMap, dateFormat, defaults, mappingId,
    });
    revalidatePath("/", "layout");
    return { ok: true, summary: { ...summary, errors: summary.errors.slice(0, 200) } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteMapping(id: string) {
  const { companyId } = await requireCompany();
  await prisma.importMapping.deleteMany({ where: { id, companyId } });
  revalidatePath("/import");
}
