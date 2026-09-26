import Link from "next/link";
import type { Prisma, VehicleStatus } from "@prisma/client";
import { requireCompany } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { EMIRATES } from "@/lib/plate";
import { formatAed } from "@/lib/money";
import { Badge, Empty, Flash, PageHeader, Pagination, Plate, withParams } from "@/components/ui";
import { addVehicle, setVehicleStatus } from "../fleet-actions";

const STATUSES: VehicleStatus[] = ["ACTIVE", "IN_MAINTENANCE", "INACTIVE", "SOLD"];
const PAGE = 50;

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db } = await requireCompany();
  const { t, locale } = await getI18n();
  const page = Math.max(1, Number(sp.page ?? 1));
  const q = sp.q?.trim();
  const where: Prisma.VehicleWhereInput = {
    ...(q ? { OR: [{ plateNumber: { contains: q.replace(/\D/g, "") || q } }, { make: { contains: q, mode: "insensitive" } }, { model: { contains: q, mode: "insensitive" } }] } : {}),
    ...(sp.status ? { status: sp.status as VehicleStatus } : {}),
  };
  const [vehicles, total] = await Promise.all([
    db.vehicle.findMany({ where, orderBy: [{ emirate: "asc" }, { plateNumber: "asc" }], skip: (page - 1) * PAGE, take: PAGE }),
    db.vehicle.count({ where }),
  ]);
  const sums = await db.offense.groupBy({
    by: ["vehicleId"],
    where: { vehicleId: { in: vehicles.map((v) => v.id) } },
    _sum: { amount: true },
    _count: true,
  });
  const sumBy = new Map(sums.map((x) => [x.vehicleId, x]));
  const error = sp.error === "exists" ? t("vehicles.exists") : sp.error ? t("common.error", { message: sp.error }) : undefined;

  return (
    <>
      <PageHeader
        title={t("vehicles.title")}
        subtitle={t("vehicles.count", { count: total })}
        actions={<Link href="/import?entity=VEHICLE" className="btn-secondary">{t("vehicles.importCsv")}</Link>}
      />
      <Flash ok={sp.ok ? t("common.saved") : undefined} error={error} />

      <details className="card mb-6">
        <summary className="cursor-pointer font-semibold">+ {t("vehicles.add")}</summary>
        <form action={addVehicle} className="mt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <label className="field-label">{t("fields.emirate")}</label>
            <select name="emirate" className="field" required>
              {EMIRATES.map((e) => <option key={e} value={e}>{t(`emirate.${e}`)}</option>)}
            </select>
          </div>
          <div><label className="field-label">{t("fields.plateCode")}</label><input name="plateCode" className="field" dir="ltr" /></div>
          <div><label className="field-label">{t("fields.plateNumber")}</label><input name="plateNumber" required inputMode="numeric" className="field" dir="ltr" /></div>
          <div>
            <label className="field-label">{t("fields.status")}</label>
            <select name="status" className="field">{STATUSES.map((s) => <option key={s} value={s}>{t(`vehicleStatus.${s}`)}</option>)}</select>
          </div>
          <div><label className="field-label">{t("fields.make")}</label><input name="make" className="field" /></div>
          <div><label className="field-label">{t("fields.model")}</label><input name="model" className="field" /></div>
          <div><label className="field-label">{t("fields.year")}</label><input name="year" type="number" min="1990" max="2100" className="field" /></div>
          <div className="flex items-end"><button className="btn-primary w-full">{t("common.add")}</button></div>
        </form>
      </details>

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder={t("common.search")} className="field max-w-xs" />
        <select name="status" defaultValue={sp.status ?? ""} className="field max-w-48">
          <option value="">{t("common.all")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`vehicleStatus.${s}`)}</option>)}
        </select>
        <button className="btn-secondary">{t("common.filter")}</button>
      </form>

      <div className="card overflow-x-auto p-0">
        {vehicles.length === 0 ? <Empty t={t} /> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("common.plate")}</th><th>{t("fields.make")}</th><th>{t("fields.model")}</th><th>{t("fields.year")}</th>
                <th>{t("vehicles.offenses")}</th><th>{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const s = sumBy.get(v.id);
                return (
                  <tr key={v.id}>
                    <td><Plate emirate={v.emirate} code={v.plateCode} number={v.plateNumber} /></td>
                    <td>{v.make}</td>
                    <td>{v.model}</td>
                    <td className="ltr-nums">{v.year}</td>
                    <td>
                      <Link className="text-brand-700 hover:underline" href={`/offenses?vehicle=${v.id}`}>
                        <span className="ltr-nums">{s?._count ?? 0}</span> · {formatAed(s?._sum.amount ?? 0, locale)}
                      </Link>
                    </td>
                    <td>
                      <form action={setVehicleStatus} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={v.id} />
                        <select name="status" defaultValue={v.status} className="field py-1 text-xs">
                          {STATUSES.map((s) => <option key={s} value={s}>{t(`vehicleStatus.${s}`)}</option>)}
                        </select>
                        <button className="text-xs text-brand-700 hover:underline">{t("common.save")}</button>
                        {v.status !== "ACTIVE" && <Badge>{t(`vehicleStatus.${v.status}`)}</Badge>}
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pages={Math.ceil(total / PAGE)} href={(p) => withParams("/vehicles", sp, { page: p })} t={t} />
    </>
  );
}
