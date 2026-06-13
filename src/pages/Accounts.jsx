import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  Loader2,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Save,
  Search,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import EnterpriseReportPreview from "../components/reports/EnterpriseReportPreview.jsx";
import { ExportToolbar, ExportToolbarButton } from "../components/reports/ExportToolbar.jsx";
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
import { formatAssignedCentersLabel } from "../utils/employeeManagement";
import { sumInvestorDeposits } from "../utils/walletLedgerBalance";
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
  deleteAccountsTransaction,
  deleteSalaryRecord,
  ensureDefaultAccountsCategories,
  EXPENSE_CATEGORY_SEEDS,
  INCOME_SOURCE_SEEDS,
  SALARY_PAYMENT_STATUSES,
  subscribeAccountsCategories,
  subscribeAccountsSalary,
  subscribeAccountsTransactions,
  TRANSACTION_PAYMENT_METHODS,
  TRANSACTION_STATUSES,
  updateAccountsTransaction,
  updateSalaryRecord,
} from "../services/accounts";
import { listEmployees } from "../services/userAuth";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "transactions", label: "Transactions" },
  { key: "salary", label: "Salary" },
];

const VALID_TAB_KEYS = new Set(TABS.map((item) => item.key));

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `₹${amount.toLocaleString("en-IN")}`;
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

function getCategoryDocId(item) {
  return item?.category_id || item?.id || "";
}

function canDeleteCategory(item) {
  return Boolean(getCategoryDocId(item));
}

function getStatusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "completed" || value === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "pending" || value === "processing") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
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
    employeeCenter: "",
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

function normalizeEmployeeIdKey(value) {
  return String(value || "").trim().toUpperCase();
}

function resolveSalaryCenter(record, employeesByEmployeeId = new Map()) {
  const stored = String(record?.employee_center || "").trim();
  if (stored) return stored;
  const employee = employeesByEmployeeId.get(normalizeEmployeeIdKey(record?.employee_id));
  return employee ? formatAssignedCentersLabel(employee) : "--";
}

function salaryRecordToForm(item, employeesByEmployeeId = new Map()) {
  return {
    employeeName: item.employee_name || "",
    employeeId: item.employee_id || "",
    employeeCenter: resolveSalaryCenter(item, employeesByEmployeeId),
    department: item.department || "",
    salaryMonth: item.salary_month || "",
    basicSalary: String(item.basic_salary || ""),
    bonus: String(item.bonus || ""),
    deduction: String(item.deduction || ""),
    paymentStatus: item.payment_status || "pending",
    paymentDate: item.payment_date || "",
    description: item.description || "",
  };
}

function defaultPaidDateForSalary(salaryMonth, fallback = "") {
  const month = String(salaryMonth || "").trim();
  const today = fallback || new Date().toISOString().slice(0, 10);
  if (!month) return today;
  if (today.slice(0, 7) === month) return today;
  return `${month}-01`;
}

function emptyCategoryForm(type = "expense") {
  return {
    name: "",
    categoryType: type,
  };
}

function SummaryKpi({ label, value, compact = false, tone = "default" }) {
  return (
    <div className={`accounts-summary-kpi accounts-summary-kpi--${tone}${compact ? " accounts-summary-kpi--compact" : ""}`}>
      <p className="accounts-summary-kpi-label">{label}</p>
      <p className="accounts-summary-kpi-value">{value}</p>
    </div>
  );
}

function Panel({ title, eyebrow, actions, children, icon: Icon, compact = false }) {
  return (
    <section className={`app-panel min-w-0 max-w-full rounded-[24px] ${compact ? "accounts-panel-compact p-3" : "p-4"}`}>
      <div className={`flex flex-wrap items-start justify-between ${compact ? "gap-2" : "gap-3"}`}>
        <div className="flex items-start gap-2.5">
          {Icon ? (
            <div
              className={`app-icon-shell flex shrink-0 items-center justify-center rounded-2xl border border-white/70 ${
                compact ? "h-9 w-9" : "h-11 w-11"
              }`}
            >
              <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
            </div>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600">{eyebrow}</p> : null}
            <h3 className={`font-semibold text-slate-950 ${compact ? "text-base" : "text-lg"} ${eyebrow ? "mt-1" : ""}`}>{title}</h3>
          </div>
        </div>
        {actions ? <div className="app-export-toolbar">{actions}</div> : null}
      </div>
      <div className={compact ? "mt-2" : "mt-3"}>{children}</div>
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

function EmptyState({ message }) {
  return <div className="app-empty-state">{message}</div>;
}

function AccountsModal({ open, onClose, title, icon: Icon, children, wide = false }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="accounts-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`accounts-modal-panel app-panel w-full overflow-y-auto rounded-2xl p-4 shadow-xl sm:max-h-[min(90vh,760px)] sm:p-5 ${
          wide ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon ? (
              <div className="app-icon-shell flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/70">
                <Icon className="h-4 w-4" />
              </div>
            ) : null}
            <h3 id="accounts-modal-title" className="text-base font-semibold text-slate-950 sm:text-lg">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Accounts() {
  const { user, profile } = useAuth();
  const accountsReportMeta = useReportMeta("RFS-ACC");
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const todayLabel = new Date().toISOString().slice(0, 10);

  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [salaryRecords, setSalaryRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [ready, setReady] = useState({ transactions: false, categories: false, salary: false });
  const [loadError, setLoadError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [exportPdfLoading, setExportPdfLoading] = useState(false);
  const [exportExcelLoading, setExportExcelLoading] = useState(false);
  const [exportError, setExportError] = useState("");
  const [salaryReportPreviewOpen, setSalaryReportPreviewOpen] = useState(false);
  const [salaryPreviewPdfLoading, setSalaryPreviewPdfLoading] = useState(false);
  const [salaryPreviewExcelLoading, setSalaryPreviewExcelLoading] = useState(false);
  const [accountsOverviewPreviewOpen, setAccountsOverviewPreviewOpen] = useState(false);
  const [overviewPreviewPdfLoading, setOverviewPreviewPdfLoading] = useState(false);
  const [overviewPreviewExcelLoading, setOverviewPreviewExcelLoading] = useState(false);
  const [overviewPrintLoading, setOverviewPrintLoading] = useState(false);
  const [salaryPrintLoading, setSalaryPrintLoading] = useState(false);

  const [transactionForm, setTransactionForm] = useState(emptyTransactionForm());
  const [editingTransactionId, setEditingTransactionId] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionTypeFilter, setTransactionTypeFilter] = useState("all");
  const [transactionStatusFilter, setTransactionStatusFilter] = useState("all");
  const [transactionCategoryFilter, setTransactionCategoryFilter] = useState("all");
  const [transactionMonthFilter, setTransactionMonthFilter] = useState("all");

  const [salaryForm, setSalaryForm] = useState(emptySalaryForm());
  const [editingSalaryId, setEditingSalaryId] = useState("");
  const [salaryError, setSalaryError] = useState("");
  const [salarySearch, setSalarySearch] = useState("");
  const [salaryStatusFilter, setSalaryStatusFilter] = useState("all");
  const [salaryMonthFilter, setSalaryMonthFilter] = useState("all");

  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm());
  const [categoryError, setCategoryError] = useState("");
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [salaryModalOpen, setSalaryModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

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
    let active = true;
    setEmployeesLoading(true);
    listEmployees()
      .then((items) => {
        if (active) setEmployees(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (active) setEmployees([]);
      })
      .finally(() => {
        if (active) setEmployeesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    setLoadError("");
    setReady({ transactions: false, categories: false, salary: false });

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
    return () => {
      unsubTransactions();
      unsubCategories();
      unsubSalary();
    };
  }, [actor, user?.uid]);

  const didInitialSectionScroll = useRef(false);

  function scrollToAccountsSection(nextTab) {
    setSearchParams(nextTab === "overview" ? {} : { tab: nextTab });
    window.requestAnimationFrame(() => {
      if (nextTab === "overview") {
        document.getElementById("accounts-overview")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      document.getElementById(`accounts-${nextTab}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openTransactionModal(type = "expense") {
    setEditingTransactionId("");
    setTransactionError("");
    setTransactionForm(emptyTransactionForm(type));
    setTransactionModalOpen(true);
  }

  function closeTransactionModal() {
    setTransactionModalOpen(false);
    setEditingTransactionId("");
    setTransactionError("");
  }

  function openSalaryModal() {
    setEditingSalaryId("");
    setSalaryError("");
    setSalaryForm(emptySalaryForm());
    setSalaryModalOpen(true);
  }

  function closeSalaryModal() {
    setSalaryModalOpen(false);
    setEditingSalaryId("");
    setSalaryError("");
  }

  function openCategoryModal() {
    setCategoryForm(emptyCategoryForm("expense"));
    setCategoryError("");
    setCategoryModalOpen(true);
  }

  function closeCategoryModal() {
    setCategoryModalOpen(false);
    setCategoryError("");
  }

  function openAddExpenseCategory() {
    openCategoryModal();
  }

  useEffect(() => {
    if (didInitialSectionScroll.current) return;
    if (!tabParam || tabParam === "overview" || !VALID_TAB_KEYS.has(tabParam)) return;
    didInitialSectionScroll.current = true;
    const timer = window.setTimeout(() => {
      document.getElementById(`accounts-${tabParam}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [tabParam]);

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

  const employeesByEmployeeId = useMemo(() => {
    const map = new Map();
    employees.forEach((employee) => {
      const key = normalizeEmployeeIdKey(employee.employeeId);
      if (key) map.set(key, employee);
    });
    return map;
  }, [employees]);

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
      return [item.salary_id, item.employee_name, item.employee_id, item.department, resolveSalaryCenter(item, employeesByEmployeeId)].some((field) =>
        matchesSearch(field, query)
      );
    });
  }, [employeesByEmployeeId, officeAppliedBounds, salaryMonthFilter, salaryRecords, salarySearch, salaryStatusFilter]);


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

  const salaryByEmployeeIdForPeriod = useMemo(() => {
    const map = new Map();
    salaryRecordsForOfficeExport.forEach((record) => {
      const key = normalizeEmployeeIdKey(record.employee_id);
      if (!key) return;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, record);
        return;
      }
      const existingPaid = String(existing.payment_status).toLowerCase() === "paid";
      const recordPaid = String(record.payment_status).toLowerCase() === "paid";
      if (recordPaid && !existingPaid) {
        map.set(key, record);
      }
    });
    return map;
  }, [salaryRecordsForOfficeExport]);

  const lastPayrollEmployeeRows = useMemo(
    () =>
      employees
        .map((employee) => {
          const employeeId = employee.employeeId || "—";
          const key = normalizeEmployeeIdKey(employee.employeeId);
          const record = key ? salaryByEmployeeIdForPeriod.get(key) : null;
          const isPaid = record && String(record.payment_status).toLowerCase() === "paid";
          return {
            key: employee.id || employeeId,
            employeeId,
            name: employee.displayName || employee.username || "—",
            center: formatAssignedCentersLabel(employee),
            month: record?.salary_month ? formatMonthLabel(record.salary_month) : formatMonthLabel(currentMonth),
            net: record ? formatCurrency(record.final_salary) : "—",
            status: isPaid ? "paid" : "pending",
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name)),
    [currentMonth, employees, salaryByEmployeeIdForPeriod]
  );

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

  const payrollPeriodStats = useMemo(() => {
    const inRange = salaryRecordsForOfficeExport;
    const totalEmployees = employees.length;
    const paidEmployeeIds = new Set(
      inRange
        .filter((item) => String(item.payment_status).toLowerCase() === "paid")
        .map((item) => String(item.employee_id || "").trim().toUpperCase())
        .filter(Boolean)
    );
    const paid = paidEmployeeIds.size;
    const pending = Math.max(totalEmployees - paid, 0);
    return {
      total: totalEmployees,
      paid,
      pending,
      periodLabel: officeAppliedBounds.label,
    };
  }, [employees.length, salaryRecordsForOfficeExport, officeAppliedBounds.label]);

  const monthlyNetProfit = overviewMetrics.monthlyIncome - overviewMetrics.monthlyExpense;

  const pendingExpenseAmount = useMemo(
    () =>
      transactions
        .filter((item) => item.transaction_type === "expense" && item.status === "pending")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [transactions]
  );

  const monthlyExpenseCategoryBreakdown = useMemo(() => {
    const breakdown = new Map();
    completeExpenseTransactions.forEach((item) => {
      if (monthKey(item.date) !== currentMonth) return;
      const category = item.category || "Uncategorised";
      breakdown.set(category, (breakdown.get(category) || 0) + Number(item.amount || 0));
    });
    const salaryMonthTotal = paidSalaryRecords.reduce((sum, item) => {
      return monthKey(item.payment_date) === currentMonth ? sum + Number(item.final_salary || 0) : sum;
    }, 0);
    if (salaryMonthTotal > 0) {
      breakdown.set("Employee Salary", (breakdown.get("Employee Salary") || 0) + salaryMonthTotal);
    }
    const rows = Array.from(breakdown.entries()).map(([category, amount]) => ({ category, amount }));
    rows.sort((left, right) => right.amount - left.amount);
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    return rows.map((row) => ({ ...row, percent: total > 0 ? (row.amount / total) * 100 : 0 }));
  }, [completeExpenseTransactions, currentMonth, paidSalaryRecords]);

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
    return [
      "Finance center · Overview",
      `Snapshot date · ${todayLabel}`,
      `Office date range · ${officeAppliedBounds.label}`,
      "Office ledger only — wallet balance and loan given are on Overview.",
    ];
  }, [officeAppliedBounds.label, todayLabel]);

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
      setTransactionModalOpen(false);
    } catch (error) {
      setTransactionError(error.message || "Unable to save transaction");
    } finally {
      setSaving(false);
    }
  }

  function handleEditTransaction(item) {
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
    setTransactionModalOpen(true);
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

  function handleSalaryEmployeePick(employeeDocId) {
    const employee = employees.find((item) => item.id === employeeDocId);
    if (!employee) return;
    setSalaryForm((current) => ({
      ...current,
      employeeName: employee.displayName || employee.username || "",
      employeeId: employee.employeeId || "",
      employeeCenter: formatAssignedCentersLabel(employee),
      department: current.department || employee.department || "",
    }));
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
      setSalaryModalOpen(false);
    } catch (error) {
      setSalaryError(error.message || "Unable to save salary record");
    } finally {
      setSaving(false);
    }
  }

  function handleEditSalary(item) {
    setSalaryError("");
    setEditingSalaryId(item.salary_id);
    setSalaryForm(salaryRecordToForm(item, employeesByEmployeeId));
    setSalaryModalOpen(true);
  }

  async function handleMarkSalaryPaid(item) {
    if (String(item.payment_status).toLowerCase() === "paid") return;
    const paymentDate = defaultPaidDateForSalary(item.salary_month, todayLabel);
    if (!window.confirm(`Mark salary for ${item.employee_name || item.employee_id} as paid?`)) return;
    setSaving(true);
    setSalaryError("");
    setStatusMessage("");
    try {
      const payload = salaryRecordToForm(item, employeesByEmployeeId);
      await updateSalaryRecord(
        item.salary_id,
        {
          ...payload,
          paymentStatus: "paid",
          paymentDate,
        },
        actor
      );
      setStatusMessage("Salary marked as paid.");
    } catch (error) {
      setSalaryError(error.message || "Unable to mark salary as paid");
    } finally {
      setSaving(false);
    }
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
    const categoryId = getCategoryDocId(item);
    if (!categoryId) return;
    const defaultHint = item.is_default ? "This is a default category. " : "";
    if (!window.confirm(`${defaultHint}Delete category "${item.name}"?`)) return;
    setSaving(true);
    setCategoryError("");
    try {
      await deleteAccountsCategory(categoryId, actor);
      setStatusMessage("Category deleted.");
    } catch (error) {
      setCategoryError(error.message || "Unable to delete category");
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
        ["Metric", "Amount (₹)"],
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
        ["Metric", "Amount (₹)"],
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
    <AdminLayout>
      <div className="accounts-page app-grid-page grid min-w-0 max-w-full gap-4 overflow-x-hidden">
        <section id="accounts-overview" className="scroll-mt-20 min-w-0 max-w-full space-y-4">
          <div className="accounts-summary-kpi-grid">
            <SummaryKpi label="Wallet balance" value={formatCurrency(Math.round(liveWalletBalance))} tone="wallet" />
            <SummaryKpi label="Income" value={formatCurrency(Math.round(overviewMetrics.monthlyIncome))} tone="income" />
            <SummaryKpi label="Expense" value={formatCurrency(Math.round(overviewMetrics.monthlyExpense))} tone="expense" />
            <SummaryKpi
              label="Net"
              value={formatCurrency(Math.round(monthlyNetProfit))}
              tone={monthlyNetProfit < 0 ? "net-negative" : monthlyNetProfit > 0 ? "net-positive" : "net-neutral"}
            />
          </div>

          <div className="accounts-toolbar-card">
            <div className="accounts-payroll-period-stats">
              <div className="accounts-payroll-period-grid">
                <div className="accounts-payroll-period-stat accounts-payroll-period-stat--total">
                  <span className="accounts-payroll-period-stat-label">Total employees</span>
                  <span className="accounts-payroll-period-stat-value">{employeesLoading ? "—" : payrollPeriodStats.total}</span>
                </div>
                <div className="accounts-payroll-period-stat accounts-payroll-period-stat--paid">
                  <span className="accounts-payroll-period-stat-label">Paid</span>
                  <span className="accounts-payroll-period-stat-value">{payrollPeriodStats.paid}</span>
                </div>
                <div className="accounts-payroll-period-stat accounts-payroll-period-stat--pending">
                  <span className="accounts-payroll-period-stat-label">Pending</span>
                  <span className="accounts-payroll-period-stat-value">{payrollPeriodStats.pending}</span>
                </div>
              </div>
            </div>

            <div className="accounts-toolbar-side flex w-full min-w-0 flex-row flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:border-l lg:border-slate-200/80 lg:pl-3">
              <ExportToolbar className="accounts-toolbar-actions">
                <ExportToolbarButton
                  variant="income"
                  icon={Plus}
                  pressed={transactionModalOpen && transactionForm.transactionType === "income"}
                  onClick={() => openTransactionModal("income")}
                >
                  Add income
                </ExportToolbarButton>
                <ExportToolbarButton
                  variant="expense"
                  icon={Plus}
                  pressed={transactionModalOpen && transactionForm.transactionType === "expense"}
                  onClick={() => openTransactionModal("expense")}
                >
                  Add expense
                </ExportToolbarButton>
                <ExportToolbarButton variant="category" icon={Plus} pressed={categoryModalOpen} onClick={openCategoryModal}>
                  Add category
                </ExportToolbarButton>
                <ExportToolbarButton variant="salary" icon={Plus} pressed={salaryModalOpen} onClick={openSalaryModal}>
                  Pay salary
                </ExportToolbarButton>
              </ExportToolbar>
              <select
                value={officeDatePreset}
                onChange={(event) => applyOfficeDatePreset(event.target.value)}
                className="app-select accounts-office-period-select shrink-0"
                aria-label="Payroll period"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="this_week">This week</option>
                <option value="this_month">This month</option>
                <option value="custom">Custom</option>
              </select>
              {officeDatePreset === "custom" ? (
                <div className="accounts-toolbar-custom-range flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">From</label>
                    <input type="date" value={officeCustomFrom} onChange={(e) => setOfficeCustomFrom(e.target.value)} className="app-input h-10 min-w-[150px]" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">To</label>
                    <input type="date" value={officeCustomTo} onChange={(e) => setOfficeCustomTo(e.target.value)} className="app-input h-10 min-w-[150px]" />
                  </div>
                  <button type="button" onClick={applyOfficeCustomRange} className="app-button-primary h-10 rounded-xl px-4 text-sm font-semibold">
                    Apply
                  </button>
                  <button type="button" onClick={resetOfficeDateFilter} className="app-button-secondary h-10 rounded-xl px-4 text-sm font-semibold">
                    Reset
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {statusMessage ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-900">{statusMessage}</div>
          ) : null}
          {loadError ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800">{loadError}</div>
          ) : null}
          {exportError ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800">{exportError}</div>
          ) : null}
        </section>

        <div className="accounts-workspace scroll-mt-20 min-w-0 max-w-full">
          <div className="accounts-workspace-split">
          <div id="accounts-transactions" className="accounts-workspace-col">
            <div className="accounts-workspace-slot">
              <Panel
              compact
              title="Transaction ledger"
              icon={ReceiptText}
              actions={
                <>
                  <ExportToolbarButton variant="excel" onClick={exportFilteredTransactionsXlsx}>
                    Excel
                  </ExportToolbarButton>
                  <ExportToolbarButton variant="neutral" icon={Download} onClick={exportTransactionsCsv}>
                    CSV
                  </ExportToolbarButton>
                  <ExportToolbarButton variant="print" onClick={printTransactionsReport}>
                    Print
                  </ExportToolbarButton>
                </>
              }
            >
              <div className="accounts-tx-filter-row">
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={transactionSearch}
                    onChange={(event) => setTransactionSearch(event.target.value)}
                    className="app-input h-9 w-full !pl-9 pr-3 text-sm"
                    placeholder="Search…"
                  />
                </div>
                <div className="accounts-tx-filter-grid">
                  <select value={transactionMonthFilter} onChange={(event) => setTransactionMonthFilter(event.target.value)} className="app-select accounts-tx-filter-select">
                    <option value="all">Months</option>
                    {transactionMonthOptions.map((item) => (
                      <option key={item} value={item}>
                        {formatMonthLabel(item)}
                      </option>
                    ))}
                  </select>
                  <select value={transactionTypeFilter} onChange={(event) => setTransactionTypeFilter(event.target.value)} className="app-select accounts-tx-filter-select">
                    <option value="all">Types</option>
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                  </select>
                  <select value={transactionCategoryFilter} onChange={(event) => setTransactionCategoryFilter(event.target.value)} className="app-select accounts-tx-filter-select">
                    <option value="all">Categories</option>
                    {transactionCategoryOptionsForFilter.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <div className="accounts-tx-filter-grid-spacer" aria-hidden="true" />
                  <select value={transactionStatusFilter} onChange={(event) => setTransactionStatusFilter(event.target.value)} className="app-select accounts-tx-filter-select">
                    <option value="all">Status</option>
                    {TRANSACTION_STATUSES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="accounts-ledger-table-wrap app-table-wrap mt-2">
                <table className="app-table accounts-ledger-table accounts-ledger-table--tx text-sm">
                  <colgroup>
                    <col className="accounts-ledger-col-date" />
                    <col className="accounts-ledger-col-type" />
                    <col className="accounts-ledger-col-category" />
                    <col className="accounts-ledger-col-amount" />
                    <col className="accounts-ledger-col-status" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="accounts-ledger-col-date">Date</th>
                      <th className="accounts-ledger-col-type">Type</th>
                      <th className="accounts-ledger-col-category">Category</th>
                      <th className="accounts-ledger-col-amount">Amount</th>
                      <th className="accounts-ledger-col-status">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <EmptyState message="No transactions match the selected filters." />
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((item) => (
                        <tr key={item.transaction_id}>
                          <td className="accounts-ledger-col-date whitespace-nowrap text-slate-600" title={formatDate(item.date)}>
                            {formatDate(item.date)}
                          </td>
                          <td className="accounts-ledger-col-type capitalize whitespace-nowrap text-slate-600" title={item.transaction_type}>
                            {item.transaction_type}
                          </td>
                          <td className="accounts-ledger-col-category font-medium text-slate-900" title={item.category || "—"}>
                            {item.category || "—"}
                          </td>
                          <td className="accounts-ledger-col-amount font-semibold tabular-nums text-slate-950">{formatCurrency(item.amount)}</td>
                          <td className="accounts-ledger-col-status">
                            <StatusBadge value={item.status} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
            </div>
          </div>

          <div id="accounts-salary" className="accounts-workspace-col">
            <div className="accounts-workspace-slot">
              <Panel compact title="Payroll register" icon={BriefcaseBusiness}>
                <div className="accounts-payroll-filter-row">
                  <div className="relative min-w-0">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={salarySearch}
                      onChange={(event) => setSalarySearch(event.target.value)}
                      className="app-input h-9 w-full !pl-9 pr-3 text-sm"
                      placeholder="Search…"
                    />
                  </div>
                  <div className="accounts-payroll-filter-controls">
                    <select value={salaryStatusFilter} onChange={(event) => setSalaryStatusFilter(event.target.value)} className="app-select accounts-payroll-filter-select">
                      <option value="all">Status</option>
                      {SALARY_PAYMENT_STATUSES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                    <select value={salaryMonthFilter} onChange={(event) => setSalaryMonthFilter(event.target.value)} className="app-select accounts-payroll-filter-select">
                      <option value="all">Months</option>
                      {salaryMonthOptions.map((item) => (
                        <option key={item} value={item}>
                          {formatMonthLabel(item)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="accounts-ledger-table-wrap app-table-wrap mt-2">
                  <table className="app-table accounts-ledger-table accounts-ledger-table--payroll text-sm">
                    <colgroup>
                      <col className="accounts-ledger-col-date" />
                      <col className="accounts-ledger-col-employee-name" />
                      <col className="accounts-ledger-col-amount" />
                      <col className="accounts-ledger-col-status" />
                      <col className="accounts-ledger-col-paid" />
                      <col className="accounts-ledger-col-actions" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="accounts-ledger-col-date">Month</th>
                        <th className="accounts-ledger-col-employee-name">Name</th>
                        <th className="accounts-ledger-col-amount">Net</th>
                        <th className="accounts-ledger-col-status">Status</th>
                        <th className="accounts-ledger-col-paid">Paid</th>
                        <th className="accounts-ledger-col-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSalaryRecords.length === 0 ? (
                        <tr>
                          <td colSpan={6}>
                            <EmptyState message="No salary history matches the selected filters." />
                          </td>
                        </tr>
                      ) : (
                        filteredSalaryRecords.map((item) => {
                          const isPaid = String(item.payment_status).toLowerCase() === "paid";
                          return (
                          <tr key={item.salary_id}>
                            <td className="accounts-ledger-col-date whitespace-nowrap text-slate-600" title={formatMonthLabel(item.salary_month)}>
                              {formatMonthLabel(item.salary_month)}
                            </td>
                            <td className="accounts-ledger-col-employee-name truncate font-medium text-slate-900" title={item.employee_name || "—"}>
                              {item.employee_name || "—"}
                            </td>
                            <td className="accounts-ledger-col-amount font-semibold tabular-nums text-slate-950">{formatCurrency(item.final_salary)}</td>
                            <td className="accounts-ledger-col-status">
                              <StatusBadge value={item.payment_status} />
                            </td>
                            <td className="accounts-ledger-col-paid whitespace-nowrap text-slate-600">{formatDate(item.payment_date)}</td>
                            <td className="accounts-ledger-col-actions">
                              <div className="accounts-ledger-row-actions">
                                {!isPaid ? (
                                  <button
                                    type="button"
                                    title="Mark as paid"
                                    disabled={saving}
                                    onClick={() => handleMarkSalaryPaid(item)}
                                    className="rounded-lg border border-emerald-100 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                                <button type="button" onClick={() => handleEditSalary(item)} className="rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-600 hover:bg-slate-100">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" onClick={() => handleDeleteSalary(item)} className="rounded-lg border border-rose-100 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          </div>
          </div>

          <div className="accounts-workspace-slot accounts-workspace-slot--full">
            <div className="accounts-latest-payroll flex w-full flex-col rounded-[20px] border border-slate-100 bg-white p-3 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600">Activity</p>
                  <h3 className="text-base font-semibold text-slate-900">Last payroll</h3>
                </div>
                <ExportToolbar>
                  <ExportToolbarButton variant="view" title="View report" onClick={() => setSalaryReportPreviewOpen(true)}>
                    View
                  </ExportToolbarButton>
                  <ExportToolbarButton variant="neutral" icon={Download} onClick={exportSalaryCsv}>
                    CSV
                  </ExportToolbarButton>
                  <ExportToolbarButton variant="print" onClick={printSalaryReport}>
                    Print
                  </ExportToolbarButton>
                </ExportToolbar>
              </div>
              <div className="accounts-latest-payroll-table-wrap app-table-wrap mt-2">
                {employeesLoading ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-6 text-center text-sm text-slate-500">Loading employees…</div>
                ) : lastPayrollEmployeeRows.length === 0 ? (
                  <EmptyState message="No employees found. Add employees to track payroll status." />
                ) : (
                  <table className="app-table accounts-latest-payroll-table text-sm">
                    <colgroup>
                      <col className="accounts-payroll-col-id" />
                      <col className="accounts-payroll-col-name" />
                      <col className="accounts-payroll-col-center" />
                      <col className="accounts-payroll-col-month" />
                      <col className="accounts-payroll-col-net" />
                      <col className="accounts-payroll-col-status" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="accounts-payroll-col-id">Employee ID</th>
                        <th className="accounts-payroll-col-name">Name</th>
                        <th className="accounts-payroll-col-center">Center</th>
                        <th className="accounts-payroll-col-month">Month</th>
                        <th className="accounts-payroll-col-net">Net</th>
                        <th className="accounts-payroll-col-status">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastPayrollEmployeeRows.map((item) => (
                        <tr key={item.key}>
                          <td className="accounts-payroll-col-id whitespace-nowrap text-slate-700">{item.employeeId}</td>
                          <td className="accounts-payroll-col-name truncate font-medium text-slate-900">{item.name}</td>
                          <td className="accounts-payroll-col-center truncate text-slate-600" title={item.center}>
                            {item.center}
                          </td>
                          <td className="accounts-payroll-col-month whitespace-nowrap text-slate-600">{item.month}</td>
                          <td className="accounts-payroll-col-net whitespace-nowrap font-semibold tabular-nums text-slate-950">{item.net}</td>
                          <td className="accounts-payroll-col-status">
                            <StatusBadge value={item.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>

        {!isReady ? (
          <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            Loading accounts data...
          </div>
        ) : null}
      </div>

      <AccountsModal
        open={transactionModalOpen}
        onClose={closeTransactionModal}
        title={editingTransactionId ? "Edit transaction" : "Recent transaction"}
        icon={Plus}
      >
        <form className="space-y-3" onSubmit={handleTransactionSubmit}>
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
                  <label htmlFor="transaction-custom-category" className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
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
            <button type="button" onClick={closeTransactionModal} className="app-button-secondary rounded-xl px-4 py-2.5 text-sm font-medium">
              Clear
            </button>
          </div>
        </form>
      </AccountsModal>

      <AccountsModal open={categoryModalOpen} onClose={closeCategoryModal} title="Categories" icon={Tag} wide>
        <div className="space-y-3">
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
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Expense</p>
              {(categoriesByType.expense.length > 0 ? categoriesByType.expense : EXPENSE_CATEGORY_SEEDS.map((name) => ({ category_id: name, name, is_default: true }))).map((item) => (
                <div key={getCategoryDocId(item) || `${item.name}-expense`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                    <p className="text-[10px] text-slate-400">{item.is_default ? "Default" : "Custom"}</p>
                  </div>
                  {canDeleteCategory(item) ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(item)}
                      disabled={saving}
                      className="shrink-0 rounded-lg border border-rose-100 bg-rose-50 p-1.5 text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      title={`Delete ${item.name}`}
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Income</p>
              {(categoriesByType.income.length > 0 ? categoriesByType.income : INCOME_SOURCE_SEEDS.map((name) => ({ category_id: name, name, is_default: true }))).map((item) => (
                <div key={getCategoryDocId(item) || `${item.name}-income`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                    <p className="text-[10px] text-slate-400">{item.is_default ? "Default" : "Custom"}</p>
                  </div>
                  {canDeleteCategory(item) ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(item)}
                      disabled={saving}
                      className="shrink-0 rounded-lg border border-rose-100 bg-rose-50 p-1.5 text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      title={`Delete ${item.name}`}
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          {monthlyExpenseCategoryBreakdown.length > 0 ? (
            <div className="border-t border-slate-100 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Expenses this month</p>
              <ul className="mt-2 space-y-1.5">
                {monthlyExpenseCategoryBreakdown.map((item) => (
                  <li key={item.category} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-slate-700">{item.category}</span>
                    <span className="shrink-0 font-medium text-slate-900">{formatCurrency(item.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </AccountsModal>

      <AccountsModal
        open={salaryModalOpen}
        onClose={closeSalaryModal}
        title={editingSalaryId ? "Edit payroll" : "Payroll entry"}
        icon={BriefcaseBusiness}
      >
        <form className="space-y-2.5" onSubmit={handleSalarySubmit}>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Select employee</label>
            <select
              value={employees.find((employee) => normalizeEmployeeIdKey(employee.employeeId) === normalizeEmployeeIdKey(salaryForm.employeeId))?.id || ""}
              onChange={(event) => handleSalaryEmployeePick(event.target.value)}
              className="app-select h-10"
            >
              <option value="">Choose employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {(employee.displayName || employee.username || "Employee") + (employee.employeeId ? ` (${employee.employeeId})` : "")}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Employee</label>
              <input value={salaryForm.employeeName} onChange={(event) => setSalaryForm((current) => ({ ...current, employeeName: event.target.value }))} className="app-input h-10" placeholder="Full name" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Employee ID</label>
              <input value={salaryForm.employeeId} onChange={(event) => setSalaryForm((current) => ({ ...current, employeeId: event.target.value }))} className="app-input h-10" placeholder="ID" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Center</label>
              <input value={salaryForm.employeeCenter} onChange={(event) => setSalaryForm((current) => ({ ...current, employeeCenter: event.target.value }))} className="app-input h-10" placeholder="Assigned center" />
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
              <select
                value={salaryForm.paymentStatus}
                onChange={(event) => {
                  const nextStatus = event.target.value;
                  setSalaryForm((current) => ({
                    ...current,
                    paymentStatus: nextStatus,
                    paymentDate: nextStatus === "paid" && !current.paymentDate ? todayLabel : current.paymentDate,
                  }));
                }}
                className="app-select h-10"
              >
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
              <p className="text-lg font-bold text-blue-900">{formatCurrency(finalSalaryPreview)}</p>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Notes</label>
            <textarea value={salaryForm.description} onChange={(event) => setSalaryForm((current) => ({ ...current, description: event.target.value }))} className="app-textarea min-h-[56px] text-sm" placeholder="Optional" />
          </div>
          {salaryError ? <p className="text-sm text-rose-600">{salaryError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="app-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {editingSalaryId ? "Update" : "Save"}
            </button>
            <button type="button" onClick={closeSalaryModal} className="app-button-secondary rounded-xl px-4 py-2 text-sm font-medium">
              Clear
            </button>
          </div>
        </form>
      </AccountsModal>

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
