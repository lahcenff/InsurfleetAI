// All business timestamps live in Asia/Dubai (UTC+4, no daylight saving).
export const DUBAI_TZ = "Asia/Dubai";
const OFFSET_MS = 4 * 60 * 60 * 1000;

/** Build a UTC instant from a Dubai wall-clock time. Month is 1-based. */
export function dubaiToUtc(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date {
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - OFFSET_MS);
}

/** Wall-clock parts of an instant in Dubai. weekday: 0 = Sunday. */
export function dubaiParts(date: Date) {
  const t = new Date(date.getTime() + OFFSET_MS);
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1,
    day: t.getUTCDate(),
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
    second: t.getUTCSeconds(),
    weekday: t.getUTCDay(),
  };
}

/** First instant of the Dubai calendar month containing `date`, and of the next month. */
export function dubaiMonthRange(date: Date): { start: Date; end: Date } {
  const p = dubaiParts(date);
  const start = dubaiToUtc(p.year, p.month, 1);
  const end = p.month === 12 ? dubaiToUtc(p.year + 1, 1, 1) : dubaiToUtc(p.year, p.month + 1, 1);
  return { start, end };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Parse a date/time string using a format such as "dd/MM/yyyy HH:mm:ss".
 * Tokens: yyyy yy MM M MMM dd d HH H hh h mm ss a. Seconds and time are optional
 * in the input (a date-only value means 00:00). The result is interpreted in Dubai time.
 * format "auto" tries ISO 8601, then dd/MM/yyyy[ HH:mm[:ss]], then Excel serial numbers.
 */
export function parseDubaiDateTime(input: unknown, format = "auto"): Date | null {
  if (input == null || input === "") return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input === "number") return fromExcelSerial(input);
  const s = String(input).trim();
  if (!s) return null;
  if (format === "auto") return parseAuto(s);

  const tokenRe = /(yyyy|yy|MMM|MM|M|dd|d|HH|H|hh|h|mm|ss|a)/g;
  const order: string[] = [];
  const pattern = format
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(tokenRe, (tok) => {
      order.push(tok);
      switch (tok) {
        case "yyyy": return "(\\d{4})";
        case "MMM": return "([A-Za-z]{3})";
        case "a": return "([AaPp][Mm])";
        case "yy": case "MM": case "dd": case "HH": case "hh": case "mm": case "ss": return "(\\d{1,2})";
        default: return "(\\d{1,2})";
      }
    })
    .replace(/\s+/g, "\\s+");
  // Allow the time part (and seconds) to be missing.
  const m = new RegExp(`^${pattern}$`).exec(s) ?? tryShorter(s, format);
  if (!m) return parseAuto(s);
  if (m instanceof Date) return m;
  const v: Record<string, string> = {};
  order.forEach((tok, i) => (v[tok] = m[i + 1]));
  let year = v.yyyy ? +v.yyyy : v.yy ? 2000 + +v.yy : NaN;
  const month = v.MMM ? MONTHS.indexOf(v.MMM.toLowerCase()) + 1 : +(v.MM ?? v.M);
  const day = +(v.dd ?? v.d);
  let hour = +(v.HH ?? v.H ?? v.hh ?? v.h ?? 0);
  if (v.a) {
    const pm = v.a.toLowerCase() === "pm";
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  const minute = +(v.mm ?? 0);
  const second = +(v.ss ?? 0);
  if (!valid(year, month, day, hour, minute, second)) return null;
  return dubaiToUtc(year, month, day, hour, minute, second);
}

function tryShorter(s: string, format: string): Date | null {
  // Retry without seconds, then date only.
  const noSec = format.replace(/:ss/, "");
  if (noSec !== format) {
    const d = parseDubaiDateTime(s, noSec);
    if (d) return d;
  }
  const dateOnly = format.split(/\s+/)[0];
  if (dateOnly !== format && !/\s/.test(s)) return parseDubaiDateTime(s, dateOnly);
  return null;
}

function valid(y: number, mo: number, d: number, h: number, mi: number, s: number) {
  return (
    Number.isFinite(y) && y > 1990 && y < 2100 &&
    mo >= 1 && mo <= 12 && d >= 1 && d <= 31 &&
    h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59
  );
}

function parseAuto(s: string): Date | null {
  // ISO with explicit offset / Z: trust it.
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const [y, mo, d, h, mi, se] = m.slice(1).map((x) => (x ? +x : 0));
    return valid(y, mo, d, h, mi, se) ? dubaiToUtc(y, mo, d, h, mi, se) : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/.exec(s);
  if (m) {
    let [d, mo, y, h, mi, se] = m.slice(1, 7).map((x) => (x ? +x : 0));
    const ap = m[7]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return valid(y, mo, d, h, mi, se) ? dubaiToUtc(y, mo, d, h, mi, se) : null;
  }
  if (/^\d+(\.\d+)?$/.test(s)) return fromExcelSerial(+s);
  return null;
}

/** Excel serial date (days since 1899-12-30), interpreted as Dubai wall-clock. */
function fromExcelSerial(n: number): Date | null {
  if (n < 20000 || n > 80000) return null;
  const wall = new Date(Math.round((n - 25569) * 86400 * 1000));
  return new Date(wall.getTime() - OFFSET_MS);
}

export function formatDubai(date: Date | null | undefined, locale = "en", withTime = true): string {
  if (!date) return "—";
  // dd/MM/yyyy HH:mm with Latin digits in both languages: unambiguous and bidi-safe.
  void locale;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DUBAI_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}

/** "yyyy-MM-ddTHH:mm" in Dubai time, for <input type="datetime-local">. */
export function toDubaiInput(date: Date | null | undefined): string {
  if (!date) return "";
  const p = dubaiParts(date);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}
