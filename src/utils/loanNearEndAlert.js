import {
  buildTenureCalendarContext,
  isInstallmentPaid,
  safeDate,
  startOfDay,
} from "./customerProfileSchedule.js";
import {
  getElapsedTenurePeriods,
  inferCollectionFrequencyFromSchedule,
  resolveLoanTimelineDates,
} from "./loanTimelineDates.js";

/** Days before final due when Customer ID cell should turn yellow. */
export const NEAR_END_DUE_DAYS = 14;

export function isInstallmentUnpaidForAlert(item) {
  if (!item) return false;
  return !isInstallmentPaid(item);
}

/**
 * Active collection tenure from EMI start and frequency:
 * Daily → new tenure each day, Weekly → every 7 days, Monthly → same day each calendar month.
 */
export function getCalendarCurrentTenureNumber(schedule, context = {}) {
  const total = schedule.length;
  if (!total) return 0;

  const frequency = context.frequency || inferCollectionFrequencyFromSchedule(schedule);
  const emiStartDate = context.emiStartDate || schedule[0]?.dueDate;
  const elapsed = getElapsedTenurePeriods(emiStartDate, frequency);

  return Math.min(Math.max(elapsed + 1, 1), total);
}

function hasScheduleArrears(schedule, customer = null) {
  const calendarCurrent = getCalendarCurrentTenureNumber(
    schedule,
    customer ? buildTenureCalendarContext(customer, schedule) : {}
  );
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

  if (schedule?.length && hasScheduleArrears(schedule, customer)) return false;

  if (unpaidItems.length === 1) return true;

  if (getFinalLoanDueDates(schedule, customer).some((dueDate) => isFinalDueDateWithinWindow(dueDate))) {
    return true;
  }

  const lastUnpaid = unpaidItems[unpaidItems.length - 1];
  return lastUnpaid ? isFinalDueDateWithinWindow(lastUnpaid.dueDate) : false;
}
