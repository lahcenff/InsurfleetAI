import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { audit } from "../audit";
import { MatchIndex, matchOffense } from "./engine";

/**
 * Run the matching engine for a company. Offenses locked by a manager are never
 * touched; billed offenses keep their party. Returns counts per status.
 */
export async function runMatching(companyId: string, opts: { offenseIds?: string[] } = {}) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const [vehicles, assignments, offenses] = await Promise.all([
    prisma.vehicle.findMany({ where: { companyId }, select: { id: true, emirate: true, plateCode: true, plateNumber: true } }),
    prisma.assignment.findMany({
      where: { companyId },
      select: { id: true, vehicleId: true, partyId: true, startsAt: true, endsAt: true },
    }),
    prisma.offense.findMany({
      where: {
        companyId,
        matchLocked: false,
        billingStatus: "UNBILLED",
        ...(opts.offenseIds ? { id: { in: opts.offenseIds } } : {}),
      },
      select: { id: true, emirate: true, plateCode: true, plateNumber: true, occurredAt: true },
    }),
  ]);

  const index = new MatchIndex(vehicles, assignments);
  const counts = { ASSIGNED: 0, TO_REVIEW: 0, UNASSIGNED: 0 };
  const now = new Date();

  const CHUNK = 200;
  for (let i = 0; i < offenses.length; i += CHUNK) {
    const chunk = offenses.slice(i, i + CHUNK);
    const results = chunk.map((o) => ({ o, r: matchOffense(o, index, { graceMinutes: company.matchGraceMinutes }) }));
    await prisma.$transaction([
      prisma.matchCandidate.deleteMany({ where: { offenseId: { in: chunk.map((o) => o.id) } } }),
      ...results.map(({ o, r }) =>
        prisma.offense.update({
          where: { id: o.id },
          data: {
            vehicleId: r.vehicleId,
            partyId: r.partyId,
            assignmentId: r.assignmentId,
            matchStatus: r.status,
            matchReason: r.reason,
            matchedAt: now,
            matchedById: null,
          },
        }),
      ),
      prisma.matchCandidate.createMany({
        data: results.flatMap(({ o, r }) =>
          [...new Set(r.candidateAssignmentIds)].map((assignmentId) => ({ offenseId: o.id, assignmentId, reason: r.reason })),
        ),
        skipDuplicates: true,
      }),
    ]);
    for (const { r } of results) counts[r.status]++;
  }
  return { processed: offenses.length, ...counts };
}

/**
 * Manager decision on one or more offenses: confirm the proposed party, assign
 * a specific assignment/party, or mark as unassignable. Locks the offenses.
 */
export async function resolveOffenses(
  companyId: string,
  actorId: string,
  offenseIds: string[],
  decision:
    | { kind: "confirm" }
    | { kind: "assignment"; assignmentId: string }
    | { kind: "party"; partyId: string }
    | { kind: "unassign" }
    | { kind: "unlock" },
) {
  return prisma.$transaction(async (tx) => {
    const offenses = await tx.offense.findMany({
      where: { companyId, id: { in: offenseIds } },
      include: { candidates: { include: { assignment: true } } },
    });
    let updated = 0;
    for (const o of offenses) {
      if (o.billingStatus !== "UNBILLED" && decision.kind !== "confirm") continue; // billed offenses are frozen
      let data: Prisma.OffenseUncheckedUpdateInput;
      switch (decision.kind) {
        case "confirm": {
          // Confirm current party, or the single candidate if there is exactly one.
          const single = o.candidates.length === 1 ? o.candidates[0].assignment : null;
          const partyId = o.partyId ?? single?.partyId;
          if (!partyId) continue;
          data = { partyId, assignmentId: o.assignmentId ?? single?.id, vehicleId: o.vehicleId ?? single?.vehicleId, matchStatus: "ASSIGNED", matchReason: "MANUAL", matchLocked: true };
          break;
        }
        case "assignment": {
          const a = await tx.assignment.findFirstOrThrow({ where: { id: decision.assignmentId, companyId } });
          data = { partyId: a.partyId, assignmentId: a.id, vehicleId: a.vehicleId, matchStatus: "ASSIGNED", matchReason: "MANUAL", matchLocked: true };
          break;
        }
        case "party": {
          await tx.party.findFirstOrThrow({ where: { id: decision.partyId, companyId } });
          data = { partyId: decision.partyId, assignmentId: null, matchStatus: "ASSIGNED", matchReason: "MANUAL", matchLocked: true };
          break;
        }
        case "unassign":
          data = { partyId: null, assignmentId: null, matchStatus: "UNASSIGNED", matchReason: "MANUAL", matchLocked: true };
          break;
        case "unlock":
          data = { matchLocked: false };
          break;
      }
      await tx.offense.update({ where: { id: o.id }, data: { ...data, matchedAt: new Date(), matchedById: actorId } });
      await audit(tx, {
        companyId, actorId, action: `offense.match.${decision.kind}`, entityType: "Offense", entityId: o.id,
        before: { partyId: o.partyId, assignmentId: o.assignmentId, matchStatus: o.matchStatus },
        after: { partyId: data.partyId ?? o.partyId, assignmentId: data.assignmentId ?? o.assignmentId, matchStatus: data.matchStatus ?? o.matchStatus },
      });
      updated++;
    }
    return updated;
  });
}
