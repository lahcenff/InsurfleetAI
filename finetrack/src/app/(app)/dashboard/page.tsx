import Link from "next/link";
import { requireCompany } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { dashboardData } from "@/lib/dashboard";
import { formatFils } from "@/lib/money";
import { dubaiMonthRange, dubaiParts, dubaiToUtc } from "@/lib/time";
import { formatPlate } from "@/lib/plate";
import { Flash, PageHeader } from "@/components/ui";
import { BarList, MonthColumns, SplitBar } from "@/components/charts";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { companyId } = await requireCompany();
  const { t, locale } = await getI18n();
  const [y, m] = (sp.month ?? "").split("-").map(Number);
  const { start, end } = dubaiMonthRange(y && m ? dubaiToUtc(y, m, 15) : new Date());
  const p = dubaiParts(start);
  const monthValue = `${p.year}-${String(p.month).padStart(2, "0")}`;
  const d = await dashboardData(companyId, start, end);
  const aed = (f: number) => formatFils(f, locale);

  // Fill the 6-month trend so empty months still show.
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const mm = new Date(Date.UTC(p.year, p.month - 1 - i, 1));
    months.push(`${mm.getUTCFullYear()}-${String(mm.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const trend = months.map((mo) => d.trend.find((r) => r.month === mo) ?? { month: mo, total: 0, recovered: 0 });

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        subtitle={t("common.timezoneNote")}
        actions={
          <form className="flex items-center gap-2">
            <label className="text-sm text-slate-500" htmlFor="month">{t("dashboard.month")}</label>
            <input id="month" type="month" name="month" defaultValue={monthValue} className="field py-1.5" />
            <button className="btn-secondary py-1.5">{t("common.apply")}</button>
          </form>
        }
      />
      <Flash error={sp.denied ? t("dashboard.denied") : undefined} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label={t("dashboard.monthTotal")} value={aed(d.total)} hint={t("dashboard.offenses", { count: d.count })} />
        <Tile label={t("dashboard.autoRate")} value={`${Math.round(d.autoRate * 100)}%`} hint={t("dashboard.autoRateHint")} />
        <Tile label={t("dashboard.recovered")} value={aed(d.recovered)} hint={d.total ? `${Math.round((d.recovered / d.total) * 100)}%` : "—"} />
        <Tile label={t("dashboard.notRecovered")} value={aed(d.notRecovered)} hint={t("dashboard.notRecoveredHint")} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="mb-4 font-semibold">{t("dashboard.recovery")}</h2>
          <SplitBar a={d.recovered} b={d.notRecovered} labelA={t("dashboard.recovered")} labelB={t("dashboard.notRecovered")} format={aed} />
          <h3 className="mb-3 mt-8 text-sm font-semibold text-slate-600">{t("dashboard.trend")}</h3>
          <MonthColumns rows={trend} labelA={t("dashboard.recovered")} labelB={t("dashboard.notRecovered")} format={aed} />
        </section>
        <section className="card">
          <h2 className="mb-4 font-semibold">{t("dashboard.queue")}</h2>
          <ul className="space-y-3 text-sm">
            <li><Link className="flex justify-between rounded-md bg-amber-50 px-3 py-2 text-amber-900 hover:bg-amber-100" href="/matching?status=TO_REVIEW"><span>? {t("status.TO_REVIEW")}</span><span className="ltr-nums font-semibold">{d.queue.TO_REVIEW ?? 0}</span></Link></li>
            <li><Link className="flex justify-between rounded-md bg-red-50 px-3 py-2 text-red-900 hover:bg-red-100" href="/matching?status=UNASSIGNED"><span>✕ {t("status.UNASSIGNED")}</span><span className="ltr-nums font-semibold">{d.queue.UNASSIGNED ?? 0}</span></Link></li>
            <li><Link className="flex justify-between rounded-md bg-emerald-50 px-3 py-2 text-emerald-900 hover:bg-emerald-100" href="/statements"><span>✓ {t("dashboard.unbilled", { count: "" }).trim()}</span><span className="ltr-nums font-semibold">{d.queue.ASSIGNED ?? 0}</span></Link></li>
          </ul>
          <h2 className="mb-4 mt-8 font-semibold">{t("dashboard.bySource")}</h2>
          <BarList format={aed} rows={d.bySource.map((s) => ({ key: s.source, label: t(`source.${s.source}`), value: s.amount, sub: `(${s.count})` }))} />
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-4 font-semibold">{t("dashboard.topVehicles")}</h2>
          <BarList
            format={aed}
            rows={d.topVehicles.map((v) => ({
              key: v.vehicle.id,
              label: <Link href={`/offenses?vehicle=${v.vehicle.id}&month=${monthValue}`} className="ltr-nums hover:underline">{formatPlate(v.vehicle.emirate, v.vehicle.plateCode, v.vehicle.plateNumber)} <span className="text-slate-400">{v.vehicle.make} {v.vehicle.model}</span></Link>,
              value: v.amount,
              sub: `(${v.count})`,
            }))}
          />
        </section>
        <section className="card">
          <h2 className="mb-4 font-semibold">{t("dashboard.topParties")}</h2>
          <BarList
            format={aed}
            rows={d.topParties.map((p) => ({
              key: p.party.id,
              label: <Link href={`/offenses?party=${p.party.id}&month=${monthValue}`} className="hover:underline">{p.party.fullName}</Link>,
              value: p.amount,
              sub: `(${p.count})`,
            }))}
          />
        </section>
      </div>
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="ltr-nums mt-2 text-3xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
