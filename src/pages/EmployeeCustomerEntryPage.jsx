import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ClipboardPen } from "lucide-react";
import EmployeeCustomerEntryModal from "../components/employee/EmployeeCustomerEntryModal";
import useAuth from "../hooks/useAuth";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import { createCustomerAmountEntry } from "../services/userAuth";
import { NO_SUB_CENTER_LABEL, resolveCustomerCenterDisplay } from "../utils/centerDisplay";
import {
  employeeHasWholeDayAssignment,
  findCenterByLabel,
  getAssignedSubCentersForDayCenter,
  isRootDayLabel,
} from "../utils/employeeScope";

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function defaultDayLabel(selectedDay) {
  return selectedDay || "—";
}

function getEmployeeMainCenterOptions(assignedCenters, allCenters) {
  const mains = new Set();
  assignedCenters.forEach((label) => {
    const center = findCenterByLabel(label, allCenters);
    if (center?.parent) {
      mains.add(center.parent);
      return;
    }
    if (center && !center.parent) {
      mains.add(center.label);
      return;
    }
    if (isRootDayLabel(label, allCenters)) mains.add(label);
  });
  return ["All", ...Array.from(mains).sort((left, right) => left.localeCompare(right))];
}

function getEmployeeSubCenterOptions(mainCenterFilter, assignedCenters, allCenters) {
  if (mainCenterFilter === "All") return ["All"];
  const allowed = getAssignedSubCentersForDayCenter(mainCenterFilter, assignedCenters, allCenters);
  if (employeeHasWholeDayAssignment(mainCenterFilter, assignedCenters, allCenters)) {
    const allSubs = allCenters.filter((center) => center.parent === mainCenterFilter).map((center) => center.label);
    return ["All", ...allSubs.sort((left, right) => left.localeCompare(right))];
  }
  return ["All", ...allowed.sort((left, right) => left.localeCompare(right))];
}

export default function EmployeeCustomerEntryPage() {
  const { profile } = useAuth();
  const { customers, loading } = useLoanDataSync();
  const { assignedCenters, assignedCentersLabel, allCenters, hasAssignedCenter, scopeCustomers } =
    useEmployeeCenterScope();
  const [mainCenterFilter, setMainCenterFilter] = useState("All");
  const [subCenterFilter, setSubCenterFilter] = useState("All");
  const [entryCustomer, setEntryCustomer] = useState(null);

  const mainCenterOptions = useMemo(
    () => getEmployeeMainCenterOptions(assignedCenters, allCenters),
    [assignedCenters, allCenters]
  );

  const subCenterOptions = useMemo(
    () => getEmployeeSubCenterOptions(mainCenterFilter, assignedCenters, allCenters),
    [assignedCenters, allCenters, mainCenterFilter]
  );

  useEffect(() => {
    if (!subCenterOptions.includes(subCenterFilter)) {
      setSubCenterFilter("All");
    }
  }, [subCenterFilter, subCenterOptions]);

  const readyCustomers = useMemo(() => {
    return scopeCustomers(customers).sort((left, right) =>
      String(left.customerName || "").localeCompare(String(right.customerName || ""), undefined, { sensitivity: "base" })
    );
  }, [customers, scopeCustomers]);

  const filtered = useMemo(() => {
    return readyCustomers.filter((customer) => {
      const { dayCenter, subCenter } = resolveCustomerCenterDisplay(customer, allCenters);
      if (mainCenterFilter !== "All" && dayCenter !== mainCenterFilter) return false;
      if (subCenterFilter !== "All" && subCenter !== subCenterFilter) return false;
      return true;
    });
  }, [allCenters, mainCenterFilter, readyCustomers, subCenterFilter]);

  return (
    <div className="mx-auto w-full max-w-lg pb-1">
      <header className="app-panel mb-2.5 flex items-center gap-3 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="app-icon-shell flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/70 sm:h-10 sm:w-10">
          <ClipboardPen className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="app-eyebrow text-[9px] font-semibold uppercase tracking-[0.2em] sm:text-[10px]">Entry</p>
          <h1 className="text-base font-semibold leading-tight text-slate-950 sm:text-lg">Customer Entry</h1>
        </div>
      </header>

      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Main Center</span>
          <select
            value={mainCenterFilter}
            onChange={(event) => setMainCenterFilter(event.target.value)}
            className="app-select w-full"
          >
            {mainCenterOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sub Center</span>
          <select
            value={subCenterFilter}
            onChange={(event) => setSubCenterFilter(event.target.value)}
            className="app-select w-full"
            disabled={mainCenterFilter === "All"}
          >
            {subCenterOptions.map((option) => (
              <option key={option} value={option}>
                {option === NO_SUB_CENTER_LABEL ? "No sub-center" : option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {hasAssignedCenter ? (
        <p className="mb-2 text-[11px] text-slate-500">
          Centres: <span className="font-semibold text-slate-700">{assignedCentersLabel}</span>
          {loading ? " · Loading…" : ` · ${filtered.length} shown`}
        </p>
      ) : (
        <p className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No centre assigned. Customer entries will appear here once your administrator assigns a centre.
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {filtered.map((customer) => {
          const day = defaultDayLabel(customer.selectedDay);
          return (
            <li key={customer.customerId}>
              <button
                type="button"
                onClick={() => setEntryCustomer(customer)}
                className="app-panel-muted flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition active:scale-[0.99] sm:px-3.5 sm:py-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold text-slate-950">{customer.customerName || "Unnamed"}</span>
                  <span className="truncate text-[11px] text-slate-600">
                    {customer.mobileNumber || "—"} · {day.replace(" Centre", "")}
                  </span>
                  <span className="text-[10px] font-medium text-slate-500">
                    Loan {formatCurrency(customer.loanAmount)} · Due{" "}
                    {customer.dueDate ? new Date(customer.dueDate).toLocaleDateString("en-GB") : "—"}
                  </span>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
              </button>
            </li>
          );
        })}
      </ul>

      {!loading && filtered.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-600">
          No customers match the selected centre filters.
        </p>
      ) : null}

      {entryCustomer ? (
        <EmployeeCustomerEntryModal
          customer={entryCustomer}
          defaultCollectorName={profile?.displayName || ""}
          onClose={() => setEntryCustomer(null)}
          onSave={async ({ amount, note, paymentMethod, collectionStatus, collectionDate, collectorName }) => {
            await createCustomerAmountEntry({
              customerId: entryCustomer.customerId,
              customerName: entryCustomer.customerName,
              amount,
              note,
              createdBy: profile?.uid || "employee",
              paymentMethod,
              collectionStatus,
              collectionDate,
              collectorName,
            });
          }}
        />
      ) : null}
    </div>
  );
}
