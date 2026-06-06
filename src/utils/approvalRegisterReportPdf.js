import {
  buildEnterpriseTabularReportPdf,
  downloadEnterpriseTabularPdf,
  printEnterpriseTabularPdf,
} from "./enterpriseTabularReportPdf";
import { fmtInrPdf } from "./pdfReportLayout";

const COL_RATIOS = [0.1, 0.07, 0.07, 0.06, 0.06, 0.06, 0.07, 0.06, 0.08, 0.07, 0.06, 0.07, 0.07, 0.1];

const HEADERS = [
  "Customer",
  "Customer ID",
  "Center",
  "Type",
  "Due date",
  "Collection date",
  "Amount",
  "Method",
  "Collector",
  "Collection status",
  "Remarks",
  "Approval",
  "Approved at",
  "Rejected at",
];

function mapRowToCells(row) {
  return [
    row.customerName || "—",
    row.customerId || "—",
    row.center || "—",
    row.collectionFrequency || "—",
    row.dueDate || "—",
    row.collectionDate || "—",
    fmtInrPdf(Number(row.amount || 0)),
    row.paymentMethod || "—",
    row.collectorName || "—",
    row.collectionStatus || "—",
    row.remarks || "—",
    row.approvalStatus || "—",
    row.approvedAt || "—",
    row.rejectedAt || "—",
  ];
}

const PDF_BASE = {
  headers: HEADERS,
  mapRowToCells,
  columnRatios: COL_RATIOS,
  statusColumnIndices: [9, 11],
  currencyColumnIndices: [6],
  orientation: "landscape",
  tableFontSize: 7,
};

export async function buildApprovalRegisterReportPdf(payload) {
  return buildEnterpriseTabularReportPdf({
    ...PDF_BASE,
    ...payload,
    title: payload.title || "Approval register",
  });
}

export async function downloadApprovalRegisterPdf(payload) {
  await downloadEnterpriseTabularPdf(
    { ...PDF_BASE, ...payload, title: payload.title || "Approval register" },
    "approval-register"
  );
}

export async function printApprovalRegisterPdf(payload) {
  await printEnterpriseTabularPdf({
    ...PDF_BASE,
    ...payload,
    title: payload.title || "Approval register",
  });
}
