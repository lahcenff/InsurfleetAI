import type { ImportEntity } from "@prisma/client";

export type FieldType = "string" | "int" | "money" | "datetime" | "date" | "emirate" | "enum" | "plate";

export interface FieldDef {
  key: string;
  label: string; // i18n key suffix: fields.<key>
  type: FieldType;
  required?: boolean;
  options?: string[];
  /** Alternative requirement: at least one of these keys must be mapped. */
  requiredOneOf?: string[];
  /** Header names commonly used for this field (lowercase), for auto-mapping. */
  aliases: string[];
}

export const FIELD_DEFS: Record<ImportEntity, FieldDef[]> = {
  VEHICLE: [
    { key: "rawPlate", label: "rawPlate", type: "plate", aliases: ["plate", "full plate", "vehicle plate"] },
    { key: "emirate", label: "emirate", type: "emirate", aliases: ["emirate", "plate source", "source", "city", "registration emirate"] },
    { key: "plateCode", label: "plateCode", type: "string", aliases: ["plate code", "code", "category", "plate category"] },
    { key: "plateNumber", label: "plateNumber", type: "string", requiredOneOf: ["plateNumber", "rawPlate"], aliases: ["plate number", "plate no", "plate no.", "number"] },
    { key: "make", label: "make", type: "string", aliases: ["make", "brand", "manufacturer"] },
    { key: "model", label: "model", type: "string", aliases: ["model"] },
    { key: "year", label: "year", type: "int", aliases: ["year", "model year"] },
    { key: "status", label: "status", type: "enum", options: ["ACTIVE", "IN_MAINTENANCE", "INACTIVE", "SOLD"], aliases: ["status"] },
    { key: "externalId", label: "externalId", type: "string", aliases: ["id", "vehicle id", "unit id", "asset id"] },
  ],
  PARTY: [
    { key: "type", label: "partyType", type: "enum", options: ["DRIVER", "CUSTOMER"], aliases: ["type", "party type", "role"] },
    { key: "fullName", label: "fullName", type: "string", required: true, aliases: ["name", "full name", "driver name", "customer name"] },
    { key: "companyName", label: "companyName", type: "string", aliases: ["company", "company name"] },
    { key: "whatsappPhone", label: "whatsappPhone", type: "string", aliases: ["whatsapp", "phone", "mobile", "mobile number"] },
    { key: "email", label: "email", type: "string", aliases: ["email", "e-mail"] },
    { key: "licenseNumber", label: "licenseNumber", type: "string", aliases: ["license", "licence", "license number", "licence number", "driving license"] },
    { key: "licenseExpiry", label: "licenseExpiry", type: "date", aliases: ["license expiry", "licence expiry", "expiry", "license expiry date"] },
    { key: "emiratesId", label: "emiratesId", type: "string", aliases: ["emirates id", "eid"] },
    { key: "externalId", label: "externalId", type: "string", aliases: ["id", "customer id", "driver id", "employee id"] },
  ],
  ASSIGNMENT: [
    { key: "rawPlate", label: "rawPlate", type: "plate", aliases: ["plate", "vehicle", "vehicle plate"] },
    { key: "emirate", label: "emirate", type: "emirate", aliases: ["emirate", "plate source"] },
    { key: "plateCode", label: "plateCode", type: "string", aliases: ["plate code", "code"] },
    { key: "plateNumber", label: "plateNumber", type: "string", requiredOneOf: ["plateNumber", "rawPlate"], aliases: ["plate number", "plate no"] },
    { key: "partyExternalId", label: "partyExternalId", type: "string", requiredOneOf: ["partyExternalId", "partyLicense", "partyName"], aliases: ["driver id", "customer id", "employee id"] },
    { key: "partyLicense", label: "partyLicense", type: "string", aliases: ["license", "licence", "license number"] },
    { key: "partyName", label: "partyName", type: "string", aliases: ["driver", "customer", "driver name", "customer name", "name"] },
    { key: "startsAt", label: "startsAt", type: "datetime", required: true, aliases: ["start", "from", "start date", "pickup", "check out", "checkout", "shift start"] },
    { key: "endsAt", label: "endsAt", type: "datetime", aliases: ["end", "to", "end date", "return", "check in", "checkin", "shift end"] },
    { key: "kind", label: "assignmentKind", type: "enum", options: ["RENTAL_CONTRACT", "ALLOCATION", "SHIFT"], aliases: ["type", "kind"] },
    { key: "reference", label: "reference", type: "string", aliases: ["contract", "contract no", "agreement", "reference", "shift id"] },
  ],
  OFFENSE: [
    { key: "externalRef", label: "externalRef", type: "string", required: true, aliases: ["transaction id", "transaction no", "ticket number", "fine number", "fine no", "ticket no", "reference", "trip id"] },
    { key: "rawPlate", label: "rawPlate", type: "plate", aliases: ["plate", "vehicle", "plate details"] },
    { key: "emirate", label: "emirate", type: "emirate", aliases: ["plate source", "emirate", "source", "plate emirate"] },
    { key: "plateCode", label: "plateCode", type: "string", aliases: ["plate code", "plate category", "code"] },
    { key: "plateNumber", label: "plateNumber", type: "string", requiredOneOf: ["plateNumber", "rawPlate"], aliases: ["plate number", "plate no", "plate no."] },
    { key: "occurredAt", label: "occurredAt", type: "datetime", required: true, aliases: ["date", "trip date", "fine date", "violation date", "date time", "datetime", "transaction date", "issue date", "issued at", "ticket date"] },
    { key: "amount", label: "amount", type: "money", required: true, aliases: ["amount", "amount (aed)", "fine amount", "toll", "value", "charge"] },
    { key: "location", label: "location", type: "string", aliases: ["location", "gate", "toll gate", "gate name", "place", "street", "zone", "area"] },
    { key: "description", label: "description", type: "string", aliases: ["description", "violation", "offence", "offense", "fine description", "reason", "direction"] },
    { key: "category", label: "category", type: "enum", options: ["TOLL", "FINE", "PARKING"], aliases: ["category", "type"] },
    { key: "blackPoints", label: "blackPoints", type: "int", aliases: ["black points", "points"] },
    { key: "dueDate", label: "dueDate", type: "date", aliases: ["due date", "due"] },
  ],
};

/** Column mapping: field key → one header, or several headers joined with a space (date + time). */
export type ColumnMap = Record<string, string | string[]>;

/** Guess a mapping from file headers using the aliases. */
export function autoMap(entity: ImportEntity, headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const used = new Set<string>();
  const norm = (h: string) => h.trim().toLowerCase().replace(/[_\s]+/g, " ");
  for (const f of FIELD_DEFS[entity]) {
    const hit = headers.find((h) => !used.has(h) && (f.aliases.includes(norm(h)) || norm(h) === f.key.toLowerCase()));
    if (hit) {
      map[f.key] = hit;
      used.add(hit);
    }
  }
  return map;
}

export function missingRequired(entity: ImportEntity, map: ColumnMap, defaults: Record<string, string> = {}): string[] {
  const has = (k: string) => {
    const v = map[k];
    return (Array.isArray(v) ? v.length > 0 : !!v) || !!defaults[k];
  };
  const missing: string[] = [];
  for (const f of FIELD_DEFS[entity]) {
    if (f.required && !has(f.key)) missing.push(f.key);
    if (f.requiredOneOf && !f.requiredOneOf.some(has)) missing.push(f.requiredOneOf.join("|"));
  }
  return [...new Set(missing)];
}
