import {
  buildInstallmentSchedule,
  getInstallmentPeriodLabel,
  isInstallmentPaid,
  startOfDay,
} from "./customerProfileSchedule.js";
import { normalizeCollectionFrequency } from "./loanTimelineDates.js";
import { buildCustomerDetailRow, formatCurrency } from "./employeeCollectionDetails.js";
import {
  getCommittedPaymentsForCustomer,
  isPaidFieldCommittedForInstallment,
} from "./collectionReportPaidStorage.js";

/** Paid when approved collections or a committed manual entry covers the full installment due. */
export function isInstallmentPaidForReport(item) {
  return isInstallmentPaid(item);
}

export function buildScheduleWithManualPayments(customer, customerEntries, paidState) {
  const baseSchedule = buildInstallmentSchedule(customer, customerEntries);
  const manualPayments = getCommittedPaymentsForCustomer(customer.customerId, paidState);
  const totalPayable = Number(customer.totalPayable || 0);
  let cumulativeCollected = 0;

  return baseSchedule.map((item) => {
    const manual = manualPayments.get(item.installmentNumber);
    let paidAmount = item.paidAmount;

    if (manual && !isInstallmentPaid(item)) {
      paidAmount = Number(manual.amount);
    }

    cumulativeCollected += paidAmount;
    const pendingAmount = Math.max(item.dueAmount - paidAmount, 0);
    let status = item.status;
    if (paidAmount >= item.dueAmount && paidAmount > 0) {
      status = "Paid";
    } else if (paidAmount > 0) {
      status = "Partial";
    }

    return {
      ...item,
      paidAmount,
      pendingAmount,
      paymentDate: manual?.paidAt || item.paymentDate,
      status,
      remainingBalanceAfter: Math.max(totalPayable - cumulativeCollected, 0),
      isManualCommit: Boolean(manual && !isInstallmentPaid({ ...item, paidAmount: item.paidAmount })),
    };
  });
}

/** Latest installment whose due date has arrived on the loan schedule (calendar-based). */
export function getCalendarCurrentTenureNumber(schedule) {
  const total = schedule.length;
  if (!total) return 0;
  const today = startOfDay(new Date());
  let elapsed = 0;
  schedule.forEach((item) => {
    if (startOfDay(item.dueDate) <= today) elapsed += 1;
  });
  return Math.min(Math.max(elapsed, 1), total);
}

export function getCalendarCurrentInstallment(schedule) {
  const currentNumber = getCalendarCurrentTenureNumber(schedule);
  if (!currentNumber) return null;
  return schedule.find((item) => item.installmentNumber === currentNumber) || null;
}

function installmentOutstandingAmount(item) {
  return Math.max(Number(item?.pendingAmount ?? item?.dueAmount ?? 0), 0);
}

function installmentPendingStatus(item) {
  if (isInstallmentPaidForReport(item)) return "Paid";
  if (Number(item?.paidAmount || 0) > 0) return "Partial";
  return "Pending";
}

function formatInstallmentNumbers(numbers) {
  return numbers.length ? numbers.join(", ") : "—";
}

/** Short pending/balance tenure list for table cells, e.g. "1, 2, 3, 4...". */
export function formatCompactInstallmentNumbers(numbers, maxVisible = 4) {
  if (!numbers?.length) return "—";
  if (numbers.length <= maxVisible) return numbers.join(", ");
  return `${numbers.slice(0, maxVisible).join(", ")},...`;
}

/**
 * Collection report tenure breakdown (Daily / Weekly / Monthly).
 * Current tenure = latest calendar due period, regardless of earlier paid/unpaid status.
 * Pending = earlier unpaid installment numbers only; pending amount excludes current due.
 */
export function computeReportTenureBreakdown(schedule, frequency) {
  const total = schedule.length;
  const calendarCurrent = getCalendarCurrentTenureNumber(schedule);
  const currentItem =
    calendarCurrent > 0
      ? schedule.find((item) => item.installmentNumber === calendarCurrent) || null
      : null;

  const pendingItems = schedule.filter(
    (item) => item.installmentNumber < calendarCurrent && !isInstallmentPaidForReport(item)
  );
  const pendingTenures = pendingItems.map((item) => item.installmentNumber);
  const pendingAmountRaw = pendingItems.reduce((sum, item) => sum + installmentOutstandingAmount(item), 0);
  const pendingBreakdown = pendingItems.map((item) => ({
    installmentNumber: item.installmentNumber,
    tenureLabel: getInstallmentPeriodLabel(frequency, item.installmentNumber),
    amount: installmentOutstandingAmount(item),
    amountDisplay: formatCurrency(installmentOutstandingAmount(item)),
    status: installmentPendingStatus(item),
  }));

  const balanceTenures = schedule
    .filter(
      (item) => item.installmentNumber > calendarCurrent && !isInstallmentPaidForReport(item)
    )
    .map((item) => item.installmentNumber);

  const unpaidInstallmentCount = schedule.filter((item) => !isInstallmentPaidForReport(item)).length;
  const nearEndAlert = unpaidInstallmentCount === 1 && pendingTenures.length === 0;

  return {
    currentTenure: calendarCurrent ? getInstallmentPeriodLabel(frequency, calendarCurrent) : "--",
    currentTenureNumber: calendarCurrent,
    pendingTenures,
    pendingTenuresLabel: formatCompactInstallmentNumbers(pendingTenures),
    pendingTenuresFullLabel: formatInstallmentNumbers(pendingTenures),
    pendingAmountRaw,
    pendingAmountDisplay: pendingAmountRaw > 0 ? formatCurrency(pendingAmountRaw) : "—",
    pendingBreakdown,
    balanceTenures,
    balanceTenuresLabel: formatInstallmentNumbers(balanceTenures),
    unpaidInstallmentCount,
    nearEndAlert,
    currentTenureCalendarAmount: currentItem
      ? formatCurrency(installmentOutstandingAmount(currentItem))
      : "--",
  };
}

function formatCurrentDueAmount(currentDue) {
  if (!currentDue) return "—";
  return formatCurrency(currentDue.pendingAmount || currentDue.dueAmount);
}

function summaryRow(base, calendarCurrent, rowKind) {
  return {
    ...base,
    rowKey: `${base.customerId}-${rowKind}-${calendarCurrent?.installmentNumber || "none"}`,
    rowKind,
    installmentNumber: calendarCurrent?.installmentNumber || null,
    showPaidInput: Boolean(calendarCurrent),
  };
}

/**
 * Build 0..N collection report rows for one customer based on payment filter.
 * - All: one summary row per customer (input for current calendar tenure)
 * - Paid: customers with an amount entered in the Paid field for current tenure
 * - Unpaid: customers with an empty Paid field for current tenure
 */
export function buildCollectionReportRowsForCustomer(
  customer,
  customerEntries,
  baseMeta,
  paymentStatusFilter,
  options = {}
) {
  const { paidState = { drafts: {}, committed: {} } } = options;
  const frequency = normalizeCollectionFrequency(customer.collectionFrequency);
  const effectiveSchedule = buildScheduleWithManualPayments(customer, customerEntries, paidState);
  const detail = buildCustomerDetailRow(customer, customerEntries);
  const tenure = computeReportTenureBreakdown(effectiveSchedule, frequency);
  const calendarCurrent = getCalendarCurrentInstallment(effectiveSchedule);
  const totalCollected = effectiveSchedule.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0);
  const remainingBalance = Math.max(Number(customer.totalPayable || 0) - totalCollected, 0);

  const base = {
    ...detail,
    ...tenure,
    ...baseMeta,
    currentDueAmount: formatCurrentDueAmount(calendarCurrent),
    paid: "",
    loanAmountDisplay: formatCurrency(detail.loanAmount),
    balanceAmountDisplay: formatCurrency(remainingBalance),
    balanceAmount: formatCurrency(remainingBalance),
    balanceAmountRaw: remainingBalance,
    paidAmountTotal: totalCollected,
  };

  const currentInstallmentNumber = calendarCurrent?.installmentNumber ?? null;
  const paidFieldCommitted = isPaidFieldCommittedForInstallment(
    customer.customerId,
    currentInstallmentNumber,
    paidState
  );

  if (paymentStatusFilter === "Paid") {
    if (!calendarCurrent || !paidFieldCommitted) return [];
    return [summaryRow(base, calendarCurrent, "paid")];
  }

  if (paymentStatusFilter === "Unpaid") {
    if (!calendarCurrent || paidFieldCommitted) return [];
    return [summaryRow(base, calendarCurrent, "unpaid")];
  }

  return [summaryRow(base, calendarCurrent, "all")];
}
