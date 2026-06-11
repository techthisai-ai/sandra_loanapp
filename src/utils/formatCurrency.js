/** Shared Indian Rupee display — use across admin, employee, reports, and PDFs. */
export function formatCurrency(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "₹0";
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function formatCurrencyRounded(value) {
  const amount = Math.round(Number(value ?? 0));
  if (!Number.isFinite(amount)) return "₹0";
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** Indian grouping with plain ASCII digits (safe for jsPDF). */
export function formatInrAscii(value) {
  const amount = Math.round(Number(value ?? 0));
  if (!Number.isFinite(amount)) return "Rs. 0";

  const negative = amount < 0;
  const digits = String(Math.abs(amount));
  if (digits.length <= 3) return `${negative ? "-" : ""}Rs. ${digits}`;

  const lastThree = digits.slice(-3);
  let remaining = digits.slice(0, -3);
  const groups = [];
  while (remaining.length > 2) {
    groups.unshift(remaining.slice(-2));
    remaining = remaining.slice(0, -2);
  }
  if (remaining.length) groups.unshift(remaining);
  groups.push(lastThree);
  return `${negative ? "-" : ""}Rs. ${groups.join(",")}`;
}

/** ASCII-safe currency for PDF / print (jsPDF Helvetica cannot render ₹). */
export function formatCurrencyForPrint(value) {
  return formatInrAscii(value);
}

/** Normalize pre-formatted strings for PDF / print output. */
export function toPrintCurrencyText(text) {
  if (text == null || text === "") return text;
  return String(text)
    .replace(/₹\s*/g, "Rs. ")
    .replace(/\u00a0/g, " ")
    .replace(/\u202f/g, " ")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-");
}
