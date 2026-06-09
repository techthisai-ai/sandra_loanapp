import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Eye,
  FileSpreadsheet,
  FileText,
  History,
  LoaderCircle,
  Printer,
  RotateCcw,
  Search,
  TrendingUp,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import BrandLogo from "../components/BrandLogo";
import EnterpriseReportPreview from "../components/reports/EnterpriseReportPreview.jsx";
import { downloadCollectionReportXlsx, downloadEmployeeLoanReportXlsx } from "../utils/collectionReportExports.js";
import { downloadEmployeeLoanReportPdf, printEmployeeLoanReportPdf } from "../utils/employeeLoanReportPdf.js";
import { downloadLoanCollectionReportPdf } from "../utils/loanCollectionReportPdf.js";
import { reportDateStamp } from "../utils/reportFilenames.js";
import { buildPreviewColumnsPdfPayload, printEnterpriseTabularPdf } from "../utils/enterpriseTabularReportPdf.js";
import useReportMeta from "../hooks/useReportMeta.js";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import { DEFAULT_DAY_CENTERS, loadLoanCenters } from "../constants/dayCenters";
import { LOAN_CENTERS_CHANGED_EVENT } from "../constants/loanCenterStorage";
import {
  NO_CENTER_LABEL,
  NO_SUB_CENTER_LABEL,
  resolveCustomerCenterDisplay,
} from "../utils/centerDisplay.js";

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

const defaultCenters = DEFAULT_DAY_CENTERS;

function loadCenters() {
  return loadLoanCenters();
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function toDateKey(date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

function monthKey(value) {
  const date = safeDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(key) {
  if (!key) return "--";
  const date = new Date(`${key}-01`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

/** Local YYYY-MM-DD for date inputs / display (avoids UTC shift from toISOString). */
function toLocalDateInputString(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDateKey(iso) {
  if (!iso || String(iso).length < 10) return null;
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getMondayOfWeekContaining(date) {
  const d = new Date(date);
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const start = startOfDay(d);
  start.setDate(d.getDate() + offset);
  return start;
}

/**
 * @typedef {{ start: Date, end: Date, label: string }} ReportRangeBounds
 * @param {string} preset — today | yesterday | thisWeek | lastWeek | thisMonth | lastMonth | thisYear
 */
function getRangeBoundsFromPreset(preset) {
  const now = new Date();
  const todayStart = startOfDay(now);

  switch (preset) {
    case "today": {
      const end = endOfDay(todayStart);
      return { start: todayStart, end, label: `Today (${toDateKey(todayStart)})` };
    }
    case "yesterday": {
      const y = startOfDay(addDays(now, -1));
      return { start: y, end: endOfDay(y), label: `Yesterday (${toDateKey(y)})` };
    }
    case "thisWeek": {
      const start = getMondayOfWeekContaining(now);
      const end = endOfDay(addDays(start, 6));
      return { start, end, label: `This week (${toDateKey(start)} – ${toDateKey(end)})` };
    }
    case "lastWeek": {
      const thisMonday = getMondayOfWeekContaining(now);
      const start = startOfDay(addDays(thisMonday, -7));
      const end = endOfDay(addDays(start, 6));
      return { start, end, label: `Last week (${toDateKey(start)} – ${toDateKey(end)})` };
    }
    case "thisMonth": {
      const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      const end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { start, end, label: `This month (${toDateKey(start)} – ${toDateKey(end)})` };
    }
    case "lastMonth": {
      const start = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const end = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      return { start, end, label: `Last month (${toDateKey(start)} – ${toDateKey(end)})` };
    }
    case "thisYear": {
      const y = now.getFullYear();
      const start = startOfDay(new Date(y, 0, 1));
      const end = endOfDay(new Date(y, 11, 31));
      return { start, end, label: `This year (${y})` };
    }
    default:
      return getRangeBoundsFromPreset("today");
  }
}

/** @returns {ReportRangeBounds | null} */
function buildCustomRangeBounds(fromKey, toKey) {
  const a = parseLocalDateKey(fromKey);
  const b = parseLocalDateKey(toKey);
  if (!a || !b) return null;
  let start = startOfDay(a);
  let endDay = startOfDay(b);
  if (start.getTime() > endDay.getTime()) [start, endDay] = [endDay, start];
  const end = endOfDay(endDay);
  return {
    start,
    end,
    label: `Custom (${toDateKey(start)} – ${toDateKey(endDay)})`,
  };
}

function loanBookedDateKey(customer) {
  const raw = customer.disbursementDate || customer.submittedAt || "";
  return String(raw).slice(0, 10);
}

function collectionDateKey(entry) {
  return (entry.collectionDate || entry.submittedAt || "").slice(0, 10);
}

function dateKeyInRange(key, start, end) {
  if (!key || key.length < 10) return false;
  const s = toDateKey(start);
  const e = toDateKey(end);
  return key >= s && key <= e;
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isOnTimeCollection(dueDateValue, collectionDateValue) {
  const dueDate = safeDate(dueDateValue);
  const collectionDate = safeDate(collectionDateValue);
  if (!dueDate || !collectionDate) return "No";
  return collectionDate.getTime() <= dueDate.getTime() ? "Yes" : "No";
}

function getLoanStartDate(customer) {
  return customer.disbursementDate || customer.loanApprovedAt || customer.submittedAt || "";
}

function getLoanEndDate(customer) {
  return customer.dueDate || customer.closedAt || customer.rescheduledAt || customer.submittedAt || "";
}

function getLoanStatus(customer, outstanding) {
  if (customer.isArchived) return "Archived";
  if (customer.loanStatus) return customer.loanStatus;
  return outstanding > 0 ? "Active" : "Closed";
}

/** Normalised label for employee loan details header */
function getLoanDisplayStatus(customer, pendingAmount, overdueAmount, totalPayable) {
  if (customer.isArchived) return "Archived";
  if (Number(overdueAmount || 0) > 0) return "Overdue";
  const pend = Number(pendingAmount || 0);
  const target = Number(totalPayable || 0);
  if (target > 0 && pend <= 0) return "Closed";
  const ls = String(customer.loanStatus || "").toLowerCase();
  if (ls === "closed" || ls === "settled") return "Closed";
  return "Active";
}

function getLastPaymentDate(approvedEntries) {
  const dates = approvedEntries
    .filter((e) => Number(e.amount || 0) > 0)
    .map((e) => String(e.collectionDate || e.submittedAt || "").slice(0, 10))
    .filter(Boolean)
    .sort();
  return dates.length ? dates[dates.length - 1] : "";
}

function countPaidAndPendingMonths(monthlyHistory) {
  let paid = 0;
  let pending = 0;
  (monthlyHistory || []).forEach((m) => {
    const due = Number(m.dueAmount || 0);
    if (due <= 0) return;
    const paidAmt = Number(m.paidAmount || 0);
    const pend = Number(m.pendingAmount || 0);
    const st = String(m.status || "");
    if (paidAmt >= due) paid += 1;
    else if (st === "Overdue" || st === "Skipped" || st === "Pending" || st === "Partial" || pend > 0) pending += 1;
  });
  return { totalMonthsPaid: paid, pendingMonths: pending };
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * One row per collection entry (newest first). pendingBalanceAfter = remaining principal after that payment (approved only toward cumulative).
 */
function buildEmployeeTransactionRows(customer, customerEntries, totalPayable) {
  const sortedAsc = [...customerEntries].sort((a, b) => {
    const da = String(a.collectionDate || a.submittedAt || "");
    const db = String(b.collectionDate || b.submittedAt || "");
    return da.localeCompare(db);
  });
  let cumulativeApproved = 0;
  const augmented = sortedAsc.map((entry) => {
    const amt = Number(entry.amount || 0);
    if (entry.approvalStatus === "approved") cumulativeApproved += amt;
    const pendingAfter = Math.max(Number(totalPayable || 0) - cumulativeApproved, 0);
    const paymentDate = entry.collectionDate || entry.submittedAt || "";
    return {
      entryId: entry.entryId || entry.id || "—",
      paymentDate,
      monthLabel: formatMonthLabel(monthKey(paymentDate)),
      paidAmount: entry.approvalStatus === "approved" ? amt : 0,
      amountRecorded: amt,
      pendingBalanceAfter: pendingAfter,
      paymentMethod: entry.paymentMethod || "Cash",
      collectedBy: entry.collectorName || entry.createdBy || entry.employeeId || "—",
      receiptNo: entry.entryId || entry.id || "—",
      status: entry.collectionStatus || "—",
      approvalStatus: entry.approvalStatus || "pending",
      note: entry.note || "",
    };
  });
  return augmented.reverse().map((row, idx) => ({ ...row, sno: idx + 1 }));
}

function sumPaidInMonthKeys(monthlyHistory, keySet) {
  return (monthlyHistory || []).reduce((sum, m) => {
    if (!keySet.has(m.monthKey)) return sum;
    return sum + Number(m.paidAmount || 0);
  }, 0);
}

function buildMonthlyPaymentBuckets(monthlyHistory) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const thisKey = `${y}-${String(m).padStart(2, "0")}`;
  const prev = new Date(y, m - 2, 1);
  const lastKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

  const keysLastN = (n) => {
    const set = new Set();
    for (let i = 0; i < n; i += 1) {
      const d = new Date(y, m - 1 - i, 1);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return set;
  };

  return {
    thisMonth: sumPaidInMonthKeys(monthlyHistory, new Set([thisKey])),
    lastMonth: sumPaidInMonthKeys(monthlyHistory, new Set([lastKey])),
    last3: sumPaidInMonthKeys(monthlyHistory, keysLastN(3)),
    last6: sumPaidInMonthKeys(monthlyHistory, keysLastN(6)),
    last10: sumPaidInMonthKeys(monthlyHistory, keysLastN(10)),
  };
}

function rowsToCsv(lines) {
  return lines
    .map((line) => line.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function getInstallmentAmount(customer, totalPayable) {
  const explicit = Number(customer.emiAmount || 0);
  if (explicit > 0) return explicit;
  const count = Math.max(Number(customer.loanWeeks || 0), 1);
  return Math.round(totalPayable / count);
}

function buildInstallmentSchedule(customer, customerEntries) {
  const totalPayable = Number(customer.totalPayable || 0);
  const loanWeeks = Math.max(Number(customer.loanWeeks || customerEntries.length || 1), 1);
  const baseInstallment = getInstallmentAmount(customer, totalPayable);
  const frequency = String(customer.collectionFrequency || "weekly").toLowerCase();
  const intervalDays = frequency === "daily" ? 1 : frequency.startsWith("month") ? 30 : 7;
  const loanStartDate = safeDate(getLoanStartDate(customer)) || new Date();
  const firstDueDate = addDays(loanStartDate, intervalDays);
  const approvedEntries = [...customerEntries]
    .filter((entry) => entry.approvalStatus === "approved")
    .sort((a, b) => String(a.collectionDate || a.submittedAt || "").localeCompare(String(b.collectionDate || b.submittedAt || "")));
  let remainingDue = totalPayable;
  let cumulativeCollected = 0;

  return Array.from({ length: loanWeeks }, (_, index) => {
    const dueAmount = index === loanWeeks - 1 ? Math.max(remainingDue, 0) : Math.min(baseInstallment, remainingDue);
    remainingDue -= dueAmount;
    const dueDate = addDays(firstDueDate, intervalDays * index);
    const approvedEntry = approvedEntries[index] || null;
    const paymentDate = approvedEntry?.collectionDate || approvedEntry?.submittedAt || "";
    const paidAmount = Number(approvedEntry?.amount || 0);
    cumulativeCollected += paidAmount;
    const pendingAmount = Math.max(dueAmount - paidAmount, 0);
    const lateDays = approvedEntry && safeDate(paymentDate)
      ? Math.max(Math.ceil((startOfDay(safeDate(paymentDate)) - startOfDay(dueDate)) / 86400000), 0)
      : 0;
    const collectedBy = approvedEntry?.collectorName || approvedEntry?.createdBy || approvedEntry?.employeeId || "--";
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
    };
  });
}

function buildMonthlyHistory(schedule, customerEntries) {
  const monthMeta = customerEntries.reduce((map, entry) => {
    const key = monthKey(entry.collectionDate || entry.submittedAt);
    if (!key) return map;
    if (!map.has(key)) {
      map.set(key, {
        skippedPayments: 0,
        penaltyCharges: 0,
      });
    }
    const bucket = map.get(key);
    if ((entry.collectionStatus || "Collected") === "Skipped") bucket.skippedPayments += 1;
    bucket.penaltyCharges += Number(entry.penaltyAmount || entry.penaltyCharge || 0);
    return map;
  }, new Map());

  const grouped = new Map();
  schedule.forEach((item) => {
    const key = monthKey(item.dueDate);
    if (!grouped.has(key)) {
      grouped.set(key, {
        monthKey: key,
        monthLabel: formatMonthLabel(key),
        monthStart: `${key}-01`,
        dueAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        paymentDate: "",
        collectedBy: new Set(),
        lateCount: 0,
        remainingBalance: 0,
      });
    }
    const bucket = grouped.get(key);
    bucket.dueAmount += item.dueAmount;
    bucket.paidAmount += item.paidAmount;
    bucket.pendingAmount += item.pendingAmount;
    bucket.remainingBalance = item.remainingBalanceAfter;
    if (item.paymentDate) {
      bucket.paymentDate = bucket.paymentDate && bucket.paymentDate > item.paymentDate ? bucket.paymentDate : item.paymentDate;
      if (item.collectedBy && item.collectedBy !== "--") bucket.collectedBy.add(item.collectedBy);
    }
    if (item.lateDays > 0) bucket.lateCount += 1;
  });

  return Array.from(grouped.values()).map((bucket) => {
    const meta = monthMeta.get(bucket.monthKey);
    const skippedPayments = meta?.skippedPayments || 0;
    const penaltyCharges = meta?.penaltyCharges || 0;
    let status = "Pending";
    if (bucket.paidAmount >= bucket.dueAmount && bucket.paidAmount > 0) {
      status = bucket.lateCount > 0 ? "Late paid" : "Completed";
    } else if (bucket.paidAmount > 0) {
      status = "Partial";
    } else if (skippedPayments > 0) {
      status = "Skipped";
    } else if (safeDate(bucket.monthStart) && safeDate(bucket.monthStart) < startOfDay(new Date()) && bucket.pendingAmount > 0) {
      status = "Overdue";
    }
    return {
      ...bucket,
      collectedBy: Array.from(bucket.collectedBy).join(", ") || "--",
      skippedPayments,
      penaltyCharges,
      status,
    };
  });
}

function buildTimeline(schedule) {
  return schedule.map((item) => {
    const isPaid = item.paidAmount > 0;
    const filterStatus = item.status === "Paid" ? "completed" : String(item.status || "pending").toLowerCase();
    const tone = isPaid
      ? item.lateDays > 0
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700"
      : item.status === "Overdue"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-slate-200 bg-slate-50 text-slate-700";
    return {
      id: `timeline-${item.installmentNumber}`,
      date: item.paymentDate || item.dueDate.toISOString(),
      monthKey: monthKey(item.paymentDate || item.dueDate),
      dateKey: String(item.paymentDate || item.dueDate.toISOString()).slice(0, 10),
      title: isPaid ? `Installment ${item.installmentNumber} ${item.status}` : `Installment ${item.installmentNumber} ${item.status}`,
      subtitle: isPaid
        ? `${formatCurrency(item.paidAmount)} collected on ${formatDate(item.paymentDate)}`
        : `${formatCurrency(item.pendingAmount)} pending as of ${formatDate(item.dueDate)}`,
      meta: item.collectedBy !== "--" ? `Collected by ${item.collectedBy}` : "No collector recorded",
      filterStatus,
      tone,
    };
  });
}

function buildCustomerFinancialReport(customer, entries, centers) {
  const customerEntries = entries.filter((entry) => entry.customerId === customer.customerId);
  const approvedEntries = customerEntries.filter((entry) => entry.approvalStatus === "approved");
  const totalCollected = approvedEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const totalPayable = Number(customer.totalPayable || 0);
  const pendingAmount = Math.max(totalPayable - totalCollected, 0);
  const interestAmount = Math.max(totalPayable - Number(customer.loanAmount || 0), 0);
  const centerMeta = resolveCustomerCenterDisplay(customer, centers);
  const schedule = buildInstallmentSchedule(customer, customerEntries);
  const monthlyHistory = buildMonthlyHistory(schedule, customerEntries);
  const overdueAmount = schedule.reduce((sum, item) => {
    return item.status === "Overdue" ? sum + Number(item.pendingAmount || 0) : sum;
  }, 0);
  const completedPayments = schedule.filter((item) => item.paidAmount >= item.dueAmount && item.dueAmount > 0).length;
  const remainingInstallments = schedule.filter((item) => item.pendingAmount > 0).length;
  const progressPercentage = totalPayable > 0 ? Math.min((totalCollected / totalPayable) * 100, 100) : 0;
  const employeeTxnRows = buildEmployeeTransactionRows(customer, customerEntries, totalPayable);
  const { totalMonthsPaid, pendingMonths } = countPaidAndPendingMonths(monthlyHistory);
  const lastPaymentDate = getLastPaymentDate(approvedEntries);
  const loanDisplayStatus = getLoanDisplayStatus(customer, pendingAmount, overdueAmount, totalPayable);
  const monthlyPaymentBuckets = buildMonthlyPaymentBuckets(monthlyHistory);

  return {
    customerId: customer.customerId || "--",
    customerName: customer.customerName || "Unnamed",
    phoneNumber: customer.mobileNumber || "--",
    dayCenter: centerMeta.dayCenter,
    subCenter: centerMeta.subCenter,
    loanId: customer.applicationId || customer.customerId || "--",
    loanAmount: Number(customer.loanAmount || 0),
    interestAmount,
    totalPayable,
    loanStartDate: getLoanStartDate(customer),
    loanEndDate: getLoanEndDate(customer),
    dueDate: customer.dueDate || "",
    loanStatus: getLoanStatus(customer, pendingAmount),
    loanDisplayStatus,
    totalCollected,
    pendingAmount,
    overdueAmount,
    completedPayments,
    remainingInstallments,
    progressPercentage,
    emiAmount: getInstallmentAmount(customer, totalPayable),
    schedule,
    monthlyHistory,
    timeline: buildTimeline(schedule),
    employeeTxnRows,
    totalMonthsPaid,
    pendingMonths,
    lastPaymentDate,
    monthlyPaymentBuckets,
    paymentEntries: customerEntries
      .map((entry) => ({
        ...entry,
        paymentDate: entry.collectionDate || entry.submittedAt || "",
      }))
      .sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate))),
  };
}

function getEmployeeModalFilteredSchedule(
  report,
  { modalDetailCenterFilter, reportMonthFilter, reportYearFilter, reportStatusFilter, reportDateFrom, reportDateTo }
) {
  if (!report?.schedule?.length) return [];
  if (modalDetailCenterFilter !== "All" && modalDetailCenterFilter !== report.dayCenter) return [];

  const skippedMonthKeys = new Set(
    report.paymentEntries
      .filter((entry) => String(entry.collectionStatus || "").toLowerCase() === "skipped")
      .map((entry) => monthKey(entry.paymentDate))
      .filter(Boolean)
  );

  return report.schedule.filter((item) => {
    const comparableDate = String(item.paymentDate || item.dueDate.toISOString()).slice(0, 10);
    const itemMonthKey = monthKey(item.paymentDate || item.dueDate);
    const itemStatus = item.status === "Paid" ? "completed" : String(item.status || "pending").toLowerCase();
    if (reportMonthFilter !== "all" && itemMonthKey !== reportMonthFilter) return false;
    if (reportYearFilter !== "all" && (!itemMonthKey || !itemMonthKey.startsWith(reportYearFilter))) return false;
    if (reportStatusFilter !== "all" && reportStatusFilter !== "skipped" && itemStatus !== reportStatusFilter) return false;
    if (reportStatusFilter === "skipped" && !skippedMonthKeys.has(itemMonthKey)) return false;
    if (reportDateFrom && comparableDate < reportDateFrom) return false;
    if (reportDateTo && comparableDate > reportDateTo) return false;
    return true;
  });
}

function downloadCustomerFinancialCsv(report, historyRows, transactionRows) {
  const txRows = Array.isArray(transactionRows) ? transactionRows : report.employeeTxnRows || [];
  const safeId = String(report.customerId || "customer").replace(/[^\w-]+/g, "_");
  const content = rowsToCsv([
    ["Employee Loan Details Report"],
    ["Employee Name", report.customerName],
    ["Employee ID", report.customerId],
    ["Phone Number", report.phoneNumber],
    ["Center", report.dayCenter],
    ["Sub-center", report.subCenter],
    ["Loan ID", report.loanId],
    ["Loan Amount", report.loanAmount],
    ["Interest Amount", report.interestAmount],
    ["Total Payable", report.totalPayable],
    ["Total Collected", report.totalCollected],
    ["Pending Amount", report.pendingAmount],
    ["Overdue Amount", report.overdueAmount],
    ["Loan Status", report.loanDisplayStatus || report.loanStatus],
    ["Total Months Paid", report.totalMonthsPaid],
    ["Pending Months", report.pendingMonths],
    ["Last Payment Date", report.lastPaymentDate || ""],
    [],
    ["Month-wise history", "Due Amount", "Paid Amount", "Pending", "Payment Date", "Collected By", "Status", "Late Payment Details", "Skipped Payments", "Penalty Charges"],
    ...historyRows.map((row) => [
      row.monthLabel,
      row.dueAmount,
      row.paidAmount,
      row.pendingAmount,
      row.paymentDate,
      row.collectedBy,
      row.status,
      row.lateCount ? `${row.lateCount} late` : "",
      row.skippedPayments,
      row.penaltyCharges || 0,
    ]),
    [],
    ["S.No", "Payment Date", "Month", "Paid Amount", "Pending Amount", "Payment Method", "Collected By", "Receipt No", "Collection Status", "Approval Status"],
    ...txRows.map((row) => [
      row.sno,
      row.paymentDate,
      row.monthLabel,
      row.paidAmount,
      row.pendingBalanceAfter,
      row.paymentMethod,
      row.collectedBy,
      row.receiptNo,
      row.status,
      row.approvalStatus,
    ]),
  ]);
  downloadFile(content, `employee-loan-details-${reportDateStamp()}-${safeId}.csv`, "text/csv;charset=utf-8;");
}

/** @param {{ start: Date, end: Date, label: string }} rangeBounds */
function computeReports(rangeBounds, customers, entries, centers) {
  const { start, end, label: periodLabel } = rangeBounds;

  const activeLoans = customers.filter(
    (customer) => Number(customer.loanAmount || 0) > 0 && !customer.isArchived && !customer.isDeleted
  );
  const activeCustomers = customers.filter((customer) => !customer.isArchived && !customer.isDeleted);
  const approvedEntries = entries.filter((entry) => entry.approvalStatus === "approved");

  const approvedCollectedByCustomer = approvedEntries.reduce((map, entry) => {
    map[entry.customerId] = (map[entry.customerId] || 0) + Number(entry.amount || 0);
    return map;
  }, {});

  const periodApprovedEntries = approvedEntries.filter((entry) => dateKeyInRange(collectionDateKey(entry), start, end));
  const totalCollectedAmount = periodApprovedEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const successfulCollections = periodApprovedEntries.filter((entry) => (entry.collectionStatus || "Collected") === "Collected").length;

  const periodEntriesAll = entries.filter((entry) => dateKeyInRange(collectionDateKey(entry), start, end));
  const skippedCollections = periodEntriesAll.filter((entry) => (entry.collectionStatus || "Collected") === "Skipped").length;

  const rangeStartDay = startOfDay(start);
  const rangeEndCalendarDay = startOfDay(end);
  const isSingleDayRange = rangeStartDay.getTime() === rangeEndCalendarDay.getTime();

  let pendingCollection;
  if (isSingleDayRange) {
    const dayKey = toDateKey(rangeStartDay);
    const dayApprovedEntries = approvedEntries.filter((entry) => collectionDateKey(entry) === dayKey);
    const dayCollectedCustomerIds = new Set(dayApprovedEntries.map((entry) => entry.customerId));
    const dueThatDayCustomers = activeLoans.filter((customer) => {
      const dueDate = safeDate(customer.dueDate);
      return dueDate && toDateKey(startOfDay(dueDate)) === dayKey;
    });
    pendingCollection = dueThatDayCustomers.filter((customer) => !dayCollectedCustomerIds.has(customer.customerId)).length;
  } else {
    const startMs = startOfDay(start).getTime();
    const endMs = end.getTime();
    pendingCollection = activeLoans.filter((customer) => {
      const dueDate = safeDate(customer.dueDate);
      if (!dueDate) return false;
      const dt = startOfDay(dueDate).getTime();
      if (dt < startMs || dt > endMs) return false;
      const target = Number(customer.totalPayable || 0);
      const paid = Number(approvedCollectedByCustomer[customer.customerId] || 0);
      return target - paid > 0;
    }).length;
  }

  let newLoansInRangeCount = 0;
  let newLoansInRangeAmount = 0;
  activeLoans.forEach((customer) => {
    const key = loanBookedDateKey(customer);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    if (!dateKeyInRange(key, start, end)) return;
    newLoansInRangeCount += 1;
    newLoansInRangeAmount += Number(customer.loanAmount || 0);
  });

  const currentTotalOutstanding = activeLoans.reduce((sum, customer) => {
    const paid = Number(approvedCollectedByCustomer[customer.customerId] || 0);
    const totalPayable = Number(customer.totalPayable || 0);
    return sum + Math.max(totalPayable - paid, 0);
  }, 0);

  const netCashApprox = totalCollectedAmount - newLoansInRangeAmount;

  const detailRows = activeCustomers.map((customer) => {
    const paid = Number(approvedCollectedByCustomer[customer.customerId] || 0);
    const totalPayable = Number(customer.totalPayable || 0);
    const outstanding = Math.max(totalPayable - paid, 0);
    const { dayCenter, subCenter } = resolveCustomerCenterDisplay(customer, centers);
    const latestEntry = entries
      .filter((entry) => entry.customerId === customer.customerId)
      .sort((a, b) => String(b.collectionDate || b.submittedAt || "").localeCompare(String(a.collectionDate || a.submittedAt || "")))[0];
    return {
      customerId: customer.customerId || "",
      loanId: customer.applicationId || customer.customerId || "",
      dayCenter,
      subCenter,
      customerName: customer.customerName || "Unnamed",
      phoneNumber: customer.mobileNumber || "",
      loanAmount: Number(customer.loanAmount || 0),
      totalPayable,
      totalCollected: paid,
      outstanding,
      dueDate: customer.dueDate || "",
      latestStatus: latestEntry?.collectionStatus || "Pending",
      onTime: isOnTimeCollection(customer.dueDate, latestEntry?.collectionDate || latestEntry?.submittedAt),
    };
  });

  return {
    periodLabel,
    isSingleDayRange,
    metrics: {
      totalCollectedAmount,
      successfulCollections,
      pendingCollection,
      skippedCollections,
      newLoansInRangeCount,
      newLoansInRangeAmount,
      currentTotalOutstanding,
      netCashApprox,
    },
    detailRows,
    generatedAt: new Date().toLocaleString("en-IN"),
  };
}

const REPORT_CARD_ACCENTS = {
  blue: {
    card: "border-blue-200 bg-blue-50/50",
    label: "text-blue-800/75",
    icon: "bg-blue-100 text-blue-600",
  },
  green: {
    card: "border-emerald-200 bg-emerald-50/50",
    label: "text-emerald-800/75",
    icon: "bg-emerald-100 text-emerald-600",
  },
  orange: {
    card: "border-amber-200 bg-amber-50/50",
    label: "text-amber-800/75",
    icon: "bg-amber-100 text-amber-600",
  },
  slate: {
    card: "border-slate-200 bg-slate-50/60",
    label: "text-slate-600",
    icon: "bg-slate-100 text-slate-600",
  },
  violet: {
    card: "border-violet-200 bg-violet-50/50",
    label: "text-violet-800/75",
    icon: "bg-violet-100 text-violet-600",
  },
  rose: {
    card: "border-rose-200 bg-rose-50/50",
    label: "text-rose-800/75",
    icon: "bg-rose-100 text-rose-600",
  },
  purple: {
    card: "border-indigo-200 bg-indigo-50/50",
    label: "text-indigo-800/75",
    icon: "bg-indigo-100 text-indigo-600",
  },
};

function ReportCard({ icon: Icon, label, value, accent = "blue" }) {
  const tone = REPORT_CARD_ACCENTS[accent] || REPORT_CARD_ACCENTS.blue;
  const valueText = String(value ?? "");
  const amountClass =
    valueText.length >= 13
      ? "text-sm sm:text-base"
      : valueText.length >= 10
        ? "text-base sm:text-lg"
        : "text-lg sm:text-xl";

  return (
    <div className={`min-w-0 rounded-xl border px-2.5 py-2 shadow-sm sm:px-3 sm:py-2.5 ${tone.card}`}>
      <div className="flex items-start justify-between gap-1.5">
        <p className={`min-w-0 text-[9px] font-semibold uppercase leading-tight tracking-[0.12em] sm:text-[10px] sm:tracking-[0.14em] ${tone.label}`}>
          {label}
        </p>
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-8 sm:w-8 ${tone.icon}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p
        className={`mt-1.5 min-w-0 overflow-hidden text-center whitespace-nowrap text-ellipsis font-semibold leading-tight tracking-tight text-slate-950 tabular-nums ${amountClass}`}
      >
        {valueText}
      </p>
    </div>
  );
}

function ModalCard({ icon: Icon, label, value, note, tone = "text-slate-950" }) {
  const valueText = String(value ?? "");
  const amountClass = valueText.length >= 13 ? "text-base" : "text-[1.1rem]";

  return (
    <div className="h-full rounded-2xl border border-slate-200/90 bg-[linear-gradient(180deg,#ffffff,rgba(248,250,252,0.98))] px-4 py-3 shadow-sm">
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p>
          {Icon ? (
            <div className="app-icon-shell flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/70">
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className={`overflow-hidden whitespace-nowrap text-ellipsis font-bold leading-tight tabular-nums ${tone} ${amountClass}`}>
            {valueText}
          </p>
          {note ? <p className="app-truncate-2 mt-1.5 text-xs leading-5 text-slate-500">{note}</p> : null}
        </div>
      </div>
    </div>
  );
}

function PerformanceBar({ label, value, total, tone }) {
  const width = total > 0 ? Math.max((Number(value || 0) / total) * 100, 2) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-semibold text-slate-700">{formatCurrency(value)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function MonthlyRepaymentGraph({ rows = [] }) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        No payment history in this filter.
      </div>
    );
  }

  const max = Math.max(...rows.map((row) => Number(row.dueAmount || 0)), 0);

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const paidWidth = max > 0 ? Math.max((Number(row.paidAmount || 0) / max) * 100, row.paidAmount > 0 ? 4 : 0) : 0;
        const dueWidth = max > 0 ? Math.max((Number(row.dueAmount || 0) / max) * 100, row.dueAmount > 0 ? 4 : 0) : 0;
        return (
          <div key={row.monthKey} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{row.monthLabel}</p>
              <p className="text-xs text-slate-500">
                Due {formatCurrency(row.dueAmount)} | Paid {formatCurrency(row.paidAmount)}
              </p>
            </div>
            <div className="space-y-2">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">Due amount</div>
                <div className="h-2.5 overflow-hidden rounded-full bg-blue-50">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{ width: `${dueWidth}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600">Paid amount</div>
                <div className="h-2.5 overflow-hidden rounded-full bg-emerald-50">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${paidWidth}%` }} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function loanDisplayStatusChipClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "closed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (s === "overdue") return "border-rose-200 bg-rose-50 text-rose-800";
  if (s === "archived") return "border-slate-200 bg-slate-100 text-slate-700";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

const RANGE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This week" },
  { key: "lastWeek", label: "Last week" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "thisYear", label: "This year" },
];

const REPORTS_RANGE_STORAGE_KEY = "rfs-reports-range-v1";

function loadPersistedReportRange() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REPORTS_RANGE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const EMPLOYEE_TXN_PAGE_SIZE = 12;

export default function Reports() {
  const { customers, entries, loading, error: syncError } = useLoanDataSync();
  const collectionReportMeta = useReportMeta("RFS-RPT-COL");
  const employeeReportMeta = useReportMeta("RFS-RPT-EMP");
  const error = syncError || "";
  const persistedRange = typeof window !== "undefined" ? loadPersistedReportRange() : null;
  const [rangePreset, setRangePreset] = useState(() => {
    const p = persistedRange?.preset;
    if (p === "custom" || RANGE_PRESETS.some((x) => x.key === p)) return p;
    return "today";
  });
  const [appliedCustomFrom, setAppliedCustomFrom] = useState(() =>
    typeof persistedRange?.appliedCustomFrom === "string" ? persistedRange.appliedCustomFrom : ""
  );
  const [appliedCustomTo, setAppliedCustomTo] = useState(() =>
    typeof persistedRange?.appliedCustomTo === "string" ? persistedRange.appliedCustomTo : ""
  );
  const [customFromDraft, setCustomFromDraft] = useState(() =>
    typeof persistedRange?.appliedCustomFrom === "string" ? persistedRange.appliedCustomFrom : ""
  );
  const [customToDraft, setCustomToDraft] = useState(() =>
    typeof persistedRange?.appliedCustomTo === "string" ? persistedRange.appliedCustomTo : ""
  );
  const [detailFilter, setDetailFilter] = useState("all");
  const [detailSearch, setDetailSearch] = useState("");
  const [centerFilter, setCenterFilter] = useState("All");
  const [subCenterFilter, setSubCenterFilter] = useState("All");
  const [centers, setCenters] = useState(() => loadCenters());
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");
  const [reportMonthFilter, setReportMonthFilter] = useState("all");
  const [reportYearFilter, setReportYearFilter] = useState("all");
  const [reportStatusFilter, setReportStatusFilter] = useState("all");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [modalDetailCenterFilter, setModalDetailCenterFilter] = useState("All");
  const [txnSearch, setTxnSearch] = useState("");
  const [txnApprovalFilter, setTxnApprovalFilter] = useState("all");
  const [txnCollectionFilter, setTxnCollectionFilter] = useState("all");
  const [txnPage, setTxnPage] = useState(1);
  const [collectionPdfLoading, setCollectionPdfLoading] = useState(false);
  const [collectionExcelLoading, setCollectionExcelLoading] = useState(false);
  const [collectionPrintLoading, setCollectionPrintLoading] = useState(false);
  const [collectionPreviewOpen, setCollectionPreviewOpen] = useState(false);
  const [employeePreviewOpen, setEmployeePreviewOpen] = useState(false);
  const [employeePdfLoading, setEmployeePdfLoading] = useState(false);
  const [employeeExcelLoading, setEmployeeExcelLoading] = useState(false);
  const [employeePrintLoading, setEmployeePrintLoading] = useState(false);

  useEffect(() => {
    const onCentersChange = () => setCenters(loadCenters());
    window.addEventListener(LOAN_CENTERS_CHANGED_EVENT, onCentersChange);
    return () => window.removeEventListener(LOAN_CENTERS_CHANGED_EVENT, onCentersChange);
  }, []);

  useEffect(() => {
    setTxnPage(1);
  }, [
    txnSearch,
    txnApprovalFilter,
    txnCollectionFilter,
    reportDateFrom,
    reportDateTo,
    reportMonthFilter,
    reportYearFilter,
    reportStatusFilter,
    modalDetailCenterFilter,
    selectedCustomerId,
  ]);

  useEffect(() => {
    if (!selectedCustomerId) setEmployeePreviewOpen(false);
  }, [selectedCustomerId]);

  const dayCenters = useMemo(() => defaultCenters.map((c) => c.label), []);
  const subCentersByDay = useMemo(() => {
    const map = new Map();
    centers.forEach((c) => {
      if (!c.parent) return;
      if (!map.has(c.parent)) map.set(c.parent, []);
      map.get(c.parent).push(c.label);
    });
    map.forEach((list, key) => map.set(key, [...new Set(list)].sort((a, b) => a.localeCompare(b))));
    return map;
  }, [centers]);

  const reportRangeBounds = useMemo(() => {
    if (rangePreset === "custom") {
      const b = buildCustomRangeBounds(appliedCustomFrom, appliedCustomTo);
      return b || getRangeBoundsFromPreset("today");
    }
    return getRangeBoundsFromPreset(rangePreset);
  }, [rangePreset, appliedCustomFrom, appliedCustomTo]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        REPORTS_RANGE_STORAGE_KEY,
        JSON.stringify({
          preset: rangePreset,
          appliedCustomFrom,
          appliedCustomTo,
        })
      );
    } catch {
      /* ignore */
    }
  }, [rangePreset, appliedCustomFrom, appliedCustomTo]);

  const reportRangeSyncKey = useMemo(
    () =>
      `${toLocalDateInputString(reportRangeBounds.start)}_${toLocalDateInputString(reportRangeBounds.end)}_${rangePreset}`,
    [reportRangeBounds, rangePreset]
  );

  useEffect(() => {
    setReportDateFrom(toLocalDateInputString(reportRangeBounds.start));
    setReportDateTo(toLocalDateInputString(reportRangeBounds.end));
    setReportMonthFilter("all");
    setReportYearFilter("all");
  }, [reportRangeSyncKey]);

  const report = useMemo(
    () => computeReports(reportRangeBounds, customers, entries, centers),
    [customers, entries, centers, reportRangeBounds]
  );

  const selectRangePreset = useCallback(
    (key) => {
      if (key === "custom") {
        const from = toLocalDateInputString(reportRangeBounds.start);
        const to = toLocalDateInputString(startOfDay(reportRangeBounds.end));
        setCustomFromDraft(from);
        setCustomToDraft(to);
        setAppliedCustomFrom(from);
        setAppliedCustomTo(to);
        setRangePreset("custom");
        return;
      }
      setRangePreset(key);
    },
    [reportRangeBounds]
  );

  const applyCustomRange = useCallback(() => {
    const b = buildCustomRangeBounds(customFromDraft, customToDraft);
    if (!b) {
      window.alert("Please choose a valid From and To date.");
      return;
    }
    setAppliedCustomFrom(toLocalDateInputString(b.start));
    setAppliedCustomTo(toLocalDateInputString(startOfDay(b.end)));
    setRangePreset("custom");
  }, [customFromDraft, customToDraft]);

  const resetReportRange = useCallback(() => {
    setRangePreset("today");
    setAppliedCustomFrom("");
    setAppliedCustomTo("");
    const t = getRangeBoundsFromPreset("today");
    setCustomFromDraft(toLocalDateInputString(t.start));
    setCustomToDraft(toLocalDateInputString(startOfDay(t.end)));
  }, []);

  const detailRowsScoped = useMemo(() => {
    const query = detailSearch.trim().toLowerCase();
    return report.detailRows
      .filter((row) => {
        if (!query) return true;
        return row.customerName.toLowerCase().includes(query) || String(row.phoneNumber || "").toLowerCase().includes(query);
      })
      .filter((row) => {
        const matchesCenter = centerFilter === "All" || row.dayCenter === centerFilter;
        const matchesSub = subCenterFilter === "All" || row.subCenter === subCenterFilter;
        return matchesCenter && matchesSub;
      });
  }, [centerFilter, detailSearch, report.detailRows, subCenterFilter]);

  const detailStatusCounts = useMemo(() => {
    const today = startOfDay(new Date());
    let pending = 0;
    let due = 0;
    let overdue = 0;
    detailRowsScoped.forEach((row) => {
      const outstanding = Number(row.outstanding || 0);
      const dueDate = safeDate(row.dueDate);
      if (outstanding > 0) pending += 1;
      if (dueDate && startOfDay(dueDate).getTime() === today.getTime()) due += 1;
      if (dueDate && startOfDay(dueDate) < today && outstanding > 0) overdue += 1;
    });
    return { all: detailRowsScoped.length, pending, due, overdue };
  }, [detailRowsScoped]);

  const filteredDetailRows = useMemo(() => {
    if (detailFilter === "all") return detailRowsScoped;
    const today = startOfDay(new Date());
    return detailRowsScoped.filter((row) => {
      const outstanding = Number(row.outstanding || 0);
      const due = safeDate(row.dueDate);
      if (detailFilter === "pending") return outstanding > 0;
      if (detailFilter === "due") return due && startOfDay(due).getTime() === today.getTime();
      if (detailFilter === "overdue") return due && startOfDay(due) < today && outstanding > 0;
      return true;
    });
  }, [detailFilter, detailRowsScoped]);

  const collectionPreviewColumns = useMemo(
    () => [
      { key: "center", label: "Center" },
      { key: "customerName", label: "Customer" },
      { key: "phone", label: "Phone" },
      { key: "loanAmount", label: "Loan amount", cellType: "currency" },
      { key: "totalPayable", label: "Total payable", cellType: "currency" },
      { key: "collected", label: "Collected", cellType: "currency" },
      { key: "outstanding", label: "Outstanding", cellType: "currency" },
      { key: "dueDate", label: "Due date" },
      { key: "onTime", label: "On time", cellType: "status" },
      { key: "latestStatus", label: "Latest status", cellType: "status" },
    ],
    []
  );

  const collectionPreviewRows = useMemo(
    () =>
      filteredDetailRows.map((row, i) => {
        const sub =
          row.subCenter && row.subCenter !== NO_SUB_CENTER_LABEL ? row.subCenter : "";
        const center = [row.dayCenter, sub].filter(Boolean).join(" · ") || "—";
        return {
          __key: `${row.customerId || row.customerName}-${i}`,
          center,
          customerName: row.customerName,
          phone: row.phoneNumber || "—",
          loanAmount: Number(row.loanAmount || 0),
          totalPayable: Number(row.totalPayable || 0),
          collected: Number(row.totalCollected || 0),
          outstanding: Number(row.outstanding || 0),
          dueDate: row.dueDate || "—",
          onTime: row.onTime || "—",
          latestStatus: String(row.latestStatus || "—"),
        };
      }),
    [filteredDetailRows]
  );

  const collectionPreviewFilterLines = useMemo(() => {
    const gen = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
    const lines = [
      `Generated: ${gen}`,
      `Period: ${report.periodLabel}`,
      `Row filter: ${detailFilter === "all" ? "All" : detailFilter}`,
    ];
    if (centerFilter !== "All") lines.push(`Center: ${centerFilter}`);
    if (subCenterFilter !== "All") lines.push(`Sub-center: ${subCenterFilter}`);
    if (detailSearch.trim()) lines.push(`Search: "${detailSearch.trim()}"`);
    return lines;
  }, [report.periodLabel, detailFilter, centerFilter, subCenterFilter, detailSearch]);

  const collectionPreviewMetrics = useMemo(
    () => [
      {
        icon: Wallet,
        label: "Total collected",
        value: formatCurrency(report.metrics.totalCollectedAmount),
        note: "Approved entries in range",
        accent: "blue",
      },
      {
        icon: CheckCircle2,
        label: "Successful",
        value: String(report.metrics.successfulCollections),
        note: "Collected status",
        accent: "green",
      },
      {
        icon: Clock3,
        label: "Pending dues",
        value: String(report.metrics.pendingCollection),
        note: report.isSingleDayRange ? "Due that day, not yet collected" : "Due in range with balance",
        accent: "orange",
      },
      {
        icon: TrendingUp,
        label: "Skipped",
        value: String(report.metrics.skippedCollections),
        note: "Entries marked skipped in range",
        accent: "slate",
      },
      {
        icon: Building2,
        label: "New loans",
        value: String(report.metrics.newLoansInRangeCount),
        note: `${formatCurrency(report.metrics.newLoansInRangeAmount)} booked in range`,
        accent: "violet",
      },
      {
        icon: CircleDollarSign,
        label: "Outstanding",
        value: formatCurrency(report.metrics.currentTotalOutstanding),
        note: "Current open book (all active)",
        accent: "rose",
      },
      {
        icon: BarChart3,
        label: "Net (approx.)",
        value: formatCurrency(report.metrics.netCashApprox),
        note: "Collections − new loan principal in range",
        accent: "purple",
      },
    ],
    [report.metrics, report.isSingleDayRange]
  );

  const handleCollectionPdfDownload = useCallback(async () => {
    setCollectionPdfLoading(true);
    try {
      await downloadLoanCollectionReportPdf(
        { ...report, detailRows: filteredDetailRows },
        {
          origin: typeof window !== "undefined" ? window.location.origin : "",
          extraMetaLines: collectionPreviewFilterLines,
          generatedLabel: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" }),
        }
      );
    } catch (err) {
      console.error(err);
      window.alert("Could not generate the PDF. Please try again.");
    } finally {
      setCollectionPdfLoading(false);
    }
  }, [report, filteredDetailRows, collectionPreviewFilterLines]);

  const handleCollectionExcelDownload = useCallback(async () => {
    setCollectionExcelLoading(true);
    try {
      await Promise.resolve();
      downloadCollectionReportXlsx(filteredDetailRows, reportDateStamp(), {
        periodLabel: report.periodLabel,
        generatedAt: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" }),
        filterLines: collectionPreviewFilterLines,
      });
    } finally {
      setCollectionExcelLoading(false);
    }
  }, [filteredDetailRows, report.periodLabel, collectionPreviewFilterLines]);

  const collectionDetailPdfPayload = useMemo(
    () =>
      buildPreviewColumnsPdfPayload({
        title: "Collection report",
        subtitle: `Portfolio · ${report.periodLabel}`,
        columns: collectionPreviewColumns,
        rows: collectionPreviewRows,
        filterLines: collectionPreviewFilterLines,
        summaryCards: collectionPreviewMetrics.map((m) => ({ label: m.label, value: m.value, note: m.note })),
        reportMeta: collectionReportMeta,
        orientation: "landscape",
      }),
    [
      collectionPreviewColumns,
      collectionPreviewFilterLines,
      collectionPreviewMetrics,
      collectionPreviewRows,
      collectionReportMeta,
      report.periodLabel,
    ]
  );

  const handleCollectionPrint = useCallback(async () => {
    setCollectionPrintLoading(true);
    try {
      await printEnterpriseTabularPdf(collectionDetailPdfPayload);
    } catch (err) {
      console.error(err);
      window.alert("Could not open print dialog. Try downloading the PDF instead.");
    } finally {
      setCollectionPrintLoading(false);
    }
  }, [collectionDetailPdfPayload]);

  const selectedCustomerReport = useMemo(() => {
    if (!selectedCustomerId) return null;
    const customer = customers.find((item) => item.customerId === selectedCustomerId);
    if (!customer) return null;
    return buildCustomerFinancialReport(customer, entries, centers);
  }, [selectedCustomerId, customers, entries, centers]);

  const filteredModalSchedule = useMemo(() => {
    if (!selectedCustomerReport) return [];
    return getEmployeeModalFilteredSchedule(selectedCustomerReport, {
      modalDetailCenterFilter,
      reportMonthFilter,
      reportYearFilter,
      reportStatusFilter,
      reportDateFrom,
      reportDateTo,
    });
  }, [
    selectedCustomerReport,
    modalDetailCenterFilter,
    reportMonthFilter,
    reportYearFilter,
    reportStatusFilter,
    reportDateFrom,
    reportDateTo,
  ]);

  const filteredMonthlyHistory = useMemo(() => {
    if (!selectedCustomerReport) return [];

    const filteredEntries = selectedCustomerReport.paymentEntries.filter((entry) => {
      const comparableDate = String(entry.paymentDate || "").slice(0, 10);
      const entryMonthKey = monthKey(entry.paymentDate);
      if (reportMonthFilter !== "all" && entryMonthKey !== reportMonthFilter) return false;
      if (reportYearFilter !== "all" && (!entryMonthKey || !entryMonthKey.startsWith(reportYearFilter))) return false;
      if (reportDateFrom && comparableDate && comparableDate < reportDateFrom) return false;
      if (reportDateTo && comparableDate && comparableDate > reportDateTo) return false;
      if (reportStatusFilter === "completed" && entry.approvalStatus !== "approved") return false;
      if (reportStatusFilter === "skipped" && String(entry.collectionStatus || "").toLowerCase() !== "skipped") return false;
      return true;
    });

    const query = paymentSearch.trim().toLowerCase();
    return buildMonthlyHistory(filteredModalSchedule, filteredEntries).filter((row) => {
      if (!query) return true;
      if (reportYearFilter !== "all" && (!row.monthKey || !row.monthKey.startsWith(reportYearFilter))) return false;
      return [row.monthLabel, row.collectedBy, row.status, row.paymentDate].some((field) =>
        String(field || "").toLowerCase().includes(query)
      );
    });
  }, [
    filteredModalSchedule,
    paymentSearch,
    reportDateFrom,
    reportDateTo,
    reportMonthFilter,
    reportYearFilter,
    reportStatusFilter,
    selectedCustomerReport,
  ]);

  const filteredTimeline = useMemo(() => {
    if (!selectedCustomerReport) return [];
    if (modalDetailCenterFilter !== "All" && modalDetailCenterFilter !== selectedCustomerReport.dayCenter) return [];
    const query = paymentSearch.trim().toLowerCase();
    return selectedCustomerReport.timeline.filter((item) => {
      if (reportMonthFilter !== "all" && item.monthKey !== reportMonthFilter) return false;
      if (reportYearFilter !== "all" && (!item.monthKey || !item.monthKey.startsWith(reportYearFilter))) return false;
      if (reportDateFrom && item.dateKey && item.dateKey < reportDateFrom) return false;
      if (reportDateTo && item.dateKey && item.dateKey > reportDateTo) return false;
      if (reportStatusFilter !== "all" && item.filterStatus !== reportStatusFilter) return false;
      if (!query) return true;
      return [item.title, item.subtitle, item.meta].some((field) => String(field || "").toLowerCase().includes(query));
    });
  }, [paymentSearch, reportDateFrom, reportDateTo, reportMonthFilter, reportYearFilter, reportStatusFilter, modalDetailCenterFilter, selectedCustomerReport]);

  const modalMonthOptions = useMemo(() => {
    return selectedCustomerReport ? selectedCustomerReport.monthlyHistory.map((row) => row.monthKey) : [];
  }, [selectedCustomerReport]);

  const modalYearOptions = useMemo(() => {
    if (!selectedCustomerReport) return [];
    const years = new Set();
    selectedCustomerReport.monthlyHistory.forEach((m) => {
      if (m.monthKey?.length >= 4) years.add(m.monthKey.slice(0, 4));
    });
    selectedCustomerReport.employeeTxnRows.forEach((r) => {
      const k = monthKey(r.paymentDate);
      if (k?.length >= 4) years.add(k.slice(0, 4));
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [selectedCustomerReport]);

  const filteredEmployeeTxns = useMemo(() => {
    if (!selectedCustomerReport) return [];
    if (modalDetailCenterFilter !== "All" && modalDetailCenterFilter !== selectedCustomerReport.dayCenter) return [];
    const q = txnSearch.trim().toLowerCase();
    return selectedCustomerReport.employeeTxnRows.filter((row) => {
      const d = String(row.paymentDate).slice(0, 10);
      const mk = monthKey(row.paymentDate);
      if (reportDateFrom && d && d < reportDateFrom) return false;
      if (reportDateTo && d && d > reportDateTo) return false;
      if (reportMonthFilter !== "all" && mk !== reportMonthFilter) return false;
      if (reportYearFilter !== "all" && (!mk || !mk.startsWith(reportYearFilter))) return false;
      if (txnApprovalFilter === "approved" && row.approvalStatus !== "approved") return false;
      if (txnApprovalFilter === "pending" && row.approvalStatus !== "pending") return false;
      if (txnApprovalFilter === "rejected" && row.approvalStatus !== "rejected") return false;
      const coll = String(row.status || "").toLowerCase();
      if (txnCollectionFilter === "collected" && coll !== "collected") return false;
      if (txnCollectionFilter === "skipped" && coll !== "skipped") return false;
      if (!q) return true;
      return [row.monthLabel, row.collectedBy, row.paymentMethod, row.receiptNo, row.status, row.note, String(row.paidAmount)]
        .some((field) => String(field || "").toLowerCase().includes(q));
    });
  }, [
    selectedCustomerReport,
    modalDetailCenterFilter,
    txnSearch,
    txnApprovalFilter,
    txnCollectionFilter,
    reportDateFrom,
    reportDateTo,
    reportMonthFilter,
    reportYearFilter,
  ]);

  const txnTotalPages = Math.max(1, Math.ceil(filteredEmployeeTxns.length / EMPLOYEE_TXN_PAGE_SIZE));

  const paginatedEmployeeTxns = useMemo(() => {
    const safePage = Math.min(Math.max(txnPage, 1), txnTotalPages);
    const start = (safePage - 1) * EMPLOYEE_TXN_PAGE_SIZE;
    return filteredEmployeeTxns.slice(start, start + EMPLOYEE_TXN_PAGE_SIZE).map((row, i) => ({
      ...row,
      displaySno: start + i + 1,
    }));
  }, [filteredEmployeeTxns, txnPage, txnTotalPages]);

  const employeeSchedulePreviewColumns = useMemo(
    () => [
      { key: "installment", label: "#" },
      { key: "dueDate", label: "Due date", cellType: "date" },
      { key: "dueAmount", label: "Due amount", cellType: "currency" },
      { key: "paidAmount", label: "Paid", cellType: "currency" },
      { key: "pendingAmount", label: "Pending", cellType: "currency" },
      { key: "paymentDate", label: "Paid on" },
      { key: "status", label: "Status", cellType: "status" },
      { key: "collectedBy", label: "Collected by" },
    ],
    []
  );

  const employeeSchedulePreviewRows = useMemo(
    () =>
      filteredModalSchedule.map((item, i) => ({
        __key: `inst-${item.installmentNumber}-${i}`,
        installment: String(item.installmentNumber ?? i + 1),
        dueDate: item.dueDate,
        dueAmount: Number(item.dueAmount || 0),
        paidAmount: Number(item.paidAmount || 0),
        pendingAmount: Number(item.pendingAmount || 0),
        paymentDate: item.paymentDate ? formatDate(item.paymentDate) : "—",
        status: item.status || "—",
        collectedBy: item.collectedBy || "—",
      })),
    [filteredModalSchedule]
  );

  const employeePreviewFilterLines = useMemo(() => {
    if (!selectedCustomerReport) return [];
    const gen = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
    const lines = [
      `Generated: ${gen}`,
      `Portfolio period: ${report.periodLabel}`,
      `Employee: ${selectedCustomerReport.customerName}`,
      `Center: ${modalDetailCenterFilter === "All" ? selectedCustomerReport.dayCenter : modalDetailCenterFilter}`,
    ];
    if (reportMonthFilter !== "all") lines.push(`Month: ${formatMonthLabel(reportMonthFilter)}`);
    if (reportYearFilter !== "all") lines.push(`Year: ${reportYearFilter}`);
    if (reportStatusFilter !== "all") lines.push(`Status filter: ${reportStatusFilter}`);
    if (reportDateFrom || reportDateTo) lines.push(`Dates: ${reportDateFrom || "…"} → ${reportDateTo || "…"}`);
    return lines;
  }, [
    report.periodLabel,
    selectedCustomerReport,
    modalDetailCenterFilter,
    reportMonthFilter,
    reportYearFilter,
    reportStatusFilter,
    reportDateFrom,
    reportDateTo,
  ]);

  const employeePreviewMetrics = useMemo(() => {
    if (!selectedCustomerReport) return [];
    const r = selectedCustomerReport;
    return [
      { icon: Wallet, label: "Total payable", value: formatCurrency(r.totalPayable), note: "Including interest" },
      { icon: CheckCircle2, label: "Collected", value: formatCurrency(r.totalCollected), note: "Approved payments" },
      { icon: Clock3, label: "Pending", value: formatCurrency(r.pendingAmount), note: "Outstanding balance" },
      { icon: Activity, label: "Progress", value: formatPercent(r.progressPercentage), note: "Recovery" },
    ];
  }, [selectedCustomerReport]);

  const handleEmployeePdfDownload = useCallback(async () => {
    if (!selectedCustomerReport) return;
    setEmployeePdfLoading(true);
    try {
      await downloadEmployeeLoanReportPdf(selectedCustomerReport, filteredModalSchedule, { generatedAt: new Date() });
    } catch (err) {
      console.error(err);
      window.alert("Could not generate PDF. Check pop-up permissions or try again.");
    } finally {
      setEmployeePdfLoading(false);
    }
  }, [selectedCustomerReport, filteredModalSchedule]);

  const handleEmployeeExcelDownload = useCallback(async () => {
    if (!selectedCustomerReport) return;
    setEmployeeExcelLoading(true);
    try {
      await Promise.resolve();
      downloadEmployeeLoanReportXlsx(selectedCustomerReport, filteredMonthlyHistory, filteredEmployeeTxns);
    } finally {
      setEmployeeExcelLoading(false);
    }
  }, [selectedCustomerReport, filteredMonthlyHistory, filteredEmployeeTxns]);

  const handleEmployeePrint = useCallback(async () => {
    if (!selectedCustomerReport) return;
    setEmployeePrintLoading(true);
    try {
      await printEmployeeLoanReportPdf(selectedCustomerReport, filteredModalSchedule, {
        generatedAt: new Date(),
        origin: typeof window !== "undefined" ? window.location.origin : "",
      });
    } catch (err) {
      console.error(err);
      window.alert("Could not open print dialog. Try downloading the PDF instead.");
    } finally {
      setEmployeePrintLoading(false);
    }
  }, [filteredModalSchedule, selectedCustomerReport]);

  const recentActivityItems = useMemo(() => {
    if (!selectedCustomerReport) return [];
    return selectedCustomerReport.paymentEntries.slice(0, 6).map((e) => ({
      id: e.entryId || e.id || `${e.paymentDate}-${e.amount}`,
      title: `${formatCurrency(e.amount)} · ${e.collectionStatus || "Recorded"}`,
      subtitle: formatDate(e.paymentDate || e.submittedAt),
      meta: e.collectorName || e.createdBy || e.paymentMethod || "",
    }));
  }, [selectedCustomerReport]);

  return (
    <AdminLayout title="Reports" description="">
      <div className="app-grid-page grid gap-5 lg:gap-6">
        {loading ? (
          <div className="app-panel flex items-center gap-3 rounded-[28px] px-5 py-4 text-sm text-slate-600">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading reports...
          </div>
        ) : null}

        {error ? (
          <div className="app-panel rounded-[28px] border border-rose-200 px-5 py-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-2 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Data synced successfully · {customers.filter((c) => !c.isArchived && !c.isDeleted).length} active customers · live Firestore
              </span>
            </div>
            <section className="app-panel min-w-0 space-y-3 p-4 sm:space-y-4 sm:p-5">
              <div className="w-full min-w-0 space-y-3">
                <div className="flex w-full min-w-0 flex-wrap gap-1.5 rounded-2xl border border-slate-200/90 bg-slate-50/40 p-1.5 sm:gap-2 sm:p-2">
                  {RANGE_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => selectRangePreset(p.key)}
                      className={`inline-flex min-h-[38px] shrink-0 items-center justify-center rounded-xl px-2.5 py-1.5 text-center text-[11px] font-semibold transition sm:min-h-[40px] sm:px-3 sm:text-xs ${
                        rangePreset === p.key
                          ? "bg-blue-600 text-white shadow-sm"
                          : "border border-transparent bg-white text-slate-600 hover:border-blue-100 hover:bg-blue-50/80 hover:text-blue-900"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => selectRangePreset("custom")}
                    className={`inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-center text-[11px] font-semibold transition sm:min-h-[40px] sm:px-3 sm:text-xs ${
                      rangePreset === "custom"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "border border-transparent bg-white text-slate-600 hover:border-blue-100 hover:bg-blue-50/80 hover:text-blue-900"
                    }`}
                  >
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                    Custom
                  </button>
                </div>
                {rangePreset === "custom" ? (
                  <div className="grid w-full gap-2 rounded-2xl border border-slate-200/90 bg-slate-50/30 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end sm:gap-3">
                    <label className="block min-w-0 space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">From date</span>
                      <input
                        type="date"
                        value={customFromDraft}
                        onChange={(e) => setCustomFromDraft(e.target.value)}
                        className="app-input h-10 w-full min-w-0 rounded-xl border-slate-200 bg-white text-sm"
                      />
                    </label>
                    <label className="block min-w-0 space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">To date</span>
                      <input
                        type="date"
                        value={customToDraft}
                        onChange={(e) => setCustomToDraft(e.target.value)}
                        className="app-input h-10 w-full min-w-0 rounded-xl border-slate-200 bg-white text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={applyCustomRange}
                      className="app-button-primary inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={resetReportRange}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      Reset
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="reports-summary-scroll min-w-0 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch]">
                <div className="reports-summary-grid grid min-w-[52rem] grid-cols-7 gap-2 xl:min-w-0">
                  {collectionPreviewMetrics.map((m) => (
                    <ReportCard key={m.label} icon={m.icon} label={m.label} value={m.value} accent={m.accent} />
                  ))}
                </div>
              </div>

              <div className="reports-detail-toolbar min-w-0 rounded-2xl border border-slate-200/80 bg-slate-50/50 px-2.5 py-2 sm:px-3">
                <div className="reports-detail-toolbar-row flex w-full min-w-0 flex-wrap items-end gap-2">
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCollectionPreviewOpen(true)}
                      title="View report"
                      className="group inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50/70"
                    >
                      <Eye className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden />
                      View
                    </button>
                    <button
                      type="button"
                      disabled={collectionExcelLoading}
                      onClick={handleCollectionExcelDownload}
                      title="Export Excel"
                      className="app-button-primary inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium transition disabled:pointer-events-none disabled:opacity-60"
                    >
                      {collectionExcelLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                      Excel
                    </button>
                    <button
                      type="button"
                      disabled={collectionPdfLoading}
                      onClick={handleCollectionPdfDownload}
                      title="Export PDF"
                      className="app-button-secondary inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium transition disabled:pointer-events-none disabled:opacity-60"
                    >
                      {collectionPdfLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                      PDF
                    </button>
                    <span
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-2 text-[11px] font-semibold text-emerald-900"
                      title="Live sync"
                    >
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      </span>
                      Sync
                    </span>
                  </div>

                  <div className="reports-detail-toolbar-filters grid min-w-0 flex-1 grid-cols-3 gap-2">
                    <div className="min-w-0">
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Search
                      </label>
                      <div className="relative min-w-0">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          value={detailSearch}
                          onChange={(e) => setDetailSearch(e.target.value)}
                          placeholder="Search"
                          className="app-input reports-detail-toolbar-filter-control reports-detail-toolbar-search w-full rounded-xl bg-white text-xs"
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Main center
                      </label>
                      <select
                        value={centerFilter}
                        onChange={(e) => {
                          setCenterFilter(e.target.value);
                          setSubCenterFilter("All");
                        }}
                        title="Center filter"
                        className="app-select reports-detail-toolbar-filter-control w-full rounded-xl bg-white text-xs"
                      >
                        <option value="All">All centers</option>
                        {dayCenters.map((label) => (
                          <option key={label} value={label}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="min-w-0">
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Sub center
                      </label>
                      <select
                        value={subCenterFilter}
                        onChange={(e) => setSubCenterFilter(e.target.value)}
                        title="Sub-center filter"
                        className="app-select reports-detail-toolbar-filter-control w-full rounded-xl bg-white text-xs"
                        disabled={centerFilter === "All"}
                      >
                        <option value="All">
                          {centerFilter === "All" ? "Select center first" : "All sub-centers"}
                        </option>
                        <option value={NO_SUB_CENTER_LABEL}>{NO_SUB_CENTER_LABEL}</option>
                        {(subCentersByDay.get(centerFilter) || []).map((label) => (
                          <option key={label} value={label}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="app-segmented shrink-0">
                    {[
                      { key: "all", label: "All", count: detailStatusCounts.all },
                      { key: "pending", label: "Pend", count: detailStatusCounts.pending },
                      { key: "due", label: "Due", count: detailStatusCounts.due },
                      { key: "overdue", label: "Over", count: detailStatusCounts.overdue },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setDetailFilter(item.key)}
                        className={`inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-xl px-2 text-[11px] font-medium transition sm:text-xs ${
                          detailFilter === item.key
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span>{item.label}</span>
                        <span
                          className={`tabular-nums text-[10px] font-semibold ${
                            detailFilter === item.key ? "text-white/85" : "text-slate-400"
                          }`}
                        >
                          {item.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="app-table-wrap min-w-0 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white">
                <table className="app-table text-left">
                  <thead className="bg-slate-50/95 backdrop-blur-sm">
                    <tr>
                      <th>Center</th>
                      <th>Sub-center</th>
                      <th>Customer</th>
                      <th>Phone</th>
                      <th>Loan Amount</th>
                      <th>Collected</th>
                      <th>Outstanding</th>
                      <th>Due Date</th>
                      <th>On Time</th>
                      <th>Latest Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDetailRows.length > 0 ? filteredDetailRows.map((row) => (
                      <tr
                        key={row.customerId || `${row.customerName}-${row.phoneNumber}`}
                        onClick={() => {
                          setReportDateFrom("");
                          setReportDateTo("");
                          setReportMonthFilter("all");
                          setReportYearFilter("all");
                          setReportStatusFilter("all");
                          setPaymentSearch("");
                          setModalDetailCenterFilter("All");
                          setTxnSearch("");
                          setTxnApprovalFilter("all");
                          setTxnCollectionFilter("all");
                          setTxnPage(1);
                          setSelectedCustomerId(row.customerId);
                        }}
                        className="cursor-pointer transition hover:bg-slate-50/90"
                      >
                        <td className="text-slate-700">{row.dayCenter || NO_CENTER_LABEL}</td>
                        <td>
                          <span className="inline-flex max-w-[180px] truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                            {row.subCenter || NO_SUB_CENTER_LABEL}
                          </span>
                        </td>
                        <td className="font-semibold text-slate-950">{row.customerName}</td>
                        <td className="text-slate-700">{row.phoneNumber || "--"}</td>
                        <td className="text-slate-700">{formatCurrency(row.loanAmount)}</td>
                        <td className="text-emerald-700">{formatCurrency(row.totalCollected)}</td>
                        <td className="text-amber-700">{formatCurrency(row.outstanding)}</td>
                        <td className="text-slate-700">{row.dueDate || "--"}</td>
                        <td>
                          <span className={`app-chip ${row.onTime === "Yes" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                            {row.onTime}
                          </span>
                        </td>
                        <td className="text-slate-700">{row.latestStatus}</td>
                        <td>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReportDateFrom("");
                              setReportDateTo("");
                              setReportMonthFilter("all");
                              setReportYearFilter("all");
                              setReportStatusFilter("all");
                              setPaymentSearch("");
                              setModalDetailCenterFilter("All");
                              setTxnSearch("");
                              setTxnApprovalFilter("all");
                              setTxnCollectionFilter("all");
                              setTxnPage(1);
                              setSelectedCustomerId(row.customerId);
                            }}
                            className="app-button-secondary inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="11" className="py-8 text-center text-sm text-slate-500">No rows.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>

      <EnterpriseReportPreview
        open={collectionPreviewOpen}
        onClose={() => setCollectionPreviewOpen(false)}
        title="Collection report"
        subtitle={`Portfolio · ${report.periodLabel}`}
        generatedAt={collectionReportMeta.generatedLabel}
        filterLines={collectionPreviewFilterLines}
        metrics={collectionPreviewMetrics}
        columns={collectionPreviewColumns}
        rows={collectionPreviewRows}
        pageSize={15}
        reportMeta={collectionReportMeta}
        pdfLoading={collectionPdfLoading}
        excelLoading={collectionExcelLoading}
        printLoading={collectionPrintLoading}
        onDownloadPdf={handleCollectionPdfDownload}
        onDownloadExcel={handleCollectionExcelDownload}
        onPrint={handleCollectionPrint}
        shareTitle="Collection report — Ruthra"
      />

      <EnterpriseReportPreview
        open={employeePreviewOpen && !!selectedCustomerReport}
        onClose={() => setEmployeePreviewOpen(false)}
        title="Employee loan report"
        subtitle={selectedCustomerReport ? `${selectedCustomerReport.customerName} · ${selectedCustomerReport.loanId || "Loan"}` : ""}
        generatedAt={employeeReportMeta.generatedLabel}
        filterLines={employeePreviewFilterLines}
        metrics={employeePreviewMetrics}
        columns={employeeSchedulePreviewColumns}
        rows={employeeSchedulePreviewRows}
        pageSize={12}
        reportMeta={employeeReportMeta}
        pdfLoading={employeePdfLoading}
        excelLoading={employeeExcelLoading}
        printLoading={employeePrintLoading}
        onDownloadPdf={handleEmployeePdfDownload}
        onDownloadExcel={handleEmployeeExcelDownload}
        onPrint={handleEmployeePrint}
        shareTitle="Employee loan report — Ruthra"
      />

      {selectedCustomerReport ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-6">
          <button
            type="button"
            aria-label="Close employee loan details"
            onClick={() => setSelectedCustomerId("")}
            className="absolute inset-0"
          />
          <div
            className="relative z-10 max-h-[95vh] w-full max-w-7xl overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow)] transition-all duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-loan-details-title"
          >
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(37,99,235,0.06),rgba(20,184,166,0.1))] px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-gradient-to-br from-blue-600 to-teal-500 text-base font-bold tracking-tight text-white shadow-md"
                    aria-hidden
                  >
                    {getInitials(selectedCustomerReport.customerName)}
                  </div>
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <BrandLogo variant="sm" className="hidden shrink-0 sm:block" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600">Employee Loan Details</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <h3 id="employee-loan-details-title" className="text-xl font-semibold text-slate-950">{selectedCustomerReport.customerName}</h3>
                        <span
                          className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${loanDisplayStatusChipClass(selectedCustomerReport.loanDisplayStatus)}`}
                        >
                          {selectedCustomerReport.loanDisplayStatus}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedCustomerReport.customerId} · {selectedCustomerReport.phoneNumber}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {selectedCustomerReport.dayCenter}
                        {selectedCustomerReport.subCenter !== "--" ? ` · ${selectedCustomerReport.subCenter}` : ""}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEmployeePreviewOpen(true)}
                    className="group inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/70 hover:text-blue-900"
                  >
                    <Eye className="h-4 w-4 shrink-0 text-blue-600 transition group-hover:scale-105" aria-hidden />
                    View Report
                  </button>
                  <button
                    type="button"
                    disabled={employeeExcelLoading}
                    onClick={handleEmployeeExcelDownload}
                    className="app-button-primary inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-medium disabled:pointer-events-none disabled:opacity-60"
                  >
                    {employeeExcelLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                    Excel
                  </button>
                  <button
                    type="button"
                    disabled={employeePdfLoading}
                    onClick={handleEmployeePdfDownload}
                    className="app-button-secondary inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-medium disabled:pointer-events-none disabled:opacity-60"
                  >
                    {employeePdfLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await printEmployeeLoanReportPdf(selectedCustomerReport, filteredModalSchedule, {
                          generatedAt: new Date(),
                        });
                      } catch (err) {
                        console.error(err);
                        window.alert("Could not open print view. Allow pop-ups or use Save as PDF.");
                      }
                    }}
                    className="app-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium"
                  >
                    <Printer className="h-4 w-4" />
                    Print Employee Report
                  </button>
                  <button
                    type="button"
                    aria-label="Close employee loan details"
                    onClick={() => setSelectedCustomerId("")}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="max-h-[calc(95vh-88px)] overflow-y-auto bg-[var(--app-bg)] px-4 py-4 sm:px-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <ModalCard icon={CircleDollarSign} label="Total Loan Amount" value={formatCurrency(selectedCustomerReport.loanAmount)} note={`Interest ${formatCurrency(selectedCustomerReport.interestAmount)}`} />
                <ModalCard icon={Wallet} label="Total Amount Paid" value={formatCurrency(selectedCustomerReport.totalCollected)} note={`EMI ${formatCurrency(selectedCustomerReport.emiAmount)}`} tone="text-emerald-700" />
                <ModalCard icon={Clock3} label="Remaining Balance" value={formatCurrency(selectedCustomerReport.pendingAmount)} note={`Overdue ${formatCurrency(selectedCustomerReport.overdueAmount)}`} tone="text-amber-700" />
                <ModalCard icon={CheckCircle2} label="Total Months Paid" value={String(selectedCustomerReport.totalMonthsPaid ?? 0)} note="Fully paid schedule months" tone="text-emerald-700" />
                <ModalCard icon={History} label="Pending Months" value={String(selectedCustomerReport.pendingMonths ?? 0)} note="Outstanding / partial / overdue" tone="text-amber-800" />
                <ModalCard icon={CalendarDays} label="Last Payment Date" value={selectedCustomerReport.lastPaymentDate ? formatDate(selectedCustomerReport.lastPaymentDate) : "—"} note="Latest approved collection" />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <ModalCard icon={AlertTriangle} label="Overdue Exposure" value={formatCurrency(selectedCustomerReport.overdueAmount)} note="Sum of overdue installments" tone="text-rose-700" />
                <ModalCard icon={BarChart3} label="Recovery Progress" value={formatPercent(selectedCustomerReport.progressPercentage)} note="Paid vs total payable" tone="text-violet-700" />
                <ModalCard icon={TrendingUp} label="Installments" value={`${selectedCustomerReport.completedPayments} / ${selectedCustomerReport.schedule.length}`} note={`Remaining ${selectedCustomerReport.remainingInstallments}`} />
              </div>

              <section className="app-panel mt-4 rounded-[24px] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Monthly payment timeline</p>
                      <h4 className="mt-1 text-lg font-semibold text-slate-950">Paid amounts by period</h4>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    { label: "This month", value: selectedCustomerReport.monthlyPaymentBuckets?.thisMonth },
                    { label: "Last month", value: selectedCustomerReport.monthlyPaymentBuckets?.lastMonth },
                    { label: "Last 3 months", value: selectedCustomerReport.monthlyPaymentBuckets?.last3 },
                    { label: "Last 6 months", value: selectedCustomerReport.monthlyPaymentBuckets?.last6 },
                    { label: "Last 10 months", value: selectedCustomerReport.monthlyPaymentBuckets?.last10 },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-4 py-3 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(item.value)}</p>
                    </div>
                  ))}
                </div>
              </section>

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <section className="app-panel rounded-[24px] p-4">
                  <div className="flex items-center gap-3">
                    <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Employee basic information</p>
                      <h4 className="mt-1 text-lg font-semibold text-slate-950">Loan and profile summary</h4>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">Employee Name</p>
                      <p className="mt-1 font-semibold text-slate-950">{selectedCustomerReport.customerName}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">Employee ID</p>
                      <p className="mt-1 font-semibold text-slate-950">{selectedCustomerReport.customerId}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">Phone Number</p>
                      <p className="mt-1 font-semibold text-slate-950">{selectedCustomerReport.phoneNumber}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">Center Name</p>
                      <p className="mt-1 font-semibold text-slate-950">{selectedCustomerReport.dayCenter}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">Sub-Center Name</p>
                      <p className="mt-1 font-semibold text-slate-950">{selectedCustomerReport.subCenter}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">Loan ID</p>
                      <p className="mt-1 font-semibold text-slate-950">{selectedCustomerReport.loanId}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">Loan Amount</p>
                      <p className="mt-1 font-semibold text-slate-950">{formatCurrency(selectedCustomerReport.loanAmount)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">Interest</p>
                      <p className="mt-1 font-semibold text-slate-950">{formatCurrency(selectedCustomerReport.interestAmount)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">Total Payable</p>
                      <p className="mt-1 font-semibold text-slate-950">{formatCurrency(selectedCustomerReport.totalPayable)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">Loan Taken Date</p>
                      <p className="mt-1 font-semibold text-slate-950">{formatDate(selectedCustomerReport.loanStartDate)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">Loan End Date</p>
                      <p className="mt-1 font-semibold text-slate-950">{formatDate(selectedCustomerReport.loanEndDate)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">Due Date</p>
                      <p className="mt-1 font-semibold text-slate-950">{formatDate(selectedCustomerReport.dueDate)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">Loan Status</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-950">{selectedCustomerReport.loanDisplayStatus}</span>
                        <span className="text-xs text-slate-400">({selectedCustomerReport.loanStatus})</span>
                      </p>
                    </div>
                  </div>
                </section>

                <section className="app-panel rounded-[24px] p-4">
                  <div className="flex items-center gap-3">
                    <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
                      <BarChart3 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Collection Performance Chart</p>
                      <h4 className="mt-1 text-lg font-semibold text-slate-950">Loan recovery and balance</h4>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <PerformanceBar label="Collected" value={selectedCustomerReport.totalCollected} total={selectedCustomerReport.totalPayable} tone="bg-gradient-to-r from-emerald-500 to-teal-500" />
                    <PerformanceBar label="Pending" value={selectedCustomerReport.pendingAmount} total={selectedCustomerReport.totalPayable} tone="bg-gradient-to-r from-amber-500 to-orange-500" />
                    <PerformanceBar label="Overdue" value={selectedCustomerReport.overdueAmount} total={selectedCustomerReport.totalPayable} tone="bg-gradient-to-r from-rose-500 to-red-500" />
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">EMI progress percentage</p>
                      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500"
                          style={{ width: `${Math.max(selectedCustomerReport.progressPercentage, 4)}%` }}
                        />
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{formatPercent(selectedCustomerReport.progressPercentage)} recovered</p>
                    </div>
                  </div>
                </section>
              </div>

              <section className="app-panel mt-4 rounded-[24px] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Advanced filters</p>
                      <h4 className="mt-1 text-lg font-semibold text-slate-950">Month-wise and transaction views</h4>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
                  <input
                    value={paymentSearch}
                    onChange={(event) => setPaymentSearch(event.target.value)}
                    placeholder="Search month-wise (collector, status)"
                    className="app-input h-10 w-full bg-slate-50"
                  />
                  <input
                    value={txnSearch}
                    onChange={(event) => setTxnSearch(event.target.value)}
                    placeholder="Search transactions (receipt, method…)"
                    className="app-input h-10 w-full bg-slate-50"
                  />
                  <input type="date" value={reportDateFrom} onChange={(event) => setReportDateFrom(event.target.value)} className="app-input h-10" title="From date" />
                  <input type="date" value={reportDateTo} onChange={(event) => setReportDateTo(event.target.value)} className="app-input h-10" title="To date" />
                  <select value={reportMonthFilter} onChange={(event) => setReportMonthFilter(event.target.value)} className="app-select h-10">
                    <option value="all">All months</option>
                    {modalMonthOptions.map((key) => (
                      <option key={key} value={key}>{formatMonthLabel(key)}</option>
                    ))}
                  </select>
                  <select value={reportYearFilter} onChange={(event) => setReportYearFilter(event.target.value)} className="app-select h-10">
                    <option value="all">All years</option>
                    {modalYearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <select value={modalDetailCenterFilter} onChange={(event) => setModalDetailCenterFilter(event.target.value)} className="app-select h-10">
                    <option value="All">All centers</option>
                    {dayCenters.map((label) => (
                      <option key={label} value={label}>{label}</option>
                    ))}
                  </select>
                  <select value={reportStatusFilter} onChange={(event) => setReportStatusFilter(event.target.value)} className="app-select h-10">
                    <option value="all">Month payment status</option>
                    <option value="completed">Completed</option>
                    <option value="partial">Partial</option>
                    <option value="pending">Pending</option>
                    <option value="overdue">Overdue</option>
                    <option value="skipped">Skipped</option>
                    <option value="late paid">Late paid</option>
                  </select>
                  <select value={txnApprovalFilter} onChange={(event) => setTxnApprovalFilter(event.target.value)} className="app-select h-10">
                    <option value="all">Txn approval</option>
                    <option value="approved">Approved</option>
                    <option value="pending">Pending approval</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <select value={txnCollectionFilter} onChange={(event) => setTxnCollectionFilter(event.target.value)} className="app-select h-10">
                    <option value="all">Collection status</option>
                    <option value="collected">Collected</option>
                    <option value="skipped">Skipped</option>
                  </select>
                </div>
                {modalDetailCenterFilter !== "All" && modalDetailCenterFilter !== selectedCustomerReport.dayCenter ? (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Center filter does not match this employee&apos;s assigned center ({selectedCustomerReport.dayCenter}). Choose &quot;All centers&quot; or matching center to load data.
                  </p>
                ) : null}
              </section>

              <section className="app-panel mt-4 rounded-[24px] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Full payment transaction history</p>
                      <h4 className="mt-1 text-lg font-semibold text-slate-950">Every collection entry (newest first)</h4>
                    </div>
                  </div>
                </div>
                <div className="mt-4 max-h-[min(440px,55vh)] overflow-auto rounded-2xl border border-slate-200">
                  <table className="app-table min-w-[960px] text-left">
                    <thead className="sticky top-0 z-[2] shadow-[0_1px_0_#e2e8f0] [&_th]:bg-slate-50">
                      <tr>
                        <th>S.No</th>
                        <th>Payment Date</th>
                        <th>Month</th>
                        <th>Paid Amount</th>
                        <th>Pending Amount</th>
                        <th>Payment Method</th>
                        <th>Collected By</th>
                        <th>Receipt No</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedEmployeeTxns.length > 0 ? paginatedEmployeeTxns.map((row) => (
                        <tr key={`txn-${row.displaySno}-${row.paymentDate}-${row.receiptNo}-${row.entryId}`}>
                          <td className="font-medium text-slate-600">{row.displaySno}</td>
                          <td className="text-slate-800">{formatDate(row.paymentDate)}</td>
                          <td className="text-slate-700">{row.monthLabel}</td>
                          <td className="text-emerald-700">{formatCurrency(row.paidAmount)}</td>
                          <td className="text-amber-800">{formatCurrency(row.pendingBalanceAfter)}</td>
                          <td className="text-slate-700">{row.paymentMethod}</td>
                          <td className="text-slate-700">{row.collectedBy}</td>
                          <td className="font-mono text-xs text-slate-600">{row.receiptNo}</td>
                          <td>
                            <span className="text-xs font-medium text-slate-700">{row.status}</span>
                            <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-slate-400">{row.approvalStatus}</span>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan="9" className="py-10 text-center text-sm text-slate-500">
                            No transactions match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                  <span>
                    {filteredEmployeeTxns.length
                      ? `Showing ${(Math.min(txnPage, txnTotalPages) - 1) * EMPLOYEE_TXN_PAGE_SIZE + 1}–${Math.min(Math.min(txnPage, txnTotalPages) * EMPLOYEE_TXN_PAGE_SIZE, filteredEmployeeTxns.length)} of ${filteredEmployeeTxns.length} entries`
                      : "0 entries"}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={txnPage <= 1}
                      onClick={() => setTxnPage((p) => Math.max(1, p - 1))}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-xs font-semibold text-slate-500">
                      Page {Math.min(txnPage, txnTotalPages)} / {txnTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={txnPage >= txnTotalPages}
                      onClick={() => setTxnPage((p) => Math.min(txnTotalPages, p + 1))}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </section>

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
                <section className="app-panel rounded-[24px] p-4">
                  <div className="flex items-center gap-3">
                    <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
                      <History className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Payment History</p>
                      <h4 className="mt-1 text-lg font-semibold text-slate-950">Full repayment history month-wise</h4>
                    </div>
                  </div>
                  <div className="app-table-wrap mt-4">
                    <table className="app-table text-left">
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Due Amount</th>
                          <th>Paid Amount</th>
                          <th>Pending</th>
                          <th>Payment Date</th>
                          <th>Collected By</th>
                          <th>Status</th>
                          <th>Late</th>
                          <th>Skipped</th>
                          <th>Penalty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMonthlyHistory.length > 0 ? filteredMonthlyHistory.map((row) => {
                          const doneMonth = row.status === "Completed" || row.status === "Late paid";
                          const overdueMonth = row.status === "Overdue";
                          const rowBg = doneMonth ? "bg-emerald-50/50" : overdueMonth ? "bg-rose-50/50" : "";
                          return (
                          <tr key={row.monthKey} className={rowBg}>
                            <td className="font-semibold text-slate-950">{row.monthLabel}</td>
                            <td className="text-slate-700">{formatCurrency(row.dueAmount)}</td>
                            <td className="text-emerald-700">{formatCurrency(row.paidAmount)}</td>
                            <td className="text-amber-700">{formatCurrency(row.pendingAmount)}</td>
                            <td className="text-slate-700">{formatDate(row.paymentDate)}</td>
                            <td className="text-slate-700">{row.collectedBy}</td>
                            <td>
                              <span className={`app-chip ${
                                row.status === "Completed" || row.status === "Paid"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : row.status === "Overdue"
                                    ? "bg-rose-100 text-rose-700"
                                    : row.status === "Late paid"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-slate-100 text-slate-700"
                              }`}>
                                {row.status}
                              </span>
                            </td>
                            <td className="text-slate-700">{row.lateCount ? `${row.lateCount} late` : "--"}</td>
                            <td className="text-slate-700">{row.skippedPayments || 0}</td>
                            <td className="text-slate-700">{formatCurrency(row.penaltyCharges || 0)}</td>
                          </tr>
                          );
                        }) : (
                          <tr>
                            <td colSpan="10" className="py-8 text-center text-sm text-slate-500">No payment history for the selected filter.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="grid gap-4">
                  <section className="app-panel rounded-[24px] p-4">
                    <div className="flex items-center gap-3">
                      <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
                        <BarChart3 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Monthly Repayment Graph</p>
                        <h4 className="mt-1 text-lg font-semibold text-slate-950">Due vs paid by month</h4>
                      </div>
                    </div>
                    <div className="mt-4">
                      <MonthlyRepaymentGraph rows={filteredMonthlyHistory} />
                    </div>
                  </section>

                  <section className="app-panel rounded-[24px] p-4">
                    <div className="flex items-center gap-3">
                      <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Collection Timeline</p>
                        <h4 className="mt-1 text-lg font-semibold text-slate-950">Repayment and overdue flow</h4>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {filteredTimeline.length > 0 ? filteredTimeline.map((item) => (
                        <div key={item.id} className={`rounded-2xl border px-4 py-3 ${item.tone}`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{item.title}</p>
                              <p className="mt-1 text-xs opacity-80">{item.subtitle}</p>
                              <p className="mt-1 text-xs opacity-70">{item.meta}</p>
                            </div>
                            <span className="rounded-full border border-current/20 bg-white/70 px-3 py-1 text-[11px] font-semibold">
                              {formatDate(item.date)}
                            </span>
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                          No timeline records for the selected filter.
                        </div>
                      )}
                    </div>
                  </section>
                </section>
              </div>

              <section className="app-panel mt-4 rounded-[24px] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
                      <Activity className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Recent activity</p>
                      <h4 className="mt-1 text-lg font-semibold text-slate-950">Latest collections on file</h4>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {recentActivityItems.length > 0 ? recentActivityItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p>
                      {item.meta ? <p className="mt-1 text-[11px] text-slate-400">{item.meta}</p> : null}
                    </div>
                  )) : (
                    <p className="text-sm text-slate-500">No recent collection entries.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}
