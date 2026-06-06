import {
  buildEnterpriseTabularReportPdf,
  downloadEnterpriseTabularPdf,
  printEnterpriseTabularPdf,
  enterpriseStatusTextColor,
} from "./enterpriseTabularReportPdf";
import { fmtInrPdf } from "./pdfReportLayout";

const COL_RATIOS = [0.11, 0.09, 0.08, 0.07, 0.08, 0.08, 0.09, 0.07, 0.09, 0.08, 0.16];

const HEADERS = [
  "Customer",
  "Customer ID",
  "Center",
  "Type",
  "Due date",
  "Collected on",
  "Amount",
  "Method",
  "Collector",
  "Status",
  "Remarks",
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
  ];
}

export { enterpriseStatusTextColor };

export async function buildCollectionRegisterReportPdf(payload) {
  return buildEnterpriseTabularReportPdf({
    ...payload,
    headers: HEADERS,
    mapRowToCells,
    columnRatios: COL_RATIOS,
    statusColumnIndices: [9],
    currencyColumnIndices: [6],
    orientation: "landscape",
    title: payload.title || "Collection register",
  });
}

export async function downloadCollectionRegisterPdf(payload) {
  await downloadEnterpriseTabularPdf(
    {
      ...payload,
      headers: HEADERS,
      mapRowToCells,
      columnRatios: COL_RATIOS,
      statusColumnIndices: [9],
      currencyColumnIndices: [6],
      orientation: "landscape",
      title: payload.title || "Collection register",
    },
    "collection-register"
  );
}

export async function printCollectionRegisterPdf(payload) {
  await printEnterpriseTabularPdf({
    ...payload,
    headers: HEADERS,
    mapRowToCells,
    columnRatios: COL_RATIOS,
    statusColumnIndices: [9],
    currencyColumnIndices: [6],
    orientation: "landscape",
    title: payload.title || "Collection register",
  });
}
