// Connector contract for future API integrations (Salik, Darb, RTA, telematics).
//
// A connector only knows how to *fetch* data from its provider and return raw rows
// with a column mapping. Everything else — normalisation, de-duplication, matching,
// audit — is done by the shared ingestion pipeline (`runImport`), exactly like a
// CSV upload. Adding a provider = adding one class; the core does not change.

import type { ConnectorProvider, ImportEntity, OffenseSource } from "@prisma/client";
import type { ColumnMap } from "../import/fields";
import type { RawRow } from "../import/parse";

export interface ConnectorFetchResult {
  entity: ImportEntity; // OFFENSE for toll/fine portals, ASSIGNMENT for telematics (driver log-ins)
  source?: OffenseSource;
  rows: RawRow[];
  columnMap: ColumnMap;
  dateFormat?: string;
  defaults?: Record<string, string>;
  /** Cursor to store for the next incremental sync. */
  nextSyncAt: Date;
}

export interface Connector {
  provider: ConnectorProvider;
  /** Validate credentials/config before saving. */
  testConnection(config: Record<string, unknown>): Promise<{ ok: boolean; message?: string }>;
  /** Fetch everything since the last sync. */
  fetch(config: Record<string, unknown>, since: Date | null): Promise<ConnectorFetchResult>;
}
