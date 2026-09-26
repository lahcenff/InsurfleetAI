// Deterministic, realistic demo dataset for FineTrack UAE.
// 50 vehicles, 30 drivers/customers, assignment history, and ~500 fines & tolls
// over the last 3 months — produced as CSV files in the same formats as the
// Salik / Darb / RTA / parking portal exports, so they go through the real import.

import Papa from "papaparse";
import { dubaiParts, dubaiToUtc } from "../src/lib/time";

// ── seeded PRNG ──────────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(42);
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
const chance = (p: number) => rnd() < p;
const weighted = <T,>(items: [T, number][]) => {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[items.length - 1][0];
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const z = (n: number) => String(n).padStart(2, "0");
const fmt = {
  ddmmyyyy: (d: Date) => { const p = dubaiParts(d); return `${z(p.day)}/${z(p.month)}/${p.year}`; },
  hhmmss: (d: Date) => { const p = dubaiParts(d); return `${z(p.hour)}:${z(p.minute)}:${z(p.second)}`; },
  hhmm: (d: Date) => { const p = dubaiParts(d); return `${z(p.hour)}:${z(p.minute)}`; },
  iso: (d: Date) => { const p = dubaiParts(d); return `${p.year}-${z(p.month)}-${z(p.day)} ${z(p.hour)}:${z(p.minute)}`; },
  dash: (d: Date) => { const p = dubaiParts(d); return `${z(p.day)}-${z(p.month)}-${p.year} ${z(p.hour)}:${z(p.minute)}`; },
};
const EMIRATE_NAME = { DXB: "Dubai", AUH: "Abu Dhabi", SHJ: "Sharjah", AJM: "Ajman" } as const;
type Em = keyof typeof EMIRATE_NAME;

// ── reference data ───────────────────────────────────────────────────────────
const MODELS: [string, string, number][] = [
  ["Toyota", "Corolla", 6], ["Toyota", "Camry", 4], ["Toyota", "Land Cruiser", 2], ["Toyota", "Hiace", 3],
  ["Nissan", "Sunny", 5], ["Nissan", "Patrol", 2], ["Nissan", "Altima", 3], ["Nissan", "Urvan", 2],
  ["Mitsubishi", "Attrage", 4], ["Mitsubishi", "Pajero", 1], ["Hyundai", "Accent", 4], ["Hyundai", "Elantra", 3],
  ["Hyundai", "Tucson", 2], ["Kia", "Pegas", 3], ["Kia", "Sportage", 2], ["MG", "ZS", 2], ["MG", "5", 2],
  ["Chevrolet", "Captiva", 1], ["Honda", "Civic", 2], ["Ford", "Transit", 2], ["Lexus", "ES 350", 1],
];

const DRIVERS = [
  "Muhammad Asif Khan", "Rajesh Kumar Nair", "Joseph Dela Cruz", "Abdul Rahman Siddiqui", "Sanjay Pillai",
  "Imran Hussain", "Mark Anthony Reyes", "Suresh Babu", "Tariq Mehmood", "Ahmed Fathy Mostafa",
  "Bilal Ahmed Qureshi", "Nabin Gurung", "Anil Thomas Varghese", "Kamal Uddin", "Ramon Santos",
  "Shahid Iqbal", "Vijay Menon", "Mohamed Nasser Ali",
];
const CUSTOMERS: { name: string; company?: string }[] = [
  { name: "Khalid Al Mansoori" }, { name: "Fatima Al Hashimi" }, { name: "James Whitfield" },
  { name: "Priya Sharma" }, { name: "Omar Haddad" }, { name: "Sophie Laurent" },
  { name: "Hassan Al Zaabi", company: "Zaabi Contracting LLC" }, { name: "Elena Petrova" },
  { name: "Daniel O'Connor", company: "Blue Harbour Events FZ-LLC" }, { name: "Aisha Rahman" },
  { name: "Youssef Benali" }, { name: "Liam Chen", company: "Nexa Logistics DMCC" },
];

const SALIK_GATES = ["Al Barsha", "Al Garhoud Bridge", "Al Maktoum Bridge", "Al Mamzar North", "Al Mamzar South", "Al Safa", "Al Safa South", "Airport Tunnel", "Jebel Ali", "Business Bay Crossing"];
const DARB_GATES = ["Sheikh Zayed Bridge", "Sheikh Khalifa Bridge", "Al Maqta Bridge", "Mussafah Bridge"];
const RTA_ROADS = ["Sheikh Zayed Road", "Al Khail Road", "Emirates Road", "Al Ittihad Road", "Hessa Street", "Umm Suqeim Street", "Al Wasl Road", "Sheikh Mohammed Bin Zayed Road"];
const AUH_ROADS = ["Sheikh Khalifa Bin Zayed Street", "Al Khaleej Al Arabi Street", "Abu Dhabi-Al Ain Road", "Mussafah Road"];
const PARKING_ZONES = ["Zone 318C - Al Barsha 1", "Zone 214 - Deira Al Rigga", "Zone 365 - Dubai Marina", "Zone 128 - Bur Dubai", "Zone 337 - JLT", "Zone 612 - Business Bay"];
const RTA_VIOLATIONS: [string, number, number, number][] = [
  // description, amount, black points, weight
  ["Exceeding the maximum speed limit by not more than 20 km/h", 300, 0, 30],
  ["Exceeding the maximum speed limit by more than 30 km/h", 1000, 0, 8],
  ["Exceeding the maximum speed limit by more than 40 km/h", 1500, 6, 3],
  ["Jumping a red light", 1000, 12, 3],
  ["Sudden swerving", 1000, 4, 4],
  ["Not keeping a safe distance", 400, 4, 8],
  ["Using mobile phone while driving", 800, 4, 7],
  ["Driver not wearing seatbelt", 400, 4, 6],
  ["Entering yellow box junction", 500, 0, 4],
  ["Driving on hard shoulder", 1000, 6, 2],
];
const PARKING_VIOLATIONS: [string, number][] = [
  ["Failure to display a valid parking ticket", 150],
  ["Exceeding the parking duration", 100],
  ["Parking in a place not designated for parking", 200],
];

// ── tariffs ──────────────────────────────────────────────────────────────────
/** Salik variable pricing: AED 6 at weekday peaks (06–10, 16–20), AED 4 otherwise, free 01–06. */
export function salikTariff(d: Date): number {
  const p = dubaiParts(d);
  if (p.hour >= 1 && p.hour < 6) return 0;
  if (p.weekday === 0) return 4; // Sunday
  return (p.hour >= 6 && p.hour < 10) || (p.hour >= 16 && p.hour < 20) ? 6 : 4;
}
/** Darb: AED 4 at peaks (07–09, 17–19) Monday–Saturday, free otherwise. */
export function darbTariff(d: Date): number {
  const p = dubaiParts(d);
  if (p.weekday === 0) return 0;
  return (p.hour >= 7 && p.hour < 9) || (p.hour >= 17 && p.hour < 19) ? 4 : 0;
}

// ── generation ───────────────────────────────────────────────────────────────
export interface Fixtures {
  vehiclesCsv: string;
  partiesCsv: string;
  assignmentsCsv: string;
  salikCsv: string;
  darbCsv: string;
  rtaCsv: string;
  parkingCsv: string;
  stats: Record<string, number>;
}

interface V { emirate: Em; code: string; number: string; make: string; model: string; year: number; status: string; unit: string; fleet: "staff" | "rental" }
interface P { id: string; type: "DRIVER" | "CUSTOMER"; name: string; company?: string; phone: string; email: string; license: string; expiry: string }
interface A { v: V; p: P; start: Date; end: Date | null; kind: string; ref: string }

export function buildFixtures(end: Date = new Date(), seed = 42, offenseCount = 500): Fixtures {
  rnd = mulberry32(seed);
  const start = new Date(end.getTime() - 91 * DAY);

  // Vehicles
  const vehicles: V[] = [];
  const used = new Set<string>();
  const emirates: [Em, number][] = [["DXB", 36], ["AUH", 8], ["SHJ", 4], ["AJM", 2]];
  for (const [em, n] of emirates) {
    for (let i = 0; i < n; i++) {
      let code: string, num: string, key: string;
      do {
        code = em === "DXB" ? pick(["A", "B", "C", "D", "F", "G", "H", "K", "L", "M", "N", "P", "R", "S", "T", "AA", "BB", "CC"])
          : em === "AUH" ? String(pick([1, 2, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 16, 17, 50]))
          : em === "SHJ" ? String(pick([1, 2, 3])) : pick(["A", "B", "C", "D", "E"]);
        num = String(int(em === "DXB" ? 10000 : 1000, 99999));
        key = `${em}-${code}-${num}`;
      } while (used.has(key));
      used.add(key);
      const [make, model] = weighted(MODELS.map(([a, b, w]) => [[a, b] as const, w]));
      vehicles.push({ emirate: em, code, number: num, make, model, year: int(2021, 2026), status: "ACTIVE", unit: `U-${String(vehicles.length + 1).padStart(3, "0")}`, fleet: "rental" });
    }
  }
  // First 20 = staff fleet (delivery / company cars), rest = rental fleet. Shuffle emirates a bit.
  vehicles.sort(() => rnd() - 0.5);
  vehicles.forEach((v, i) => (v.fleet = i < 20 ? "staff" : "rental"));
  vehicles[7].status = "IN_MAINTENANCE";
  vehicles[33].status = "IN_MAINTENANCE";
  vehicles[48].status = "SOLD";

  // Drivers & customers
  const parties: P[] = [];
  DRIVERS.forEach((name, i) => {
    const expiry = new Date(end.getTime() + int(-20, 900) * DAY); // a few expired / expiring soon
    parties.push({
      id: `EMP-${String(101 + i)}`, type: "DRIVER", name,
      phone: `+9715${pick(["0", "2", "5", "6", "8"])}${int(1000000, 9999999)}`,
      email: `${name.toLowerCase().split(" ")[0]}.${name.toLowerCase().split(" ").slice(-1)[0]}@desertwheels.example`,
      license: `${int(1000000, 9999999)}`,
      expiry: fmt.ddmmyyyy(expiry),
    });
  });
  CUSTOMERS.forEach((c, i) => {
    const expiry = new Date(end.getTime() + int(30, 1500) * DAY);
    parties.push({
      id: `CUS-${String(5001 + i)}`, type: "CUSTOMER", name: c.name, company: c.company,
      phone: chance(0.85) ? `+9715${pick(["0", "2", "5", "6", "8"])}${int(1000000, 9999999)}` : "",
      email: `${c.name.toLowerCase().replace(/[^a-z]+/g, ".")}@mail.example`,
      license: chance(0.5) ? `${int(1000000, 9999999)}` : `UK${int(10000000, 99999999)}`,
      expiry: fmt.ddmmyyyy(expiry),
    });
  });
  const drivers = parties.filter((p) => p.type === "DRIVER");
  const customers = parties.filter((p) => p.type === "CUSTOMER");

  // Assignment history (from 10 days before the window to now)
  const assignments: A[] = [];
  const at8 = (d: Date) => { const p = dubaiParts(d); return dubaiToUtc(p.year, p.month, p.day, 8); };
  let contractNo = 24100;
  for (const v of vehicles) {
    if (v.status === "SOLD") {
      // Sold halfway through the window: history stops, later fines are "no assignment".
      assignments.push({ v, p: pick(drivers), start: at8(new Date(start.getTime() - 10 * DAY)), end: at8(new Date(start.getTime() + 40 * DAY)), kind: "ALLOCATION", ref: "" });
      continue;
    }
    let t = new Date(start.getTime() - int(5, 15) * DAY);
    t = v.fleet === "staff" ? at8(t) : new Date(at8(t).getTime() + int(0, 10) * HOUR);
    while (t < end) {
      if (v.fleet === "staff") {
        // Allocations of 1–5 weeks, hand-over at 08:00, sometimes 1–4 days in the workshop.
        const len = int(7, 35) * DAY;
        const segEnd = new Date(t.getTime() + len);
        const ongoing = segEnd >= end;
        assignments.push({ v, p: pick(drivers), start: t, end: ongoing ? null : segEnd, kind: chance(0.3) ? "SHIFT" : "ALLOCATION", ref: chance(0.3) ? `SH-${int(1000, 9999)}` : "" });
        t = chance(0.2) ? new Date(segEnd.getTime() + int(1, 4) * DAY) : segEnd;
      } else {
        // Rentals of 2–20 days, pick-up between 08:00 and 21:00, idle 0–5 days between contracts.
        const len = int(2, 20) * DAY + int(-3, 3) * HOUR;
        const segEnd = new Date(t.getTime() + len);
        const ongoing = segEnd >= end;
        assignments.push({ v, p: pick(customers), start: t, end: ongoing ? null : segEnd, kind: "RENTAL_CONTRACT", ref: `RA-${contractNo++}` });
        const idle = chance(0.3) ? 0 : int(4, 120) * HOUR;
        t = new Date(segEnd.getTime() + idle);
      }
    }
  }
  // Edge case: overlapping records (contract extension keyed in as a new contract by another agent).
  const rentals = assignments.filter((a) => a.kind === "RENTAL_CONTRACT" && a.end && a.start > start);
  for (let i = 0; i < 6; i++) {
    const a = rentals[int(0, rentals.length - 1)];
    assignments.push({ v: a.v, p: pick(customers.filter((c) => c !== a.p)), start: new Date(a.start.getTime() + 2 * DAY), end: new Date(a.end!.getTime() + DAY), kind: "RENTAL_CONTRACT", ref: `RA-${contractNo++}` });
  }

  // Offenses
  const inWindow = (d: Date) => d >= start && d < end;
  const byVehicle = new Map<V, A[]>();
  for (const a of assignments) byVehicle.set(a.v, [...(byVehicle.get(a.v) ?? []), a]);
  const activeVehicles = vehicles;

  function randomTimeFor(v: V): Date {
    const list = byVehicle.get(v) ?? [];
    const mode = weighted<"inside" | "gap" | "boundary">([["inside", 88], ["gap", 7], ["boundary", 5]]);
    for (let tries = 0; tries < 20; tries++) {
      if (mode === "boundary" && list.length > 1) {
        // Just before / after a hand-over: approximate return times.
        const a = pick(list);
        const edge = a.end && chance(0.6) ? a.end : a.start;
        const d = new Date(edge.getTime() + int(-12, 12) * 60_000);
        if (inWindow(d)) return d;
      } else if (mode === "gap") {
        const d = new Date(start.getTime() + rnd() * (end.getTime() - start.getTime()));
        if (!list.some((a) => a.start <= d && (!a.end || d < a.end))) return d;
      } else {
        const a = pick(list);
        const s = Math.max(a.start.getTime(), start.getTime());
        const e = Math.min(a.end?.getTime() ?? end.getTime(), end.getTime());
        if (e > s) return new Date(s + rnd() * (e - s));
      }
    }
    return new Date(start.getTime() + rnd() * (end.getTime() - start.getTime()));
  }
  // Business-hours bias for a timestamp: shift to a plausible driving hour.
  const drivingHour = (d: Date, source: string) => {
    const p = dubaiParts(d);
    const hour = source === "DARB"
      ? pick([7, 8, 17, 18])
      : weighted<number>([[6, 3], [7, 6], [8, 8], [9, 6], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4], [15, 5], [16, 7], [17, 8], [18, 8], [19, 6], [20, 4], [21, 3], [22, 2], [23, 1], [0, 1]]);
    return dubaiToUtc(p.year, p.month, p.day, hour, int(0, 59), int(0, 59));
  };

  const salik: Record<string, string>[] = [];
  const darb: Record<string, string>[] = [];
  const rta: Record<string, string>[] = [];
  const parking: Record<string, string>[] = [];
  let salikRef = 7_310_000_000, darbRef = 4_020_000, rtaRef = 55_100_000, parkRef = 910_000;
  const unknownPlates: { emirate: Em; code: string; number: string }[] = [
    { emirate: "DXB", code: "Q", number: "48213" }, { emirate: "DXB", code: "M", number: "7741" }, { emirate: "SHJ", code: "3", number: "22019" },
  ];

  let produced = 0;
  while (produced < offenseCount) {
    const source = weighted<"SALIK" | "DARB" | "RTA" | "PARKING">([["SALIK", 58], ["DARB", 13], ["RTA", 20], ["PARKING", 9]]);
    const unknown = chance(0.025);
    const v = pick(activeVehicles);
    let when = randomTimeFor(v);
    const keepExact = !unknown && dubaiParts(when).minute % 7 === 0; // keep some hand-over-close timestamps
    if (!keepExact) when = drivingHour(when, source);
    if (!inWindow(when) || when > end) continue;
    const plate = unknown ? pick(unknownPlates) : { emirate: v.emirate, code: v.code, number: v.number };

    if (source === "SALIK") {
      const amount = salikTariff(when);
      if (!amount) continue;
      salik.push({
        "Transaction ID": String(salikRef += int(1, 9000)),
        "Trip Date": fmt.ddmmyyyy(when),
        "Trip Time": fmt.hhmmss(when),
        "Plate Source": EMIRATE_NAME[plate.emirate],
        "Plate Category": plate.code,
        "Plate Number": plate.number,
        "Toll Gate": pick(SALIK_GATES),
        Direction: pick(["Northbound", "Southbound", "Eastbound", "Westbound"]),
        "Amount (AED)": amount.toFixed(2),
      });
    } else if (source === "DARB") {
      const amount = darbTariff(when);
      if (!amount) continue;
      // Darb exports sometimes omit the plate code for Dubai plates.
      const code = plate.emirate === "DXB" && chance(0.15) ? "" : plate.code;
      darb.push({
        "Transaction No": `DRB${darbRef += int(1, 500)}`,
        "Transaction Date": fmt.dash(when),
        "Plate Details": [EMIRATE_NAME[plate.emirate], code, plate.number].filter(Boolean).join(" "),
        "Gate Name": pick(DARB_GATES),
        Amount: amount.toFixed(2),
      });
    } else if (source === "RTA") {
      const [desc, amount, points] = weighted(RTA_VIOLATIONS.map(([d, a, p, w]) => [[d, a, p] as const, w]));
      const police = plate.emirate === "AUH" || chance(0.1);
      rta.push({
        "Fine Number": String(rtaRef += int(1, 20000)),
        "Fine Date": fmt.ddmmyyyy(when),
        "Fine Time": fmt.hhmm(when),
        "Plate Source": EMIRATE_NAME[plate.emirate],
        "Plate Code": plate.code,
        "Plate Number": plate.number,
        Violation: desc,
        Location: police ? pick(AUH_ROADS) : pick(RTA_ROADS),
        Amount: String(amount),
        "Black Points": String(points),
        Authority: police ? "Abu Dhabi Police" : "Dubai Police / RTA",
      });
    } else {
      const [desc, amount] = pick(PARKING_VIOLATIONS);
      const p = dubaiParts(when);
      if (p.hour < 8 || p.hour >= 22 || p.weekday === 0) continue; // paid parking hours
      parking.push({
        "Ticket No": `PK${parkRef += int(1, 300)}`,
        "Issue Date": `${fmt.ddmmyyyy(when)} ${fmt.hhmm(when)}`,
        Plate: `${plate.emirate} ${plate.code} ${plate.number}`,
        Zone: pick(PARKING_ZONES),
        Reason: desc,
        Amount: amount.toFixed(2),
      });
    }
    produced++;
  }

  const csv = (rows: Record<string, string>[]) => Papa.unparse(rows, { newline: "\n" }) + "\n";
  const sortBy = <T extends Record<string, string>>(rows: T[], key: (r: T) => string) => rows.sort((a, b) => key(a).localeCompare(key(b)));

  return {
    vehiclesCsv: csv(vehicles.map((v) => ({
      emirate: EMIRATE_NAME[v.emirate], plateCode: v.code, plateNumber: v.number, make: v.make, model: v.model, year: String(v.year), status: v.status, externalId: v.unit,
    }))),
    partiesCsv: csv(parties.map((p) => ({
      type: p.type, fullName: p.name, companyName: p.company ?? "", whatsappPhone: p.phone, email: p.email, licenseNumber: p.license, licenseExpiry: p.expiry, externalId: p.id,
    }))),
    assignmentsCsv: csv(
      assignments
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .map((a) => ({
          Emirate: EMIRATE_NAME[a.v.emirate], "Plate Code": a.v.code, "Plate Number": a.v.number, "Driver ID": a.p.id,
          Start: fmt.iso(a.start), End: a.end ? fmt.iso(a.end) : "", Type: a.kind, "Contract No": a.ref,
        })),
    ),
    salikCsv: csv(sortBy(salik, (r) => r["Transaction ID"])),
    darbCsv: csv(sortBy(darb, (r) => r["Transaction No"])),
    rtaCsv: csv(sortBy(rta, (r) => r["Fine Number"])),
    parkingCsv: csv(sortBy(parking, (r) => r["Ticket No"])),
    stats: {
      vehicles: vehicles.length, parties: parties.length, assignments: assignments.length,
      salik: salik.length, darb: darb.length, rta: rta.length, parking: parking.length,
      offenses: salik.length + darb.length + rta.length + parking.length,
    },
  };
}
