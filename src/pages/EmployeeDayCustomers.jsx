import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileSearch,
  MessageSquareText,
  Search,
  SkipForward,
  UsersRound,
} from "lucide-react";
import useAuth from "../hooks/useAuth";
import { createCustomerAmountEntry } from "../services/userAuth";
import { EmployeeCenterListSkeleton } from "../components/employee/EmployeePageSkeleton";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import {
  countCustomersForCenter,
  employeeHasWholeDayAssignment,
  getAssignedSubCentersForDayCenter,
  getCustomersForAssignedCenter,
  getCustomersForCenter,
  isRootDayLabel,
} from "../utils/employeeScope";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import { LOAN_CENTERS_CHANGED_EVENT } from "../constants/loanCenterStorage";
import { loadLoanCenters } from "../constants/dayCenters";

function loadCenters() {
  return loadLoanCenters();
}

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function Avatar({ name }) {
  const initials = useMemo(() => {
    if (!name) return "CU";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("")
      .slice(0, 2);
  }, [name]);

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-sm font-semibold text-blue-700">
      {initials}
    </div>
  );
}

function CollectionActionModal({ customer, preset, remarksOnly = false, profile, onClose, onSave }) {
  const [amount, setAmount] = useState(() => {
    if (remarksOnly) return "0";
    if (preset === "Collected") return String(customer?.weeklyDue || customer?.emiAmount || "");
    if (preset === "Partial Payment") return "";
    return "0";
  });
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [collectionStatus, setCollectionStatus] = useState(remarksOnly ? "Partial Payment" : preset);
  const [collectionDate, setCollectionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [collectorName, setCollectorName] = useState(profile?.displayName || "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const numericAmount = Number(amount || 0);
    if (remarksOnly && !note.trim()) {
      setError("Enter remarks");
      return;
    }
    if (
      !remarksOnly &&
      (collectionStatus === "Collected" || collectionStatus === "Partial Payment") &&
      numericAmount <= 0
    ) {
      setError("Enter a valid amount");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSave({
        amount: String(numericAmount),
        note,
        paymentMethod,
        collectionStatus,
        collectionDate,
        collectorName,
      });
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Unable to save collection action");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-action-title"
        className="flex max-h-[min(92dvh,calc(100vh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] w-full max-w-xl min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0 pr-2">
            <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Collection action</p>
            <h3 id="collection-action-title" className="mt-2 text-xl font-semibold text-slate-900">
              {customer?.customerName}
            </h3>
            <p className="mt-1 text-sm text-slate-500">{remarksOnly ? "Remarks only" : preset}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Customer name</span>
              <input value={customer?.customerName || ""} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Phone number</span>
              <input value={customer?.mobileNumber || ""} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm" />
            </label>
              </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">EMI amount</span>
              <input value={customer?.weeklyDue || customer?.emiAmount || ""} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Due date</span>
              <input value={customer?.dueDate || ""} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm" />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Collection status</span>
              <select
                value={collectionStatus}
                onChange={(event) => setCollectionStatus(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
              >
                <option>Collected</option>
                <option>Partial Payment</option>
                <option>Skipped</option>
                <option>Rescheduled</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Payment method</span>
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
              >
                <option>Cash</option>
                <option>UPI</option>
                <option>Bank Transfer</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Collection date</span>
              <input
                type="date"
                value={collectionDate}
                onChange={(event) => setCollectionDate(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Amount</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
                placeholder="Enter amount"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Collector name</span>
              <input
                value={collectorName}
                onChange={(event) => setCollectorName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
                placeholder="Collector name"
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Remarks</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
              placeholder="Add remarks"
            />
          </label>

          {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-slate-50/95 px-5 py-4 backdrop-blur-sm sm:px-6">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 sm:w-auto"
            >
              {saving ? "Saving..." : "Save collection action"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EmployeeDayCustomers() {
  const { day } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { assignedCenters, allCenters, hasAssignedCenter, canAccessCenter } = useEmployeeCenterScope();
  const { customers, entries, loading, error: syncError } = useLoanDataSync();
  const error = syncError || "";
  const [activeAction, setActiveAction] = useState(null);
  const [dateFilter, setDateFilter] = useState("");
  const [collectorFilter, setCollectorFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [customerFilter, setCustomerFilter] = useState("");

  const [centers, setCenters] = useState(() => loadCenters());
  useEffect(() => {
    const onCentersChange = () => setCenters(loadCenters());
    window.addEventListener(LOAN_CENTERS_CHANGED_EVENT, onCentersChange);
    return () => window.removeEventListener(LOAN_CENTERS_CHANGED_EVENT, onCentersChange);
  }, []);
  const currentCenter = useMemo(
    () => centers.find((center) => center.label === day) ?? { label: day, color: "border-slate-200 bg-slate-50 text-slate-600", parent: "" },
    [centers, day]
  );
  const isSubCenter = Boolean(currentCenter.parent);
  const canViewCentreSheet = isSubCenter;
  const childCenters = useMemo(() => {
    const allChildren = centers.filter((center) => center.parent === day);
    if (!hasAssignedCenter) return allChildren;
    const allowed = new Set(getAssignedSubCentersForDayCenter(day, assignedCenters, centers));
    if (employeeHasWholeDayAssignment(day, assignedCenters, centers)) {
      return allChildren;
    }
    return allChildren.filter((child) => allowed.has(child.label));
  }, [assignedCenters, centers, day, hasAssignedCenter]);

  const displayLabel = currentCenter.parent ? `${currentCenter.parent} / ${day}` : day;

  const dayCustomers = useMemo(() => {
    if (!isRootDayLabel(day, centers)) {
      return getCustomersForCenter(customers, day, centers);
    }
    if (!hasAssignedCenter) {
      return getCustomersForAssignedCenter(customers, day, centers);
    }
    if (employeeHasWholeDayAssignment(day, assignedCenters, centers)) {
      return getCustomersForAssignedCenter(customers, day, centers);
    }
    const allowedSubs = getAssignedSubCentersForDayCenter(day, assignedCenters, centers);
    const seen = new Set();
    const result = [];
    allowedSubs.forEach((subLabel) => {
      getCustomersForCenter(customers, subLabel, centers).forEach((customer) => {
        if (seen.has(customer.customerId)) return;
        seen.add(customer.customerId);
        result.push(customer);
      });
    });
    return result;
  }, [assignedCenters, centers, customers, day, hasAssignedCenter]);

  useEffect(() => {
    if (!hasAssignedCenter || loading || !day) return;
    if (!canAccessCenter(day)) {
      navigate("/employee/centers", { replace: true });
    }
  }, [canAccessCenter, day, hasAssignedCenter, loading, navigate]);
  const showTaskScreen = isSubCenter || dayCustomers.length > 0;

  const collectorOptions = useMemo(() => {
    const names = new Set(
      entries
        .map((entry) => entry.collectorName)
        .filter(Boolean)
    );
    return ["All", ...Array.from(names).sort((left, right) => left.localeCompare(right))];
  }, [entries]);

  const latestEntryMap = useMemo(() => {
    const mapping = {};
    entries.forEach((entry) => {
      const current = mapping[entry.customerId];
      if (!current || String(entry.submittedAt || "").localeCompare(String(current.submittedAt || "")) > 0) {
        mapping[entry.customerId] = entry;
      }
    });
    return mapping;
  }, [entries]);

  const taskRows = useMemo(() => {
    return dayCustomers.map((customer) => {
      const latestEntry = latestEntryMap[customer.customerId] || null;
      return {
        customer,
        latestEntry,
        customerName: customer.customerName || "Unnamed",
        phoneNumber: customer.mobileNumber || "--",
        emiAmount: customer.weeklyDue || customer.emiAmount || 0,
        dueDate: customer.dueDate || "--",
        collectionStatus: latestEntry?.collectionStatus || "Pending",
        paymentMethod: latestEntry?.paymentMethod || "--",
        collectorName: latestEntry?.collectorName || "",
        collectionDate: latestEntry?.collectionDate || "",
        remarks: latestEntry?.note || "",
      };
    });
  }, [dayCustomers, latestEntryMap]);

  const filteredTaskRows = useMemo(() => {
    return taskRows.filter((row) => {
      const matchesDate = !dateFilter || row.collectionDate === dateFilter;
      const matchesCollector = collectorFilter === "All" || row.collectorName === collectorFilter;
      const matchesStatus = statusFilter === "All" || row.collectionStatus === statusFilter;
      const query = customerFilter.trim().toLowerCase();
      const matchesCustomer = !query
        || row.customerName.toLowerCase().includes(query)
        || row.phoneNumber.includes(query);
      return matchesDate && matchesCollector && matchesStatus && matchesCustomer;
    });
  }, [collectorFilter, customerFilter, dateFilter, statusFilter, taskRows]);

  return (
    <div className="employee-page flex flex-col gap-4 pb-6 text-slate-900">
        <header className="app-panel flex items-start justify-between gap-4 rounded-2xl px-3 py-3 sm:rounded-3xl sm:p-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="app-icon-shell flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12 sm:rounded-3xl">
              <UsersRound className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="app-eyebrow employee-page-eyebrow">{displayLabel}</p>
              <h1 className="employee-page-title mt-1 sm:mt-2">
                {isSubCenter ? "Collection tasks" : "Centers"}
              </h1>
              <p className="mt-0.5 text-[11px] text-slate-500 sm:mt-1 sm:text-sm">
                {loading
                  ? "Loading…"
                  : isSubCenter
                    ? `${dayCustomers.length} customer${dayCustomers.length === 1 ? "" : "s"}`
                    : `${childCenters.length} center${childCenters.length === 1 ? "" : "s"}${
                        dayCustomers.length > 0 ? ` · ${dayCustomers.length} at ${day.replace(" Centre", "")}` : ""
                      }`}
              </p>
            </div>
          </div>
        </header>

        <section className="app-panel rounded-2xl p-3 sm:rounded-3xl sm:p-5">
          <div className="mb-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate(currentCenter.parent ? `/employee/customers/${encodeURIComponent(currentCenter.parent)}` : "/employee/centers")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft className="h-3 w-3" />
              {currentCenter.parent ? `Back to ${currentCenter.parent}` : "Back to days"}
            </button>

            {canViewCentreSheet ? (
              <button
                type="button"
                onClick={() =>
                  navigate(`/employee/customers/${encodeURIComponent(day)}/sheet`, {
                    state: {
                      fromEmployeeCustomerCard: true,
                      filterDay: day,
                      day,
                    },
                  })
                }
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700"
              >
                <FileSearch className="h-3.5 w-3.5" />
                Centre Sheet
              </button>
            ) : null}
          </div>

          {loading ? <EmployeeCenterListSkeleton count={Math.max(childCenters.length, 3)} /> : null}
          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}. Check your connection and try again.
            </div>
          ) : null}

          {!isSubCenter && !loading ? (
            childCenters.length > 0 ? (
              <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                {childCenters.map((child) => {
                  const count = countCustomersForCenter(customers, child.label, centers);
                  return (
                    <button
                      key={child.label}
                      type="button"
                      onClick={() => navigate(`/employee/customers/${encodeURIComponent(child.label)}`)}
                      className={`relative flex min-h-[4.5rem] items-center gap-3 rounded-2xl border p-3.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] sm:min-h-[5rem] sm:p-4 ${child.color}`}
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white/80 ${child.color}`}>
                        <UsersRound className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{child.label}</p>
                        <p className="mt-0.5 text-xs text-slate-600">
                          {count > 0 ? `${count} customer${count > 1 ? "s" : ""}` : "No customers assigned"}
                        </p>
                      </div>
                      {count > 0 ? (
                        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-slate-950 px-1.5 text-[10px] font-bold text-white">
                          {count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : dayCustomers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                <CalendarDays className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">No customers assigned</p>
                <p className="mt-1 text-xs text-slate-500">There are no centres or customers for {day} yet.</p>
              </div>
            ) : null
          ) : null}

          {!isSubCenter && !loading && dayCustomers.length > 0 && childCenters.length > 0 ? (
            <div className="mt-5 border-t border-slate-200 pt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Customers at {day.replace(" Centre", "")}
              </p>
            </div>
          ) : null}

          {showTaskScreen && !loading ? (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-4">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Date-wise filter</span>
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(event) => setDateFilter(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Collector-wise filter</span>
                  <select
                    value={collectorFilter}
                    onChange={(event) => setCollectorFilter(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
                  >
                    {collectorOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status filter</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
                  >
                    <option>All</option>
                    <option>Pending</option>
                    <option>Collected</option>
                    <option>Partial Payment</option>
                    <option>Skipped</option>
                    <option>Rescheduled</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Customer-wise filter</span>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={customerFilter}
                      onChange={(event) => setCustomerFilter(event.target.value)}
                      placeholder="Search customer or phone"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-300 focus:bg-white"
                    />
                  </div>
                </label>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full bg-white text-left">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Customer Name</th>
                      <th className="px-4 py-3 font-semibold">Phone Number</th>
                      <th className="px-4 py-3 font-semibold">EMI Amount</th>
                      <th className="px-4 py-3 font-semibold">Due Date</th>
                      <th className="px-4 py-3 font-semibold">Collection Status</th>
                      <th className="px-4 py-3 font-semibold">Payment Method</th>
                      <th className="px-4 py-3 font-semibold">Collection Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTaskRows.length > 0 ? (
                      filteredTaskRows.map((row) => (
                        <tr key={row.customer.customerId} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <Avatar name={row.customerName} />
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{row.customerName}</p>
                                <p className="mt-1 text-xs text-slate-500">{row.customer.customerId}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-700">{row.phoneNumber}</td>
                          <td className="px-4 py-4 text-sm font-medium text-slate-900">{formatCurrency(row.emiAmount)}</td>
                          <td className="px-4 py-4 text-sm text-slate-700">{row.dueDate}</td>
                          <td className="px-4 py-4">
                            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                              row.collectionStatus === "Collected"
                                ? "bg-emerald-100 text-emerald-700"
                                : row.collectionStatus === "Partial Payment"
                                  ? "bg-amber-100 text-amber-700"
                                  : row.collectionStatus === "Rescheduled"
                                    ? "bg-blue-100 text-blue-700"
                                    : row.collectionStatus === "Skipped"
                                      ? "bg-rose-100 text-rose-700"
                                      : "bg-slate-100 text-slate-600"
                            }`}>
                              {row.collectionStatus}
                            </span>
                            {row.remarks ? <p className="mt-2 text-xs text-slate-500">{row.remarks}</p> : null}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-700">{row.paymentMethod}</td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setActiveAction({ customer: row.customer, preset: "Collected" })}
                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Mark collected
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveAction({ customer: row.customer, preset: "Partial Payment" })}
                                className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700"
                              >
                                <Clock3 className="h-3.5 w-3.5" />
                                Partial payment
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveAction({ customer: row.customer, preset: "Skipped" })}
                                className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
                              >
                                <SkipForward className="h-3.5 w-3.5" />
                                Skip payment
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveAction({ customer: row.customer, preset: "Partial Payment", remarksOnly: true })}
                                className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700"
                              >
                                <MessageSquareText className="h-3.5 w-3.5" />
                                Add remarks
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" className="px-4 py-10 text-center text-sm text-slate-500">
                          {dayCustomers.length === 0
                            ? "No customers assigned for this centre."
                            : "No collection task rows match the selected filters."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>

      {activeAction ? (
        <CollectionActionModal
          customer={activeAction.customer}
          preset={activeAction.preset}
          remarksOnly={Boolean(activeAction.remarksOnly)}
          profile={profile}
          onClose={() => setActiveAction(null)}
          onSave={async ({ amount, note, paymentMethod, collectionStatus, collectionDate, collectorName }) => {
            await createCustomerAmountEntry({
              customerId: activeAction.customer.customerId,
              customerName: activeAction.customer.customerName,
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
