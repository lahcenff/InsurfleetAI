import Link from "next/link";
import type { BillingStatus, MatchStatus, OffenseSource, Prisma } from "@prisma/client";
import { requireCompany } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatAed } from "@/lib/money";
import { dubaiToUtc, formatDubai } from "@/lib/time";
import { Badge, BillingBadge, Empty, MatchBadge, PageHeader, Pagination, Plate, withParams } from "@/components/ui";
import { SelectAll } from "@/components/SelectAll";
import { writeOffOffenses } from "./actions";

const PAGE = 50;

export default async function OffensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db } = await requireCompany();
  const { t, locale } = await getI18n();
  const page = Math.max(1, Number(sp.page ?? 1));
  const [y, m] = (sp.month ?? "").split("-").map(Number);
  const where: Prisma.OffenseWhereInput = {
    ...(sp.status ? { matchStatus: sp.status as MatchStatus } : {}),
    ...(sp.billing ? { billingStatus: sp.billing as BillingStatus } : {}),
    ...(sp.source ? { source: sp.source as OffenseSource } : {}),
    ...(sp.vehicle ? { vehicleId: sp.vehicle } : {}),
    ...(sp.party ? { partyId: sp.party } : {}),
    ...(y && m ? { occurredAt: { gte: dubaiToUtc(y, m, 1), lt: m === 12 ? dubaiToUtc(y + 1, 1, 1) : dubaiToUtc(y, m + 1, 1) } } : {}),
    ...(sp.q ? { OR: [{ externalRef: { contains: sp.q, mode: "insensitive" } }, { plateNumber: { contains: sp.q.replace(/\D/g, "") || sp.q } }] } : {}),
  };
  const [rows, total, agg] = await Promise.all([
    db.offense.findMany({ where, include: { vehicle: true, party: true, dispute: true }, orderBy: { occurredAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.offense.count({ where }),
    db.offense.aggregate({ where, _sum: { amount: true } }),
  ]);
  const back = withParams("/offenses", sp, {});
  const sel = (name: string, values: string[], prefix: string) => (
    <select name={name} defaultValue={sp[name] ?? ""} className="field py-1.5">
      <option value="">{t(`common.${name === "billing" ? "status" : name === "status" ? "status" : "source"}`)}: {t("common.all")}</option>
      {values.map((v) => <option key={v} value={v}>{t(`${prefix}.${v}`)}</option>)}
    </select>
  );

  return (
    <>
      <PageHeader
        title={t("offenses.title")}
        subtitle={`${t("offenses.count", { count: total })} · ${formatAed(agg._sum.amount ?? 0, locale)}`}
        actions={<Link href="/import?entity=OFFENSE" className="btn-primary">⇪ {t("nav.import")}</Link>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder={`${t("common.search")} (${t("fields.externalRef")}, ${t("common.plate")})`} className="field max-w-64 py-1.5" />
        <input type="month" name="month" defaultValue={sp.month} className="field max-w-44 py-1.5" />
        {sel("source", ["SALIK", "DARB", "RTA", "POLICE", "PARKING", "OTHER"], "source")}
        {sel("status", ["ASSIGNED", "TO_REVIEW", "UNASSIGNED"], "status")}
        {sel("billing", ["UNBILLED", "BILLED", "PAID", "WRITTEN_OFF"], "billing")}
        {sp.vehicle && <input type="hidden" name="vehicle" value={sp.vehicle} />}
        {sp.party && <input type="hidden" name="party" value={sp.party} />}
        <button className="btn-secondary py-1.5">{t("common.filter")}</button>
        {(sp.vehicle || sp.party) && <Link href="/offenses" className="btn-secondary py-1.5">✕</Link>}
      </form>

      <form action={writeOffOffenses} className="card p-0">
        <input type="hidden" name="back" value={back} />
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm">
          <span className="text-slate-600">{t("matching.bulk")}</span>
          <button className="btn-danger py-1">{t("offenses.writeOff")}</button>
        </div>
        <div className="overflow-x-auto">
          {rows.length === 0 ? <Empty t={t} /> : (
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-8"><SelectAll label={t("common.selectAll")} /></th>
                  <th>{t("common.dateDubai")}</th><th>{t("common.source")}</th><th>{t("common.plate")}</th><th>{t("common.details")}</th>
                  <th>{t("common.amount")}</th><th>{t("common.party")}</th><th>{t("common.status")}</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td><input type="checkbox" name="ids" value={o.id} aria-label={o.externalRef} /></td>
                    <td className="ltr-nums whitespace-nowrap">{formatDubai(o.occurredAt, locale)}</td>
                    <td>{t(`source.${o.source}`)}<div className="text-xs text-slate-400">{t(`category.${o.category}`)}</div></td>
                    <td>{o.vehicle ? <Plate emirate={o.vehicle.emirate} code={o.vehicle.plateCode} number={o.vehicle.plateNumber} /> : <Plate emirate={o.emirate} code={o.plateCode} number={o.plateNumber} />}</td>
                    <td className="max-w-64">
                      <div className="ltr-nums text-xs text-slate-500">{o.externalRef}</div>
                      <div className="truncate">{[o.description, o.location].filter(Boolean).join(" · ")}</div>
                      {!!o.blackPoints && <Badge tone="red">{o.blackPoints} {t("offenses.points")}</Badge>}
                    </td>
                    <td className="ltr-nums whitespace-nowrap font-medium">{formatAed(o.amount, locale)}</td>
                    <td>{o.party?.fullName ?? "—"}</td>
                    <td className="space-y-1">
                      <MatchBadge status={o.matchStatus} t={t} /><br />
                      <BillingBadge status={o.billingStatus} t={t} />
                      {o.dispute && <div><Badge tone="amber">⚑ {t(`dispute.${o.dispute.status}`)}</Badge></div>}
                    </td>
                    <td>
                      {!o.dispute && o.category !== "TOLL" && (
                        <Link href={`/disputes?new=${o.id}`} className="whitespace-nowrap text-xs text-brand-700 hover:underline">⚑ {t("offenses.markDispute")}</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </form>
      <Pagination page={page} pages={Math.ceil(total / PAGE)} href={(p) => withParams("/offenses", sp, { page: p })} t={t} />
    </>
  );
}
