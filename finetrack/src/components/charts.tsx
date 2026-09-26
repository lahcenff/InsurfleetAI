// Minimal, dependency-free charts rendered as HTML. Magnitude uses one hue
// (brand blue); the recovered/not-recovered split uses two categorical slots
// with a legend and direct labels. Every mark has a native hover tooltip.

const SERIES_1 = "#2a78d6"; // blue
const SERIES_2 = "#eb6834"; // orange

export function BarList({ rows, format }: { rows: { key: string; label: React.ReactNode; value: number; sub?: string }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} title={`${typeof r.label === "string" ? r.label : ""} ${format(r.value)}${r.sub ? ` · ${r.sub}` : ""}`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="ltr-nums shrink-0 font-medium text-slate-700">{format(r.value)}{r.sub && <span className="ms-1 text-xs font-normal text-slate-400">{r.sub}</span>}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-e-full" style={{ width: `${(r.value / max) * 100}%`, background: SERIES_1, minWidth: r.value ? 4 : 0 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SplitBar({ a, b, labelA, labelB, format }: { a: number; b: number; labelA: string; labelB: string; format: (v: number) => string }) {
  const total = a + b || 1;
  const pa = (a / total) * 100;
  return (
    <div>
      <div className="flex h-4 gap-[2px] overflow-hidden rounded">
        {a > 0 && <div title={`${labelA}: ${format(a)} (${pa.toFixed(0)}%)`} style={{ width: `${pa}%`, background: SERIES_1 }} />}
        {b > 0 && <div title={`${labelB}: ${format(b)} (${(100 - pa).toFixed(0)}%)`} style={{ width: `${100 - pa}%`, background: SERIES_2 }} />}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <li className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_1 }} />{labelA} <span className="ltr-nums font-semibold">{format(a)}</span><span className="ltr-nums text-slate-400">{pa.toFixed(0)}%</span></li>
        <li className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_2 }} />{labelB} <span className="ltr-nums font-semibold">{format(b)}</span><span className="ltr-nums text-slate-400">{(100 - pa).toFixed(0)}%</span></li>
      </ul>
    </div>
  );
}

/** Vertical bars per month; the recovered share is a stacked segment. */
export function MonthColumns({ rows, labelA, labelB, format }: { rows: { month: string; total: number; recovered: number }[]; labelA: string; labelB: string; format: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div>
      <div className="flex h-40 items-end gap-3 border-b border-slate-200" dir="ltr">
        {rows.map((r) => (
          <div key={r.month} className="flex h-full flex-1 flex-col justify-end" title={`${r.month} — ${labelA}: ${format(r.recovered)} · ${labelB}: ${format(r.total - r.recovered)}`}>
            <div className="flex flex-col gap-[2px]" style={{ height: `${(r.total / max) * 100}%` }}>
              <div className="rounded-t" style={{ flex: r.total - r.recovered, background: SERIES_2, minHeight: r.total - r.recovered > 0 ? 2 : 0 }} />
              <div style={{ flex: r.recovered, background: SERIES_1, minHeight: r.recovered > 0 ? 2 : 0 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-3 text-center text-xs text-slate-500" dir="ltr">
        {rows.map((r) => <div key={r.month} className="flex-1">{r.month.slice(2).replace("-", "/")}</div>)}
      </div>
    </div>
  );
}
