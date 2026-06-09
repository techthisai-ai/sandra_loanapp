import {
  buildInstallmentSchedule,
  getInstallmentPeriodLabel,
  isInstallmentPaid,
} from "./customerProfileSchedule.js";
import { computeLoanNearEndAlert, getCalendarCurrentTenureNumber } from "./loanNearEndAlert.js";

export { computeLoanNearEndAlert, getCalendarCurrentTenureNumber } from "./loanNearEndAlert.js";
import { normalizeCollectionFrequency } from "./loanTimelineDates.js";
import { buildCustomerDetailRow, formatCurrency } from "./employeeCollectionDetails.js";
import {
  getCommittedPaidAmount,
  getCommittedPaymentsForCustomer,
  isPaidFieldCommittedForInstallment,
  makePaidEntryKey,
  sanitizePaidAmount,
} from "./collectionReportPaidStorage.js";

/** Paid when approved collections or a committed manual entry covers the full installment due. */
export function isInstallmentPaidForReport(item) {
  return isInstallmentPaid(item);
}

/**
 * Current calendar tenure payment from the effective schedule (includes approved + manual commits).
 */
export function resolveCurrentTenurePayment(customer, customerEntries, calendarCurrent) {
  void customer;
  void customerEntries;
  if (!calendarCurrent) {
    return { isPaid: false, isPartial: false, paidAmount: 0 };
  }

  const paidAmount = Number(calendarCurrent.paidAmount || 0);
  const isPaid = isInstallmentPaidForReport(calendarCurrent);
  const isPartial = !isPaid && paidAmount > 0;

  return { isPaid, isPartial, paidAmount };
}

export function buildScheduleWithManualPayments(customer, customerEntries, paidState) {
  const baseSchedule = buildInstallmentSchedule(customer, customerEntries);
  const manualPayments = getCommittedPaymentsForCustomer(customer.customerId, paidState);
  const totalPayable = Number(customer.totalPayable || 0);
  let cumulativeCollected = 0;

  return baseSchedule.map((item) => {
    const manual = manualPayments.get(item.installmentNumber);
    let paidAmount = item.paidAmount;

    if (manual) {
      paidAmount = Math.min(
        item.dueAmount,
        Number(paidAmount || 0) + Number(manual.amount || 0)
      );
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
 * Pending tenures = earlier unpaid installment numbers.
 * Pending amount = sum of earlier unpaid tenures + current due outstanding (reduces when current is paid).
 */
export function computeReportTenureBreakdown(schedule, frequency, customer = null) {
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
  const priorPendingAmountRaw = pendingItems.reduce(
    (sum, item) => sum + installmentOutstandingAmount(item),
    0
  );
  const currentDueOutstanding =
    currentItem && !isInstallmentPaidForReport(currentItem)
      ? installmentOutstandingAmount(currentItem)
      : 0;
  const pendingAmountRaw = priorPendingAmountRaw + currentDueOutstanding;
  const pendingBreakdown = pendingItems.map((item) => ({
    installmentNumber: item.installmentNumber,
    tenureLabel: getInstallmentPeriodLabel(frequency, item.installmentNumber),
    amount: installmentOutstandingAmount(item),
    amountDisplay: formatCurrency(installmentOutstandingAmount(item)),
    status: installmentPendingStatus(item),
    isCurrentTenure: false,
  }));
  if (currentDueOutstanding > 0 && currentItem) {
    pendingBreakdown.push({
      installmentNumber: currentItem.installmentNumber,
      tenureLabel: getInstallmentPeriodLabel(frequency, currentItem.installmentNumber),
      amount: currentDueOutstanding,
      amountDisplay: formatCurrency(currentDueOutstanding),
      status: installmentPendingStatus(currentItem),
      isCurrentTenure: true,
    });
  }

  const balanceTenures = schedule
    .filter(
      (item) => item.installmentNumber > calendarCurrent && !isInstallmentPaidForReport(item)
    )
    .map((item) => item.installmentNumber);

  const unpaidInstallmentCount = schedule.filter((item) => !isInstallmentPaidForReport(item)).length;
  const nearEndAlert = computeLoanNearEndAlert(schedule, customer);

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

/**
 * Amount paid toward the current calendar tenure only (partial or full).
 * Uncommitted Entry draft is previewed as an increment on top of the stored tenure payment.
 */
export function resolveReportPaidColumnAmount(row, paidState = { drafts: {}, committed: {} }) {
  if (!row?.customerId) return 0;

  let amount = Number(row.currentTenurePaidAmount || 0);

  if (row.installmentNumber != null) {
    const entryKey = makePaidEntryKey(row.customerId, row.installmentNumber);
    const draft = sanitizePaidAmount(paidState.drafts?.[entryKey]);
    if (draft) {
      amount += Number(draft);
    }
  }

  return amount;
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
  const tenure = computeReportTenureBreakdown(effectiveSchedule, frequency, customer);
  const calendarCurrent = getCalendarCurrentInstallment(effectiveSchedule);
  const totalCollected = effectiveSchedule.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0);
  const remainingBalance = Math.max(Number(customer.totalPayable || 0) - totalCollected, 0);

  const tenurePayment = resolveCurrentTenurePayment(customer, customerEntries, calendarCurrent);
  const isCurrentTenurePaid = tenurePayment.isPaid;
  const isCurrentTenurePartial = tenurePayment.isPartial;
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
  const committedCurrentManual = Number(
    getCommittedPaidAmount(makePaidEntryKey(customer.customerId, currentInstallmentNumber), paidState) || 0
  );
  const isPaidForFilter =
    isFullyPaid ||
    isCurrentTenurePaid ||
    paidFieldCommitted ||
    currentTenurePaidAmount > 0 ||
    committedCurrentManual > 0;
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
    isCurrentTenurePartial,
    currentTenurePaidAmount,
    currentDueAmount: clearedTenure.currentDueAmount ?? base.currentDueAmount,
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
