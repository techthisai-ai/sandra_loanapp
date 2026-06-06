import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  BarChart3,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Download,
  Eye,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import PremiumKpiCard from "../components/dashboard/PremiumKpiCard";
import EnterpriseReportPreview from "../components/reports/EnterpriseReportPreview.jsx";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import useAuth from "../hooks/useAuth";
import useReportMeta from "../hooks/useReportMeta";
import useWalletAvailable from "../hooks/useWalletAvailable";
import {
  isTransactionOthersSelection,
  resolveTransactionCategoryForSave,
  transactionCategoryFieldsFromRecord,
  TRANSACTION_CATEGORY_OTHERS_LABEL,
  TRANSACTION_CATEGORY_OTHERS_VALUE,
} from "../utils/accountsTransactionCategory";
import { isBookedLoanCustomer, sumInvestorDeposits } from "../utils/walletLedgerBalance";
import {
  buildPreviewColumnsPdfPayload,
  buildSimpleTablePdfPayload,
  downloadEnterpriseTabularPdf,
  printEnterpriseTabularPdf,
} from "../utils/enterpriseTabularReportPdf";
import {
  createAccountsCategory,
  createAccountsTransaction,
  createSalaryRecord,
  deleteAccountsCategory,
  deleteAccountsReportSnapshot,
  deleteAccountsTransaction,
  deleteSalaryRecord,
  ensureDefaultAccountsCategories,
  EXPENSE_CATEGORY_SEEDS,
  INCOME_SOURCE_SEEDS,
  saveAccountsReportSnapshot,
  SALARY_PAYMENT_STATUSES,
  subscribeAccountsCategories,
  subscribeAccountsReports,
  subscribeAccountsSalary,
  subscribeAccountsTransactions,
  TRANSACTION_PAYMENT_METHODS,
  TRANSACTION_STATUSES,
  updateAccountsTransaction,
  updateSalaryRecord,
} from "../services/accounts";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "transactions", label: "Transactions" },
  { key: "salary", label: "Salary" },
  { key: "reports", label: "Reports" },
];

const VALID_TAB_KEYS = new Set(TABS.map((item) => item.key));

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `Rs ${amount.toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMonthLabel(value) {
  if (!value) return "--";
  const date = new Date(`${value}-01`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date) {
  const next = startOfDay(date);
  const diff = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - diff);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

/** Office dashboard date range — never mixes loan dates. */
function computeOfficeDateBounds(preset, customFromStr, customToStr) {
  const now = new Date();
  const todayStart = startOfDay(now);
  if (preset === "today") {
    return { start: todayStart, end: endOfDay(now), label: "Today" };
  }
  if (preset === "yesterday") {
    const y = new Date(todayStart);
    y.setDate(y.getDate() - 1);
    return { start: startOfDay(y), end: endOfDay(y), label: "Yesterday" };
  }
  if (preset === "this_week") {
    return { start: startOfWeek(now), end: endOfDay(now), label: "This week" };
  }
  if (preset === "this_month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: endOfDay(now),
      label: "This month",
    };
  }
  const from = getDateValue(customFromStr);
  const to = getDateValue(customToStr);
  if (!customFromStr || !customToStr || !from || !to || startOfDay(from) > endOfDay(to)) {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: endOfDay(now),
      label: "This month",
    };
  }
  return {
    start: startOfDay(from),
    end: endOfDay(to),
    label: `${customFromStr} → ${customToStr}`,
  };
}

function isDateInOfficeRange(date, rangeStart, rangeEnd) {
  if (!date || !rangeStart || !rangeEnd) return false;
  const t = date.getTime();
  return t >= rangeStart.getTime() && t <= rangeEnd.getTime();
}

function endOfWeek(date) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 7);
  return next;
}

function monthKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getDateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function matchesSearch(value, query) {
  return String(value || "").toLowerCase().includes(query.toLowerCase());
}

function rowsToCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const rawValue = String(cell ?? "");
          const value = /^[=+\-@]/.test(rawValue) ? `'${rawValue}` : rawValue;
          if (value.includes(",") || value.includes('"') || value.includes("\n")) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(",")
    )
    .join("\n");
}

function downloadTextFile(filename, content, type = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const ACCOUNTS_COMPANY_NAME = "Ruthra Financial Solutions";

function accountsExportDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function openPrintableReport({ title, subtitle, columns, rows, reportMeta }) {
  void printEnterpriseTabularPdf(
    buildSimpleTablePdfPayload({
      title,
      subtitle,
      columns,
      rows,
      reportMeta,
    })
  );
}

function getStatusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "completed" || value === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "pending" || value === "processing") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function paginate(items, page, pageSize) {
  const totalPages = Math.max(Math.ceil(items.length / pageSize), 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    totalPages,
    page: safePage,
    items: items.slice(start, start + pageSize),
  };
}

function emptyTransactionForm(type = "expense", category = "", customCategory = "") {
  return {
    date: new Date().toISOString().slice(0, 10),
    transactionType: type,
    category,
    customCategory,
    amount: "",
    paymentMethod: "Cash",
    referenceNumber: "",
    partyName: "",
    description: "",
    attachmentName: "",
    status: "completed",
    isRecurring: false,
    recurringFrequency: "none",
  };
}

function emptySalaryForm() {
  return {
    employeeName: "",
    employeeId: "",
    department: "",
    salaryMonth: new Date().toISOString().slice(0, 7),
    basicSalary: "",
    bonus: "",
    deduction: "",
    paymentStatus: "pending",
    paymentDate: "",
    description: "",
  };
}

function emptyCategoryForm(type = "expense") {
  return {
    name: "",
    categoryType: type,
  };
}

function StatCard({ icon: Icon, label, value, hint, tone = "text-slate-950" }) {
  return (
    <div className="app-panel-muted rounded-[22px] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
          <p className={`mt-1.5 text-xl font-semibold ${tone}`}>{value}</p>
          {hint ? <p className="mt-1.5 text-xs leading-5 text-slate-500">{hint}</p> : null}
        </div>
        <div className="app-icon-shell flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/70">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, eyebrow, actions, children, icon: Icon }) {
  return (
    <section className="app-panel rounded-[24px] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon ? (
            <div className="app-icon-shell flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/70">
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600">{eyebrow}</p> : null}
            <h3 className="mt-1 text-lg font-semibold text-slate-950">{title}</h3>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatusBadge({ value }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${getStatusTone(value)}`}>
      {value || "--"}
    </span>
  );
}

function PaginationControls({ page, totalPages, onChange }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
      <p className="text-xs text-slate-500">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(page - 1, 1))}
          disabled={page <= 1}
          className="app-button-secondary rounded-xl px-3 py-2 text-xs font-medium disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(page + 1, totalPages))}
          disabled={page >= totalPages}
          className="app-button-secondary rounded-xl px-3 py-2 text-xs font-medium disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function EmptyState({ message }) {
  return <div className="app-empty-state">{message}</div>;
}

function TrendGraph({ data, compact = false }) {
  if (data.length === 0) {
    return <EmptyState message="Trend graph will appear after monthly data is available." />;
  }
  const values = data.map((item) => Number(item.value || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const points = data.map((item, index) => {
    const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
    const y = 100 - ((Number(item.value || 0) - min) / span) * 100;
    return `${x},${y}`;
  });

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50/80 to-white p-4">
        <svg viewBox="0 0 100 100" className={`w-full ${compact ? "h-32" : "h-40"}`}>
          <polyline
            fill="none"
            stroke="url(#profitGradient)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points.join(" ")}
          />
          <defs>
            <linearGradient id="profitGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#14b8a6" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      {!compact ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {data.map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm">
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className={`mt-1 text-sm font-semibold ${item.value >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {formatCurrency(item.value)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Accounts() {
  const { user, profile } = useAuth();
  const accountsReportMeta = useReportMeta("RFS-ACC");
  const { customers, entries } = useLoanDataSync();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab = tabParam && VALID_TAB_KEYS.has(tabParam) ? tabParam : "overview";
  const todayLabel = new Date().toISOString().slice(0, 10);

  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [salaryRecords, setSalaryRecords] = useState([]);
  const [reportSnapshots, setReportSnapshots] = useState([]);
  const [ready, setReady] = useState({ transactions: false, categories: false, salary: false, reports: false });
  const [loadError, setLoadError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [exportPdfLoading, setExportPdfLoading] = useState(false);
  const [exportExcelLoading, setExportExcelLoading] = useState(false);
  const [exportError, setExportError] = useState("");
  const [accountsAnalyticsPreviewOpen, setAccountsAnalyticsPreviewOpen] = useState(false);
  const [salaryReportPreviewOpen, setSalaryReportPreviewOpen] = useState(false);
  const [analyticsPreviewPdfLoading, setAnalyticsPreviewPdfLoading] = useState(false);
  const [analyticsPreviewExcelLoading, setAnalyticsPreviewExcelLoading] = useState(false);
  const [salaryPreviewPdfLoading, setSalaryPreviewPdfLoading] = useState(false);
  const [salaryPreviewExcelLoading, setSalaryPreviewExcelLoading] = useState(false);
  const [accountsOverviewPreviewOpen, setAccountsOverviewPreviewOpen] = useState(false);
  const [overviewPreviewPdfLoading, setOverviewPreviewPdfLoading] = useState(false);
  const [overviewPreviewExcelLoading, setOverviewPreviewExcelLoading] = useState(false);
  const [overviewPrintLoading, setOverviewPrintLoading] = useState(false);
  const [analyticsPrintLoading, setAnalyticsPrintLoading] = useState(false);
  const [salaryPrintLoading, setSalaryPrintLoading] = useState(false);

  const [transactionForm, setTransactionForm] = useState(emptyTransactionForm());
  const [editingTransactionId, setEditingTransactionId] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionTypeFilter, setTransactionTypeFilter] = useState("all");
  const [transactionStatusFilter, setTransactionStatusFilter] = useState("all");
  const [transactionCategoryFilter, setTransactionCategoryFilter] = useState("all");
  const [transactionMonthFilter, setTransactionMonthFilter] = useState("all");
  const [transactionPage, setTransactionPage] = useState(1);

  const [salaryForm, setSalaryForm] = useState(emptySalaryForm());
  const [editingSalaryId, setEditingSalaryId] = useState("");
  const [salaryError, setSalaryError] = useState("");
  const [salarySearch, setSalarySearch] = useState("");
  const [salaryStatusFilter, setSalaryStatusFilter] = useState("all");
  const [salaryMonthFilter, setSalaryMonthFilter] = useState("all");
  const [salaryPage, setSalaryPage] = useState(1);

  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm());
  const [categoryError, setCategoryError] = useState("");

  const [reportTypeFilter, setReportTypeFilter] = useState("all");
  const [reportPage, setReportPage] = useState(1);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);

  /** Office-only reporting range (income / expense / salary / exports) — separate from loan module. */
  const [officeDatePreset, setOfficeDatePreset] = useState("this_month");
  const [officeCustomFrom, setOfficeCustomFrom] = useState("");
  const [officeCustomTo, setOfficeCustomTo] = useState("");
  const [officeAppliedCustomFrom, setOfficeAppliedCustomFrom] = useState("");
  const [officeAppliedCustomTo, setOfficeAppliedCustomTo] = useState("");

  const actor = useMemo(
    () => ({
      uid: user?.uid || "",
      name: profile?.displayName || profile?.email || "Admin",
      role: profile?.role || "admin",
    }),
    [profile, user]
  );

  useEffect(() => {
    if (!user?.uid) return undefined;
    setLoadError("");
    setReady({ transactions: false, categories: false, salary: false, reports: false });

    ensureDefaultAccountsCategories(actor).catch((error) => {
      setLoadError(error.message || "Unable to initialise accounts categories");
    });

    const markReady = (key) => setReady((current) => ({ ...current, [key]: true }));
    const onError = (error) => setLoadError(error.message || "Unable to load accounts data");

    const unsubTransactions = subscribeAccountsTransactions((items) => {
      setTransactions(items);
      markReady("transactions");
    }, onError);
    const unsubCategories = subscribeAccountsCategories((items) => {
      setCategories(items);
      markReady("categories");
    }, onError);
    const unsubSalary = subscribeAccountsSalary((items) => {
      setSalaryRecords(items);
      markReady("salary");
    }, onError);
    const unsubReports = subscribeAccountsReports((items) => {
      setReportSnapshots(items);
      markReady("reports");
    }, onError);

    return () => {
      unsubTransactions();
      unsubCategories();
      unsubSalary();
      unsubReports();
    };
  }, [actor, user?.uid]);

  const setTab = (nextTab) => {
    setSearchParams(nextTab === "overview" ? {} : { tab: nextTab });
  };

  function applyOfficeDatePreset(presetKey) {
    setOfficeDatePreset(presetKey);
    setExportError("");
  }

  function applyOfficeCustomRange() {
    const from = getDateValue(officeCustomFrom);
    const to = getDateValue(officeCustomTo);
    if (!officeCustomFrom || !officeCustomTo) {
      setExportError("Select both From and To dates.");
      setTimeout(() => setExportError(""), 4500);
      return;
    }
    if (!from || !to || startOfDay(from) > endOfDay(to)) {
      setExportError("From date must be on or before To date.");
      setTimeout(() => setExportError(""), 4500);
      return;
    }
    setOfficeAppliedCustomFrom(officeCustomFrom);
    setOfficeAppliedCustomTo(officeCustomTo);
    setOfficeDatePreset("custom");
    setExportError("");
  }

  function resetOfficeDateFilter() {
    setOfficeDatePreset("this_month");
    setOfficeCustomFrom("");
    setOfficeCustomTo("");
    setOfficeAppliedCustomFrom("");
    setOfficeAppliedCustomTo("");
    setExportError("");
  }

  const isReady = Object.values(ready).every(Boolean);
  const today = startOfDay(new Date());
  const currentMonth = monthKey(new Date());

  const officeAppliedBounds = useMemo(() => {
    const customFrom = officeDatePreset === "custom" ? officeAppliedCustomFrom : "";
    const customTo = officeDatePreset === "custom" ? officeAppliedCustomTo : "";
    return computeOfficeDateBounds(officeDatePreset, customFrom, customTo);
  }, [officeDatePreset, officeAppliedCustomFrom, officeAppliedCustomTo]);

  const { balance: liveWalletBalance, opening: cashOpening, walletRows } = useWalletAvailable();
  const investorDepositsTotal = useMemo(() => sumInvestorDeposits(walletRows), [walletRows]);

  /** Loan KPIs on Overview only — never mixed into office income/expense totals. */
  const loanFinanceMetrics = useMemo(() => {
    const activeLoans = customers.filter((customer) => isBookedLoanCustomer(customer));
    const approvedCollections = entries.filter((entry) => entry.approvalStatus === "approved");
    const approvedByCustomer = approvedCollections.reduce((acc, entry) => {
      const customerId = entry.customerId || "unknown";
      acc[customerId] = (acc[customerId] || 0) + Number(entry.amount || 0);
      return acc;
    }, {});
    const totalPrincipal = activeLoans.reduce((sum, customer) => sum + Number(customer.loanAmount || 0), 0);
    const pendingRecovery = activeLoans.reduce((sum, customer) => {
      const collected = approvedByCustomer[customer.customerId] || 0;
      return sum + Math.max(Number(customer.totalPayable || 0) - collected, 0);
    }, 0);
    return {
      activeLoanCount: activeLoans.length,
      totalPrincipalDisbursed: totalPrincipal,
      pendingRecovery,
    };
  }, [customers, entries]);

  const walletHealthLine = useMemo(() => {
    const cashInHand = liveWalletBalance;
    if (cashInHand < 0) return "Low liquidity · negative balance";
    if (cashInHand === 0) return "Low liquidity · add capital";
    if (cashInHand < loanFinanceMetrics.pendingRecovery * 0.15) return "Watch liquidity vs pending recovery";
    return "Healthy wallet buffer";
  }, [liveWalletBalance, loanFinanceMetrics.pendingRecovery]);

  const completeTransactions = transactions.filter((item) => item.status === "completed");
  const completeIncomeTransactions = completeTransactions.filter((item) => item.transaction_type === "income");
  const completeExpenseTransactions = completeTransactions.filter((item) => item.transaction_type === "expense");
  const paidSalaryRecords = salaryRecords.filter((item) => item.payment_status === "paid");

  const overviewMetrics = useMemo(() => {
    const rangeStart = officeAppliedBounds.start;
    const rangeEnd = officeAppliedBounds.end;

    const todayIncome = completeIncomeTransactions.reduce((sum, transaction) => {
      const date = getDateValue(transaction.date);
      return date && startOfDay(date).getTime() === today.getTime() ? sum + Number(transaction.amount || 0) : sum;
    }, 0);

    const todayExpense =
      completeExpenseTransactions.reduce((sum, transaction) => {
        const date = getDateValue(transaction.date);
        return date && startOfDay(date).getTime() === today.getTime() ? sum + Number(transaction.amount || 0) : sum;
      }, 0) +
      paidSalaryRecords.reduce((sum, item) => {
        const date = getDateValue(item.payment_date || `${item.salary_month}-01`);
        return date && startOfDay(date).getTime() === today.getTime() ? sum + Number(item.final_salary || 0) : sum;
      }, 0);

    const monthlyIncome = completeIncomeTransactions.reduce((sum, transaction) => {
      return monthKey(transaction.date) === currentMonth ? sum + Number(transaction.amount || 0) : sum;
    }, 0);

    const monthlyExpense =
      completeExpenseTransactions.reduce((sum, transaction) => {
        return monthKey(transaction.date) === currentMonth ? sum + Number(transaction.amount || 0) : sum;
      }, 0) +
      paidSalaryRecords.reduce((sum, item) => {
        return monthKey(item.payment_date) === currentMonth ? sum + Number(item.final_salary || 0) : sum;
      }, 0);

    const totalIncome = completeIncomeTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const totalExpense = completeExpenseTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const salaryExpense = paidSalaryRecords.reduce((sum, item) => sum + Number(item.final_salary || 0), 0);
    const pendingPayments =
      transactions.reduce((sum, item) => {
        return item.transaction_type === "expense" && item.status === "pending" ? sum + Number(item.amount || 0) : sum;
      }, 0) +
      salaryRecords.reduce((sum, item) => {
        return item.payment_status !== "paid" ? sum + Number(item.final_salary || 0) : sum;
      }, 0);

    const periodIncome = completeIncomeTransactions.reduce((sum, transaction) => {
      const date = getDateValue(transaction.date);
      return date && isDateInOfficeRange(date, rangeStart, rangeEnd) ? sum + Number(transaction.amount || 0) : sum;
    }, 0);

    const periodExpenseBooks = completeExpenseTransactions.reduce((sum, transaction) => {
      const date = getDateValue(transaction.date);
      return date && isDateInOfficeRange(date, rangeStart, rangeEnd) ? sum + Number(transaction.amount || 0) : sum;
    }, 0);

    const periodSalaryPaid = paidSalaryRecords.reduce((sum, item) => {
      const date = getDateValue(item.payment_date || `${item.salary_month}-01`);
      return date && isDateInOfficeRange(date, rangeStart, rangeEnd) ? sum + Number(item.final_salary || 0) : sum;
    }, 0);

    const periodExpenseTotal = periodExpenseBooks + periodSalaryPaid;
    const periodNet = periodIncome - periodExpenseTotal;

    const totalBalance = totalIncome - totalExpense - salaryExpense;
    const netProfit = totalIncome - totalExpense - salaryExpense;

    return {
      todayIncome,
      todayExpense,
      monthlyIncome,
      monthlyExpense,
      totalBalance,
      netProfit,
      salaryExpense,
      pendingPayments,
      periodIncome,
      periodExpenseBooks,
      periodSalaryPaid,
      periodExpenseTotal,
      periodNet,
    };
  }, [
    completeExpenseTransactions,
    completeIncomeTransactions,
    currentMonth,
    officeAppliedBounds,
    paidSalaryRecords,
    salaryRecords,
    today,
    transactions,
  ]);

  const categoriesByType = useMemo(
    () => ({
      income: categories.filter((item) => item.category_type === "income"),
      expense: categories.filter((item) => item.category_type !== "income"),
    }),
    [categories]
  );

  const transactionCategoryOptions = transactionForm.transactionType === "income" ? categoriesByType.income : categoriesByType.expense;
  const transactionCategoryIsOthers = isTransactionOthersSelection(transactionForm.category);

  const monthlyComparison = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const key = monthKey(date);
      months.push({
        key,
        label: date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        income: 0,
        expense: 0,
      });
    }

    const byKey = new Map(months.map((item) => [item.key, item]));
    completeIncomeTransactions.forEach((item) => {
      const bucket = byKey.get(monthKey(item.date));
      if (bucket) bucket.income += Number(item.amount || 0);
    });
    completeExpenseTransactions.forEach((item) => {
      const bucket = byKey.get(monthKey(item.date));
      if (bucket) bucket.expense += Number(item.amount || 0);
    });
    paidSalaryRecords.forEach((item) => {
      const bucket = byKey.get(monthKey(item.payment_date));
      if (bucket) bucket.expense += Number(item.final_salary || 0);
    });
    return months;
  }, [completeExpenseTransactions, completeIncomeTransactions, paidSalaryRecords]);

  const profitTrendData = useMemo(
    () =>
      monthlyComparison.map((item) => ({
        label: item.label,
        value: item.income - item.expense,
      })),
    [monthlyComparison]
  );

  const reportRangeStart = officeAppliedBounds.start;
  const reportRangeEnd = officeAppliedBounds.end;
  /** Single source of truth for analytics CSV/PDF/snapshots — matches Office date strip. */
  const officeReportPeriodLabel = officeAppliedBounds.label;

  const reportTransactions = useMemo(() => {
    return transactions.filter((item) => {
      const date = getDateValue(item.date);
      if (!date || !isDateInOfficeRange(date, reportRangeStart, reportRangeEnd)) return false;
      if (reportTypeFilter !== "all" && item.transaction_type !== reportTypeFilter) return false;
      return item.status === "completed";
    });
  }, [reportRangeEnd, reportRangeStart, reportTypeFilter, transactions, officeAppliedBounds]);

  const reportIncomeTotal = useMemo(() => {
    return reportTransactions.reduce((sum, item) => {
      return item.transaction_type === "income" ? sum + Number(item.amount || 0) : sum;
    }, 0);
  }, [reportTransactions]);

  const reportExpenseTotal = useMemo(() => {
    const transactionExpense = reportTransactions.reduce((sum, item) => {
      return item.transaction_type === "expense" ? sum + Number(item.amount || 0) : sum;
    }, 0);
    if (reportTypeFilter === "income") {
      return transactionExpense;
    }
    const salaryExpense = paidSalaryRecords.reduce((sum, item) => {
      const date = getDateValue(item.payment_date);
      return date && isDateInOfficeRange(date, reportRangeStart, reportRangeEnd) ? sum + Number(item.final_salary || 0) : sum;
    }, 0);
    return transactionExpense + salaryExpense;
  }, [paidSalaryRecords, reportRangeEnd, reportRangeStart, reportTransactions, reportTypeFilter]);

  /** Office ledger only — never includes EMI, collections, or disbursements. */
  const reportOfficeNet = reportIncomeTotal - reportExpenseTotal;

  const reportCategoryRows = useMemo(() => {
    const breakdown = new Map();
    reportTransactions.forEach((item) => {
      const key = `${item.transaction_type}:${item.category || "Uncategorised"}`;
      breakdown.set(key, {
        type: item.transaction_type,
        category: item.category || "Uncategorised",
        amount: (breakdown.get(key)?.amount || 0) + Number(item.amount || 0),
      });
    });
    if (reportTypeFilter !== "income") {
      paidSalaryRecords.forEach((item) => {
        const date = getDateValue(item.payment_date);
        if (!date || !isDateInOfficeRange(date, reportRangeStart, reportRangeEnd)) return;
        const key = "expense:Employee Salary";
        breakdown.set(key, {
          type: "expense",
          category: "Employee Salary",
          amount: (breakdown.get(key)?.amount || 0) + Number(item.final_salary || 0),
        });
      });
    }
    return Array.from(breakdown.values()).sort((a, b) => b.amount - a.amount);
  }, [paidSalaryRecords, reportRangeEnd, reportRangeStart, reportTransactions, reportTypeFilter]);

  const accountsAnalyticsPreviewColumns = useMemo(
    () => [
      { key: "category", label: "Category" },
      { key: "type", label: "Type", cellType: "status" },
      { key: "amount", label: "Amount", cellType: "currency", align: "right" },
    ],
    []
  );

  const accountsAnalyticsPreviewRows = useMemo(
    () =>
      reportCategoryRows.map((item, i) => ({
        __key: `${item.type}-${item.category}-${i}`,
        category: item.category,
        type: item.type,
        amount: Number(item.amount || 0),
      })),
    [reportCategoryRows]
  );

  const accountsAnalyticsPreviewMetrics = useMemo(
    () => [
      { icon: TrendingUp, label: "Income", value: formatCurrency(reportIncomeTotal), note: "Completed office income in range" },
      { icon: TrendingDown, label: "Expense", value: formatCurrency(reportExpenseTotal), note: "Books + paid payroll in range" },
      { icon: Wallet, label: "Net profit / loss", value: formatCurrency(reportOfficeNet), note: "Office ledger only" },
      { icon: BarChart3, label: "Split lines", value: String(reportCategoryRows.length), note: "Categories in this report" },
    ],
    [reportCategoryRows.length, reportExpenseTotal, reportIncomeTotal, reportOfficeNet]
  );

  const accountsAnalyticsPreviewFilterLines = useMemo(
    () => [
      `Range: ${officeReportPeriodLabel}`,
      `Type filter: ${reportTypeFilter === "all" ? "All" : reportTypeFilter}`,
      "Office ledger only — excludes loan disbursements and EMI/collections.",
    ],
    [officeReportPeriodLabel, reportTypeFilter]
  );

  const filteredTransactions = useMemo(() => {
    const query = transactionSearch.trim().toLowerCase();
    const rangeStart = officeAppliedBounds.start;
    const rangeEnd = officeAppliedBounds.end;
    return transactions.filter((item) => {
      const itemDate = getDateValue(item.date);
      if (!itemDate || !isDateInOfficeRange(itemDate, rangeStart, rangeEnd)) return false;
      if (transactionTypeFilter !== "all" && item.transaction_type !== transactionTypeFilter) return false;
      if (transactionStatusFilter !== "all" && item.status !== transactionStatusFilter) return false;
      if (transactionCategoryFilter !== "all" && item.category !== transactionCategoryFilter) return false;
      if (transactionMonthFilter !== "all" && monthKey(item.date) !== transactionMonthFilter) return false;
      if (!query) return true;
      return [
        item.transaction_id,
        item.category,
        item.reference_number,
        item.party_name,
        item.description,
      ].some((field) => matchesSearch(field, query));
    });
  }, [
    officeAppliedBounds,
    transactionCategoryFilter,
    transactionMonthFilter,
    transactionSearch,
    transactionStatusFilter,
    transactionTypeFilter,
    transactions,
  ]);

  const filteredSalaryRecords = useMemo(() => {
    const query = salarySearch.trim().toLowerCase();
    const rangeStart = officeAppliedBounds.start;
    const rangeEnd = officeAppliedBounds.end;
    return salaryRecords.filter((item) => {
      const refDate = getDateValue(item.payment_date || `${item.salary_month}-01`);
      if (!refDate || !isDateInOfficeRange(refDate, rangeStart, rangeEnd)) return false;
      if (salaryStatusFilter !== "all" && item.payment_status !== salaryStatusFilter) return false;
      if (salaryMonthFilter !== "all" && item.salary_month !== salaryMonthFilter) return false;
      if (!query) return true;
      return [item.salary_id, item.employee_name, item.employee_id, item.department].some((field) => matchesSearch(field, query));
    });
  }, [officeAppliedBounds, salaryMonthFilter, salaryRecords, salarySearch, salaryStatusFilter]);

  const paginatedTransactions = paginate(filteredTransactions, transactionPage, 8);
  const paginatedSalary = paginate(filteredSalaryRecords, salaryPage, 8);
  const paginatedReports = paginate(reportSnapshots, reportPage, 6);

  const salaryPreviewColumns = useMemo(
    () => [
      { key: "month", label: "Month" },
      { key: "employee", label: "Employee" },
      { key: "department", label: "Department" },
      { key: "net", label: "Net pay", cellType: "currency", align: "right" },
      { key: "status", label: "Status", cellType: "status" },
      { key: "paidOn", label: "Paid on" },
    ],
    []
  );

  const salaryPreviewRows = useMemo(
    () =>
      filteredSalaryRecords.map((item, i) => ({
        __key: item.salary_id || `sal-${i}`,
        month: formatMonthLabel(item.salary_month),
        employee: `${item.employee_name} (${item.employee_id})`,
        department: item.department || "—",
        net: Number(item.final_salary || 0),
        status: item.payment_status || "—",
        paidOn: formatDate(item.payment_date),
      })),
    [filteredSalaryRecords]
  );

  const salaryPreviewMetrics = useMemo(() => {
    const total = filteredSalaryRecords.reduce((s, r) => s + Number(r.final_salary || 0), 0);
    const paid = filteredSalaryRecords.filter((r) => String(r.payment_status).toLowerCase() === "paid").length;
    return [
      { icon: ReceiptText, label: "Rows (filtered)", value: String(filteredSalaryRecords.length), note: "Register matches" },
      { icon: Wallet, label: "Net payroll (view)", value: formatCurrency(total), note: "Filtered total" },
      { icon: Check, label: "Marked paid", value: String(paid), note: "In this view" },
      { icon: BriefcaseBusiness, label: "Filters", value: `${salaryStatusFilter} · ${salaryMonthFilter}`, note: "Status · month" },
    ];
  }, [filteredSalaryRecords, salaryMonthFilter, salaryStatusFilter]);

  const salaryPreviewFilterLines = useMemo(
    () => [
      `Office date range: ${officeAppliedBounds.label}`,
      `Status: ${salaryStatusFilter}`,
      `Month: ${salaryMonthFilter === "all" ? "All" : formatMonthLabel(salaryMonthFilter)}`,
      ...(salarySearch.trim() ? [`Search: "${salarySearch.trim()}"`] : []),
    ],
    [officeAppliedBounds.label, salaryMonthFilter, salarySearch, salaryStatusFilter]
  );

  const transactionsForExport = useMemo(() => {
    const rangeStart = officeAppliedBounds.start;
    const rangeEnd = officeAppliedBounds.end;
    return [...transactions]
      .filter((item) => {
        const d = getDateValue(item.date);
        return d && isDateInOfficeRange(d, rangeStart, rangeEnd);
      })
      .sort((a, b) => {
        const da = getDateValue(a.date)?.getTime() ?? 0;
        const db = getDateValue(b.date)?.getTime() ?? 0;
        return db - da;
      });
  }, [transactions, officeAppliedBounds]);

  const salaryRecordsForOfficeExport = useMemo(() => {
    const rangeStart = officeAppliedBounds.start;
    const rangeEnd = officeAppliedBounds.end;
    return salaryRecords.filter((item) => {
      const d = getDateValue(item.payment_date || `${item.salary_month}-01`);
      return d && isDateInOfficeRange(d, rangeStart, rangeEnd);
    });
  }, [salaryRecords, officeAppliedBounds]);

  useEffect(() => {
    setTransactionPage(1);
  }, [
    officeAppliedBounds.start,
    officeAppliedBounds.end,
    transactionSearch,
    transactionTypeFilter,
    transactionStatusFilter,
    transactionCategoryFilter,
    transactionMonthFilter,
  ]);

  useEffect(() => {
    setSalaryPage(1);
  }, [officeAppliedBounds.start, officeAppliedBounds.end, salarySearch, salaryStatusFilter, salaryMonthFilter]);

  useEffect(() => {
    setReportPage(1);
  }, [officeAppliedBounds.start, officeAppliedBounds.end, officeReportPeriodLabel, reportTypeFilter]);

  const finalSalaryPreview = Math.max(
    Number(salaryForm.basicSalary || 0) + Number(salaryForm.bonus || 0) - Number(salaryForm.deduction || 0),
    0
  );

  const transactionMonthOptions = useMemo(
    () => Array.from(new Set(transactions.map((item) => monthKey(item.date)).filter(Boolean))),
    [transactions]
  );
  const transactionCategoryOptionsForFilter = useMemo(
    () =>
      Array.from(
        new Set([
          ...categories.map((item) => item.name),
          ...transactions.map((item) => item.category).filter(Boolean),
        ])
      ).sort((left, right) => left.localeCompare(right)),
    [categories, transactions]
  );
  const salaryMonthOptions = useMemo(
    () => Array.from(new Set(salaryRecords.map((item) => item.salary_month).filter(Boolean))),
    [salaryRecords]
  );

  const payrollStrip = useMemo(() => {
    const paid = salaryRecords
      .filter((item) => item.payment_status === "paid")
      .reduce((sum, item) => sum + Number(item.final_salary || 0), 0);
    const pending = salaryRecords
      .filter((item) => item.payment_status !== "paid")
      .reduce((sum, item) => sum + Number(item.final_salary || 0), 0);
    const monthVal = salaryRecords
      .filter((item) => item.salary_month === currentMonth)
      .reduce((sum, item) => sum + Number(item.final_salary || 0), 0);
    return { paid, pending, monthVal, count: salaryRecords.length };
  }, [currentMonth, salaryRecords]);

  const accountsOverviewBookIncome = useMemo(
    () => completeIncomeTransactions.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [completeIncomeTransactions]
  );
  const accountsOverviewBookExpense = useMemo(
    () => completeExpenseTransactions.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [completeExpenseTransactions]
  );

  const accountsOverviewPreviewColumns = useMemo(
    () => [
      { key: "date", label: "Date", cellType: "date" },
      { key: "type", label: "Type", cellType: "status" },
      { key: "category", label: "Category" },
      { key: "party", label: "Party / reference" },
      { key: "amount", label: "Amount", cellType: "currency", align: "right" },
      { key: "status", label: "Status", cellType: "status" },
    ],
    []
  );

  const accountsOverviewPreviewRows = useMemo(
    () =>
      transactionsForExport.slice(0, 300).map((item, i) => ({
        __key: item.transaction_id || `ov-tx-${i}`,
        date: item.date,
        type: item.transaction_type || "—",
        category: item.category || "—",
        party: [item.party_name, item.reference_number].filter(Boolean).join(" · ") || "—",
        amount: Number(item.amount || 0),
        status: item.status || "—",
      })),
    [transactionsForExport]
  );

  const accountsOverviewPreviewMetrics = useMemo(
    () => [
      {
        icon: Wallet,
        label: "Office net balance",
        value: formatCurrency(overviewMetrics.totalBalance),
        note: "All-time completed income − books − paid payroll (loans excluded).",
      },
      {
        icon: TrendingUp,
        label: "Income summary",
        value: formatCurrency(accountsOverviewBookIncome),
        note: `Today ${formatCurrency(overviewMetrics.todayIncome)} · In range ${formatCurrency(overviewMetrics.periodIncome)}`,
      },
      {
        icon: TrendingDown,
        label: "Expense summary",
        value: formatCurrency(accountsOverviewBookExpense + overviewMetrics.salaryExpense),
        note: `Books ${formatCurrency(accountsOverviewBookExpense)} · Payroll ${formatCurrency(overviewMetrics.salaryExpense)} · In range ${formatCurrency(overviewMetrics.periodExpenseTotal)}`,
      },
      {
        icon: BarChart3,
        label: "Range net (P/L)",
        value: formatCurrency(overviewMetrics.periodNet),
        note: `${officeAppliedBounds.label} · office ledger only`,
      },
      {
        icon: BriefcaseBusiness,
        label: "Salary summary",
        value: formatCurrency(payrollStrip.paid),
        note: `${payrollStrip.count} records · Pending ${formatCurrency(payrollStrip.pending)}`,
      },
    ],
    [
      accountsOverviewBookExpense,
      accountsOverviewBookIncome,
      officeAppliedBounds.label,
      overviewMetrics.periodExpenseTotal,
      overviewMetrics.periodIncome,
      overviewMetrics.periodNet,
      overviewMetrics.salaryExpense,
      overviewMetrics.todayIncome,
      overviewMetrics.totalBalance,
      payrollStrip.count,
      payrollStrip.paid,
      payrollStrip.pending,
    ]
  );

  const accountsOverviewPreviewFilterLines = useMemo(() => {
    const tabLabel = TABS.find((t) => t.key === tab)?.label || tab;
    return [
      `Finance center · ${tabLabel}`,
      `Snapshot date · ${todayLabel}`,
      `Office date range · ${officeAppliedBounds.label}`,
      "Office ledger only — wallet balance and loan given are on Overview.",
    ];
  }, [officeAppliedBounds.label, tab, todayLabel]);

  const accountsOverviewPreviewSectionChildren = useMemo(
    () => (
      <Fragment>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/70 via-white to-white p-4 shadow-[0_2px_14px_rgba(15,23,42,0.05)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800">Income summary</p>
            <p className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{formatCurrency(accountsOverviewBookIncome)}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Completed income entries. Today {formatCurrency(overviewMetrics.todayIncome)} · This calendar month{" "}
              {formatCurrency(overviewMetrics.monthlyIncome)}.
            </p>
          </div>
          <div className="rounded-2xl border border-rose-100/90 bg-gradient-to-br from-rose-50/60 via-white to-white p-4 shadow-[0_2px_14px_rgba(15,23,42,0.05)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-800">Expense summary</p>
            <p className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {formatCurrency(accountsOverviewBookExpense + overviewMetrics.salaryExpense)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Book expenses {formatCurrency(accountsOverviewBookExpense)} plus paid payroll {formatCurrency(overviewMetrics.salaryExpense)}. Other
              payables (pending) {formatCurrency(overviewMetrics.pendingPayments)}.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100/90 bg-gradient-to-br from-slate-50/80 via-white to-white p-4 shadow-[0_2px_14px_rgba(15,23,42,0.05)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Selected range</p>
            <p className="mt-2 text-lg font-bold tracking-tight text-slate-900">{officeAppliedBounds.label}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Income {formatCurrency(overviewMetrics.periodIncome)} · Expense (incl. payroll in range){" "}
              {formatCurrency(overviewMetrics.periodExpenseTotal)} · Net {formatCurrency(overviewMetrics.periodNet)}
            </p>
          </div>
          <div className="rounded-2xl border border-blue-100/90 bg-gradient-to-br from-blue-50/70 to-white p-4 shadow-[0_2px_14px_rgba(15,23,42,0.05)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-900">Salary summary</p>
            <p className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{formatCurrency(payrollStrip.paid)}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              {payrollStrip.count} payroll row{payrollStrip.count === 1 ? "" : "s"}. Pending liability {formatCurrency(payrollStrip.pending)} · This
              month scheduled {formatCurrency(payrollStrip.monthVal)}.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Recent transactions</span> — table below lists the latest ledger lines (search & sort apply).
        </div>
      </Fragment>
    ),
    [
      accountsOverviewBookExpense,
      accountsOverviewBookIncome,
      officeAppliedBounds.label,
      overviewMetrics.monthlyIncome,
      overviewMetrics.pendingPayments,
      overviewMetrics.periodExpenseTotal,
      overviewMetrics.periodIncome,
      overviewMetrics.periodNet,
      overviewMetrics.salaryExpense,
      overviewMetrics.todayIncome,
      payrollStrip.count,
      payrollStrip.monthVal,
      payrollStrip.paid,
      payrollStrip.pending,
    ]
  );

  async function handleTransactionSubmit(event) {
    event.preventDefault();
    if (!user?.uid) return;
    const amt = Number(transactionForm.amount);
    const resolvedCategory = resolveTransactionCategoryForSave(transactionForm);
    if (!transactionForm.date || !transactionForm.category) {
      setTransactionError("Date and category are required.");
      return;
    }
    if (!resolvedCategory) {
      setTransactionError(
        transactionCategoryIsOthers
          ? "Custom category is required when Others is selected."
          : "Date and category are required."
      );
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setTransactionError("Enter a valid amount greater than zero.");
      return;
    }
    if (transactionForm.status === "completed" && transactionForm.date > todayLabel) {
      setTransactionError("Completed transactions cannot use a future date.");
      return;
    }
    setSaving(true);
    setTransactionError("");
    setStatusMessage("");
    try {
      const transactionPayload = { ...transactionForm, category: resolvedCategory };
      if (editingTransactionId) {
        await updateAccountsTransaction(editingTransactionId, transactionPayload, actor);
        setStatusMessage("Transaction updated.");
      } else {
        await createAccountsTransaction(transactionPayload, actor);
        setStatusMessage("Transaction recorded.");
      }
      setTransactionForm(emptyTransactionForm(transactionForm.transactionType));
      setEditingTransactionId("");
    } catch (error) {
      setTransactionError(error.message || "Unable to save transaction");
    } finally {
      setSaving(false);
    }
  }

  function handleEditTransaction(item) {
    setTab("transactions");
    setTransactionError("");
    setEditingTransactionId(item.transaction_id);
    const type = item.transaction_type || "expense";
    const categoryRows = type === "income" ? categoriesByType.income : categoriesByType.expense;
    const { category, customCategory } = transactionCategoryFieldsFromRecord(item.category, categoryRows);
    setTransactionForm({
      date: item.date || "",
      transactionType: type,
      category,
      customCategory,
      amount: String(item.amount || ""),
      paymentMethod: item.payment_method || "Cash",
      referenceNumber: item.reference_number || "",
      partyName: item.party_name || "",
      description: item.description || "",
      attachmentName: item.attachment_name || "",
      status: item.status || "completed",
      isRecurring: Boolean(item.is_recurring),
      recurringFrequency: item.recurring_frequency || "none",
    });
  }

  async function handleDeleteTransaction(item) {
    if (!window.confirm(`Delete transaction ${item.transaction_id}?`)) return;
    setSaving(true);
    setStatusMessage("");
    try {
      await deleteAccountsTransaction(item.transaction_id, actor);
      setStatusMessage("Transaction deleted.");
    } catch (error) {
      setTransactionError(error.message || "Unable to delete transaction");
    } finally {
      setSaving(false);
    }
  }

  async function handleSalarySubmit(event) {
    event.preventDefault();
    if (!user?.uid) return;
    if (!salaryForm.employeeName || !salaryForm.employeeId || !salaryForm.salaryMonth || Number(salaryForm.basicSalary || 0) <= 0) {
      setSalaryError("Employee name, employee ID, salary month, and basic salary are required.");
      return;
    }
    if (salaryForm.paymentStatus === "paid" && !salaryForm.paymentDate) {
      setSalaryError("Payment date is required when salary status is marked as paid.");
      return;
    }
    if (salaryForm.paymentStatus === "paid" && salaryForm.paymentDate > todayLabel) {
      setSalaryError("Paid salary cannot use a future payment date.");
      return;
    }
    if (salaryForm.paymentStatus === "paid" && salaryForm.paymentDate.slice(0, 7) !== salaryForm.salaryMonth) {
      setSalaryError("Payment date must stay within the selected salary month.");
      return;
    }
    setSaving(true);
    setSalaryError("");
    setStatusMessage("");
    try {
      if (editingSalaryId) {
        await updateSalaryRecord(editingSalaryId, salaryForm, actor);
        setStatusMessage("Salary record updated.");
      } else {
        await createSalaryRecord(salaryForm, actor);
        setStatusMessage("Salary record created.");
      }
      setEditingSalaryId("");
      setSalaryForm(emptySalaryForm());
    } catch (error) {
      setSalaryError(error.message || "Unable to save salary record");
    } finally {
      setSaving(false);
    }
  }

  function handleEditSalary(item) {
    setTab("salary");
    setSalaryError("");
    setEditingSalaryId(item.salary_id);
    setSalaryForm({
      employeeName: item.employee_name || "",
      employeeId: item.employee_id || "",
      department: item.department || "",
      salaryMonth: item.salary_month || "",
      basicSalary: String(item.basic_salary || ""),
      bonus: String(item.bonus || ""),
      deduction: String(item.deduction || ""),
      paymentStatus: item.payment_status || "pending",
      paymentDate: item.payment_date || "",
      description: item.description || "",
    });
  }

  async function handleDeleteSalary(item) {
    if (!window.confirm(`Delete salary record ${item.salary_id}?`)) return;
    setSaving(true);
    try {
      await deleteSalaryRecord(item.salary_id, actor);
      setStatusMessage("Salary record deleted.");
    } catch (error) {
      setSalaryError(error.message || "Unable to delete salary record");
    } finally {
      setSaving(false);
    }
  }

  async function handleCategorySubmit(event) {
    event.preventDefault();
    if (!categoryForm.name) {
      setCategoryError("Category name is required.");
      return;
    }
    const normalizedName = categoryForm.name.trim().toLowerCase();
    const duplicateExists = categories.some(
      (item) => item.category_type === categoryForm.categoryType && String(item.name || "").trim().toLowerCase() === normalizedName
    );
    if (duplicateExists) {
      setCategoryError("This category already exists for the selected type.");
      return;
    }
    setSaving(true);
    setCategoryError("");
    try {
      await createAccountsCategory(categoryForm, actor);
      setStatusMessage("Category added.");
      setCategoryForm(emptyCategoryForm(categoryForm.categoryType));
    } catch (error) {
      setCategoryError(error.message || "Unable to save category");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCategory(item) {
    if (item.is_default) return;
    if (!window.confirm(`Delete category ${item.name}?`)) return;
    setSaving(true);
    try {
      await deleteAccountsCategory(item.category_id, actor);
      setStatusMessage("Category deleted.");
    } catch (error) {
      setCategoryError(error.message || "Unable to delete category");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveReportSnapshot() {
    setSaving(true);
    setStatusMessage("");
    try {
      await saveAccountsReportSnapshot(
        {
          reportType: "office_analytics",
          reportTitle: "Accounts analytics snapshot",
          periodLabel: `${officeReportPeriodLabel} · office ledger`,
          filters: { officePeriodLabel: officeReportPeriodLabel, officePreset: officeDatePreset, reportTypeFilter },
          summary: {
            income: reportIncomeTotal,
            expense: reportExpenseTotal,
            office_net: reportOfficeNet,
            categories: reportCategoryRows,
          },
        },
        actor
      );
      setStatusMessage("Report snapshot saved.");
    } catch (error) {
      setLoadError(error.message || "Unable to save report snapshot");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSnapshot(item) {
    if (!window.confirm(`Delete report snapshot ${item.report_id}?`)) return;
    setSaving(true);
    try {
      await deleteAccountsReportSnapshot(item.report_id, actor);
      setStatusMessage("Report snapshot deleted.");
    } catch (error) {
      setLoadError(error.message || "Unable to delete report snapshot");
    } finally {
      setSaving(false);
    }
  }

  function exportTransactionsCsv() {
    const rows = [
      [
        "Transaction ID",
        "Date",
        "Type",
        "Category",
        "Amount",
        "Payment Method",
        "Reference Number",
        "Person / Company",
        "Status",
        "Recurring",
        "Description",
        "Attachment",
      ],
      ...filteredTransactions.map((item) => [
        item.transaction_id,
        item.date,
        item.transaction_type,
        item.category,
        item.amount,
        item.payment_method,
        item.reference_number,
        item.party_name,
        item.status,
        item.is_recurring ? item.recurring_frequency : "No",
        item.description,
        item.attachment_name,
      ]),
    ];
    downloadTextFile("accounts-transactions.csv", rowsToCsv(rows));
  }

  function printTransactionsReport() {
    openPrintableReport({
      title: "Accounts Transaction Register",
      subtitle: `Office · ${officeAppliedBounds.label} — Ruthra Financial Solutions`,
      columns: ["ID", "Date", "Type", "Category", "Party", "Amount", "Status"],
      rows: filteredTransactions.map((item) => [
        item.transaction_id,
        formatDate(item.date),
        item.transaction_type,
        item.category,
        item.party_name,
        formatCurrency(item.amount),
        item.status,
      ]),
      reportMeta: accountsReportMeta,
    });
  }

  function exportSalaryCsv() {
    const rows = [
      ["Salary ID", "Month", "Employee", "Employee ID", "Department", "Basic", "Bonus", "Deduction", "Final Salary", "Status", "Payment Date"],
      ...filteredSalaryRecords.map((item) => [
        item.salary_id,
        item.salary_month,
        item.employee_name,
        item.employee_id,
        item.department,
        item.basic_salary,
        item.bonus,
        item.deduction,
        item.final_salary,
        item.payment_status,
        item.payment_date,
      ]),
    ];
    downloadTextFile(`salary-report-${accountsExportDateStamp()}.csv`, rowsToCsv(rows));
  }

  function printSalaryReport() {
    void handleSalaryPreviewPrint();
  }

  function exportReportCsv() {
    const stamp = accountsExportDateStamp();
    const rows = [
      ["Metric", "Value"],
      ["Report range", officeReportPeriodLabel],
      ["Filtered type", reportTypeFilter],
      ["Income (office)", reportIncomeTotal],
      ["Expense (office)", reportExpenseTotal],
      ["Net profit / loss (office)", reportOfficeNet],
      [],
      ["Category Type", "Category", "Amount"],
      ...reportCategoryRows.map((item) => [item.type, item.category, item.amount]),
    ];
    downloadTextFile(`accounts-analytics-${stamp}.csv`, rowsToCsv(rows));
  }

  function exportReportPeriodXlsx() {
    const stamp = accountsExportDateStamp();
    setExportError("");
    try {
      const wb = XLSX.utils.book_new();
      const summary = XLSX.utils.aoa_to_sheet([
        [ACCOUNTS_COMPANY_NAME],
        [`Period analytics · ${officeReportPeriodLabel} · exported ${stamp}`],
        [],
        ["Metric", "Value"],
        ["Income (office)", reportIncomeTotal],
        ["Expense (office)", reportExpenseTotal],
        ["Net profit / loss (office)", reportOfficeNet],
      ]);
      XLSX.utils.book_append_sheet(wb, summary, "Summary");

      const catRows = [
        ["Type", "Category", "Amount"],
        ...reportCategoryRows.map((item) => [item.type, item.category, Number(item.amount || 0)]),
      ];
      const catSheet = XLSX.utils.aoa_to_sheet(catRows);
      XLSX.utils.book_append_sheet(wb, catSheet, "Categories");

      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      downloadBlob(`accounts-analytics-${stamp}.xlsx`, blob);
      setStatusMessage("Excel file downloaded.");
      setTimeout(() => setStatusMessage(""), 3500);
    } catch (err) {
      console.error(err);
      setExportError("Failed to generate report");
      setTimeout(() => setExportError(""), 5000);
    }
  }

  async function handleExportAccountsPdf() {
    if (exportPdfLoading) return;
    setExportPdfLoading(true);
    setExportError("");
    await Promise.resolve();
    try {
      const stamp = accountsExportDateStamp();
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const margin = 14;
      let y = margin;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text(ACCOUNTS_COMPANY_NAME, margin, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text(`Accounts report · ${stamp}`, margin, y);
      y += 9;
      doc.setTextColor(15, 23, 42);

      const summaryBody = [
        ["Total balance (office)", formatCurrency(overviewMetrics.totalBalance)],
        ["Today income", formatCurrency(overviewMetrics.todayIncome)],
        ["Today expense", formatCurrency(overviewMetrics.todayExpense)],
        ["Range income", formatCurrency(overviewMetrics.periodIncome)],
        ["Range expense (incl. payroll)", formatCurrency(overviewMetrics.periodExpenseTotal)],
        ["Range net", formatCurrency(overviewMetrics.periodNet)],
        ["Date range", officeAppliedBounds.label],
      ];

      autoTable(doc, {
        startY: y,
        head: [["Metric", "Value"]],
        body: summaryBody,
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 1: { halign: "right" } },
        margin: { left: margin, right: margin },
      });

      y = doc.lastAutoTable.finalY + 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Transactions", margin, y);

      const slice = transactionsForExport.slice(0, 300);
      const body = slice.map((item) => [
        formatDate(item.date),
        String(item.transaction_type || ""),
        String(item.category || "—"),
        formatCurrency(item.amount),
        String(item.payment_method || "—"),
        String(item.status || "—"),
      ]);

      autoTable(doc, {
        startY: y + 4,
        head: [["Date", "Type", "Category", "Amount", "Payment method", "Status"]],
        body,
        theme: "striped",
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 1.6, overflow: "linebreak" },
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: 20 },
          2: { cellWidth: 36 },
          3: { cellWidth: 28, halign: "right" },
          4: { cellWidth: 26 },
          5: { cellWidth: 22 },
        },
        margin: { left: margin, right: margin },
      });

      doc.save(`accounts-report-${stamp}.pdf`);
      setStatusMessage("PDF downloaded successfully.");
      setTimeout(() => setStatusMessage(""), 4000);
    } catch (err) {
      console.error(err);
      setExportError("Failed to generate report");
      setTimeout(() => setExportError(""), 5000);
    } finally {
      setExportPdfLoading(false);
    }
  }

  async function handleExportAccountsExcel() {
    if (exportExcelLoading) return;
    setExportExcelLoading(true);
    setExportError("");
    await Promise.resolve();
    try {
      const stamp = accountsExportDateStamp();
      const wb = XLSX.utils.book_new();

      const summarySheet = XLSX.utils.aoa_to_sheet([
        [ACCOUNTS_COMPANY_NAME],
        [`Accounts report · ${stamp}`],
        [],
        ["Metric", "Amount (Rs)"],
        ["Total balance (office)", Number(overviewMetrics.totalBalance)],
        ["Today income", Number(overviewMetrics.todayIncome)],
        ["Today expense", Number(overviewMetrics.todayExpense)],
        ["Range income", Number(overviewMetrics.periodIncome)],
        ["Range expense (incl. payroll)", Number(overviewMetrics.periodExpenseTotal)],
        ["Range net", Number(overviewMetrics.periodNet)],
        ["Date range label", officeAppliedBounds.label],
      ]);
      XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

      const txRows = [
        ["Date", "Type", "Category", "Amount", "Payment method", "Status", "Reference", "Party"],
        ...transactionsForExport.slice(0, 5000).map((item) => [
          formatDate(item.date),
          item.transaction_type || "",
          item.category || "",
          Number(item.amount || 0),
          item.payment_method || "",
          item.status || "",
          item.reference_number || "",
          item.party_name || "",
        ]),
      ];
      const txSheet = XLSX.utils.aoa_to_sheet(txRows);
      XLSX.utils.book_append_sheet(wb, txSheet, "Transactions");

      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      downloadBlob(`accounts-report-${stamp}.xlsx`, blob);
      setStatusMessage("Excel file downloaded successfully.");
      setTimeout(() => setStatusMessage(""), 4000);
    } catch (err) {
      console.error(err);
      setExportError("Failed to generate report");
      setTimeout(() => setExportError(""), 5000);
    } finally {
      setExportExcelLoading(false);
    }
  }

  async function handleOverviewPreviewPdfDownload() {
    if (overviewPreviewPdfLoading || exportPdfLoading) return;
    setOverviewPreviewPdfLoading(true);
    setExportError("");
    await Promise.resolve();
    try {
      const stamp = accountsExportDateStamp();
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const margin = 14;
      let y = margin;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text(ACCOUNTS_COMPANY_NAME, margin, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text(`Accounts finance overview · ${stamp}`, margin, y);
      y += 9;
      doc.setTextColor(15, 23, 42);

      const summaryBody = [
        ["Office net balance (all-time)", formatCurrency(overviewMetrics.totalBalance)],
        ["Book income (completed)", formatCurrency(accountsOverviewBookIncome)],
        ["Book expense (completed)", formatCurrency(accountsOverviewBookExpense)],
        ["Paid payroll (cumulative)", formatCurrency(overviewMetrics.salaryExpense)],
        ["Today income", formatCurrency(overviewMetrics.todayIncome)],
        ["Today expense", formatCurrency(overviewMetrics.todayExpense)],
        ["Range income", formatCurrency(overviewMetrics.periodIncome)],
        ["Range expense (incl. payroll)", formatCurrency(overviewMetrics.periodExpenseTotal)],
        ["Range net", formatCurrency(overviewMetrics.periodNet)],
        ["Date range", officeAppliedBounds.label],
        ["Payroll pending liability", formatCurrency(payrollStrip.pending)],
      ];

      autoTable(doc, {
        startY: y,
        head: [["Metric", "Value"]],
        body: summaryBody,
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 1: { halign: "right" } },
        margin: { left: margin, right: margin },
      });

      y = doc.lastAutoTable.finalY + 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Recent transactions (latest 200)", margin, y);

      const slice = transactionsForExport.slice(0, 200);
      const body = slice.map((item) => [
        formatDate(item.date),
        String(item.transaction_type || ""),
        String(item.category || "—"),
        formatCurrency(item.amount),
        String(item.payment_method || "—"),
        String(item.status || "—"),
      ]);

      autoTable(doc, {
        startY: y + 4,
        head: [["Date", "Type", "Category", "Amount", "Payment", "Status"]],
        body,
        theme: "striped",
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 1.6, overflow: "linebreak" },
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: 20 },
          2: { cellWidth: 36 },
          3: { cellWidth: 28, halign: "right" },
          4: { cellWidth: 26 },
          5: { cellWidth: 22 },
        },
        margin: { left: margin, right: margin },
      });

      doc.save(`accounts-overview-finance-${stamp}.pdf`);
      setStatusMessage("Overview PDF downloaded.");
      setTimeout(() => setStatusMessage(""), 4000);
    } catch (err) {
      console.error(err);
      setExportError("Failed to generate overview PDF");
      setTimeout(() => setExportError(""), 5000);
    } finally {
      setOverviewPreviewPdfLoading(false);
    }
  }

  async function handleOverviewPreviewExcelDownload() {
    if (overviewPreviewExcelLoading || exportExcelLoading) return;
    setOverviewPreviewExcelLoading(true);
    setExportError("");
    await Promise.resolve();
    try {
      const stamp = accountsExportDateStamp();
      const wb = XLSX.utils.book_new();

      const summarySheet = XLSX.utils.aoa_to_sheet([
        [ACCOUNTS_COMPANY_NAME],
        [`Accounts finance overview · ${stamp}`],
        [],
        ["Metric", "Amount (Rs)"],
        ["Office net balance (all-time)", Number(overviewMetrics.totalBalance)],
        ["Book income (completed)", Number(accountsOverviewBookIncome)],
        ["Book expense (completed)", Number(accountsOverviewBookExpense)],
        ["Paid payroll (cumulative)", Number(overviewMetrics.salaryExpense)],
        ["Today income", Number(overviewMetrics.todayIncome)],
        ["Today expense", Number(overviewMetrics.todayExpense)],
        ["Range income", Number(overviewMetrics.periodIncome)],
        ["Range expense (incl. payroll)", Number(overviewMetrics.periodExpenseTotal)],
        ["Range net", Number(overviewMetrics.periodNet)],
        ["Date range label", officeAppliedBounds.label],
        ["Payroll pending liability", Number(payrollStrip.pending)],
      ]);
      XLSX.utils.book_append_sheet(wb, summarySheet, "Overview");

      const txRows = [
        ["Date", "Type", "Category", "Amount", "Payment method", "Status", "Reference", "Party"],
        ...transactionsForExport.slice(0, 2000).map((item) => [
          formatDate(item.date),
          item.transaction_type || "",
          item.category || "",
          Number(item.amount || 0),
          item.payment_method || "",
          item.status || "",
          item.reference_number || "",
          item.party_name || "",
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txRows), "Transactions");

      const salaryRows = [
        ["Month", "Employee", "Department", "Net pay", "Status", "Paid on"],
        ...salaryRecordsForOfficeExport.slice(0, 2000).map((item) => [
          item.salary_month || "",
          item.employee_name || "",
          item.department || "",
          Number(item.final_salary || 0),
          item.payment_status || "",
          formatDate(item.payment_date),
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(salaryRows), "Salary");

      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      downloadBlob(`accounts-overview-finance-${stamp}.xlsx`, blob);
      setStatusMessage("Overview Excel downloaded.");
      setTimeout(() => setStatusMessage(""), 4000);
    } catch (err) {
      console.error(err);
      setExportError("Failed to generate overview Excel");
      setTimeout(() => setExportError(""), 5000);
    } finally {
      setOverviewPreviewExcelLoading(false);
    }
  }

  function exportFilteredTransactionsXlsx() {
    const stamp = accountsExportDateStamp();
    setExportError("");
    try {
      const wb = XLSX.utils.book_new();
      const rows = [
        ["Date", "Type", "Category", "Amount", "Payment method", "Status", "Reference", "Party"],
        ...filteredTransactions.map((item) => [
          formatDate(item.date),
          item.transaction_type || "",
          item.category || "",
          Number(item.amount || 0),
          item.payment_method || "",
          item.status || "",
          item.reference_number || "",
          item.party_name || "",
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Transactions");
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      downloadBlob(`accounts-transactions-${stamp}.xlsx`, blob);
      setStatusMessage("Excel file downloaded.");
      setTimeout(() => setStatusMessage(""), 3500);
    } catch (err) {
      console.error(err);
      setExportError("Failed to generate report");
      setTimeout(() => setExportError(""), 5000);
    }
  }

  function printAnalyticsReport() {
    void handleAnalyticsPreviewPrint();
  }

  async function handleAnalyticsPreviewPdfDownload() {
    if (analyticsPreviewPdfLoading) return;
    setAnalyticsPreviewPdfLoading(true);
    setExportError("");
    await Promise.resolve();
    try {
      const stamp = accountsExportDateStamp();
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const margin = 14;
      let y = margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text("Accounts analytics", margin, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text(`Range: ${officeReportPeriodLabel} · Type: ${reportTypeFilter} · ${stamp}`, margin, y);
      y += 10;
      doc.setTextColor(15, 23, 42);
      const summaryBody = [
        ["Income (office)", formatCurrency(reportIncomeTotal)],
        ["Expense (office)", formatCurrency(reportExpenseTotal)],
        ["Net profit / loss (office)", formatCurrency(reportOfficeNet)],
      ];
      autoTable(doc, {
        startY: y,
        head: [["Metric", "Value"]],
        body: summaryBody,
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 1: { halign: "right" } },
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Categories", margin, y);
      const catBody = reportCategoryRows.map((item) => [item.category, item.type, formatCurrency(item.amount)]);
      autoTable(doc, {
        startY: y + 4,
        head: [["Category", "Type", "Amount"]],
        body: catBody.length ? catBody : [["—", "—", "—"]],
        theme: "striped",
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 1.8 },
        columnStyles: { 2: { halign: "right" } },
        margin: { left: margin, right: margin },
      });
      doc.save(`accounts-analytics-${stamp}.pdf`);
      setStatusMessage("Analytics PDF downloaded.");
      setTimeout(() => setStatusMessage(""), 3500);
    } catch (err) {
      console.error(err);
      setExportError("Failed to generate analytics PDF");
      setTimeout(() => setExportError(""), 5000);
    } finally {
      setAnalyticsPreviewPdfLoading(false);
    }
  }

  async function handleAnalyticsPreviewExcelDownload() {
    if (analyticsPreviewExcelLoading) return;
    setAnalyticsPreviewExcelLoading(true);
    setExportError("");
    await Promise.resolve();
    try {
      exportReportPeriodXlsx();
    } finally {
      setAnalyticsPreviewExcelLoading(false);
    }
  }

  async function handleSalaryPreviewPdfDownload() {
    if (salaryPreviewPdfLoading) return;
    setSalaryPreviewPdfLoading(true);
    try {
      await downloadEnterpriseTabularPdf(
        buildPreviewColumnsPdfPayload({
          title: "Salary report",
          subtitle: "Payroll register (filtered)",
          columns: salaryPreviewColumns,
          rows: salaryPreviewRows,
          filterLines: salaryPreviewFilterLines,
          summaryCards: salaryPreviewMetrics.map((m) => ({ label: m.label, value: m.value, note: m.note })),
          reportMeta: accountsReportMeta,
        }),
        "accounts-salary"
      );
    } catch (err) {
      console.error(err);
      setExportError("Failed to generate salary PDF");
    } finally {
      setSalaryPreviewPdfLoading(false);
    }
  }

  async function handleSalaryPreviewPrint() {
    setSalaryPrintLoading(true);
    try {
      await printEnterpriseTabularPdf(
        buildPreviewColumnsPdfPayload({
          title: "Salary report",
          subtitle: "Payroll register (filtered)",
          columns: salaryPreviewColumns,
          rows: salaryPreviewRows,
          filterLines: salaryPreviewFilterLines,
          summaryCards: salaryPreviewMetrics.map((m) => ({ label: m.label, value: m.value, note: m.note })),
          reportMeta: accountsReportMeta,
        })
      );
    } finally {
      setSalaryPrintLoading(false);
    }
  }

  async function handleAnalyticsPreviewPrint() {
    setAnalyticsPrintLoading(true);
    try {
      await printEnterpriseTabularPdf(
        buildPreviewColumnsPdfPayload({
          title: "Accounts analytics",
          subtitle: `${officeReportPeriodLabel} · ${reportTypeFilter === "all" ? "All types" : reportTypeFilter}`,
          columns: accountsAnalyticsPreviewColumns,
          rows: accountsAnalyticsPreviewRows,
          filterLines: accountsAnalyticsPreviewFilterLines,
          summaryCards: accountsAnalyticsPreviewMetrics.map((m) => ({ label: m.label, value: m.value, note: m.note })),
          reportMeta: accountsReportMeta,
        })
      );
    } finally {
      setAnalyticsPrintLoading(false);
    }
  }

  async function handleSalaryPreviewExcelDownload() {
    if (salaryPreviewExcelLoading) return;
    setSalaryPreviewExcelLoading(true);
    try {
      await Promise.resolve();
      exportSalaryCsv();
    } finally {
      setSalaryPreviewExcelLoading(false);
    }
  }

  return (
    <AdminLayout
      title="Accounts"
      description="Income, expenses, payroll, and statements in one calm workspace."
      action={
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setTab("transactions");
                setEditingTransactionId("");
                setTransactionError("");
                setTransactionForm(emptyTransactionForm("expense"));
              }}
              className="accounts-toolbar-btn accounts-toolbar-btn--expense"
            >
              <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
              Add expense
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("transactions");
                setEditingTransactionId("");
                setTransactionError("");
                setTransactionForm(emptyTransactionForm("income"));
              }}
              className="accounts-toolbar-btn accounts-toolbar-btn--income"
            >
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              Add income
            </button>
            <button
              type="button"
              onClick={() => setTab("reports")}
              className="accounts-toolbar-btn accounts-toolbar-btn--reports"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Reports
            </button>
            <button
              type="button"
              disabled={!isReady || overviewPreviewPdfLoading || overviewPreviewExcelLoading}
              onClick={() => setAccountsOverviewPreviewOpen(true)}
              className="accounts-toolbar-btn accounts-toolbar-btn--view"
            >
              <Eye className="h-3.5 w-3.5 shrink-0 opacity-95" />
              View Report
            </button>
            <button
              type="button"
              disabled={exportPdfLoading || exportExcelLoading || overviewPreviewPdfLoading || overviewPreviewExcelLoading}
              onClick={() => void handleExportAccountsPdf()}
              className="accounts-toolbar-btn accounts-toolbar-btn--pdf"
            >
              {exportPdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              {exportPdfLoading ? "Generating PDF…" : "Export PDF"}
            </button>
            <button
              type="button"
              disabled={exportPdfLoading || exportExcelLoading || overviewPreviewPdfLoading || overviewPreviewExcelLoading}
              onClick={() => void handleExportAccountsExcel()}
              className="accounts-toolbar-btn accounts-toolbar-btn--excel"
            >
              {exportExcelLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 text-teal-700" />}
              {exportExcelLoading ? "Generating…" : "Export Excel"}
            </button>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5 sm:ml-1">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">Admin only</span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">Live sync</span>
          </div>
        </div>
      }
    >
      <div className="app-grid-page grid gap-4">
        <section className="rounded-[22px] border border-slate-100/80 bg-white/90 px-4 py-3.5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] backdrop-blur-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-blue-600/90">Finance center</p>
              <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Accounts</h2>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">Glance at health, then open a section for detail.</p>
            </div>
            <div className="-mx-1 flex max-w-full flex-nowrap gap-1 overflow-x-auto rounded-2xl bg-slate-100/70 p-1 sm:mx-0 sm:justify-end">
              {TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                    tab === item.key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white/90"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {statusMessage ? (
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-900">{statusMessage}</div>
          ) : null}
          {loadError ? (
            <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800">{loadError}</div>
          ) : null}
          {exportError ? (
            <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800">{exportError}</div>
          ) : null}
        </section>

        <section className="rounded-[22px] border border-slate-100/90 bg-gradient-to-br from-white via-slate-50/40 to-white px-4 py-4 shadow-[0_2px_14px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Office date range</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Filters books, payroll register & exports</p>
              <p className="mt-1 text-xs text-slate-500">
                Active: <span className="font-medium text-slate-700">{officeAppliedBounds.label}</span>
                {officeDatePreset === "custom" && (!officeAppliedCustomFrom || !officeAppliedCustomTo) ? (
                  <span className="text-amber-700"> · Pick dates and tap Apply</span>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "today", label: "Today" },
                { key: "yesterday", label: "Yesterday" },
                { key: "this_week", label: "This week" },
                { key: "this_month", label: "This month" },
                { key: "custom", label: "Custom" },
              ].map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyOfficeDatePreset(p.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    officeDatePreset === p.key ? "bg-slate-900 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">From date</label>
              <input
                type="date"
                value={officeCustomFrom}
                onChange={(e) => setOfficeCustomFrom(e.target.value)}
                className="app-input h-10 min-w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">To date</label>
              <input
                type="date"
                value={officeCustomTo}
                onChange={(e) => setOfficeCustomTo(e.target.value)}
                className="app-input h-10 min-w-[150px]"
              />
            </div>
            <button
              type="button"
              onClick={applyOfficeCustomRange}
              className="app-button-primary inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold"
            >
              Apply filter
            </button>
            <button
              type="button"
              onClick={resetOfficeDateFilter}
              className="app-button-secondary inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold"
            >
              Reset filter
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50/90 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              <TrendingUp className="h-3 w-3" aria-hidden />
              Range income {formatCurrency(overviewMetrics.periodIncome)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50/90 px-2.5 py-1 text-[11px] font-semibold text-rose-800">
              <TrendingDown className="h-3 w-3" aria-hidden />
              Range expense {formatCurrency(overviewMetrics.periodExpenseTotal)}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                overviewMetrics.periodNet >= 0
                  ? "border-emerald-100 bg-emerald-50/80 text-emerald-900"
                  : "border-rose-100 bg-rose-50/80 text-rose-900"
              }`}
            >
              Net {formatCurrency(overviewMetrics.periodNet)}
            </span>
          </div>
        </section>

        {tab === "overview" ? (
          <>
            <section className="relative overflow-hidden rounded-[22px] border border-white/60 bg-gradient-to-br from-slate-50/95 via-white to-blue-50/35 px-3.5 pb-3.5 pt-3 shadow-[0_10px_36px_-22px_rgba(15,23,42,0.16)] ring-1 ring-slate-200/40 backdrop-blur-md sm:px-4 sm:pb-4 sm:pt-3.5">
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600/90">
                Accounts overview
              </p>
              <div className="grid min-w-0 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
                <PremiumKpiCard
                  icon={Wallet}
                  label="Wallet balance"
                  amount={Math.round(liveWalletBalance)}
                  sub={`Deposits ${formatCurrency(Math.round(investorDepositsTotal))} · Opening ${formatCurrency(Math.round(cashOpening))}`}
                  accent="emerald"
                  amountTone={liveWalletBalance < 0 ? "negative" : liveWalletBalance === 0 ? "warning" : "positive"}
                  healthLine={walletHealthLine}
                  trendUp={liveWalletBalance > 0}
                />
                <PremiumKpiCard
                  icon={Landmark}
                  label="Loan given"
                  amount={Math.round(loanFinanceMetrics.totalPrincipalDisbursed)}
                  sub={`${loanFinanceMetrics.activeLoanCount} booked loan${loanFinanceMetrics.activeLoanCount === 1 ? "" : "s"} (approved)`}
                  accent="rose"
                  amountTone="neutral"
                  healthLine="Deployed principal · approved book"
                  trendUp={loanFinanceMetrics.totalPrincipalDisbursed > 0 ? true : undefined}
                />
                <PremiumKpiCard
                  icon={TrendingUp}
                  label="Today income"
                  amount={Math.round(overviewMetrics.todayIncome)}
                  sub={`Range ${formatCurrency(Math.round(overviewMetrics.periodIncome))} · ${officeAppliedBounds.label}`}
                  accent="emerald"
                  amountTone="positive"
                  healthLine="Completed office income for today"
                  trendUp={overviewMetrics.todayIncome > 0}
                />
                <PremiumKpiCard
                  icon={TrendingDown}
                  label="Today expense"
                  amount={Math.round(overviewMetrics.todayExpense)}
                  sub={`Range ${formatCurrency(Math.round(overviewMetrics.periodExpenseTotal))} · books & payroll`}
                  accent="rose"
                  amountTone="negative"
                  healthLine="Office expenses and paid salary for today"
                  trendUp={false}
                />
              </div>
            </section>
          </>
        ) : null}

        {tab === "transactions" ? (
          <>
            <section className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <Panel
                title={editingTransactionId ? "Edit entry" : "Record transaction"}
                eyebrow="Income or expense"
                icon={Plus}
                actions={
                  editingTransactionId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTransactionId("");
                        setTransactionError("");
                        setTransactionForm(emptyTransactionForm(transactionForm.transactionType));
                      }}
                      className="app-button-secondary rounded-xl px-3 py-2 text-xs font-medium"
                    >
                      Reset
                    </button>
                  ) : null
                }
              >
                <form className="space-y-3" onSubmit={handleTransactionSubmit}>
                  <p className="text-xs text-slate-500">
                    ID <span className="font-mono font-semibold text-slate-800">{editingTransactionId || "auto on save"}</span>
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Date</label>
                      <input type="date" value={transactionForm.date} onChange={(event) => setTransactionForm((current) => ({ ...current, date: event.target.value }))} className="app-input h-10" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Type</label>
                      <select
                        value={transactionForm.transactionType}
                        onChange={(event) =>
                          setTransactionForm((current) => ({
                            ...current,
                            transactionType: event.target.value,
                            category: "",
                            customCategory: "",
                          }))
                        }
                        className="app-select h-10"
                      >
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                      </select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Category</label>
                      <select
                        value={transactionForm.category}
                        onChange={(event) => {
                          const nextCategory = event.target.value;
                          setTransactionForm((current) => ({
                            ...current,
                            category: nextCategory,
                            customCategory: isTransactionOthersSelection(nextCategory) ? current.customCategory : "",
                          }));
                        }}
                        className="app-select h-10 transition hover:border-blue-300/90 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="">Select category</option>
                        {transactionCategoryOptions
                          .filter((item) => item.name !== TRANSACTION_CATEGORY_OTHERS_LABEL)
                          .map((item) => (
                            <option key={item.category_id} value={item.name}>
                              {item.name}
                            </option>
                          ))}
                        <option value={TRANSACTION_CATEGORY_OTHERS_VALUE}>{TRANSACTION_CATEGORY_OTHERS_LABEL}</option>
                      </select>
                      <div
                        className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
                          transactionCategoryIsOthers ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
                        }`}
                        aria-hidden={!transactionCategoryIsOthers}
                      >
                        <div className="overflow-hidden">
                          <label
                            htmlFor="transaction-custom-category"
                            className="text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                          >
                            Custom category
                          </label>
                          <input
                            id="transaction-custom-category"
                            value={transactionForm.customCategory}
                            onChange={(event) =>
                              setTransactionForm((current) => ({
                                ...current,
                                customCategory: event.target.value,
                              }))
                            }
                            className="app-input mt-1 h-10 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            placeholder="Enter custom income or expense category"
                            required={transactionCategoryIsOthers}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Amount</label>
                      <input
                        type="number"
                        min="0"
                        value={transactionForm.amount}
                        onChange={(event) => setTransactionForm((current) => ({ ...current, amount: event.target.value }))}
                        className="app-input h-10"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Payment</label>
                      <select value={transactionForm.paymentMethod} onChange={(event) => setTransactionForm((current) => ({ ...current, paymentMethod: event.target.value }))} className="app-select h-10">
                        {TRANSACTION_PAYMENT_METHODS.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</label>
                      <select value={transactionForm.status} onChange={(event) => setTransactionForm((current) => ({ ...current, status: event.target.value }))} className="app-select h-10">
                        {TRANSACTION_STATUSES.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {transactionError ? <p className="text-sm text-rose-600">{transactionError}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" disabled={saving} className="app-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-60">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {editingTransactionId ? "Update" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTransactionId("");
                        setTransactionError("");
                        setTransactionForm(emptyTransactionForm(transactionForm.transactionType));
                      }}
                      className="app-button-secondary rounded-xl px-4 py-2.5 text-sm font-medium"
                    >
                      Clear
                    </button>
                  </div>
                </form>
              </Panel>

              <div className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
                <button
                  type="button"
                  onClick={() => setCategoriesOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600">Library</p>
                    <h3 className="text-base font-semibold text-slate-900">Categories</h3>
                    <p className="text-xs text-slate-500">{categories.length} items</p>
                  </div>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${categoriesOpen ? "rotate-180" : ""}`} />
                </button>
                {categoriesOpen ? (
                  <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                    <form className="grid gap-2 sm:grid-cols-[120px_1fr_auto]" onSubmit={handleCategorySubmit}>
                      <select value={categoryForm.categoryType} onChange={(event) => setCategoryForm((current) => ({ ...current, categoryType: event.target.value }))} className="app-select h-10">
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </select>
                      <input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} className="app-input h-10" placeholder="New name" />
                      <button type="submit" disabled={saving} className="app-button-primary inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-60">
                        <Plus className="h-4 w-4" />
                        Add
                      </button>
                    </form>
                    {categoryError ? <p className="text-sm text-rose-600">{categoryError}</p> : null}
                    <div className="grid max-h-[min(52vh,420px)] gap-3 overflow-y-auto lg:grid-cols-2">
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Expense</p>
                        {(categoriesByType.expense.length > 0 ? categoriesByType.expense : EXPENSE_CATEGORY_SEEDS.map((name) => ({ category_id: name, name, is_default: true }))).map((item) => (
                          <div key={item.category_id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                              <p className="text-[10px] text-slate-400">{item.is_default ? "Default" : "Custom"}</p>
                            </div>
                            {!item.is_default ? (
                              <button type="button" onClick={() => handleDeleteCategory(item)} className="rounded-lg border border-rose-100 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Income</p>
                        {(categoriesByType.income.length > 0 ? categoriesByType.income : INCOME_SOURCE_SEEDS.map((name) => ({ category_id: name, name, is_default: true }))).map((item) => (
                          <div key={item.category_id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                              <p className="text-[10px] text-slate-400">{item.is_default ? "Default" : "Custom"}</p>
                            </div>
                            {!item.is_default ? (
                              <button type="button" onClick={() => handleDeleteCategory(item)} className="rounded-lg border border-rose-100 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <Panel
              title="Recent transactions"
              eyebrow="Filter & export"
              icon={ReceiptText}
              actions={
                <>
                  <button type="button" onClick={exportFilteredTransactionsXlsx} className="app-button-secondary inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold">
                    <Download className="h-3.5 w-3.5" />
                    Excel
                  </button>
                  <button type="button" onClick={exportTransactionsCsv} className="app-button-secondary inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold">
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </button>
                  <button type="button" onClick={printTransactionsReport} className="app-button-primary inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold">
                    <Printer className="h-3.5 w-3.5" />
                    PDF
                  </button>
                </>
              }
            >
              <p className="mb-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                Showing office ledger lines for <span className="font-semibold text-slate-800">{officeAppliedBounds.label}</span>. Loan collections and
                disbursements are not listed here — see <span className="font-semibold text-slate-800">Overview</span> for wallet and loan totals.
              </p>
              <div className="flex flex-wrap gap-2">
                <label className="relative min-w-[180px] flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} className="app-input h-10 w-full pl-9 text-sm" placeholder="Search…" />
                </label>
                <select value={transactionTypeFilter} onChange={(event) => setTransactionTypeFilter(event.target.value)} className="app-select h-10 min-w-[100px] text-sm">
                  <option value="all">All types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
                <select value={transactionStatusFilter} onChange={(event) => setTransactionStatusFilter(event.target.value)} className="app-select h-10 min-w-[110px] text-sm">
                  <option value="all">All status</option>
                  {TRANSACTION_STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select value={transactionCategoryFilter} onChange={(event) => setTransactionCategoryFilter(event.target.value)} className="app-select h-10 min-w-[120px] flex-1 text-sm">
                  <option value="all">All categories</option>
                  {transactionCategoryOptionsForFilter.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select value={transactionMonthFilter} onChange={(event) => setTransactionMonthFilter(event.target.value)} className="app-select h-10 min-w-[120px] text-sm">
                  <option value="all">All months</option>
                  {transactionMonthOptions.map((item) => (
                    <option key={item} value={item}>
                      {formatMonthLabel(item)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="app-table-wrap mt-3">
                <table className="app-table text-sm">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Category</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th className="w-[88px]"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTransactions.items.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <EmptyState message="No transactions match the selected filters." />
                        </td>
                      </tr>
                    ) : (
                      paginatedTransactions.items.map((item) => (
                        <tr key={item.transaction_id}>
                          <td className="whitespace-nowrap text-slate-600">{formatDate(item.date)}</td>
                          <td className="capitalize text-slate-600">{item.transaction_type}</td>
                          <td className="max-w-[140px] truncate font-medium text-slate-900">{item.category || "—"}</td>
                          <td className="font-semibold text-slate-950">{formatCurrency(item.amount)}</td>
                          <td>
                            <StatusBadge value={item.status} />
                          </td>
                          <td>
                            <div className="flex justify-end gap-1">
                              <button type="button" onClick={() => handleEditTransaction(item)} className="rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-600 hover:bg-slate-100" title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => handleDeleteTransaction(item)} className="rounded-lg border border-rose-100 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100" title="Delete">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                <PaginationControls page={paginatedTransactions.page} totalPages={paginatedTransactions.totalPages} onChange={setTransactionPage} />
              </div>
            </Panel>
          </>
        ) : null}

        {tab === "salary" ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-100/80 bg-gradient-to-br from-emerald-50/50 to-white px-4 py-3 text-center shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Paid</p>
                <p className="mt-1 text-lg font-bold text-emerald-800">{formatCurrency(payrollStrip.paid)}</p>
              </div>
              <div className="rounded-2xl border border-amber-100/80 bg-gradient-to-br from-amber-50/40 to-white px-4 py-3 text-center shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Pending</p>
                <p className="mt-1 text-lg font-bold text-amber-900">{formatCurrency(payrollStrip.pending)}</p>
              </div>
              <div className="rounded-2xl border border-blue-100/80 bg-gradient-to-br from-blue-50/40 to-white px-4 py-3 text-center shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">This month</p>
                <p className="mt-1 text-lg font-bold text-blue-900">{formatCurrency(payrollStrip.monthVal)}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{payrollStrip.count} records</p>
              </div>
            </div>

            <section className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <Panel title={editingSalaryId ? "Edit payroll" : "Payroll entry"} eyebrow="Salary" icon={BriefcaseBusiness}>
                <form className="space-y-2.5" onSubmit={handleSalarySubmit}>
                  <p className="text-xs text-slate-500">
                    ID <span className="font-mono font-semibold text-slate-800">{editingSalaryId || "auto on save"}</span>
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Employee</label>
                      <input value={salaryForm.employeeName} onChange={(event) => setSalaryForm((current) => ({ ...current, employeeName: event.target.value }))} className="app-input h-10" placeholder="Full name" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Employee ID</label>
                      <input value={salaryForm.employeeId} onChange={(event) => setSalaryForm((current) => ({ ...current, employeeId: event.target.value }))} className="app-input h-10" placeholder="ID" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Department</label>
                      <input value={salaryForm.department} onChange={(event) => setSalaryForm((current) => ({ ...current, department: event.target.value }))} className="app-input h-10" placeholder="Team" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Salary month</label>
                      <input type="month" value={salaryForm.salaryMonth} onChange={(event) => setSalaryForm((current) => ({ ...current, salaryMonth: event.target.value }))} className="app-input h-10" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Basic</label>
                      <input type="number" min="0" value={salaryForm.basicSalary} onChange={(event) => setSalaryForm((current) => ({ ...current, basicSalary: event.target.value }))} className="app-input h-10" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Bonus</label>
                      <input type="number" min="0" value={salaryForm.bonus} onChange={(event) => setSalaryForm((current) => ({ ...current, bonus: event.target.value }))} className="app-input h-10" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Deduction</label>
                      <input type="number" min="0" value={salaryForm.deduction} onChange={(event) => setSalaryForm((current) => ({ ...current, deduction: event.target.value }))} className="app-input h-10" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</label>
                      <select value={salaryForm.paymentStatus} onChange={(event) => setSalaryForm((current) => ({ ...current, paymentStatus: event.target.value }))} className="app-select h-10">
                        {SALARY_PAYMENT_STATUSES.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Payment date</label>
                      <input type="date" value={salaryForm.paymentDate} onChange={(event) => setSalaryForm((current) => ({ ...current, paymentDate: event.target.value }))} className="app-input h-10" />
                    </div>
                    <div className="rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-2 sm:col-span-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">Net pay</p>
                      <p className="text-xl font-bold text-blue-900">{formatCurrency(finalSalaryPreview)}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Notes</label>
                    <textarea value={salaryForm.description} onChange={(event) => setSalaryForm((current) => ({ ...current, description: event.target.value }))} className="app-textarea min-h-[64px] text-sm" placeholder="Optional" />
                  </div>
                  {salaryError ? <p className="text-sm text-rose-600">{salaryError}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" disabled={saving} className="app-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-60">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {editingSalaryId ? "Update" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSalaryId("");
                        setSalaryError("");
                        setSalaryForm(emptySalaryForm());
                      }}
                      className="app-button-secondary rounded-xl px-4 py-2.5 text-sm font-medium"
                    >
                      Clear
                    </button>
                  </div>
                </form>
              </Panel>

              <div className="flex h-full flex-col rounded-[24px] border border-slate-100 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600">Activity</p>
                    <h3 className="text-base font-semibold text-slate-900">Latest payroll</h3>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setSalaryReportPreviewOpen(true)}
                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-blue-600 shadow-sm transition hover:bg-blue-50"
                      title="View report"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={exportSalaryCsv} className="app-button-secondary rounded-lg px-2.5 py-1.5 text-xs font-semibold">
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={printSalaryReport} className="app-button-primary rounded-lg px-2.5 py-1.5 text-xs font-semibold">
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
                  {salaryRecords.slice(0, 6).length === 0 ? (
                    <EmptyState message="Saved payroll appears here." />
                  ) : (
                    salaryRecords.slice(0, 6).map((item) => (
                      <div key={item.salary_id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{item.employee_name}</p>
                          <p className="text-[11px] text-slate-500">{formatMonthLabel(item.salary_month)}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <p className="text-sm font-semibold text-slate-900">{formatCurrency(item.final_salary)}</p>
                          <StatusBadge value={item.payment_status} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <Panel title="Payroll register" eyebrow="History" icon={ReceiptText}>
              <p className="mb-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                Rows filtered by payment date within <span className="font-semibold text-slate-800">{officeAppliedBounds.label}</span> (salary month filters still apply below).
              </p>
              <div className="flex flex-wrap gap-2">
                <label className="relative min-w-[180px] flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={salarySearch} onChange={(event) => setSalarySearch(event.target.value)} className="app-input h-10 w-full pl-9 text-sm" placeholder="Search…" />
                </label>
                <select value={salaryStatusFilter} onChange={(event) => setSalaryStatusFilter(event.target.value)} className="app-select h-10 min-w-[120px] text-sm">
                  <option value="all">All status</option>
                  {SALARY_PAYMENT_STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select value={salaryMonthFilter} onChange={(event) => setSalaryMonthFilter(event.target.value)} className="app-select h-10 min-w-[120px] text-sm">
                  <option value="all">All months</option>
                  {salaryMonthOptions.map((item) => (
                    <option key={item} value={item}>
                      {formatMonthLabel(item)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="app-table-wrap mt-3">
                <table className="app-table text-sm">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Employee</th>
                      <th>Net</th>
                      <th>Status</th>
                      <th>Paid</th>
                      <th className="w-[88px]"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedSalary.items.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <EmptyState message="No salary history matches the selected filters." />
                        </td>
                      </tr>
                    ) : (
                      paginatedSalary.items.map((item) => (
                        <tr key={item.salary_id}>
                          <td className="whitespace-nowrap text-slate-600">{formatMonthLabel(item.salary_month)}</td>
                          <td>
                            <p className="font-medium text-slate-900">{item.employee_name}</p>
                            <p className="text-[11px] text-slate-500">{item.employee_id}</p>
                          </td>
                          <td className="font-semibold text-slate-950">{formatCurrency(item.final_salary)}</td>
                          <td>
                            <StatusBadge value={item.payment_status} />
                          </td>
                          <td className="text-slate-600">{formatDate(item.payment_date)}</td>
                          <td>
                            <div className="flex justify-end gap-1">
                              <button type="button" onClick={() => handleEditSalary(item)} className="rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-600 hover:bg-slate-100">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => handleDeleteSalary(item)} className="rounded-lg border border-rose-100 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                <PaginationControls page={paginatedSalary.page} totalPages={paginatedSalary.totalPages} onChange={setSalaryPage} />
              </div>
            </Panel>
          </>
        ) : null}

        {tab === "reports" ? (
          <>
            <Panel
              title="Reports"
              eyebrow="Period & filters"
              icon={BarChart3}
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => setAccountsAnalyticsPreviewOpen(true)}
                    className="group inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/70 hover:text-blue-900"
                  >
                    <Eye className="h-4 w-4 shrink-0 text-blue-600 transition group-hover:scale-105" aria-hidden />
                    View Report
                  </button>
                  <button type="button" onClick={exportReportPeriodXlsx} className="app-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium">
                    <Download className="h-4 w-4" />
                    Excel
                  </button>
                  <button type="button" onClick={exportReportCsv} className="app-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium">
                    <Download className="h-4 w-4" />
                    CSV
                  </button>
                  <button type="button" onClick={printAnalyticsReport} className="app-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium">
                    <Printer className="h-4 w-4" />
                    Print / PDF
                  </button>
                  <button type="button" onClick={handleSaveReportSnapshot} disabled={saving} className="app-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium disabled:opacity-60">
                    <Save className="h-4 w-4" />
                    Save snapshot
                  </button>
                </>
              }
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <p className="max-w-xl text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">Office period</span>{" "}
                  <span className="rounded-full bg-slate-900/5 px-2.5 py-1 text-sm font-semibold text-slate-900">{officeAppliedBounds.label}</span>
                  <span className="mt-1 block text-xs text-slate-500">Use the Office date range strip above (same filters as transactions, payroll & exports).</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={reportTypeFilter} onChange={(event) => setReportTypeFilter(event.target.value)} className="app-select h-10 min-w-[160px]">
                    <option value="all">All types</option>
                    <option value="income">Income only</option>
                    <option value="expense">Expense only</option>
                  </select>
                  <button type="button" onClick={() => setReportTypeFilter("all")} className="app-button-secondary inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium">
                    <RefreshCw className="h-4 w-4" />
                    Reset type filter
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <StatCard icon={TrendingUp} label="Income" value={formatCurrency(reportIncomeTotal)} hint="Office income in range." tone="text-emerald-700" />
                <StatCard icon={TrendingDown} label="Expense" value={formatCurrency(reportExpenseTotal)} hint="Books + payroll in range." tone="text-rose-700" />
                <StatCard
                  icon={Wallet}
                  label="Net profit / loss"
                  value={formatCurrency(reportOfficeNet)}
                  hint="Office ledger only."
                  tone={reportOfficeNet >= 0 ? "text-emerald-700" : "text-rose-700"}
                />
              </div>

              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <div className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Net trend</p>
                  <p className="mt-0.5 text-sm text-slate-600">Last six months — net after expenses (payroll included).</p>
                  <div className="mt-3">
                    <TrendGraph data={profitTrendData} compact />
                  </div>
                </div>
                <div className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Income & expense mix</p>
                  <p className="mt-0.5 text-sm text-slate-600">Office ledger categories for the selected report period.</p>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Income</p>
                      <div className="app-table-wrap mt-2 max-h-52 overflow-auto rounded-xl border border-emerald-100/80">
                        <table className="app-table text-sm">
                          <thead>
                            <tr>
                              <th>Category</th>
                              <th className="text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportCategoryRows.filter((row) => row.type === "income").length === 0 ? (
                              <tr>
                                <td colSpan={2}>
                                  <EmptyState message="No income categories this period." />
                                </td>
                              </tr>
                            ) : (
                              reportCategoryRows
                                .filter((row) => row.type === "income")
                                .map((item, idx) => (
                                  <tr key={`inc-${item.category}-${idx}`}>
                                    <td className="font-medium text-slate-900">{item.category}</td>
                                    <td className="text-right font-semibold text-emerald-700">{formatCurrency(item.amount)}</td>
                                  </tr>
                                ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-rose-700">Expense</p>
                      <div className="app-table-wrap mt-2 max-h-52 overflow-auto rounded-xl border border-rose-100/80">
                        <table className="app-table text-sm">
                          <thead>
                            <tr>
                              <th>Category</th>
                              <th className="text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportCategoryRows.filter((row) => row.type === "expense").length === 0 ? (
                              <tr>
                                <td colSpan={2}>
                                  <EmptyState message="No expense categories this period." />
                                </td>
                              </tr>
                            ) : (
                              reportCategoryRows
                                .filter((row) => row.type === "expense")
                                .map((item, idx) => (
                                  <tr key={`exp-${item.category}-${idx}`}>
                                    <td className="font-medium text-slate-900">{item.category}</td>
                                    <td className="text-right font-semibold text-rose-700">{formatCurrency(item.amount)}</td>
                                  </tr>
                                ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-[22px] border border-slate-100 bg-slate-50/60">
                <button
                  type="button"
                  onClick={() => setSnapshotsOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold text-slate-900 transition hover:bg-white/60"
                >
                  <span className="flex items-center gap-2">
                    <Download className="h-4 w-4 text-slate-500" />
                    Saved statements
                    <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-medium text-slate-600">{reportSnapshots.length}</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${snapshotsOpen ? "rotate-180" : ""}`} />
                </button>
                {snapshotsOpen ? (
                  <div className="border-t border-slate-100 bg-white px-2 pb-4 pt-2">
                    <div className="app-table-wrap">
                      <table className="app-table">
                        <thead>
                          <tr>
                            <th>Report ID</th>
                            <th>Title</th>
                            <th>Type</th>
                            <th>Period</th>
                            <th>Saved</th>
                            <th>By</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedReports.items.length === 0 ? (
                            <tr>
                              <td colSpan={7}>
                                <EmptyState message="Save a snapshot to keep downloadable statements here." />
                              </td>
                            </tr>
                          ) : (
                            paginatedReports.items.map((item) => (
                              <tr key={item.report_id}>
                                <td className="font-medium text-slate-900">{item.report_id}</td>
                                <td>{item.report_title || "—"}</td>
                                <td className="capitalize">{item.report_type || "—"}</td>
                                <td>{item.period_label || "—"}</td>
                                <td>{formatDate(item.created_label)}</td>
                                <td>{item.created_by_name || "—"}</td>
                                <td className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openPrintableReport({
                                          title: item.report_title || "Accounts snapshot",
                                          subtitle: item.period_label || "Saved report snapshot",
                                          columns: ["Metric", "Value"],
                                          rows: Object.entries(item.summary || {}).map(([key, value]) => [
                                            key,
                                            typeof value === "number" ? formatCurrency(value) : JSON.stringify(value),
                                          ]),
                                          reportMeta: accountsReportMeta,
                                        })
                                      }
                                      className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-600 hover:bg-slate-100"
                                      title="Print / PDF"
                                    >
                                      <Printer className="h-3.5 w-3.5" />
                                    </button>
                                    <button type="button" onClick={() => handleDeleteSnapshot(item)} className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100" title="Delete">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 px-2">
                      <PaginationControls page={paginatedReports.page} totalPages={paginatedReports.totalPages} onChange={setReportPage} />
                    </div>
                  </div>
                ) : null}
              </div>
            </Panel>
          </>
        ) : null}

        {!isReady ? (
          <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            Loading accounts data...
          </div>
        ) : null}
      </div>

      <EnterpriseReportPreview
        open={accountsOverviewPreviewOpen}
        onClose={() => setAccountsOverviewPreviewOpen(false)}
        title="Accounts · Finance overview"
        subtitle="Office ledger — income, expense & payroll (loan data excluded)"
        generatedAt={accountsReportMeta.generatedLabel}
        filterLines={accountsOverviewPreviewFilterLines}
        metrics={accountsOverviewPreviewMetrics}
        columns={accountsOverviewPreviewColumns}
        rows={accountsOverviewPreviewRows}
        pageSize={12}
        reportMeta={accountsReportMeta}
        pdfLoading={overviewPreviewPdfLoading}
        excelLoading={overviewPreviewExcelLoading}
        printLoading={overviewPrintLoading}
        onDownloadPdf={handleOverviewPreviewPdfDownload}
        onDownloadExcel={handleOverviewPreviewExcelDownload}
        shareTitle="Accounts finance overview — Ruthra"
      >
        {accountsOverviewPreviewSectionChildren}
      </EnterpriseReportPreview>

      <EnterpriseReportPreview
        open={accountsAnalyticsPreviewOpen}
        onClose={() => setAccountsAnalyticsPreviewOpen(false)}
        title="Accounts analytics"
        subtitle={`Office analytics · ${officeReportPeriodLabel} · ${reportTypeFilter === "all" ? "All types" : reportTypeFilter}`}
        generatedAt={accountsReportMeta.generatedLabel}
        filterLines={accountsAnalyticsPreviewFilterLines}
        metrics={accountsAnalyticsPreviewMetrics}
        columns={accountsAnalyticsPreviewColumns}
        rows={accountsAnalyticsPreviewRows}
        pageSize={12}
        reportMeta={accountsReportMeta}
        pdfLoading={analyticsPreviewPdfLoading}
        excelLoading={analyticsPreviewExcelLoading}
        printLoading={analyticsPrintLoading}
        onDownloadPdf={handleAnalyticsPreviewPdfDownload}
        onDownloadExcel={handleAnalyticsPreviewExcelDownload}
        onPrint={handleAnalyticsPreviewPrint}
        shareTitle="Accounts analytics — Ruthra"
      />

      <EnterpriseReportPreview
        open={salaryReportPreviewOpen}
        onClose={() => setSalaryReportPreviewOpen(false)}
        title="Salary report"
        subtitle="Payroll register (filtered)"
        generatedAt={accountsReportMeta.generatedLabel}
        filterLines={salaryPreviewFilterLines}
        metrics={salaryPreviewMetrics}
        columns={salaryPreviewColumns}
        rows={salaryPreviewRows}
        pageSize={12}
        reportMeta={accountsReportMeta}
        pdfLoading={salaryPreviewPdfLoading}
        excelLoading={salaryPreviewExcelLoading}
        printLoading={salaryPrintLoading}
        onDownloadPdf={handleSalaryPreviewPdfDownload}
        onDownloadExcel={handleSalaryPreviewExcelDownload}
        onPrint={handleSalaryPreviewPrint}
        shareTitle="Salary report — Ruthra"
      />
    </AdminLayout>
  );
}
