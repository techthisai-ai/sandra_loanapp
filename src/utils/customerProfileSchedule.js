/** Shared EMI schedule builder for customer profile & PDF (aligned with Reports.jsx). */

import { getCollectionIntervalDays, normalizeCollectionFrequency } from "./loanTimelineDates.js";

export function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getLoanStartDate(customer) {
  return customer.disbursementDate || customer.loanApprovedAt || customer.submittedAt || "";
}

/** First EMI due date — same basis as loan sheet (disbursement / first EMI, not start + interval). */
export function resolveFirstEmiDate(customer) {
  return (
    safeDate(customer.firstEmiDate) ||
    safeDate(customer.emiStartDate) ||
    safeDate(customer.disbursementDate) ||
    safeDate(customer.dueDate) ||
    safeDate(getLoanStartDate(customer)) ||
    new Date()
  );
}

export function getInstallmentCount(customer, customerEntries = []) {
  return Math.max(Number(customer.loanWeeks || customerEntries.length || 1), 1);
}

export function formatInstallmentNumberList(frequency, numbers) {
  if (!numbers?.length) return "—";
  const kind = normalizeCollectionFrequency(frequency);
  const unit = getCollectionPeriodUnit(kind);
  return numbers.map((number) => `${unit} ${number}`).join(", ");
}

export function getCollectionPeriodUnit(frequency) {
  const kind = normalizeCollectionFrequency(frequency);
  if (kind === "Daily") return "Day";
  if (kind === "Weekly") return "wk";
  return "Month";
}

export function getInstallmentPeriodLabel(frequency, installmentNumber) {
  const unit = getCollectionPeriodUnit(frequency);
  return `${unit} ${installmentNumber}`;
}

export function isInstallmentPaid(item) {
  return item.paidAmount >= item.dueAmount && item.dueAmount > 0 && item.paidAmount > 0;
}

export function getInstallmentAmount(customer, totalPayable) {
  const explicit = Number(customer.emiAmount || 0);
  if (explicit > 0) return explicit;
  const count = Math.max(Number(customer.loanWeeks || 0), 1);
  return Math.round(totalPayable / count);
}

/**
 * @param {object} customer
 * @param {object[]} customerEntries — entries for this customer only
 */
export function buildInstallmentSchedule(customer, customerEntries) {
  const frequency = normalizeCollectionFrequency(customer.collectionFrequency);
  const totalPayable = Number(customer.totalPayable || 0);
  const installmentCount = getInstallmentCount(customer, customerEntries);
  const baseInstallment = getInstallmentAmount(customer, totalPayable);
  const intervalDays = getCollectionIntervalDays(frequency);
  const emiStartDate = resolveFirstEmiDate(customer);
  const approvedEntries = [...customerEntries]
    .filter((entry) => String(entry.approvalStatus || "").toLowerCase() === "approved")
    .sort((a, b) => String(a.collectionDate || a.submittedAt || "").localeCompare(String(b.collectionDate || b.submittedAt || "")));
  let remainingDue = totalPayable;
  let cumulativeCollected = 0;

  return Array.from({ length: installmentCount }, (_, index) => {
    const dueAmount =
      index === installmentCount - 1 ? Math.max(remainingDue, 0) : Math.min(baseInstallment, remainingDue);
    remainingDue -= dueAmount;
    const dueDate = addDays(emiStartDate, intervalDays * index);
    const approvedEntry = approvedEntries[index] || null;
    const paymentDate = approvedEntry?.collectionDate || approvedEntry?.submittedAt || "";
    const paidAmount = Number(approvedEntry?.amount || 0);
    cumulativeCollected += paidAmount;
    const pendingAmount = Math.max(dueAmount - paidAmount, 0);
    const lateDays =
      approvedEntry && safeDate(paymentDate)
        ? Math.max(Math.ceil((startOfDay(safeDate(paymentDate)) - startOfDay(dueDate)) / 86400000), 0)
        : 0;
    const collectedBy =
      approvedEntry?.collectorName || approvedEntry?.createdBy || approvedEntry?.employeeId || approvedEntry?.submittedBy || "—";
    let status = "Pending";
    if (paidAmount >= dueAmount && paidAmount > 0) {
      status = lateDays > 0 ? "Late paid" : "Paid";
    } else if (paidAmount > 0) {
      status = "Partial";
    } else if (startOfDay(dueDate) < startOfDay(new Date())) {
      status = "Overdue";
    }

    return {
      installmentNumber: index + 1,
      dueDate,
      dueAmount,
      paidAmount,
      pendingAmount,
      paymentDate,
      collectedBy,
      status,
      lateDays,
      remainingBalanceAfter: Math.max(totalPayable - cumulativeCollected, 0),
      remarks:
        approvedEntry?.note ||
        approvedEntry?.remarks ||
        approvedEntry?.description ||
        (lateDays > 0 ? `Late ${lateDays}d` : ""),
    };
  });
}
