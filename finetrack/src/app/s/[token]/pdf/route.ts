import { getPublicStatement } from "@/lib/billing/statements";
import { renderStatementPdf } from "@/lib/billing/pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const s = await getPublicStatement((await params).token);
  if (!s) return new Response("Not found", { status: 404 });
  const pdf = await renderStatementPdf(s);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${s.number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
