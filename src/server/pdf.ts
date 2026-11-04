import PDFDocument from "pdfkit";
import path from "node:path";

// Mise en page commune des documents officiels CMD Pro (logo officiel, références, pagination).
const LOGO = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "public/brand/logo-cmdpro-document.png");
const BLUE = "#0f3fa3", GREY = "#555555", LINE = "#c9d6ee";
export const HOSPITAL = { name: "Centre Médical Dieu est Fidélité", short: "CMD Pro", city: "Goma — République démocratique du Congo" };

export type PdfMeta = { title: string; reference: string; date: Date; subtitle?: string; demo?: boolean };
export type Doc = PDFKit.PDFDocument;

const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Lubumbashi" });
export const fmtDate = (d: Date) => fmt.format(d);

export function createPdf(meta: PdfMeta, draw: (doc: Doc) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 60, left: 50, right: 50 }, bufferPages: true, info: { Title: meta.title, Author: HOSPITAL.short } });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // En-tête
    doc.image(LOGO, 50, 40, { width: 72 });
    doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(15).text(HOSPITAL.name, 135, 48);
    doc.fillColor(GREY).font("Helvetica").fontSize(9).text(HOSPITAL.city, 135, 68);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000").text(`Réf. ${meta.reference}`, 380, 48, { width: 165, align: "right" });
    doc.font("Helvetica").fillColor(GREY).text(fmtDate(meta.date), 380, 62, { width: 165, align: "right" });
    doc.moveTo(50, 112).lineTo(545, 112).strokeColor(LINE).lineWidth(1).stroke();
    doc.y = 125; doc.x = 50;
    doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(17).text(meta.title, { align: "left" });
    if (meta.subtitle) doc.fillColor(GREY).font("Helvetica").fontSize(10).text(meta.subtitle);
    if (meta.demo ?? process.env.CMDPRO_DEMO === "1") doc.fillColor("#b00020").font("Helvetica-Bold").fontSize(10).text("DOCUMENT DE DÉMONSTRATION — DONNÉES FICTIVES");
    doc.moveDown(0.8).fillColor("#000").font("Helvetica").fontSize(10);

    draw(doc);

    // Pied de page et pagination
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom; doc.page.margins.bottom = 0;
      doc.fontSize(8).fillColor(GREY).text(`${HOSPITAL.short} — ${meta.reference} — Page ${i + 1} / ${range.count}`, 50, doc.page.height - 40, { width: 495, align: "center" });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}

/** Bloc « libellé : valeur » sur deux colonnes. */
export function fields(doc: Doc, rows: [string, string | null | undefined][]) {
  const startY = doc.y;
  rows.forEach(([k, v], i) => {
    const col = i % 2, x = 50 + col * 250, y = startY + Math.floor(i / 2) * 30;
    doc.font("Helvetica").fontSize(8).fillColor(GREY).text(k, x, y, { width: 240 });
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text(v || "—", x, y + 10, { width: 240 });
  });
  doc.x = 50; doc.y = startY + Math.ceil(rows.length / 2) * 30 + 6;
}

export function section(doc: Doc, title: string) {
  if (doc.y > 720) doc.addPage();
  doc.moveDown(0.5).font("Helvetica-Bold").fontSize(11).fillColor(BLUE).text(title, 50);
  doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor(LINE).stroke();
  doc.moveDown(0.5).font("Helvetica").fontSize(10).fillColor("#000");
}

export function paragraph(doc: Doc, text: string | null | undefined) {
  doc.font("Helvetica").fontSize(10).fillColor("#000").text(text?.trim() || "—", 50, doc.y, { width: 495 });
  doc.moveDown(0.4);
}

/** Tableau simple ; widths en points, total ≤ 495. */
export function table(doc: Doc, headers: string[], widths: number[], rows: string[][], align: ("left" | "right")[] = []) {
  const drawRow = (cells: string[], bold: boolean) => {
    const h = Math.max(...cells.map((c, i) => doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).heightOfString(c, { width: widths[i] - 8 }))) + 8;
    if (doc.y + h > 770) { doc.addPage(); if (!bold) drawRow(headers, true); }
    const y = doc.y; let x = 50;
    if (bold) doc.rect(50, y, widths.reduce((a, b) => a + b, 0), h).fill("#eef3fc");
    cells.forEach((c, i) => { doc.fillColor("#000").font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(c, x + 4, y + 4, { width: widths[i] - 8, align: align[i] ?? "left" }); x += widths[i]; });
    doc.moveTo(50, y + h).lineTo(50 + widths.reduce((a, b) => a + b, 0), y + h).strokeColor(LINE).stroke();
    doc.x = 50; doc.y = y + h;
  };
  drawRow(headers, true);
  rows.forEach((r) => drawRow(r, false));
  doc.moveDown(0.6);
}

export function signature(doc: Doc, label: string, name?: string | null) {
  if (doc.y > 690) doc.addPage();
  doc.moveDown(1.5);
  const y = doc.y;
  doc.font("Helvetica").fontSize(9).fillColor(GREY).text(label, 330, y, { width: 215 });
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text(name ?? "", 330, y + 12, { width: 215 });
  doc.moveTo(330, y + 55).lineTo(545, y + 55).strokeColor("#999").stroke();
  doc.x = 50; doc.y = y + 65;
}
