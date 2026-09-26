import { headers } from "next/headers";
import { requireCompany } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { NavLinks } from "@/components/NavLinks";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { Logo } from "@/components/Logo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, company, role, db } = await requireCompany();
  const { t } = await getI18n();
  const toReview = await db.offense.count({ where: { matchStatus: "TO_REVIEW" } });
  const back = (await headers()).get("x-pathname") ?? "/dashboard";

  const items = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: "◧" },
    { href: "/import", label: t("nav.import"), icon: "⇪" },
    { href: "/matching", label: t("nav.matching"), icon: "⇄", badge: toReview },
    { href: "/offenses", label: t("nav.offenses"), icon: "≣" },
    { href: "/statements", label: t("nav.statements"), icon: "▤" },
    { href: "/disputes", label: t("nav.disputes"), icon: "⚑" },
    { href: "/vehicles", label: t("nav.vehicles"), icon: "◉" },
    { href: "/parties", label: t("nav.parties"), icon: "☺" },
    { href: "/assignments", label: t("nav.assignments"), icon: "◷" },
    { href: "/activity", label: t("nav.activity"), icon: "↻" },
    ...(role === "ADMIN" ? [{ href: "/settings", label: t("nav.settings"), icon: "⚙" }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-e">
        <div className="flex items-center justify-between px-4 py-4">
          <Logo />
        </div>
        <details className="group lg:open" open>
          <summary className="cursor-pointer list-none px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 lg:hidden">
            ☰ {company.name}
          </summary>
          <nav className="px-2 pb-4">
            <NavLinks items={items} />
          </nav>
        </details>
        <div className="hidden border-t border-slate-100 px-4 py-4 text-xs text-slate-500 lg:absolute lg:bottom-0 lg:block lg:w-full">
          <p className="truncate font-semibold text-slate-700">{company.name}</p>
          <p className="truncate">{user.email} · {t(`role.${role}`)}</p>
          <div className="mt-3 flex items-center justify-between">
            <LocaleSwitch back={back} />
            <form action="/logout" method="post">
              <button className="text-sm text-slate-500 hover:text-slate-900">{t("nav.logout")}</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        <div className="mb-4 flex items-center justify-end gap-4 lg:hidden">
          <LocaleSwitch back={back} />
          <form action="/logout" method="post"><button className="text-sm text-slate-500">{t("nav.logout")}</button></form>
        </div>
        {children}
      </main>
    </div>
  );
}
