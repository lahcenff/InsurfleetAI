// Demo data: `npm run db:seed`
// Creates two companies (to show tenant isolation) and loads the fixtures through
// the real CSV import pipeline, then simulates a few weeks of manager activity.
import { prisma } from "../src/lib/db";
import { buildFixtures } from "./fixtures";
import { parseCsv } from "../src/lib/import/parse";
import { autoMap } from "../src/lib/import/fields";
import { BUILTIN_PRESETS } from "../src/lib/import/presets";
import { runImport } from "../src/lib/import/service";
import { resolveOffenses } from "../src/lib/matching/service";
import { generateStatements, setStatementStatus } from "../src/lib/billing/statements";
import { notifyParty } from "../src/lib/notify";
import { dubaiParts, dubaiToUtc } from "../src/lib/time";


async function loadCompany(opts: {
  slug: string; name: string; trn: string; admin: string; manager: string; seed: number; offenses: number; end: Date;
}) {
  // Billed lines and history are protected by FKs: delete them explicitly before the tenant.
  const old = await prisma.company.findUnique({ where: { slug: opts.slug } });
  if (old) {
    await prisma.statement.deleteMany({ where: { companyId: old.id } });
    await prisma.assignment.deleteMany({ where: { companyId: old.id } });
    await prisma.company.delete({ where: { id: old.id } });
  }
  const company = await prisma.company.create({
    data: {
      name: opts.name, slug: opts.slug, trn: opts.trn, plan: "PRO",
      feeType: "FIXED", feeValue: "25.00", vatOnFeePercent: "5.00", statementPrefix: "FT", matchGraceMinutes: 15,
    },
  });
  for (const [email, role] of [[opts.admin, "ADMIN"], [opts.manager, "MANAGER"]] as const) {
    const u = await prisma.user.upsert({ where: { email }, update: {}, create: { email, name: email.split("@")[0] } });
    await prisma.membership.create({ data: { userId: u.id, companyId: company.id, role } });
  }
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: opts.admin } });

  const fx = buildFixtures(opts.end, opts.seed, opts.offenses);
  const load = async (entity: "VEHICLE" | "PARTY" | "ASSIGNMENT", text: string, fileName: string) => {
    const { headers, rows } = parseCsv(text);
    const r = await runImport({ companyId: company.id, userId: admin.id, entity, rows, columnMap: autoMap(entity, headers), fileName, fileBuffer: Buffer.from(text) });
    if (r.errors.length) console.warn(`  ${fileName}: ${r.errors.length} row errors`, r.errors.slice(0, 3));
    return r;
  };
  await load("VEHICLE", fx.vehiclesCsv, "vehicles.csv");
  await load("PARTY", fx.partiesCsv, "drivers-customers.csv");
  await load("ASSIGNMENT", fx.assignmentsCsv, "assignments.csv");

  // Offenses through the saved per-source mappings, exactly as a manager would.
  const files = { SALIK: fx.salikCsv, DARB: fx.darbCsv, RTA: fx.rtaCsv, PARKING: fx.parkingCsv } as const;
  for (const preset of BUILTIN_PRESETS) {
    const mapping = await prisma.importMapping.create({
      data: { companyId: company.id, name: preset.name, entity: preset.entity, source: preset.source, columnMap: preset.columnMap, dateFormat: preset.dateFormat, defaults: preset.defaults },
    });
    const text = files[preset.source as keyof typeof files];
    const { rows } = parseCsv(text);
    const r = await runImport({
      companyId: company.id, userId: admin.id, entity: "OFFENSE", source: preset.source, rows,
      columnMap: preset.columnMap, dateFormat: preset.dateFormat, defaults: preset.defaults,
      fileName: `${preset.source!.toLowerCase()}-export.csv`, fileBuffer: Buffer.from(text), mappingId: mapping.id,
    });
    if (r.errors.length) console.warn(`  ${preset.source}: ${r.errors.length} row errors`, r.errors.slice(0, 3));
  }

  // ── Simulated manager activity ────────────────────────────────────────────
  const now = opts.end;
  const cur = dubaiParts(now);
  const monthStart = (back: number) => dubaiToUtc(cur.year, cur.month - back, 1); // Date.UTC handles month underflow
  const m1 = monthStart(2), m2 = monthStart(1), m3 = monthStart(0);

  // Resolve ~60% of review items older than the current month by picking the first candidate.
  const review = await prisma.offense.findMany({
    where: { companyId: company.id, matchStatus: "TO_REVIEW", occurredAt: { lt: m3 } },
    include: { candidates: { orderBy: { id: "asc" } } },
  });
  for (const o of review) {
    if (o.candidates.length && hash(o.id) % 10 < 6) {
      await resolveOffenses(company.id, admin.id, [o.id], { kind: "assignment", assignmentId: o.candidates[0].assignmentId });
    }
  }

  // Disputes on a few RTA fines.
  const fines = await prisma.offense.findMany({ where: { companyId: company.id, source: "RTA", occurredAt: { gte: m1 } }, orderBy: { externalRef: "asc" }, take: 7 });
  const disputeStatuses = ["TO_DISPUTE", "TO_DISPUTE", "SUBMITTED", "SUBMITTED", "ACCEPTED", "REJECTED", "WITHDRAWN"] as const;
  const reasons = [
    "Vehicle was in the workshop at that time (job card attached).",
    "Driver was on leave — vehicle parked at depot.",
    "Plate misread by the camera: our vehicle has a different code.",
    "Duplicate of an already paid fine.",
  ];
  for (const [i, f] of fines.entries()) {
    const status = disputeStatuses[i];
    await prisma.dispute.create({
      data: {
        companyId: company.id, offenseId: f.id, status, reason: reasons[i % reasons.length], createdById: admin.id,
        submittedAt: status === "TO_DISPUTE" ? null : new Date(f.occurredAt.getTime() + 5 * 86400_000),
        resolvedAt: ["ACCEPTED", "REJECTED", "WITHDRAWN"].includes(status) ? new Date(f.occurredAt.getTime() + 20 * 86400_000) : null,
      },
    });
    if (status === "ACCEPTED") await prisma.offense.update({ where: { id: f.id }, data: { billingStatus: "WRITTEN_OFF" } });
  }

  // Write off a few old unassigned tolls (unknown plates).
  const lost = await prisma.offense.findMany({ where: { companyId: company.id, matchStatus: "UNASSIGNED", occurredAt: { lt: m2 } }, take: 4 });
  await prisma.offense.updateMany({ where: { id: { in: lost.map((o) => o.id) } }, data: { billingStatus: "WRITTEN_OFF" } });

  // Statements: month 1 (mostly paid), month 2 (sent).
  const silent = console.info;
  console.info = () => {};
  try {
    for (const [from, to, paidShare] of [[m1, m2, 0.7], [m2, m3, 0]] as const) {
      const ids = await generateStatements(company.id, admin.id, { periodStart: from, periodEnd: to });
      for (const id of ids) {
        const s = await prisma.statement.findUniqueOrThrow({ where: { id }, include: { party: true } });
        await notifyParty({
          companyId: company.id, party: s.party, statementId: s.id,
          message: { subject: `${opts.name} — statement ${s.number}`, text: `Statement ${s.number}: ${s.total} AED` },
        });
        await setStatementStatus(company.id, admin.id, id, "SENT");
        if (hash(id) % 100 < paidShare * 100) await setStatementStatus(company.id, admin.id, id, "PAID");
      }
    }
  } finally {
    console.info = silent;
  }

  const counts = await prisma.offense.groupBy({ by: ["matchStatus"], where: { companyId: company.id }, _count: true });
  console.log(`✓ ${opts.name}:`, fx.stats, Object.fromEntries(counts.map((c) => [c.matchStatus, c._count])));
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

async function main() {
  const end = process.env.SEED_END_DATE ? new Date(process.env.SEED_END_DATE) : new Date();
  await loadCompany({
    slug: "demo-desert-wheels", name: "Desert Wheels Rent A Car LLC", trn: "100234567800003",
    admin: "admin@finetrack.demo", manager: "manager@finetrack.demo", seed: 42, offenses: 500, end,
  });
  // Second tenant: proves isolation (log in as ops@gulfexpress.demo — you will not see Desert Wheels data).
  await loadCompany({
    slug: "demo-gulf-express", name: "Gulf Express Delivery FZE", trn: "100987654300003",
    admin: "ops@gulfexpress.demo", manager: "dispatch@gulfexpress.demo", seed: 7, offenses: 60, end,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
