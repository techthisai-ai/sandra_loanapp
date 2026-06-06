import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock3, FilePlus2, IndianRupee, UsersRound, Wallet } from "lucide-react";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import useAuth from "../hooks/useAuth";
import { employeeMatchesCollector } from "../utils/employeeManagement";

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function entryPaidAt(entry) {
  const d = safeDate(entry.collectionDate || entry.submittedAt);
  return d;
}

function formatRecentWhen(entry) {
  const d = entryPaidAt(entry);
  if (!d) return "—";
  const today = startOfDay(new Date());
  const day = startOfDay(d);
  const diffDays = Math.round((today - day) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return `Today · ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function StatTile({ icon: Icon, label, value, hint, tone = "text-slate-950" }) {
  return (
    <div className="app-panel-muted rounded-2xl p-3 sm:rounded-[22px] sm:p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-[10px] sm:tracking-[0.2em]">{label}</p>
          <p className={`mt-1 text-lg font-semibold leading-tight sm:text-xl ${tone}`}>{value}</p>
          {hint ? <p className="mt-1 line-clamp-2 text-[10px] text-slate-600 sm:text-xs">{hint}</p> : null}
        </div>
        <div className="app-icon-shell flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/70 sm:h-10 sm:w-10">
          <Icon className="h-4 w-4 text-slate-700 sm:h-[18px] sm:w-[18px]" />
        </div>
      </div>
    </div>
  );
}

export default function EmployeeHome() {
  const { customers, entries, loading } = useLoanDataSync();
  const { profile } = useAuth();
  const { assignedCentersLabel, hasAssignedCenter, scopeCustomers } = useEmployeeCenterScope();

  const metrics = useMemo(() => {
    const scoped = scopeCustomers(customers);
    const ids = new Set(scoped.map((c) => c.customerId));
    const approvedEntries = entries.filter(
      (e) => e.approvalStatus === "approved" && ids.has(e.customerId) && employeeMatchesCollector(profile, e)
    );
    const approvedByCustomer = approvedEntries.reduce((map, e) => {
      map[e.customerId] = (map[e.customerId] || 0) + Number(e.amount || 0);
      return map;
    }, {});
    const todayKey = new Date().toISOString().slice(0, 10);
    const today = startOfDay(new Date());
    const todayApproved = approvedEntries.filter((e) => {
      const d = (e.collectionDate || "").slice(0, 10);
      return d === todayKey && ids.has(e.customerId);
    });
    const todayCollected = todayApproved.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const todayCollectedIds = new Set(todayApproved.map((e) => e.customerId));
    const dueToday = scoped.filter((c) => {
      const due = safeDate(c.dueDate);
      return due && startOfDay(due).getTime() === today.getTime();
    });
    const pendingCollection = dueToday.filter((c) => !todayCollectedIds.has(c.customerId)).length;
    const outstanding = scoped.reduce((sum, c) => {
      const target = Number(c.totalPayable || 0);
      const paid = Number(approvedByCustomer[c.customerId] || 0);
      return sum + Math.max(target - paid, 0);
    }, 0);
    const pendingEntries = entries.filter(
      (e) => e.approvalStatus !== "approved" && ids.has(e.customerId) && employeeMatchesCollector(profile, e)
    ).length;
    const totalCollected = approvedEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    return {
      scopedCount: scoped.length,
      todayCollected,
      pendingCollection,
      outstanding,
      pendingEntries,
      totalCollected,
    };
  }, [customers, entries, profile, scopeCustomers]);

  const recentPaid = useMemo(() => {
    const scoped = scopeCustomers(customers);
    const ids = new Set(scoped.map((c) => c.customerId));
    const nameById = new Map(scoped.map((c) => [c.customerId, c.customerName || c.customerId]));

    const paid = entries.filter((e) => {
      if (!ids.has(e.customerId)) return false;
      if (!employeeMatchesCollector(profile, e)) return false;
      if (e.approvalStatus !== "approved") return false;
      if (Number(e.amount || 0) <= 0) return false;
      const st = String(e.collectionStatus || "Collected").toLowerCase();
      if (st === "skipped" || st === "rescheduled") return false;
      return true;
    });

    paid.sort((a, b) => {
      const ta = entryPaidAt(a)?.getTime() ?? 0;
      const tb = entryPaidAt(b)?.getTime() ?? 0;
      return tb - ta;
    });

    return paid.slice(0, 12).map((e) => ({
      key: e.entryId || `${e.customerId}-${e.collectionDate}-${e.submittedAt}`,
      name: e.customerName || nameById.get(e.customerId) || e.customerId,
      amount: Number(e.amount || 0),
      status: e.collectionStatus || "Collected",
      whenLabel: formatRecentWhen(e),
    }));
  }, [customers, entries, profile, scopeCustomers]);

  return (
    <div className="mx-auto w-full max-w-lg pb-1">
      <header className="app-panel mb-2.5 flex items-center gap-3 rounded-2xl px-3 py-2.5 sm:mb-3 sm:px-4 sm:py-3">
        <div className="app-icon-shell flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/70 sm:h-10 sm:w-10">
          <Wallet className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="app-eyebrow text-[9px] font-semibold uppercase tracking-[0.2em] sm:text-[10px]">Home</p>
          <h1 className="text-base font-semibold leading-tight text-slate-950 sm:text-lg">Today at a glance</h1>
        </div>
      </header>

      <div className="mb-2">
        <Link
          to="/employee/loan-request"
          className="app-button-primary inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
        >
          <FilePlus2 className="h-4 w-4" />
          New loan request
        </Link>
      </div>

      {hasAssignedCenter ? (
        <p className="mb-2 rounded-2xl border border-blue-100 bg-blue-50/80 px-3 py-2 text-xs text-blue-900">
          Assigned centres: <span className="font-semibold">{assignedCentersLabel}</span>
        </p>
      ) : (
        <p className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No centre assigned yet. Ask your administrator to set your assigned centre.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        <StatTile
          icon={UsersRound}
          label="Assigned customers"
          value={loading ? "…" : String(metrics.scopedCount)}
          hint="Customers in your assigned centres"
        />
        <StatTile
          icon={IndianRupee}
          label="Today's collection"
          value={loading ? "…" : formatCurrency(metrics.todayCollected)}
          hint="Your approved collections today"
        />
        <StatTile
          icon={Clock3}
          label="Pending customers"
          value={loading ? "…" : String(metrics.pendingCollection)}
          hint="Due today without collection"
          tone="text-amber-700"
        />
        <StatTile
          icon={CheckCircle2}
          label="Total collected"
          value={loading ? "…" : formatCurrency(metrics.totalCollected)}
          hint="Your approved collections"
        />
      </div>

      <section className="app-panel-muted mt-3 rounded-2xl p-3 sm:mt-4 sm:rounded-[22px] sm:p-4" aria-labelledby="recent-paid-heading">
        <div className="mb-2.5 flex items-center gap-2">
          <div className="app-icon-shell flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/70">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h2 id="recent-paid-heading" className="text-sm font-semibold text-slate-950">
              Recently paid
            </h2>
            <p className="text-[11px] leading-snug text-slate-600">Approved collections on your centres (newest first)</p>
          </div>
        </div>

        {loading ? (
          <p className="py-4 text-center text-sm text-slate-500">Loading…</p>
        ) : recentPaid.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200/90 bg-white/50 px-3 py-4 text-center text-sm text-slate-600">
            No recent payments yet. When dues are collected and approved, they will show here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-200/60">
            {recentPaid.map((row) => (
              <li key={row.key} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{row.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-600">{row.whenLabel}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-emerald-800">{formatCurrency(row.amount)}</p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{row.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
