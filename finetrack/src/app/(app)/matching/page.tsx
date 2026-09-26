import Link from "next/link";
import type { MatchReason, MatchStatus, OffenseSource, Prisma } from "@prisma/client";
import { requireCompany } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatAed } from "@/lib/money";
import { formatDubai } from "@/lib/time";
import { Badge, Empty, Flash, MatchBadge, PageHeader, Pagination, Plate, withParams } from "@/components/ui";
import { SelectAll } from "@/components/SelectAll";
import { bulkResolve, pickCandidate, rerunMatching } from "./actions";

const PAGE = 50;
const STATUSES: MatchStatus[] = ["TO_REVIEW", "UNASSIGNED", "ASSIGNED"];

export default async function MatchingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db } = await requireCompany();
  const { t, locale } = await getI18n();
  const status = (STATUSES.includes(sp.status as MatchStatus) ? sp.status : "TO_REVIEW") as MatchStatus;
  const page = Math.max(1, Number(sp.page ?? 1));
  const where: Prisma.OffenseWhereInput = {
    matchStatus: status,
    billingStatus: "UNBILLED",
    ...(sp.source ? { source: sp.source as OffenseSource } : {}),
    ...(sp.reason ? { matchReason: sp.reason as MatchReason } : {}),
  };
  const [offenses, total, counts, parties] = await Promise.all([
    db.offense.findMany({
      where,
      include: {
        vehicle: true,
        party: true,
        candidates: { include: { assignment: { include: { party: true, vehicle: true } } } },
      },
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    db.offense.count({ where }),
    db.offense.groupBy({ by: ["matchStatus"], where: { billingStatus: "UNBILLED" }, _count: true }),
    db.party.findMany({ orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
  ]);
  const countOf = (s: MatchStatus) => counts.find((c) => c.matchStatus === s)?._count ?? 0;
  const back = withParams("/matching", { status: sp.status, source: sp.source, reason: sp.reason, page: sp.page }, {});
  const rerun = sp.rerun?.split("-");

  return (
    <>
      <PageHeader
        title={t("matching.title")}
        subtitle={`${t("matching.subtitle")} ${t("common.timezoneNote")}`}
        actions={
          <form action={rerunMatching}>
            <input type="hidden" name="back" value={back} />
            <button className="btn-secondary">↻ {t("matching.rerun")}</button>
          </form>
        }
      />
      <Flash
        ok={
          rerun ? t("matching.rerunDone", { assigned: rerun[0], review: rerun[1], unassigned: rerun[2] })
          : sp.updated ? t("matching.updated", { count: sp.updated }) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={withParams("/matching", {}, { status: s })}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-inset ${s === status ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
          >
            {t(`status.${s}`)} <span className="ltr-nums ms-1 opacity-70">{countOf(s)}</span>
          </Link>
        ))}
        <form className="ms-auto flex gap-2">
          <input type="hidden" name="status" value={status} />
          <select name="source" defaultValue={sp.source ?? ""} className="field py-1.5">
            <option value="">{t("common.source")}: {t("common.all")}</option>
            {["SALIK", "DARB", "RTA", "POLICE", "PARKING", "OTHER"].map((s) => <option key={s} value={s}>{t(`source.${s}`)}</option>)}
          </select>
          <select name="reason" defaultValue={sp.reason ?? ""} className="field py-1.5">
            <option value="">{t("common.reason")}: {t("common.all")}</option>
            {["OVERLAP", "GAP", "NEAR_BOUNDARY", "AMBIGUOUS_PLATE", "NO_ASSIGNMENT", "UNKNOWN_PLATE", "SINGLE_MATCH", "MANUAL"].map((r) => <option key={r} value={r}>{t(`reason.${r}`)}</option>)}
          </select>
          <button className="btn-secondary py-1.5">{t("common.filter")}</button>
        </form>
      </div>

      <form action={bulkResolve} className="card p-0">
        <input type="hidden" name="back" value={back} />
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <span className="font-medium text-slate-600">{t("matching.bulk")}</span>
          <button name="op" value="confirm" className="btn-primary py-1.5">✓ {t("matching.confirm")}</button>
          <select name="partyId" className="field w-56 py-1.5" defaultValue="">
            <option value="">{t("matching.pickParty")}</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
          <button name="op" value="party" className="btn-secondary py-1.5">{t("matching.assignTo")}</button>
          <button name="op" value="unassign" className="btn-secondary py-1.5">✕ {t("matching.unassign")}</button>
          <button name="op" value="unlock" className="btn-secondary py-1.5">↺ {t("matching.unlock")}</button>
        </div>
        <div className="overflow-x-auto">
          {offenses.length === 0 ? <Empty t={t} /> : (
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-8"><SelectAll label={t("common.selectAll")} /></th>
                  <th>{t("common.dateDubai")}</th><th>{t("common.source")}</th><th>{t("common.plate")}</th><th>{t("common.amount")}</th>
                  <th>{t("common.status")}</th><th>{t("common.party")}</th><th>{t("matching.candidates")}</th>
                </tr>
              </thead>
              <tbody>
                {offenses.map((o) => (
                  <tr key={o.id}>
                    <td><input type="checkbox" name="ids" value={o.id} aria-label={o.externalRef} /></td>
                    <td className="ltr-nums whitespace-nowrap">{formatDubai(o.occurredAt, locale)}<div className="text-xs text-slate-400">{o.externalRef}</div></td>
                    <td>{t(`source.${o.source}`)}<div className="max-w-40 truncate text-xs text-slate-400">{o.location}</div></td>
                    <td>{o.vehicle ? <Plate emirate={o.vehicle.emirate} code={o.vehicle.plateCode} number={o.vehicle.plateNumber} /> : <Plate emirate={o.emirate} code={o.plateCode} number={o.plateNumber} />}</td>
                    <td className="ltr-nums whitespace-nowrap">{formatAed(o.amount, locale)}</td>
                    <td className="space-y-1">
                      <MatchBadge status={o.matchStatus} t={t} />
                      {o.matchReason && <div className="text-xs text-slate-500">{t(`reason.${o.matchReason}`)}</div>}
                      {o.matchLocked && <Badge tone="blue">🔒 {t("matching.locked")}</Badge>}
                    </td>
                    <td>{o.party?.fullName ?? "—"}</td>
                    <td>
                      {o.candidates.length === 0 ? <span className="text-xs text-slate-400">—</span> : (
                        <ul className="space-y-1">
                          {o.candidates.map((c) => (
                            <li key={c.id} className="flex items-center gap-2 text-xs">
                              <button formAction={pickCandidate.bind(null, o.id, c.assignmentId)} className="rounded bg-brand-50 px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-100">
                                {t("matching.applyCandidate")}
                              </button>
                              <span>
                                <strong>{c.assignment.party.fullName}</strong>{" "}
                                <span className="ltr-nums text-slate-500">
                                  {formatDubai(c.assignment.startsAt, locale)} → {c.assignment.endsAt ? formatDubai(c.assignment.endsAt, locale) : "…"}
                                </span>
                                {o.matchReason === "AMBIGUOUS_PLATE" && <> · <Plate emirate={c.assignment.vehicle.emirate} code={c.assignment.vehicle.plateCode} number={c.assignment.vehicle.plateNumber} /></>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </form>
      <Pagination page={page} pages={Math.ceil(total / PAGE)} href={(p) => withParams("/matching", sp, { page: p, updated: undefined, rerun: undefined })} t={t} />
    </>
  );
}
