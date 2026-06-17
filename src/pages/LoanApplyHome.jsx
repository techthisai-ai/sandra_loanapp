import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, Search, UsersRound } from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import CustomerApprovalsPanel from "../components/loan/CustomerApprovalsPanel";
import LoanRequestsPanel from "../components/loan/LoanRequestsPanel";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import { DEFAULT_DAY_CENTERS, loadLoanCenters } from "../constants/dayCenters";
import { mergeCustomersWithLoanApplications } from "../utils/collectionCustomerUtils";
import { enrichCustomerForCollection, hasAppliedForLoan, hasValidLoanForCollection } from "../utils/customerSheets";
import { formatLoanIdDisplay } from "../utils/loanIds.js";
import { isActiveCustomerRecord, isRecordDeleted } from "../utils/recordFlags";

const defaultCenters = DEFAULT_DAY_CENTERS;
const RECENT_LOAN_LOOKBACK_DAYS = 2;

/** Widths sum to 100% for table-layout:fixed — last cols need enough % so badges never force table past container */
const sheetColumns = [
  { key: "sno", label: "SNO", width: "4%", align: "text-center" },
  { key: "customerName", label: ["Customer", "Name"], width: "17%", align: "text-left" },
  { key: "customerMobile", label: ["Mobile"], width: "11%", align: "text-center" },
  { key: "loanAmount", label: ["Loan", "Amt"], width: "10%", align: "text-center" },
  { key: "principal", label: "Principal", width: "8%", align: "text-center", hideClass: "hidden sm:table-cell" },
  { key: "progressAmount", label: "EMI Amt", width: "8%", align: "text-center" },
  { key: "disbursementDate", label: ["1st EMI", "Date"], width: "7%", align: "text-center", hideClass: "hidden md:table-cell" },
  { key: "dueDate", label: "Due", width: "8%", align: "text-center" },
  { key: "onTime", label: ["Start", "Date"], width: "6%", align: "text-center", hideClass: "hidden lg:table-cell" },
  { key: "week", label: "Wk", width: "5%", align: "text-center" },
  { key: "collectedWeek", label: ["Coll", "Wk"], width: "5%", align: "text-center" },
  { key: "pendingWeek", label: ["Pend", "Wk"], width: "6%", align: "text-center", variant: "pendingWeek" },
  { key: "od", label: "OD", width: "5%", align: "text-center", variant: "od" },
];

function loadCenters() {
  return loadLoanCenters();
}

function formatDate(value) {
  if (!value) return "Pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
}

function customerHasExistingLoan(customer, application, enriched) {
  if (hasValidLoanForCollection(enriched)) return true;
  if (application?.applicationId) return true;
  const loanAmount = Number(enriched?.loanAmount || application?.loanAmount || 0);
  const loanWeeks = Number(enriched?.loanWeeks || application?.loanWeeks || 0);
  const weeklyDue = Number(
    enriched?.weeklyDue || enriched?.emiAmount || application?.weeklyDue || application?.emiAmount || 0
  );
  const totalPayable = Number(enriched?.totalPayable || application?.totalPayable || 0);
  if (loanAmount > 0 && (loanWeeks > 0 || totalPayable > 0 || weeklyDue > 0)) return true;
  const status = String(enriched?.approvalStatus || application?.approvalStatus || "").toLowerCase();
  return status === "approved" && loanAmount > 0;
}

function resolveCustomerLoanDisplay(customer, loanApplicationByCustomerId, collectedAmountByCustomer) {
  const application = loanApplicationByCustomerId.get(customer?.customerId) || null;
  const merged = application
    ? mergeCustomersWithLoanApplications([customer], [application])[0]
    : customer;
  const enriched = enrichCustomerForCollection(merged);
  const hasLoan = customerHasExistingLoan(customer, application, enriched);

  const loanId = formatLoanIdDisplay(
    enriched?.applicationId ||
      enriched?.loanId ||
      application?.applicationId ||
      application?.loanId ||
      ""
  );

  const loanAmount = Number(enriched?.loanAmount || application?.loanAmount || 0);
  const totalPayable = Number(enriched?.totalPayable || application?.totalPayable || 0);
  const loanWeeks = Number(enriched?.loanWeeks || application?.loanWeeks || 0);
  const weeklyDue = Number(
    enriched?.weeklyDue || enriched?.emiAmount || application?.weeklyDue || application?.emiAmount || 0
  );
  const repaymentTarget =
    totalPayable > 0 ? totalPayable : loanWeeks > 0 && weeklyDue > 0 ? weeklyDue * loanWeeks : loanAmount;

  const collected = Number(collectedAmountByCustomer.get(customer.customerId) || 0);
  const pendingAmount =
    hasLoan && repaymentTarget > 0 ? Math.max(repaymentTarget - collected, 0) : null;

  return { hasLoan, loanId, loanAmount, pendingAmount };
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function formatLoanCurrency(value, { allowZero = false } = {}) {
  const amount = Number(value ?? NaN);
  if (!Number.isFinite(amount)) return "--";
  if (amount <= 0 && !allowZero) return "--";
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return value || "--";
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

function renderHeaderLabel(label) {
  if (!Array.isArray(label)) return label;
  return (
    <span className="flex min-w-0 w-full flex-col items-center leading-tight">
      {label.map((line) => (
        <span key={line} className="block max-w-full truncate">
          {line}
        </span>
      ))}
    </span>
  );
}

function renderSheetCell(column, value) {
  const pending = value === "Pending" || value === "Not available";

  if (column.variant === "od") {
    return (
      <span
        className={`mx-auto block max-w-[4.5rem] truncate whitespace-nowrap rounded-md px-0.5 py-0.5 text-center text-[9px] font-bold leading-none ring-1 sm:max-w-[5rem] sm:px-1 sm:text-[10px] ${
          pending
            ? "bg-amber-50 text-amber-800 ring-amber-200/80"
            : "bg-emerald-50 text-emerald-800 ring-emerald-200/80"
        }`}
        title={String(value)}
      >
        {pending ? "Pend" : value}
      </span>
    );
  }

  if (column.variant === "pendingWeek") {
    return (
      <span
        className={`mx-auto block max-w-[4.75rem] truncate whitespace-nowrap rounded-md px-0.5 py-0.5 text-center text-[9px] font-semibold leading-none ring-1 sm:max-w-[5.25rem] sm:px-1 sm:text-[10px] ${
          pending
            ? "bg-amber-50 text-amber-800 ring-amber-200/80"
            : "bg-slate-50 text-slate-800 ring-slate-200/80"
        }`}
        title={String(value)}
      >
        {value}
      </span>
    );
  }

  return (
    <span className="block min-w-0 max-w-full truncate break-words font-medium [overflow-wrap:anywhere]" title={String(value)}>
      {value}
    </span>
  );
}

function hasValidLoanApplied(customer) {
  const loanAmount = Number(customer?.loanAmount || 0);
  const loanWeeks = Number(customer?.loanWeeks || 0);
  const weeklyDue = Number(customer?.weeklyDue || customer?.emiAmount || 0);
  const totalPayable = Number(customer?.totalPayable || 0);
  const hasDates = Boolean(customer?.disbursementDate) && Boolean(customer?.dueDate);
  return loanAmount > 0 && loanWeeks > 0 && weeklyDue > 0 && totalPayable > 0 && hasDates;
}

function hasLoanApplicationData(customer) {
  if (hasAppliedForLoan(customer)) return true;
  if (hasValidLoanApplied(customer)) return true;
  const loanAmount = Number(customer?.loanAmount || 0);
  const loanWeeks = Number(customer?.loanWeeks || 0);
  const weeklyDue = Number(customer?.weeklyDue || customer?.emiAmount || 0);
  return loanAmount > 0 && loanWeeks > 0 && weeklyDue > 0;
}

function getLoanActivityTimestamp(customer) {
  const raw =
    customer?.loanAppliedAt || customer?.loanApprovedAt || customer?.submittedAt || customer?.updatedAt || customer?.createdAt || "";
  if (!raw) return null;
  const date = typeof raw?.toDate === "function" ? raw.toDate() : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRecentLoanActivity(customer, lookbackDays = RECENT_LOAN_LOOKBACK_DAYS) {
  const appliedAt = getLoanActivityTimestamp(customer);
  if (!appliedAt) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  cutoff.setHours(0, 0, 0, 0);
  return appliedAt >= cutoff;
}

function compareLoanActivityDesc(left, right) {
  const leftTime = getLoanActivityTimestamp(left)?.getTime() || 0;
  const rightTime = getLoanActivityTimestamp(right)?.getTime() || 0;
  return rightTime - leftTime;
}

function mapCustomerToLoanRow(customer, collectedAmountByCustomer, getRepaymentProfile) {
  const profile = getRepaymentProfile(customer.customerId);
  return {
    customerId: customer.customerId,
    customerName: customer.customerName || "Unnamed",
    mobileNumber: customer.mobileNumber || "--",
    selectedDay: customer.selectedDay || "--",
    identityType: customer.identityType || "--",
    identityNumber: customer.identityNumber || "--",
    nomineeName: customer.nomineeName || "--",
    loanAmount: Number(customer.loanAmount || 0),
    loanWeeks: Number(customer.loanWeeks || 0),
    weeklyDue: Number(customer.weeklyDue || customer.emiAmount || 0),
    totalPayable: Number(customer.totalPayable || 0),
    totalCollected: Number(collectedAmountByCustomer.get(customer.customerId) || 0),
    outstanding: Math.max(
      Number(customer.totalPayable || 0) - Number(collectedAmountByCustomer.get(customer.customerId) || 0),
      0
    ),
    collectionFrequency: customer.collectionFrequency || "--",
    disbursementDate: customer.disbursementDate || "--",
    dueDate: customer.dueDate || "--",
    approvalStatus: customer.approvalStatus || "pending",
    profile,
  };
}

export default function LoanApplyHome() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { customers, entries, loanRequests, loanApplications, loading } = useLoanDataSync();
  const tabParam = searchParams.get("tab");
  const mainTab =
    tabParam === "requests" ? "requests" : tabParam === "customers" ? "customers" : "apply";
  const pendingRequestCount = useMemo(
    () => loanRequests.filter((row) => String(row.status || "").toLowerCase() === "pending").length,
    [loanRequests]
  );
  const pendingCustomerCount = useMemo(
    () =>
      customers.filter(
        (customer) =>
          isActiveCustomerRecord(customer) &&
          String(customer.approvalStatus || "").toLowerCase() === "pending"
      ).length,
    [customers]
  );

  const setMainTab = (tab) => {
    if (tab === "apply") {
      setSearchParams({});
      return;
    }
    setSearchParams({ tab });
  };
  const [centers] = useState(() => loadCenters());

  const mergedCustomers = useMemo(
    () => mergeCustomersWithLoanApplications(customers, loanApplications),
    [customers, loanApplications]
  );

  const activeCustomers = useMemo(
    () => mergedCustomers.filter(isActiveCustomerRecord),
    [mergedCustomers]
  );
  const amountEntries = entries;
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedCenter, setSelectedCenter] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const repaymentByCustomer = useMemo(() => {
    const grouped = new Map();
    amountEntries.forEach((entry) => {
      const id = entry.customerId;
      if (!id) return;
      if (!grouped.has(id)) {
        grouped.set(id, {
          total: 0,
          approved: 0,
          onTime: 0,
          late: 0,
          missed: 0,
          lastPaidAt: "",
        });
      }
      const item = grouped.get(id);
      item.total += 1;
      if (entry.approvalStatus === "approved") item.approved += 1;
      const status = String(entry.collectionStatus || "").toLowerCase();
      if (status.includes("late") || status.includes("overdue")) item.late += 1;
      else if (status.includes("skip") || status.includes("miss")) item.missed += 1;
      else item.onTime += 1;
      const paidAt = entry.collectionDate || entry.submittedAt || "";
      if (paidAt && (!item.lastPaidAt || paidAt > item.lastPaidAt)) item.lastPaidAt = paidAt;
    });
    return grouped;
  }, [amountEntries]);
  const collectedAmountByCustomer = useMemo(() => {
    const map = new Map();
    amountEntries.forEach((entry) => {
      if (entry.approvalStatus !== "approved") return;
      const id = entry.customerId;
      if (!id) return;
      const current = map.get(id) || 0;
      map.set(id, current + Number(entry.amount || 0));
    });
    return map;
  }, [amountEntries]);

  const getRepaymentProfile = (customerId) => {
    const stats = repaymentByCustomer.get(customerId);
    if (!stats) {
      return {
        score: "NEW",
        onTimeRate: "--",
        missed: 0,
        late: 0,
        lastPaidAt: "--",
        decision: "Review",
      };
    }
    const effectiveTotal = Math.max(stats.total, 1);
    const onTimeRateRaw = Math.round((stats.onTime / effectiveTotal) * 100);
    const penalty = stats.late * 8 + stats.missed * 15;
    const confidenceScore = Math.max(0, Math.min(100, onTimeRateRaw - penalty));
    const score = confidenceScore >= 85 ? "A" : confidenceScore >= 70 ? "B" : confidenceScore >= 50 ? "C" : "RISK";
    const decision = score === "A" || score === "B" ? "Recommended" : score === "NEW" ? "Review" : "Caution";
    return {
      score,
      onTimeRate: `${onTimeRateRaw}%`,
      missed: stats.missed,
      late: stats.late,
      lastPaidAt: stats.lastPaidAt ? new Date(stats.lastPaidAt).toLocaleDateString("en-GB") : "--",
      decision,
    };
  };

  const dayCenters = useMemo(() => defaultCenters, []);
  const dayCounts = useMemo(() => {
    const map = new Map();
    dayCenters.forEach((dayCenter) => {
      const subLabels = centers.filter((c) => c.parent === dayCenter.label).map((c) => c.label);
      const count = activeCustomers.filter(
        (customer) => customer.selectedDay === dayCenter.label || subLabels.includes(customer.selectedDay)
      ).length;
      map.set(dayCenter.label, count);
    });
    return map;
  }, [activeCustomers, centers, dayCenters]);
  const childCenters = useMemo(
    () => centers.filter((center) => center.parent === selectedDay),
    [centers, selectedDay]
  );
  const centerCustomers = useMemo(() => {
    if (!selectedDay) return [];
    if (selectedCenter) {
      return activeCustomers.filter((customer) => customer.selectedDay === selectedCenter);
    }
    const subLabels = childCenters.map((center) => center.label);
    return activeCustomers.filter(
      (customer) => customer.selectedDay === selectedDay || subLabels.includes(customer.selectedDay)
    );
  }, [activeCustomers, selectedDay, selectedCenter, childCenters]);
  const filteredCustomers = useMemo(() => {
    const key = searchTerm.trim().toLowerCase();
    if (!key) return centerCustomers;
    return centerCustomers.filter((customer) => {
      const fields = [
        customer.customerName,
        customer.mobileNumber,
        customer.identityNumber,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return fields.some((value) => value.includes(key));
    });
  }, [centerCustomers, searchTerm]);

  const loanApplicationByCustomerId = useMemo(() => {
    const map = new Map();
    loanApplications.forEach((application) => {
      const customerId = application?.customerId;
      if (!customerId) return;
      const existing = map.get(customerId);
      if (!existing || String(application.submittedAt || "") > String(existing.submittedAt || "")) {
        map.set(customerId, application);
      }
    });
    return map;
  }, [loanApplications]);

  const customerLoanDisplayRows = useMemo(
    () =>
      filteredCustomers.map((customer) => ({
        customer,
        profile: getRepaymentProfile(customer.customerId),
        ...resolveCustomerLoanDisplay(customer, loanApplicationByCustomerId, collectedAmountByCustomer),
      })),
    [collectedAmountByCustomer, filteredCustomers, loanApplicationByCustomerId, repaymentByCustomer]
  );

  const goToLoanForm = (customerId) => {
    const customer = customers.find((item) => item.customerId === customerId);
    if (!customer) return;
    navigate(`/dashboard/loan-apply/${customer.customerId}`, { state: { applyLoan: true, customer } });
  };

  const goToViewLoan = (customerId) => {
    navigate(`/dashboard/customer/${customerId}/profile`);
  };

  const recentLoanRows = useMemo(() => {
    const customerById = new Map(activeCustomers.map((customer) => [customer.customerId, customer]));
    const recentByCustomer = new Map();

    const consider = (customer) => {
      const customerId = customer?.customerId;
      if (!customerId || !hasLoanApplicationData(customer) || !isRecentLoanActivity(customer)) return;
      const existing = recentByCustomer.get(customerId);
      if (!existing || compareLoanActivityDesc(customer, existing) < 0) {
        recentByCustomer.set(customerId, customer);
      }
    };

    activeCustomers.forEach(consider);

    loanApplications.forEach((application) => {
      if (isRecordDeleted(application)) return;
      const customerId = application?.customerId;
      if (!customerId) return;
      const base = customerById.get(customerId);
      const merged = base
        ? mergeCustomersWithLoanApplications([base], [application])[0]
        : { ...application, customerId };
      consider(merged);
    });

    return Array.from(recentByCustomer.values())
      .sort(compareLoanActivityDesc)
      .slice(0, 25)
      .map((customer) => mapCustomerToLoanRow(customer, collectedAmountByCustomer, getRepaymentProfile));
  }, [activeCustomers, loanApplications, collectedAmountByCustomer]);

  const classicSheetRows = useMemo(() => {
    const sourceRows = selectedDay
      ? filteredCustomers
          .filter((customer) => hasLoanApplicationData(customer))
          .sort(compareLoanActivityDesc)
          .map((customer) => mapCustomerToLoanRow(customer, collectedAmountByCustomer, getRepaymentProfile))
      : recentLoanRows;

    return sourceRows.map((row, index) => {
      const approvedEntries = amountEntries.filter(
        (entry) => entry.customerId === row.customerId && entry.approvalStatus === "approved"
      );
      const completedWeeks = approvedEntries.length;
      const totalWeeks = Number(row.loanWeeks || 0);
      const pendingWeeks = Math.max(totalWeeks - completedWeeks, 0);
      const cadence = String(row.collectionFrequency || "Weekly").toLowerCase() === "daily" ? "D" : "W";
      const lastEntry = amountEntries.find((entry) => entry.customerId === row.customerId);

      return {
        sno: String(index + 1),
        center: row.selectedDay || "Not available",
        centerName: row.selectedDay || "Not available",
        customerId: row.customerId,
        customerName: row.customerName || "Not available",
        customerMobile: formatPhone(row.mobileNumber),
        loanAmount: row.loanAmount ? `₹${formatCurrency(row.loanAmount)}` : "Pending",
        principal: row.totalPayable ? formatCurrency(row.totalPayable) : "Pending",
        progressAmount: row.totalCollected ? formatCurrency(row.totalCollected) : "0",
        disbursementDate: formatDate(row.disbursementDate),
        dueDate: formatDate(row.dueDate),
        onTime: formatDate(row.disbursementDate),
        week: totalWeeks ? `${totalWeeks}${cadence}` : "Pending",
        collectedWeek: String(completedWeeks),
        pendingWeek: totalWeeks ? `${pendingWeeks}${cadence}` : "Pending",
        od: lastEntry?.approvalStatus === "approved" ? "0D" : "Pending",
      };
    });
  }, [selectedDay, filteredCustomers, recentLoanRows, amountEntries, collectedAmountByCustomer]);

  return (
    <AdminLayout
      title="Loan Management"
      description="Apply loans directly or review employee loan requests"
    >
      <div className="app-grid-page grid min-w-0 gap-4">
        <div className="flex w-full justify-end">
          <div className="app-segmented w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setMainTab("apply")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                mainTab === "apply"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Loan apply
            </button>
            <button
              type="button"
              onClick={() => setMainTab("requests")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                mainTab === "requests"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Loan requests
              {pendingRequestCount > 0 ? (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                  {pendingRequestCount > 99 ? "99+" : pendingRequestCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setMainTab("customers")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                mainTab === "customers"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Customer approval
              {pendingCustomerCount > 0 ? (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                  {pendingCustomerCount > 99 ? "99+" : pendingCustomerCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="w-full min-w-0">
        {mainTab === "customers" ? <CustomerApprovalsPanel /> : null}
        {mainTab === "requests" ? <LoanRequestsPanel /> : null}

        {mainTab === "apply" ? (
        <>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {dayCenters.map((dayCenter) => {
              const active = selectedDay === dayCenter.label;
              return (
                <button
                  key={dayCenter.label}
                  type="button"
                  onClick={() => {
                    setSelectedDay(dayCenter.label);
                    setSelectedCenter(null);
                    setSearchTerm("");
                  }}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                    active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <p className="text-xs font-semibold">{dayCenter.label}</p>
                  <p className="text-[11px] text-slate-500">{loading ? "..." : `${dayCounts.get(dayCenter.label) || 0} customers`}</p>
                </button>
              );
            })}
          </div>

          {selectedDay ? (
            <label className="loan-apply-search-field flex w-full shrink-0 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 sm:w-56 md:w-64 lg:w-72">
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search customer"
                className="min-w-0 flex-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!selectedDay}
              />
            </label>
          ) : null}
        </div>

        {selectedDay && childCenters.length > 0 ? (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => {
                setSelectedCenter(null);
                setSearchTerm("");
              }}
              className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                !selectedCenter
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
              }`}
            >
              <p className="text-xs font-semibold">All</p>
              <p className="text-[11px] text-slate-500">
                {loading ? "..." : `${dayCounts.get(selectedDay) || 0} customers`}
              </p>
            </button>
            {childCenters.map((center) => {
              const active = selectedCenter === center.label;
              return (
                <button
                  key={center.label}
                  type="button"
                  onClick={() => {
                    setSelectedCenter(center.label);
                    setSearchTerm("");
                  }}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                    active
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                  }`}
                >
                  <p className="text-xs font-semibold">{center.label}</p>
                  <p className="text-[11px] text-slate-500">
                    {activeCustomers.filter((customer) => customer.selectedDay === center.label).length} customers
                  </p>
                </button>
              );
            })}
          </div>
        ) : null}

        {selectedDay ? (
        <section className="app-section-card p-3">
          <div className="mb-2">
            <p className="text-sm font-semibold text-slate-900">
              {selectedCenter ? `Customers in ${selectedCenter}` : `Customers in ${selectedDay}`}
            </p>
          </div>

          {filteredCustomers.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <div className="loan-apply-customer-grid min-w-[760px] items-center border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <span>Customer name</span>
                <span>Loan ID</span>
                <span>Loan amount</span>
                <span>Pending amount</span>
                <span>Ontime</span>
                <span>Action</span>
              </div>
              <div className="max-h-[52vh] overflow-y-auto">
                {customerLoanDisplayRows.map((row) => (
                  <div
                    key={row.customer.customerId}
                    className="loan-apply-customer-grid min-w-[760px] items-center border-b border-slate-100 px-3 py-2 text-xs text-slate-700"
                  >
                    <span className="truncate font-medium text-slate-900">{row.customer.customerName || "Unnamed"}</span>
                    <span className="truncate font-mono text-[11px] text-slate-700" title={row.loanId}>
                      {row.hasLoan ? (row.loanId === "—" ? "--" : row.loanId) : "--"}
                    </span>
                    <span className="truncate tabular-nums font-semibold text-slate-900">
                      {row.hasLoan ? formatLoanCurrency(row.loanAmount) : "--"}
                    </span>
                    <span className="truncate tabular-nums font-semibold text-slate-900">
                      {row.hasLoan && row.pendingAmount != null
                        ? formatLoanCurrency(row.pendingAmount, { allowZero: true })
                        : "--"}
                    </span>
                    <span className="tabular-nums">{row.profile.onTimeRate}</span>
                    <button
                      type="button"
                      onClick={() =>
                        row.hasLoan ? goToViewLoan(row.customer.customerId) : goToLoanForm(row.customer.customerId)
                      }
                      className="loan-apply-action-btn"
                    >
                      {row.hasLoan ? "View loan" : "Apply loan"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="app-empty-state">No customers match this filter.</p>
          )}
        </section>
        ) : null}

        {!selectedDay ? (
          <p className="mb-4 app-empty-state">Select a day center to start.</p>
        ) : null}

        <section className="app-section-card mt-4 min-w-0 max-w-full overflow-hidden p-3 sm:p-4">
          <div className="mb-2 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <p className="text-sm font-semibold text-slate-900">Recent loan applied</p>
            <p className="shrink-0 text-xs text-slate-500">
              {selectedCenter
                ? `Showing ${classicSheetRows.length} records for ${selectedCenter}`
                : selectedDay
                  ? `Showing ${classicSheetRows.length} records for ${selectedDay}`
                  : `Showing ${classicSheetRows.length} recent loan${classicSheetRows.length === 1 ? "" : "s"} (last ${RECENT_LOAN_LOOKBACK_DAYS} days)`}
            </p>
          </div>

          {classicSheetRows.length > 0 ? (
            <div className="relative isolate min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.04] [contain:inline-size]">
              <div
                className="max-h-[min(34vh,520px)] w-full min-w-0 max-w-full overflow-x-auto overflow-y-auto overscroll-x-contain rounded-xl [scrollbar-color:rgba(148,163,184,0.9)_rgba(241,245,249,0.95)] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/90 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100"
                role="region"
                aria-label="Recent loans table"
              >
                <table className="loan-recent-table w-full min-w-0 max-w-full table-fixed border-collapse text-slate-900">
                  <thead className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100/95 shadow-[0_1px_0_rgba(15,23,42,0.06)] backdrop-blur-sm">
                    <tr>
                      {sheetColumns.map((column) => (
                        <th
                          key={column.key}
                          style={{ width: column.width }}
                          className={`loan-recent-th max-w-0 overflow-hidden border-r border-slate-200/90 px-1 py-2 text-[9px] font-semibold uppercase tracking-wide text-slate-600 last:border-r-0 sm:px-1.5 sm:text-[10px] sm:tracking-[0.12em] ${column.align} ${column.hideClass ?? ""}`}
                        >
                          {renderHeaderLabel(column.label)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {classicSheetRows.map((row) => (
                      <tr
                        key={row.customerId}
                        className="align-middle odd:bg-white even:bg-slate-50/70 transition-colors hover:bg-blue-50/50"
                      >
                        {sheetColumns.map((column) => {
                          const value = row[column.key];
                          const muted = value === "Pending" || value === "Not available";
                          return (
                            <td
                              key={column.key}
                              style={{ width: column.width }}
                              className={`loan-recent-td max-w-0 overflow-hidden border-r border-slate-100 px-1 py-1.5 text-[10px] leading-snug last:border-r-0 sm:px-1.5 sm:py-2 sm:text-[11px] sm:leading-5 ${column.align} ${column.hideClass ?? ""} ${
                                muted && !column.variant ? "text-amber-800" : "text-slate-900"
                              }`}
                            >
                              <div className="loan-recent-cell-inner min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere]">
                                {renderSheetCell(column, value)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="app-empty-state">No records available for classic table.</p>
          )}
        </section>
        </>
        ) : null}
        </div>
      </div>
    </AdminLayout>
  );
}
