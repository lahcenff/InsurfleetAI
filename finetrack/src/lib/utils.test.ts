import { describe, expect, it } from "vitest";
import { dubaiParts, dubaiToUtc, parseDubaiDateTime, dubaiMonthRange } from "./time";
import { parseEmirate, parseRawPlate, plateKey } from "./plate";
import { filsToDecimalString, toFils } from "./money";

describe("time (Asia/Dubai)", () => {
  it("converts Dubai wall-clock to UTC (+4h, no DST)", () => {
    expect(dubaiToUtc(2026, 7, 1, 10).toISOString()).toBe("2026-07-01T06:00:00.000Z");
    expect(dubaiToUtc(2026, 1, 1, 2).toISOString()).toBe("2025-12-31T22:00:00.000Z");
  });

  it("parses explicit formats", () => {
    expect(parseDubaiDateTime("15/03/2026 14:05:09", "dd/MM/yyyy HH:mm:ss")?.toISOString()).toBe("2026-03-15T10:05:09.000Z");
    expect(parseDubaiDateTime("03-15-2026 02:05 PM", "MM-dd-yyyy hh:mm a")?.toISOString()).toBe("2026-03-15T10:05:00.000Z");
    expect(parseDubaiDateTime("15-Mar-2026 14:05", "dd-MMM-yyyy HH:mm")?.toISOString()).toBe("2026-03-15T10:05:00.000Z");
    // seconds missing, date only
    expect(parseDubaiDateTime("15/03/2026 14:05", "dd/MM/yyyy HH:mm:ss")?.toISOString()).toBe("2026-03-15T10:05:00.000Z");
    expect(parseDubaiDateTime("15/03/2026", "dd/MM/yyyy HH:mm:ss")?.toISOString()).toBe("2026-03-14T20:00:00.000Z");
  });

  it("auto-detects ISO, dd/MM/yyyy and Excel serials", () => {
    expect(parseDubaiDateTime("2026-03-15T10:05:00Z")?.toISOString()).toBe("2026-03-15T10:05:00.000Z");
    expect(parseDubaiDateTime("2026-03-15 14:05")?.toISOString()).toBe("2026-03-15T10:05:00.000Z");
    expect(parseDubaiDateTime("15/03/2026 2:05 PM")?.toISOString()).toBe("2026-03-15T10:05:00.000Z");
    expect(parseDubaiDateTime(46096.5)?.toISOString()).toBe("2026-03-15T08:00:00.000Z");
  });

  it("rejects invalid dates", () => {
    expect(parseDubaiDateTime("32/13/2026", "dd/MM/yyyy")).toBeNull();
    expect(parseDubaiDateTime("not a date")).toBeNull();
    expect(parseDubaiDateTime("")).toBeNull();
  });

  it("computes Dubai calendar months", () => {
    const { start, end } = dubaiMonthRange(new Date("2026-02-28T21:00:00Z")); // 1 Mar 01:00 Dubai
    expect(start.toISOString()).toBe("2026-02-28T20:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-31T20:00:00.000Z");
    expect(dubaiParts(new Date("2026-02-28T21:00:00Z")).month).toBe(3);
  });
});

describe("plates", () => {
  it("recognises emirates in English, codes and Arabic", () => {
    expect(parseEmirate("Dubai")).toBe("DXB");
    expect(parseEmirate("ABU DHABI")).toBe("AUH");
    expect(parseEmirate("الشارقة")).toBe("SHJ");
    expect(parseEmirate("Mars")).toBeNull();
  });

  it("parses free-text plates", () => {
    expect(parseRawPlate("DXB A 12345")).toEqual({ emirate: "DXB", code: "A", number: "12345" });
    expect(parseRawPlate("Abu Dhabi/5/00777")).toEqual({ emirate: "AUH", code: "5", number: "777" });
    expect(parseRawPlate("12345-AA")).toEqual({ emirate: null, code: "AA", number: "12345" });
    expect(parseRawPlate("12345")).toEqual({ emirate: null, code: null, number: "12345" });
    expect(parseRawPlate("Sharjah 3 4040")).toEqual({ emirate: "SHJ", code: "3", number: "4040" });
  });

  it("builds a normalised key", () => {
    expect(plateKey("DXB", " a ", "012345")).toBe("DXB-A-12345");
  });
});

describe("money", () => {
  it("parses amounts into fils without float drift", () => {
    expect(toFils("1,250.50")).toBe(125050);
    expect(toFils("AED 4")).toBe(400);
    expect(toFils(0.1 + 0.2)).toBe(30);
    expect(toFils(1.005)).toBe(101);
    expect(() => toFils("abc")).toThrow();
  });

  it("formats fils as a 2-decimal string", () => {
    expect(filsToDecimalString(125050)).toBe("1250.50");
    expect(filsToDecimalString(5)).toBe("0.05");
    expect(filsToDecimalString(-150)).toBe("-1.50");
  });
});
