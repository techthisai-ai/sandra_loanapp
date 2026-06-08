import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, FilePlus2, Send } from "lucide-react";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import useAuth from "../hooks/useAuth";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import { createLoanRequest } from "../services/userAuth";

const FREQUENCY_OPTIONS = ["Daily", "Weekly", "Monthly"];

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

export default function EmployeeLoanRequest() {
  const navigate = useNavigate();
  const { customers, loading } = useLoanDataSync();
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

  const customerOptions = useMemo(() => {
    return scopeCustomers(customers)
      .filter((customer) => String(customer.approvalStatus || "").toLowerCase() === "approved")
      .sort((a, b) => String(a.customerName || "").localeCompare(String(b.customerName || "")));
  }, [customers, scopeCustomers]);

  const selectedCustomer = useMemo(
    () => customerOptions.find((customer) => customer.customerId === customerId) || null,
    [customerId, customerOptions]
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
          <label className="employee-field-label mb-1 block tracking-[0.14em]">
            Customer
          </label>
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
              </option>
            ))}
          </select>
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
          <label className="employee-field-label mb-1 block tracking-[0.14em]">
            Loan amount
          </label>
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
          <label className="employee-field-label mb-1 block tracking-[0.14em]">
            Collection type
          </label>
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
          <label className="employee-field-label mb-1 block tracking-[0.14em]">
            Tenure
          </label>
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
          <label className="employee-field-label mb-1 block tracking-[0.14em]">
            Remarks
          </label>
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
    </div>
  );
}
