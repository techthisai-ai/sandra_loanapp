import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  CircleDot,
  Clock3,
  DollarSign,
  IdCard,
  MapPin,
  Phone,
  UsersRound,
  Wallet,
} from "lucide-react";
import EmployeeCustomerEntryModal from "../components/employee/EmployeeCustomerEntryModal";
import useAuth from "../hooks/useAuth";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import { createCustomerAmountEntry, listCustomerAmountEntries, listCustomers } from "../services/userAuth";
import { buildEmployeeCustomerSummary } from "../utils/employeeCustomerSummary";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `₹${amount.toLocaleString("en-IN")}`;
}

const FROM_LIST_DETAIL_FIELDS = [
  { key: "customerId", label: "Customer ID", icon: IdCard },
  { key: "customerName", label: "Name", icon: UsersRound },
  { key: "phoneNumber", label: "Phone Number", icon: Phone },
  { key: "centerLabel", label: "Center", icon: MapPin },
  { key: "currentDueAmount", label: "Current Due", icon: DollarSign },
  { key: "partiallyPaidDisplay", label: "Partially", icon: CircleDot },
  { key: "pendingTenuresLabel", label: "Pending Tenure", icon: Clock3 },
  { key: "nextDueDateDisplay", label: "Next Due Date", icon: CalendarClock },
  { key: "loanDate", label: "Loan Date", icon: CalendarDays },
  { key: "currentTenure", label: "Current Tenure", icon: BadgeCheck },
];

const DETAIL_TILE_ACCENTS = {
  customerId: {
    card: "border-violet-200/90 bg-gradient-to-br from-violet-50/95 via-white to-white shadow-sm",
    iconShell: "border-violet-100 bg-violet-100",
    icon: "text-violet-700",
    label: "text-violet-800/80",
    value: "text-violet-950",
  },
  customerName: {
    card: "border-blue-200/90 bg-gradient-to-br from-blue-50/95 via-white to-white shadow-sm",
    iconShell: "border-blue-100 bg-blue-100",
    icon: "text-blue-700",
    label: "text-blue-800/80",
    value: "text-slate-950",
  },
  phoneNumber: {
    card: "border-sky-200/90 bg-gradient-to-br from-sky-50/95 via-white to-white shadow-sm",
    iconShell: "border-sky-100 bg-sky-100",
    icon: "text-sky-700",
    label: "text-sky-800/80",
    value: "text-slate-950",
  },
  centerLabel: {
    card: "border-cyan-200/90 bg-gradient-to-br from-cyan-50/95 via-white to-white shadow-sm",
    iconShell: "border-cyan-100 bg-cyan-100",
    icon: "text-cyan-700",
    label: "text-cyan-800/80",
    value: "text-slate-950",
  },
  currentDueClear: {
    card: "border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 via-white to-white shadow-sm",
    iconShell: "border-emerald-100 bg-emerald-100",
    icon: "text-emerald-700",
    label: "text-emerald-800/80",
    value: "text-emerald-900",
  },
  currentDueDue: {
    card: "border-rose-200/90 bg-gradient-to-br from-rose-50/95 via-white to-white shadow-sm",
    iconShell: "border-rose-100 bg-rose-100",
    icon: "text-rose-700",
    label: "text-rose-800/80",
    value: "text-rose-900",
  },
  partiallyPaid: {
    card: "border-blue-200/90 bg-gradient-to-br from-blue-50/95 via-white to-white shadow-sm",
    iconShell: "border-blue-100 bg-blue-100",
    icon: "text-blue-700",
    label: "text-blue-800/80",
    value: "text-blue-900",
  },
  partiallyEmpty: {
    card: "border-slate-200/90 bg-gradient-to-br from-slate-50/95 via-white to-white shadow-sm",
    iconShell: "border-slate-100 bg-slate-100",
    icon: "text-slate-600",
    label: "text-slate-600",
    value: "text-slate-700",
  },
  pendingClear: {
    card: "border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 via-white to-white shadow-sm",
    iconShell: "border-emerald-100 bg-emerald-100",
    icon: "text-emerald-700",
    label: "text-emerald-800/80",
    value: "text-emerald-900",
  },
  pendingDue: {
    card: "border-amber-200/90 bg-gradient-to-br from-amber-50/95 via-white to-white shadow-sm",
    iconShell: "border-amber-100 bg-amber-100",
    icon: "text-amber-700",
    label: "text-amber-800/80",
    value: "text-amber-900",
  },
  nextDueDate: {
    card: "border-orange-200/90 bg-gradient-to-br from-orange-50/95 via-white to-white shadow-sm",
    iconShell: "border-orange-100 bg-orange-100",
    icon: "text-orange-700",
    label: "text-orange-800/80",
    value: "text-slate-950",
  },
  loanDate: {
    card: "border-indigo-200/90 bg-gradient-to-br from-indigo-50/95 via-white to-white shadow-sm",
    iconShell: "border-indigo-100 bg-indigo-100",
    icon: "text-indigo-700",
    label: "text-indigo-800/80",
    value: "text-slate-950",
  },
  currentTenure: {
    card: "border-teal-200/90 bg-gradient-to-br from-teal-50/95 via-white to-white shadow-sm",
    iconShell: "border-teal-100 bg-teal-100",
    icon: "text-teal-700",
    label: "text-teal-800/80",
    value: "text-teal-900",
  },
};

function parseRupeeAmount(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return Number(digits || 0);
}

function resolveDetailTileAccent(fieldKey, value, summary) {
  if (fieldKey === "currentDueAmount") {
    const amount = Number(summary?.currentDueAmountNumber ?? parseRupeeAmount(value));
    return amount > 0 ? DETAIL_TILE_ACCENTS.currentDueDue : DETAIL_TILE_ACCENTS.currentDueClear;
  }
  if (fieldKey === "partiallyPaidDisplay") {
    const amount = parseRupeeAmount(value);
    return amount > 0 ? DETAIL_TILE_ACCENTS.partiallyPaid : DETAIL_TILE_ACCENTS.partiallyEmpty;
  }
  if (fieldKey === "pendingTenuresLabel") {
    const label = String(value || "").trim();
    const hasPending = label && label !== "—" && label !== "0";
    return hasPending ? DETAIL_TILE_ACCENTS.pendingDue : DETAIL_TILE_ACCENTS.pendingClear;
  }
  if (fieldKey === "nextDueDateDisplay") return DETAIL_TILE_ACCENTS.nextDueDate;
  return DETAIL_TILE_ACCENTS[fieldKey] || DETAIL_TILE_ACCENTS.partiallyEmpty;
}

function InfoBox({ icon: Icon, label, value, wide }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 ${wide ? "col-span-2" : ""}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Icon className="h-4 w-4 text-blue-600" />
        {label}
      </div>
      <p className="mt-2 text-sm font-medium text-slate-900">{value || "-"}</p>
    </div>
  );
}

function DetailStatTile({ icon: Icon, label, value, accent, wide = false }) {
  const tone = accent || DETAIL_TILE_ACCENTS.partiallyEmpty;

  return (
    <div
      className={`rounded-2xl border p-3 sm:rounded-[22px] sm:p-3.5 ${tone.card} ${wide ? "col-span-2" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`employee-field-label tracking-[0.18em] ${tone.label}`}>{label}</p>
          <p className={`employee-field-value mt-1 break-words leading-snug tabular-nums ${tone.value}`}>
            {value || "—"}
          </p>
        </div>
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border sm:h-10 sm:w-10 ${tone.iconShell}`}
        >
          <Icon className={`h-4 w-4 sm:h-[18px] sm:w-[18px] ${tone.icon}`} aria-hidden />
        </div>
      </div>
    </div>
  );
}

export default function EmployeeCustomerDetail() {
  const { day, customerId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fromList = Boolean(location.state?.fromList);
  const { profile } = useAuth();
  const { entries: syncedEntries } = useLoanDataSync();
  const { allCenters } = useEmployeeCenterScope();

  const [customer, setCustomer] = useState(location.state?.customer || null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(!location.state?.customer);
  const [error, setError] = useState("");
  const [collectModalOpen, setCollectModalOpen] = useState(false);

  const effectiveEntries = useMemo(() => {
    if (!customer?.customerId) return [];
    const fromSync = syncedEntries.filter((entry) => entry.customerId === customer.customerId);
    return fromSync.length ? fromSync : entries;
  }, [customer?.customerId, entries, syncedEntries]);

  const summary = useMemo(() => {
    if (!customer) return null;
    return buildEmployeeCustomerSummary(customer, effectiveEntries, allCenters);
  }, [allCenters, customer, effectiveEntries]);

  const approvedEntries = effectiveEntries.filter((entry) => entry.approvalStatus === "approved");
  const totalPaid = approvedEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const completedWeeks = approvedEntries.length;
  const remainingWeeks = Math.max(Number(customer?.loanWeeks || 0) - completedWeeks, 0);
  const mobileLabel = customer?.mobileNumber || "Not available";
  const collectionDayLabel = customer?.selectedDay || "Not available";
  const identityLabel = customer?.identityType || "Customer ID";
  const identityValue = customer?.identityNumber || "Not available";
  const loanWeeksLabel = customer?.loanWeeks ? String(customer.loanWeeks) : "Pending";
  const weeklyDueLabel = customer?.weeklyDue ? formatCurrency(customer.weeklyDue) : "Pending";
  const statusLabel = customer?.approvalStatus || "pending";
  const addressLabel = customer?.address || "Not available";

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      try {
        let currentCustomer = customer;
        if (!currentCustomer) {
          const list = await listCustomers();
          currentCustomer = list.find((item) => item.customerId === customerId) || null;
          setCustomer(currentCustomer);
        }

        if (currentCustomer) {
          const customerEntries = await listCustomerAmountEntries(currentCustomer.customerId);
          setEntries(customerEntries);
        }
      } catch (err) {
        setError(err.message || "Unable to load");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [customer, customerId]);

  return (
    <div className="employee-page flex flex-col gap-3 pb-6 text-slate-900">
      {fromList ? (
        <>
          <button
            type="button"
            onClick={() => navigate("/employee/customers")}
            className="app-panel-muted inline-flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium text-slate-700 transition active:scale-[0.99] sm:px-4 sm:py-3"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            Back to Customers
          </button>
          {customer && summary && !summary.isCurrentTenureCollected && !summary.hasPendingApproval ? (
            <button
              type="button"
              onClick={() => setCollectModalOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99]"
            >
              <Wallet className="h-4 w-4 shrink-0" />
              Collect now
            </button>
          ) : null}
        </>
      ) : null}

      {!fromList ? (
        <header className="flex items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-blue-50 text-blue-600">
              <UsersRound className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-blue-600">{day}</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                {customer?.customerName || "Customer"}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{customer?.customerId}</p>
            </div>
          </div>
        </header>
      ) : null}

      {loading ? (
        <div className="app-panel rounded-2xl px-4 py-8 text-center text-sm text-slate-500">Loading...</div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {customer && !loading && fromList && summary ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {FROM_LIST_DETAIL_FIELDS.map((field) => (
            <DetailStatTile
              key={field.key}
              icon={field.icon}
              label={field.label}
              value={summary[field.key]}
              accent={resolveDetailTileAccent(field.key, summary[field.key], summary)}
              wide={field.wide}
            />
          ))}
        </div>
      ) : null}

      {customer && !loading && !fromList ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xs text-slate-500">Total Paid</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(totalPaid)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xs text-slate-500">Done Weeks</p>
              <p className="mt-1 text-lg font-bold text-emerald-600">{completedWeeks}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xs text-slate-500">Left Weeks</p>
              <p className="mt-1 text-lg font-bold text-amber-600">{remainingWeeks}</p>
            </div>
          </div>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Customer details</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <InfoBox icon={Phone} label="Mobile" value={mobileLabel} />
              <InfoBox icon={CalendarDays} label="Collection day" value={collectionDayLabel} />
              <InfoBox icon={IdCard} label={identityLabel} value={identityValue} />
              <InfoBox icon={Clock3} label="Loan weeks" value={loanWeeksLabel} />
              <InfoBox icon={DollarSign} label="Weekly due" value={weeklyDueLabel} />
              <InfoBox icon={BadgeCheck} label="Status" value={statusLabel} />
              <InfoBox icon={MapPin} label="Address" value={addressLabel} wide />
            </div>
          </section>

          <button
            type="button"
            onClick={() => navigate(`/employee/customers/${encodeURIComponent(day || "")}`)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {day} customers
          </button>
        </>
      ) : null}

      {collectModalOpen && customer ? (
        <EmployeeCustomerEntryModal
          customer={customer}
          defaultCollectorName={profile?.displayName || ""}
          pendingAmount={summary?.currentDueAmountNumber ?? 0}
          pendingLabel={summary?.currentDueAmount ?? "—"}
          onClose={() => setCollectModalOpen(false)}
          onSave={async ({ amount, note, paymentMethod, collectionStatus, collectionDate, collectorName }) => {
            await createCustomerAmountEntry({
              customerId: customer.customerId,
              customerName: customer.customerName,
              amount,
              note,
              createdBy: profile?.uid || "employee",
              paymentMethod,
              collectionStatus,
              collectionDate,
              collectorName,
            });
            const customerEntries = await listCustomerAmountEntries(customer.customerId);
            setEntries(customerEntries);
          }}
        />
      ) : null}
    </div>
  );
}
