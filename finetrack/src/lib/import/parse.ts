import Papa from "papaparse";
import ExcelJS from "exceljs";

export type RawRow = Record<string, unknown>;
export interface ParsedFile {
  headers: string[];
  rows: RawRow[];
}

export const MAX_IMPORT_ROWS = 50_000;

/** Parse a CSV or Excel (.xlsx) file into header-keyed rows. First non-empty row = headers. */
export async function parseFile(buffer: Buffer, fileName: string): Promise<ParsedFile> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return parseXlsx(buffer);
  if (lower.endsWith(".xls")) throw new Error("Legacy .xls is not supported: save the file as .xlsx or .csv");
  return parseCsv(buffer.toString("utf8").replace(/^﻿/, ""));
}

export function parseCsv(text: string): ParsedFile {
  const res = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = (res.meta.fields ?? []).filter(Boolean);
  if (res.data.length > MAX_IMPORT_ROWS) throw new Error(`Too many rows (max ${MAX_IMPORT_ROWS})`);
  return { headers, rows: res.data };
}

async function parseXlsx(buffer: Buffer): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  let headers: string[] = [];
  const rows: RawRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as unknown[]).slice(1).map(cellValue);
    if (!headers.length) {
      headers = values.map((v) => String(v ?? "").trim());
      return;
    }
    if (values.every((v) => v == null || v === "")) return;
    const obj: RawRow = {};
    headers.forEach((h, i) => h && (obj[h] = values[i] ?? ""));
    rows.push(obj);
  });
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Too many rows (max ${MAX_IMPORT_ROWS})`);
  return { headers: headers.filter(Boolean), rows };
}

function cellValue(v: unknown): unknown {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (v instanceof Date) {
      // ExcelJS returns wall-clock values as if they were UTC: keep them as a naive string
      // so they are interpreted in Dubai time downstream.
      return v.toISOString().slice(0, 19).replace("T", " ");
    }
    if ("result" in o) return cellValue(o.result);
    if ("text" in o) return o.text;
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
  }
  return v;
}
