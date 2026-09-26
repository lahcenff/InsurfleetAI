// Pure matching engine: no database access, fully unit-tested.
//
// Given an offense (plate + timestamp) and the fleet's vehicles and assignment
// history, decide who is responsible:
//   ASSIGNED   — exactly one responsible party
//   TO_REVIEW  — several candidates, a gap in the history, a timestamp close to a
//                hand-over, or an ambiguous plate
//   UNASSIGNED — unknown plate, or no assignment around that time
//
// Assignment intervals are half-open: [startsAt, endsAt). endsAt = null = ongoing.

import type { Emirate, MatchReason, MatchStatus } from "@prisma/client";
import { normalizePlateCode, normalizePlateNumber, plateKey } from "../plate";

export interface MatchVehicle {
  id: string;
  emirate: Emirate;
  plateCode: string;
  plateNumber: string;
}

export interface MatchAssignment {
  id: string;
  vehicleId: string;
  partyId: string;
  startsAt: Date;
  endsAt: Date | null;
}

export interface MatchOffense {
  emirate: Emirate | null;
  plateCode: string | null;
  plateNumber: string;
  occurredAt: Date;
}

export interface MatchResult {
  status: MatchStatus;
  reason: MatchReason;
  vehicleId: string | null;
  partyId: string | null;
  assignmentId: string | null;
  /** Assignments the manager can pick from when status is TO_REVIEW. */
  candidateAssignmentIds: string[];
}

export interface MatchOptions {
  /** Offenses within this many minutes of a hand-over go to review. Default 15. */
  graceMinutes?: number;
}

/** Pre-indexed fleet data, built once per matching run. */
export class MatchIndex {
  private byKey = new Map<string, MatchVehicle>();
  private byEmirateNumber = new Map<string, MatchVehicle[]>();
  private byNumber = new Map<string, MatchVehicle[]>();
  private assignmentsByVehicle = new Map<string, MatchAssignment[]>();

  constructor(vehicles: MatchVehicle[], assignments: MatchAssignment[]) {
    for (const v of vehicles) {
      const num = normalizePlateNumber(v.plateNumber);
      this.byKey.set(plateKey(v.emirate, v.plateCode, num), v);
      push(this.byEmirateNumber, `${v.emirate}-${num}`, v);
      push(this.byNumber, num, v);
    }
    for (const a of assignments) push(this.assignmentsByVehicle, a.vehicleId, a);
    for (const list of this.assignmentsByVehicle.values()) {
      list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    }
  }

  /** Vehicles that could carry this plate. Exact match first, then looser fallbacks. */
  resolveVehicles(o: Pick<MatchOffense, "emirate" | "plateCode" | "plateNumber">): MatchVehicle[] {
    const num = normalizePlateNumber(o.plateNumber);
    if (!num) return [];
    const code = normalizePlateCode(o.plateCode);
    if (o.emirate) {
      if (code) {
        const exact = this.byKey.get(plateKey(o.emirate, code, num));
        return exact ? [exact] : [];
      }
      return this.byEmirateNumber.get(`${o.emirate}-${num}`) ?? [];
    }
    const sameNumber = this.byNumber.get(num) ?? [];
    return code ? sameNumber.filter((v) => normalizePlateCode(v.plateCode) === code) : sameNumber;
  }

  assignmentsOf(vehicleId: string): MatchAssignment[] {
    return this.assignmentsByVehicle.get(vehicleId) ?? [];
  }
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}

const covers = (a: MatchAssignment, t: number) =>
  a.startsAt.getTime() <= t && (a.endsAt === null || t < a.endsAt.getTime());

export function matchOffense(offense: MatchOffense, index: MatchIndex, opts: MatchOptions = {}): MatchResult {
  const grace = (opts.graceMinutes ?? 15) * 60_000;
  const t = offense.occurredAt.getTime();
  const near = (instant: number) => grace > 0 && Math.abs(instant - t) <= grace;

  const vehicles = index.resolveVehicles(offense);
  if (vehicles.length === 0) {
    return result("UNASSIGNED", "UNKNOWN_PLATE");
  }
  if (vehicles.length > 1) {
    // Plate code missing and several vehicles share the number: propose whoever
    // had one of those vehicles at that time.
    const candidates = vehicles.flatMap((v) => index.assignmentsOf(v.id).filter((a) => covers(a, t)));
    return result("TO_REVIEW", "AMBIGUOUS_PLATE", { candidateAssignmentIds: candidates.map((a) => a.id) });
  }

  const vehicle = vehicles[0];
  const history = index.assignmentsOf(vehicle.id);
  const base = { vehicleId: vehicle.id };
  const covering = history.filter((a) => covers(a, t));

  if (covering.length > 1) {
    const parties = new Set(covering.map((a) => a.partyId));
    if (parties.size === 1) {
      // Duplicate / overlapping records for the same person: not ambiguous.
      const a = covering[covering.length - 1];
      return result("ASSIGNED", "SINGLE_MATCH", { ...base, partyId: a.partyId, assignmentId: a.id });
    }
    return result("TO_REVIEW", "OVERLAP", { ...base, candidateAssignmentIds: covering.map((a) => a.id) });
  }

  if (covering.length === 1) {
    const a = covering[0];
    // Another party's assignment ends or starts within the grace window: the
    // hand-over time may be approximate.
    const neighbours = history.filter(
      (b) =>
        b.id !== a.id &&
        b.partyId !== a.partyId &&
        ((b.endsAt && near(b.endsAt.getTime())) || near(b.startsAt.getTime())),
    );
    if (neighbours.length) {
      return result("TO_REVIEW", "NEAR_BOUNDARY", {
        ...base,
        candidateAssignmentIds: [a.id, ...neighbours.map((b) => b.id)],
      });
    }
    return result("ASSIGNED", "SINGLE_MATCH", { ...base, partyId: a.partyId, assignmentId: a.id });
  }

  // No assignment covers t: look at the closest ones before and after.
  let prev: MatchAssignment | null = null;
  let next: MatchAssignment | null = null;
  for (const a of history) {
    if (a.endsAt && a.endsAt.getTime() <= t && (!prev || a.endsAt > prev.endsAt!)) prev = a;
    if (a.startsAt.getTime() > t && (!next || a.startsAt < next.startsAt)) next = a;
  }
  const prevClose = prev !== null && near(prev.endsAt!.getTime());
  const nextClose = next !== null && near(next.startsAt.getTime());
  if (prevClose || nextClose) {
    const ids = [prevClose ? prev!.id : null, nextClose ? next!.id : null].filter(Boolean) as string[];
    return result("TO_REVIEW", "NEAR_BOUNDARY", { ...base, candidateAssignmentIds: ids });
  }
  if (prev && next) {
    return result("TO_REVIEW", "GAP", { ...base, candidateAssignmentIds: [prev.id, next.id] });
  }
  return result("UNASSIGNED", "NO_ASSIGNMENT", base);
}

function result(status: MatchStatus, reason: MatchReason, extra: Partial<MatchResult> = {}): MatchResult {
  return {
    status,
    reason,
    vehicleId: null,
    partyId: null,
    assignmentId: null,
    candidateAssignmentIds: [],
    ...extra,
  };
}
