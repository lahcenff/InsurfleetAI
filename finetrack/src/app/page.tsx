import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { getUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";

// Example prices (AED per vehicle per month, excl. VAT).
const TIERS = [
  { key: "starter", price: "9", from: false, highlight: false },
  { key: "pro", price: "15", from: false, highlight: true },
  { key: "enterprise", price: "25", from: true, highlight: false },
] as const;

export default async function Landing() {
  const { t } = await getI18n();
  const user = await getUser();
  const features = [1, 2, 3, 4, 5, 6];
  return (
    <div className="bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-5">
          <a href="#pricing" className="hidden text-sm text-slate-600 hover:text-slate-900 sm:inline">{t("landing.ctaSecondary")}</a>
          <LocaleSwitch />
          <Link href={user ? "/dashboard" : "/login"} className="btn-primary">
            {user ? t("nav.dashboard") : t("nav.signIn")}
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-20 pt-12 text-center sm:px-6 sm:pt-20">
        <p className="mb-4 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{t("landing.tagline")}</p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">{t("landing.title")}</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">{t("landing.subtitle")}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/login" className="btn-primary px-5 py-3 text-base">{t("landing.cta")}</Link>
          <a href="#pricing" className="btn-secondary px-5 py-3 text-base">{t("landing.ctaSecondary")}</a>
        </div>
      </section>

      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">{t("landing.problemTitle")}</h2>
            <p className="mt-3 text-slate-600">{t("landing.problem")}</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((i) => (
              <div key={i} className="card">
                <h3 className="font-semibold">{t(`landing.f${i}t`)}</h3>
                <p className="mt-2 text-sm text-slate-600">{t(`landing.f${i}`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">{t("landing.pricingTitle")}</h2>
            <p className="mt-2 text-sm text-slate-500">{t("landing.pricingSubtitle")}</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {TIERS.map((tier) => (
              <div key={tier.key} className={`relative flex flex-col rounded-2xl border p-6 ${tier.highlight ? "border-brand-500 shadow-lg ring-1 ring-brand-500" : "border-slate-200"}`}>
                {tier.highlight && (
                  <span className="absolute -top-3 start-6 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">{t("landing.popular")}</span>
                )}
                <h3 className="text-lg font-semibold">{t(`landing.${tier.key}`)}</h3>
                <p className="text-sm text-slate-500">{t(`landing.${tier.key}Desc`)}</p>
                <p className="mt-5">
                  {tier.from && <span className="me-1 text-sm text-slate-500">{t("landing.from")}</span>}
                  <span className="ltr-nums text-4xl font-extrabold">AED {tier.price}</span>
                  <span className="ms-1 text-sm text-slate-500">{t("landing.perVehicle")}</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2 text-sm">
                  {t(`landing.${tier.key}F`).split("|").map((f) => (
                    <li key={f} className="flex gap-2"><span aria-hidden className="text-brand-600">✓</span>{f}</li>
                  ))}
                </ul>
                <Link href="/login" className={`mt-8 ${tier.highlight ? "btn-primary" : "btn-secondary"}`}>
                  {tier.key === "enterprise" ? t("landing.contactUs") : t("landing.cta")}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">{t("landing.footer")}</footer>
    </div>
  );
}
