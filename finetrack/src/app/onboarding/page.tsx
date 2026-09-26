import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n";
import { requireUser, setActiveCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { Logo } from "@/components/Logo";

export default async function Onboarding() {
  const user = await requireUser();
  const { t } = await getI18n();
  if (user.memberships.length) redirect("/dashboard");

  async function create(formData: FormData) {
    "use server";
    const u = await requireUser();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "company";
    const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
    const company = await prisma.$transaction(async (tx) => {
      const c = await tx.company.create({ data: { name, slug, memberships: { create: { userId: u.id, role: "ADMIN" } } } });
      await audit(tx, { companyId: c.id, actorId: u.id, action: "company.create", entityType: "Company", entityId: c.id, after: { name } });
      return c;
    });
    await setActiveCompany(company.id);
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8"><Logo /></div>
      <form action={create} className="card w-full max-w-md space-y-4">
        <div>
          <h1 className="text-xl font-bold">{t("onboarding.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("onboarding.subtitle")}</p>
        </div>
        <div>
          <label className="field-label" htmlFor="name">{t("onboarding.companyName")}</label>
          <input id="name" name="name" required className="field" />
        </div>
        <button className="btn-primary w-full">{t("onboarding.create")}</button>
      </form>
    </div>
  );
}
