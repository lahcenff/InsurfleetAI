import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n";
import { getPublicStatement } from "@/lib/billing/statements";
import { StatementView } from "@/components/StatementView";
import { LocaleSwitch } from "@/components/LocaleSwitch";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Public, read-only statement for drivers / customers. Access = unguessable token, no account.
export default async function PublicStatement({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t, locale } = await getI18n();
  const s = await getPublicStatement(token);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-lg font-bold">{s?.company.name ?? t("appName")}</p>
        <LocaleSwitch back={`/s/${token}`} />
      </div>
      {!s ? (
        <div className="card text-center text-slate-600">{t("public.expired")}</div>
      ) : (
        <div className="card space-y-4">
          <h1 className="text-xl font-bold">{t("public.title")}</h1>
          <p>{t("public.hello", { name: s.party.fullName })}</p>
          <p className="text-sm text-slate-600">{t("public.intro", { company: s.company.name })}</p>
          <a href={`/s/${token}/pdf`} className="btn-primary">⇩ {t("public.downloadPdf")}</a>
          <StatementView s={s} t={t} locale={locale} />
          <p className="text-sm text-slate-500">{t("public.questions", { company: s.company.name })}</p>
        </div>
      )}
      <p className="mt-6 text-center text-xs text-slate-400">{t("public.poweredBy")}</p>
    </div>
  );
}
