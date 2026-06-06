import { useMemo } from "react";
import { CheckCircle2, Clock3, ReceiptText, Wallet } from "lucide-react";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import useAuth from "../hooks/useAuth";
import { employeeMatchesCollector } from "../utils/employeeManagement";
import { useLoanDataSync } from "../context/LoanDataSyncContext";

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatWhen(entry) {
  const raw = entry.collectionDate || entry.submittedAt;
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function EmployeeCollectionSummary() {
  const { customers, entries, loading } = useLoanDataSync();
  const { profile } = useAuth();
  const { scopeCustomers } = useEmployeeCenterScope();

  const { rows, stats } = useMemo(() => {
    const scoped = scopeCustomers(customers);
    const ids = new Set(scoped.map((c) => c.customerId));
    const scopedEntries = entries.filter((e) => ids.has(e.customerId) && employeeMatchesCollector(profile, e));
    const todayKey = new Date().toISOString().slice(0, 10);
    const pending = scopedEntries.filter((e) => e.approvalStatus !== "approved");
    const todayAll = scopedEntries.filter((e) => (e.collectionDate || "").slice(0, 10) === todayKey);
    const todayApproved = todayAll.filter((e) => e.approvalStatus === "approved");
    const todayAmount = todayApproved.reduce((s, e) => s + Number(e.amount || 0), 0);
    const sorted = [...scopedEntries].sort((a, b) => {
      const ta = String(b.submittedAt || b.collectionDate || "").localeCompare(String(a.submittedAt || a.collectionDate || ""));
      return ta;
    });
    return {
      rows: sorted.slice(0, 40),
      stats: {
        pendingCount: pending.length,
        todayCount: todayAll.length,
        todayAmount,
      },
    };
  }, [customers, entries, profile, scopeCustomers]);

  return (
    <div className="mx-auto w-full max-w-lg pb-1">
      <header className="app-panel mb-2.5 flex items-center gap-3 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="app-icon-shell flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/70 sm:h-10 sm:w-10">
          <ReceiptText className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="app-eyebrow text-[9px] font-semibold uppercase tracking-[0.2em] sm:text-[10px]">Collection</p>
          <h1 className="text-base font-semibold leading-tight text-slate-950 sm:text-lg">Activity & entries</h1>
        </div>
      </header>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="app-panel-muted rounded-xl px-2 py-2 text-center sm:rounded-2xl sm:px-3 sm:py-2.5">
          <Wallet className="mx-auto mb-1 h-4 w-4 text-slate-600" />
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Today</p>
          <p className="text-sm font-semibold text-slate-950">{loading ? "…" : formatCurrency(stats.todayAmount)}</p>
        </div>
        <div className="app-panel-muted rounded-xl px-2 py-2 text-center sm:rounded-2xl sm:px-3 sm:py-2.5">
          <Clock3 className="mx-auto mb-1 h-4 w-4 text-amber-600" />
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Pending</p>
          <p className="text-sm font-semibold text-amber-800">{loading ? "…" : stats.pendingCount}</p>
        </div>
        <div className="app-panel-muted rounded-xl px-2 py-2 text-center sm:rounded-2xl sm:px-3 sm:py-2.5">
          <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-emerald-600" />
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Moves today</p>
          <p className="text-sm font-semibold text-slate-950">{loading ? "…" : stats.todayCount}</p>
        </div>
      </div>

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recent entries (your centres)</p>
      <ul className="flex flex-col gap-1.5">
        {loading ? (
          <li className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-600">Loading…</li>
        ) : rows.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-600">
            No collection entries for routed customers yet.
          </li>
        ) : (
          rows.map((e) => {
            const approved = e.approvalStatus === "approved";
            return (
              <li
                key={e.entryId || `${e.customerId}-${e.submittedAt}`}
                className="app-panel-muted flex flex-col gap-1 rounded-2xl px-3 py-2.5 sm:px-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-slate-950">{e.customerName || e.customerId}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {approved ? "OK" : "Pending"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
                  <span className="font-semibold text-slate-800">{formatCurrency(e.amount)}</span>
                  <span>·</span>
                  <span>{e.collectionStatus || "—"}</span>
                  <span>·</span>
                  <span>{formatWhen(e)}</span>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
