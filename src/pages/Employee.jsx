import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, MapPin, Pencil, Plus, Search } from "lucide-react";
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
} from "../services/userAuth";
import { buildCenterAssignmentOptions } from "../utils/employeeScope.js";
import {
  formatAssignedCentersLabel,
  getCustomersForEmployeeCenters,
  getEmployeeAssignedCenters,
  normalizeUsername,
} from "../utils/employeeManagement.js";
const EMPLOYEE_TABLE_COLUMNS = [
  { key: "index", label: "#", width: "3rem" },
  { key: "employee", label: "Employee", width: "11rem" },
  { key: "employeeId", label: "Emp ID", width: "6.5rem" },
  { key: "mobileNumber", label: "Mobile No", width: "7rem" },
  { key: "username", label: "Username", width: "7rem" },
  { key: "centers", label: "Centers", width: "10rem" },
  { key: "status", label: "Status", width: "6rem" },
  { key: "actions", label: "Actions", width: "9rem", align: "right" },
];

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
      className={`flex min-h-[5.5rem] flex-col rounded-2xl border border-slate-200/90 border-l-4 bg-white px-4 py-3 shadow-sm ${accentClass}`}
    >
      <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="flex flex-1 items-center justify-center text-2xl font-bold tabular-nums text-slate-950">{value}</p>
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

function rowToFormValues(row) {
  return {
    employeeId: row.employeeId || "",
    employeeName: row.employeeName || "",
    employeeSecondName: row.employeeSecondName || "",
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
          employeeSecondName: employee.secondName || "",
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
        row.employeeSecondName.toLowerCase().includes(query) ||
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
          secondName: values.employeeSecondName,
          phone: values.mobileNumber,
          aadhaarNumber: values.aadhaarNumber,
          employeeStatus: values.status,
          password: values.password || "",
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
    <AdminLayout
      title="Employee"
      description="Employee creation and centre assignment"
      action={
        <button
          type="button"
          onClick={() => {
            setFormError("");
            setFormModal({ mode: "add", row: null });
          }}
          className="app-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          Add Employee
        </button>
      }
    >
      <div className="flex h-[calc(100vh-5.5rem)] min-w-0 flex-col gap-4 overflow-hidden">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm md:p-5">
          {statusMessage ? <div className="app-alert-success mb-4">{statusMessage}</div> : null}
          {formError && !formModal ? <div className="app-alert-error mb-4">{formError}</div> : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Total Employees" value={String(stats.totalEmployees)} accent="blue" />
            <SummaryCard label="Active Employees" value={String(stats.activeEmployees)} accent="green" />
            <SummaryCard label="Assigned Customers" value={String(stats.totalAssignedCustomers)} accent="purple" />
            <SummaryCard label="Total Collections" value={formatRupee(stats.totalCollections)} accent="amber" />
          </div>

          <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee name or ID..."
                className="app-input bg-slate-50"
                style={{ paddingLeft: "3rem", paddingRight: "1rem" }}
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
                    filteredEmployees.map((row, index) => (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-3 text-center text-xs font-semibold text-slate-400">{index + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <EmployeeAvatar name={`${row.employeeName} ${row.employeeSecondName}`.trim()} />
                            <div className="min-w-0">
                              <span
                                className="block truncate text-sm font-semibold text-slate-900"
                                title={`${row.employeeName}${row.employeeSecondName ? ` ${row.employeeSecondName}` : ""}`}
                              >
                                {row.employeeName}
                              </span>
                              {row.employeeSecondName ? (
                                <span className="block truncate text-[11px] text-slate-500" title={row.employeeSecondName}>
                                  {row.employeeSecondName}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm font-semibold text-blue-600">{row.employeeId}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{row.mobileNumber}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">
                          <span className="block truncate" title={row.username}>
                            {row.username}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <CenterCell centers={row.assignedCenters} />
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setFormError("");
                                setFormModal({ mode: "edit", row });
                              }}
                              title="Edit employee"
                              aria-label="Edit employee"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100"
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
                              onClick={() => {
                                setFormError("");
                                setFormModal({ mode: "edit", row });
                              }}
                              title="View employee"
                              aria-label="View employee"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                            >
                              <Eye className="h-3.5 w-3.5" />
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
