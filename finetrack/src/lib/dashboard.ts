import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { toFils } from "./money";

export async function dashboardData(companyId: string, start: Date, end: Date) {
  const inMonth = { companyId, occurredAt: { gte: start, lt: end } };
  const [totals, byStatus, byBilling, auto, bySource, byVehicle, byParty, queue] = await Promise.all([
    prisma.offense.aggregate({ where: inMonth, _sum: { amount: true }, _count: true }),
    prisma.offense.groupBy({ by: ["matchStatus"], where: inMonth, _count: true }),
    prisma.offense.groupBy({ by: ["billingStatus"], where: inMonth, _sum: { amount: true } }),
    prisma.offense.count({ where: { ...inMonth, matchStatus: "ASSIGNED", matchReason: { not: "MANUAL" } } }),
    prisma.offense.groupBy({ by: ["source"], where: inMonth, _sum: { amount: true }, _count: true }),
    prisma.offense.groupBy({ by: ["vehicleId"], where: { ...inMonth, vehicleId: { not: null } }, _sum: { amount: true }, _count: true, orderBy: { _sum: { amount: "desc" } }, take: 10 }),
    prisma.offense.groupBy({ by: ["partyId"], where: { ...inMonth, partyId: { not: null } }, _sum: { amount: true }, _count: true, orderBy: { _sum: { amount: "desc" } }, take: 10 }),
    prisma.offense.groupBy({ by: ["matchStatus"], where: { companyId, billingStatus: "UNBILLED" }, _count: true }),
  ]);
  const [vehicles, parties] = await Promise.all([
    prisma.vehicle.findMany({ where: { id: { in: byVehicle.map((v) => v.vehicleId!) } } }),
    prisma.party.findMany({ where: { id: { in: byParty.map((p) => p.partyId!) } } }),
  ]);
  const billing = (s: string) => toFils(byBilling.find((b) => b.billingStatus === s)?._sum.amount ?? 0);
  const total = toFils(totals._sum.amount ?? 0);
  const recovered = billing("BILLED") + billing("PAID");

  // Six Dubai calendar months ending with the selected one.
  const trendStart = new Date(start);
  trendStart.setUTCMonth(trendStart.getUTCMonth() - 5);
  const trend = await prisma.$queryRaw<{ month: string; total: Prisma.Decimal; recovered: Prisma.Decimal }[]>`
    SELECT to_char(date_trunc('month', "occurredAt" AT TIME ZONE 'Asia/Dubai'), 'YYYY-MM') AS month,
           SUM(amount) AS total,
           SUM(CASE WHEN "billingStatus" IN ('BILLED', 'PAID') THEN amount ELSE 0 END) AS recovered
    FROM "Offense"
    WHERE "companyId" = ${companyId} AND "occurredAt" >= ${trendStart} AND "occurredAt" < ${end}
    GROUP BY 1 ORDER BY 1`;

  return {
    total,
    count: totals._count,
    autoRate: totals._count ? auto / totals._count : 0,
    statusCount: Object.fromEntries(byStatus.map((s) => [s.matchStatus, s._count])) as Record<string, number>,
    recovered,
    notRecovered: total - recovered,
    bySource: bySource.map((s) => ({ source: s.source, amount: toFils(s._sum.amount ?? 0), count: s._count })).sort((a, b) => b.amount - a.amount),
    topVehicles: byVehicle.map((v) => ({ vehicle: vehicles.find((x) => x.id === v.vehicleId)!, amount: toFils(v._sum.amount ?? 0), count: v._count })),
    topParties: byParty.map((p) => ({ party: parties.find((x) => x.id === p.partyId)!, amount: toFils(p._sum.amount ?? 0), count: p._count })),
    queue: Object.fromEntries(queue.map((q) => [q.matchStatus, q._count])) as Record<string, number>,
    trend: trend.map((r) => ({ month: r.month, total: toFils(r.total), recovered: toFils(r.recovered) })),
  };
}
