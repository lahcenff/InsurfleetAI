import { requireCompany } from "@/lib/auth";
import { getStatementForCompany } from "@/lib/billing/statements";
import { renderStatementPdf } from "@/lib/billing/pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { companyId } = await requireCompany();
  const s = await getStatementForCompany(companyId, (await params).id);
  if (!s) return new Response("Not found", { status: 404 });
  const pdf = await renderStatementPdf(s);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${s.number}.pdf"` },
  });
}
