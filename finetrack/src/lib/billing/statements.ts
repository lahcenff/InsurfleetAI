import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { audit } from "../audit";
import { filsToDecimalString, toFils } from "../money";
import { dubaiParts } from "../time";
import { computeLine, feeSettingsFrom, sumLines } from "./fees";

export const STATEMENT_LINK_DAYS = 90;

/** Offenses that can be re-billed: attributed, unbilled, not under (or lost) dispute. */
export function billableWhere(companyId: string, start: Date, end: Date): Prisma.OffenseWhereInput {
  return {
    companyId,
    matchStatus: "ASSIGNED",
    partyId: { not: null },
    billingStatus: "UNBILLED",
    occurredAt: { gte: start, lt: end },
    OR: [{ dispute: null }, { dispute: { status: { in: ["REJECTED", "WITHDRAWN"] } } }],
  };
}

export async function generateStatements(
  companyId: string,
  actorId: string,
  opts: { periodStart: Date; periodEnd: Date; partyIds?: string[] },
) {
  const created: string[] = [];
  const offenses = await prisma.offense.findMany({
    where: { ...billableWhere(companyId, opts.periodStart, opts.periodEnd), ...(opts.partyIds ? { partyId: { in: opts.partyIds } } : {}) },
    select: { id: true, partyId: true, amount: true },
    orderBy: { occurredAt: "asc" },
  });
  const byParty = new Map<string, typeof offenses>();
  for (const o of offenses) byParty.set(o.partyId!, [...(byParty.get(o.partyId!) ?? []), o]);

  for (const [partyId, list] of byParty) {
    const id = await prisma.$transaction(async (tx) => {
      // Increment the per-company counter atomically.
      const company = await tx.company.update({
        where: { id: companyId },
        data: { nextStatementSeq: { increment: 1 } },
      });
      const seq = company.nextStatementSeq - 1;
      const settings = feeSettingsFrom(company);
      const lines = list.map((o) => ({ offenseId: o.id, ...computeLine(toFils(o.amount), settings) }));
      const totals = sumLines(lines);
      const year = dubaiParts(new Date()).year;
      const statement = await tx.statement.create({
        data: {
          companyId,
          partyId,
          number: `${company.statementPrefix}-${year}-${String(seq).padStart(5, "0")}`,
          periodStart: opts.periodStart,
          periodEnd: opts.periodEnd,
          status: "ISSUED",
          feeType: company.feeType,
          feeValue: company.feeValue,
          vatOnFeePercent: company.vatOnFeePercent,
          subtotal: filsToDecimalString(totals.amount),
          feeTotal: filsToDecimalString(totals.fee),
          vatTotal: filsToDecimalString(totals.vat),
          total: filsToDecimalString(totals.total),
          publicToken: randomBytes(24).toString("base64url"),
          tokenExpiresAt: new Date(Date.now() + STATEMENT_LINK_DAYS * 86400_000),
          issuedAt: new Date(),
          createdById: actorId,
          lines: {
            create: lines.map((l) => ({
              offenseId: l.offenseId,
              amount: filsToDecimalString(l.amount),
              fee: filsToDecimalString(l.fee),
              vat: filsToDecimalString(l.vat),
              total: filsToDecimalString(l.total),
            })),
          },
        },
      });
      // Guard against a concurrent run billing the same offenses.
      const upd = await tx.offense.updateMany({
        where: { id: { in: list.map((o) => o.id) }, billingStatus: "UNBILLED" },
        data: { billingStatus: "BILLED" },
      });
      if (upd.count !== list.length) throw new Error("Some offenses were billed concurrently, please retry");
      await audit(tx, {
        companyId, actorId, action: "statement.issue", entityType: "Statement", entityId: statement.id,
        after: { number: statement.number, partyId, lines: lines.length, total: statement.total },
      });
      return statement.id;
    });
    created.push(id);
  }
  return created;
}

export async function setStatementStatus(companyId: string, actorId: string, statementId: string, status: "SENT" | "PAID" | "VOID") {
  return prisma.$transaction(async (tx) => {
    const s = await tx.statement.findFirstOrThrow({ where: { id: statementId, companyId }, include: { lines: true } });
    if (s.status === "VOID") throw new Error("Statement is void");
    const offenseIds = s.lines.map((l) => l.offenseId);
    if (status === "VOID") {
      await tx.offense.updateMany({ where: { id: { in: offenseIds } }, data: { billingStatus: "UNBILLED" } });
    }
    if (status === "PAID") {
      await tx.offense.updateMany({ where: { id: { in: offenseIds } }, data: { billingStatus: "PAID" } });
    }
    if (status === "SENT" && s.status !== "ISSUED") return s; // already sent/paid
    const updated = await tx.statement.update({
      where: { id: s.id },
      data: { status, ...(status === "PAID" ? { paidAt: new Date() } : {}) },
    });
    await audit(tx, { companyId, actorId, action: `statement.${status.toLowerCase()}`, entityType: "Statement", entityId: s.id, before: { status: s.status }, after: { status } });
    return updated;
  });
}

export async function getPublicStatement(token: string) {
  const s = await prisma.statement.findUnique({
    where: { publicToken: token },
    include: {
      company: true,
      party: true,
      lines: { include: { offense: { include: { vehicle: true } } }, orderBy: { offense: { occurredAt: "asc" } } },
    },
  });
  if (!s || s.status === "VOID") return null;
  if (s.tokenExpiresAt && s.tokenExpiresAt < new Date()) return null;
  return s;
}

export type FullStatement = NonNullable<Awaited<ReturnType<typeof getPublicStatement>>>;

export async function getStatementForCompany(companyId: string, id: string): Promise<FullStatement | null> {
  return prisma.statement.findFirst({
    where: { id, companyId },
    include: {
      company: true,
      party: true,
      lines: { include: { offense: { include: { vehicle: true } } }, orderBy: { offense: { occurredAt: "asc" } } },
    },
  });
}
