import { useMemo, useState } from "react";
import { CheckCircle2, Search, XCircle } from "lucide-react";
import { useLoanDataSync } from "../../context/LoanDataSyncContext";
import { approveCustomer, rejectCustomer } from "../../services/userAuth";
import { isActiveCustomerRecord } from "../../utils/recordFlags";

const STATUS_OPTIONS = ["All", "Pending Approval", "Approved"];

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

export default function CustomerApprovalsPanel() {
  const { customers, loading } = useLoanDataSync();
  const [statusFilter, setStatusFilter] = useState("Pending Approval");
  const [search, setSearch] = useState("");
  const [actionId, setActionId] = useState("");
  const [actionError, setActionError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return customers
      .filter(isActiveCustomerRecord)
      .filter((customer) => {
        const statusLabel = normalizeStatusLabel(customer.approvalStatus);
        if (statusFilter !== "All" && statusLabel !== statusFilter) return false;
        if (!query) return true;
        return (
          String(customer.customerName || "").toLowerCase().includes(query) ||
          String(customer.customerId || "").toLowerCase().includes(query) ||
          String(customer.mobileNumber || "").toLowerCase().includes(query) ||
          String(customer.createdByEmployeeName || "").toLowerCase().includes(query)
        );
      })
      .sort((left, right) =>
        String(right.submittedAt || "").localeCompare(String(left.submittedAt || ""))
      );
  }, [customers, search, statusFilter]);

  const handleApprove = async (customerId) => {
    setActionId(customerId);
    setActionError("");
    setStatusMessage("");
    try {
      await approveCustomer(customerId);
      setStatusMessage(`Customer ${customerId} approved.`);
    } catch (error) {
      setActionError(error?.message || "Unable to approve customer.");
    } finally {
      setActionId("");
    }
  };

  const handleReject = async (customerId) => {
    const note = window.prompt("Rejection note (optional):", "") ?? "";
    setActionId(customerId);
    setActionError("");
    setStatusMessage("");
    try {
      await rejectCustomer(customerId, { rejectionNote: note });
      setStatusMessage("Customer rejected.");
    } catch (error) {
      setActionError(error?.message || "Unable to reject customer.");
    } finally {
      setActionId("");
    }
  };

  return (
    <section className="app-section-card p-4 md:p-5">
      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, ID, or employee"
            className="app-input w-full !pl-11 pr-4"
          />
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="app-select w-full">
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {actionError ? (
        <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{actionError}</p>
      ) : null}
      {statusMessage ? (
        <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{statusMessage}</p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
              <tr>
                <th className="px-3 py-2.5 text-left">Customer</th>
                <th className="px-3 py-2.5 text-left">Mobile</th>
                <th className="px-3 py-2.5 text-left">Centre</th>
                <th className="px-3 py-2.5 text-left">Added by</th>
                <th className="px-3 py-2.5 text-left">Submitted</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((customer) => {
                const isPending = String(customer.approvalStatus || "").toLowerCase() === "pending";
                const busy = actionId === customer.customerId;
                return (
                  <tr key={customer.customerId} className="text-slate-800">
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900">{customer.customerName || "Unnamed"}</p>
                      <p className="text-xs text-slate-500">{customer.customerId}</p>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{customer.mobileNumber || "—"}</td>
                    <td className="px-3 py-3">{customer.selectedDay || customer.subCenterLabel || "—"}</td>
                    <td className="px-3 py-3">{customer.createdByEmployeeName || "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{formatDate(customer.submittedAt)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${statusBadgeClass(customer.approvalStatus)}`}
                      >
                        {normalizeStatusLabel(customer.approvalStatus)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {isPending ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleApprove(customer.customerId)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleReject(customer.customerId)}
                            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                          >
                            <XCircle className="h-3.5 w-3.5" aria-hidden />
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="block text-right text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && filteredRows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No customers match this filter.</p>
      ) : null}
    </section>
  );
}
