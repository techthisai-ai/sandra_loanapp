import { enrichCustomerForCollection } from "./collectionCustomerUtils.js";
import {
  buildInstallmentSchedule,
  buildInstallmentSpecs,
  buildTenureCalendarContext,
  applyFifoPaymentsToSpecs,
  collectSchedulePayments,
  getInstallmentPeriodLabel,
  isInstallmentPaid,
  startOfDay,
} from "./customerProfileSchedule.js";
import { computeLoanNearEndAlert, getCalendarCurrentTenureNumber } from "./loanNearEndAlert.js";

export { computeLoanNearEndAlert, getCalendarCurrentTenureNumber } from "./loanNearEndAlert.js";
import { normalizeCollectionFrequency } from "./loanTimelineDates.js";
import { buildCustomerDetailRow, formatCurrency } from "./employeeCollectionDetails.js";
import {
  getCommittedPaidAmount,
  getCommittedPaymentsForCustomer,
  makePaidEntryKey,
  parsePaidEntryKey,
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

function getInstallmentManualAmounts(customerId, installmentNumber, paidState) {
  if (!customerId || installmentNumber == null) {
    return { committed: 0, draft: 0, entryKey: "" };
  }
  const entryKey = makePaidEntryKey(customerId, installmentNumber);
  return {
    entryKey,
    committed: Number(getCommittedPaidAmount(entryKey, paidState) || 0),
    draft: Number(sanitizePaidAmount(paidState.drafts?.[entryKey]) || 0),
  };
}

/**
 * Unreconciled manual Amount-cell entry for FIFO preview.
 * Avoids counting committed + draft twice for the same payment while typing.
 */
export function computeUnreconciledManualAmount(customerId, installmentNumber, customerEntries, paidState) {
  const { committed, draft } = getInstallmentManualAmounts(customerId, installmentNumber, paidState);
  const approvedTotal = collectSchedulePayments(customerEntries).reduce(
    (sum, entry) => sum + Number(entry.amount || 0),
    0
  );
  const unreconciledCommitted = Math.max(0, committed - approvedTotal);

  if (draft > 0) {
    return draft + Math.max(0, unreconciledCommitted - draft);
  }

  return unreconciledCommitted;
}

function buildManualExtraPayments(customerId, installmentNumber, customerEntries, paidState) {
  const amount = computeUnreconciledManualAmount(customerId, installmentNumber, customerEntries, paidState);
  if (amount <= 0) return [];

  const { entryKey } = getInstallmentManualAmounts(customerId, installmentNumber, paidState);
  const committedRecord = paidState?.committed?.[entryKey];
  const paidAt = String(committedRecord?.paidAt || new Date().toISOString());

  return [
    {
      amount,
      collectionDate: paidAt.slice(0, 10) || new Date().toISOString().slice(0, 10),
      submittedAt: paidAt,
      source: "manual-entry",
    },
  ];
}

export function buildScheduleWithManualPayments(customer, customerEntries, paidState, installmentNumber = null) {
  const resolvedCustomer = enrichCustomerForCollection(customer);
  const { totalPayable, specs } = buildInstallmentSpecs(resolvedCustomer, customerEntries);
  const approvedPayments = collectSchedulePayments(customerEntries);
  const baseSchedule = buildInstallmentSchedule(customer, customerEntries);
  const tenureContext = buildTenureCalendarContext(resolvedCustomer, baseSchedule);
  const activeInstallmentNumber =
    installmentNumber ?? getCalendarCurrentTenureNumber(baseSchedule, tenureContext) ?? null;
  const extraPayments = buildManualExtraPayments(
    customer.customerId,
    activeInstallmentNumber,
    customerEntries,
    paidState
  );

  const schedule = applyFifoPaymentsToSpecs(
    specs,
    [...approvedPayments, ...extraPayments],
    totalPayable
  );

  const manualByInstallment = getCommittedPaymentsForCustomer(customer.customerId, paidState);
  return schedule.map((item) => {
    const baseItem = baseSchedule.find((row) => row.installmentNumber === item.installmentNumber) || item;
    const manual = manualByInstallment.get(item.installmentNumber);
    return {
      ...item,
      isManualCommit: Boolean(
        manual && Number(item.paidAmount || 0) > Number(baseItem.paidAmount || 0)
      ),
    };
  });
}

export function getCalendarCurrentInstallment(schedule, context = {}) {
  const currentNumber = getCalendarCurrentTenureNumber(schedule, context);
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
  const tenureContext = buildTenureCalendarContext(
    customer ? { ...customer, collectionFrequency: frequency || customer.collectionFrequency } : { collectionFrequency: frequency },
    schedule
  );
  const calendarCurrent = getCalendarCurrentTenureNumber(schedule, tenureContext);
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
  const today = startOfDay(new Date());
  const currentDueOutstanding =
    currentItem &&
    !isInstallmentPaidForReport(currentItem) &&
    startOfDay(currentItem.dueDate) <= today
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

/** Paid column: manual entry in the Amount cell, else FIFO-allocated current tenure paid. */
export function resolveReportPaidDisplayAmount(
  customer,
  customerEntries,
  paidState,
  { currentInstallmentNumber, currentTenurePaidAmount, effectiveSchedule }
) {
  const manualEntryAmount = computeUnreconciledManualAmount(
    customer.customerId,
    currentInstallmentNumber,
    customerEntries,
    paidState
  );
  if (manualEntryAmount > 0) {
    return manualEntryAmount;
  }

  const { committed, draft } = getInstallmentManualAmounts(
    customer.customerId,
    currentInstallmentNumber,
    paidState
  );
  const storedManualAmount = committed + draft;
  if (storedManualAmount > 0) {
    return storedManualAmount;
  }

  const baseSchedule = buildInstallmentSchedule(customer, customerEntries);
  const baseTotalPaid = baseSchedule.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0);
  const effectiveTotalPaid = (effectiveSchedule || []).reduce(
    (sum, item) => sum + Number(item.paidAmount || 0),
    0
  );
  const manualPreviewTotal = Math.max(0, effectiveTotalPaid - baseTotalPaid);
  if (manualPreviewTotal > 0) {
    return manualPreviewTotal;
  }

  return Number(currentTenurePaidAmount || 0);
}

/**
 * Amount shown in the Paid column for a collection report row.
 */
export function resolveReportPaidColumnAmount(row, paidState = { drafts: {}, committed: {} }) {
  if (!row?.customerId) return 0;
  if (Number(row.reportPaidDisplayAmount || 0) > 0) {
    return Number(row.reportPaidDisplayAmount);
  }
  return Number(row.currentTenurePaidAmount || 0);
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
  const baseSchedule = buildInstallmentSchedule(customer, customerEntries);
  const calendarInstallmentNumber =
    getCalendarCurrentTenureNumber(baseSchedule, buildTenureCalendarContext(customer, baseSchedule)) || null;
  const effectiveSchedule = buildScheduleWithManualPayments(
    customer,
    customerEntries,
    paidState,
    calendarInstallmentNumber
  );
  const detail = buildCustomerDetailRow(customer, customerEntries);
  const tenureContext = buildTenureCalendarContext(customer, effectiveSchedule);
  const tenure = computeReportTenureBreakdown(effectiveSchedule, frequency, customer);
  const calendarCurrent = getCalendarCurrentInstallment(effectiveSchedule, tenureContext);
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
  const reportPaidDisplayAmount = resolveReportPaidDisplayAmount(customer, customerEntries, paidState, {
    currentInstallmentNumber,
    currentTenurePaidAmount,
    effectiveSchedule,
  });
  const hasManualEntryPreview = reportPaidDisplayAmount > Number(currentTenurePaidAmount || 0);
  const isPaidForFilter = isFullyPaid || isCurrentTenurePaid;
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
    isCurrentTenurePartial: isCurrentTenurePartial || hasManualEntryPreview,
    currentTenurePaidAmount,
    reportPaidDisplayAmount,
    currentDueAmount: clearedTenure.currentDueAmount ?? base.currentDueAmount,
    paidDisplay: formatReportPaidColumnDisplay(
      {
        customerId: customer.customerId,
        installmentNumber: currentInstallmentNumber,
        isCurrentTenurePaid,
        currentTenurePaidAmount,
        reportPaidDisplayAmount,
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
