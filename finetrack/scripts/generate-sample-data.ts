// Writes the demo dataset as portal-style CSV exports into ./sample-data,
// to test the import screens on an empty company. `npm run sample:csv`
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildFixtures } from "../prisma/fixtures";

const out = path.join(process.cwd(), "sample-data");
mkdirSync(out, { recursive: true });
const end = process.env.SEED_END_DATE ? new Date(process.env.SEED_END_DATE) : new Date();
const fx = buildFixtures(end);
const files: Record<string, string> = {
  "1-vehicles.csv": fx.vehiclesCsv,
  "2-drivers-customers.csv": fx.partiesCsv,
  "3-assignments.csv": fx.assignmentsCsv,
  "4-salik-trips.csv": fx.salikCsv,
  "5-darb-transactions.csv": fx.darbCsv,
  "6-rta-fines.csv": fx.rtaCsv,
  "7-parking-fines.csv": fx.parkingCsv,
};
for (const [name, content] of Object.entries(files)) writeFileSync(path.join(out, name), "﻿" + content);
console.log(`Wrote ${Object.keys(files).length} files to ${out}`, fx.stats);
