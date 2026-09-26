import type { FullStatement } from "@/lib/billing/statements";
import type { T } from "@/lib/i18n";
import { formatAed } from "@/lib/money";
import { formatDubai } from "@/lib/time";
import { Plate } from "./ui";

/** Statement body, shared by the manager view and the public link. */
export function StatementView({ s, t, locale }: { s: FullStatement; t: T; locale: string }) {
  const feeLabel = s.feeType === "FIXED" ? `${formatAed(s.feeValue, locale)} / ${t("statements.perItem")}` : `${Number(s.feeValue)}%`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-xs uppercase text-slate-500">{t("common.party")}</p>
          <p className="text-lg font-semibold">{s.party.fullName}</p>
          {s.party.companyName && <p className="text-sm text-slate-500">{s.party.companyName}</p>}
        </div>
        <div className="text-end">
          <p className="ltr-nums text-lg font-semibold">{s.number}</p>
          <p className="text-sm text-slate-500">
            {t("statements.period")}: <span className="ltr-nums">{formatDubai(s.periodStart, locale, false)} → {formatDubai(new Date(s.periodEnd.getTime() - 1), locale, false)}</span>
          </p>
          <p className="text-sm text-slate-500">{t("statements.issued")}: <span className="ltr-nums">{formatDubai(s.issuedAt, locale, false)}</span></p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="data-table">
          <thead>
            <tr><th>{t("common.dateDubai")}</th><th>{t("common.source")}</th><th>{t("common.plate")}</th><th>{t("common.details")}</th><th className="text-end">{t("common.amount")}</th><th className="text-end">{t("statements.fee")}</th><th className="text-end">{t("common.total")}</th></tr>
          </thead>
          <tbody>
            {s.lines.map((l) => {
              const o = l.offense;
              return (
                <tr key={l.id}>
                  <td className="ltr-nums whitespace-nowrap">{formatDubai(o.occurredAt, locale)}</td>
                  <td>{t(`source.${o.source}`)}</td>
                  <td>{o.vehicle ? <Plate emirate={o.vehicle.emirate} code={o.vehicle.plateCode} number={o.vehicle.plateNumber} /> : o.rawPlate}</td>
                  <td className="max-w-72"><span className="ltr-nums text-xs text-slate-500">{o.externalRef}</span><div className="truncate">{[o.description, o.location].filter(Boolean).join(" · ")}</div></td>
                  <td className="ltr-nums whitespace-nowrap text-end">{formatAed(l.amount, locale)}</td>
                  <td className="ltr-nums whitespace-nowrap text-end">{formatAed(Number(l.fee) + Number(l.vat), locale)}</td>
                  <td className="ltr-nums whitespace-nowrap text-end font-medium">{formatAed(l.total, locale)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="ms-auto w-full max-w-sm space-y-1 text-sm">
        <div className="flex justify-between"><dt>{t("statements.subtotal")}</dt><dd className="ltr-nums">{formatAed(s.subtotal, locale)}</dd></div>
        <div className="flex justify-between"><dt>{t("statements.fee")} ({feeLabel})</dt><dd className="ltr-nums">{formatAed(s.feeTotal, locale)}</dd></div>
        <div className="flex justify-between"><dt>{t("statements.vat")} ({Number(s.vatOnFeePercent)}%)</dt><dd className="ltr-nums">{formatAed(s.vatTotal, locale)}</dd></div>
        <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold"><dt>{t("statements.due")}</dt><dd className="ltr-nums">{formatAed(s.total, locale)}</dd></div>
      </dl>
      <p className="text-xs text-slate-400">{t("common.timezoneNote")}</p>
    </div>
  );
}
