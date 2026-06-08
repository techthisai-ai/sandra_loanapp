/** Shared EMI schedule builder for customer profile & PDF (aligned with Reports.jsx). */

import { enrichCustomerForCollection } from "./collectionCustomerUtils.js";
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
  const explicit = Number(customer.emiAmount || customer.weeklyDue || 0);
  if (explicit > 0) return explicit;
  const count = Math.max(Number(customer.loanWeeks || 0), 1);
  return totalPayable > 0 ? Math.round(totalPayable / count) : 0;
}

/**
 * @param {object} customer
 * @param {object[]} customerEntries — entries for this customer only
 */
export function buildInstallmentSchedule(customer, customerEntries) {
  const resolvedCustomer = enrichCustomerForCollection(customer);
  const frequency = normalizeCollectionFrequency(resolvedCustomer.collectionFrequency);
  const installmentCount = getInstallmentCount(resolvedCustomer, customerEntries);
  const baseInstallment = getInstallmentAmount(
    resolvedCustomer,
    Number(resolvedCustomer.totalPayable || 0)
  );
  const totalPayable =
    Number(resolvedCustomer.totalPayable || 0) > 0
      ? Number(resolvedCustomer.totalPayable || 0)
      : baseInstallment > 0
        ? baseInstallment * installmentCount
        : 0;
  const intervalDays = getCollectionIntervalDays(frequency);
  const emiStartDate = resolveFirstEmiDate(resolvedCustomer);
  const approvedEntries = [...customerEntries]
    .filter((entry) => String(entry.approvalStatus || "").toLowerCase() === "approved")
    .sort((a, b) => String(a.collectionDate || a.submittedAt || "").localeCompare(String(b.collectionDate || b.submittedAt || "")));

  let remainingDue = totalPayable;
  const installmentSpecs = Array.from({ length: installmentCount }, (_, index) => {
    const dueAmount =
      index === installmentCount - 1 ? Math.max(remainingDue, 0) : Math.min(baseInstallment, remainingDue);
    remainingDue -= dueAmount;
    return {
      installmentNumber: index + 1,
      dueDate: addDays(emiStartDate, intervalDays * index),
      dueAmount,
    };
  });

  let entryIndex = 0;
  let entryRemaining = approvedEntries.length ? Number(approvedEntries[0].amount || 0) : 0;
  let cumulativeCollected = 0;

  return installmentSpecs.map((spec) => {
    const { installmentNumber, dueDate, dueAmount } = spec;
    let paidAmount = 0;
    let appliedEntry = null;

    while (paidAmount < dueAmount && entryIndex < approvedEntries.length) {
      const entry = approvedEntries[entryIndex];
      const take = Math.min(entryRemaining, dueAmount - paidAmount);
      paidAmount += take;
      entryRemaining -= take;
      appliedEntry = entry;
      if (entryRemaining <= 0) {
        entryIndex += 1;
        entryRemaining =
          entryIndex < approvedEntries.length ? Number(approvedEntries[entryIndex].amount || 0) : 0;
      }
    }

    cumulativeCollected += paidAmount;
    const pendingAmount = Math.max(dueAmount - paidAmount, 0);
    const paymentDate = appliedEntry?.collectionDate || appliedEntry?.submittedAt || "";
    const lateDays =
      appliedEntry && safeDate(paymentDate)
        ? Math.max(Math.ceil((startOfDay(safeDate(paymentDate)) - startOfDay(dueDate)) / 86400000), 0)
        : 0;
    const collectedBy =
      appliedEntry?.collectorName ||
      appliedEntry?.createdBy ||
      appliedEntry?.employeeId ||
      appliedEntry?.submittedBy ||
      "—";
    let status = "Pending";
    if (paidAmount >= dueAmount && paidAmount > 0) {
      status = lateDays > 0 ? "Late paid" : "Paid";
    } else if (paidAmount > 0) {
      status = "Partial";
    } else if (startOfDay(dueDate) < startOfDay(new Date())) {
      status = "Overdue";
    }

    return {
      installmentNumber,
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
        appliedEntry?.note ||
        appliedEntry?.remarks ||
        appliedEntry?.description ||
        (lateDays > 0 ? `Late ${lateDays}d` : ""),
    };
  });
}
