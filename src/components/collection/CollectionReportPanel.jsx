import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { buildCollectionReportRowsForCustomer } from "../../utils/collectionReportRows";
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
  { key: "paid", label: "PAID", width: "9rem", align: "left", input: true },
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
  getCommittedPaidAmount,
  getTodayPaidDisplayForCustomer,
  loadCollectionReportPaidState,
  makePaidEntryKey,
  saveCollectionReportPaidState,
} from "../../utils/collectionReportPaidStorage";
import { normalizeCollectionFrequency } from "../../utils/loanTimelineDates";

const FREQUENCY_OPTIONS = ["All", "Daily", "Weekly", "Monthly"];
const PAYMENT_STATUS_OPTIONS = ["All", "Paid", "Unpaid"];
const PAGE_SIZE = 12;

function parseInputDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function SummaryCard({ label, value }) {
  return (
    <div className="app-panel-muted rounded-2xl px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950">{value}</p>
    </div>
  );
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
  const [page, setPage] = useState(1);
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
        const customerEntries = (entriesByCustomerId.get(customer.customerId) || []).filter((entry) => {
          if (selectedEmployee && !employeeMatchesCollector(selectedEmployee, entry)) return false;
          const entryDate = parseInputDate(entry.collectionDate || entry.submittedAt);
          if (fromDate && entryDate && entryDate < fromDate) return false;
          if (toDate && entryDate) {
            const end = new Date(toDate);
            end.setHours(23, 59, 59, 999);
            if (entryDate > end) return false;
          }
          return true;
        });
        const latestPaid = customerEntries
          .filter((entry) => String(entry.approvalStatus || "").toLowerCase() === "approved")
          .sort((a, b) => String(b.collectionDate || "").localeCompare(String(a.collectionDate || "")))[0];
        const rowEmployee =
          selectedEmployee || findEmployeeForCollectorName(latestPaid?.collectorName, employees);
        const { dayCenter, subCenter } = resolveCustomerCenterDisplay(customer, allCenters);
        return buildCollectionReportRowsForCustomer(
          enrichCustomerForCollection(customer),
          customerEntries,
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

  const totalPages = Math.max(1, Math.ceil(reportRows.length / PAGE_SIZE));
  const pagedRows = reportRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [
    employeeFilter,
    centerFilter,
    subCenterFilter,
    frequencyFilter,
    paymentStatusFilter,
    dateFrom,
    dateTo,
    search,
  ]);

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
    const nextRow = pagedRows[rowIndex + 1];
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
      <div className="flex items-center gap-3">
        <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
          <Eye className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-slate-950">Collection report</h3>
          <p className="text-sm text-slate-600">
            All customers with an active loan appear here. Set Payment to Unpaid or All to record collections.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Assigned customers" value={String(stats.assignedCustomers)} />
        <SummaryCard label="Total collected amount" value={formatCurrency(stats.totalCollected)} />
        <SummaryCard label="Pending collection" value={formatCurrency(stats.pendingCollection)} />
        <SummaryCard label="Today's collection" value={formatCurrency(stats.todayCollection)} />
      </div>

      <div className="mt-4 space-y-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] lg:items-end">
          <div className="relative">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Search customer
            </label>
            <Search className="absolute left-4 top-[calc(50%+0.55rem)] h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, ID, or phone..."
              className="app-input bg-slate-50 pl-11 pr-4"
            />
          </div>
          {!isEmployeeUser ? (
            <div>
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
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Employee
              </label>
              <div className="app-input flex min-h-[42px] items-center bg-slate-50 text-sm text-slate-700">
                {loggedInEmployee?.displayName || loggedInEmployee?.username || "You"}
              </div>
            </div>
          )}
          <div>
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
          <div>
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
          <div>
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

        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max flex-nowrap items-end gap-2">
            <div className="w-[6.75rem] shrink-0">
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
            <div className="w-[11.5rem] shrink-0">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Date from
              </label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="app-input w-full" />
            </div>
            <div className="w-[11.5rem] shrink-0">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Date to
              </label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="app-input w-full" />
            </div>
            <button
              type="button"
              disabled={printLoading}
              onClick={handlePrint}
              title={printSelectionHint || "Print customer report grouped by sub-center"}
              className="app-button-secondary inline-flex h-[42px] shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              {printLoading ? "Printing…" : "Print"}
            </button>
            <button
              type="button"
              className="app-button-secondary inline-flex h-[42px] shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-medium"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </button>
            <button
              type="button"
              className="app-button-secondary inline-flex h-[42px] shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-medium"
            >
              <FileText className="h-4 w-4" />
              Export PDF
            </button>
            <button
              type="button"
              className="app-button-secondary inline-flex h-[42px] shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-medium"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Print requires a <span className="font-semibold text-slate-700">Main center</span> (not All). Employee is
          optional for admin — use All employees or pick one. Report groups full customer details by sub-center.
        </p>

        {centerFilter !== "All" ? (
          <p className="text-xs text-slate-500">
            Showing customers for <span className="font-semibold text-slate-700">{centerFilter}</span>
            {subCenterFilter !== "All" ? (
              <>
                {" "}
                · Sub center: <span className="font-semibold text-slate-700">{subCenterFilter}</span>
              </>
            ) : (
              <> · All assigned sub-centers under this center</>
            )}
          </p>
        ) : null}
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
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={REPORT_COLUMNS.length} className="px-4 py-10 text-center text-slate-500">
                    No records match the selected filters.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row, index) => {
                  const rowAlert = getCollectionReportAlert(row);
                  return (
                  <tr key={row.rowKey || row.customerId} className="hover:bg-slate-50/80">
                    {REPORT_COLUMNS.map((column) => {
                      const alertTextClass = collectionReportCellTextClass(rowAlert, column.key);
                      const alertCellBgClass = collectionReportCellBgClass(rowAlert, column.key);
                      if (column.key === "serial") {
                        return (
                          <td key={column.key} className={reportTableBodyClass(column.align, "tabular-nums text-slate-700")}>
                            {(page - 1) * PAGE_SIZE + index + 1}
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
                      if (column.input) {
                        const entryKey =
                          row.installmentNumber != null
                            ? makePaidEntryKey(row.customerId, row.installmentNumber)
                            : "";
                        const todayPaid = getTodayPaidDisplayForCustomer(row.customerId, paidState);
                        const committedAmount = entryKey ? getCommittedPaidAmount(entryKey, paidState) : "";
                        const draftValue = entryKey ? (paidState.drafts[entryKey] ?? "") : "";
                        const greenAmount = todayPaid?.amount || committedAmount;
                        const showGreenPaid = draftValue === "" && Boolean(greenAmount);
                        const showEditableInput =
                          row.showPaidInput &&
                          entryKey &&
                          (draftValue !== "" || !showGreenPaid);

                        if (row.showPaidInput === false) {
                          const paidValue = row.paidDisplay || row.paid || "—";
                          return (
                            <td key={column.key} className={reportTableBodyClass(column.align, "tabular-nums text-slate-700")}>
                              <span>{paidValue}</span>
                            </td>
                          );
                        }

                        const paidAlertClass =
                          rowAlert.scope === "fullRow" ? collectionReportCellTextClass(rowAlert, column.key) : "";

                        return (
                          <td key={column.key} className={reportTableBodyClass(column.align)}>
                            {showGreenPaid ? (
                              <span
                                className="text-sm font-semibold tabular-nums text-emerald-700"
                                title={`Paid today ${formatCurrency(Number(greenAmount))}`}
                              >
                                {formatCurrency(Number(greenAmount))}
                              </span>
                            ) : null}
                            {showEditableInput ? (
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
                                className={`app-input w-full min-w-0 max-w-full py-1.5 text-sm tabular-nums ${paidAlertClass}`}
                                placeholder="Amount"
                                aria-label={`Paid amount for ${row.customerName} ${row.currentTenure || ""}`}
                              />
                            ) : null}
                            {!showGreenPaid && !showEditableInput ? (
                              <span className="text-slate-500">—</span>
                            ) : null}
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
                      return (
                        <td
                          key={column.key}
                          className={reportTableBodyClass(
                            column.align,
                            `${isNumeric ? "tabular-nums" : ""} ${alertCellBgClass} ${baseTextClass}`.trim(),
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

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Showing {(page - 1) * PAGE_SIZE + (pagedRows.length ? 1 : 0)}–{(page - 1) * PAGE_SIZE + pagedRows.length} of{" "}
          {reportRows.length}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="app-button-secondary rounded-xl px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            className="app-button-secondary rounded-xl px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
      <PendingAmountModal row={pendingAmountRow} onClose={() => setPendingAmountRow(null)} />
    </section>
  );
}
