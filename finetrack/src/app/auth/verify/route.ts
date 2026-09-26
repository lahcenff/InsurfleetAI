import { NextResponse, type NextRequest } from "next/server";
import { consumeMagicLink } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const ok = token ? await consumeMagicLink(token) : false;
  return NextResponse.redirect(new URL(ok ? "/dashboard" : "/login?invalid=1", req.url));
}
