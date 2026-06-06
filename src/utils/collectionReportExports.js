import * as XLSX from "xlsx";
import { reportDateStamp } from "./reportFilenames.js";

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
