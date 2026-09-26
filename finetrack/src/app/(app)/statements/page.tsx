import Link from "next/link";
import type { StatementStatus } from "@prisma/client";
import { requireCompany } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatAed, formatFils, toFils } from "@/lib/money";
import { dubaiParts, formatDubai } from "@/lib/time";
import { billableWhere } from "@/lib/billing/statements";
import { computeLine, feeSettingsFrom, sumLines } from "@/lib/billing/fees";
import { Badge, Empty, Flash, PageHeader, Pagination, withParams } from "@/components/ui";
import { generate, sendAllIssued } from "./actions";

const PAGE = 50;
const TONE: Record<StatementStatus, "gray" | "blue" | "amber" | "green" | "red"> = { DRAFT: "gray", ISSUED: "amber", SENT: "blue", PAID: "green", VOID: "red" };
const ym = (d: Date) => { const p = dubaiParts(d); return `${p.year}-${String(p.month).padStart(2, "0")}`; };

export default async function StatementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db, companyId, company } = await requireCompany();
  const { t, locale } = await getI18n();
  const page = Math.max(1, Number(sp.page ?? 1));
  const where = sp.status ? { status: sp.status as StatementStatus } : {};
  const [rows, total, billable] = await Promise.all([
    db.statement.findMany({ where, include: { party: true, _count: { select: { lines: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.statement.count({ where }),
    db.offense.findMany({ where: billableWhere(companyId, new Date("2000-01-01T00:00:00Z"), new Date("2100-01-01T00:00:00Z")), select: { partyId: true, amount: true, occurredAt: true } }),
  ]);
  const settings = feeSettingsFrom(company);
  const ready = sumLines(billable.map((o) => computeLine(toFils(o.amount), settings)));
  const readyParties = new Set(billable.map((o) => o.partyId)).size;
  const oldest = billable.reduce<Date | null>((m, o) => (!m || o.occurredAt < m ? o.occurredAt : m), null);
  const now = new Date();
  const lastMonth = new Date(now.getTime() - dubaiParts(now).day * 86400_000);

  const ok = sp.generated ? t("statements.generated", { count: sp.generated }) : sp.sentAll ? t("matching.updated", { count: sp.sentAll }) : undefined;

  return (
    <>
      <PageHeader
        title={t("statements.title")}
        subtitle={t("statements.subtitle")}
        actions={
          <>
            <form action={sendAllIssued}><button className="btn-secondary">✉ {t("statements.sendAll")}</button></form>
            <a href={`/api/export/accounting?from=${ym(oldest ?? lastMonth)}&to=${ym(now)}`} className="btn-secondary">⇩ {t("statements.exportCsv")}</a>
          </>
        }
      />
      <Flash ok={ok} error={sp.error ? t("common.error", { message: sp.error }) : undefined} />

      <form action={generate} className="card mb-6 flex flex-wrap items-end gap-4">
        <div>
          <h2 className="font-semibold">{t("statements.generate")}</h2>
          <p className="text-sm text-slate-500">{t("statements.ready", { count: billable.length, parties: readyParties, amount: formatFils(ready.total, locale) })}</p>
        </div>
        <div className="ms-auto flex flex-wrap items-end gap-2">
          <div><label className="field-label">{t("common.from")}</label><input type="month" name="from" required defaultValue={ym(oldest ?? lastMonth)} className="field" /></div>
          <div><label className="field-label">{t("common.to")}</label><input type="month" name="to" required defaultValue={ym(lastMonth)} className="field" /></div>
          <button className="btn-primary" disabled={billable.length === 0}>{t("statements.generate")}</button>
        </div>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/statements" className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${!sp.status ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200"}`}>{t("common.all")}</Link>
        {(["ISSUED", "SENT", "PAID", "VOID"] as const).map((s) => (
          <Link key={s} href={`/statements?status=${s}`} className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${sp.status === s ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200"}`}>{t(`stmtStatus.${s}`)}</Link>
        ))}
      </div>

      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? <Empty t={t} /> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("statements.number")}</th><th>{t("common.party")}</th><th>{t("statements.period")}</th><th>{t("statements.lines")}</th>
                <th>{t("statements.subtotal")}</th><th>{t("statements.fee")}</th><th>{t("statements.due")}</th><th>{t("common.status")}</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="ltr-nums font-medium"><Link className="text-brand-700 hover:underline" href={`/statements/${s.id}`}>{s.number}</Link></td>
                  <td>{s.party.fullName}</td>
                  <td className="ltr-nums whitespace-nowrap text-xs">{formatDubai(s.periodStart, locale, false)} → {formatDubai(new Date(s.periodEnd.getTime() - 1), locale, false)}</td>
                  <td className="ltr-nums">{s._count.lines}</td>
                  <td className="ltr-nums whitespace-nowrap">{formatAed(s.subtotal, locale)}</td>
                  <td className="ltr-nums whitespace-nowrap">{formatAed(Number(s.feeTotal) + Number(s.vatTotal), locale)}</td>
                  <td className="ltr-nums whitespace-nowrap font-semibold">{formatAed(s.total, locale)}</td>
                  <td><Badge tone={TONE[s.status]}>{t(`stmtStatus.${s.status}`)}</Badge></td>
                  <td><a href={`/api/statements/${s.id}/pdf`} className="text-xs text-brand-700 hover:underline">PDF</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pages={Math.ceil(total / PAGE)} href={(p) => withParams("/statements", sp, { page: p })} t={t} />
    </>
  );
}
