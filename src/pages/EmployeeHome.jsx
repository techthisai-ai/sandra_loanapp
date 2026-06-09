import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Clock3, FilePlus2, IndianRupee, UserPlus, UsersRound } from "lucide-react";
import EmployeeAddCustomerModal from "../components/employee/EmployeeAddCustomerModal";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import useAuth from "../hooks/useAuth";
import { employeeMatchesCollector } from "../utils/employeeManagement";

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
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

const PERIOD_OPTIONS = ["All", "Today", "Week", "Month", "Year"];

function startOfWeekMonday(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function dateMatchesPeriod(dateValue, period, reference = new Date()) {
  if (period === "All") return true;
  const date = safeDate(dateValue);
  if (!date) return false;
  const target = startOfDay(date);
  const today = startOfDay(reference);

  if (period === "Today") return target.getTime() === today.getTime();
  if (period === "Week") {
    const weekStart = startOfWeekMonday(today);
    return target >= weekStart && target <= today;
  }
  if (period === "Month") {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return target >= monthStart && target <= today;
  }
  if (period === "Year") {
    const yearStart = new Date(today.getFullYear(), 0, 1);
    return target >= yearStart && target <= today;
  }
  return true;
}

function entryMatchesPeriod(entry, period, reference = new Date()) {
  return dateMatchesPeriod(entry.collectionDate || entry.submittedAt, period, reference);
}

function collectionPeriodLabel(period) {
  if (period === "Today") return "Today's collection";
  if (period === "Week") return "This week's collection";
  if (period === "Month") return "This month's collection";
  if (period === "Year") return "This year's collection";
  return "Today's collection";
}

function pendingPeriodLabel(period) {
  if (period === "Today") return "Pending customers";
  if (period === "Week") return "Pending this week";
  if (period === "Month") return "Pending this month";
  if (period === "Year") return "Pending this year";
  return "Pending customers";
}

const EMPLOYEE_STAT_ACCENTS = {
  blue: {
    border: "border-[#3B82F6]/30 hover:border-[#3B82F6]/45",
    iconShell: "bg-[#3B82F6]/10 text-[#3B82F6]",
    value: "text-slate-950",
  },
  purple: {
    border: "border-[#8B5CF6]/30 hover:border-[#8B5CF6]/45",
    iconShell: "bg-[#8B5CF6]/10 text-[#8B5CF6]",
    value: "text-slate-950",
  },
  orange: {
    border: "border-[#F59E0B]/30 hover:border-[#F59E0B]/45",
    iconShell: "bg-[#F59E0B]/10 text-[#F59E0B]",
    value: "text-[#B45309]",
  },
  green: {
    border: "border-[#10B981]/30 hover:border-[#10B981]/45",
    iconShell: "bg-[#10B981]/10 text-[#10B981]",
    value: "text-slate-950",
  },
};

function EmployeeStatCard({ icon: Icon, label, value, accent = "blue" }) {
  const tone = EMPLOYEE_STAT_ACCENTS[accent] || EMPLOYEE_STAT_ACCENTS.blue;
  const valueText = String(value ?? "");
  const valueSize =
    valueText.length >= 12 ? "text-sm" : valueText.length >= 9 ? "text-base" : "text-lg";

  return (
    <div
      className={`employee-stat-card flex flex-col items-center justify-center rounded-xl border bg-white px-2 py-2.5 shadow-sm transition hover:shadow-md ${tone.border}`}
    >
      <div className={`mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone.iconShell}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </div>
      <p className="employee-stat-label max-w-full px-0.5 text-center font-semibold uppercase leading-snug text-slate-600">
        {label}
      </p>
      <p
        className={`employee-stat-value mt-1 text-center font-bold tabular-nums leading-none tracking-tight ${valueSize} ${tone.value}`}
      >
        {valueText}
      </p>
    </div>
  );
}

export default function EmployeeHome() {
  const navigate = useNavigate();
  const { customers, entries, loading } = useLoanDataSync();
  const { profile } = useAuth();
  const { assignedCenters, assignedCentersLabel, allCenters, hasAssignedCenter, scopeCustomers } =
    useEmployeeCenterScope();
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [periodFilter, setPeriodFilter] = useState("All");

  const metrics = useMemo(() => {
    const scoped = scopeCustomers(customers);
    const ids = new Set(scoped.map((c) => c.customerId));
    const approvedEntries = entries.filter(
      (e) => e.approvalStatus === "approved" && ids.has(e.customerId) && employeeMatchesCollector(profile, e)
    );
    const periodEntries =
      periodFilter === "All"
        ? approvedEntries.filter((e) => entryMatchesPeriod(e, "Today"))
        : approvedEntries.filter((e) => entryMatchesPeriod(e, periodFilter));
    const periodCollected = periodEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const periodCollectedIds = new Set(periodEntries.map((e) => e.customerId));

    const pendingScope =
      periodFilter === "All"
        ? scoped.filter((c) => {
            const due = safeDate(c.dueDate);
            return due && startOfDay(due).getTime() <= startOfDay(new Date()).getTime();
          })
        : scoped.filter((c) => dateMatchesPeriod(c.dueDate, periodFilter));

    const pendingCollection = pendingScope.filter((c) => !periodCollectedIds.has(c.customerId)).length;
    const totalCollected = approvedEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    return {
      scopedCount: scoped.length,
      periodCollected,
      pendingCollection,
      totalCollected,
    };
  }, [customers, entries, periodFilter, profile, scopeCustomers]);

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
      if (periodFilter !== "All" && !entryMatchesPeriod(e, periodFilter)) return false;
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
  }, [customers, entries, periodFilter, profile, scopeCustomers]);

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
        <Link to="/employee/loan-request" className="app-button-primary employee-home-action-btn">
          <FilePlus2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="whitespace-nowrap">New Loan</span>
        </Link>
      </div>

      {hasAssignedCenter ? (
        <p className="mb-1.5 rounded-xl border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 text-[11px] text-blue-900">
          Assigned centres: <span className="font-semibold">{assignedCentersLabel}</span>
        </p>
      ) : (
        <p className="mb-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
          No centre assigned yet. Ask your administrator to set your assigned centre.
        </p>
      )}

      <div className="employee-stat-grid">
        <EmployeeStatCard
          icon={UsersRound}
          label="Assigned customers"
          value={loading ? "…" : String(metrics.scopedCount)}
          accent="blue"
        />
        <EmployeeStatCard
          icon={IndianRupee}
          label={collectionPeriodLabel(periodFilter)}
          value={loading ? "…" : formatCurrency(metrics.periodCollected)}
          accent="purple"
        />
        <EmployeeStatCard
          icon={Clock3}
          label={pendingPeriodLabel(periodFilter)}
          value={loading ? "…" : String(metrics.pendingCollection)}
          accent="orange"
        />
        <EmployeeStatCard
          icon={CheckCircle2}
          label="Total collected"
          value={loading ? "…" : formatCurrency(metrics.totalCollected)}
          accent="green"
        />
      </div>

      <div className="employee-home-period-filter mt-2 grid grid-cols-5 gap-1 rounded-xl border border-slate-200/90 bg-white p-0.5 shadow-sm">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setPeriodFilter(option)}
            className={`inline-flex h-9 items-center justify-center rounded-lg text-xs font-semibold transition sm:text-sm ${
              periodFilter === option
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <section className="app-panel-muted mt-2.5 rounded-2xl p-3 sm:mt-3" aria-labelledby="recent-paid-heading">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#10B981]/10 text-[#10B981]">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          </div>
          <h2 id="recent-paid-heading" className="text-sm font-semibold text-slate-950">
            Recent collection
          </h2>
        </div>

        {loading ? (
          <p className="py-3 text-center text-sm text-slate-500">Loading…</p>
        ) : recentPaid.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200/90 bg-white/50 px-3 py-3 text-center text-sm text-slate-600">
            {periodFilter === "All" ? "No recent payments yet." : `No collections for ${periodFilter.toLowerCase()}.`}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-200/60">
            {recentPaid.map((row) => (
              <li key={row.key} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{row.name}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{row.whenLabel}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-emerald-800">{formatCurrency(row.amount)}</p>
                  <p className="employee-field-label mt-0.5">{row.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {addCustomerOpen ? (
        <EmployeeAddCustomerModal
          assignedCenters={assignedCenters}
          allCenters={allCenters}
          hasAssignedCenter={hasAssignedCenter}
          onClose={() => setAddCustomerOpen(false)}
          onSaved={(result) => {
            setAddCustomerOpen(false);
            if (result?.customerId) {
              navigate("/employee/loan-request", { state: { customerId: result.customerId } });
            }
          }}
        />
      ) : null}
    </div>
  );
}
