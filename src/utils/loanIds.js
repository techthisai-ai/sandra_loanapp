export function generateLoanId(now = new Date()) {
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `LOAN-${dd}${mm}${yyyy}-${rand}`;
}

export function generateLoanRequestId(now = new Date()) {
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LRQ-${datePart}-${randomPart}`;
}
