import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCompany, appUrl } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { getStatementForCompany } from "@/lib/billing/statements";
import { formatDubai } from "@/lib/time";
import { Badge, Flash } from "@/components/ui";
import { StatementView } from "@/components/StatementView";
import { changeStatus, sendStatement } from "../actions";

export default async function StatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { companyId, db } = await requireCompany();
  const { t, locale } = await getI18n();
  const s = await getStatementForCompany(companyId, id);
  if (!s) notFound();
  const notifications = await db.notification.findMany({ where: { statementId: s.id }, orderBy: { createdAt: "desc" } });
  const link = `${appUrl()}/s/${s.publicToken}`;

  return (
    <>
      <div className="mb-4 text-sm"><Link href="/statements" className="text-brand-700 hover:underline">← {t("statements.title")}</Link></div>
      <Flash ok={sp.sent ? t("statements.sent", { party: s.party.fullName }) : undefined} error={sp.nocontact ? t("statements.noContact") : undefined} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={s.status === "PAID" ? "green" : s.status === "VOID" ? "red" : "blue"}>{t(`stmtStatus.${s.status}`)}</Badge>
        <div className="ms-auto flex flex-wrap gap-2">
          <a href={`/api/statements/${s.id}/pdf`} className="btn-secondary">⇩ {t("statements.pdf")}</a>
          {s.status !== "VOID" && (
            <>
              <form action={sendStatement}><input type="hidden" name="id" value={s.id} /><button className="btn-primary">✉ {t("statements.send")}</button></form>
              {s.status !== "PAID" && (
                <form action={changeStatus}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value="PAID" /><button className="btn-secondary">✓ {t("statements.markPaid")}</button></form>
              )}
              {s.status !== "PAID" && (
                <form action={changeStatus}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value="VOID" /><button className="btn-danger">{t("statements.void")}</button></form>
              )}
            </>
          )}
        </div>
      </div>
      <div className="card"><StatementView s={s} t={t} locale={locale} /></div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-semibold">{t("statements.publicLink")}</h2>
          <input readOnly value={link} className="field font-mono text-xs" dir="ltr" />
          <p className="mt-2 text-xs text-slate-500">→ {formatDubai(s.tokenExpiresAt, locale, false)}</p>
        </div>
        <div className="card">
          <h2 className="mb-2 font-semibold">✉ WhatsApp / e-mail</h2>
          {notifications.length === 0 ? <p className="text-sm text-slate-400">—</p> : (
            <ul className="space-y-1 text-sm">
              {notifications.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone={n.status === "FAILED" ? "red" : n.status === "SIMULATED" ? "amber" : "green"}>{n.channel} · {n.status}</Badge>
                  <span className="ltr-nums">{n.recipient}</span>
                  <span className="ltr-nums text-xs text-slate-400">{formatDubai(n.createdAt, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
