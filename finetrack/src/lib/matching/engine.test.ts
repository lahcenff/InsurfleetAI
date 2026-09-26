import { describe, expect, it } from "vitest";
import { MatchIndex, matchOffense, type MatchAssignment, type MatchVehicle } from "./engine";
import { dubaiToUtc } from "../time";

// Dubai wall-clock helper: at(15, 9, 30) = 15th of March 2026, 09:30 Dubai time.
const at = (day: number, h = 0, m = 0) => dubaiToUtc(2026, 3, day, h, m);

const vehicles: MatchVehicle[] = [
  { id: "v1", emirate: "DXB", plateCode: "A", plateNumber: "12345" },
  { id: "v2", emirate: "DXB", plateCode: "B", plateNumber: "12345" }, // same number, other code
  { id: "v3", emirate: "AUH", plateCode: "5", plateNumber: "777" },
  { id: "v4", emirate: "SHJ", plateCode: "1", plateNumber: "4040" }, // never assigned
];

const a = (id: string, vehicleId: string, partyId: string, startsAt: Date, endsAt: Date | null): MatchAssignment => ({
  id, vehicleId, partyId, startsAt, endsAt,
});

const assignments: MatchAssignment[] = [
  // v1: Ahmed 1st→10th, gap, Sara 12th→20th, then John & Priya overlap 20th→25th/28th
  a("a1", "v1", "ahmed", at(1, 8), at(10, 8)),
  a("a2", "v1", "sara", at(12, 8), at(20, 8)),
  a("a3", "v1", "john", at(20, 8), at(28, 8)),
  a("a4", "v1", "priya", at(22, 8), at(25, 8)),
  // v2: open-ended rental
  a("a5", "v2", "fatima", at(5, 10), null),
  // v3: duplicate records for the same driver (same contract imported twice)
  a("a6", "v3", "omar", at(1), at(15)),
  a("a7", "v3", "omar", at(1), at(15)),
];

const index = new MatchIndex(vehicles, assignments);
const offense = (plate: Partial<{ emirate: "DXB" | "AUH" | "SHJ" | null; plateCode: string | null; plateNumber: string }>, occurredAt: Date) => ({
  emirate: "DXB" as const,
  plateCode: "A",
  plateNumber: "12345",
  ...plate,
  occurredAt,
});

describe("matchOffense — single match", () => {
  it("assigns the only covering assignment", () => {
    const r = matchOffense(offense({}, at(5, 14)), index);
    expect(r).toMatchObject({ status: "ASSIGNED", reason: "SINGLE_MATCH", vehicleId: "v1", partyId: "ahmed", assignmentId: "a1" });
  });

  it("treats the start as inclusive and the end as exclusive", () => {
    expect(matchOffense(offense({}, at(1, 8)), index, { graceMinutes: 0 }).partyId).toBe("ahmed");
    // Exactly at Ahmed's end: no longer covered, and Sara starts two days later → gap
    const atEnd = matchOffense(offense({}, at(10, 8)), index, { graceMinutes: 0 });
    expect(atEnd.status).toBe("TO_REVIEW");
    expect(atEnd.reason).toBe("GAP");
  });

  it("matches an open-ended (ongoing) assignment", () => {
    const r = matchOffense(offense({ plateCode: "B" }, at(31, 23, 59)), index);
    expect(r).toMatchObject({ status: "ASSIGNED", partyId: "fatima", vehicleId: "v2" });
  });

  it("is not ambiguous when overlapping records belong to the same party", () => {
    const r = matchOffense(offense({ emirate: "AUH", plateCode: "5", plateNumber: "777" }, at(7)), index);
    expect(r).toMatchObject({ status: "ASSIGNED", partyId: "omar" });
  });

  it("normalises plate input (leading zeros, lowercase code, spaces)", () => {
    const r = matchOffense(offense({ plateCode: " a ", plateNumber: "012345" }, at(5, 14)), index);
    expect(r.partyId).toBe("ahmed");
  });
});

describe("matchOffense — overlapping assignments", () => {
  it("sends the offense to review with every covering assignment as candidate", () => {
    const r = matchOffense(offense({}, at(23, 12)), index);
    expect(r.status).toBe("TO_REVIEW");
    expect(r.reason).toBe("OVERLAP");
    expect(r.partyId).toBeNull();
    expect(r.vehicleId).toBe("v1");
    expect(r.candidateAssignmentIds.sort()).toEqual(["a3", "a4"]);
  });

  it("assigns again once the overlap is over", () => {
    const r = matchOffense(offense({}, at(26, 12)), index);
    expect(r).toMatchObject({ status: "ASSIGNED", partyId: "john" });
  });
});

describe("matchOffense — offense outside any assignment", () => {
  it("flags a gap between two assignments for review, proposing both", () => {
    const r = matchOffense(offense({}, at(11, 12)), index);
    expect(r.status).toBe("TO_REVIEW");
    expect(r.reason).toBe("GAP");
    expect(r.candidateAssignmentIds).toEqual(["a1", "a2"]);
  });

  it("leaves an offense before the first assignment unassigned", () => {
    const r = matchOffense(offense({}, dubaiToUtc(2026, 2, 20, 12)), index);
    expect(r).toMatchObject({ status: "UNASSIGNED", reason: "NO_ASSIGNMENT", vehicleId: "v1", partyId: null });
  });

  it("leaves an offense after the last assignment unassigned", () => {
    const r = matchOffense(offense({}, dubaiToUtc(2026, 4, 2, 12)), index);
    expect(r).toMatchObject({ status: "UNASSIGNED", reason: "NO_ASSIGNMENT" });
  });

  it("leaves an offense on a vehicle with no history unassigned", () => {
    const r = matchOffense(offense({ emirate: "SHJ", plateCode: "1", plateNumber: "4040" }, at(5)), index);
    expect(r).toMatchObject({ status: "UNASSIGNED", reason: "NO_ASSIGNMENT", vehicleId: "v4" });
  });
});

describe("matchOffense — near a hand-over (grace window)", () => {
  it("reviews an offense a few minutes after a late return", () => {
    const r = matchOffense(offense({}, at(10, 8, 10)), index, { graceMinutes: 15 });
    expect(r).toMatchObject({ status: "TO_REVIEW", reason: "NEAR_BOUNDARY", candidateAssignmentIds: ["a1"] });
  });

  it("reviews an offense a few minutes before an early pick-up", () => {
    const r = matchOffense(offense({}, at(12, 7, 50)), index, { graceMinutes: 15 });
    expect(r).toMatchObject({ status: "TO_REVIEW", reason: "NEAR_BOUNDARY", candidateAssignmentIds: ["a2"] });
  });

  it("reviews an offense right after a back-to-back hand-over between two parties", () => {
    const r = matchOffense(offense({}, at(20, 8, 5)), index, { graceMinutes: 15 });
    expect(r.status).toBe("TO_REVIEW");
    expect(r.reason).toBe("NEAR_BOUNDARY");
    expect(r.candidateAssignmentIds).toEqual(["a3", "a2"]);
  });

  it("assigns directly when the grace window is disabled", () => {
    const r = matchOffense(offense({}, at(20, 8, 5)), index, { graceMinutes: 0 });
    expect(r).toMatchObject({ status: "ASSIGNED", partyId: "john" });
  });

  it("assigns directly outside the grace window", () => {
    const r = matchOffense(offense({}, at(20, 9)), index, { graceMinutes: 15 });
    expect(r).toMatchObject({ status: "ASSIGNED", partyId: "john" });
  });
});

describe("matchOffense — unknown or ambiguous plate", () => {
  it("leaves an unknown plate unassigned", () => {
    const r = matchOffense(offense({ plateNumber: "99999" }, at(5)), index);
    expect(r).toMatchObject({ status: "UNASSIGNED", reason: "UNKNOWN_PLATE", vehicleId: null });
  });

  it("does not match a known number registered in another emirate", () => {
    const r = matchOffense(offense({ emirate: "AUH" }, at(5)), index);
    expect(r.reason).toBe("UNKNOWN_PLATE");
  });

  it("does not match a known number with a different plate code", () => {
    const r = matchOffense(offense({ plateCode: "Z" }, at(5)), index);
    expect(r.reason).toBe("UNKNOWN_PLATE");
  });

  it("treats an empty plate number as unknown", () => {
    const r = matchOffense(offense({ plateNumber: "" }, at(5)), index);
    expect(r.reason).toBe("UNKNOWN_PLATE");
  });

  it("uses emirate + number when the export has no plate code and the vehicle is unique", () => {
    const r = matchOffense(offense({ emirate: "AUH", plateCode: null, plateNumber: "777" }, at(3)), index);
    expect(r).toMatchObject({ status: "ASSIGNED", partyId: "omar" });
  });

  it("reviews when the plate code is missing and several vehicles share the number", () => {
    const r = matchOffense(offense({ plateCode: null }, at(6, 12)), index);
    expect(r.status).toBe("TO_REVIEW");
    expect(r.reason).toBe("AMBIGUOUS_PLATE");
    // Ahmed had DXB A 12345 and Fatima had DXB B 12345 at that time
    expect(r.candidateAssignmentIds.sort()).toEqual(["a1", "a5"]);
  });

  it("matches on number + code when the emirate is missing", () => {
    const r = matchOffense(offense({ emirate: null, plateCode: "B" }, at(6)), index);
    expect(r).toMatchObject({ status: "ASSIGNED", partyId: "fatima" });
  });
});

describe("timezone", () => {
  it("interprets hand-over boundaries in Asia/Dubai time, not UTC", () => {
    // 2026-03-10 07:59 Dubai = 03:59 UTC, still within Ahmed's rental (ends 08:00 Dubai)
    const r = matchOffense(offense({}, new Date("2026-03-10T03:59:00Z")), index, { graceMinutes: 0 });
    expect(r.partyId).toBe("ahmed");
    // 08:00 Dubai = 04:00 UTC: rental is over
    const r2 = matchOffense(offense({}, new Date("2026-03-10T04:00:00Z")), index, { graceMinutes: 0 });
    expect(r2.partyId).toBeNull();
  });
});
