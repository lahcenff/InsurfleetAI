"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string; icon: string; badge?: number }[] }) {
  const path = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((i) => {
        const active = path === i.href || path.startsWith(i.href + "/");
        return (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${active ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
            >
              <span aria-hidden className="w-4 text-center">{i.icon}</span>
              <span className="flex-1">{i.label}</span>
              {!!i.badge && <span className="ltr-nums rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-800">{i.badge}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
