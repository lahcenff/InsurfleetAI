// Pure row normalisation: raw file row + column mapping → typed record or errors.
import type { Emirate, ImportEntity } from "@prisma/client";
import { FIELD_DEFS, type ColumnMap, type FieldDef } from "./fields";
import { parseDubaiDateTime } from "../time";
import { toFils } from "../money";
import { normalizePlateCode, normalizePlateNumber, parseEmirate, parseRawPlate } from "../plate";
import type { RawRow } from "./parse";

export interface RowError {
  row: number; // 1-based data row (header excluded)
  field: string;
  message: string;
}

export type NormalizedValue = string | number | Date | null;
export type NormalizedRecord = Record<string, NormalizedValue>;

export interface NormalizeOptions {
  dateFormat?: string;
  defaults?: Record<string, string>;
}

function readCell(row: RawRow, source: string | string[] | undefined): string {
  if (!source) return "";
  const cols = Array.isArray(source) ? source : [source];
  return cols
    .map((c) => row[c])
    .filter((v) => v != null && String(v).trim() !== "")
    .map((v) => String(v).trim())
    .join(" ");
}

export function normalizeRow(
  entity: ImportEntity,
  row: RawRow,
  map: ColumnMap,
  rowNumber: number,
  opts: NormalizeOptions = {},
): { record: NormalizedRecord | null; errors: RowError[] } {
  const errors: RowError[] = [];
  const out: NormalizedRecord = {};
  const fields = FIELD_DEFS[entity];

  for (const f of fields) {
    let raw = readCell(row, map[f.key]);
    if (!raw && opts.defaults?.[f.key]) raw = opts.defaults[f.key];
    if (!raw) {
      out[f.key] = null;
      if (f.required) errors.push({ row: rowNumber, field: f.key, message: "required" });
      continue;
    }
    const v = convert(f, raw, opts.dateFormat);
    if (v instanceof Error) errors.push({ row: rowNumber, field: f.key, message: v.message });
    else out[f.key] = v;
  }

  // Plate: split fields win; fall back to the free-text plate column.
  if ("plateNumber" in out || "rawPlate" in out) {
    const parsed = out.rawPlate ? parseRawPlate(String(out.rawPlate)) : null;
    const number = out.plateNumber ? normalizePlateNumber(out.plateNumber) : parsed?.number ?? "";
    out.plateNumber = number || null;
    out.plateCode = out.plateCode != null ? normalizePlateCode(out.plateCode) : parsed?.code ?? null;
    out.emirate = (out.emirate as Emirate | null) ?? parsed?.emirate ?? null;
    if (!number) errors.push({ row: rowNumber, field: "plateNumber", message: "required" });
  }

  for (const f of fields) {
    if (f.requiredOneOf && f.requiredOneOf[0] === f.key && !f.requiredOneOf.some((k) => out[k])) {
      if (!errors.some((e) => e.field === "plateNumber")) {
        errors.push({ row: rowNumber, field: f.requiredOneOf.join("|"), message: "required" });
      }
    }
  }

  if (entity === "ASSIGNMENT" && out.startsAt && out.endsAt && (out.endsAt as Date) <= (out.startsAt as Date)) {
    errors.push({ row: rowNumber, field: "endsAt", message: "end must be after start" });
  }
  if (entity === "OFFENSE" && typeof out.amount === "number" && out.amount < 0) {
    errors.push({ row: rowNumber, field: "amount", message: "negative amount" });
  }
  if (entity === "VEHICLE" && !out.emirate) {
    errors.push({ row: rowNumber, field: "emirate", message: "required" });
  }

  return { record: errors.length ? null : out, errors };
}

function convert(f: FieldDef, raw: string, dateFormat = "auto"): NormalizedValue | Error {
  switch (f.type) {
    case "string":
    case "plate":
      return raw;
    case "int": {
      const n = Number(raw.replace(/,/g, ""));
      return Number.isInteger(n) ? n : new Error("not an integer");
    }
    case "money":
      try {
        return toFils(raw); // fils
      } catch {
        return new Error("invalid amount");
      }
    case "datetime":
    case "date": {
      const d = parseDubaiDateTime(raw, dateFormat);
      return d ?? new Error(`invalid date "${raw}" (expected ${dateFormat})`);
    }
    case "emirate":
      return parseEmirate(raw) ?? new Error(`unknown emirate "${raw}"`);
    case "enum": {
      const v = raw.toUpperCase().replace(/[\s-]+/g, "_");
      const hit = f.options?.find((o) => o === v || o.startsWith(v));
      return hit ?? new Error(`expected one of ${f.options?.join(", ")}`);
    }
  }
}

export function normalizeRows(entity: ImportEntity, rows: RawRow[], map: ColumnMap, opts: NormalizeOptions = {}) {
  const records: { rowNumber: number; record: NormalizedRecord }[] = [];
  const errors: RowError[] = [];
  rows.forEach((row, i) => {
    const r = normalizeRow(entity, row, map, i + 1, opts);
    if (r.record) records.push({ rowNumber: i + 1, record: r.record });
    errors.push(...r.errors);
  });
  return { records, errors };
}
