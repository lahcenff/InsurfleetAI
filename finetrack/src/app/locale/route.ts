import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE } from "@/lib/i18n";

export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to") === "ar" ? "ar" : "en";
  const back = req.nextUrl.searchParams.get("back") ?? "/";
  const safeBack = back.startsWith("/") && !back.startsWith("//") ? back : "/";
  const res = NextResponse.redirect(new URL(safeBack, req.url));
  res.cookies.set(LOCALE_COOKIE, to, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
  return res;
}
