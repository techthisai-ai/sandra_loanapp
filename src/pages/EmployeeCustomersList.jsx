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

function CustomerListField({ label, value, valueClassName = "text-slate-950" }) {
  return (
    <div className="min-w-0">
      <p className="employee-field-label">{label}</p>
      <p className={`employee-field-value truncate ${valueClassName}`}>{value || "—"}</p>
    </div>
  );
}

function CustomerStatusField({ emoji, label, collected }) {
  if (collected) {
    return (
      <div className="min-w-0 shrink-0">
        <p className="employee-field-label">Status</p>
        <p className="employee-field-value text-emerald-700">Collected</p>
      </div>
    );
  }

  const tone =
    label === "Overdue" ? "text-rose-700" : label === "Due Today" ? "text-amber-700" : "text-emerald-700";
  return (
    <div className="min-w-0 shrink-0">
      <p className="employee-field-label">Status</p>
      <p className={`employee-field-value truncate leading-tight ${tone}`}>
        {emoji} {label}
      </p>
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

      <ul className="flex flex-col gap-1.5">
        {filtered.map((row) => (
          <li key={row.customerId}>
            <div className="employee-list-card app-panel-muted">
              <button
                type="button"
                onClick={() => openCustomerDetail(row)}
                className="employee-list-grid-4 min-w-0 transition active:scale-[0.99]"
              >
                <CustomerListField
                  label="Name"
                  value={row.customerName || "Unnamed"}
                  valueClassName={row.isCurrentTenureCollected ? "text-emerald-700" : "text-slate-950"}
                />
                <CustomerListField
                  label="Due"
                  value={row.currentDueAmount}
                  valueClassName="tabular-nums text-slate-950"
                />
                <CustomerListField
                  label="Pend tenure"
                  value={row.pendingTenuresLabel}
                  valueClassName="text-slate-800"
                />
                <CustomerListField label="Tenure" value={row.currentTenure} valueClassName="text-slate-700" />
              </button>
              <CustomerStatusField
                emoji={row.dueStatusEmoji}
                label={row.dueStatusLabel}
                collected={row.isCurrentTenureCollected}
              />
              <button
                type="button"
                onClick={() => openCustomerDetail(row)}
                className="inline-flex shrink-0 items-center justify-center text-slate-400 transition active:scale-[0.98]"
                aria-label={`View ${row.customerName || "customer"} details`}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {!loading && filtered.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-600">
          No customers match your search or collection status.
        </p>
      ) : null}
    </div>
  );
}
