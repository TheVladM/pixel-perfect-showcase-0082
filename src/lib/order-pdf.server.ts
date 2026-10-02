import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

const NAVY = rgb(0x1f / 255, 0x3a / 255, 0x5f / 255);
const AMBER = rgb(0xe8 / 255, 0xa3 / 255, 0x3d / 255);
const ZEBRA = rgb(0.95, 0.96, 0.98);
const GREY = rgb(0.4, 0.43, 0.48);
const TEXT = rgb(0.1, 0.12, 0.16);

// Standard fonts only support WinAnsi; replace anything else so drawing never throws.
const ALLOWED_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
function safe(s: string): string {
  return Array.from(s)
    .map((c) => (c.charCodeAt(0) <= 255 || ALLOWED_EXTRA.includes(c) ? c : "?"))
    .join("");
}

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const lines: string[] = [];
  for (const para of safe(text).split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(" ")) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > max && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Africa/Douala",
  }).format(new Date(iso));
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n).replace(/\u202f|\u00a0/g, " ");
}

export type PdfInput = {
  orderNumber: string;
  validatedAt: string | null;
  zoneName: string;
  zoneCode: string;
  regionName: string;
  agentName: string;
  comment: string | null;
  decidedRole: string | null;
  deciderName: string | null;
  items: { name: string; unit: string; quantity: number }[];
  verifyUrl: string;
  logo: Uint8Array | null;
  signature: Uint8Array | null;
};

async function embedImage(doc: PDFDocument, bytes: Uint8Array | null) {
  if (!bytes) return null;
  try {
    return await doc.embedPng(bytes);
  } catch {
    try {
      return await doc.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

function drawQr(page: PDFPage, url: string, x: number, y: number, size: number) {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = size / n;
  page.drawRectangle({ x: x - 4, y: y - 4, width: size + 8, height: size + 8, color: rgb(1, 1, 1) });
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.modules.get(r, c))
        page.drawRectangle({ x: x + c * cell, y: y + size - (r + 1) * cell, width: cell + 0.2, height: cell + 0.2, color: rgb(0, 0, 0) });
}

export async function buildOrderPdf(input: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Bon de commande ${input.orderNumber}`);
  doc.setAuthor("Intelligentsia Corporation (ICORP)");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 48;
  let page = doc.addPage([W, H]);

  // Banner
  const bannerH = 96;
  page.drawRectangle({ x: 0, y: H - bannerH, width: W, height: bannerH, color: NAVY });
  page.drawRectangle({ x: 0, y: H - bannerH - 4, width: W, height: 4, color: AMBER });
  const logo = await embedImage(doc, input.logo);
  if (logo) {
    const lh = 64, lw = (logo.width / logo.height) * lh;
    page.drawRectangle({ x: M - 8, y: H - bannerH + 16 - 0, width: lw + 16, height: lh, color: rgb(1, 1, 1) });
    page.drawImage(logo, { x: M, y: H - bannerH + 16, width: lw, height: lh });
  }
  const title = "Bon de commande";
  page.drawText(title, { x: W - M - bold.widthOfTextAtSize(title, 24), y: H - 58, size: 24, font: bold, color: rgb(1, 1, 1) });

  let y = H - bannerH - 44;
  page.drawText(safe(input.orderNumber), { x: M, y, size: 26, font: bold, color: NAVY });
  y -= 20;
  page.drawText(safe(`Validé le ${fmtDate(input.validatedAt)}`), { x: M, y, size: 11, font, color: GREY });

  // Info block
  y -= 26;
  const blockH = 64;
  page.drawRectangle({ x: M, y: y - blockH, width: W - 2 * M, height: blockH, color: ZEBRA, borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 0.8 });
  const cols = [
    ["Zone", `${input.zoneName} (${input.zoneCode})`],
    ["Région", input.regionName],
    ["Agent", input.agentName],
  ];
  const colW = (W - 2 * M) / 3;
  cols.forEach(([k, v], i) => {
    const x = M + 14 + i * colW;
    page.drawText(safe(k), { x, y: y - 24, size: 9, font, color: GREY });
    const val = wrap(v, bold, 11, colW - 20)[0] ?? "";
    page.drawText(val, { x, y: y - 42, size: 11, font: bold, color: TEXT });
  });
  y -= blockH + 30;

  // Table
  const tableW = W - 2 * M;
  const cx = [M + 10, M + tableW * 0.62, M + tableW - 10];
  const rowH = 24;
  const header = () => {
    page.drawRectangle({ x: M, y: y - rowH + 6, width: tableW, height: rowH, color: NAVY });
    page.drawText("Désignation", { x: cx[0], y: y - 10, size: 10, font: bold, color: rgb(1, 1, 1) });
    page.drawText("Unité", { x: cx[1], y: y - 10, size: 10, font: bold, color: rgb(1, 1, 1) });
    const q = "Quantité";
    page.drawText(q, { x: cx[2] - bold.widthOfTextAtSize(q, 10), y: y - 10, size: 10, font: bold, color: rgb(1, 1, 1) });
    y -= rowH;
  };
  header();
  input.items.forEach((it, idx) => {
    if (y < 220) {
      page = doc.addPage([W, H]);
      y = H - M;
      header();
    }
    if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - rowH + 6, width: tableW, height: rowH, color: ZEBRA });
    const name = wrap(it.name, font, 10, tableW * 0.58)[0] ?? "";
    page.drawText(name, { x: cx[0], y: y - 10, size: 10, font, color: TEXT });
    page.drawText(wrap(it.unit, font, 10, tableW * 0.25)[0] ?? "", { x: cx[1], y: y - 10, size: 10, font, color: TEXT });
    const q = fmtQty(it.quantity);
    page.drawText(q, { x: cx[2] - bold.widthOfTextAtSize(q, 10), y: y - 10, size: 10, font: bold, color: TEXT });
    y -= rowH;
  });

  // Comment
  if (input.comment && input.comment.trim()) {
    y -= 18;
    page.drawText("Commentaire", { x: M, y, size: 11, font: bold, color: NAVY });
    y -= 16;
    for (const line of wrap(input.comment, font, 10, tableW).slice(0, 8)) {
      page.drawText(line, { x: M, y, size: 10, font, color: TEXT });
      y -= 14;
    }
  }

  // Footer: signature (left) + QR (right)
  const footY = 60;
  const qrSize = 96;
  drawQr(page, input.verifyUrl, W - M - qrSize, footY + 18, qrSize);
  const cap = "Scannez pour vérifier l'authenticité de ce bon";
  const capLines = wrap(cap, font, 8, 150);
  capLines.forEach((l, i) =>
    page.drawText(l, { x: W - M - qrSize / 2 - font.widthOfTextAtSize(l, 8) / 2, y: footY + 2 - i * 10, size: 8, font, color: GREY }),
  );

  if (input.decidedRole === "admin_principal") {
    const sig = await embedImage(doc, input.signature);
    if (sig) {
      const sh = 60, sw = Math.min((sig.width / sig.height) * sh, 200);
      page.drawImage(sig, { x: M, y: footY + 34, width: sw, height: sh });
    }
    page.drawLine({ start: { x: M, y: footY + 28 }, end: { x: M + 220, y: footY + 28 }, thickness: 0.6, color: GREY });
    page.drawText("Validé par l'administrateur principal", { x: M, y: footY + 12, size: 10, font: bold, color: NAVY });
  } else if (input.decidedRole === "admin_logistique") {
    page.drawLine({ start: { x: M, y: footY + 28 }, end: { x: M + 220, y: footY + 28 }, thickness: 0.6, color: GREY });
    page.drawText("Validé par l'administrateur logistique", { x: M, y: footY + 12, size: 10, font: bold, color: NAVY });
    if (input.deciderName) page.drawText(safe(input.deciderName), { x: M, y: footY - 4, size: 10, font, color: TEXT });
  }

  return doc.save();
}
