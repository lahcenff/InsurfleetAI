import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Raw client. Only use it for cross-tenant work (auth, public statement links, seed). */
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Models that carry a companyId column and must be tenant-scoped.
const TENANT_MODELS = new Set<string>([
  "Vehicle", "Party", "Assignment", "Offense", "ImportMapping", "ImportBatch", "Connector",
  "Statement", "Dispute", "Attachment", "Notification", "AuditLog",
]);

const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  "update", "updateMany", "delete", "deleteMany", "count", "aggregate", "groupBy", "upsert",
]);

/**
 * Tenant-scoped client: every query on a tenant model is filtered by companyId,
 * and every create is stamped with it. A company can never read or write another
 * company's rows through this client.
 */
export function tenantDb(companyId: string) {
  return prisma.$extends({
    name: "tenant",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a = (args ?? {}) as Record<string, any>;
          if (WHERE_OPS.has(operation)) a.where = { ...(a.where ?? {}), companyId };
          if (operation === "create") a.data = { ...a.data, companyId };
          if (operation === "upsert") a.create = { ...a.create, companyId };
          if (operation === "createMany" || operation === "createManyAndReturn") {
            a.data = (Array.isArray(a.data) ? a.data : [a.data]).map((d: object) => ({ ...d, companyId }));
          }
          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
export type Tx = Prisma.TransactionClient;
