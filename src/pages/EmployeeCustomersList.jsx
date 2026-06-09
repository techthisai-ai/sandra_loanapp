import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import { EMPLOYEE_ROOT_DAYS } from "../constants/employeeDays";
import useAuth from "../hooks/useAuth";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import { employeeMatchesCollector } from "../utils/employeeManagement";
import { buildEmployeeCustomerSummary, getEmployeeCustomerSearchText } from "../utils/employeeCustomerSummary";

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function EmployeeCustomerMetricCard({ emoji, label, value, accent = "blue" }) {
  const accents = {
    blue: "border-[#3B82F6]/30 bg-[#3B82F6]/5",
    orange: "border-[#F59E0B]/30 bg-[#F59E0B]/5",
    green: "border-[#10B981]/30 bg-[#10B981]/5",
    violet: "border-[#8B5CF6]/30 bg-[#8B5CF6]/5",
  };
  const valueColors = {
    blue: "text-blue-800",
    orange: "text-[#B45309]",
    green: "text-emerald-800",
    violet: "text-violet-800",
  };

  return (
    <div
      className={`employee-customer-metric-card flex min-h-[4.75rem] flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center shadow-sm ${accents[accent] || accents.blue}`}
    >
      <span className="text-base leading-none" aria-hidden="true">
        {emoji}
      </span>
      <p className={`mt-1 text-base font-bold tabular-nums leading-none tracking-tight ${valueColors[accent] || valueColors.blue}`}>
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase leading-tight tracking-[0.06em] text-slate-600">
        {label}
      </p>
    </div>
  );
}

const LIST_STATUS_OPTIONS = [
  { key: "due-today", label: "Due Today" },
  { key: "pending", label: "Pending" },
  { key: "overdue", label: "Overdue" },
  { key: "collected", label: "Collected" },
  { key: "partially", label: "Partially" },
];

const LIST_STATUS_DISPLAY = {
  collected: { emoji: "🟢", label: "Collected", tone: "text-emerald-700" },
  partially: { emoji: "🔵", label: "Partially", tone: "text-blue-700" },
  pending: { emoji: "🟡", label: "Pending", tone: "text-amber-700" },
  overdue: { emoji: "🔴", label: "Overdue", tone: "text-rose-700" },
  "due-today": { emoji: "🟠", label: "Due Today", tone: "text-orange-600" },
};

function defaultDayLabel(selectedDay) {
  if (selectedDay) return selectedDay;
  return EMPLOYEE_ROOT_DAYS[0].label;
}

/** One of: due-today | pending | overdue | collected | partially */
function resolveEmployeeListStatus(row) {
  if (row.isCurrentTenureCollected) return "collected";
  if (row.collectionStatus === "Partial Payment") return "partially";
  if (row.hasPendingApproval) return "pending";
  if (row.dueStatusKey === "overdue") return "overdue";
  if (row.dueStatusKey === "due-today") return "due-today";
  return "pending";
}

function CustomerStatusValue({ listStatus }) {
  const display = LIST_STATUS_DISPLAY[listStatus] || LIST_STATUS_DISPLAY.pending;

  return (
    <div className={`employee-status-cell min-w-0 ${display.tone}`}>
      <span className="employee-status-emoji" aria-hidden="true">
        {display.emoji}
      </span>
      <span className="employee-field-value truncate whitespace-nowrap">{display.label}</span>
    </div>
  );
}

export default function EmployeeCustomersList() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { customers, entries, loading } = useLoanDataSync();
  const { allCenters, hasAssignedCenter, scopeCustomers } = useEmployeeCenterScope();
  const [query, setQuery] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("All");

  const entriesByCustomerId = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => {
      const customerId = entry.customerId;
      if (!customerId) return;
      if (!map.has(customerId)) map.set(customerId, []);
      map.get(customerId).push(entry);
    });
    return map;
  }, [entries]);

  const readyCustomers = useMemo(() => {
    return scopeCustomers(customers).sort((left, right) =>
      String(left.customerName || "").localeCompare(String(right.customerName || ""), undefined, { sensitivity: "base" })
    );
  }, [customers, scopeCustomers]);

  const customerRows = useMemo(() => {
    return readyCustomers.map((customer) => {
      const customerEntries = entriesByCustomerId.get(customer.customerId) || [];
      const summary = buildEmployeeCustomerSummary(customer, customerEntries, allCenters);
      return {
        customer,
        ...summary,
        listStatus: resolveEmployeeListStatus(summary),
      };
    });
  }, [allCenters, entriesByCustomerId, readyCustomers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customerRows.filter((row) => {
      const matchesSearch = !q || getEmployeeCustomerSearchText(row.customer, row, allCenters).includes(q);
      const matchesCollection = collectionFilter === "All" || row.listStatus === collectionFilter;
      return matchesSearch && matchesCollection;
    });
  }, [allCenters, collectionFilter, query, customerRows]);

  const collectionMetrics = useMemo(() => {
    const scopedIds = new Set(readyCustomers.map((customer) => customer.customerId));
    const todayKey = new Date().toISOString().slice(0, 10);

    const collectedToday = entries.reduce((sum, entry) => {
      if (!scopedIds.has(entry.customerId)) return sum;
      if (String(entry.approvalStatus || "").toLowerCase() !== "approved") return sum;
      if (!employeeMatchesCollector(profile, entry)) return sum;
      const collectionDate = String(entry.collectionDate || entry.submittedAt || "").slice(0, 10);
      if (collectionDate !== todayKey) return sum;
      return sum + Number(entry.amount || 0);
    }, 0);

    const pendingAmount = customerRows.reduce((sum, row) => {
      if (row.isCurrentTenureCollected) return sum;
      if (row.dueStatusKey !== "due-today" && row.dueStatusKey !== "overdue") return sum;
      return sum + Number(row.currentDueAmountNumber || 0);
    }, 0);

    const todayTarget = collectedToday + pendingAmount;
    const progressPercent = todayTarget > 0 ? Math.min(100, Math.round((collectedToday / todayTarget) * 100)) : 0;
    const pendingTenureCustomers = customerRows.filter(
      (row) => row.pendingTenuresLabel && row.pendingTenuresLabel !== "—"
    ).length;
    const partiallyPaidCustomers = customerRows.filter((row) => row.listStatus === "partially").length;

    return {
      todayTarget,
      collectedToday,
      pendingAmount,
      progressPercent,
      pendingTenureCustomers,
      partiallyPaidCustomers,
    };
  }, [customerRows, entries, profile, readyCustomers]);

  const openCustomerDetail = (row) => {
    const day = defaultDayLabel(row.customer.selectedDay);
    navigate(`/employee/customers/${encodeURIComponent(day)}/${encodeURIComponent(row.customer.customerId)}`, {
      state: { customer: row.customer, fromList: true },
    });
  };

  return (
    <div className="employee-page">
      <section className="employee-customer-summary mb-2" aria-label="Today's collection summary">
        <div className="employee-customer-target-hero rounded-2xl border border-[#3B82F6]/35 bg-gradient-to-br from-[#3B82F6]/10 via-white to-white px-3.5 py-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2563EB]">Today&apos;s target</p>
              <p className="mt-1 text-2xl font-bold tabular-nums leading-none tracking-tight text-slate-950">
                {loading ? "…" : formatCurrency(collectionMetrics.todayTarget)}
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#3B82F6]/10 text-lg" aria-hidden="true">
              🎯
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium text-slate-600">
              {loading ? "Loading progress…" : `${collectionMetrics.progressPercent}% collected`}
            </p>
            <p className="text-[10px] font-semibold tabular-nums text-[#2563EB]">
              {loading ? "…" : formatCurrency(collectionMetrics.collectedToday)}
            </p>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#3B82F6]/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#3B82F6] to-[#2563EB] transition-all duration-500"
              style={{ width: `${loading ? 0 : collectionMetrics.progressPercent}%` }}
              role="progressbar"
              aria-valuenow={collectionMetrics.progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Today's collection progress"
            />
          </div>
        </div>

        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          <EmployeeCustomerMetricCard
            emoji="💰"
            label="Collected today"
            value={loading ? "…" : formatCurrency(collectionMetrics.collectedToday)}
            accent="green"
          />
          <EmployeeCustomerMetricCard
            emoji="📋"
            label="Pending tenure"
            value={loading ? "…" : String(collectionMetrics.pendingTenureCustomers)}
            accent="orange"
          />
          <EmployeeCustomerMetricCard
            emoji="🔵"
            label="Partially paid"
            value={loading ? "…" : String(collectionMetrics.partiallyPaidCustomers)}
            accent="blue"
          />
        </div>
      </section>

      <div className="employee-customers-toolbar mb-2 flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCollectionFilter("All")}
          className={`inline-flex h-9 shrink-0 items-center justify-center rounded-xl border px-2.5 text-xs font-semibold transition ${
            collectionFilter === "All"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-200/90 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
          }`}
        >
          Show all
        </button>
        <select
          value={collectionFilter === "All" ? "" : collectionFilter}
          onChange={(event) => setCollectionFilter(event.target.value || "All")}
          className="app-select employee-customers-filter h-9 shrink-0 rounded-xl bg-white text-xs font-medium text-slate-800"
        >
          <option value="">Filter status</option>
          {LIST_STATUS_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone…"
            className="employee-customers-search h-9 w-full rounded-xl border border-slate-200/90 bg-white pl-8 pr-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-[var(--app-accent)] focus:ring-2 focus:ring-slate-300/40"
          />
        </div>
      </div>

      {!hasAssignedCenter ? (
        <p className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No centre assigned. Customers will appear here once your administrator assigns a centre.
        </p>
      ) : null}

      <div className="employee-customers-list-shell overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm">
        <div className="employee-customers-header employee-customers-grid">
          <span className="whitespace-nowrap">Name</span>
          <span className="whitespace-nowrap" title="Current due">
            Cur. due
          </span>
          <span className="whitespace-nowrap" title="Pending tenure numbers">
            Pend tenure
          </span>
          <span className="whitespace-nowrap">Status</span>
          <span className="employee-customers-chevron-spacer" aria-hidden="true" />
        </div>

        <ul className="divide-y divide-slate-100">
          {filtered.map((row) => (
            <li key={row.customerId}>
              <button
                type="button"
                onClick={() => openCustomerDetail(row)}
                className="employee-customers-row employee-customers-grid app-panel-muted w-full text-left transition active:scale-[0.995]"
              >
                <p
                  className={`employee-field-value min-w-0 truncate whitespace-nowrap ${
                    row.isCurrentTenureCollected ? "text-emerald-700" : "text-slate-950"
                  }`}
                >
                  {row.customerName || "Unnamed"}
                </p>
                <p className="employee-field-value min-w-0 truncate whitespace-nowrap tabular-nums text-slate-950">
                  {row.currentDueAmount || "—"}
                </p>
                <p className="employee-field-value min-w-0 truncate whitespace-nowrap text-slate-800">
                  {row.pendingTenuresLabel || "—"}
                </p>
                <CustomerStatusValue listStatus={row.listStatus} />
                <ChevronRight className="h-5 w-5 shrink-0 justify-self-end text-slate-400" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {!loading && filtered.length === 0 ? (
        <p className="employee-customers-empty" title="No customers match your search or collection status.">
          No customers match search or status
        </p>
      ) : null}
    </div>
  );
}
