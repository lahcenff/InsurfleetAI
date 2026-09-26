import { requireCompany } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/db";
import { Badge, Flash, PageHeader } from "@/components/ui";
import { inviteMember, removeMember, saveSettings } from "./actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { company, companyId, user } = await requireCompany("ADMIN");
  const { t } = await getI18n();
  const members = await prisma.membership.findMany({ where: { companyId }, include: { user: true }, orderBy: { createdAt: "asc" } });

  return (
    <>
      <PageHeader title={t("settings.title")} />
      <Flash ok={sp.ok ? t("common.saved") : undefined} error={sp.error ? t("common.error", { message: sp.error }) : undefined} />

      <form action={saveSettings} className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-semibold">{t("settings.company")}</h2>
          <div><label className="field-label">{t("common.name")}</label><input name="name" defaultValue={company.name} className="field" /></div>
          <div><label className="field-label">{t("settings.trn")}</label><input name="trn" defaultValue={company.trn ?? ""} className="field" dir="ltr" /></div>
          <div>
            <label className="field-label">Language / اللغة</label>
            <select name="defaultLocale" defaultValue={company.defaultLocale} className="field"><option value="en">English</option><option value="ar">العربية</option></select>
          </div>
          <h2 className="pt-4 font-semibold">{t("settings.matching")}</h2>
          <div>
            <label className="field-label">{t("settings.grace")}</label>
            <input name="grace" type="number" min={0} max={1440} defaultValue={company.matchGraceMinutes} className="field" />
            <p className="mt-1 text-xs text-slate-500">{t("settings.graceHint")}</p>
          </div>
        </section>
        <section className="card space-y-3">
          <h2 className="font-semibold">{t("settings.fees")}</h2>
          <div>
            <label className="field-label">{t("settings.feeType")}</label>
            <select name="feeType" defaultValue={company.feeType} className="field">
              <option value="FIXED">{t("settings.FIXED")}</option>
              <option value="PERCENT">{t("settings.PERCENT")}</option>
            </select>
          </div>
          <div><label className="field-label">{t("settings.feeValue")}</label><input name="feeValue" type="number" step="0.01" min={0} defaultValue={Number(company.feeValue)} className="field" /></div>
          <div><label className="field-label">{t("settings.vat")}</label><input name="vat" type="number" step="0.01" min={0} max={100} defaultValue={Number(company.vatOnFeePercent)} className="field" /></div>
          <div><label className="field-label">{t("settings.prefix")}</label><input name="prefix" defaultValue={company.statementPrefix} maxLength={8} className="field" dir="ltr" /></div>
          <button className="btn-primary">{t("common.save")}</button>
        </section>
      </form>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">{t("settings.users")}</h2>
          <ul className="mb-4 divide-y divide-slate-100 text-sm">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2">
                <span className="ltr-nums">{m.user.email} {m.userId === user.id && <span className="text-slate-400">({t("settings.you")})</span>}</span>
                <span className="flex items-center gap-3">
                  <Badge tone={m.role === "ADMIN" ? "blue" : "gray"}>{t(`role.${m.role}`)}</Badge>
                  {m.userId !== user.id && (
                    <form action={removeMember}><input type="hidden" name="membershipId" value={m.id} /><button className="text-xs text-red-700 hover:underline">{t("common.delete")}</button></form>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <form action={inviteMember} className="flex flex-wrap gap-2">
            <input name="email" type="email" required placeholder="name@company.ae" className="field flex-1" dir="ltr" />
            <select name="role" className="field w-40"><option value="MANAGER">{t("role.MANAGER")}</option><option value="ADMIN">{t("role.ADMIN")}</option></select>
            <button className="btn-secondary">{t("settings.invite")}</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">{t("settings.inviteHint")}</p>
        </section>
        <section className="card">
          <h2 className="mb-1 font-semibold">{t("settings.connectors")}</h2>
          <p className="mb-4 text-sm text-slate-500">{t("settings.connectorsHint")}</p>
          <ul className="space-y-2 text-sm">
            {["Salik API", "Darb API", "RTA API", "Telematics (Teltonika, Samsara…)", "WhatsApp Business API"].map((c) => (
              <li key={c} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">{c}<Badge>{t("settings.comingSoon")}</Badge></li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
