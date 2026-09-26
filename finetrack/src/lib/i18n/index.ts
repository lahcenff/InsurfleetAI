import { cookies } from "next/headers";
import { en, type Dict } from "./en";
import { ar } from "./ar";
import { makeT } from "./t";
export { makeT };

export type Locale = "en" | "ar";
export const LOCALE_COOKIE = "ft_locale";
const DICTS: Record<Locale, Dict> = { en, ar };

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return v === "ar" ? "ar" : "en";
}

export async function getI18n() {
  const locale = await getLocale();
  const dict = DICTS[locale];
  return { locale, dict, t: makeT(dict), dir: locale === "ar" ? ("rtl" as const) : ("ltr" as const) };
}

export function getDict(locale: Locale) {
  return DICTS[locale];
}

export type { T } from "./t";
export type { Dict };
