import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Printer,
  Search,
} from "lucide-react";
import { useLoanDataSync } from "../../context/LoanDataSyncContext";
import useAuth from "../../hooks/useAuth";
import { LOAN_CENTERS_CHANGED_EVENT } from "../../constants/loanCenterStorage";
import { loadLoanCenters } from "../../constants/dayCenters";
import { listEmployees } from "../../services/userAuth";
import {
  employeeHasWholeDayAssignment,
  getAssignedSubCentersForDayCenter,
  getDayCentersFromAssignments,
} from "../../utils/employeeScope";
import {
  employeeMatchesCollector,
  getCollectionCustomersForEmployeeCenters,
  getEmployeeAssignedCenters,
} from "../../utils/employeeManagement";
import {
  enrichCustomerForCollection,
  prepareCustomersForCollectionReport,
} from "../../utils/collectionCustomerUtils";
import { NO_SUB_CENTER_LABEL, resolveCustomerCenterDisplay } from "../../utils/centerDisplay";
import {
  collectionReportCellBgClass,
  collectionReportCellTextClass,
  getCollectionReportAlert,
} from "../../utils/collectionAlerts";
import {
  buildCollectionReportRowsForCustomer,
  resolveReportPaidColumnAmount,
} from "../../utils/collectionReportRows";
import {
  findEmployeeForCollectorName,
  formatCurrency,
} from "../../utils/employeeCollectionDetails";
const REPORT_COLUMNS = [
  { key: "serial", label: "S.NO", width: "3.5rem", align: "center" },
  { key: "customerId", label: "CUSTOMER ID", width: "10rem", align: "left", truncate: true },
  { key: "customerName", label: "CUSTOMER NAME", width: "10rem", align: "left", truncate: true },
  { key: "phoneNumber", label: "PHONE NUMBER", width: "9rem", align: "left", truncate: true },
  { key: "nomineeName", label: "NOMINEE NAME", width: "9rem", align: "left", truncate: true },
  { key: "loanDate", label: "LOAN DATE", width: "7rem", align: "left" },
  { key: "currentTenure", label: "CURRENT TENURE", width: "8.5rem", align: "center" },
  { key: "currentDueAmount", label: "CURRENT DUE", width: "7.5rem", align: "right" },
  { key: "pendingTenuresLabel", label: "PENDING", width: "6rem", align: "center", truncate: true },
  { key: "pendingAmountDisplay", label: "PENDING AMOUNT", width: "9rem", align: "right", clickable: true },
  { key: "balanceAmount", label: "BALANCE TENURE", width: "8rem", align: "right" },
  { key: "paid", label: "PAID", width: "8rem", align: "right" },
  { key: "entry", label: "ENTRY", width: "8rem", align: "left", input: true },
];

const REPORT_TABLE_MIN_WIDTH_REM = REPORT_COLUMNS.reduce(
  (sum, column) => sum + Number.parseFloat(column.width),
  0
);
const REPORT_TABLE_MIN_WIDTH_PX = Math.round(REPORT_TABLE_MIN_WIDTH_REM * 16);

function cellAlignClass(align) {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function reportTableHeaderClass(align) {
  return `whitespace-nowrap border-b border-r border-slate-200 px-3 py-2.5 align-middle text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 last:border-r-0 ${cellAlignClass(align)}`;
}

function reportTableBodyClass(align, extra = "", { truncate = false } = {}) {
  const clipClass = truncate ? "max-w-0 overflow-hidden" : "whitespace-nowrap";
  return `${clipClass} border-r border-slate-100 px-3 py-2.5 align-middle last:border-r-0 ${cellAlignClass(align)} ${extra}`.trim();
}

function reportTableCellContent(value, { truncate = false, title } = {}) {
  const displayTitle = title ?? String(value ?? "");
  if (truncate) {
    return (
      <span className="block truncate" title={displayTitle}>
        {value}
      </span>
    );
  }
  return <span>{value}</span>;
}
import {
  groupReportRowsBySubCenter,
  printCollectionCustomerReport,
  validateCollectionPrintSelection,
} from "../../utils/collectionCustomerReportPrint";
import { reportDateStamp } from "../../utils/reportFilenames";
import {
  commitPaidDraftEntry,
  loadCollectionReportPaidState,
  makePaidEntryKey,
  saveCollectionReportPaidState,
} from "../../utils/collectionReportPaidStorage";
import { normalizeCollectionFrequency } from "../../utils/loanTimelineDates";

const FREQUENCY_OPTIONS = ["All", "Daily", "Weekly", "Monthly"];
const PAYMENT_STATUS_OPTIONS = ["All", "Paid", "Unpaid"];

function parseInputDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ReportSummaryCard({ label, value, icon: Icon, accent = "blue" }) {
  const iconShellClass =
    accent === "green"
      ? "bg-emerald-50 text-emerald-600"
      : accent === "orange"
        ? "bg-amber-50 text-amber-600"
        : accent === "purple"
          ? "bg-violet-50 text-violet-600"
          : "bg-blue-50 text-blue-600";

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-slate-500">
            {label}
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums leading-tight tracking-tight text-slate-950 sm:text-xl">
            {value}
          </p>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconShellClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function downloadReportRowsCsv(rows, paidState, stamp = reportDateStamp()) {
  const headers = REPORT_COLUMNS.map((column) => column.label);
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((row, index) =>
      REPORT_COLUMNS.map((column) => {
        if (column.key === "serial") return escape(index + 1);
        if (column.key === "paid") {
          const amount = resolveReportPaidColumnAmount(row, paidState);
          return escape(amount > 0 ? formatCurrency(amount) : "");
        }
        if (column.key === "entry") {
          const entryKey =
            row.installmentNumber != null
              ? makePaidEntryKey(row.customerId, row.installmentNumber)
              : "";
          return escape(entryKey ? paidState.drafts[entryKey] ?? "" : "");
        }
        return escape(row[column.key] ?? "");
      }).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `collection-report-${stamp}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function PendingAmountModal({ row, onClose }) {
  if (!row) return null;
  const breakdown = Array.isArray(row.pendingBreakdown) ? row.pendingBreakdown : [];
  const total = Number(row.pendingAmountRaw || 0);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pending-amount-title"
        className="w-full max-w-lg overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Pending amount</p>
          <h3 id="pending-amount-title" className="mt-1 text-lg font-semibold text-slate-950">
            {row.customerName || row.customerId}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {row.customerId}
            {row.currentTenure ? ` · Current ${row.currentTenure}` : ""}
          </p>
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-auto px-5 py-4 sm:px-6">
          {breakdown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-600">
              No previous unpaid tenures.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-2 py-2">Tenure No</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="px-2 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {breakdown.map((line) => (
                  <tr key={line.installmentNumber}>
                    <td className="px-2 py-2.5 font-medium text-slate-900">{line.installmentNumber}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-800">{line.amountDisplay}</td>
                    <td className="px-2 py-2.5 text-center">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          line.status === "Partial"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {line.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
          <p className="text-sm font-semibold text-slate-900">
            Total Pending Amount:{" "}
            <span className="tabular-nums text-rose-700">{formatCurrency(total)}</span>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="app-button-secondary rounded-xl px-4 py-2 text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CollectionReportPanel() {
  const { customers, entries, loanApplications, loading: syncLoading } = useLoanDataSync();
  const { user, profile } = useAuth();
  const isEmployeeUser = profile?.role === "employee";
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employeeFilter, setEmployeeFilter] = useState("All");
  const [centerFilter, setCenterFilter] = useState("All");
  const [subCenterFilter, setSubCenterFilter] = useState("All");
  const [frequencyFilter, setFrequencyFilter] = useState("All");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [printLoading, setPrintLoading] = useState(false);
  const [paidState, setPaidState] = useState(() => loadCollectionReportPaidState());
  const [pendingAmountRow, setPendingAmountRow] = useState(null);
  const paidInputRefs = useRef({});
  const [centersRevision, setCentersRevision] = useState(0);
  useEffect(() => {
    listEmployees()
      .then(setEmployees)
      .finally(() => setEmployeesLoading(false));
  }, []);

  const collectionEligibleCustomers = useMemo(
    () => prepareCustomersForCollectionReport(customers, loanApplications),
    [customers, loanApplications]
  );

  const allCenters = useMemo(() => loadLoanCenters(), [centersRevision]);

  useEffect(() => {
    const refresh = () => setCentersRevision((current) => current + 1);
    window.addEventListener(LOAN_CENTERS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(LOAN_CENTERS_CHANGED_EVENT, refresh);
  }, []);

  const dayCenters = useMemo(
    () => allCenters.filter((center) => !center.parent).map((center) => center.label),
    [allCenters]
  );

  const subCentersByDay = useMemo(() => {
    const map = new Map();
    allCenters.forEach((center) => {
      if (!center.parent) return;
      if (!map.has(center.parent)) map.set(center.parent, []);
      map.get(center.parent).push(center.label);
    });
    map.forEach((list, key) => map.set(key, [...new Set(list)].sort((a, b) => a.localeCompare(b))));
    return map;
  }, [allCenters]);

  const loggedInEmployee = useMemo(() => {
    if (!isEmployeeUser || !user?.uid) return null;
    return employees.find((employee) => employee.id === user.uid) || profile;
  }, [employees, isEmployeeUser, profile, user?.uid]);

  const selectedEmployee = useMemo(() => {
    if (isEmployeeUser) return loggedInEmployee;
    return employees.find((employee) => employee.id === employeeFilter) || null;
  }, [employeeFilter, employees, isEmployeeUser, loggedInEmployee]);

  const scopedEmployeeAssignments = useMemo(
    () => getEmployeeAssignedCenters(selectedEmployee || {}),
    [selectedEmployee]
  );

  const entriesByCustomerId = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => {
      if (!map.has(entry.customerId)) map.set(entry.customerId, []);
      map.get(entry.customerId).push(entry);
    });
    return map;
  }, [entries]);

  const scopedCustomers = useMemo(() => {
    if (isEmployeeUser && loggedInEmployee) {
      return getCollectionCustomersForEmployeeCenters(collectionEligibleCustomers, loggedInEmployee, allCenters);
    }
    if (!selectedEmployee) return collectionEligibleCustomers;
    return getCollectionCustomersForEmployeeCenters(collectionEligibleCustomers, selectedEmployee, allCenters);
  }, [allCenters, collectionEligibleCustomers, isEmployeeUser, loggedInEmployee, selectedEmployee]);

  const dayCenterFilterOptions = useMemo(() => {
    if (isEmployeeUser || selectedEmployee) {
      const assignedDays = getDayCentersFromAssignments(scopedEmployeeAssignments, allCenters);
      return ["All", ...assignedDays];
    }
    return ["All", ...dayCenters];
  }, [allCenters, dayCenters, isEmployeeUser, scopedEmployeeAssignments, selectedEmployee]);

  const subCenterFilterOptions = useMemo(() => {
    if (centerFilter === "All") return [];
    const allSubs = subCentersByDay.get(centerFilter) || [];

    if (isEmployeeUser || selectedEmployee) {
      const assignedSubs = getAssignedSubCentersForDayCenter(
        centerFilter,
        scopedEmployeeAssignments,
        allCenters
      );
      const options = ["All"];
      if (employeeHasWholeDayAssignment(centerFilter, scopedEmployeeAssignments, allCenters)) {
        options.push(NO_SUB_CENTER_LABEL, ...allSubs);
      } else {
        options.push(...assignedSubs);
      }
      return options;
    }

    return ["All", NO_SUB_CENTER_LABEL, ...allSubs];
  }, [
    allCenters,
    centerFilter,
    isEmployeeUser,
    scopedEmployeeAssignments,
    selectedEmployee,
    subCentersByDay,
  ]);

  const reportRows = useMemo(() => {
    const fromDate = parseInputDate(dateFrom);
    const toDate = parseInputDate(dateTo);
    const query = search.trim().toLowerCase();

    return scopedCustomers
      .filter((customer) => {
        const { dayCenter, subCenter } = resolveCustomerCenterDisplay(customer, allCenters);
        if (centerFilter !== "All" && dayCenter !== centerFilter) return false;
        if (subCenterFilter !== "All" && subCenter !== subCenterFilter) return false;
        if (frequencyFilter !== "All") {
          if (normalizeCollectionFrequency(customer.collectionFrequency) !== frequencyFilter) return false;
        }
        if (!query) return true;
        return (
          String(customer.customerName || "").toLowerCase().includes(query) ||
          String(customer.customerId || "").toLowerCase().includes(query) ||
          String(customer.mobileNumber || "").toLowerCase().includes(query)
        );
      })
      .flatMap((customer) => {
        const allCustomerEntries = entriesByCustomerId.get(customer.customerId) || [];
        const latestPaid = allCustomerEntries
          .filter((entry) => String(entry.approvalStatus || "").toLowerCase() === "approved")
          .sort((a, b) => String(b.collectionDate || "").localeCompare(String(a.collectionDate || "")))[0];
        const rowEmployee =
          selectedEmployee || findEmployeeForCollectorName(latestPaid?.collectorName, employees);
        const { dayCenter, subCenter } = resolveCustomerCenterDisplay(customer, allCenters);
        return buildCollectionReportRowsForCustomer(
          enrichCustomerForCollection(customer),
          allCustomerEntries,
          {
            dayCenter,
            subCenter,
            employeeId: rowEmployee?.employeeId || "--",
            employeeName: rowEmployee?.displayName || rowEmployee?.username || latestPaid?.collectorName || "--",
          },
          paymentStatusFilter,
          { paidState }
        );
      })
      .sort((a, b) => {
        const nameCompare = a.customerName.localeCompare(b.customerName);
        if (nameCompare !== 0) return nameCompare;
        return (a.installmentNumber || 0) - (b.installmentNumber || 0);
      });
  }, [
    allCenters,
    centerFilter,
    subCenterFilter,
    dateFrom,
    dateTo,
    entriesByCustomerId,
    frequencyFilter,
    paymentStatusFilter,
    paidState,
    scopedCustomers,
    search,
    selectedEmployee,
    employees,
  ]);

  const stats = useMemo(() => {
    const customerIds = new Set(reportRows.map((row) => row.customerId));
    let totalCollected = 0;
    let pendingCollection = 0;
    let todayCollection = 0;
    const todayKey = new Date().toISOString().slice(0, 10);

    entries.forEach((entry) => {
      if (!customerIds.has(entry.customerId)) return;
      if (selectedEmployee && !employeeMatchesCollector(selectedEmployee, entry)) return;
      const amount = Number(entry.amount || 0);
      const approved = String(entry.approvalStatus || "").toLowerCase() === "approved";
      if (approved) {
        totalCollected += amount;
        if ((entry.collectionDate || "").slice(0, 10) === todayKey) todayCollection += amount;
      } else {
        pendingCollection += amount;
      }
    });

    reportRows.forEach((row) => {
      const balance = Number(String(row.balanceAmount || "0").replace(/[^\d.-]/g, "") || 0);
      if (balance > 0) pendingCollection += balance;
    });

    return {
      assignedCustomers: reportRows.length,
      totalCollected,
      pendingCollection,
      todayCollection,
    };
  }, [entries, reportRows, selectedEmployee]);

  useEffect(() => {
    setSubCenterFilter("All");
  }, [centerFilter]);

  useEffect(() => {
    if (subCenterFilter === "All") return;
    if (!subCenterFilterOptions.includes(subCenterFilter)) {
      setSubCenterFilter("All");
    }
  }, [subCenterFilter, subCenterFilterOptions]);

  useEffect(() => {
    saveCollectionReportPaidState(paidState);
  }, [paidState]);

  const updatePaidAmountEntry = (entryKey, value) => {
    const sanitized = String(value || "").replace(/[^\d.]/g, "");
    setPaidState((current) => ({
      ...current,
      drafts: {
        ...current.drafts,
        [entryKey]: sanitized,
      },
    }));
  };

  const commitPaidAmountEntry = useCallback((entryKey) => {
    setPaidState((current) => commitPaidDraftEntry(current, entryKey));
  }, []);

  const handlePaidKeyDown = (event, entryKey, rowIndex) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitPaidAmountEntry(entryKey);
    const nextRow = reportRows[rowIndex + 1];
    if (nextRow?.installmentNumber) {
      const nextKey = makePaidEntryKey(nextRow.customerId, nextRow.installmentNumber);
      const nextInput = paidInputRefs.current[nextKey];
      nextInput?.focus();
      nextInput?.select();
      return;
    }
    event.currentTarget.blur();
  };

  const printEmployee = selectedEmployee || loggedInEmployee;
  const printSelectionHint = validateCollectionPrintSelection({
    mainCenter: centerFilter,
  });

  const handlePrint = useCallback(() => {
    const validationError = validateCollectionPrintSelection({
      mainCenter: centerFilter,
    });
    if (validationError) {
      window.alert(validationError);
      return;
    }

    setPrintLoading(true);
    try {
      let sections = groupReportRowsBySubCenter({
        reportRows,
        mainCenter: centerFilter,
        allCenters,
        employee: printEmployee || null,
      });
      if (subCenterFilter !== "All") {
        sections = sections.filter((section) => section.subCenter === subCenterFilter);
      }

      if (!sections.some((section) => section.rows?.length)) {
        window.alert("No customers found for the selected filters. Adjust Employee, Main center, or Payment filter.");
        return;
      }

      const employeeLabel =
        printEmployee?.displayName ||
        printEmployee?.username ||
        printEmployee?.employeeId ||
        (isEmployeeUser ? "—" : "All employees");

      printCollectionCustomerReport({
        employeeName: employeeLabel,
        mainCenter: centerFilter,
        sections,
        paidState,
        reportId: `RFS-CRR-${reportDateStamp()}`,
        filterLines: [
          `Employee: ${employeeLabel}`,
          `Main center: ${centerFilter}`,
          `Sub-center: ${subCenterFilter === "All" ? "All" : subCenterFilter}`,
          `Collection type: ${frequencyFilter === "All" ? "All" : frequencyFilter}`,
          `Payment: ${paymentStatusFilter === "All" ? "All" : paymentStatusFilter}`,
        ],
        summaryCards: [
          { label: "Assigned customers", value: String(stats.assignedCustomers) },
          { label: "Total collected", value: formatCurrency(stats.totalCollected) },
          { label: "Pending collection", value: formatCurrency(stats.pendingCollection) },
          { label: "Today's collection", value: formatCurrency(stats.todayCollection) },
        ],
      });
    } catch (printError) {
      console.error(printError);
      window.alert(printError?.message || "Print failed. Please try again.");
    } finally {
      setPrintLoading(false);
    }
  }, [
    allCenters,
    centerFilter,
    frequencyFilter,
    isEmployeeUser,
    paidState,
    paymentStatusFilter,
    printEmployee,
    reportRows,
    stats,
    subCenterFilter,
  ]);

  const loading = syncLoading || employeesLoading;

  return (
    <section className="app-panel min-w-0 p-5 md:p-6">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ReportSummaryCard
          label="Assigned customers"
          value={String(stats.assignedCustomers)}
          icon={Eye}
          accent="blue"
        />
        <ReportSummaryCard
          label="Total collected"
          value={formatCurrency(stats.totalCollected)}
          icon={FileSpreadsheet}
          accent="green"
        />
        <ReportSummaryCard
          label="Pending collection"
          value={formatCurrency(stats.pendingCollection)}
          icon={Clock}
          accent="orange"
        />
        <ReportSummaryCard
          label="Today's collection"
          value={formatCurrency(stats.todayCollection)}
          icon={CalendarDays}
          accent="purple"
        />
      </div>

      <div className="collection-report-filters mt-4 space-y-3 rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:items-end">
          <div className="min-w-0 sm:col-span-2 lg:col-span-3 xl:col-span-1">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Search customer
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, ID, or phone number..."
                className="app-input w-full !pl-11 pr-4 bg-slate-50"
              />
            </div>
          </div>
          {!isEmployeeUser ? (
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Employee
              </label>
              <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="app-select w-full">
                <option value="All">All employees</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employeeId} - {employee.displayName || employee.username}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Employee
              </label>
              <div className="app-input flex min-h-[42px] items-center bg-slate-50 text-sm text-slate-700">
                {loggedInEmployee?.displayName || loggedInEmployee?.username || "You"}
              </div>
            </div>
          )}
          <div className="min-w-0">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Main center
            </label>
            <select
              value={centerFilter}
              onChange={(e) => setCenterFilter(e.target.value)}
              className="app-select w-full"
            >
              {dayCenterFilterOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "All" ? "All centers" : option}
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
              className="app-select w-full"
              disabled={centerFilter === "All"}
            >
              <option value="All">
                {centerFilter === "All" ? "Select center first" : "All sub-centers"}
              </option>
              {subCenterFilterOptions
                .filter((option) => option !== "All")
                .map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Collection type
            </label>
            <select value={frequencyFilter} onChange={(e) => setFrequencyFilter(e.target.value)} className="app-select w-full">
              {FREQUENCY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "All" ? "All types" : `${option} collection`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 items-end">
          <div className="min-w-0">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Payment
            </label>
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="app-select w-full"
            >
              {PAYMENT_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "All" ? "All" : option}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Date from
            </label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="app-input w-full" />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Date to
            </label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="app-input w-full" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={printLoading}
            onClick={handlePrint}
            title={printSelectionHint || "Print customer report grouped by sub-center"}
            className="collection-neutral-btn inline-flex h-[42px] items-center gap-2 rounded-2xl px-4 text-sm font-medium"
          >
            <Printer className="h-4 w-4 text-slate-600" />
            {printLoading ? "Printing…" : "Print"}
          </button>
          <button
            type="button"
            className="collection-neutral-btn inline-flex h-[42px] items-center gap-2 rounded-2xl px-4 text-sm font-medium"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Export Excel
          </button>
          <button
            type="button"
            className="collection-neutral-btn inline-flex h-[42px] items-center gap-2 rounded-2xl px-4 text-sm font-medium"
          >
            <FileText className="h-4 w-4 text-rose-600" />
            Export PDF
          </button>
          <button
            type="button"
            disabled={!reportRows.length}
            onClick={() => downloadReportRowsCsv(reportRows, paidState)}
            className="collection-neutral-btn inline-flex h-[42px] items-center gap-2 rounded-2xl px-4 text-sm font-medium"
          >
            <Download className="h-4 w-4 text-emerald-600" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="mt-4 min-w-0 max-w-full overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-sm [contain:inline-size]">
        <div className="w-full overflow-x-auto overscroll-x-contain pb-1 [scrollbar-color:rgba(148,163,184,0.9)_rgba(241,245,249,0.95)] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/90 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100">
          <table
            className="table-fixed border-collapse text-left text-sm"
            style={{ width: `${REPORT_TABLE_MIN_WIDTH_PX}px`, minWidth: `${REPORT_TABLE_MIN_WIDTH_PX}px` }}
          >
            <colgroup>
              {REPORT_COLUMNS.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-[1] bg-slate-50/95 backdrop-blur-sm">
              <tr>
                {REPORT_COLUMNS.map((column) => (
                  <th key={column.key} className={reportTableHeaderClass(column.align)}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={REPORT_COLUMNS.length} className="px-4 py-10 text-center text-slate-500">
                    Loading collection report…
                  </td>
                </tr>
              ) : reportRows.length === 0 ? (
                <tr>
                  <td colSpan={REPORT_COLUMNS.length} className="px-4 py-10 text-center text-slate-500">
                    No records match the selected filters.
                  </td>
                </tr>
              ) : (
                reportRows.map((row, index) => {
                  const rowAlert = getCollectionReportAlert(row);
                  return (
                  <tr key={row.rowKey || row.customerId} className="hover:bg-slate-50/80">
                    {REPORT_COLUMNS.map((column) => {
                      const alertTextClass =
                        rowAlert.scope === "fullRow"
                          ? collectionReportCellTextClass(rowAlert, column.key)
                          : "";
                      const alertCellBgClass =
                        column.key === "customerId"
                          ? collectionReportCellBgClass(rowAlert, column.key)
                          : "";
                      if (column.key === "serial") {
                        return (
                          <td key={column.key} className={reportTableBodyClass(column.align, "tabular-nums text-slate-700")}>
                            {index + 1}
                          </td>
                        );
                      }
                      if (column.clickable && column.key === "pendingAmountDisplay") {
                        const pendingValue = row.pendingAmountDisplay || "—";
                        const canOpen = Array.isArray(row.pendingBreakdown) && row.pendingBreakdown.length > 0;
                        return (
                          <td
                            key={column.key}
                            className={reportTableBodyClass(column.align, "tabular-nums text-slate-700")}
                          >
                            {canOpen ? (
                              <button
                                type="button"
                                onClick={() => setPendingAmountRow(row)}
                                className="block w-full cursor-pointer whitespace-nowrap text-inherit hover:text-slate-900"
                                title="View pending tenure breakdown"
                              >
                                {pendingValue}
                              </button>
                            ) : (
                              <span>{pendingValue}</span>
                            )}
                          </td>
                        );
                      }
                      if (column.key === "paid") {
                        const paidAmount = resolveReportPaidColumnAmount(row, paidState);
                        return (
                          <td
                            key={column.key}
                            className={reportTableBodyClass(column.align, "tabular-nums text-slate-700")}
                          >
                            {paidAmount > 0 ? (
                              <span className="text-sm font-semibold text-emerald-700">
                                {formatCurrency(paidAmount)}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                        );
                      }
                      if (column.input) {
                        const entryKey =
                          row.installmentNumber != null
                            ? makePaidEntryKey(row.customerId, row.installmentNumber)
                            : "";
                        const draftValue = entryKey ? (paidState.drafts[entryKey] ?? "") : "";

                        if (row.showPaidInput === false) {
                          return (
                            <td key={column.key} className={reportTableBodyClass(column.align, "tabular-nums text-slate-700")}>
                              <span className="text-slate-500">—</span>
                            </td>
                          );
                        }

                        const entryAlertClass =
                          rowAlert.scope === "fullRow" ? collectionReportCellTextClass(rowAlert, column.key) : "";

                        return (
                          <td key={column.key} className={reportTableBodyClass(column.align)}>
                            <input
                              ref={(element) => {
                                if (element) paidInputRefs.current[entryKey] = element;
                                else delete paidInputRefs.current[entryKey];
                              }}
                              type="text"
                              inputMode="decimal"
                              value={draftValue}
                              onChange={(event) => updatePaidAmountEntry(entryKey, event.target.value)}
                              onKeyDown={(event) => handlePaidKeyDown(event, entryKey, index)}
                              onBlur={() => commitPaidAmountEntry(entryKey)}
                              className={`app-input w-full min-w-0 max-w-full py-1.5 text-sm tabular-nums ${entryAlertClass}`}
                              placeholder="Amount"
                              aria-label={`Entry amount for ${row.customerName} ${row.currentTenure || ""}`}
                            />
                          </td>
                        );
                      }
                      const value = row[column.key] ?? "--";
                      const cellTitle =
                        column.key === "pendingTenuresLabel"
                          ? row.pendingTenuresFullLabel || String(value)
                          : String(value);
                      const isNumeric = column.align === "right";
                      const isName = column.key === "customerName" || column.key === "employeeName";
                      const baseTextClass = alertTextClass
                        ? alertTextClass
                        : isName || column.key === "customerId"
                          ? "font-medium text-slate-950"
                          : "text-slate-700";
                      const alertHoverClass =
                        alertCellBgClass === "bg-rose-100"
                          ? "hover:bg-rose-100"
                          : alertCellBgClass === "bg-amber-100"
                            ? "hover:bg-amber-100"
                            : "";
                      return (
                        <td
                          key={column.key}
                          className={reportTableBodyClass(
                            column.align,
                            `${isNumeric ? "tabular-nums" : ""} ${alertCellBgClass} ${alertHoverClass} ${baseTextClass}`.trim(),
                            { truncate: column.truncate }
                          )}
                        >
                          {reportTableCellContent(value, {
                            truncate: column.truncate,
                            title: cellTitle,
                          })}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {reportRows.length > 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          Showing 1 to {reportRows.length} of {reportRows.length}
        </p>
      ) : null}
      <PendingAmountModal row={pendingAmountRow} onClose={() => setPendingAmountRow(null)} />
    </section>
  );
}
