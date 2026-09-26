import Link from "next/link";
import type { PartyType, Prisma } from "@prisma/client";
import { requireCompany } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatAed } from "@/lib/money";
import { formatDubai } from "@/lib/time";
import { Badge, Empty, Flash, PageHeader, Pagination, withParams } from "@/components/ui";
import { saveParty } from "../fleet-actions";

const PAGE = 50;

export default async function PartiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db } = await requireCompany();
  const { t, locale } = await getI18n();
  const page = Math.max(1, Number(sp.page ?? 1));
  const q = sp.q?.trim();
  const where: Prisma.PartyWhereInput = {
    ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { licenseNumber: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { whatsappPhone: { contains: q } }] } : {}),
    ...(sp.type ? { type: sp.type as PartyType } : {}),
  };
  const [parties, total] = await Promise.all([
    db.party.findMany({ where, orderBy: { fullName: "asc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.party.count({ where }),
  ]);
  const sums = await db.offense.groupBy({ by: ["partyId"], where: { partyId: { in: parties.map((p) => p.id) } }, _sum: { amount: true }, _count: true });
  const sumBy = new Map(sums.map((x) => [x.partyId, x]));
  const edit = sp.edit ? await db.party.findFirst({ where: { id: sp.edit } }) : null;
  const soon = Date.now() + 30 * 86400_000;

  return (
    <>
      <PageHeader
        title={t("parties.title")}
        subtitle={t("parties.count", { count: total })}
        actions={<Link href="/import?entity=PARTY" className="btn-secondary">{t("vehicles.importCsv")}</Link>}
      />
      <Flash ok={sp.ok ? t("common.saved") : undefined} error={sp.error ? t("common.error", { message: sp.error }) : undefined} />

      <details className="card mb-6" open={!!edit}>
        <summary className="cursor-pointer font-semibold">{edit ? `${t("common.edit")} — ${edit.fullName}` : `+ ${t("parties.add")}`}</summary>
        <form action={saveParty} className="mt-4 grid gap-3 sm:grid-cols-4">
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <div>
            <label className="field-label">{t("common.type")}</label>
            <select name="type" defaultValue={edit?.type ?? "DRIVER"} className="field">
              <option value="DRIVER">{t("partyType.DRIVER")}</option>
              <option value="CUSTOMER">{t("partyType.CUSTOMER")}</option>
            </select>
          </div>
          <div><label className="field-label">{t("fields.fullName")}</label><input name="fullName" required defaultValue={edit?.fullName} className="field" /></div>
          <div><label className="field-label">{t("fields.companyName")}</label><input name="companyName" defaultValue={edit?.companyName ?? ""} className="field" /></div>
          <div><label className="field-label">{t("fields.whatsappPhone")}</label><input name="whatsappPhone" type="tel" placeholder="+9715…" defaultValue={edit?.whatsappPhone ?? ""} className="field" dir="ltr" /></div>
          <div><label className="field-label">{t("fields.email")}</label><input name="email" type="email" defaultValue={edit?.email ?? ""} className="field" dir="ltr" /></div>
          <div><label className="field-label">{t("fields.licenseNumber")}</label><input name="licenseNumber" defaultValue={edit?.licenseNumber ?? ""} className="field" dir="ltr" /></div>
          <div><label className="field-label">{t("fields.licenseExpiry")}</label><input name="licenseExpiry" type="date" defaultValue={edit?.licenseExpiry?.toISOString().slice(0, 10)} className="field" /></div>
          <div>
            <label className="field-label">Language / اللغة</label>
            <select name="preferredLocale" defaultValue={edit?.preferredLocale ?? "en"} className="field">
              <option value="en">English</option><option value="ar">العربية</option>
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-4">
            <button className="btn-primary">{t("common.save")}</button>
            {edit && <Link href="/parties" className="btn-secondary">{t("common.cancel")}</Link>}
          </div>
        </form>
      </details>

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder={t("common.search")} className="field max-w-xs" />
        <select name="type" defaultValue={sp.type ?? ""} className="field max-w-48">
          <option value="">{t("common.all")}</option>
          <option value="DRIVER">{t("partyType.DRIVER")}</option>
          <option value="CUSTOMER">{t("partyType.CUSTOMER")}</option>
        </select>
        <button className="btn-secondary">{t("common.filter")}</button>
      </form>

      <div className="card overflow-x-auto p-0">
        {parties.length === 0 ? <Empty t={t} /> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("common.name")}</th><th>{t("common.type")}</th><th>{t("fields.whatsappPhone")}</th><th>{t("fields.email")}</th>
                <th>{t("fields.licenseNumber")}</th><th>{t("fields.licenseExpiry")}</th><th>{t("nav.offenses")}</th><th />
              </tr>
            </thead>
            <tbody>
              {parties.map((p) => {
                const s = sumBy.get(p.id);
                const exp = p.licenseExpiry?.getTime();
                return (
                  <tr key={p.id}>
                    <td className="font-medium">{p.fullName}{p.companyName && <div className="text-xs text-slate-500">{p.companyName}</div>}</td>
                    <td>{t(`partyType.${p.type}`)}</td>
                    <td className="ltr-nums">{p.whatsappPhone}</td>
                    <td className="ltr-nums">{p.email}</td>
                    <td className="ltr-nums">{p.licenseNumber}</td>
                    <td>
                      <span className="ltr-nums">{formatDubai(p.licenseExpiry, locale, false)}</span>{" "}
                      {exp && exp < Date.now() ? <Badge tone="red">{t("parties.expired")}</Badge> : exp && exp < soon ? <Badge tone="amber">{t("parties.expiresSoon")}</Badge> : null}
                    </td>
                    <td>
                      <Link className="text-brand-700 hover:underline" href={`/offenses?party=${p.id}`}>
                        <span className="ltr-nums">{s?._count ?? 0}</span> · {formatAed(s?._sum.amount ?? 0, locale)}
                      </Link>
                    </td>
                    <td><Link href={withParams("/parties", sp, { edit: p.id })} className="text-xs text-brand-700 hover:underline">{t("common.edit")}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pages={Math.ceil(total / PAGE)} href={(p) => withParams("/parties", sp, { page: p })} t={t} />
    </>
  );
}
