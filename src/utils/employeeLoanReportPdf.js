import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { ensurePdfUnicodeFont } from "./pdfUnicodeFont.js";
import {
  RFS_PALETTE as PALETTE,
  distributeColumnWidths,
  drawAllReportFooters,
  fmtDatePdf as fmtDate,
  fmtInrPdf as fmtInr,
  fmtPdfText,
  getPageLayout,
  loadLogoDataUrl,
} from "./pdfReportLayout";

const MARGIN = 10;
const FOOTER_RESERVE = 14;

/** EMI ledger: 10 columns on A4 landscape — ratios must sum to 1. */
const EMI_COL_RATIOS = [0.045, 0.095, 0.095, 0.105, 0.105, 0.105, 0.095, 0.085, 0.135, 0.14];

function fmtMonthKey(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMonthLabel(key) {
  if (!key) return "—";
  const date = new Date(`${key}-01`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function buildRemarks(row) {
  const parts = [];
  if (row.lateDays > 0) parts.push(`Late ${row.lateDays}d`);
  if (row.status === "Partial") parts.push("Partial payment");
  if (row.status === "Overdue" && (!row.paidAmount || row.paidAmount <= 0)) parts.push("Past due");
  return parts.length ? parts.join(" · ") : "—";
}

function statusTextColor(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("overdue")) return PALETTE.danger;
  if (s.includes("partial") || s.includes("late")) return PALETTE.warn;
  if (s === "paid") return PALETTE.success;
  if (s === "pending") return PALETTE.muted;
  return PALETTE.inkSoft;
}

function truncateLines(doc, text, maxWidth, maxLines = 2) {
  const lines = doc.splitTextToSize(String(text ?? ""), maxWidth);
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1]}…`];
}

async function drawPremiumHeader(doc, layout, origin, generatedLabel, reportTitle, pdfFont) {
  const { margin, pageWidth } = layout;
  const bandH = 26;

  doc.setFillColor(...PALETTE.headerBand);
  doc.rect(0, 0, pageWidth, bandH, "F");
  doc.setDrawColor(...PALETTE.accent);
  doc.setLineWidth(0.5);
  doc.line(0, bandH, pageWidth, bandH);

  const logoW = 18;
  const logoH = 12;
  const logoY = 7;
  let textX = margin;

  const logoDataUrl = await loadLogoDataUrl(origin);
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin, logoY, logoW, logoH);
      textX = margin + logoW + 6;
    } catch {
      /* no logo */
    }
  }

  doc.setFont(pdfFont, "bold");
  doc.setFontSize(15);
  doc.setTextColor(...PALETTE.ink);
  doc.text("Ruthra Financial Solutions", textX, 12);

  doc.setFontSize(10.5);
  doc.setTextColor(...PALETTE.accent);
  doc.text(reportTitle, textX, 18.5);

  doc.setFont(pdfFont, "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PALETTE.muted);
  doc.text(`Generated  ·  ${generatedLabel}`, textX, 23.5);

  return bandH + 5;
}

function drawBorrowerSummary(doc, report, layout, startY, pdfFont) {
  const { margin, contentW } = layout;
  const loanStatus = report.loanDisplayStatus || report.loanStatus || "—";
  const pairs = [
    ["Employee name", fmtPdfText(report.customerName || "-")],
    ["Customer ID", fmtPdfText(report.customerId || "-")],
    ["Phone", fmtPdfText(report.phoneNumber || "-")],
    ["Loan amount", fmtInr(report.loanAmount)],
    ["Loan status", loanStatus],
    ["Loan start", fmtDate(report.loanStartDate)],
  ];

  const pad = 5;
  const colGap = 10;
  const colW = (contentW - pad * 2 - colGap) / 2;
  const titleH = 8;
  const blockH = 12;
  const rows = 3;
  const panelH = pad + titleH + rows * blockH + pad;

  doc.setFillColor(...PALETTE.surfaceAlt);
  doc.setDrawColor(...PALETTE.line);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, startY, contentW, panelH, 2.5, 2.5, "FD");

  doc.setFont(pdfFont, "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PALETTE.accent);
  doc.text("BORROWER SUMMARY", margin + pad, startY + pad + 5);

  const leftCol = pairs.slice(0, 3);
  const rightCol = pairs.slice(3, 6);
  const baseY = startY + pad + titleH + 1;

  const drawCol = (items, x0) => {
    let yy = baseY;
    items.forEach(([label, value]) => {
      doc.setFont(pdfFont, "normal");
      doc.setFontSize(7);
      doc.setTextColor(...PALETTE.muted);
      doc.text(label.toUpperCase(), x0, yy);
      doc.setFont(pdfFont, "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...PALETTE.ink);
      doc.text(truncateLines(doc, value, colW - 1), x0, yy + 4.2);
      yy += blockH;
    });
  };

  drawCol(leftCol, margin + pad);
  drawCol(rightCol, margin + pad + colW + colGap);

  return startY + panelH + 4;
}

/** Four KPI cards across full page width. */
function drawLoanSummaryCards(doc, report, layout, startY, pdfFont) {
  const { margin, contentW } = layout;
  const cards = [
    { label: "Total payable", value: fmtInr(report.totalPayable), note: "Principal + interest" },
    { label: "Collected", value: fmtInr(report.totalCollected), note: "Approved payments" },
    { label: "Pending", value: fmtInr(report.pendingAmount), note: "Outstanding" },
    {
      label: "Recovery",
      value: `${Math.round(Number(report.progressPercentage || 0))}%`,
      note: "Paid vs payable",
    },
  ];

  const gap = 4;
  const cardW = (contentW - gap * (cards.length - 1)) / cards.length;
  const cardH = 18;

  cards.forEach((card, i) => {
    const x = margin + i * (cardW + gap);
    doc.setFillColor(...PALETTE.surface);
    doc.setDrawColor(...PALETTE.line);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, startY, cardW, cardH, 2, 2, "FD");

    doc.setFont(pdfFont, "normal");
    doc.setFontSize(7);
    doc.setTextColor(...PALETTE.muted);
    doc.text(card.label.toUpperCase(), x + 3.5, startY + 5.5);

    doc.setFont(pdfFont, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PALETTE.ink);
    doc.text(truncateLines(doc, card.value, cardW - 7, 1), x + 3.5, startY + 11.5);

    doc.setFont(pdfFont, "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...PALETTE.inkSoft);
    doc.text(card.note, x + 3.5, startY + 15.5);
  });

  return startY + cardH + 5;
}

/**
 * @param {object} report
 * @param {object[]} scheduleRows
 * @param {{ generatedAt?: Date; origin?: string }} [options]
 */
export async function buildEmployeeLoanReportPdf(report, scheduleRows, options = {}) {
  const generatedAt = options.generatedAt instanceof Date ? options.generatedAt : new Date();
  const generatedLabel = generatedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const origin = options.origin ?? (typeof window !== "undefined" ? window.location.origin : "");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pdfFont = await ensurePdfUnicodeFont(doc, origin);
  const layout = getPageLayout(doc, { margin: MARGIN, footerReserve: FOOTER_RESERVE });

  let y = await drawPremiumHeader(doc, layout, origin, generatedLabel, "Employee Loan Report", pdfFont);
  y = drawBorrowerSummary(doc, report, layout, y, pdfFont);
  y = drawLoanSummaryCards(doc, report, layout, y, pdfFont);

  const head = [
    [
      "S.No",
      "Due Date",
      "Month",
      "EMI",
      "Paid",
      "Pending",
      "Paid on",
      "Status",
      "Collector",
      "Remarks",
    ],
  ];

  const body =
    Array.isArray(scheduleRows) && scheduleRows.length > 0
      ? scheduleRows.map((item) => {
          const due = item.dueDate instanceof Date ? item.dueDate : new Date(item.dueDate);
          const mk = fmtMonthKey(item.paymentDate || due);
          return [
            String(item.installmentNumber ?? ""),
            fmtDate(due),
            fmtMonthLabel(mk),
            fmtInr(item.dueAmount),
            fmtInr(item.paidAmount),
            fmtInr(item.pendingAmount),
            fmtDate(item.paymentDate),
            fmtPdfText(item.status || "-"),
            fmtPdfText(item.collectedBy || "-"),
            fmtPdfText(buildRemarks(item)),
          ];
        })
      : [
          [
            {
              content: "No installments match the current filters.",
              colSpan: 10,
              styles: { halign: "center", fontStyle: "italic", textColor: PALETTE.muted },
            },
          ],
        ];

  const colWidths = distributeColumnWidths(layout.contentW, EMI_COL_RATIOS);
  const columnStyles = {};
  colWidths.forEach((w, i) => {
    columnStyles[i] = { cellWidth: w };
  });
  columnStyles[0].halign = "center";
  columnStyles[1].halign = "center";
  columnStyles[2].halign = "center";
  columnStyles[3].halign = "right";
  columnStyles[4].halign = "right";
  columnStyles[5].halign = "right";
  columnStyles[6].halign = "center";
  columnStyles[7].halign = "center";
  columnStyles[7].fontStyle = "bold";
  columnStyles[8].halign = "left";
  columnStyles[9].halign = "left";
  columnStyles[9].textColor = PALETTE.inkSoft;

  autoTable(doc, {
    startY: y,
    head,
    body,
    tableWidth: layout.contentW,
    margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_RESERVE },
    showHead: "everyPage",
    rowPageBreak: "auto",
    tableLineWidth: 0.15,
    tableLineColor: PALETTE.line,
    styles: {
      font: pdfFont,
      fontSize: 8.5,
      cellPadding: { top: 2.8, right: 2, bottom: 2.8, left: 2 },
      textColor: PALETTE.ink,
      lineColor: PALETTE.lineSoft,
      lineWidth: 0.1,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      font: pdfFont,
      fillColor: PALETTE.headBg,
      textColor: PALETTE.headText,
      fontStyle: "bold",
      fontSize: 9,
      halign: "center",
      cellPadding: { top: 3.2, right: 2, bottom: 3.2, left: 2 },
    },
    bodyStyles: {
      fillColor: PALETTE.surface,
    },
    alternateRowStyles: {
      fillColor: PALETTE.surfaceAlt,
    },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 7 && typeof data.cell.text[0] === "string") {
        data.cell.styles.textColor = statusTextColor(data.cell.text[0]);
      }
    },
  });

  drawAllReportFooters(doc, generatedLabel, MARGIN);
  doc.setPage(1);
  return doc;
}

export async function downloadEmployeeLoanReportPdf(report, scheduleRows, options = {}) {
  const doc = await buildEmployeeLoanReportPdf(report, scheduleRows, options);
  const stamp = new Date().toISOString().slice(0, 10);
  const id = String(report?.customerId || "employee").replace(/[^\w-]+/g, "_");
  doc.save(`employee-loan-report-${stamp}-${id}.pdf`);
}

export async function printEmployeeLoanReportPdf(report, scheduleRows, options = {}) {
  const doc = await buildEmployeeLoanReportPdf(report, scheduleRows, options);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  const cleanup = () => URL.revokeObjectURL(url);
  if (!win) {
    cleanup();
    const stamp = new Date().toISOString().slice(0, 10);
    const id = String(report?.customerId || "employee").replace(/[^\w-]+/g, "_");
    doc.save(`employee-loan-report-${stamp}-${id}.pdf`);
    return;
  }
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    }
  }, 600);
  setTimeout(cleanup, 120_000);
}
