import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";

/** Append an audit entry. Call inside the same transaction as the change. */
export async function audit(
  tx: Tx,
  entry: {
    companyId: string;
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.auditLog.create({
    data: {
      ...entry,
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}

function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v));
}
