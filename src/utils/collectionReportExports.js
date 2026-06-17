import * as XLSX from "xlsx";
import { BRAND_COMPANY_NAME } from "../constants/brand.js";
import { resolveReportPaidColumnAmount } from "./collectionReportRows.js";
import {
  makePaidEntryKey,
  sanitizePaidAmount,
} from "./collectionReportPaidStorage.js";
import { reportDateStamp } from "./reportFilenames.js";

const COLLECTION_REPORT_PANEL_COLUMNS = [
  { key: "serial", label: "S.NO", width: 8 },
  { key: "customerId", label: "CUSTOMER ID", width: 14 },
  { key: "customerName", label: "CUSTOMER NAME", width: 22 },
  { key: "phoneNumber", label: "PHONE NUMBER", width: 14 },
  { key: "nomineeName", label: "NOMINEE NAME", width: 18 },
  { key: "loanDate", label: "LOAN DATE", width: 12 },
  { key: "currentTenure", label: "CURRENT TENURE", width: 14 },
  { key: "currentDueAmount", label: "CURRENT DUE", width: 14 },
  { key: "pendingTenuresLabel", label: "PENDING", width: 10 },
  { key: "pendingAmountDisplay", label: "TOTAL PENDING", width: 16 },
  { key: "balanceAmount", label: "BALANCE TENURE", width: 16 },
  { key: "paid", label: "PAID", width: 14 },
  { key: "entry", label: "ENTRY", width: 12 },
];

function mapCollectionReportPanelCell(row, column, index, paidState) {
  if (column.key === "serial") return index + 1;
  if (column.key === "paid") {
    const amount = resolveReportPaidColumnAmount(row, paidState);
    return amount > 0 ? amount : "";
  }
  if (column.key === "entry") {
    if (row.installmentNumber == null) return "";
    const entryKey = makePaidEntryKey(row.customerId, row.installmentNumber);
    const draftAmount = sanitizePaidAmount(paidState.drafts?.[entryKey]);
    return draftAmount ? Number(draftAmount) : "";
  }
  const value = row[column.key];
  if (value == null || value === "—") return "";
  return value;
}

function rowsToCsv(lines) {
  return lines
    .map((line) => line.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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

function writeWorkbook(filename, wb) {
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(
    filename,
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  );
}

/**
 * Excel export that mirrors EnterpriseReportPreview columns, metrics, and metadata.
 */
export function downloadEnterprisePreviewXlsx({
  title = "Report",
  subtitle = "",
  columns = [],
  rows = [],
  metrics = [],
  filterLines = [],
  reportMeta = {},
  generatedAt = "",
  filenamePrefix = "report",
  stamp = reportDateStamp(),
}) {
  const infoRows = [
    ["Field", "Value"],
    ["Company", BRAND_COMPANY_NAME],
    ["Report", title],
  ];
  if (subtitle) infoRows.push(["Subtitle", subtitle]);
  if (reportMeta.reportId) infoRows.push(["Report ID", reportMeta.reportId]);
  if (reportMeta.preparedBy) infoRows.push(["Prepared by", reportMeta.preparedBy]);
  if (reportMeta.contact) infoRows.push(["Contact", reportMeta.contact]);
  if (reportMeta.branch || reportMeta.center) {
    infoRows.push(["Center / branch", reportMeta.branch || reportMeta.center]);
  }
  if (generatedAt || reportMeta.generatedLabel) {
    infoRows.push(["Generated", generatedAt || reportMeta.generatedLabel]);
  }
  for (const line of filterLines) pushFilterLine(infoRows, line);
  for (const card of metrics) {
    infoRows.push([String(card.label || "Metric"), String(card.value ?? "")]);
    if (card.note) infoRows.push([`${card.label} (note)`, String(card.note)]);
  }

  const headers = columns.map((column) => column.label);
  const dataRows = rows.map((row) =>
    columns.map((column) => {
      const value = row[column.key];
      if (value == null || value === "") return "";
      if (column.cellType === "currency") {
        const amount = Number(value);
        return Number.isFinite(amount) ? amount : 0;
      }
      return value;
    })
  );

  const wsData = XLSX.utils.aoa_to_sheet(
    dataRows.length ? [headers, ...dataRows] : [headers, ["No rows in this view"]]
  );
  wsData["!cols"] = columns.map((column) => ({
    wch: Math.max(
      String(column.label || "").length + 2,
      column.cellType === "currency" ? 14 : 12
    ),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(infoRows), "Report info");
  XLSX.utils.book_append_sheet(wb, wsData, "Data");
  writeWorkbook(`${filenamePrefix}-${stamp}.xlsx`, wb);
}

/**
 * Collection customer report table export — matches on-screen columns in one sheet.
 */
export function downloadCollectionReportPanelXlsx({
  rows = [],
  paidState = { drafts: {}, committed: {} },
  employeeName = "All employees",
  mainCenter = "All",
  filterLines = [],
  summaryCards = [],
  reportId = "",
  generatedAt = "",
  printDate = "",
  companyName = BRAND_COMPANY_NAME,
  stamp = reportDateStamp(),
}) {
  const infoRows = [
    ["Field", "Value"],
    ["Company", companyName],
    ["Report", "Collection customer report"],
    ["Employee", employeeName || "All employees"],
    ["Main center", mainCenter || "All"],
    ["Report ID", reportId || ""],
    ["Generated", generatedAt || ""],
    ["Print date", printDate || ""],
    ["Total customers", String(rows.length)],
  ];
  for (const line of filterLines) pushFilterLine(infoRows, line);
  for (const card of summaryCards) {
    infoRows.push([String(card.label || "Summary"), String(card.value ?? "")]);
  }

  const headers = COLLECTION_REPORT_PANEL_COLUMNS.map((column) => column.label);
  const tableRows = rows.map((row, index) =>
    COLLECTION_REPORT_PANEL_COLUMNS.map((column) =>
      mapCollectionReportPanelCell(row, column, index, paidState)
    )
  );

  const sheetRows = [
    ...infoRows,
    [],
    headers,
    ...(tableRows.length ? tableRows : [["No customers found for the selected filters."]]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet["!cols"] = COLLECTION_REPORT_PANEL_COLUMNS.map((column, index) => ({
    wch: index === 0 ? 20 : index === 1 ? 28 : column.width,
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Collection Report");
  writeWorkbook(`collection-customer-report-${stamp}.xlsx`, workbook);
}

/** @param {object[]} rows — same shape as Reports detailRows */
export function downloadCollectionReportCsv(rows, stamp = reportDateStamp()) {
  const content = rowsToCsv([
    [
      "Center",
      "Sub-center",
      "Customer Name",
      "Customer ID",
      "Phone Number",
      "Loan Amount",
      "Total Payable",
      "Total Collected",
      "Outstanding",
      "Due Date",
      "On Time",
      "Latest Status",
    ],
    ...rows.map((row) => [
      row.dayCenter,
      row.subCenter,
      row.customerName,
      row.customerId,
      row.phoneNumber,
      row.loanAmount,
      row.totalPayable,
      row.totalCollected,
      row.outstanding,
      row.dueDate,
      row.onTime,
      row.latestStatus,
    ]),
  ]);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  downloadBlob(`collection-report-${stamp}.csv`, blob);
}

/**
 * @param {object[]} rows
 * @param {string} [stamp]
 * @param {{
 *   periodLabel?: string;
 *   generatedAt?: string;
 *   filterLines?: string[];
 * }} [meta]
 */
export function downloadCollectionReportXlsx(rows, stamp = reportDateStamp(), meta = {}) {
  const sheetRows = rows.map((row) => ({
    Center: row.dayCenter ?? "",
    "Sub-center": row.subCenter ?? "",
    "Customer Name": row.customerName ?? "",
    "Customer ID": row.customerId ?? "",
    "Phone Number": row.phoneNumber ?? "",
    "Loan Amount": Number(row.loanAmount || 0),
    "Total Payable": Number(row.totalPayable || 0),
    "Total Collected": Number(row.totalCollected || 0),
    Outstanding: Number(row.outstanding || 0),
    "Due Date": row.dueDate ?? "",
    "On Time": row.onTime ?? "",
    "Latest Status": row.latestStatus ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(sheetRows.length ? sheetRows : [{ Note: "No rows in this view" }]);
  const wb = XLSX.utils.book_new();

  const infoRows = [["Field", "Value"]];
  infoRows.push(["Report", "Loan collection export"]);
  if (meta.periodLabel) infoRows.push(["Period", String(meta.periodLabel)]);
  if (meta.generatedAt) infoRows.push(["Generated", String(meta.generatedAt)]);
  for (const line of meta.filterLines || []) {
    const raw = String(line || "").trim();
    if (!raw) continue;
    const idx = raw.indexOf(":");
    if (idx > 0 && idx < 40) {
      infoRows.push([raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()]);
    } else {
      infoRows.push(["Filter", raw]);
    }
  }
  const wsInfo = XLSX.utils.aoa_to_sheet(infoRows);
  XLSX.utils.book_append_sheet(wb, wsInfo, "Report info");
  XLSX.utils.book_append_sheet(wb, ws, "Collection");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(`collection-report-${stamp}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

/**
 * @param {object} report — buildCustomerFinancialReport shape
 * @param {object[]} historyRows — filtered monthly history rows
 * @param {object[]} txnRows — filtered employee txn rows
 */
export function downloadEmployeeLoanReportXlsx(report, historyRows, txnRows, stamp = reportDateStamp()) {
  const safeId = String(report.customerId || "customer").replace(/[^\w-]+/g, "_");
  const summary = [
    { Field: "Employee Name", Value: report.customerName ?? "" },
    { Field: "Employee ID", Value: report.customerId ?? "" },
    { Field: "Phone", Value: report.phoneNumber ?? "" },
    { Field: "Center", Value: report.dayCenter ?? "" },
    { Field: "Sub-center", Value: report.subCenter ?? "" },
    { Field: "Loan ID", Value: report.loanId ?? "" },
    { Field: "Loan Amount", Value: Number(report.loanAmount || 0) },
    { Field: "Total Payable", Value: Number(report.totalPayable || 0) },
    { Field: "Total Collected", Value: Number(report.totalCollected || 0) },
    { Field: "Pending", Value: Number(report.pendingAmount || 0) },
    { Field: "Status", Value: report.loanDisplayStatus || report.loanStatus || "" },
  ];
  const hist = (historyRows || []).map((row) => ({
    Month: row.monthLabel ?? "",
    "Due Amount": Number(row.dueAmount || 0),
    "Paid Amount": Number(row.paidAmount || 0),
    Pending: Number(row.pendingAmount || 0),
    "Payment Date": row.paymentDate ?? "",
    "Collected By": row.collectedBy ?? "",
    Status: row.status ?? "",
  }));
  const tx = (txnRows || []).map((row) => ({
    Sno: row.sno ?? "",
    "Payment Date": row.paymentDate ?? "",
    Month: row.monthLabel ?? "",
    "Paid Amount": Number(row.paidAmount || 0),
    "Pending After": Number(row.pendingBalanceAfter || 0),
    Method: row.paymentMethod ?? "",
    "Collected By": row.collectedBy ?? "",
    "Receipt No": row.receiptNo ?? "",
    "Collection Status": row.status ?? "",
    "Approval Status": row.approvalStatus ?? "",
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(hist.length ? hist : [{ Note: "No history rows" }]),
    "Monthly"
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tx.length ? tx : [{ Note: "No transactions" }]), "Transactions");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(`employee-loan-report-${stamp}-${safeId}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

/** Collection register rows (same shape as Collection.jsx filtered rows). */
export function downloadCollectionRegisterXlsx(rows, stamp = reportDateStamp()) {
  const sheetRows = (rows || []).map((row) => ({
    "Customer Name": row.customerName ?? "",
    "Customer ID": row.customerId ?? "",
    Center: row.center ?? "",
    "Collection Type": row.collectionFrequency ?? "",
    "Due Date": row.dueDate ?? "",
    "Collection Date": row.collectionDate ?? "",
    "Collected Amount": Number(row.amount || 0),
    "Payment Method": row.paymentMethod ?? "",
    "Collector Name": row.collectorName ?? "",
    Status: row.collectionStatus ?? "",
    Remarks: row.remarks ?? "",
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(sheetRows.length ? sheetRows : [{ Note: "No rows in this view" }]),
    "Register"
  );
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(`collection-register-${stamp}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

/** Approval register rows (ApprovalPage table shape). */
export function downloadApprovalRegisterXlsx(rows, stamp = reportDateStamp(), meta = {}) {
  const sheetRows = (rows || []).map((row) => ({
    "Customer Name": row.customerName ?? "",
    "Customer ID": row.customerId ?? "",
    Center: row.center ?? "",
    "Collection Type": row.collectionFrequency ?? "",
    "Due Date": row.dueDate ?? "",
    "Collection Date": row.collectionDate ?? "",
    "Collected Amount": Number(row.amount || 0),
    "Payment Method": row.paymentMethod ?? "",
    "Collector Name": row.collectorName ?? "",
    Status: row.collectionStatus ?? "",
    Remarks: row.remarks ?? "",
    "Approval Status": row.approvalStatus ?? "",
    "Approved At": row.approvedAt ?? "",
    "Rejected At": row.rejectedAt ?? "",
  }));
  const wb = XLSX.utils.book_new();
  const infoRows = [["Field", "Value"]];
  infoRows.push(["Report", meta.title || "Approval register"]);
  if (meta.generatedAt) infoRows.push(["Generated", String(meta.generatedAt)]);
  for (const line of meta.filterLines || []) {
    const raw = String(line || "").trim();
    if (!raw) continue;
    const idx = raw.indexOf(":");
    if (idx > 0 && idx < 40) infoRows.push([raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()]);
    else infoRows.push(["Filter", raw]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(infoRows), "Report info");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(sheetRows.length ? sheetRows : [{ Note: "No rows in this view" }]),
    "Approval"
  );
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(`approval-register-${stamp}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}
