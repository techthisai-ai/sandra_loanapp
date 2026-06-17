export const LOAN_ID_PREFIX = "SA";
const LOAN_ID_LEGACY_PREFIX = "RFS";

const LOAN_ID_PATTERN = new RegExp(`^(?:${LOAN_ID_PREFIX}|${LOAN_ID_LEGACY_PREFIX})(\\d+)$`, "i");

export function formatSequentialLoanId(sequenceNumber) {
  const next = Number(sequenceNumber);
  if (!Number.isFinite(next) || next < 1) {
    return `${LOAN_ID_PREFIX}0001`;
  }
  return `${LOAN_ID_PREFIX}${String(next).padStart(4, "0")}`;
}

export function parseSequentialLoanNumber(value) {
  const text = String(value || "").trim().toUpperCase();
  const match = text.match(LOAN_ID_PATTERN);
  return match ? Number(match[1]) : 0;
}

/** Show SA0001 even when the stored record still uses legacy RFS0001. */
export function formatLoanIdDisplay(value) {
  const sequence = parseSequentialLoanNumber(value);
  if (sequence > 0) return formatSequentialLoanId(sequence);
  const text = String(value || "").trim();
  return text || "—";
}

export function maxSequentialLoanNumber(loanIds = []) {
  return loanIds.reduce((max, loanId) => Math.max(max, parseSequentialLoanNumber(loanId)), 0);
}

/** @deprecated Use getNextLoanId() from userAuth for new loans. */
export function generateLoanId() {
  return formatSequentialLoanId(1);
}

export function generateLoanRequestId(now = new Date()) {
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LRQ-${datePart}-${randomPart}`;
}
