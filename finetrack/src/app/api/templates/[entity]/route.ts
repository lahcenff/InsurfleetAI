import Papa from "papaparse";
import type { ImportEntity } from "@prisma/client";
import { FIELD_DEFS } from "@/lib/import/fields";
import { getUser } from "@/lib/auth";

const SAMPLES: Record<ImportEntity, Record<string, string>> = {
  VEHICLE: { emirate: "Dubai", plateCode: "A", plateNumber: "12345", make: "Toyota", model: "Corolla", year: "2024", status: "ACTIVE", externalId: "UNIT-001" },
  PARTY: { type: "DRIVER", fullName: "Ahmed Khan", whatsappPhone: "+971501234567", email: "ahmed@example.com", licenseNumber: "DXB-1234567", licenseExpiry: "31/12/2027", externalId: "EMP-001" },
  ASSIGNMENT: { emirate: "Dubai", plateCode: "A", plateNumber: "12345", partyExternalId: "EMP-001", partyName: "Ahmed Khan", startsAt: "01/03/2026 08:00", endsAt: "15/03/2026 18:00", kind: "RENTAL_CONTRACT", reference: "RA-2026-0001" },
  OFFENSE: { externalRef: "RTA-99887766", emirate: "Dubai", plateCode: "A", plateNumber: "12345", occurredAt: "05/03/2026 14:32", amount: "600", location: "Sheikh Zayed Road", description: "Exceeding speed limit by 30 km/h", category: "FINE", blackPoints: "0" },
};

export async function GET(_req: Request, { params }: { params: Promise<{ entity: string }> }) {
  if (!(await getUser())) return new Response("Unauthorized", { status: 401 });
  const entity = (await params).entity.toUpperCase() as ImportEntity;
  const fields = FIELD_DEFS[entity];
  if (!fields) return new Response("Not found", { status: 404 });
  const cols = fields.filter((f) => f.key !== "rawPlate").map((f) => f.key);
  const csv = Papa.unparse({ fields: cols, data: [cols.map((c) => SAMPLES[entity][c] ?? "")] });
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="finetrack-${entity.toLowerCase()}-template.csv"` },
  });
}
