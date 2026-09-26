import { getI18n } from "@/lib/i18n";

export async function LocaleSwitch({ back = "/", className = "" }: { back?: string; className?: string }) {
  const { locale, t } = await getI18n();
  const to = locale === "ar" ? "en" : "ar";
  return (
    <a href={`/locale?to=${to}&back=${encodeURIComponent(back)}`} lang={to} className={`text-sm font-medium text-slate-600 hover:text-slate-900 ${className}`}>
      {t("nav.language")}
    </a>
  );
}
