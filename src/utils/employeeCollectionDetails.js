import {
  buildInstallmentSchedule,
  buildTenureCalendarContext,
  formatInstallmentNumberList,
  formatTotalTenureLabel,
  getInstallmentPeriodLabel,
  isInstallmentPaid,
  safeDate,
  startOfDay,
} from "./customerProfileSchedule.js";
import { computeLoanNearEndAlert, getCalendarCurrentTenureNumber } from "./loanNearEndAlert.js";
import { normalizeCollectionFrequency } from "./loanTimelineDates.js";

export function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

export function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB");
}

export function formatMonthList(numbers) {
  if (!numbers?.length) return "None";
  return numbers.join(", ");
}

export function getSealNumber(customer) {
  return customer?.sealNumber || customer?.sealNo || customer?.boxNumber || customer?.applicationId || "--";
}

export function getCollectorName(entry) {
  return String(entry.collectorName || entry.createdBy || "Unassigned").trim() || "Unassigned";
}

export function normalizeCollectorKey(name) {
  return String(name || "").trim().toLowerCase();
}

export function getEmployeeCollectorAliases(employee) {
  const aliases = [];
  const displayName = String(employee?.displayName || "").trim();
  const email = String(employee?.email || "").trim();
  const employeeId = String(employee?.employeeId || "").trim();

  if (displayName) aliases.push(displayName);
  if (email) {
    aliases.push(email);
    const localPart = email.split("@")[0]?.trim();
    if (localPart) aliases.push(localPart);
  }
  if (employeeId && employeeId !== "--") aliases.push(employeeId);

  return [...new Set(aliases.filter(Boolean))];
}

export function getCollectorNormKeys(employeeOrRow) {
  if (employeeOrRow?.collectorNorms?.length) {
    return employeeOrRow.collectorNorms;
  }
  const aliases = employeeOrRow?.collectorName
    ? [employeeOrRow.collectorName]
    : getEmployeeCollectorAliases(employeeOrRow);
  return [...new Set(aliases.map(normalizeCollectorKey).filter(Boolean))];
}

export function collectorsMatch(left, right) {
  return normalizeCollectorKey(left) === normalizeCollectorKey(right);
}

export function entryMatchesCollector(entry, collectorRef) {
  const entryNorm = normalizeCollectorKey(getCollectorName(entry));
  return getCollectorNormKeys(collectorRef).includes(entryNorm);
}

export function findEmployeeForCollectorName(collectorName, employees = []) {
  const norm = normalizeCollectorKey(collectorName);
  return (
    employees.find((employee) =>
      getEmployeeCollectorAliases(employee).some((alias) => normalizeCollectorKey(alias) === norm)
    ) || null
  );
}

const LONG_TERM_NO_PAYMENT_DAYS = 365;

function daysBetweenDates(earlier, later = new Date()) {
  const start = safeDate(earlier);
  const end = startOfDay(later);
  if (!start) return 0;
  return Math.max(0, Math.floor((end.getTime() - startOfDay(start).getTime()) / 86400000));
}

function getDaysSinceLastPayment(customer, customerEntries) {
  const approved = customerEntries.filter(
    (entry) => String(entry.approvalStatus || "").toLowerCase() === "approved" && Number(entry.amount || 0) > 0
  );
  if (approved.length) {
    const lastDate = approved
      .map((entry) => safeDate(entry.collectionDate || entry.submittedAt))
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (lastDate) return daysBetweenDates(lastDate);
  }
  const loanStart = safeDate(customer.disbursementDate || customer.loanApprovedAt || customer.submittedAt);
  return loanStart ? daysBetweenDates(loanStart) : 0;
}

function getDaysSinceFirstOverdue(schedule) {
  const today = startOfDay(new Date());
  const firstOverdue = schedule.find((item) => {
    const isPaid = item.paidAmount >= item.dueAmount && item.dueAmount > 0 && item.paidAmount > 0;
    return !isPaid && startOfDay(item.dueDate) < today;
  });
  return firstOverdue ? daysBetweenDates(firstOverdue.dueDate) : 0;
}

/** Paid installments, pending overdue installments only, balance amount — no future list. */
export function computeCustomerCollectionDetails(customer, customerEntries) {
  const frequency = normalizeCollectionFrequency(customer.collectionFrequency);
  const schedule = buildInstallmentSchedule(customer, customerEntries);
  const today = startOfDay(new Date());
  const paidMonths = [];
  const pendingMonths = [];
  let currentDue = "--";

  schedule.forEach((item) => {
    const installment = item.installmentNumber;
    const isPaid = item.paidAmount >= item.dueAmount && item.dueAmount > 0 && item.paidAmount > 0;
    const dueDay = startOfDay(item.dueDate);

    if (isPaid) {
      paidMonths.push(installment);
    } else if (dueDay < today) {
      pendingMonths.push(installment);
      if (currentDue === "--") {
        currentDue = `${getInstallmentPeriodLabel(frequency, installment)} · ${formatCurrency(item.pendingAmount || item.dueAmount)}`;
      }
    }
  });

  if (currentDue === "--") {
    const nextUnpaid = schedule.find((item) => !isInstallmentPaid(item));
    if (nextUnpaid) {
      currentDue = `${getInstallmentPeriodLabel(frequency, nextUnpaid.installmentNumber)} · ${formatCurrency(nextUnpaid.pendingAmount || nextUnpaid.dueAmount)}`;
    }
  }

  const paidAmountTotal = customerEntries
    .filter((entry) => String(entry.approvalStatus || "").toLowerCase() === "approved")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const totalPayable = Number(customer.totalPayable || 0);
  const balanceAmount = Math.max(totalPayable - paidAmountTotal, 0);
  const nearEndAlert = computeLoanNearEndAlert(schedule, customer);
  const daysSinceLastPayment = getDaysSinceLastPayment(customer, customerEntries);
  const daysSinceFirstOverdue = getDaysSinceFirstOverdue(schedule);
  const longTermNoPayment =
    balanceAmount > 0 &&
    ((pendingMonths.length > 0 && daysSinceFirstOverdue >= LONG_TERM_NO_PAYMENT_DAYS) ||
      daysSinceLastPayment >= LONG_TERM_NO_PAYMENT_DAYS);

  return {
    paidInterest: formatMonthList(paidMonths),
    pendingInterest: formatMonthList(pendingMonths),
    balanceAmount: formatCurrency(balanceAmount),
    balanceAmountRaw: balanceAmount,
    paidAmountTotal,
    paidInstallmentCount: paidMonths.length,
    currentDue,
    nearEndAlert,
    longTermNoPayment,
    loanDate: formatDate(customer.disbursementDate || customer.loanApprovedAt || customer.submittedAt),
    loanAmount: Number(customer.loanAmount || 0),
  };
}

/**
 * Tenure breakdown for collection reporting:
 * - currentTenure: the active month based on elapsed due dates (e.g. "Month 4")
 * - pendingTenures: earlier unpaid month numbers before the current tenure (e.g. [2, 3])
 * - balanceTenures: upcoming unpaid month numbers after the current tenure
 */
export function computeTenureBreakdown(customer, customerEntries) {
  const frequency = normalizeCollectionFrequency(customer.collectionFrequency);
  const schedule = buildInstallmentSchedule(customer, customerEntries);
  const total = schedule.length;
  const currentNumber = total
    ? getCalendarCurrentTenureNumber(schedule, buildTenureCalendarContext(customer, schedule))
    : 0;

  const pendingTenures = schedule
    .filter((item) => item.installmentNumber < currentNumber && !isInstallmentPaid(item))
    .map((item) => item.installmentNumber);

  const balanceTenures = schedule
    .filter((item) => item.installmentNumber > currentNumber && !isInstallmentPaid(item))
    .map((item) => item.installmentNumber);

  const currentItem = schedule.find((item) => item.installmentNumber === currentNumber) || null;
  const unpaidInstallmentCount = schedule.filter((item) => !isInstallmentPaid(item)).length;

  return {
    currentTenure: total ? getInstallmentPeriodLabel(frequency, currentNumber) : "--",
    currentTenureNumber: currentNumber,
    currentTenureAmount: currentItem ? currentItem.dueAmount : 0,
    pendingTenures,
    balanceTenures,
    unpaidInstallmentCount,
  };
}

const EMPLOYEE_COLLECTION_STATUS_VALUES = ["Collected", "Partial Payment", "Skipped", "Rescheduled", "Pending"];

export function normalizeEmployeeCollectionStatus(value) {
  const status = String(value || "").trim();
  if (status === "Partially paid") return "Partial Payment";
  if (EMPLOYEE_COLLECTION_STATUS_VALUES.includes(status)) return status;
  return "Pending";
}

function formatRupeeAmount(amount) {
  const value = Number(amount || 0);
  return value > 0 ? `₹${value.toLocaleString("en-IN")}` : "—";
}

function isEntryPendingApproval(entry) {
  const status = String(entry?.approvalStatus || "pending").toLowerCase();
  return status !== "approved" && status !== "rejected";
}

function getCurrentTenureScheduleItem(customer, customerEntries, { includePendingApprovals = false } = {}) {
  const tenure = computeTenureBreakdown(customer, customerEntries);
  const schedule = buildInstallmentSchedule(customer, customerEntries, { includePendingApprovals });
  return schedule.find((item) => item.installmentNumber === tenure.currentTenureNumber) || null;
}

function pendingPaymentAllocatesToCurrentTenure(customer, customerEntries) {
  const approvedItem = getCurrentTenureScheduleItem(customer, customerEntries);
  const previewItem = getCurrentTenureScheduleItem(customer, customerEntries, { includePendingApprovals: true });
  return Number(previewItem?.paidAmount || 0) > Number(approvedItem?.paidAmount || 0);
}

export function getCurrentTenurePendingApprovalEntry(customer, customerEntries) {
  const pendingEntries = [...customerEntries]
    .filter((entry) => isEntryPendingApproval(entry))
    .sort((left, right) =>
      String(right.submittedAt || right.collectionDate || "").localeCompare(
        String(left.submittedAt || left.collectionDate || "")
      )
    );

  return pendingEntries[0] || null;
}

export function hasCurrentTenurePendingApproval(customer, customerEntries) {
  return Boolean(getCurrentTenurePendingApprovalEntry(customer, customerEntries));
}

export function getCurrentTenureCollectedAmount(customer, customerEntries) {
  const tenure = computeTenureBreakdown(customer, customerEntries);
  const schedule = buildInstallmentSchedule(customer, customerEntries);
  const currentItem = schedule.find((item) => item.installmentNumber === tenure.currentTenureNumber);
  return currentItem ? Number(currentItem.paidAmount || 0) : 0;
}

export function getCurrentTenureCollectedDisplay(customer, customerEntries) {
  const approvedAmount = getCurrentTenureCollectedAmount(customer, customerEntries);
  if (approvedAmount > 0) return formatRupeeAmount(approvedAmount);
  if (hasCurrentTenurePendingApproval(customer, customerEntries)) return "Pending";
  return "—";
}

export function getCurrentTenurePartiallyPaidDisplay(customer, customerEntries) {
  const schedule = buildInstallmentSchedule(customer, customerEntries);
  if (!schedule.length) return "—";
  const paidAmount = getCurrentTenureCollectedAmount(customer, customerEntries);
  return `₹${paidAmount.toLocaleString("en-IN")}`;
}

export function getNextDueDateDisplay(customer, customerEntries) {
  const schedule = buildInstallmentSchedule(customer, customerEntries);
  if (!schedule.length) return "—";
  const nextUnpaid = schedule.find((item) => !isInstallmentPaid(item));
  if (!nextUnpaid?.dueDate) return "—";
  return formatDate(nextUnpaid.dueDate);
}

export function isCurrentTenureCollected(customer, customerEntries) {
  const currentItem = getCurrentTenureScheduleItem(customer, customerEntries);
  if (!currentItem) return false;
  return isInstallmentPaid(currentItem);
}

export function isCurrentTenurePartiallyPaid(customer, customerEntries) {
  if (isCurrentTenureCollected(customer, customerEntries)) return false;

  const approvedItem = getCurrentTenureScheduleItem(customer, customerEntries);
  if (!approvedItem) return false;

  if (Number(approvedItem.paidAmount || 0) > 0 && !isInstallmentPaid(approvedItem)) {
    return true;
  }

  if (!pendingPaymentAllocatesToCurrentTenure(customer, customerEntries)) {
    return false;
  }

  const previewItem = getCurrentTenureScheduleItem(customer, customerEntries, { includePendingApprovals: true });
  return Number(previewItem?.paidAmount || 0) > 0 && !isInstallmentPaid(previewItem);
}

export function getCurrentTenureCollectionStatus(customer, customerEntries) {
  const currentItem = getCurrentTenureScheduleItem(customer, customerEntries);
  if (!currentItem) return "Pending";
  if (isInstallmentPaid(currentItem)) return "Collected";
  if (isCurrentTenurePartiallyPaid(customer, customerEntries)) return "Partial Payment";

  const pendingEntry = getCurrentTenurePendingApprovalEntry(customer, customerEntries);
  if (pendingEntry && pendingPaymentAllocatesToCurrentTenure(customer, customerEntries)) {
    return normalizeEmployeeCollectionStatus(pendingEntry.collectionStatus);
  }

  return "Pending";
}

export function getCurrentTenurePaymentStatus(customer, customerEntries) {
  const schedule = buildInstallmentSchedule(customer, customerEntries);
  const tenure = computeTenureBreakdown(customer, customerEntries);
  const currentItem = schedule.find((item) => item.installmentNumber === tenure.currentTenureNumber);
  if (!currentItem) return "Pending";
  if (isInstallmentPaid(currentItem)) return "Paid";
  if (Number(currentItem.paidAmount || 0) > 0) return "Partially paid";
  return "Pending";
}

export function getCurrentTenureDueStatus(customer, customerEntries) {
  const schedule = buildInstallmentSchedule(customer, customerEntries);
  const tenure = computeTenureBreakdown(customer, customerEntries);
  const currentItem = schedule.find((item) => item.installmentNumber === tenure.currentTenureNumber);
  if (!currentItem || isInstallmentPaid(currentItem)) {
    return { label: "On Time", emoji: "🟢", key: "on-time" };
  }

  const today = startOfDay(new Date());
  const dueDay = startOfDay(currentItem.dueDate);
  if (dueDay < today) {
    return { label: "Overdue", emoji: "🔴", key: "overdue" };
  }
  if (dueDay.getTime() === today.getTime()) {
    return { label: "Due Today", emoji: "🟡", key: "due-today" };
  }
  return { label: "On Time", emoji: "🟢", key: "on-time" };
}

export function getCurrentTenureListDisplay(customer, customerEntries) {
  const schedule = buildInstallmentSchedule(customer, customerEntries);
  const tenure = computeTenureBreakdown(customer, customerEntries);
  const currentItem = schedule.find((item) => item.installmentNumber === tenure.currentTenureNumber);
  const dueStatus = getCurrentTenureDueStatus(customer, customerEntries);
  const dueAmount = currentItem ? Math.max(Number(currentItem.pendingAmount ?? currentItem.dueAmount ?? 0), 0) : 0;

  return {
    dueAmountNumber: dueAmount,
    dueAmountDisplay: currentItem ? `₹${dueAmount.toLocaleString("en-IN")}` : "—",
    dueDateDisplay: currentItem?.dueDate ? formatDate(currentItem.dueDate) : "—",
    tenureDisplay:
      tenure.currentTenure && tenure.currentTenure !== "--"
        ? tenure.currentTenure.charAt(0).toUpperCase() + tenure.currentTenure.slice(1)
        : "—",
    statusLabel: dueStatus.label,
    statusEmoji: dueStatus.emoji,
    statusKey: dueStatus.key,
  };
}

export function buildCustomerDetailRow(customer, customerEntries) {
  const frequency = normalizeCollectionFrequency(customer.collectionFrequency);
  const details = computeCustomerCollectionDetails(customer, customerEntries);
  const tenure = computeTenureBreakdown(customer, customerEntries);
  const schedule = buildInstallmentSchedule(customer, customerEntries);
  const pendingTenuresLabel = !schedule.length
    ? "—"
    : tenure.pendingTenures.length
      ? tenure.pendingTenures.join(", ")
      : "0";
  const totalTenureLabel = formatTotalTenureLabel(customer, schedule.length);
  return {
    customerId: customer.customerId || "--",
    sealNumber: getSealNumber(customer),
    customerName: customer.customerName || "Unnamed customer",
    phoneNumber: customer.mobileNumber || "--",
    nomineeName: customer.nomineeName || customer.coApplicantName || "--",
    loanDate: details.loanDate,
    loanAmount: details.loanAmount,
    currentDue: details.currentDue,
    currentTenure: tenure.currentTenure,
    currentTenureAmount: tenure.currentTenureAmount ? formatCurrency(tenure.currentTenureAmount) : "--",
    pendingTenures: tenure.pendingTenures,
    pendingTenuresLabel,
    totalTenureLabel,
    balanceTenures: tenure.balanceTenures,
    balanceTenuresLabel: formatInstallmentNumberList(frequency, tenure.balanceTenures),
    unpaidInstallmentCount: tenure.unpaidInstallmentCount,
    paidInterest: details.paidInterest,
    pendingInterest: details.pendingInterest,
    balanceAmount: details.balanceAmount,
    balanceAmountRaw: details.balanceAmountRaw,
    nearEndAlert: details.nearEndAlert,
    longTermNoPayment: details.longTermNoPayment,
    paidInstallmentCount: details.paidInstallmentCount,
    paidAmountTotal: details.paidAmountTotal,
  };
}

export function customerRowHighlightClass(row) {
  if (row.longTermNoPayment) return "bg-rose-50/90 text-rose-800";
  if (row.nearEndAlert) return "bg-amber-50/90 text-amber-900";
  return "bg-white text-slate-800";
}
