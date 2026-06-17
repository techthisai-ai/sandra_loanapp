/** Shared layout helpers for jsPDF + jspdf-autotable finance reports. */

import { formatCurrencyForPrint } from "./formatCurrency.js";
import { BRAND_COMPANY_NAME, BRAND_LOGO_PATH } from "../constants/brand.js";

export const RFS_PALETTE = {
  ink: [15, 23, 42],
  inkSoft: [51, 65, 85],
  muted: [100, 116, 139],
  line: [226, 232, 240],
  lineSoft: [241, 245, 249],
  surface: [255, 255, 255],
  surfaceAlt: [248, 250, 252],
  headerBand: [241, 245, 249],
  headBg: [15, 77, 92],
  headText: [248, 250, 252],
  accent: [13, 148, 136],
  success: [5, 122, 85],
  warn: [180, 83, 9],
  danger: [185, 28, 28],
};

export async function loadLogoDataUrl(origin) {
  const base = (origin || "").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}${BRAND_LOGO_PATH}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("read fail"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {{ margin?: number; footerReserve?: number }} [opts]
 */
export function getPageLayout(doc, opts = {}) {
  const margin = opts.margin ?? 10;
  const footerReserve = opts.footerReserve ?? 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  return {
    margin,
    footerReserve,
    pageWidth,
    pageHeight,
    contentW: pageWidth - 2 * margin,
    contentH: pageHeight - margin - footerReserve,
  };
}

/** Widths in mm that sum exactly to contentW. */
export function distributeColumnWidths(contentW, ratios) {
  const total = ratios.reduce((s, r) => s + r, 0);
  const widths = ratios.map((r) => (contentW * r) / total);
  const sum = widths.reduce((s, w) => s + w, 0);
  widths[widths.length - 1] += contentW - sum;
  return widths;
}

export function drawReportFooter(doc, pageIndex, totalPages, generatedLabel, margin = 10) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - 11;

  doc.setDrawColor(...RFS_PALETTE.line);
  doc.setLineWidth(0.25);
  doc.line(margin, footerY - 2, pageWidth - margin, footerY - 2);

  const footerFont = doc.getFont().fontName || "helvetica";
  doc.setFont(footerFont, "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(...RFS_PALETTE.muted);
  doc.text(`${BRAND_COMPANY_NAME} - confidential`, margin, footerY + 1.5);

  doc.setTextColor(...RFS_PALETTE.inkSoft);
  doc.text(`Page ${pageIndex} of ${totalPages}`, pageWidth / 2, footerY + 1.5, { align: "center" });

  doc.setTextColor(...RFS_PALETTE.muted);
  const gen = generatedLabel.length > 42 ? `${generatedLabel.slice(0, 39)}…` : generatedLabel;
  doc.text(gen, pageWidth - margin, footerY + 1.5, { align: "right" });
}

export function drawAllReportFooters(doc, generatedLabel, margin = 10) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    drawReportFooter(doc, i, total, generatedLabel, margin);
  }
}

export function fmtInrPdf(n) {
  return formatCurrencyForPrint(n);
}

export function fmtDatePdf(value) {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB");
}

/** Plain text for PDF table cells (Tamil names need Unicode font; avoid special punctuation). */
export function fmtPdfText(value) {
  if (value == null || value === "") return "-";
  return String(value).replace(/\u2014/g, "-").replace(/\u2013/g, "-");
}
