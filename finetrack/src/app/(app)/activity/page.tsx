import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireCompany } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatDubai } from "@/lib/time";
import { Empty, PageHeader, Pagination, withParams } from "@/components/ui";

const PAGE = 50;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db } = await requireCompany();
  const { t, locale } = await getI18n();
  const page = Math.max(1, Number(sp.page ?? 1));
  const where: Prisma.AuditLogWhereInput = {
    ...(sp.entity ? { entityId: sp.entity } : {}),
    ...(sp.type ? { entityType: sp.type } : {}),
  };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, include: { actor: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.auditLog.count({ where }),
  ]);
  const types = ["Assignment", "Offense", "Statement", "Dispute", "Vehicle", "Party", "ImportBatch", "Company", "User"];

  return (
    <>
      <PageHeader title={t("activity.title")} subtitle={t("common.timezoneNote")} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/activity" className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${!sp.type && !sp.entity ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200"}`}>{t("common.all")}</Link>
        {types.map((ty) => (
          <Link key={ty} href={`/activity?type=${ty}`} className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${sp.type === ty ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200"}`}>{ty}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? <Empty t={t} /> : (
          <table className="data-table">
            <thead><tr><th>{t("activity.when")}</th><th>{t("activity.who")}</th><th>{t("activity.what")}</th><th>{t("activity.change")}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="ltr-nums whitespace-nowrap">{formatDubai(r.createdAt, locale)}</td>
                  <td className="ltr-nums">{r.actor?.email ?? t("activity.system")}</td>
                  <td>
                    <code className="text-xs">{r.action}</code>
                    <div><Link className="text-xs text-brand-700 hover:underline" href={`/activity?entity=${r.entityId}`}>{r.entityType} · {r.entityId.slice(-8)}</Link></div>
                  </td>
                  <td className="max-w-xl">
                    <Diff before={r.before} after={r.after} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pages={Math.ceil(total / PAGE)} href={(p) => withParams("/activity", sp, { page: p })} t={t} />
    </>
  );
}

function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(
    (k) => !["id", "companyId", "createdAt", "updatedAt"].includes(k) && JSON.stringify(b[k]) !== JSON.stringify(a[k]),
  );
  if (!keys.length) return <span className="text-xs text-slate-400">—</span>;
  const fmt = (v: unknown) => (v == null ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <ul className="ltr-nums space-y-0.5 font-mono text-xs" dir="ltr">
      {keys.slice(0, 8).map((k) => (
        <li key={k} className="truncate">
          <span className="text-slate-500">{k}:</span>{" "}
          {k in b && <span className="text-red-700 line-through">{fmt(b[k])}</span>}{" "}
          {k in a && <span className="text-emerald-700">{fmt(a[k])}</span>}
        </li>
      ))}
    </ul>
  );
}
