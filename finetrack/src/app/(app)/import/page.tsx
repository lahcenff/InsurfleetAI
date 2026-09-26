import { requireCompany } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { BUILTIN_PRESETS } from "@/lib/import/presets";
import { formatDubai } from "@/lib/time";
import { Badge, PageHeader } from "@/components/ui";
import { ImportWizard, type MappingOption } from "./ImportWizard";

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db } = await requireCompany();
  const { t, dict, locale } = await getI18n();
  const [saved, batches] = await Promise.all([
    db.importMapping.findMany({ orderBy: { name: "asc" } }),
    db.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const mappings: MappingOption[] = [
    ...saved.map((m) => ({ value: `saved:${m.id}`, label: `★ ${m.name}`, entity: m.entity, source: m.source })),
    ...BUILTIN_PRESETS.map((p, i) => ({ value: `preset:${i}`, label: p.name, entity: p.entity, source: p.source ?? null })),
  ];
  const initial = ["VEHICLE", "PARTY", "ASSIGNMENT", "OFFENSE"].includes(sp.entity ?? "") ? (sp.entity as MappingOption["entity"]) : undefined;

  return (
    <>
      <PageHeader title={t("import.title")} subtitle={t("import.subtitle")} />
      <ImportWizard dict={dict} mappings={mappings} initialEntity={initial} />

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto p-0 lg:col-span-2">
          <h2 className="px-5 pt-4 font-semibold">{t("import.history")}</h2>
          <table className="data-table mt-3">
            <thead>
              <tr><th>{t("common.date")}</th><th>{t("import.entity")}</th><th>{t("common.details")}</th><th>{t("import.inserted")}</th><th>{t("import.duplicates")}</th><th>{t("import.failed")}</th></tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="ltr-nums whitespace-nowrap">{formatDubai(b.createdAt, locale)}</td>
                  <td>{t(`entity.${b.entity}`)}{b.source && <> · {t(`source.${b.source}`)}</>}</td>
                  <td className="max-w-48 truncate">{b.channel === "API" ? <Badge tone="blue">API</Badge> : b.fileName}</td>
                  <td className="ltr-nums">{b.inserted}</td>
                  <td className="ltr-nums">{b.duplicates}</td>
                  <td className="ltr-nums">{b.status === "FAILED" ? <Badge tone="red">FAILED</Badge> : b.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 className="font-semibold">{t("import.templates")}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(["VEHICLE", "PARTY", "ASSIGNMENT", "OFFENSE"] as const).map((e) => (
              <li key={e}><a className="text-brand-700 hover:underline" href={`/api/templates/${e.toLowerCase()}`}>⇩ {t(`entity.${e}`)} (.csv)</a></li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
