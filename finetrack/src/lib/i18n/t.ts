import { en, type Dict } from "./en";

/** t("nav.dashboard"), t("status.ASSIGNED"). Missing keys fall back to English, then to the key. */
export function makeT(dict: Dict) {
  return (key: string, vars?: Record<string, string | number>) => {
    let s = lookup(dict, key) ?? lookup(en, key) ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

function lookup(obj: unknown, key: string): string | undefined {
  const v = key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
  return typeof v === "string" ? v : undefined;
}

export type T = ReturnType<typeof makeT>;
