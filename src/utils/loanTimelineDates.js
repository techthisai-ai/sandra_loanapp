/**
 * Loan timeline date helpers (issue, EMI start, EMI end) for UI and PDF.
 */

export const COLLECTION_FREQUENCIES = ["Daily", "Weekly", "Monthly"];

/** Canonical Daily / Weekly / Monthly from any stored or UI value. */
export function normalizeCollectionFrequency(frequency) {
  const value = String(frequency || "Weekly").trim().toLowerCase();
  if (value === "daily" || value.startsWith("dai")) return "Daily";
  if (value.startsWith("month")) return "Monthly";
  if (value === "weekly" || value.startsWith("wee")) return "Weekly";
  return "Weekly";
}

export function getCollectionIntervalDays(frequency) {
  const kind = normalizeCollectionFrequency(frequency);
  if (kind === "Daily") return 1;
  if (kind === "Monthly") return 30;
  return 7;
}

export function calculateLoanDueDate(disbursementDate, weeks, frequency) {
  const baseDate = disbursementDate ? new Date(disbursementDate) : new Date();
  if (Number.isNaN(baseDate.getTime())) return "";
  const tenure = Number(weeks || 0);
  const days = tenure * getCollectionIntervalDays(frequency);
  baseDate.setDate(baseDate.getDate() + Math.max(days, 0));
  return baseDate.toISOString().slice(0, 10);
}

export function resolveEmiStartDate(disbursementDate) {
  if (!disbursementDate) return "";
  const d = new Date(disbursementDate);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function resolveLoanIssueDate(submittedAt) {
  if (!submittedAt) return new Date().toISOString().slice(0, 10);
  const d = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve loan issue, EMI start, and EMI end from explicit fields or schedule inputs.
 * @returns {{ loanIssueDate: string, emiStartDate: string, emiEndDate: string }}
 */
export function resolveLoanTimelineDates({
  loanIssueDate = "",
  emiStartDate = "",
  emiEndDate = "",
  disbursementDate = "",
  dueDate = "",
  loanWeeks = 0,
  collectionFrequency = "Weekly",
  submittedAt = null,
} = {}) {
  const start = emiStartDate || resolveEmiStartDate(disbursementDate);
  const endFromSchedule =
    start && loanWeeks ? calculateLoanDueDate(start, loanWeeks, collectionFrequency) : "";
  const end = emiEndDate || dueDate || endFromSchedule || "";
  const issue = loanIssueDate
    ? loanIssueDate
    : submittedAt
      ? resolveLoanIssueDate(submittedAt)
      : resolveLoanIssueDate(new Date());

  return {
    loanIssueDate: issue,
    emiStartDate: start,
    emiEndDate: end,
  };
}
