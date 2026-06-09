import { isInstallmentPaid, safeDate, startOfDay } from "./customerProfileSchedule.js";
import { resolveLoanTimelineDates } from "./loanTimelineDates.js";

/** Days before final due when Customer ID cell should turn yellow. */
export const NEAR_END_DUE_DAYS = 14;

export function isInstallmentUnpaidForAlert(item) {
  if (!item) return false;
  return !isInstallmentPaid(item);
}

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

function hasScheduleArrears(schedule) {
  const calendarCurrent = getCalendarCurrentTenureNumber(schedule);
  return schedule.some(
    (item) => item.installmentNumber < calendarCurrent && isInstallmentUnpaidForAlert(item)
  );
}

function isFinalDueDateWithinWindow(dueDateValue, withinDays = NEAR_END_DUE_DAYS) {
  const dueDate = safeDate(dueDateValue);
  if (!dueDate) return false;
  const today = startOfDay(new Date());
  const daysUntil = Math.round((startOfDay(dueDate) - today) / 86400000);
  return daysUntil >= 0 && daysUntil <= withinDays;
}

function getFinalLoanDueDates(schedule, customer) {
  const timeline = customer ? resolveLoanTimelineDates(customer) : {};
  return [
    timeline.emiEndDate,
    customer?.emiEndDate,
    customer?.dueDate,
    schedule?.length ? schedule[schedule.length - 1]?.dueDate : null,
  ].filter(Boolean);
}

/**
 * Yellow alert: loan / interest is about to end (final due approaching or last EMI unpaid).
 */
export function computeLoanNearEndAlert(schedule, customer = null) {
  const unpaidItems = (schedule || []).filter((item) => isInstallmentUnpaidForAlert(item));
  if (unpaidItems.length === 0) return false;

  if (schedule?.length && hasScheduleArrears(schedule)) return false;

  if (unpaidItems.length === 1) return true;

  if (getFinalLoanDueDates(schedule, customer).some((dueDate) => isFinalDueDateWithinWindow(dueDate))) {
    return true;
  }

  const lastUnpaid = unpaidItems[unpaidItems.length - 1];
  return lastUnpaid ? isFinalDueDateWithinWindow(lastUnpaid.dueDate) : false;
}
