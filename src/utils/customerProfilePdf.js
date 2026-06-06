import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import {
  RFS_PALETTE as PALETTE,
  distributeColumnWidths,
  drawAllReportFooters,
  fmtDatePdf as fmtDate,
  fmtInrPdf as fmtInr,
  getPageLayout,
  loadLogoDataUrl,
} from "./pdfReportLayout";

const MARGIN = 10;
const FOOTER_RESERVE = 14;

const SCHEDULE_COL_RATIOS = [0.06, 0.14, 0.14, 0.14, 0.14, 0.12, 0.14, 0.12];

function statusColor(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("overdue")) return PALETTE.danger;
  if (s.includes("partial") || s.includes("late")) return PALETTE.warn;
  if (s.includes("paid")) return PALETTE.success;
  return PALETTE.muted;
}

async function drawHeader(doc, layout, customer, generatedLabel, origin) {
  const { margin, pageWidth } = layout;
  const bandH = 26;

  doc.setFillColor(...PALETTE.headBg);
  doc.rect(0, 0, pageWidth, bandH, "F");
  doc.setDrawColor(...PALETTE.accent);
  doc.setLineWidth(0.45);
  doc.line(0, bandH, pageWidth, bandH);

  const logoW = 16;
  const logoH = 11;
  let textX = margin;
  const logoDataUrl = await loadLogoDataUrl(origin);
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin, 8, logoW, logoH);
      textX = margin + logoW + 5;
    } catch {
      /* ignore */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...PALETTE.headText);
  doc.text("Customer profile report", textX, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(220, 235, 240);
  doc.text(`Generated  ·  ${generatedLabel}`, textX, 18);

  let y = bandH + 6;
  doc.setTextColor(...PALETTE.ink);
  doc.setFontSize(12);
  doc.text(String(customer.customerName || "Customer"), margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(...PALETTE.inkSoft);
  doc.text(`ID: ${customer.customerId || "—"}  ·  Phone: ${customer.mobileNumber || "—"}`, margin, y);
  y += 4.5;
  doc.text(`Centre: ${customer.selectedDay || "—"}  ·  ID / Aadhaar: ${customer.identityNumber || "—"}`, margin, y);
  y += 6;

  if (customer.customerPhotoDataUrl && String(customer.customerPhotoDataUrl).startsWith("data:")) {
    try {
      const fmt = customer.customerPhotoDataUrl.includes("png") ? "PNG" : "JPEG";
      doc.addImage(customer.customerPhotoDataUrl, fmt, pageWidth - margin - 32, bandH + 4, 32, 32);
    } catch {
      /* ignore */
    }
  }

  return y;
}

function drawSummaryBlock(doc, layout, summaryLines, startY) {
  if (!summaryLines.length) return startY;
  const { margin, contentW } = layout;
  const lineH = 4.2;
  const blockH = 6 + summaryLines.length * lineH + 4;

  doc.setFillColor(...PALETTE.surfaceAlt);
  doc.setDrawColor(...PALETTE.line);
  doc.roundedRect(margin, startY, contentW, blockH, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PALETTE.accent);
  doc.text("LOAN SUMMARY", margin + 4, startY + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  let yy = startY + 10;
  summaryLines.forEach((line) => {
    doc.setTextColor(...PALETTE.inkSoft);
    doc.text(`${line.label}: ${line.value}`, margin + 4, yy);
    yy += lineH;
  });

  return startY + blockH + 5;
}

/**
 * @param {object} params
 * @param {object} params.customer
 * @param {object[]} params.scheduleRows
 * @param {{ label: string, date: string }[]} params.timeline
 * @param {{ label: string, value: string }[]} params.summaryLines
 */
export async function downloadCustomerProfilePdf({
  customer,
  scheduleRows = [],
  timeline = [],
  summaryLines = [],
}) {
  const generatedAt = new Date();
  const generatedLabel = generatedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const layout = getPageLayout(doc, { margin: MARGIN, footerReserve: FOOTER_RESERVE });

  let y = await drawHeader(doc, layout, customer, generatedLabel, origin);
  y = drawSummaryBlock(doc, layout, summaryLines, y);

  const head = [["#", "EMI date", "EMI amount", "Collected", "Pending", "Status", "Collected by", "Remarks"]];
  const body =
    scheduleRows.length > 0
      ? scheduleRows.map((row) => [
          String(row.installmentNumber),
          fmtDate(row.dueDate),
          fmtInr(row.dueAmount),
          fmtInr(row.paidAmount),
          fmtInr(row.pendingAmount),
          String(row.status),
          String(row.collectedBy || "—"),
          String(row.remarks || row.note || "—"),
        ])
      : [
          [
            {
              content: "No EMI schedule (no loan or zero tenure).",
              colSpan: 8,
              styles: { halign: "center", fontStyle: "italic", textColor: PALETTE.muted },
            },
          ],
        ];

  const colWidths = distributeColumnWidths(layout.contentW, SCHEDULE_COL_RATIOS);
  const columnStyles = {};
  colWidths.forEach((w, i) => {
    columnStyles[i] = { cellWidth: w };
  });
  columnStyles[0].halign = "center";
  columnStyles[1].halign = "center";
  columnStyles[2].halign = "right";
  columnStyles[3].halign = "right";
  columnStyles[4].halign = "right";
  columnStyles[5].halign = "center";
  columnStyles[6].halign = "left";
  columnStyles[7].halign = "left";

  autoTable(doc, {
    startY: y,
    head,
    body,
    tableWidth: layout.contentW,
    margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_RESERVE },
    showHead: "everyPage",
    rowPageBreak: "auto",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 2.8, right: 2, bottom: 2.8, left: 2 },
      textColor: PALETTE.ink,
      lineColor: PALETTE.lineSoft,
      lineWidth: 0.1,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: PALETTE.headBg,
      textColor: PALETTE.headText,
      fontStyle: "bold",
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: PALETTE.surfaceAlt },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5 && typeof data.cell.text[0] === "string") {
        data.cell.styles.textColor = statusColor(data.cell.text[0]);
      }
    },
  });

  y = doc.lastAutoTable.finalY + 6;
  if (timeline.length && y < layout.pageHeight - FOOTER_RESERVE - 20) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...PALETTE.ink);
    doc.text("Activity timeline", MARGIN, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    timeline.slice(0, 24).forEach((t) => {
      if (y > layout.pageHeight - FOOTER_RESERVE - 8) return;
      doc.setTextColor(...PALETTE.inkSoft);
      doc.text(`${t.date} — ${t.label}`, MARGIN, y);
      y += 4;
    });
  }

  drawAllReportFooters(doc, generatedLabel, MARGIN);

  const stamp = new Date().toISOString().slice(0, 10);
  const id = String(customer.customerId || "customer").replace(/[^\w-]+/g, "_");
  doc.save(`customer-profile-${stamp}-${id}.pdf`);
}
