import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n";
import { getUser, requestMagicLink } from "@/lib/auth";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { Logo } from "@/components/Logo";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { t } = await getI18n();
  if (await getUser()) redirect("/dashboard");

  async function send(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    let devLink: string | undefined;
    try {
      ({ devLink } = await requestMagicLink(email));
    } catch {
      redirect("/login?error=1");
    }
    redirect(`/login?sent=1${devLink ? `&dev=${encodeURIComponent(devLink)}` : ""}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 flex w-full max-w-sm items-center justify-between">
        <Logo />
        <LocaleSwitch back="/login" />
      </div>
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-bold">{t("auth.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("auth.subtitle")}</p>
        {sp.invalid && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{t("auth.invalid")}</p>}
        {sp.sent ? (
          <div className="mt-5 space-y-3">
            <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{t("auth.sent")}</p>
            {sp.dev && (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs">
                <p className="mb-2 text-amber-800">{t("auth.devLink")}</p>
                <a className="break-all font-mono text-brand-700 underline" href={sp.dev}>{sp.dev}</a>
              </div>
            )}
          </div>
        ) : (
          <form action={send} className="mt-5 space-y-3">
            <label className="field-label" htmlFor="email">{t("auth.email")}</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="field" dir="ltr" />
            {sp.error && <p className="text-sm text-red-600">{t("common.error", { message: "e-mail" })}</p>}
            <button className="btn-primary w-full">{t("auth.send")}</button>
          </form>
        )}
      </div>
    </div>
  );
}
