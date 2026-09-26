import Papa from "papaparse";
import { prisma } from "../db";
import { formatPlate } from "../plate";
import { dubaiParts } from "../time";
import { filsToDecimalString, toFils } from "../money";

const dec = (v: unknown) => filsToDecimalString(toFils(v));

const isoDate = (d: Date | null) => {
  if (!d) return "";
  const p = dubaiParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

/**
 * Accounting export: one row per statement line, with the revenue split into the
 * recharged fine (pass-through, no VAT) and the admin fee (taxable). Column names
 * follow the common "invoice import" layout accepted by Zoho Books, QuickBooks and
 * Xero after column matching.
 */
export async function accountingCsv(companyId: string, from: Date, to: Date) {
  const statements = await prisma.statement.findMany({
    where: { companyId, status: { not: "VOID" }, issuedAt: { gte: from, lt: to } },
    include: { party: true, lines: { include: { offense: { include: { vehicle: true } } } } },
    orderBy: { number: "asc" },
  });
  const rows: Record<string, string>[] = [];
  for (const s of statements) {
    for (const l of s.lines) {
      const o = l.offense;
      const plate = o.vehicle ? formatPlate(o.vehicle.emirate, o.vehicle.plateCode, o.vehicle.plateNumber) : o.rawPlate;
      const base = {
        "Invoice Number": s.number,
        "Invoice Date": isoDate(s.issuedAt),
        "Customer Name": s.party.companyName ?? s.party.fullName,
        "Customer Email": s.party.email ?? "",
        "Customer ID": s.party.externalId ?? s.party.id,
        Currency: "AED",
        Status: s.status,
      };
      rows.push({
        ...base,
        "Item Name": `${o.source} ${o.category}`,
        Description: `${o.externalRef} | ${plate} | ${isoDate(o.occurredAt)}${o.location ? " | " + o.location : ""}`,
        Account: "Recharged fines & tolls",
        "Tax Name": "Out of scope",
        "Tax %": "0",
        Amount: dec(l.amount),
        "Tax Amount": "0.00",
      });
      if (Number(l.fee) > 0) {
        rows.push({
          ...base,
          "Item Name": "Admin fee",
          Description: `Admin fee ${o.externalRef}`,
          Account: "Admin fee income",
          "Tax Name": "VAT",
          "Tax %": String(Number(s.vatOnFeePercent)),
          Amount: dec(l.fee),
          "Tax Amount": dec(l.vat),
        });
      }
    }
  }
  return "﻿" + Papa.unparse(rows, { newline: "\r\n" });
}
