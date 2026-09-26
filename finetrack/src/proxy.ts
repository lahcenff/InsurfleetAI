import { NextResponse, type NextRequest } from "next/server";

// Expose the current path to server components (used by the language switch to come back).
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/|favicon.ico|api/).*)"] };
