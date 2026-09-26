import Link from "next/link";
import type { DisputeStatus } from "@prisma/client";
import { requireCompany } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatAed } from "@/lib/money";
import { formatDubai } from "@/lib/time";
import { Badge, Empty, Flash, PageHeader, Plate } from "@/components/ui";
import { createDispute, updateDispute, uploadAttachment } from "../offenses/actions";

const STATUSES: DisputeStatus[] = ["TO_DISPUTE", "SUBMITTED", "ACCEPTED", "REJECTED", "WITHDRAWN"];
const TONE: Record<DisputeStatus, "amber" | "blue" | "green" | "red" | "gray"> = {
  TO_DISPUTE: "amber", SUBMITTED: "blue", ACCEPTED: "green", REJECTED: "red", WITHDRAWN: "gray",
};

export default async function DisputesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db } = await requireCompany();
  const { t, locale } = await getI18n();
  const newOffense = sp.new ? await db.offense.findFirst({ where: { id: sp.new }, include: { vehicle: true, party: true } }) : null;
  const disputes = await db.dispute.findMany({
    where: sp.status ? { status: sp.status as DisputeStatus } : {},
    include: { offense: { include: { vehicle: true, party: true } }, attachments: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader title={t("disputes.title")} subtitle={t("disputes.subtitle")} />
      <Flash ok={sp.ok ? t("common.saved") : undefined} error={sp.error ? t("disputes.fileTooBig") : undefined} />

      {newOffense && (
        <form action={createDispute} className="card mb-6 space-y-3">
          <input type="hidden" name="offenseId" value={newOffense.id} />
          <h2 className="font-semibold">⚑ {t("disputes.create")}</h2>
          <p className="text-sm text-slate-600">
            <span className="ltr-nums">{newOffense.externalRef}</span> · {t(`source.${newOffense.source}`)} · <span className="ltr-nums">{formatDubai(newOffense.occurredAt, locale)}</span> · {formatAed(newOffense.amount, locale)}
            {newOffense.description && <> · {newOffense.description}</>}
          </p>
          <div>
            <label className="field-label">{t("disputes.reason")}</label>
            <textarea name="reason" required rows={3} className="field" />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary">{t("disputes.create")}</button>
            <Link href="/disputes" className="btn-secondary">{t("common.cancel")}</Link>
          </div>
        </form>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/disputes" className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${!sp.status ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200"}`}>{t("common.all")}</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/disputes?status=${s}`} className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${sp.status === s ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200"}`}>
            {t(`dispute.${s}`)}
          </Link>
        ))}
      </div>

      {disputes.length === 0 ? <div className="card"><Empty t={t} /></div> : (
        <div className="space-y-3">
          {disputes.map((d) => (
            <details key={d.id} open={sp.open === d.id} className="card">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                <Badge tone={TONE[d.status]}>{t(`dispute.${d.status}`)}</Badge>
                <span className="ltr-nums text-sm font-medium">{d.offense.externalRef}</span>
                <span className="text-sm text-slate-500">{t(`source.${d.offense.source}`)}</span>
                {d.offense.vehicle && <Plate emirate={d.offense.vehicle.emirate} code={d.offense.vehicle.plateCode} number={d.offense.vehicle.plateNumber} />}
                <span className="ltr-nums text-sm">{formatDubai(d.offense.occurredAt, locale)}</span>
                <span className="ltr-nums ms-auto font-semibold">{formatAed(d.offense.amount, locale)}</span>
              </summary>
              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <div className="space-y-2 text-sm">
                  <p><span className="text-slate-500">{t("disputes.reason")}:</span> {d.reason}</p>
                  <p><span className="text-slate-500">{t("common.party")}:</span> {d.offense.party?.fullName ?? "—"}</p>
                  <p><span className="text-slate-500">{t("common.details")}:</span> {[d.offense.description, d.offense.location].filter(Boolean).join(" · ")}</p>
                  <h3 className="pt-2 font-semibold">{t("disputes.attachments")}</h3>
                  <ul className="space-y-1">
                    {d.attachments.map((a) => (
                      <li key={a.id}><a className="text-brand-700 hover:underline" href={`/api/attachments/${a.id}`} target="_blank">📎 {a.fileName}</a> <span className="text-xs text-slate-400">({Math.ceil(a.sizeBytes / 1024)} KB)</span></li>
                    ))}
                  </ul>
                  <form action={uploadAttachment} className="flex items-center gap-2">
                    <input type="hidden" name="disputeId" value={d.id} />
                    <input type="file" name="file" required accept=".pdf,image/*" className="field py-1 text-xs" />
                    <button className="btn-secondary py-1 text-xs">{t("disputes.upload")}</button>
                  </form>
                </div>
                <form action={updateDispute} className="space-y-3">
                  <input type="hidden" name="id" value={d.id} />
                  <div>
                    <label className="field-label">{t("common.status")}</label>
                    <select name="status" defaultValue={d.status} className="field">
                      {STATUSES.map((s) => <option key={s} value={s}>{t(`dispute.${s}`)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">{t("common.notes")}</label>
                    <textarea name="notes" defaultValue={d.notes ?? ""} rows={3} className="field" />
                  </div>
                  <button className="btn-primary">{t("disputes.update")}</button>
                </form>
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
