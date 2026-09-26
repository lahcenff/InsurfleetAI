import type { ConnectorProvider } from "@prisma/client";
import { prisma } from "../db";
import { runImport } from "../import/service";
import type { Connector } from "./types";

class NotAvailableYet implements Connector {
  constructor(public provider: ConnectorProvider) {}
  async testConnection() {
    return { ok: false, message: `${this.provider} connector is not available in V1` };
  }
  async fetch(): Promise<never> {
    throw new Error(`${this.provider} connector is not available in V1`);
  }
}

// Replace a placeholder with a real implementation when API access is granted.
export const CONNECTORS: Record<ConnectorProvider, Connector> = {
  SALIK_API: new NotAvailableYet("SALIK_API"),
  DARB_API: new NotAvailableYet("DARB_API"),
  RTA_API: new NotAvailableYet("RTA_API"),
  TELEMATICS: new NotAvailableYet("TELEMATICS"),
};

/** Run one connector sync through the shared ingestion pipeline (e.g. from a cron job). */
export async function syncConnector(connectorId: string) {
  const c = await prisma.connector.findUniqueOrThrow({ where: { id: connectorId } });
  const impl = CONNECTORS[c.provider];
  try {
    const res = await impl.fetch(c.config as Record<string, unknown>, c.lastSyncAt);
    const summary = await runImport({
      companyId: c.companyId,
      userId: null,
      entity: res.entity,
      source: res.source,
      rows: res.rows,
      columnMap: res.columnMap,
      dateFormat: res.dateFormat,
      defaults: res.defaults,
      channel: "API",
      connectorId: c.id,
    });
    await prisma.connector.update({ where: { id: c.id }, data: { lastSyncAt: res.nextSyncAt, lastError: null } });
    return summary;
  } catch (e) {
    await prisma.connector.update({ where: { id: c.id }, data: { lastError: String(e) } });
    throw e;
  }
}
