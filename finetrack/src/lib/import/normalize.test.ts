import { describe, expect, it } from "vitest";
import { normalizeRow } from "./normalize";
import { autoMap, missingRequired } from "./fields";
import { BUILTIN_PRESETS } from "./presets";
import { parseCsv } from "./parse";

const salik = BUILTIN_PRESETS.find((p) => p.source === "SALIK")!;

describe("import normalisation", () => {
  it("normalises a Salik row with split date/time columns", () => {
    const row = {
      "Transaction ID": "SLK-001",
      "Trip Date": "15/03/2026",
      "Trip Time": "08:15:00",
      "Plate Source": "Dubai",
      "Plate Category": "a",
      "Plate Number": "012345",
      "Toll Gate": "Al Barsha",
      Direction: "Northbound",
      "Amount (AED)": "6.00",
    };
    const { record, errors } = normalizeRow("OFFENSE", row, salik.columnMap, 1, { dateFormat: salik.dateFormat, defaults: salik.defaults });
    expect(errors).toEqual([]);
    expect(record).toMatchObject({
      externalRef: "SLK-001",
      emirate: "DXB",
      plateCode: "A",
      plateNumber: "12345",
      amount: 600,
      category: "TOLL",
    });
    expect((record!.occurredAt as Date).toISOString()).toBe("2026-03-15T04:15:00.000Z");
  });

  it("falls back to a free-text plate column", () => {
    const { record } = normalizeRow(
      "OFFENSE",
      { Ref: "D1", Plate: "Abu Dhabi 5 777", Date: "2026-03-01 10:00", Amount: "4" },
      { externalRef: "Ref", rawPlate: "Plate", occurredAt: "Date", amount: "Amount" },
      1,
    );
    expect(record).toMatchObject({ emirate: "AUH", plateCode: "5", plateNumber: "777", amount: 400 });
  });

  it("reports row-level errors instead of throwing", () => {
    const { record, errors } = normalizeRow(
      "OFFENSE",
      { Ref: "", Plate: "", Date: "yesterday", Amount: "abc" },
      { externalRef: "Ref", rawPlate: "Plate", occurredAt: "Date", amount: "Amount" },
      7,
    );
    expect(record).toBeNull();
    expect(errors.map((e) => e.field).sort()).toEqual(["amount", "externalRef", "occurredAt", "plateNumber"]);
    expect(errors.every((e) => e.row === 7)).toBe(true);
  });

  it("rejects assignments ending before they start", () => {
    const { errors } = normalizeRow(
      "ASSIGNMENT",
      { Plate: "DXB A 1", Driver: "Ali", From: "2026-03-02 10:00", To: "2026-03-01 10:00" },
      { rawPlate: "Plate", partyName: "Driver", startsAt: "From", endsAt: "To" },
      1,
    );
    expect(errors).toEqual([{ row: 1, field: "endsAt", message: "end must be after start" }]);
  });

  it("auto-maps common headers and lists missing required fields", () => {
    const { headers } = parseCsv("Ticket Number,Plate Number,Plate Source,Violation Date,Fine Amount\n1,2,Dubai,01/01/2026,300\n");
    const map = autoMap("OFFENSE", headers);
    expect(map).toMatchObject({ externalRef: "Ticket Number", plateNumber: "Plate Number", emirate: "Plate Source", occurredAt: "Violation Date", amount: "Fine Amount" });
    expect(missingRequired("OFFENSE", map)).toEqual([]);
    expect(missingRequired("OFFENSE", {})).toEqual(["externalRef", "plateNumber|rawPlate", "occurredAt", "amount"]);
  });
});
