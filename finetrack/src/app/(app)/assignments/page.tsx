import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireCompany } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatDubai, toDubaiInput } from "@/lib/time";
import { Badge, Empty, Flash, PageHeader, Pagination, Plate, withParams } from "@/components/ui";
import { deleteAssignment, endAssignmentNow, saveAssignment } from "../fleet-actions";

const PAGE = 50;
const KINDS = ["RENTAL_CONTRACT", "ALLOCATION", "SHIFT"] as const;

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db } = await requireCompany();
  const { t, locale } = await getI18n();
  const page = Math.max(1, Number(sp.page ?? 1));
  const where: Prisma.AssignmentWhereInput = {
    ...(sp.vehicle ? { vehicleId: sp.vehicle } : {}),
    ...(sp.party ? { partyId: sp.party } : {}),
    ...(sp.ongoing ? { endsAt: null } : {}),
  };
  const [rows, total, vehicles, parties] = await Promise.all([
    db.assignment.findMany({ where, include: { vehicle: true, party: true }, orderBy: { startsAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.assignment.count({ where }),
    db.vehicle.findMany({ orderBy: [{ emirate: "asc" }, { plateNumber: "asc" }], select: { id: true, emirate: true, plateCode: true, plateNumber: true } }),
    db.party.findMany({ orderBy: { fullName: "asc" }, select: { id: true, fullName: true, type: true } }),
  ]);
  const edit = sp.edit ? await db.assignment.findFirst({ where: { id: sp.edit } }) : null;

  // Overlap detection for the rows on screen: same vehicle, different party, intersecting intervals.
  const vehicleIds = [...new Set(rows.map((r) => r.vehicleId))];
  const siblings = await db.assignment.findMany({ where: { vehicleId: { in: vehicleIds } }, select: { id: true, vehicleId: true, partyId: true, startsAt: true, endsAt: true } });
  const INF = Number.MAX_SAFE_INTEGER;
  const overlaps = new Set(
    rows.filter((r) => siblings.some((o) =>
      o.id !== r.id && o.vehicleId === r.vehicleId && o.partyId !== r.partyId &&
      o.startsAt.getTime() < (r.endsAt?.getTime() ?? INF) && r.startsAt.getTime() < (o.endsAt?.getTime() ?? INF),
    )).map((r) => r.id),
  );
  const plate = (v: { emirate: string; plateCode: string; plateNumber: string }) => `${v.emirate} ${v.plateCode} ${v.plateNumber}`;
  const error = sp.error === "dates" ? `${t("fields.endsAt")} > ${t("fields.startsAt")}` : undefined;

  return (
    <>
      <PageHeader
        title={t("assignments.title")}
        subtitle={t("assignments.subtitle")}
        actions={<Link href="/import?entity=ASSIGNMENT" className="btn-secondary">{t("vehicles.importCsv")}</Link>}
      />
      <Flash ok={sp.ok ? t("assignments.rematched", { count: sp.ok }) : undefined} error={error} />

      <details className="card mb-6" open={!!edit}>
        <summary className="cursor-pointer font-semibold">{edit ? t("common.edit") : `+ ${t("assignments.add")}`}</summary>
        <form action={saveAssignment} className="mt-4 grid gap-3 sm:grid-cols-3">
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <div>
            <label className="field-label">{t("common.vehicle")}</label>
            <select name="vehicleId" required defaultValue={edit?.vehicleId ?? sp.vehicle} className="field" dir="ltr">
              {vehicles.map((v) => <option key={v.id} value={v.id}>{plate(v)}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">{t("common.party")}</label>
            <select name="partyId" required defaultValue={edit?.partyId ?? sp.party} className="field">
              {parties.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({t(`partyType.${p.type}`)})</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">{t("fields.assignmentKind")}</label>
            <select name="kind" defaultValue={edit?.kind ?? "RENTAL_CONTRACT"} className="field">
              {KINDS.map((k) => <option key={k} value={k}>{t(`assignmentKind.${k}`)}</option>)}
            </select>
          </div>
          <div><label className="field-label">{t("fields.startsAt")} (Dubai)</label><input type="datetime-local" name="startsAt" required defaultValue={toDubaiInput(edit?.startsAt)} className="field" /></div>
          <div><label className="field-label">{t("fields.endsAt")} (Dubai) — {t("common.optional")}</label><input type="datetime-local" name="endsAt" defaultValue={toDubaiInput(edit?.endsAt)} className="field" /></div>
          <div><label className="field-label">{t("fields.reference")}</label><input name="reference" defaultValue={edit?.reference ?? ""} className="field" /></div>
          <div className="flex gap-2 sm:col-span-3">
            <button className="btn-primary">{t("common.save")}</button>
            {edit && <Link href="/assignments" className="btn-secondary">{t("common.cancel")}</Link>}
          </div>
        </form>
      </details>

      <form className="mb-4 flex flex-wrap gap-2">
        <select name="vehicle" defaultValue={sp.vehicle ?? ""} className="field max-w-56" dir="ltr">
          <option value="">{t("common.vehicle")}: {t("common.all")}</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{plate(v)}</option>)}
        </select>
        <select name="party" defaultValue={sp.party ?? ""} className="field max-w-56">
          <option value="">{t("common.party")}: {t("common.all")}</option>
          {parties.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ongoing" value="1" defaultChecked={!!sp.ongoing} /> {t("assignments.ongoing")}</label>
        <button className="btn-secondary">{t("common.filter")}</button>
      </form>

      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? <Empty t={t} /> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("common.vehicle")}</th><th>{t("common.party")}</th><th>{t("fields.assignmentKind")}</th>
                <th>{t("fields.startsAt")}</th><th>{t("fields.endsAt")}</th><th>{t("fields.reference")}</th><th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className={overlaps.has(a.id) ? "bg-amber-50/60" : ""}>
                  <td><Plate emirate={a.vehicle.emirate} code={a.vehicle.plateCode} number={a.vehicle.plateNumber} /></td>
                  <td>{a.party.fullName}</td>
                  <td>{t(`assignmentKind.${a.kind}`)}</td>
                  <td className="ltr-nums whitespace-nowrap">{formatDubai(a.startsAt, locale)}</td>
                  <td className="whitespace-nowrap">
                    {a.endsAt ? <span className="ltr-nums">{formatDubai(a.endsAt, locale)}</span> : <Badge tone="blue">{t("assignments.ongoing")}</Badge>}
                    {overlaps.has(a.id) && <div className="mt-1"><Badge tone="amber">⚠ {t("assignments.overlap")}</Badge></div>}
                  </td>
                  <td className="ltr-nums">{a.reference}</td>
                  <td>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <Link href={withParams("/assignments", sp, { edit: a.id })} className="text-brand-700 hover:underline">{t("common.edit")}</Link>
                      {!a.endsAt && (
                        <form action={endAssignmentNow}><input type="hidden" name="id" value={a.id} /><button className="text-brand-700 hover:underline">{t("assignments.endNow")}</button></form>
                      )}
                      <form action={deleteAssignment}><input type="hidden" name="id" value={a.id} /><button className="text-red-700 hover:underline">{t("common.delete")}</button></form>
                      <Link href={`/activity?entity=${a.id}`} className="text-slate-500 hover:underline">{t("assignments.history")}</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pages={Math.ceil(total / PAGE)} href={(p) => withParams("/assignments", sp, { page: p })} t={t} />
    </>
  );
}
