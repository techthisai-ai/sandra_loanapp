import { NO_SUB_CENTER_LABEL, resolveCustomerCenterDisplay } from "./centerDisplay.js";
import {
  getAssignedSubCentersForDayCenter,
  getSubCenterLabels,
} from "./employeeScope.js";
import { getEmployeeAssignedCenters } from "./employeeManagement.js";
import { formatCurrency } from "./employeeCollectionDetails.js";
import {
  makePaidEntryKey,
  sanitizePaidAmount,
} from "./collectionReportPaidStorage.js";
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
  { key: "pendingAmountDisplay", label: "Pending Amount", align: "right" },
  { key: "balanceAmount", label: "Balance Tenure", align: "right" },
  { key: "paid", label: "Paid", align: "right" },
];

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
  if (row.paidDisplay) return row.paidDisplay;
  if (row.paid && row.showPaidInput === false) return row.paid;
  if (row.installmentNumber == null) return row.paid || "—";

  const entryKey = makePaidEntryKey(row.customerId, row.installmentNumber);
  const committedAmount = sanitizePaidAmount(paidState.committed?.[entryKey]?.amount);
  if (committedAmount) return formatCurrency(Number(committedAmount));
  const draftAmount = sanitizePaidAmount(paidState.drafts?.[entryKey]);
  if (draftAmount) return formatCurrency(Number(draftAmount));
  return "—";
}

function mapRowForPrint(row, paidState) {
  return {
    customerId: row.customerId || "—",
    customerName: row.customerName || "—",
    phoneNumber: row.phoneNumber || "—",
    nomineeName: row.nomineeName || "—",
    loanDate: row.loanDate || "—",
    currentTenure: row.currentTenure || "—",
    currentDueAmount: row.currentDueAmount || "—",
    pendingTenuresLabel: row.pendingTenuresLabel || "—",
    pendingAmountDisplay: row.pendingAmountDisplay || "—",
    balanceAmount: row.balanceAmount || "—",
    paid: resolvePaidForPrint(row, paidState),
  };
}

/**
 * Group collection report rows by sub-center under a main center.
 */
export function groupReportRowsBySubCenter({
  reportRows = [],
  mainCenter,
  allCenters = [],
  employee,
}) {
  const main = String(mainCenter || "").trim();
  if (!main) return [];

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

function buildDetailTableHtml(rows, paidState) {
  if (!rows.length) return "";

  const headerCells = PRINT_COLUMNS.map(
    (column) =>
      `<th class="${cellAlignClass(column.align)}">${escapeHtml(column.label)}</th>`
  ).join("");

  const bodyRows = rows
    .map((row) => {
      const mapped = mapRowForPrint(row, paidState);
      const rowAlert = getCollectionReportAlert(row);
      const cells = PRINT_COLUMNS.map((column) => {
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

function buildSectionHtml(section, paidState) {
  if (!section?.rows?.length) return "";

  return `
    <section class="sub-center-section">
      <div class="section-header">
        <div class="section-line" aria-hidden="true"></div>
        <h2 class="section-title">${escapeHtml(section.subCenter)}</h2>
        <div class="section-line" aria-hidden="true"></div>
      </div>
      ${buildDetailTableHtml(section.rows, paidState)}
    </section>
  `;
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
          <p class="summary-value">${escapeHtml(card.value)}</p>
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
  companyName = "Ruthra Financial Solutions",
}) {
  const sectionMarkup = sections
    .filter((section) => section.rows?.length)
    .map((section) => buildSectionHtml(section, paidState))
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
    <style>
      @page {
        size: A4 landscape;
        margin: 10mm 8mm;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", Arial, sans-serif;
        color: #0f172a;
        background: #fff;
        line-height: 1.35;
        font-size: 10px;
      }
      .sheet { width: 100%; margin: 0 auto; }
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
      .sub-center-section {
        margin-bottom: 20px;
        page-break-inside: avoid;
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
        margin: 8px 0 0;
        color: #94a3b8;
        font-style: italic;
      }
      .footer {
        margin-top: 12px;
        padding-top: 8px;
        border-top: 1px solid #e2e8f0;
        font-size: 8px;
        color: #64748b;
        text-align: center;
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
    </style>
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
  const html = buildCollectionCustomerReportHtml(payload);

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

export function validateCollectionPrintSelection({ mainCenter }) {
  if (!mainCenter || mainCenter === "All") {
    return "Please select a Main Center before printing.";
  }
  return "";
}
