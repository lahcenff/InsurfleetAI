import { requireCompany } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { db } = await requireCompany();
  const a = await db.attachment.findFirst({ where: { id: (await params).id } });
  if (!a) return new Response("Not found", { status: 404 });
  const data = await getStorage().get(a.storageKey);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
