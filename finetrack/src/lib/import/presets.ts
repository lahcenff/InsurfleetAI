import type { ImportEntity, OffenseSource } from "@prisma/client";
import type { ColumnMap } from "./fields";

export interface MappingPreset {
  name: string;
  entity: ImportEntity;
  source?: OffenseSource;
  columnMap: ColumnMap;
  dateFormat: string;
  defaults: Record<string, string>;
}

// Built-in starting points based on the typical portal exports. Header names differ
// between portal versions, so every preset can be edited and saved per company.
export const BUILTIN_PRESETS: MappingPreset[] = [
  {
    name: "Salik — trips export",
    entity: "OFFENSE",
    source: "SALIK",
    columnMap: {
      externalRef: "Transaction ID",
      occurredAt: ["Trip Date", "Trip Time"],
      emirate: "Plate Source",
      plateCode: "Plate Category",
      plateNumber: "Plate Number",
      location: "Toll Gate",
      description: "Direction",
      amount: "Amount (AED)",
    },
    dateFormat: "dd/MM/yyyy HH:mm:ss",
    defaults: { category: "TOLL" },
  },
  {
    name: "Darb — toll transactions",
    entity: "OFFENSE",
    source: "DARB",
    columnMap: {
      externalRef: "Transaction No",
      occurredAt: "Transaction Date",
      rawPlate: "Plate Details",
      location: "Gate Name",
      amount: "Amount",
    },
    dateFormat: "dd-MM-yyyy HH:mm",
    defaults: { category: "TOLL", emirate: "" },
  },
  {
    name: "RTA — traffic fines",
    entity: "OFFENSE",
    source: "RTA",
    columnMap: {
      externalRef: "Fine Number",
      occurredAt: ["Fine Date", "Fine Time"],
      emirate: "Plate Source",
      plateCode: "Plate Code",
      plateNumber: "Plate Number",
      description: "Violation",
      location: "Location",
      amount: "Amount",
      blackPoints: "Black Points",
    },
    dateFormat: "dd/MM/yyyy HH:mm",
    defaults: { category: "FINE" },
  },
  {
    name: "Parking — fines",
    entity: "OFFENSE",
    source: "PARKING",
    columnMap: {
      externalRef: "Ticket No",
      occurredAt: "Issue Date",
      rawPlate: "Plate",
      location: "Zone",
      description: "Reason",
      amount: "Amount",
    },
    dateFormat: "dd/MM/yyyy HH:mm",
    defaults: { category: "PARKING" },
  },
];
