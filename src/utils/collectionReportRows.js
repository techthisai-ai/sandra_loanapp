import {
  buildInstallmentSchedule,
  getInstallmentPeriodLabel,
  isInstallmentPaid,
  safeDate,
  startOfDay,
} from "./customerProfileSchedule.js";
import { normalizeCollectionFrequency } from "./loanTimelineDates.js";
import { buildCustomerDetailRow, formatCurrency } from "./employeeCollectionDetails.js";
import {
  getCommittedPaidAmount,
  getCommittedPaymentsForCustomer,
  isPaidFieldCommittedForInstallment,
  makePaidEntryKey,
} from "./collectionReportPaidStorage.js";

/** Paid when approved collections or a committed manual entry covers the full installment due. */
export function isInstallmentPaidForReport(item) {
  return isInstallmentPaid(item);
}

function getApprovedPaymentsForInstallment(customer, customerEntries, installmentItem) {
  if (!installmentItem) return [];

  const schedule = buildInstallmentSchedule(customer, customerEntries);
  const dueDay = startOfDay(installmentItem.dueDate);
  const prevItem = schedule.find((item) => item.installmentNumber === installmentItem.installmentNumber - 1);
  const windowStart = prevItem ? startOfDay(prevItem.dueDate) : dueDay;
  const nextItem = schedule.find((item) => item.installmentNumber === installmentItem.installmentNumber + 1);
  const windowEnd = nextItem ? startOfDay(nextItem.dueDate) : null;

  return customerEntries.filter((entry) => {
    if (String(entry.approvalStatus || "").toLowerCase() !== "approved") return false;
    if (Number(entry.amount || 0) <= 0) return false;
    const entryDay = safeDate(entry.collectionDate || entry.submittedAt);
    if (!entryDay) return false;
    const paidDay = startOfDay(entryDay);
    if (paidDay < windowStart) return false;
    if (windowEnd && paidDay >= windowEnd) return false;
    return true;
  });
}

/**
 * Whether the current calendar tenure is fully paid (approved collections or manual Paid field).
 * Payment date does not matter — yesterday, last week, and last month all count.
 */
export function resolveCurrentTenurePayment(customer, customerEntries, calendarCurrent) {
  if (!calendarCurrent) {
    return { isPaid: false, paidAmount: 0 };
  }

  const dueAmount = Number(calendarCurrent.dueAmount || 0);

  if (isInstallmentPaidForReport(calendarCurrent)) {
    return {
      isPaid: true,
      paidAmount: Number(calendarCurrent.paidAmount || 0),
    };
  }

  const approvedEntries = getApprovedPaymentsForInstallment(customer, customerEntries, calendarCurrent);
  const approvedAmount = approvedEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  if (dueAmount > 0 && approvedAmount >= dueAmount) {
    return { isPaid: true, paidAmount: approvedAmount };
  }

  const paidAmount = Math.max(Number(calendarCurrent.paidAmount || 0), approvedAmount);
  return { isPaid: false, paidAmount };
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
 * Loan / interest is about to end: only the final installment remains unpaid and there are no arrears.
 */
export function computeLoanNearEndAlert(schedule) {
  const total = schedule.length;
  if (!total) return false;

  const calendarCurrent = getCalendarCurrentTenureNumber(schedule);
  const unpaidItems = schedule.filter((item) => !isInstallmentPaidForReport(item));
  if (unpaidItems.length !== 1) return false;

  const onlyUnpaid = unpaidItems[0];
  if (onlyUnpaid.installmentNumber !== total) return false;

  const hasArrears = schedule.some(
    (item) => item.installmentNumber < calendarCurrent && !isInstallmentPaidForReport(item)
  );
  return !hasArrears;
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
  const nearEndAlert = computeLoanNearEndAlert(schedule);

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

function formatCurrentDueAmount(currentDue, { isPaid = false } = {}) {
  if (!currentDue) return "—";
  if (isPaid || isInstallmentPaidForReport(currentDue)) return formatCurrency(0);
  const outstanding = Math.max(Number(currentDue.pendingAmount ?? currentDue.dueAmount ?? 0), 0);
  return formatCurrency(outstanding);
}

export function resolveReportPaidColumnAmount(row, paidState = { drafts: {}, committed: {} }) {
  if (!row?.customerId || row.installmentNumber == null) return 0;
  const entryKey = makePaidEntryKey(row.customerId, row.installmentNumber);
  const committed = Number(getCommittedPaidAmount(entryKey, paidState) || 0);
  if (committed > 0) return committed;
  if (row.isCurrentTenurePaid && Number(row.currentTenurePaidAmount || 0) > 0) {
    return Number(row.currentTenurePaidAmount);
  }
  return 0;
}

export function formatReportPaidColumnDisplay(row, paidState) {
  const amount = resolveReportPaidColumnAmount(row, paidState);
  return amount > 0 ? formatCurrency(amount) : "";
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
 * - Paid: admin-approved (or manual Paid field) for the current calendar tenure
 * - Unpaid: current calendar tenure not yet fully paid
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

  const tenurePayment = resolveCurrentTenurePayment(customer, customerEntries, calendarCurrent);
  const isCurrentTenurePaid = tenurePayment.isPaid;
  const currentTenurePaidAmount = tenurePayment.paidAmount;

  const base = {
    ...detail,
    ...tenure,
    ...baseMeta,
    currentDueAmount: formatCurrentDueAmount(calendarCurrent, { isPaid: isCurrentTenurePaid }),
    paid: "",
    entry: "",
    loanAmountDisplay: formatCurrency(detail.loanAmount),
    balanceAmountDisplay: formatCurrency(remainingBalance),
    balanceAmount: formatCurrency(remainingBalance),
    balanceAmountRaw: remainingBalance,
    paidAmountTotal: totalCollected,
  };

  const isFullyPaid = remainingBalance <= 0;
  const currentInstallmentNumber = calendarCurrent?.installmentNumber ?? null;
  const currentDueAmount = Number(calendarCurrent?.dueAmount || 0);
  const paidFieldCommitted = isPaidFieldCommittedForInstallment(
    customer.customerId,
    currentInstallmentNumber,
    paidState,
    currentDueAmount
  );
  const isPaidForFilter = isFullyPaid || isCurrentTenurePaid || paidFieldCommitted;
  const clearedTenure = isFullyPaid
    ? {
        pendingTenures: [],
        pendingTenuresLabel: "—",
        pendingTenuresFullLabel: "—",
        pendingAmountRaw: 0,
        pendingAmountDisplay: "—",
        pendingBreakdown: [],
        unpaidInstallmentCount: 0,
        nearEndAlert: false,
        longTermNoPayment: false,
        currentDueAmount: "—",
      }
    : {};

  const rowBase = {
    ...base,
    ...clearedTenure,
    isFullyPaid,
    isCurrentTenurePaid,
    currentTenurePaidAmount,
    currentDueAmount:
      clearedTenure.currentDueAmount ??
      (isCurrentTenurePaid ? formatCurrency(0) : base.currentDueAmount),
    paidDisplay: formatReportPaidColumnDisplay(
      {
        customerId: customer.customerId,
        installmentNumber: currentInstallmentNumber,
        isCurrentTenurePaid,
        currentTenurePaidAmount,
      },
      paidState
    ),
  };

  if (paymentStatusFilter === "Paid") {
    if (!calendarCurrent || !isPaidForFilter) return [];
    return [summaryRow(rowBase, calendarCurrent, "paid")];
  }

  if (paymentStatusFilter === "Unpaid") {
    if (!calendarCurrent || isPaidForFilter) return [];
    return [summaryRow(rowBase, calendarCurrent, "unpaid")];
  }

  return [summaryRow(rowBase, calendarCurrent, "all")];
}
