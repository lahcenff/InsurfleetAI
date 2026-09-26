"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { Dict } from "@/lib/i18n/en";
import { makeT } from "@/lib/i18n/t";
import { FIELD_DEFS, missingRequired, type ColumnMap } from "@/lib/import/fields";
import type { ImportSummary } from "@/lib/import/service";
import { analyzeImport, executeImport, type AnalyzeResult } from "./actions";

type Entity = "VEHICLE" | "PARTY" | "ASSIGNMENT" | "OFFENSE";
const ENTITIES: Entity[] = ["OFFENSE", "VEHICLE", "PARTY", "ASSIGNMENT"];
const SOURCES = ["SALIK", "DARB", "RTA", "POLICE", "PARKING", "OTHER"];

export interface MappingOption {
  value: string; // "saved:<id>" | "preset:<index>"
  label: string;
  entity: Entity;
  source: string | null;
}

export function ImportWizard({ dict, mappings, initialEntity }: { dict: Dict; mappings: MappingOption[]; initialEntity?: Entity }) {
  const t = useMemo(() => makeT(dict), [dict]);
  const [entity, setEntity] = useState<Entity>(initialEntity ?? "OFFENSE");
  const [source, setSource] = useState("SALIK");
  const [mapping, setMapping] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [dateFormat, setDateFormat] = useState("auto");
  const [saveAs, setSaveAs] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fields = FIELD_DEFS[entity];
  const missing = missingRequired(entity, columnMap, defaults);
  const available = mappings.filter((m) => m.entity === entity && (entity !== "OFFENSE" || !m.source || m.source === source));

  function reset() {
    setAnalysis(null);
    setSummary(null);
    setError(null);
  }

  function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.set("entity", entity);
    fd.set("mapping", mapping);
    fd.set("file", file);
    setError(null);
    start(async () => {
      const r = await analyzeImport(fd);
      if (!r.ok) return setError(r.error ?? "error");
      setAnalysis(r);
      setColumnMap(r.columnMap);
      setDefaults(r.defaults);
      setDateFormat(r.dateFormat);
    });
  }

  function run() {
    if (!file) return;
    const fd = new FormData();
    fd.set("entity", entity);
    fd.set("source", source);
    fd.set("file", file);
    fd.set("columnMap", JSON.stringify(columnMap));
    fd.set("defaults", JSON.stringify(Object.fromEntries(Object.entries(defaults).filter(([, v]) => v))));
    fd.set("dateFormat", dateFormat);
    fd.set("saveAs", saveAs);
    setError(null);
    start(async () => {
      const r = await executeImport(fd);
      if (!r.ok) return setError(r.error ?? "error");
      setSummary(r.summary!);
    });
  }

  const setCol = (key: string, idx: 0 | 1, header: string) => {
    setColumnMap((m) => {
      const cur = m[key] ? (Array.isArray(m[key]) ? [...(m[key] as string[])] : [m[key] as string]) : [];
      cur[idx] = header;
      const cols = cur.filter(Boolean);
      const next = { ...m };
      if (cols.length === 0) delete next[key];
      else next[key] = cols.length === 1 ? cols[0] : cols;
      return next;
    });
  };
  const colAt = (key: string, idx: number) => {
    const v = columnMap[key];
    return (Array.isArray(v) ? v[idx] : idx === 0 ? v : undefined) ?? "";
  };

  if (summary) {
    const m = summary.matching;
    return (
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">{t("import.step3")}</h2>
        {summary.sameFileImportedAt && (
          <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">
            ⚠ {t("import.sameFile", { date: new Date(summary.sameFileImportedAt).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }) })}
          </p>
        )}
        <dl className="grid grid-cols-3 gap-4 text-center">
          <Stat label={t("import.inserted")} value={summary.inserted} tone="text-emerald-700" />
          <Stat label={t("import.duplicates")} value={summary.duplicates} tone="text-slate-600" />
          <Stat label={t("import.failed")} value={summary.failed} tone={summary.failed ? "text-red-700" : "text-slate-600"} />
        </dl>
        {m && <p className="text-sm">{t("import.matched", { assigned: m.ASSIGNED, review: m.TO_REVIEW, unassigned: m.UNASSIGNED })}</p>}
        {summary.errors.length > 0 && (
          <div className="max-h-72 overflow-auto rounded border border-slate-200">
            <table className="data-table">
              <thead><tr><th>{t("import.row")}</th><th>{t("import.field")}</th><th>{t("import.errors")}</th></tr></thead>
              <tbody>
                {summary.errors.map((e, i) => (
                  <tr key={i}><td className="ltr-nums">{e.row}</td><td>{e.field.split("|").map((k) => t(`fields.${k}`)).join(" / ")}</td><td>{e.message}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex gap-2">
          {entity === "OFFENSE" && <Link href="/matching" className="btn-primary">{t("import.goMatching")}</Link>}
          <button onClick={() => { reset(); setFile(null); }} className="btn-secondary">{t("import.another")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={analyze} className="card grid gap-4 sm:grid-cols-4">
        <h2 className="text-lg font-semibold sm:col-span-4">{t("import.step1")}</h2>
        <div>
          <label className="field-label">{t("import.entity")}</label>
          <select className="field" value={entity} onChange={(e) => { setEntity(e.target.value as Entity); setMapping(""); reset(); }}>
            {ENTITIES.map((en) => <option key={en} value={en}>{t(`entity.${en}`)}</option>)}
          </select>
        </div>
        {entity === "OFFENSE" && (
          <div>
            <label className="field-label">{t("import.source")}</label>
            <select className="field" value={source} onChange={(e) => { setSource(e.target.value); setMapping(""); }}>
              {SOURCES.map((s) => <option key={s} value={s}>{t(`source.${s}`)}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="field-label">{t("import.savedMapping")}</label>
          <select className="field" value={mapping} onChange={(e) => setMapping(e.target.value)}>
            <option value="">{t("import.newMapping")}</option>
            {available.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">{t("import.file")}</label>
          <input type="file" accept=".csv,.xlsx,text/csv" required className="field py-1.5" onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }} />
        </div>
        <div className="sm:col-span-4">
          <button className="btn-primary" disabled={!file || pending}>{pending && !analysis ? "…" : t("import.analyze")}</button>
        </div>
      </form>

      {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{t("common.error", { message: error })}</p>}

      {analysis && (
        <div className="card space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("import.step2")}</h2>
            <span className="text-sm text-slate-500">{t("import.rowsFound", { count: analysis.total, cols: analysis.headers.length })}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>{t("import.field")}</th><th>{t("import.column")}</th><th>{t("import.column2")}</th><th>{t("import.defaultValue")}</th></tr></thead>
              <tbody>
                {fields.map((f) => {
                  const req = f.required || f.requiredOneOf;
                  const isMissing = missing.some((m) => m.split("|").includes(f.key));
                  return (
                    <tr key={f.key} className={isMissing ? "bg-red-50/60" : ""}>
                      <td className="whitespace-nowrap font-medium">{t(`fields.${f.label}`)}{req && <span className="text-red-600"> *</span>}</td>
                      <td>
                        <select className="field py-1" value={colAt(f.key, 0)} onChange={(e) => setCol(f.key, 0, e.target.value)}>
                          <option value="">{t("import.notMapped")}</option>
                          {analysis.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </td>
                      <td>
                        {f.type === "datetime" && (
                          <select className="field py-1" value={colAt(f.key, 1)} onChange={(e) => setCol(f.key, 1, e.target.value)}>
                            <option value="">—</option>
                            {analysis.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        )}
                      </td>
                      <td>
                        {(f.type === "enum" || f.type === "emirate") && (
                          <select className="field py-1" value={defaults[f.key] ?? ""} onChange={(e) => setDefaults((d) => ({ ...d, [f.key]: e.target.value }))}>
                            <option value="">—</option>
                            {(f.type === "emirate" ? ["DXB", "AUH", "SHJ", "AJM", "UAQ", "RAK", "FUJ"] : f.options ?? []).map((o) => (
                              <option key={o} value={o}>{f.type === "emirate" ? t(`emirate.${o}`) : o}</option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">{t("import.dateFormat")}</label>
              <input className="field font-mono" dir="ltr" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">{t("import.dateFormatHint")}</p>
            </div>
            <div>
              <label className="field-label">{t("import.saveAs")} ({t("common.optional")})</label>
              <input className="field" value={saveAs} placeholder={entity === "OFFENSE" ? `${t(`source.${source}`)} export` : ""} onChange={(e) => setSaveAs(e.target.value)} />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">{t("import.preview")}</h3>
            <div className="max-h-64 overflow-auto rounded border border-slate-200">
              <table className="data-table text-xs">
                <thead><tr>{analysis.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {analysis.preview.map((r, i) => <tr key={i}>{analysis.headers.map((h) => <td key={h} className="whitespace-nowrap">{r[h]}</td>)}</tr>)}
                </tbody>
              </table>
            </div>
          </div>

          {missing.length > 0 && (
            <p className="text-sm text-red-700">{t("import.missing", { fields: missing.map((m) => m.split("|").map((k) => t(`fields.${k}`)).join(" / ")).join(", ") })}</p>
          )}
          <button onClick={run} className="btn-primary" disabled={pending || missing.length > 0}>
            {pending ? t("import.running") : t("import.run", { count: analysis.total })}
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <dd className={`ltr-nums text-3xl font-bold ${tone}`}>{value}</dd>
      <dt className="mt-1 text-xs text-slate-500">{label}</dt>
    </div>
  );
}
