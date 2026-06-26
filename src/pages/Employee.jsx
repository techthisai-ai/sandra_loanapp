import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Pencil, Plus, Search, UserCheck, UserX } from "lucide-react";
import CenterEmployeeTabs from "../components/center/CenterEmployeeTabs";
import AdminLayout from "../components/dashboard/AdminLayout";
import EmployeeFormModal, { EMPTY_EMPLOYEE_FORM } from "../components/employee/EmployeeFormModal.jsx";
import AssignCentersModal from "../components/employee/AssignCentersModal.jsx";
import { LOAN_CENTERS_CHANGED_EVENT } from "../constants/loanCenterStorage";
import { loadLoanCenters } from "../constants/dayCenters";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import {
  createManagedEmployee,
  getEmployeeProfile,
  listEmployees,
  updateEmployeeAdmin,
  updateEmployeeCenters,
  updateEmployeeStatus,
} from "../services/userAuth";
import { buildCenterAssignmentOptions } from "../utils/employeeScope.js";
import {
  formatAssignedCentersLabel,
  getCustomersForEmployeeCenters,
  getEmployeeAssignedCenters,
  normalizeUsername,
} from "../utils/employeeManagement.js";
import { entryMatchesCollector } from "../utils/employeeCollectionDetails.js";

const EMPLOYEE_TABLE_COLUMNS = [
  { key: "index", label: "#", width: "3rem" },
  { key: "employee", label: "Employee", width: "11rem" },
  { key: "employeeId", label: "Emp ID", width: "6.5rem" },
  { key: "mobileNumber", label: "Mobile No", width: "7rem" },
  { key: "todayCollection", label: "Today Collection", width: "11rem", align: "center" },
  { key: "username", label: "Username", width: "8rem" },
  { key: "centers", label: "Centers", width: "10rem" },
  { key: "status", label: "Status", width: "6rem" },
  { key: "actions", label: "Actions", width: "9rem", align: "right" },
];

function getTodayDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function entryCollectionDateKey(entry) {
  const raw = entry?.collectionDate || entry?.submittedAt || "";
  if (!raw) return "";
  const text = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function sumEmployeeTodayCollection(employee, entries, todayKey = getTodayDateKey()) {
  return entries
    .filter(
      (entry) =>
        String(entry.approvalStatus || "").toLowerCase() === "approved" &&
        entryCollectionDateKey(entry) === todayKey &&
        entryMatchesCollector(entry, employee)
    )
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
}

function formatRupee(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function EmployeeAvatar({ name }) {
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
    .slice(0, 2);

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-xs font-bold text-white shadow-sm">
      {initials}
    </div>
  );
}

function SummaryCard({ label, value, accent }) {
  const accentClass =
    accent === "green"
      ? "border-l-emerald-500"
      : accent === "purple"
        ? "border-l-violet-500"
        : accent === "amber"
          ? "border-l-amber-500"
          : "border-l-blue-500";

  return (
    <div
      className={`flex min-h-0 flex-col justify-center rounded-xl border border-slate-200/90 border-l-[3px] bg-white px-2.5 py-2 shadow-sm sm:px-3 sm:py-2.5 ${accentClass}`}
    >
      <p className="truncate text-center text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[10px]">
        {label}
      </p>
      <p className="mt-0.5 text-center text-lg font-bold leading-tight tabular-nums text-slate-950 sm:text-xl">{value}</p>
    </div>
  );
}

function CenterCell({ centers = [] }) {
  if (!centers.length) {
    return (
      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
        Not assigned
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1" title={centers.join(", ")}>
      {centers.map((center) => (
        <span
          key={center}
          className="inline-flex max-w-[120px] items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
        >
          <span className="truncate">{center}</span>
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const active = status !== "inactive";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        active
          ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border border-rose-200 bg-rose-50 text-rose-800"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-rose-500"}`} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function buildEditFormRow(source, fallback = {}) {
  const storedPassword = String(source.loginPassword || source.password || "");
  return {
    id: source.id || fallback.id || "",
    employeeId: source.employeeId && source.employeeId !== "--" ? source.employeeId : fallback.employeeId || "",
    employeeName: source.displayName || source.employeeName || fallback.employeeName || "",
    employeeSecondName: source.secondName || source.employeeSecondName || fallback.employeeSecondName || "",
    aadhaarNumber: source.aadhaarNumber || fallback.aadhaarNumber || "",
    mobileNumber:
      source.phone && source.phone !== "--"
        ? source.phone
        : source.mobileNumber && source.mobileNumber !== "--"
          ? source.mobileNumber
          : fallback.mobileNumber || "",
    username:
      source.username && source.username !== "--"
        ? source.username
        : fallback.username && fallback.username !== "--"
          ? fallback.username
          : "",
    loginPassword: storedPassword,
    assignedCenters: source.assignedCenters || fallback.assignedCenters || [],
    status:
      (source.employeeStatus || source.status) === "inactive"
        ? "inactive"
        : fallback.status === "inactive"
          ? "inactive"
          : "active",
  };
}

function rowToFormValues(row) {
  const storedPassword = row.loginPassword || "";
  return {
    employeeId: row.employeeId && row.employeeId !== "--" ? row.employeeId : "",
    employeeName: row.employeeName || "",
    employeeSecondName: row.employeeSecondName || "",
    aadhaarNumber: row.aadhaarNumber || "",
    mobileNumber: row.mobileNumber && row.mobileNumber !== "--" ? row.mobileNumber : "",
    username: row.username && row.username !== "--" ? row.username : "",
    password: storedPassword,
    confirmPassword: storedPassword,
    assignedCenters: row.assignedCenters || [],
    status: row.status === "inactive" ? "inactive" : "active",
  };
}

export default function EmployeePage() {
  const { customers, entries } = useLoanDataSync();
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [employeeFilter, setEmployeeFilter] = useState("All");
  const [formModal, setFormModal] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [assignModal, setAssignModal] = useState(null);
  const [editLoadingId, setEditLoadingId] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [statusTogglingId, setStatusTogglingId] = useState("");
  const [centerOptions, setCenterOptions] = useState(() => buildCenterAssignmentOptions(loadLoanCenters()));

  const reloadEmployees = useCallback(async () => {
    setEmployeesLoading(true);
    try {
      setEmployees(await listEmployees());
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadEmployees();
  }, [reloadEmployees]);

  useEffect(() => {
    const refreshCenters = () => setCenterOptions(buildCenterAssignmentOptions(loadLoanCenters()));
    window.addEventListener(LOAN_CENTERS_CHANGED_EVENT, refreshCenters);
    return () => window.removeEventListener(LOAN_CENTERS_CHANGED_EVENT, refreshCenters);
  }, []);

  const approvedCustomers = useMemo(
    () => customers.filter((c) => String(c.approvalStatus || "").toLowerCase() === "approved"),
    [customers]
  );

  const allCenters = useMemo(() => loadLoanCenters(), [centerOptions]);

  const employeeRows = useMemo(
    () => {
      const todayKey = getTodayDateKey();
      return employees.map((employee) => {
        const assignedCenters = getEmployeeAssignedCenters(employee);
        const centerCustomers = getCustomersForEmployeeCenters(approvedCustomers, employee, allCenters);
        const customerIds = new Set(centerCustomers.map((customer) => customer.customerId));
        const totalCollection = entries
          .filter(
            (entry) =>
              String(entry.approvalStatus || "").toLowerCase() === "approved" &&
              customerIds.has(entry.customerId)
          )
          .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
        const todayCollection = sumEmployeeTodayCollection(employee, entries, todayKey);

        return {
          id: employee.id,
          employeeId: employee.employeeId || "--",
          employeeName: employee.displayName || employee.username || "Employee",
          employeeSecondName: employee.secondName || "",
          mobileNumber: employee.phone || "--",
          username: employee.username || employee.email?.split("@")[0] || "--",
          loginPassword: employee.loginPassword || "",
          aadhaarNumber: employee.aadhaarNumber || "",
          assignedCenters,
          assignedCentersLabel: formatAssignedCentersLabel(employee),
          status: employee.employeeStatus === "inactive" ? "inactive" : "active",
          totalCustomers: centerCustomers.length,
          totalCollection,
          todayCollection,
        };
      });
    },
    [allCenters, approvedCustomers, employees, entries]
  );

  const stats = useMemo(() => {
    const todayKey = getTodayDateKey();
    const todayCollectionTotal = entries
      .filter((entry) => String(entry.approvalStatus || "").toLowerCase() === "approved")
      .filter((entry) => entryCollectionDateKey(entry) === todayKey)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    return {
      totalEmployees: employeeRows.length,
      activeEmployees: employeeRows.filter((row) => row.status === "active").length,
      todayCollectionTotal,
      totalCollections: employeeRows.reduce((sum, row) => sum + row.totalCollection, 0),
    };
  }, [employeeRows, entries]);

  const employeeFilterOptions = useMemo(
    () =>
      [...employeeRows]
        .sort((left, right) => left.employeeName.localeCompare(right.employeeName))
        .map((row) => ({
          id: row.id,
          label:
            `${row.employeeName}${row.employeeSecondName ? ` ${row.employeeSecondName}` : ""}`.trim() ||
            row.employeeId,
        })),
    [employeeRows]
  );

  const displayedTodayCollection = useMemo(() => {
    if (employeeFilter === "All") return stats.todayCollectionTotal;
    const selected = employeeRows.find((row) => row.id === employeeFilter);
    return selected?.todayCollection ?? 0;
  }, [employeeFilter, employeeRows, stats.todayCollectionTotal]);

  const assignEmployee = useMemo(() => {
    if (!assignModal?.row?.id) return null;
    return employeeRows.find((row) => row.id === assignModal.row.id) || assignModal.row;
  }, [assignModal, employeeRows]);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return employeeRows.filter((row) => {
      const matchesEmployee = employeeFilter === "All" || row.id === employeeFilter;
      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Active" && row.status === "active") ||
        (statusFilter === "Inactive" && row.status === "inactive");
      const matchesSearch =
        !query ||
        row.employeeName.toLowerCase().includes(query) ||
        row.employeeSecondName.toLowerCase().includes(query) ||
        row.employeeId.toLowerCase().includes(query) ||
        row.username.toLowerCase().includes(query);
      return matchesEmployee && matchesStatus && matchesSearch;
    });
  }, [employeeFilter, employeeRows, search, statusFilter]);

  const openEditEmployee = async (row) => {
    setFormError("");
    setEditLoadingId(row.id);
    try {
      const profile = await getEmployeeProfile(row.id);
      const editRow = buildEditFormRow(profile || {}, row);
      setFormModal({ mode: "edit", row: editRow });
    } catch (loadError) {
      setFormError(loadError.message || "Unable to load employee details.");
      setFormModal({ mode: "edit", row: buildEditFormRow(row, row) });
    } finally {
      setEditLoadingId("");
    }
  };

  const handleSave = async (values) => {
    setFormSaving(true);
    setFormError("");
    setStatusMessage("");
    try {
      if (formModal?.mode === "edit") {
        const storedPassword = formModal.row.loginPassword || "";
        const passwordChanged =
          Boolean(values.password) && values.password !== storedPassword;
        await updateEmployeeAdmin(formModal.row.id, {
          employeeId: values.employeeId,
          username: values.username,
          displayName: values.employeeName,
          secondName: values.employeeSecondName,
          phone: values.mobileNumber,
          aadhaarNumber: values.aadhaarNumber,
          employeeStatus: values.status,
          password: passwordChanged ? values.password : "",
        });
        setStatusMessage("Employee updated successfully.");
      } else {
        await createManagedEmployee({
          displayName: values.employeeName,
          secondName: values.employeeSecondName,
          username: values.username,
          password: values.password,
          aadhaarNumber: values.aadhaarNumber,
          phone: values.mobileNumber,
          assignedCenters: values.assignedCenters,
          employeeStatus: values.status,
        });
        setStatusMessage(
          `Employee created successfully. They can sign in with username "${normalizeUsername(values.username)}" and the password you set.`
        );
      }
      await reloadEmployees();
      setFormModal(null);
    } catch (submitError) {
      setFormError(submitError.message || "Unable to save employee.");
    } finally {
      setFormSaving(false);
    }
  };

  const handleToggleEmployeeStatus = async (row) => {
    setStatusTogglingId(row.id);
    setStatusMessage("");
    setFormError("");
    try {
      const nextStatus = row.status === "active" ? "inactive" : "active";
      await updateEmployeeStatus(row.id, nextStatus);
      setEmployees((current) =>
        current.map((employee) =>
          employee.id === row.id ? { ...employee, employeeStatus: nextStatus } : employee
        )
      );
      setStatusMessage(
        nextStatus === "active"
          ? `${row.employeeName} activated successfully.`
          : `${row.employeeName} deactivated successfully.`
      );
    } catch (toggleError) {
      setFormError(toggleError.message || "Unable to update employee status.");
    } finally {
      setStatusTogglingId("");
    }
  };

  const handleAssignCenters = async (centers) => {
    if (!assignModal?.row) return;
    setAssignSaving(true);
    setAssignError("");
    setStatusMessage("");
    try {
      const normalizedCenters = await updateEmployeeCenters(assignModal.row.id, centers);
      const savedCenters = normalizedCenters?.assignedCenters || centers;
      setEmployees((current) =>
        current.map((employee) =>
          employee.id === assignModal.row.id
            ? {
                ...employee,
                assignedCenters: savedCenters,
                location: savedCenters[0] || "",
              }
            : employee
        )
      );
      setAssignModal(null);
      setStatusMessage("Centers assigned successfully.");
    } catch (assignErr) {
      setAssignError(assignErr.message || "Unable to assign centers.");
    } finally {
      setAssignSaving(false);
    }
  };

  const loading = employeesLoading;

  return (
    <AdminLayout title="Employee" description="Employee creation and centre assignment">
      <CenterEmployeeTabs />
      <div className="flex min-w-0 flex-col gap-4 md:h-[calc(100vh-5.5rem)] md:overflow-hidden">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 lg:grid-cols-4">
              <SummaryCard label="Total Employees" value={String(stats.totalEmployees)} accent="blue" />
              <SummaryCard label="Active Employees" value={String(stats.activeEmployees)} accent="green" />
              <SummaryCard label="Today Collection" value={formatRupee(displayedTodayCollection)} accent="purple" />
              <SummaryCard label="Total Collections" value={formatRupee(stats.totalCollections)} accent="amber" />
            </div>
            <button
              type="button"
              onClick={() => {
                setFormError("");
                setFormModal({ mode: "add", row: null });
              }}
              className="app-button-primary inline-flex shrink-0 items-center justify-center gap-2 self-end rounded-xl px-4 py-2.5 text-sm font-semibold sm:self-auto"
            >
              <Plus className="h-4 w-4" />
              Add Employee
            </button>
          </div>

          {statusMessage ? <div className="app-alert-success mb-4">{statusMessage}</div> : null}
          {formError && !formModal ? <div className="app-alert-error mb-4">{formError}</div> : null}

          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem] sm:items-center">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name or ID..."
                className="app-input w-full bg-slate-50"
                style={{ paddingLeft: "2.25rem", paddingRight: "0.75rem" }}
              />
            </div>
            <select
              value={employeeFilter}
              onChange={(event) => setEmployeeFilter(event.target.value)}
              className="app-select w-full min-w-0 sm:w-[9.5rem] sm:shrink-0"
            >
              <option value="All">All employees</option>
              {employeeFilterOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="app-select w-full min-w-0 sm:w-[9.5rem] sm:shrink-0"
            >
              <option value="All">All status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-sm">
            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-0 text-sm md:min-w-[59rem] md:table-fixed">
                <colgroup className="hidden md:contents">
                  {EMPLOYEE_TABLE_COLUMNS.map((column) => (
                    <col key={column.key} style={{ width: column.width }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                  <tr>
                    {EMPLOYEE_TABLE_COLUMNS.map((column) => {
                      const hideOnMobile = ["employeeId", "username", "centers", "todayCollection"].includes(column.key);
                      return (
                      <th
                        key={column.key}
                        className={`whitespace-nowrap px-2 py-2.5 sm:px-3 ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"} ${hideOnMobile ? "hidden md:table-cell" : ""} ${column.key === "employee" ? "min-w-[8rem]" : ""} ${column.key === "mobileNumber" ? "min-w-[6.5rem]" : ""} ${column.key === "todayCollection" ? "pr-4" : ""} ${column.key === "username" ? "pl-2" : ""}`}
                      >
                        {column.label}
                      </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={EMPLOYEE_TABLE_COLUMNS.length} className="px-4 py-10 text-center text-slate-500">
                        Loading employees…
                      </td>
                    </tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={EMPLOYEE_TABLE_COLUMNS.length} className="px-4 py-10 text-center text-slate-500">
                        No employees match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((row, index) => (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="px-2 py-3 text-center text-xs font-semibold text-slate-400 sm:px-3">{index + 1}</td>
                        <td className="px-2 py-3 sm:px-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <EmployeeAvatar name={`${row.employeeName} ${row.employeeSecondName}`.trim()} />
                            <div className="min-w-0">
                              <span
                                className="block truncate text-xs font-semibold text-slate-900 sm:text-sm"
                                title={`${row.employeeName}${row.employeeSecondName ? ` ${row.employeeSecondName}` : ""}`}
                              >
                                {row.employeeName}
                              </span>
                              {row.employeeSecondName ? (
                                <span className="block truncate text-[10px] text-slate-500 sm:text-[11px]" title={row.employeeSecondName}>
                                  {row.employeeSecondName}
                                </span>
                              ) : null}
                              <span className="block truncate text-[10px] text-blue-600 md:hidden" title={row.employeeId}>
                                {row.employeeId}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-3 py-3 text-sm font-semibold text-blue-600 md:table-cell">{row.employeeId}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-xs text-slate-700 sm:px-3 sm:text-sm">{row.mobileNumber}</td>
                        <td className="hidden whitespace-nowrap px-3 py-3 pr-4 text-center text-sm font-semibold tabular-nums text-slate-900 md:table-cell">
                          {formatRupee(row.todayCollection)}
                        </td>
                        <td className="hidden px-3 py-3 pl-2 text-sm text-slate-700 md:table-cell">
                          <span className="block truncate" title={row.username}>
                            {row.username}
                          </span>
                        </td>
                        <td className="hidden px-3 py-3 md:table-cell">
                          <CenterCell centers={row.assignedCenters} />
                        </td>
                        <td className="px-2 py-3 sm:px-3">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-2 py-3 sm:px-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditEmployee(row)}
                              disabled={editLoadingId === row.id}
                              title="Edit employee"
                              aria-label="Edit employee"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAssignError("");
                                setAssignModal({ row });
                              }}
                              title="Assign centers"
                              aria-label="Assign centers"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={statusTogglingId === row.id}
                              onClick={() => handleToggleEmployeeStatus(row)}
                              title={row.status === "active" ? "Deactivate employee" : "Activate employee"}
                              aria-label={row.status === "active" ? "Deactivate employee" : "Activate employee"}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                row.status === "active"
                                  ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              }`}
                            >
                              {row.status === "active" ? (
                                <UserX className="h-3.5 w-3.5" />
                              ) : (
                                <UserCheck className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="shrink-0 border-t border-slate-100 px-4 py-2.5 text-center text-[11px] text-slate-400">
              {filteredEmployees.length === 0
                ? "Showing 0 employees"
                : `Showing 1 to ${filteredEmployees.length} of ${filteredEmployees.length} employee${filteredEmployees.length === 1 ? "" : "s"}`}
            </div>
          </div>
        </section>
      </div>

      <EmployeeFormModal
        key={formModal ? `${formModal.mode}-${formModal.row?.id ?? "new"}` : "closed"}
        open={Boolean(formModal)}
        mode={formModal?.mode || "add"}
        initialValues={formModal?.row ? rowToFormValues(formModal.row) : EMPTY_EMPLOYEE_FORM}
        saving={formSaving}
        error={formError}
        onClose={() => {
          setFormModal(null);
          setFormError("");
        }}
        onSubmit={handleSave}
      />

      <AssignCentersModal
        key={assignModal ? `assign-${assignModal.row?.id}` : "assign-closed"}
        open={Boolean(assignModal)}
        employee={assignEmployee}
        centerOptions={centerOptions}
        saving={assignSaving}
        error={assignError}
        onClose={() => {
          setAssignModal(null);
          setAssignError("");
        }}
        onSubmit={handleAssignCenters}
      />
    </AdminLayout>
  );
}
