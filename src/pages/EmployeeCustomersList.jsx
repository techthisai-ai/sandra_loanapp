import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import { EMPLOYEE_ROOT_DAYS } from "../constants/employeeDays";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import { buildEmployeeCustomerSummary, getEmployeeCustomerSearchText } from "../utils/employeeCustomerSummary";

const COLLECTION_STATUS_OPTIONS = [
  { key: "Collected", label: "Paid" },
  { key: "Unpaid", label: "Unpaid" },
  { key: "Partial Payment", label: "Partial" },
  { key: "Rescheduled", label: "Rescheduled" },
  { key: "Skipped", label: "Skipped" },
];

function defaultDayLabel(selectedDay) {
  if (selectedDay) return selectedDay;
  return EMPLOYEE_ROOT_DAYS[0].label;
}

function CustomerStatusValue({ emoji, label, collected, awaitingApproval }) {
  let statusEmoji = emoji || "";
  let statusLabel = label || "—";
  let tone = "text-emerald-700";

  if (collected) {
    statusEmoji = "🟢";
    statusLabel = "Collected";
  } else if (awaitingApproval) {
    statusEmoji = "🟡";
    statusLabel = "Pending";
    tone = "text-amber-700";
  } else if (label === "Overdue") {
    tone = "text-rose-700";
  } else if (label === "Due Today") {
    tone = "text-amber-700";
  }

  return (
    <div className={`employee-status-cell min-w-0 ${tone}`}>
      <span className="employee-status-emoji" aria-hidden="true">
        {statusEmoji}
      </span>
      <span className="employee-field-value truncate whitespace-nowrap">{statusLabel}</span>
    </div>
  );
}

export default function EmployeeCustomersList() {
  const navigate = useNavigate();
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
      return {
        customer,
        ...buildEmployeeCustomerSummary(customer, customerEntries, allCenters),
      };
    });
  }, [allCenters, entriesByCustomerId, readyCustomers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customerRows.filter((row) => {
      const matchesSearch = !q || getEmployeeCustomerSearchText(row.customer, row, allCenters).includes(q);
      const matchesCollection =
        collectionFilter === "All" ||
        (collectionFilter === "Unpaid"
          ? row.collectionStatus === "Pending"
          : row.collectionStatus === collectionFilter);
      return matchesSearch && matchesCollection;
    });
  }, [allCenters, collectionFilter, query, customerRows]);

  const openCustomerDetail = (row) => {
    const day = defaultDayLabel(row.customer.selectedDay);
    navigate(`/employee/customers/${encodeURIComponent(day)}/${encodeURIComponent(row.customer.customerId)}`, {
      state: { customer: row.customer, fromList: true },
    });
  };

  return (
    <div className="employee-page">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCollectionFilter("All")}
          className={`inline-flex h-10 shrink-0 items-center justify-center rounded-xl border px-3.5 text-sm font-semibold transition sm:h-11 sm:px-4 sm:text-base ${
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
          className="app-select h-10 min-w-0 flex-1 rounded-xl bg-white text-sm font-medium text-slate-800 sm:h-11 sm:text-base"
        >
          <option value="">Filter</option>
          {COLLECTION_STATUS_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, phone, ID, place…"
          className="w-full rounded-2xl border border-slate-200/90 bg-white py-3 pl-10 pr-3 text-base text-slate-900 shadow-sm outline-none ring-slate-300/40 placeholder:text-slate-400 focus:border-[var(--app-accent)] focus:ring-2 sm:py-3.5"
        />
      </div>

      {!hasAssignedCenter ? (
        <p className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No centre assigned. Customers will appear here once your administrator assigns a centre.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm">
        <div className="employee-customers-header employee-customers-grid">
          <span className="whitespace-nowrap">Name</span>
          <span className="whitespace-nowrap">Current due</span>
          <span className="whitespace-nowrap">Pend tenure</span>
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
                <CustomerStatusValue
                  emoji={row.dueStatusEmoji}
                  label={row.dueStatusLabel}
                  collected={row.isCurrentTenureCollected}
                  awaitingApproval={row.hasPendingApproval}
                />
                <ChevronRight className="h-5 w-5 shrink-0 justify-self-end text-slate-400" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {!loading && filtered.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-600">
          No customers match your search or collection status.
        </p>
      ) : null}
    </div>
  );
}
