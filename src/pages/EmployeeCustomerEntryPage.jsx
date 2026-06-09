import { useEffect, useMemo, useState } from "react";
import EmployeeCustomerEntryModal from "../components/employee/EmployeeCustomerEntryModal";
import useAuth from "../hooks/useAuth";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import { createCustomerAmountEntry } from "../services/userAuth";
import { NO_SUB_CENTER_LABEL, resolveCustomerCenterDisplay } from "../utils/centerDisplay";
import { buildEmployeeCustomerSummary } from "../utils/employeeCustomerSummary";
import {
  employeeHasWholeDayAssignment,
  findCenterByLabel,
  getAssignedSubCentersForDayCenter,
  isRootDayLabel,
} from "../utils/employeeScope";

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
  const { customers, entries, loading } = useLoanDataSync();
  const { assignedCenters, allCenters, hasAssignedCenter, scopeCustomers } =
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

  const entryCustomerSummary = useMemo(() => {
    if (!entryCustomer) return null;
    const customerEntries = entriesByCustomerId.get(entryCustomer.customerId) || [];
    return buildEmployeeCustomerSummary(entryCustomer, customerEntries, allCenters);
  }, [allCenters, entriesByCustomerId, entryCustomer]);

  const filtered = useMemo(() => {
    return readyCustomers.filter((customer) => {
      const { dayCenter, subCenter } = resolveCustomerCenterDisplay(customer, allCenters);
      if (mainCenterFilter !== "All" && dayCenter !== mainCenterFilter) return false;
      if (subCenterFilter !== "All" && subCenter !== subCenterFilter) return false;
      return true;
    });
  }, [allCenters, mainCenterFilter, readyCustomers, subCenterFilter]);

  return (
    <div className="employee-page">
      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="employee-field-label">Main Center</span>
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
          <span className="employee-field-label">Sub Center</span>
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

      {!hasAssignedCenter ? (
        <p className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No centre assigned. Customer entries will appear here once your administrator assigns a centre.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm">
        <div className="employee-customers-header employee-entry-list-grid">
          <span className="whitespace-nowrap">Name</span>
          <span className="whitespace-nowrap">Phone</span>
          <span className="whitespace-nowrap">Due</span>
          <span className="employee-entry-action-spacer whitespace-nowrap text-right">Action</span>
        </div>

        <ul className="divide-y divide-slate-100">
          {filtered.map((customer) => {
            const customerEntries = entriesByCustomerId.get(customer.customerId) || [];
            const summary = buildEmployeeCustomerSummary(customer, customerEntries, allCenters);
            const collected = summary.isCurrentTenureCollected;
            const awaitingApproval = summary.hasPendingApproval;
            return (
              <li key={customer.customerId}>
                <div className="employee-customers-row employee-entry-list-grid app-panel-muted">
                  <p
                    className={`employee-field-value min-w-0 truncate whitespace-nowrap ${
                      collected ? "text-emerald-700" : "text-slate-950"
                    }`}
                  >
                    {customer.customerName || "Unnamed"}
                  </p>
                  <p className="employee-field-value min-w-0 truncate whitespace-nowrap tabular-nums text-slate-800">
                    {customer.mobileNumber || "—"}
                  </p>
                  <p className="employee-field-value min-w-0 truncate whitespace-nowrap tabular-nums text-slate-950">
                    {summary.currentDueAmount || "—"}
                  </p>
                  <div className="flex min-w-0 justify-end">
                    {collected ? (
                      <span className="inline-flex h-7 items-center justify-center rounded-full bg-emerald-100 px-2.5 text-[11px] font-semibold leading-none text-emerald-800">
                        Collected
                      </span>
                    ) : awaitingApproval ? (
                      <span className="inline-flex h-7 items-center justify-center rounded-full bg-amber-100 px-2.5 text-[11px] font-semibold leading-none text-amber-800">
                        Pending
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEntryCustomer(customer)}
                        className="inline-flex h-7 items-center justify-center rounded-full bg-blue-600 px-2.5 text-[11px] font-semibold leading-none text-white transition hover:bg-blue-700 active:scale-[0.98]"
                      >
                        Collect now
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {!loading && filtered.length === 0 ? (
        <p className="employee-customers-empty" title="No customers match the selected centre filters.">
          No customers for selected centres
        </p>
      ) : null}

      {entryCustomer ? (
        <EmployeeCustomerEntryModal
          customer={entryCustomer}
          defaultCollectorName={profile?.displayName || ""}
          pendingAmount={entryCustomerSummary?.currentDueAmountNumber ?? 0}
          pendingLabel={entryCustomerSummary?.currentDueAmount ?? "—"}
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
