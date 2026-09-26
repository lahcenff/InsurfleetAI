import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDubai } from "../time";
import { formatPlate } from "../plate";
import type { FullStatement } from "./statements";

// Standard PDF fonts only cover Latin-1: replace anything else (e.g. Arabic names)
// so generation never fails. The web statement page shows the full Unicode text.
const safe = (s: string | null | undefined) => (s ?? "").replace(/[^\x20-\x7E -ÿ]/g, "?");
const aed = (v: unknown) => `AED ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function renderStatementPdf(s: FullStatement): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.16);
  const muted = rgb(0.42, 0.45, 0.5);
  const W = 595.28, H = 841.89, M = 40;

  let page = doc.addPage([W, H]);
  let y = H - M;
  const text = (p: PDFPage, t: string, x: number, yy: number, size = 9, f: PDFFont = font, color = ink) =>
    p.drawText(safe(t), { x, y: yy, size, font: f, color });
  const right = (p: PDFPage, t: string, xr: number, yy: number, size = 9, f: PDFFont = font) =>
    text(p, t, xr - f.widthOfTextAtSize(safe(t), size), yy, size, f);

  // Header
  text(page, s.company.name, M, y, 16, bold);
  right(page, "STATEMENT", W - M, y, 16, bold);
  y -= 18;
  if (s.company.trn) text(page, `TRN ${s.company.trn}`, M, y, 9, font, muted);
  right(page, s.number, W - M, y, 10);
  y -= 14;
  right(page, `Issued ${formatDubai(s.issuedAt, "en", false)}`, W - M, y, 9);
  y -= 30;

  text(page, "Bill to", M, y, 9, bold, muted);
  text(page, "Period", 330, y, 9, bold, muted);
  y -= 14;
  text(page, s.party.fullName, M, y, 11, bold);
  text(page, `${formatDubai(s.periodStart, "en", false)} - ${formatDubai(new Date(s.periodEnd.getTime() - 1), "en", false)}`, 330, y, 10);
  y -= 13;
  for (const l of [s.party.companyName, s.party.email, s.party.whatsappPhone].filter(Boolean)) {
    text(page, l!, M, y, 9, font, muted);
    y -= 12;
  }
  y -= 16;

  const cols = [
    { h: "Date (Dubai)", x: M },
    { h: "Source", x: M + 78 },
    { h: "Plate", x: M + 124 },
    { h: "Reference / details", x: M + 196 },
  ];
  const rcols = [
    { h: "Amount", x: W - M - 150 },
    { h: "Fee+VAT", x: W - M - 75 },
    { h: "Total", x: W - M },
  ];
  const header = () => {
    page.drawRectangle({ x: M - 4, y: y - 5, width: W - 2 * M + 8, height: 18, color: rgb(0.94, 0.95, 0.97) });
    cols.forEach((c) => text(page, c.h, c.x, y, 8, bold));
    rcols.forEach((c) => right(page, c.h, c.x, y, 8, bold));
    y -= 20;
  };
  header();

  for (const l of s.lines) {
    if (y < M + 90) {
      page = doc.addPage([W, H]);
      y = H - M;
      header();
    }
    const o = l.offense;
    const plate = o.vehicle ? formatPlate(o.vehicle.emirate, o.vehicle.plateCode, o.vehicle.plateNumber) : o.rawPlate;
    let details = `${o.externalRef}${o.location ? " - " + o.location : ""}${o.description ? " - " + o.description : ""}`;
    while (details.length > 4 && font.widthOfTextAtSize(safe(details), 8) > 175) details = details.slice(0, -4) + "...";
    text(page, formatDubai(o.occurredAt, "en"), cols[0].x, y, 8);
    text(page, o.source, cols[1].x, y, 8);
    text(page, plate, cols[2].x, y, 8);
    text(page, details, cols[3].x, y, 8);
    right(page, aed(l.amount), rcols[0].x, y, 8);
    right(page, aed(Number(l.fee) + Number(l.vat)), rcols[1].x, y, 8);
    right(page, aed(l.total), rcols[2].x, y, 8);
    y -= 14;
  }

  y -= 10;
  page.drawLine({ start: { x: W - M - 220, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: muted });
  const fee = s.feeType === "FIXED" ? `${aed(s.feeValue)} per item` : `${Number(s.feeValue)}%`;
  for (const [label, value, b] of [
    ["Fines & tolls", s.subtotal, false],
    [`Admin fee (${fee})`, s.feeTotal, false],
    [`VAT ${Number(s.vatOnFeePercent)}% on admin fee`, s.vatTotal, false],
    ["Total due", s.total, true],
  ] as const) {
    y -= 14;
    text(page, label, W - M - 220, y, b ? 11 : 9, b ? bold : font);
    right(page, aed(value), W - M, y, b ? 11 : 9, b ? bold : font);
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(safe(`${s.company.name} - ${s.number} - page ${i + 1}/${pages.length} - all times Asia/Dubai`), {
      x: M, y: 24, size: 7, font, color: muted,
    });
  });
  return doc.save();
}
