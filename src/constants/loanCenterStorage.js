/** Fired after `loanCenters` localStorage is updated so UI can reload hierarchy (Reports, employee day, etc.). */
export const LOAN_CENTERS_CHANGED_EVENT = "loan-centers-changed";

export function notifyLoanCentersChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LOAN_CENTERS_CHANGED_EVENT));
  }
}
