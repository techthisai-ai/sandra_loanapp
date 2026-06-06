import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Search, XCircle } from "lucide-react";
import { useLoanDataSync } from "../../context/LoanDataSyncContext";
import { approveLoanRequest, rejectLoanRequest } from "../../services/userAuth";

const STATUS_OPTIONS = ["All", "Pending Approval", "Approved", "Rejected"];

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
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

export default function LoanRequestsPanel() {
  const { loanRequests, loading } = useLoanDataSync();
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [actionId, setActionId] = useState("");
  const [actionError, setActionError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return loanRequests.filter((row) => {
      const statusLabel = normalizeStatusLabel(row.status);
      if (statusFilter !== "All" && statusLabel !== statusFilter) return false;
      if (!query) return true;
      return (
        String(row.customerName || "").toLowerCase().includes(query) ||
        String(row.employeeName || "").toLowerCase().includes(query) ||
        String(row.requestId || "").toLowerCase().includes(query) ||
        String(row.customerId || "").toLowerCase().includes(query)
      );
    });
  }, [loanRequests, search, statusFilter]);

  const pendingCount = useMemo(
    () => loanRequests.filter((row) => String(row.status || "").toLowerCase() === "pending").length,
    [loanRequests]
  );

  const handleApprove = async (requestId) => {
    setActionId(requestId);
    setActionError("");
    setStatusMessage("");
    try {
      const result = await approveLoanRequest(requestId);
      setStatusMessage(`Approved. Loan ID: ${result.loanId}`);
    } catch (error) {
      setActionError(error?.message || "Unable to approve loan request.");
    } finally {
      setActionId("");
    }
  };

  const handleReject = async (requestId) => {
    const note = window.prompt("Rejection note (optional):", "") ?? "";
    setActionId(requestId);
    setActionError("");
    setStatusMessage("");
    try {
      await rejectLoanRequest(requestId, { rejectionNote: note });
      setStatusMessage("Loan request rejected.");
    } catch (error) {
      setActionError(error?.message || "Unable to reject loan request.");
    } finally {
      setActionId("");
    }
  };

  return (
    <section className="app-section-card p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Loan requests</h3>
            <p className="text-sm text-slate-600">
              Review employee-submitted loan requests. {pendingCount} pending approval.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, employee, or request ID"
            className="app-input w-full pl-9"
          />
        </label>
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
                <th className="px-3 py-2.5 text-left">Employee</th>
                <th className="px-3 py-2.5 text-right">Loan amount</th>
                <th className="px-3 py-2.5 text-center">Type</th>
                <th className="px-3 py-2.5 text-center">Tenure</th>
                <th className="px-3 py-2.5 text-left">Request date</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Loading loan requests…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No loan requests match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isPending = String(row.status || "").toLowerCase() === "pending";
                  const busy = actionId === row.requestId;
                  return (
                    <tr key={row.requestId} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-950">{row.customerName || "—"}</p>
                        <p className="text-xs text-slate-500">{row.customerId || "—"}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">{row.employeeName || "—"}</p>
                        <p className="text-xs text-slate-500">{row.employeeId || "—"}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-900">
                        {formatCurrency(row.loanAmount)}
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-700">{row.collectionFrequency || "—"}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">{row.loanWeeks || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-700">{formatDate(row.submittedAt)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${statusBadgeClass(row.status)}`}
                        >
                          {normalizeStatusLabel(row.status)}
                        </span>
                        {row.loanId ? <p className="mt-1 text-[10px] text-slate-500">{row.loanId}</p> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        {isPending ? (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleApprove(row.requestId)}
                              className="app-button-primary inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {busy ? "…" : "Approve"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleReject(row.requestId)}
                              className="app-button-secondary inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-rose-700"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <p className="text-right text-xs text-slate-500">—</p>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
