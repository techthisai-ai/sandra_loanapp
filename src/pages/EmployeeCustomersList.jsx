import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Search, UsersRound } from "lucide-react";
import { EMPLOYEE_ROOT_DAYS } from "../constants/employeeDays";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import { buildEmployeeCustomerSummary, getEmployeeCustomerSearchText } from "../utils/employeeCustomerSummary";

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function defaultDayLabel(selectedDay) {
  if (selectedDay) return selectedDay;
  return EMPLOYEE_ROOT_DAYS[0].label;
}

export default function EmployeeCustomersList() {
  const navigate = useNavigate();
  const { customers, entries, loading } = useLoanDataSync();
  const { allCenters, assignedCentersLabel, hasAssignedCenter, scopeCustomers } = useEmployeeCenterScope();
  const [query, setQuery] = useState("");

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
    if (!q) return customerRows;
    return customerRows.filter((row) => getEmployeeCustomerSearchText(row.customer, row, allCenters).includes(q));
  }, [allCenters, query, customerRows]);

  const openCustomerDetail = (row) => {
    const day = defaultDayLabel(row.customer.selectedDay);
    navigate(`/employee/customers/${encodeURIComponent(day)}/${encodeURIComponent(row.customer.customerId)}`, {
      state: { customer: row.customer, fromList: true },
    });
  };

  return (
    <div className="mx-auto w-full max-w-lg pb-1">
      <header className="app-panel mb-2.5 flex items-center gap-3 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="app-icon-shell flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/70 sm:h-10 sm:w-10">
          <UsersRound className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="app-eyebrow text-[9px] font-semibold uppercase tracking-[0.2em] sm:text-[10px]">Customers</p>
          <h1 className="text-base font-semibold leading-tight text-slate-950 sm:text-lg">My Customers</h1>
        </div>
      </header>

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, phone, ID, place…"
          className="w-full rounded-2xl border border-slate-200/90 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none ring-slate-300/40 placeholder:text-slate-400 focus:border-[var(--app-accent)] focus:ring-2"
        />
      </div>

      {hasAssignedCenter ? (
        <p className="mb-2 text-[11px] text-slate-500">
          Centres: <span className="font-semibold text-slate-700">{assignedCentersLabel}</span>
          {loading ? " · Loading…" : ` · ${filtered.length} shown${query.trim() ? ` of ${customerRows.length}` : ""}`}
        </p>
      ) : (
        <p className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No centre assigned. Customers will appear here once your administrator assigns a centre.
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {filtered.map((row) => (
          <li key={row.customerId}>
            <button
              type="button"
              onClick={() => openCustomerDetail(row)}
              className="app-panel-muted flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition active:scale-[0.99] sm:px-3.5 sm:py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-slate-950">{row.customerName || "Unnamed"}</span>
                <span className="truncate text-[11px] text-slate-600">
                  {row.phoneNumber || "—"} · {row.centerLabel || "—"}
                </span>
                <span className="text-[10px] font-medium text-slate-500">
                  Loan {formatCurrency(row.customer.loanAmount)} · Due {row.loanDate || "—"}
                </span>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
            </button>
          </li>
        ))}
      </ul>

      {!loading && filtered.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-600">
          No customers match your search.
        </p>
      ) : null}
    </div>
  );
}
