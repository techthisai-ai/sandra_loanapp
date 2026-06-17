import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { BRAND_COMPANY_NAME } from "../constants/brand.js";
import { NO_SUB_CENTER_LABEL, resolveCustomerCenterDisplay } from "./centerDisplay.js";
import {
  drawEnterprisePdfHeader,
  drawEnterprisePdfKpiCards,
  drawEnterprisePdfMetaStrip,
} from "./enterpriseTabularReportPdf.js";
import { ensurePdfUnicodeFont } from "./pdfUnicodeFont.js";
import { drawAllReportFooters, getPageLayout } from "./pdfReportLayout.js";
import { reportDateStamp } from "./reportFilenames.js";
import {
  getAssignedSubCentersForDayCenter,
  getSubCenterLabels,
} from "./employeeScope.js";
import { getEmployeeAssignedCenters } from "./employeeManagement.js";
import { formatCurrencyForPrint, toPrintCurrencyText } from "./formatCurrency.js";
import {
  makePaidEntryKey,
  sanitizePaidAmount,
} from "./collectionReportPaidStorage.js";
import { resolveReportPaidColumnAmount } from "./collectionReportRows.js";
import {
  collectionReportPrintCellClass,
  getCollectionReportAlert,
} from "./collectionAlerts.js";

const PRINT_COLUMNS = [
  { key: "customerId", label: "Customer ID", align: "left" },
  { key: "customerName", label: "Customer Name", align: "left" },
  { key: "phoneNumber", label: "Phone Number", align: "left" },
  { key: "nomineeName", label: "Nominee Name", align: "left" },
  { key: "loanDate", label: "Loan Date", align: "left" },
  { key: "currentTenure", label: "Current Tenure", align: "center" },
  { key: "currentDueAmount", label: "Current Due", align: "right" },
  { key: "pendingTenuresLabel", label: "Pending", align: "center" },
  { key: "pendingAmountDisplay", label: "Total Pending", align: "right" },
  { key: "balanceAmount", label: "Balance Tenure", align: "right" },
  { key: "paid", label: "Paid", align: "right" },
  { key: "entry", label: "Entry", align: "right" },
];

/** Print preview shows tables only — hide tenure and due columns. */
const PRINT_TABLE_COLUMNS = PRINT_COLUMNS.filter(
  (column) => column.key !== "currentTenure" && column.key !== "currentDueAmount"
);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrintDate(date = new Date()) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatGeneratedStamp(date = new Date()) {
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function resolvePaidForPrint(row, paidState = { drafts: {}, committed: {} }) {
  const amount = resolveReportPaidColumnAmount(row, paidState);
  return amount > 0 ? formatCurrencyForPrint(amount) : "—";
}

function resolveEntryForPrint(row, paidState = { drafts: {}, committed: {} }) {
  if (row.installmentNumber == null) return "—";
  const entryKey = makePaidEntryKey(row.customerId, row.installmentNumber);
  const draftAmount = sanitizePaidAmount(paidState.drafts?.[entryKey]);
  return draftAmount ? formatCurrencyForPrint(Number(draftAmount)) : "—";
}

function mapRowForPrint(row, paidState) {
  return {
    customerId: row.customerId || "—",
    customerName: row.customerName || "—",
    phoneNumber: row.phoneNumber || "—",
    nomineeName: row.nomineeName || "—",
    loanDate: row.loanDate || "—",
    currentTenure: row.currentTenure || "—",
    currentDueAmount: toPrintCurrencyText(row.currentDueAmount || "—"),
    pendingTenuresLabel: row.pendingTenuresLabel || "—",
    pendingAmountDisplay: toPrintCurrencyText(row.pendingAmountDisplay || "—"),
    balanceAmount: toPrintCurrencyText(row.balanceAmount || "—"),
    paid: resolvePaidForPrint(row, paidState),
    entry: resolveEntryForPrint(row, paidState),
  };
}

/**
 * Group collection report rows by sub-center under a main center.
 */
function buildAllCentersSections(reportRows = []) {
  const sectionMap = new Map();

  reportRows.forEach((row) => {
    const day = String(row.dayCenter || "").trim() || "—";
    const sub = row.subCenter || NO_SUB_CENTER_LABEL;
    const sectionLabel = day !== "—" ? `${day} · ${sub}` : sub;

    if (!sectionMap.has(sectionLabel)) {
      sectionMap.set(sectionLabel, { subCenter: sectionLabel, rows: [] });
    }
    sectionMap.get(sectionLabel).rows.push(row);
  });

  return [...sectionMap.values()]
    .filter((section) => section.rows.length)
    .sort((a, b) => a.subCenter.localeCompare(b.subCenter));
}

export function groupReportRowsBySubCenter({
  reportRows = [],
  mainCenter,
  allCenters = [],
  employee,
}) {
  const main = String(mainCenter || "").trim();
  if (!main || main === "All") {
    return buildAllCentersSections(reportRows);
  }

  const allSubs = getSubCenterLabels(main, allCenters);
  let orderedSubs = allSubs;

  if (employee) {
    const assignments = getEmployeeAssignedCenters(employee);
    const employeeSubs = getAssignedSubCentersForDayCenter(main, assignments, allCenters);
    if (employeeSubs.length) orderedSubs = employeeSubs;
  }

  if (!orderedSubs.length) {
    orderedSubs = [
      ...new Set(reportRows.map((row) => row.subCenter || NO_SUB_CENTER_LABEL).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
  }

  const sectionMap = new Map();
  const ensureSection = (subCenter) => {
    if (!sectionMap.has(subCenter)) {
      sectionMap.set(subCenter, { subCenter, rows: [] });
    }
    return sectionMap.get(subCenter);
  };

  reportRows.forEach((row) => {
    const subCenter = row.subCenter || NO_SUB_CENTER_LABEL;
    ensureSection(subCenter).rows.push(row);
  });

  const seen = new Set();
  const sections = [];

  orderedSubs.forEach((label) => {
    const section = sectionMap.get(label);
    if (!section?.rows.length) return;
    sections.push(section);
    seen.add(label);
  });

  [...sectionMap.keys()]
    .filter((label) => !seen.has(label))
    .sort((a, b) => a.localeCompare(b))
    .forEach((label) => {
      const section = sectionMap.get(label);
      if (section?.rows.length) sections.push(section);
    });

  return sections;
}

/** @deprecated Use groupReportRowsBySubCenter with full report rows */
export function buildCollectionCustomerPrintSections(props) {
  return groupReportRowsBySubCenter({
    reportRows: (props.customers || []).map((customer) => ({
      customerId: customer.customerId,
      customerName: customer.customerName,
      subCenter: resolveCustomerCenterDisplay(customer, props.allCenters).subCenter,
    })),
    mainCenter: props.mainCenter,
    allCenters: props.allCenters,
    employee: props.employee,
  });
}

function cellAlignClass(align) {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function buildDetailTableHtml(rows, paidState, columns = PRINT_COLUMNS) {
  if (!rows.length) return "";

  const headerCells = columns.map(
    (column) =>
      `<th class="${cellAlignClass(column.align)}">${escapeHtml(column.label)}</th>`
  ).join("");

  const bodyRows = rows
    .map((row) => {
      const mapped = mapRowForPrint(row, paidState);
      const rowAlert = getCollectionReportAlert(row);
      const cells = columns.map((column) => {
        const value = mapped[column.key] ?? "—";
        const alertClass = collectionReportPrintCellClass(rowAlert, column.key);
        const classNames = [cellAlignClass(column.align), alertClass].filter(Boolean).join(" ");
        return `<td class="${classNames}">${escapeHtml(value)}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <table class="detail-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

function buildSectionHtml(section, paidState, columns = PRINT_COLUMNS) {
  if (!section?.rows?.length) return "";

  return `
    <section class="sub-center-section">
      <div class="section-header">
        <div class="section-line" aria-hidden="true"></div>
        <h2 class="section-title">${escapeHtml(section.subCenter)}</h2>
        <div class="section-line" aria-hidden="true"></div>
      </div>
      ${buildDetailTableHtml(section.rows, paidState, columns)}
    </section>
  `;
}

const PRINT_BODY_STYLES = `
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Noto Sans Tamil", "Segoe UI", Arial, sans-serif;
        color: #0f172a;
        background: #fff;
        line-height: 1.35;
        font-size: 10px;
        font-variant-numeric: normal;
        letter-spacing: normal;
      }
      .sheet { width: 100%; margin: 0 auto; }
      .sub-center-section {
        margin-bottom: 20px;
        page-break-inside: avoid;
      }
      .sub-center-section:first-child .section-header {
        margin-top: 0;
      }
      .section-header {
        display: flex;
        align-items: center;
        gap: 14px;
        margin: 14px 0 10px;
      }
      .section-line {
        flex: 1;
        height: 1px;
        background: #0d9488;
        min-width: 24px;
      }
      .section-title {
        margin: 0;
        flex-shrink: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #115e59;
        white-space: nowrap;
      }
      .detail-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        table-layout: fixed;
      }
      .detail-table thead th {
        background: #115e59;
        color: #fff;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 6px 4px;
        border: 1px solid #0f766e;
        vertical-align: middle;
      }
      .detail-table tbody td {
        border: 1px solid #e2e8f0;
        padding: 5px 4px;
        font-size: 9px;
        color: #0f172a;
        vertical-align: top;
        word-wrap: break-word;
      }
      .detail-table tbody tr:nth-child(even) { background: #f8fafc; }
      .detail-table tbody td.cr-alert-text-red {
        color: #be123c;
        font-weight: 600;
      }
      .detail-table tbody td.cr-alert-bg-red {
        background: #ffe4e6 !important;
        color: #0f172a;
        font-weight: 600;
      }
      .detail-table tbody td.cr-alert-bg-yellow {
        background: #fef3c7 !important;
        color: #0f172a;
        font-weight: 600;
      }
      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .text-left { text-align: left; }
      .empty-table {
        margin: 0;
        color: #94a3b8;
        font-style: italic;
      }
      @media print {
        body,
        .detail-table tbody td.cr-alert-text-red,
        .detail-table tbody td.cr-alert-bg-red,
        .detail-table tbody td.cr-alert-bg-yellow {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .sub-center-section { break-inside: avoid-page; }
        .detail-table thead { display: table-header-group; }
      }
`;

/** Collection report Print button — A4 portrait. */
const PRINT_CUSTOMER_PORTRAIT_STYLES = `
      @page {
        size: A4 portrait;
        margin: 10mm 8mm;
      }
      ${PRINT_BODY_STYLES}
      .detail-table thead th {
        font-size: 6.5px;
        padding: 4px 2px;
        letter-spacing: 0.04em;
      }
      .detail-table tbody td {
        font-size: 7px;
        padding: 3px 2px;
      }
      .section-title {
        font-size: 10px;
      }
`;

const PRINT_SHEET_STYLES = `
      @page {
        size: A4 landscape;
        margin: 10mm 8mm;
      }
      ${PRINT_BODY_STYLES}
`;

const FULL_REPORT_EXTRA_STYLES = `
      .top-band {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        padding: 10px 12px;
        border-bottom: 2px solid #0d9488;
        background: #f1f5f9;
        margin-bottom: 10px;
      }
      .brand-title {
        font-size: 16px;
        font-weight: 700;
        color: #0f172a;
      }
      .brand-subtitle {
        margin-top: 2px;
        font-size: 12px;
        font-weight: 600;
        color: #0d9488;
      }
      .brand-meta {
        font-size: 9px;
        color: #64748b;
        margin-top: 4px;
      }
      .meta-right {
        text-align: right;
        font-size: 9px;
        color: #64748b;
        line-height: 1.5;
      }
      .filter-strip {
        margin-bottom: 10px;
        padding: 8px 10px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        background: #f8fafc;
      }
      .filter-line { margin: 0 0 3px; color: #475569; }
      .summary-cards {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 12px;
      }
      .summary-card {
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        background: #fff;
        padding: 8px 10px;
      }
      .summary-label {
        margin: 0;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #64748b;
      }
      .summary-value {
        margin: 4px 0 0;
        font-size: 13px;
        font-weight: 700;
        color: #0f172a;
      }
      .footer {
        margin-top: 12px;
        padding-top: 8px;
        border-top: 1px solid #e2e8f0;
        font-size: 8px;
        color: #64748b;
        text-align: center;
      }
`;

function buildCollectionCustomerPrintHtml({
  sections = [],
  paidState = { drafts: {}, committed: {} },
}) {
  const sectionMarkup = sections
    .filter((section) => section.rows?.length)
    .map((section) => buildSectionHtml(section, paidState, PRINT_TABLE_COLUMNS))
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Collection Customer Report</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;700&display=swap" />
    <style>${PRINT_CUSTOMER_PORTRAIT_STYLES}</style>
  </head>
  <body>
    <div class="sheet">
      ${sectionMarkup || `<p class="empty-table">No customers found for the selected employee and main center.</p>`}
    </div>
  </body>
</html>`;
}

function buildSummaryCardsHtml(cards = []) {
  if (!cards.length) return "";
  return `
    <div class="summary-cards">
      ${cards
        .map(
          (card) => `
        <div class="summary-card">
          <p class="summary-label">${escapeHtml(card.label)}</p>
          <p class="summary-value">${escapeHtml(toPrintCurrencyText(card.value))}</p>
        </div>`
        )
        .join("")}
    </div>
  `;
}

export function buildCollectionCustomerReportHtml({
  employeeName,
  mainCenter,
  printDate = formatPrintDate(),
  generatedAt = formatGeneratedStamp(),
  sections = [],
  paidState = { drafts: {}, committed: {} },
  filterLines = [],
  summaryCards = [],
  reportId = "",
  companyName = BRAND_COMPANY_NAME,
}) {
  const sectionMarkup = sections
    .filter((section) => section.rows?.length)
    .map((section) => buildSectionHtml(section, paidState, PRINT_COLUMNS))
    .join("");
  const totalCustomers = sections.reduce((sum, section) => sum + section.rows.length, 0);
  const filterMarkup = filterLines
    .map((line) => `<p class="filter-line">${escapeHtml(line)}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Collection Customer Report</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;700&display=swap" />
    <style>${PRINT_SHEET_STYLES}${FULL_REPORT_EXTRA_STYLES}</style>
  </head>
  <body>
    <div class="sheet">
      <div class="top-band">
        <div>
          <div class="brand-title">${escapeHtml(companyName)}</div>
          <div class="brand-subtitle">Collection report</div>
          <div class="brand-meta">Employee: ${escapeHtml(employeeName || "—")} · Main center: ${escapeHtml(mainCenter || "—")}</div>
        </div>
        <div class="meta-right">
          <div>Generated · ${escapeHtml(generatedAt)}</div>
          ${reportId ? `<div>Report ID · ${escapeHtml(reportId)}</div>` : ""}
          <div>Print date · ${escapeHtml(printDate)}</div>
          <div>Total customers · ${totalCustomers}</div>
        </div>
      </div>

      ${filterLines.length ? `<div class="filter-strip">${filterMarkup}</div>` : ""}
      ${buildSummaryCardsHtml(summaryCards)}

      ${sectionMarkup || `<p class="empty-table">No customers found for the selected employee and main center.</p>`}

      <div class="footer">Collection customer report · ${escapeHtml(mainCenter || "—")} · ${escapeHtml(printDate)}</div>
    </div>
  </body>
</html>`;
}

function triggerPrintWindow(contentWindow) {
  if (!contentWindow) return false;
  try {
    contentWindow.focus();
    contentWindow.print();
    return true;
  } catch {
    return false;
  }
}

function printViaIframe(html) {
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Collection customer report print");
  frame.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(frame);

  const contentWindow = frame.contentWindow;
  const doc = frame.contentDocument || contentWindow?.document;
  if (!doc || !contentWindow) {
    frame.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const runPrint = () => triggerPrintWindow(contentWindow);
  frame.onload = runPrint;
  setTimeout(() => {
    if (!runPrint()) {
      window.alert("Print failed. Please try again.");
    }
    setTimeout(() => frame.remove(), 60_000);
  }, 700);

  return true;
}

export function printCollectionCustomerReport(payload) {
  const html = buildCollectionCustomerPrintHtml(payload);

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => triggerPrintWindow(printWindow);
    setTimeout(() => {
      if (triggerPrintWindow(printWindow)) return;
      printWindow.close();
      if (!printViaIframe(html)) {
        window.alert("Unable to open print preview. Allow pop-ups for this site and try again.");
      }
    }, 800);
    return;
  }

  if (!printViaIframe(html)) {
    window.alert("Unable to open print preview. Allow pop-ups for this site and try again.");
  }
}

export async function downloadCollectionCustomerReport(payload, stamp = reportDateStamp()) {
  const {
    employeeName,
    mainCenter,
    sections = [],
    paidState = { drafts: {}, committed: {} },
    filterLines = [],
    summaryCards = [],
    reportId = "",
    printDate = formatPrintDate(),
    generatedAt = formatGeneratedStamp(),
  } = payload;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pdfFont = await ensurePdfUnicodeFont(doc, origin);
  const margin = 10;
  const footerReserve = 16;
  const layout = getPageLayout(doc, { margin, footerReserve });
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalCustomers = sections.reduce((sum, section) => sum + (section.rows?.length || 0), 0);

  let y = await drawEnterprisePdfHeader(
    doc,
    layout,
    origin,
    {
      title: "Collection report",
      subtitle: `Employee: ${employeeName || "All employees"} · Main center: ${mainCenter || "All"}`,
      generatedLabel: generatedAt,
      reportId,
      rightLines: [
        `Print date  ·  ${printDate}`,
        `Total customers  ·  ${totalCustomers}`,
      ],
    },
    pdfFont
  );

  y = drawEnterprisePdfMetaStrip(doc, layout, y, filterLines, null, pdfFont);
  y = drawEnterprisePdfKpiCards(doc, layout, y, summaryCards, pdfFont);

  const head = [PRINT_COLUMNS.map((column) => column.label)];
  const columnKeys = PRINT_COLUMNS.map((column) => column.key);
  const populatedSections = sections.filter((section) => section.rows?.length);
  const pdfSoftFills = {
    dangerSoft: [255, 228, 230],
    warnSoft: [254, 243, 199],
  };

  if (!populatedSections.length) {
    doc.setFont(pdfFont, "italic");
    doc.text("No customers found for the selected filters.", margin, y);
  } else {
    populatedSections.forEach((section) => {
      if (y > pageHeight - 30) {
        doc.addPage();
        y = margin + 4;
      }

      doc.setFont(pdfFont, "bold");
      doc.setFontSize(9);
      doc.text(section.subCenter, margin, y);
      y += 4;

      const body = section.rows.map((row) =>
        PRINT_COLUMNS.map((column) => {
          const mapped = mapRowForPrint(row, paidState);
          return mapped[column.key] ?? "—";
        })
      );

      autoTable(doc, {
        startY: y,
        head,
        body,
        margin: { left: margin, right: margin, bottom: footerReserve },
        styles: { font: pdfFont, fontSize: 6.5, cellPadding: 1.2 },
        headStyles: {
          fillColor: [17, 94, 89],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 6,
        },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          const sourceRow = section.rows[data.row.index];
          const alert = getCollectionReportAlert(sourceRow);
          if (!alert || alert.kind === "none") return;
          const colKey = columnKeys[data.column.index];
          if (alert.scope === "customerIdCell" && colKey === "customerId" && alert.pdfFill) {
            data.cell.styles.fillColor = pdfSoftFills[alert.pdfFill] || [255, 255, 255];
            return;
          }
          if (!alert.pdfColor) return;
          const pdfColor = alert.pdfColor === "warn" ? [217, 119, 6] : [190, 18, 60];
          if (alert.scope === "fullRow") {
            data.cell.styles.textColor = pdfColor;
          }
        },
      });
      y = doc.lastAutoTable.finalY + 6;
    });
  }

  drawAllReportFooters(
    doc,
    `Collection customer report · ${mainCenter || "—"} · ${printDate}`,
    margin
  );
  doc.save(`collection-customer-report-${stamp}.pdf`);
}

function pushFilterLine(infoRows, line) {
  const raw = String(line || "").trim();
  if (!raw) return;
  const idx = raw.indexOf(":");
  if (idx > 0 && idx < 40) {
    infoRows.push([raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()]);
  } else {
    infoRows.push(["Filter", raw]);
  }
}

function downloadXlsxWorkbook(filename, workbook) {
  const out = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadCollectionCustomerReportXlsx(payload, stamp = reportDateStamp()) {
  const {
    employeeName,
    mainCenter,
    sections = [],
    paidState = { drafts: {}, committed: {} },
    filterLines = [],
    summaryCards = [],
    reportId = "",
    printDate = formatPrintDate(),
    generatedAt = formatGeneratedStamp(),
    companyName = BRAND_COMPANY_NAME,
  } = payload;

  const totalCustomers = sections.reduce((sum, section) => sum + (section.rows?.length || 0), 0);
  const infoRows = [
    ["Field", "Value"],
    ["Company", companyName],
    ["Report", "Collection customer report"],
    ["Employee", employeeName || "All employees"],
    ["Main center", mainCenter || "All"],
    ["Report ID", reportId],
    ["Generated", generatedAt],
    ["Print date", printDate],
    ["Total customers", String(totalCustomers)],
  ];
  for (const line of filterLines) pushFilterLine(infoRows, line);
  for (const card of summaryCards) {
    infoRows.push([String(card.label || "Summary"), toPrintCurrencyText(card.value)]);
  }

  const headers = PRINT_COLUMNS.map((column) => column.label);
  const dataRows = [];
  const populatedSections = sections.filter((section) => section.rows?.length);

  if (!populatedSections.length) {
    dataRows.push(headers, ["No customers found for the selected filters."]);
  } else {
    populatedSections.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) dataRows.push([]);
      dataRows.push([section.subCenter]);
      dataRows.push(headers);
      section.rows.forEach((row) => {
        const mapped = mapRowForPrint(row, paidState);
        dataRows.push(PRINT_COLUMNS.map((column) => mapped[column.key] ?? "—"));
      });
    });
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(infoRows), "Report info");
  const dataSheet = XLSX.utils.aoa_to_sheet(dataRows);
  dataSheet["!cols"] = headers.map((label, index) => ({
    wch: Math.max(label.length + 2, index <= 1 ? 18 : 14),
  }));
  XLSX.utils.book_append_sheet(workbook, dataSheet, "Collection");
  downloadXlsxWorkbook(`collection-customer-report-${stamp}.xlsx`, workbook);
}
