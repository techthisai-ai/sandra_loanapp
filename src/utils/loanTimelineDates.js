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

function tenureStartOfDay(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return new Date();
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function tenureSafeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Calendar months elapsed since EMI start (same day-of-month anchor). */
export function monthsElapsedSince(startDate, referenceDate = new Date()) {
  const start = tenureStartOfDay(tenureSafeDate(startDate) || new Date());
  const ref = tenureStartOfDay(referenceDate);
  if (ref < start) return 0;
  let months = (ref.getFullYear() - start.getFullYear()) * 12 + (ref.getMonth() - start.getMonth());
  if (ref.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

/** Due date for tenure period index (0 = first period) by collection frequency. */
export function addTenurePeriod(startDate, periodIndex, frequency) {
  const base = tenureSafeDate(startDate) || new Date();
  const index = Math.max(Number(periodIndex) || 0, 0);
  const kind = normalizeCollectionFrequency(frequency);
  const next = new Date(base);
  if (kind === "Daily") {
    next.setDate(next.getDate() + index);
    return tenureStartOfDay(next);
  }
  if (kind === "Weekly") {
    next.setDate(next.getDate() + index * 7);
    return tenureStartOfDay(next);
  }
  return tenureStartOfDay(new Date(base.getFullYear(), base.getMonth() + index, base.getDate()));
}

/** 0-based elapsed tenure periods since EMI start (day / week / calendar month). */
export function getElapsedTenurePeriods(emiStartDate, frequency, referenceDate = new Date()) {
  const start = tenureStartOfDay(tenureSafeDate(emiStartDate) || new Date());
  const today = tenureStartOfDay(referenceDate);
  if (today < start) return 0;
  const kind = normalizeCollectionFrequency(frequency);
  if (kind === "Daily") {
    return Math.floor((today.getTime() - start.getTime()) / 86400000);
  }
  if (kind === "Weekly") {
    return Math.floor((today.getTime() - start.getTime()) / (7 * 86400000));
  }
  return monthsElapsedSince(start, today);
}

export function inferCollectionFrequencyFromSchedule(schedule = []) {
  if (!Array.isArray(schedule) || schedule.length < 2) return "Weekly";
  const first = tenureSafeDate(schedule[0]?.dueDate);
  const second = tenureSafeDate(schedule[1]?.dueDate);
  if (!first || !second) return "Weekly";
  const diffDays = Math.round((tenureStartOfDay(second) - tenureStartOfDay(first)) / 86400000);
  if (diffDays <= 1) return "Daily";
  if (diffDays <= 7) return "Weekly";
  return "Monthly";
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
