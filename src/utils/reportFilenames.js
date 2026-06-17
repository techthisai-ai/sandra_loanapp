import { BRAND_REPORT_ID_PREFIX, BRAND_SUPPORT_EMAIL } from "../constants/brand.js";

/** YYYY-MM-DD for report export filenames */
export function reportDateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** e.g. SA-FINANCE-RPT-COL-2026-06-16-9YSA */
export function buildReportId(typeSegment = "RPT") {
  const token = Math.random().toString(36).slice(-4).toUpperCase();
  return `${BRAND_REPORT_ID_PREFIX}-${typeSegment}-${reportDateStamp()}-${token}`;
}

export { BRAND_SUPPORT_EMAIL };
