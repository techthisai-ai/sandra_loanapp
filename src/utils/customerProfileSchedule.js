/** Shared EMI schedule builder for customer profile & PDF (aligned with Reports.jsx). */

import { enrichCustomerForCollection } from "./collectionCustomerUtils.js";
import {
  addTenurePeriod,
  inferCollectionFrequencyFromSchedule,
  normalizeCollectionFrequency,
} from "./loanTimelineDates.js";

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

/** Human-readable total loan tenure, e.g. "10 wks", "12 Months", "30 Days". */
export function formatTotalTenureLabel(customer, installmentCount) {
  const count = Math.max(Number(installmentCount ?? customer?.loanWeeks ?? 0), 0);
  if (!count) return "—";
  const kind = normalizeCollectionFrequency(customer?.collectionFrequency);
  if (kind === "Daily") return `${count} ${count === 1 ? "Day" : "Days"}`;
  if (kind === "Weekly") return `${count} wks`;
  return `${count} ${count === 1 ? "Month" : "Months"}`;
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

function isAllocatableCollectionEntry(entry, { includePendingApprovals = false } = {}) {
  if (!entry || entry.isDeleted) return false;
  const status = String(entry.approvalStatus || "pending").toLowerCase();
  if (status === "rejected") return false;
  if (status === "approved") return true;
  return includePendingApprovals && status === "pending";
}

function sortPaymentsChronologically(payments) {
  return [...payments].sort((left, right) => {
    const leftKey = String(left.collectionDate || left.submittedAt || "");
    const rightKey = String(right.collectionDate || right.submittedAt || "");
    const byDate = leftKey.localeCompare(rightKey);
    if (byDate !== 0) return byDate;
    return String(left.entryId || left.id || "").localeCompare(String(right.entryId || right.id || ""));
  });
}

/** Due-date specs only — no payment allocation. */
export function buildInstallmentSpecs(resolvedCustomer, customerEntries = []) {
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
  const emiStartDate = resolveFirstEmiDate(resolvedCustomer);

  let remainingDue = totalPayable;
  return {
    totalPayable,
    specs: Array.from({ length: installmentCount }, (_, index) => {
      const dueAmount =
        index === installmentCount - 1 ? Math.max(remainingDue, 0) : Math.min(baseInstallment, remainingDue);
      remainingDue -= dueAmount;
      return {
        installmentNumber: index + 1,
        dueDate: addTenurePeriod(emiStartDate, index, frequency),
        dueAmount,
      };
    }),
  };
}

export function buildTenureCalendarContext(customer, schedule = []) {
  const resolvedCustomer = customer?.collectionFrequency ? customer : enrichCustomerForCollection(customer || {});
  return {
    frequency: normalizeCollectionFrequency(
      resolvedCustomer?.collectionFrequency || inferCollectionFrequencyFromSchedule(schedule)
    ),
    emiStartDate: resolveFirstEmiDate(resolvedCustomer) || schedule[0]?.dueDate || new Date(),
  };
}

/** Oldest-due-first payment allocation across installment specs. */
export function applyFifoPaymentsToSpecs(specs, payments, totalPayable = 0) {
  const sortedPayments = sortPaymentsChronologically(payments);
  let paymentIndex = 0;
  let paymentRemaining = sortedPayments.length ? Number(sortedPayments[0].amount || 0) : 0;
  let cumulativeCollected = 0;

  return specs.map((spec) => {
    const { installmentNumber, dueDate, dueAmount } = spec;
    let paidAmount = 0;
    let appliedEntry = null;

    while (paidAmount < dueAmount && paymentIndex < sortedPayments.length) {
      const payment = sortedPayments[paymentIndex];
      const take = Math.min(paymentRemaining, dueAmount - paidAmount);
      paidAmount += take;
      paymentRemaining -= take;
      appliedEntry = payment;
      if (paymentRemaining <= 0) {
        paymentIndex += 1;
        paymentRemaining =
          paymentIndex < sortedPayments.length ? Number(sortedPayments[paymentIndex].amount || 0) : 0;
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

export function collectSchedulePayments(customerEntries, options = {}) {
  return sortPaymentsChronologically(
    (customerEntries || []).filter((entry) => isAllocatableCollectionEntry(entry, options))
  );
}

/**
 * @param {object} customer
 * @param {object[]} customerEntries — entries for this customer only
 * @param {{ includePendingApprovals?: boolean, extraPayments?: object[] }} [options]
 */
export function buildInstallmentSchedule(customer, customerEntries, options = {}) {
  const resolvedCustomer = enrichCustomerForCollection(customer);
  const { totalPayable, specs } = buildInstallmentSpecs(resolvedCustomer, customerEntries);
  const payments = [
    ...collectSchedulePayments(customerEntries, options),
    ...(options.extraPayments || []),
  ];

  return applyFifoPaymentsToSpecs(specs, payments, totalPayable);
}
