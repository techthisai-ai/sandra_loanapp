import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock3, FilePlus2, UserPlus, UsersRound } from "lucide-react";
import EmployeeAddCustomerModal from "../components/employee/EmployeeAddCustomerModal";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import useAuth from "../hooks/useAuth";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import { isActiveCustomerRecord } from "../utils/recordFlags";

function isEmployeeAddedCustomer(customer, userUid, employeeId) {
  const uid = String(userUid || "");
  const empId = String(employeeId || "");
  if (uid && String(customer.createdByUid || "") === uid) return true;
  if (empId && String(customer.createdByEmployeeId || "") === empId) return true;
  return false;
}

function customerCanApplyForLoan(customer) {
  if (String(customer?.approvalStatus || "").toLowerCase() !== "approved") return false;
  const loanAmount = Number(customer.loanAmount || 0);
  const totalPayable = Number(customer.totalPayable || 0);
  const loanStatus = String(customer.loanStatus || "").toLowerCase();
  if (loanAmount > 0 && totalPayable > 0 && loanStatus !== "closed") return false;
  return true;
}

const STATUS_FILTER_OPTIONS = ["All", "Approved", "Pending"];

const ENTRY_STAT_ACCENTS = {
  blue: {
    border: "border-[#3B82F6]/30 hover:border-[#3B82F6]/45",
    iconShell: "bg-[#3B82F6]/10 text-[#3B82F6]",
    value: "text-slate-950",
  },
  green: {
    border: "border-[#10B981]/30 hover:border-[#10B981]/45",
    iconShell: "bg-[#10B981]/10 text-[#10B981]",
    value: "text-emerald-800",
  },
  orange: {
    border: "border-[#F59E0B]/30 hover:border-[#F59E0B]/45",
    iconShell: "bg-[#F59E0B]/10 text-[#F59E0B]",
    value: "text-[#B45309]",
  },
};

function EntryStatCard({ icon: Icon, label, value, accent = "blue" }) {
  const tone = ENTRY_STAT_ACCENTS[accent] || ENTRY_STAT_ACCENTS.blue;
  return (
    <div
      className={`employee-customer-metric-card flex min-h-[4.75rem] flex-col items-center justify-center rounded-xl border bg-white px-2 py-2.5 text-center shadow-sm transition hover:shadow-md ${tone.border}`}
    >
      <div className={`mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone.iconShell}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </div>
      <p className={`text-base font-bold tabular-nums leading-none tracking-tight ${tone.value}`}>{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase leading-tight tracking-[0.06em] text-slate-600">
        {label}
      </p>
    </div>
  );
}

function getCustomerApprovalKey(customer) {
  return String(customer?.approvalStatus || "pending").toLowerCase();
}

function resolveCustomerApprovalStatus(customer) {
  const value = String(customer?.approvalStatus || "pending").toLowerCase();
  if (value === "approved") {
    return { label: "Approved", badgeClass: "bg-emerald-100 text-emerald-800" };
  }
  if (value === "rejected") {
    return { label: "Rejected", badgeClass: "bg-rose-100 text-rose-800" };
  }
  return { label: "Pending", badgeClass: "bg-amber-100 text-amber-800" };
}

export default function EmployeeCustomerEntryPage() {
  const { customers, loading } = useLoanDataSync();
  const { user, profile } = useAuth();
  const { assignedCenters, allCenters, hasAssignedCenter, assignedCentersLabel, scopeCustomers } =
    useEmployeeCenterScope();
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");

  const customerRows = useMemo(() => {
    return scopeCustomers(customers)
      .filter((customer) => isEmployeeAddedCustomer(customer, user?.uid, profile?.employeeId))
      .filter(isActiveCustomerRecord)
      .sort((left, right) =>
        String(left.customerName || "").localeCompare(String(right.customerName || ""), undefined, {
          sensitivity: "base",
        })
      );
  }, [customers, profile?.employeeId, scopeCustomers, user?.uid]);

  const customerMetrics = useMemo(() => {
    let approved = 0;
    let pending = 0;
    customerRows.forEach((customer) => {
      const key = getCustomerApprovalKey(customer);
      if (key === "approved") approved += 1;
      else if (key === "pending") pending += 1;
    });
    return {
      created: customerRows.length,
      approved,
      pending,
    };
  }, [customerRows]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "All") return customerRows;
    const target = statusFilter.toLowerCase();
    return customerRows.filter((customer) => getCustomerApprovalKey(customer) === target);
  }, [customerRows, statusFilter]);

  const loanReadyCustomer = useMemo(
    () => customerRows.find((customer) => customerCanApplyForLoan(customer)) || null,
    [customerRows]
  );
  const canStartNewLoan = Boolean(loanReadyCustomer);

  return (
    <div className="employee-page">
      <div className="employee-home-quick-actions mb-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setAddCustomerOpen(true)}
          className="app-button-primary employee-home-action-btn"
          aria-label="Add customer"
        >
          <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="whitespace-nowrap">Add Customer</span>
        </button>
        {canStartNewLoan ? (
          <Link
            to="/employee/loan-request"
            state={{ customerId: loanReadyCustomer.customerId }}
            className="app-button-primary employee-home-action-btn"
          >
            <FilePlus2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="whitespace-nowrap">New Loan</span>
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="app-button-primary employee-home-action-btn cursor-not-allowed opacity-50"
            title="Add a customer and wait for admin approval before applying for a loan."
          >
            <FilePlus2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="whitespace-nowrap">New Loan</span>
          </button>
        )}
      </div>

      {hasAssignedCenter ? (
        <p className="mb-2 rounded-xl border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 text-[11px] text-blue-900">
          Assigned centres: <span className="font-semibold">{assignedCentersLabel}</span>
        </p>
      ) : (
        <p className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
          No centre assigned yet. Ask your administrator to set your assigned centre.
        </p>
      )}

      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <EntryStatCard
          icon={UsersRound}
          label="Created customers"
          value={loading ? "…" : String(customerMetrics.created)}
          accent="blue"
        />
        <EntryStatCard
          icon={CheckCircle2}
          label="Approved customers"
          value={loading ? "…" : String(customerMetrics.approved)}
          accent="green"
        />
        <EntryStatCard
          icon={Clock3}
          label="Pending customers"
          value={loading ? "…" : String(customerMetrics.pending)}
          accent="orange"
        />
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl border border-slate-200/90 bg-white p-0.5 shadow-sm">
        {STATUS_FILTER_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setStatusFilter(option)}
            className={`inline-flex h-9 items-center justify-center rounded-lg text-xs font-semibold transition sm:text-sm ${
              statusFilter === option
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,5.5rem)] items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          <span className="whitespace-nowrap">Name</span>
          <span className="whitespace-nowrap">Phone</span>
          <span className="whitespace-nowrap">Status</span>
        </div>

        <ul className="divide-y divide-slate-100">
          {filteredRows.map((customer) => {
            const status = resolveCustomerApprovalStatus(customer);
            return (
              <li key={customer.customerId}>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,5.5rem)] items-center gap-2 px-3 py-2.5">
                  <p className="employee-field-value min-w-0 truncate whitespace-nowrap text-slate-950">
                    {customer.customerName || "Unnamed"}
                  </p>
                  <p className="employee-field-value min-w-0 truncate whitespace-nowrap tabular-nums text-slate-800">
                    {customer.mobileNumber || "—"}
                  </p>
                  <span
                    className={`inline-flex h-7 w-full items-center justify-center rounded-full px-2 text-[10px] font-semibold leading-none ${status.badgeClass}`}
                  >
                    {status.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {!loading && customerRows.length === 0 ? (
        <p className="employee-customers-empty" title="Customers you add will appear here after submission.">
          No customers added by you yet. Use Add Customer to register a new customer.
        </p>
      ) : null}
      {!loading && customerRows.length > 0 && filteredRows.length === 0 ? (
        <p className="employee-customers-empty" title={`No ${statusFilter.toLowerCase()} customers.`}>
          No {statusFilter.toLowerCase()} customers in your list.
        </p>
      ) : null}

      {addCustomerOpen ? (
        <EmployeeAddCustomerModal
          assignedCenters={assignedCenters}
          allCenters={allCenters}
          hasAssignedCenter={hasAssignedCenter}
          onClose={() => setAddCustomerOpen(false)}
          onSaved={() => setAddCustomerOpen(false)}
        />
      ) : null}
    </div>
  );
}
