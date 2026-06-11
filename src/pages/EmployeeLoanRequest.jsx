import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, FilePlus2, Send } from "lucide-react";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import useAuth from "../hooks/useAuth";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import { createLoanRequest } from "../services/userAuth";
import { isEmployeeVisibleCustomer } from "../utils/employeeScope";

const FREQUENCY_OPTIONS = ["Daily", "Weekly", "Monthly"];

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function normalizeStatusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (value === "pending") return "Pending Approval";
  if (value === "approved") return "Approved";
  if (value === "rejected") return "Rejected";
  return status || "—";
}

function statusBadgeClass(status) {
  const value = String(status || "").toLowerCase();
  if (value === "pending") return "bg-amber-100 text-amber-800 ring-amber-200";
  if (value === "approved") return "bg-emerald-100 text-emerald-800 ring-emerald-200";
  if (value === "rejected") return "bg-rose-100 text-rose-800 ring-rose-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export default function EmployeeLoanRequest() {
  const navigate = useNavigate();
  const location = useLocation();
  const { customers, loanRequests, loading } = useLoanDataSync();
  const { profile, user } = useAuth();
  const { scopeCustomers, hasAssignedCenter } = useEmployeeCenterScope();
  const [customerId, setCustomerId] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanWeeks, setLoanWeeks] = useState("");
  const [collectionFrequency, setCollectionFrequency] = useState("Weekly");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    const preselect = location.state?.customerId;
    if (preselect) {
      setCustomerId(String(preselect));
    }
  }, [location.state?.customerId]);

  const customerOptions = useMemo(() => {
    return scopeCustomers(customers)
      .filter(isEmployeeVisibleCustomer)
      .sort((left, right) =>
        String(left.customerName || "").localeCompare(String(right.customerName || ""), undefined, {
          sensitivity: "base",
        })
      );
  }, [customers, scopeCustomers]);

  const selectedCustomer = useMemo(
    () => customerOptions.find((customer) => customer.customerId === customerId) || null,
    [customerId, customerOptions]
  );

  const sortedRequests = useMemo(
    () =>
      [...loanRequests].sort((left, right) =>
        String(right.submittedAt || "").localeCompare(String(left.submittedAt || ""))
      ),
    [loanRequests]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!customerId) {
      setError("Please select a customer.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createLoanRequest({
        customerId,
        loanAmount: Number(loanAmount),
        loanWeeks: Number(loanWeeks),
        collectionFrequency,
        remarks,
        employeeId: profile?.employeeId || "",
        employeeName: profile?.displayName || profile?.username || profile?.email || "Employee",
        requestedByUid: user?.uid || "",
      });
      setSuccess(`Loan request submitted (${result.requestId}). Status: Pending Approval.`);
      setCustomerId("");
      setLoanAmount("");
      setLoanWeeks("");
      setCollectionFrequency("Weekly");
      setRemarks("");
      await loadNotifications();
    } catch (submitError) {
      setError(submitError?.message || "Unable to submit loan request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="employee-page pb-2">
      <header className="app-panel mb-3 flex items-center gap-3 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3">
        <Link
          to="/employee"
          className="app-icon-shell flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/70"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="app-eyebrow employee-page-eyebrow">Loan request</p>
          <h1 className="employee-page-title">New loan request</h1>
        </div>
        <div className="app-icon-shell flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/70">
          <FilePlus2 className="h-4 w-4" />
        </div>
      </header>

      {!hasAssignedCenter ? (
        <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No centre assigned yet. Ask your administrator before submitting loan requests.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="app-panel space-y-4 rounded-2xl p-4 sm:rounded-[22px] sm:p-5">
        <div>
          <label className="employee-field-label mb-1 block tracking-[0.14em]">Customer</label>
          <select
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            className="app-select w-full"
            disabled={loading || submitting}
          >
            <option value="">{loading ? "Loading customers…" : "Select customer"}</option>
            {customerOptions.map((customer) => (
              <option key={customer.customerId} value={customer.customerId}>
                {customer.customerName || "Unnamed"} · {customer.customerId}
                {String(customer.approvalStatus || "").toLowerCase() === "pending" ? " · Pending" : ""}
              </option>
            ))}
          </select>
          {!loading && customerOptions.length === 0 ? (
            <p className="mt-1.5 text-[11px] text-amber-800">
              {hasAssignedCenter
                ? "No customers in your assigned centres yet. Add a customer from Home, then return here."
                : "No centre assigned. Ask your administrator to assign a centre, or add customers once assigned."}
            </p>
          ) : null}
        </div>

        {selectedCustomer ? (
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
            <p>
              <span className="font-semibold text-slate-900">Phone:</span> {selectedCustomer.mobileNumber || "—"}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-slate-900">Centre:</span> {selectedCustomer.selectedDay || "—"}
            </p>
            {Number(selectedCustomer.loanAmount || 0) > 0 ? (
              <p className="mt-1 text-amber-800">
                Existing loan on file: {formatCurrency(selectedCustomer.loanAmount)} ·{" "}
                {selectedCustomer.collectionFrequency || "Weekly"}
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <label className="employee-field-label mb-1 block tracking-[0.14em]">Loan amount</label>
          <input
            type="number"
            min="1"
            step="1"
            value={loanAmount}
            onChange={(event) => setLoanAmount(event.target.value)}
            className="app-input w-full"
            placeholder="Enter loan amount"
            disabled={submitting}
          />
        </div>

        <div>
          <label className="employee-field-label mb-1 block tracking-[0.14em]">Collection type</label>
          <select
            value={collectionFrequency}
            onChange={(event) => setCollectionFrequency(event.target.value)}
            className="app-select w-full"
            disabled={submitting}
          >
            {FREQUENCY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="employee-field-label mb-1 block tracking-[0.14em]">Tenure</label>
          <input
            type="number"
            min="1"
            step="1"
            value={loanWeeks}
            onChange={(event) => setLoanWeeks(event.target.value)}
            className="app-input w-full"
            placeholder="Number of installments"
            disabled={submitting}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            {collectionFrequency === "Daily"
              ? "Total number of daily installments."
              : collectionFrequency === "Monthly"
                ? "Total number of monthly installments."
                : "Total number of weekly installments."}
          </p>
        </div>

        <div>
          <label className="employee-field-label mb-1 block tracking-[0.14em]">Remarks</label>
          <textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            className="app-input min-h-[88px] w-full resize-y"
            placeholder="Optional notes for admin review"
            disabled={submitting}
          />
        </div>

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
        ) : null}
        {success ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="submit"
            disabled={submitting || loading}
            className="app-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold"
          >
            <Send className="h-4 w-4" />
            {submitting ? "Submitting…" : "Submit request"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/employee")}
            className="app-button-secondary rounded-2xl px-4 py-2.5 text-sm font-semibold"
          >
            Cancel
          </button>
        </div>
      </form>

      <section className="app-panel mt-3 rounded-2xl p-4 sm:rounded-[22px] sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <FilePlus2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Your loan requests</h2>
            <p className="text-xs text-slate-500">Track status after admin review.</p>
          </div>
        </div>

        {loading ? (
          <p className="py-4 text-center text-sm text-slate-500">Loading requests…</p>
        ) : sortedRequests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-4 text-center text-sm text-slate-600">
            No loan requests yet. Submit a request above.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-200/70">
            {sortedRequests.map((row) => (
              <li key={row.requestId || row.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{row.customerName || "Customer"}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {formatCurrency(row.loanAmount)} · {row.collectionFrequency || "Weekly"} · {row.loanWeeks || "—"} installments
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {row.requestId || "—"} · {formatDate(row.submittedAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${statusBadgeClass(row.status)}`}
                >
                  {normalizeStatusLabel(row.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
