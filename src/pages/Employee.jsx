import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Pencil, Plus, Search, ToggleLeft, ToggleRight, UserRound } from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import EmployeeFormModal, { EMPTY_EMPLOYEE_FORM } from "../components/employee/EmployeeFormModal.jsx";
import AssignCentersModal from "../components/employee/AssignCentersModal.jsx";
import { LOAN_CENTERS_CHANGED_EVENT } from "../constants/loanCenterStorage";
import { loadLoanCenters } from "../constants/dayCenters";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import {
  createManagedEmployee,
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
import { formatCurrency } from "../utils/employeeCollectionDetails.js";

const EMPLOYEE_TABLE_COLUMNS = [
  { key: "employeeName", label: "EMPNAME", width: "10rem" },
  { key: "employeeId", label: "EMPID", width: "6.5rem" },
  { key: "mobileNumber", label: "MOBILENO", width: "7rem" },
  { key: "username", label: "USERNAME", width: "7rem" },
  { key: "assignedCentersLabel", label: "CENTERS", width: "11rem" },
  { key: "status", label: "STATUS", width: "5.5rem" },
  { key: "actions", label: "ACTIONS", width: "9rem", align: "right" },
];

function SummaryCard({ label, value }) {
  return (
    <div className="app-panel-muted rounded-2xl px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950">{value}</p>
    </div>
  );
}

function CenterCell({ centers = [] }) {
  if (!centers.length) {
    return <span className="text-xs font-medium text-slate-400">Not assigned</span>;
  }
  return (
    <div className="flex flex-wrap gap-1" title={centers.join(", ")}>
      {centers.map((center) => (
        <span
          key={center}
          className="inline-flex max-w-[140px] items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
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
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        active
          ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border border-rose-200 bg-rose-50 text-rose-800"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function rowToFormValues(row) {
  return {
    employeeId: row.employeeId || "",
    employeeName: row.employeeName || "",
    aadhaarNumber: row.aadhaarNumber || "",
    mobileNumber: row.mobileNumber || "",
    username: row.username || "",
    password: "",
    confirmPassword: "",
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
  const [formModal, setFormModal] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [assignModal, setAssignModal] = useState(null);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState("");
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
    () =>
      employees.map((employee) => {
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

        return {
          id: employee.id,
          employeeId: employee.employeeId || "--",
          employeeName: employee.displayName || employee.username || "Employee",
          mobileNumber: employee.phone || "--",
          username: employee.username || employee.email?.split("@")[0] || "--",
          aadhaarNumber: employee.aadhaarNumber || "",
          assignedCenters,
          assignedCentersLabel: formatAssignedCentersLabel(employee),
          status: employee.employeeStatus === "inactive" ? "inactive" : "active",
          totalCustomers: centerCustomers.length,
          totalCollection,
        };
      }),
    [allCenters, approvedCustomers, employees, entries]
  );

  const stats = useMemo(
    () => ({
      totalEmployees: employeeRows.length,
      activeEmployees: employeeRows.filter((row) => row.status === "active").length,
      totalAssignedCustomers: employeeRows.reduce((sum, row) => sum + row.totalCustomers, 0),
      totalCollections: employeeRows.reduce((sum, row) => sum + row.totalCollection, 0),
    }),
    [employeeRows]
  );

  const assignEmployee = useMemo(() => {
    if (!assignModal?.row?.id) return null;
    return employeeRows.find((row) => row.id === assignModal.row.id) || assignModal.row;
  }, [assignModal, employeeRows]);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return employeeRows.filter((row) => {
      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Active" && row.status === "active") ||
        (statusFilter === "Inactive" && row.status === "inactive");
      const matchesSearch =
        !query ||
        row.employeeName.toLowerCase().includes(query) ||
        row.employeeId.toLowerCase().includes(query) ||
        row.username.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [employeeRows, search, statusFilter]);

  const handleSave = async (values) => {
    setFormSaving(true);
    setFormError("");
    setStatusMessage("");
    try {
      if (formModal?.mode === "edit") {
        await updateEmployeeAdmin(formModal.row.id, {
          employeeId: values.employeeId,
          username: values.username,
          displayName: values.employeeName,
          phone: values.mobileNumber,
          aadhaarNumber: values.aadhaarNumber,
          employeeStatus: values.status,
          password: values.password || "",
        });
        setStatusMessage("Employee updated successfully.");
      } else {
        await createManagedEmployee({
          displayName: values.employeeName,
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

  const handleToggleStatus = async (row) => {
    const nextStatus = row.status === "inactive" ? "active" : "inactive";
    setStatusMessage("");
    setFormError("");
    try {
      await updateEmployeeStatus(row.id, nextStatus);
      await reloadEmployees();
      setStatusMessage(`Employee marked as ${nextStatus}.`);
    } catch (toggleError) {
      setFormError(toggleError.message || "Unable to change status.");
    }
  };

  const loading = employeesLoading;

  return (
    <AdminLayout title="Employee" description="Employee creation and centre assignment">
      <div className="flex h-[calc(100vh-5.5rem)] min-w-0 flex-col gap-4 overflow-hidden">
        <section className="app-panel flex min-h-0 flex-1 flex-col p-5 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-slate-950">Employee register</h3>
                <p className="text-sm text-slate-600">Create employees and assign centres</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setFormError("");
                setFormModal({ mode: "add", row: null });
              }}
              className="inline-flex items-center gap-2 self-start rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 sm:self-center"
            >
              <Plus className="h-4 w-4" />
              Add Employee
            </button>
          </div>

          {statusMessage ? <div className="app-alert-success mt-4">{statusMessage}</div> : null}
          {formError && !formModal ? <div className="app-alert-error mt-4">{formError}</div> : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Total employees" value={String(stats.totalEmployees)} />
            <SummaryCard label="Active employees" value={String(stats.activeEmployees)} />
            <SummaryCard label="Total assigned customers" value={String(stats.totalAssignedCustomers)} />
            <SummaryCard label="Total collections" value={formatCurrency(stats.totalCollections)} />
          </div>

          <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee name or ID..."
                className="app-input bg-slate-50 pl-11 pr-4"
              />
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="app-select">
              <option value="All">All status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-sm">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  {EMPLOYEE_TABLE_COLUMNS.map((column) => (
                    <col key={column.key} style={{ width: column.width }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                  <tr>
                    {EMPLOYEE_TABLE_COLUMNS.map((column) => (
                      <th
                        key={column.key}
                        className={`whitespace-nowrap px-3 py-2.5 ${column.align === "right" ? "text-right" : "text-left"}`}
                      >
                        {column.label}
                      </th>
                    ))}
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
                    filteredEmployees.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2.5 font-medium text-slate-950">
                          <span className="block truncate" title={row.employeeName}>
                            {row.employeeName}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-900">{row.employeeId}</td>
                        <td className="px-3 py-2.5 text-slate-700">{row.mobileNumber}</td>
                        <td className="px-3 py-2.5 text-slate-700">
                          <span className="block truncate" title={row.username}>
                            {row.username}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          <CenterCell centers={row.assignedCenters} />
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setFormError("");
                                setFormModal({ mode: "edit", row });
                              }}
                              title="Edit employee"
                              aria-label="Edit employee"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAssignError("");
                                setAssignModal({ row });
                              }}
                              title="Assign centers"
                              aria-label="Assign centers"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100"
                            >
                              <MapPin className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(row)}
                              title={row.status === "inactive" ? "Activate employee" : "Deactivate employee"}
                              aria-label={row.status === "inactive" ? "Activate employee" : "Deactivate employee"}
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                                row.status === "inactive"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                              }`}
                            >
                              {row.status === "inactive" ? (
                                <ToggleRight className="h-4 w-4" />
                              ) : (
                                <ToggleLeft className="h-4 w-4" />
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
