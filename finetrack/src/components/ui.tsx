import Link from "next/link";
import type { T } from "@/lib/i18n";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-brand-50 text-brand-700 ring-brand-100",
  gray: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

// Status always pairs a symbol with the label, never color alone.
export function MatchBadge({ status, t }: { status: string; t: T }) {
  const tone = status === "ASSIGNED" ? "green" : status === "TO_REVIEW" ? "amber" : "red";
  const icon = status === "ASSIGNED" ? "✓" : status === "TO_REVIEW" ? "?" : "✕";
  return (
    <Badge tone={tone}>
      <span aria-hidden className="me-1">{icon}</span>
      {t(`status.${status}`)}
    </Badge>
  );
}

export function BillingBadge({ status, t }: { status: string; t: T }) {
  const tone = status === "PAID" ? "green" : status === "BILLED" ? "blue" : status === "WRITTEN_OFF" ? "red" : "gray";
  return <Badge tone={tone}>{t(`billing.${status}`)}</Badge>;
}

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div role="status" className={`mb-4 rounded-md px-4 py-3 text-sm ${error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
      {error ?? ok}
    </div>
  );
}

export function Empty({ t }: { t: T }) {
  return <p className="py-10 text-center text-sm text-slate-400">{t("common.noData")}</p>;
}

export function Pagination({ page, pages, href, t }: { page: number; pages: number; href: (p: number) => string; t: T }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      {page > 1 ? <Link className="btn-secondary" href={href(page - 1)}>{t("common.prev")}</Link> : <span />}
      <span className="text-slate-500">{t("common.pageOf", { page, pages })}</span>
      {page < pages ? <Link className="btn-secondary" href={href(page + 1)}>{t("common.next")}</Link> : <span />}
    </div>
  );
}

export function Plate({ emirate, code, number }: { emirate?: string | null; code?: string | null; number: string }) {
  return (
    <span className="ltr-nums inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs">
      {emirate && <span className="text-slate-500">{emirate}</span>}
      {code && <span className="font-semibold">{code}</span>}
      <span>{number}</span>
    </span>
  );
}

/** Build a URL keeping current search params and overriding some. */
export function withParams(base: string, current: Record<string, string | undefined>, over: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...over })) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}
