import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Clock3,
  DollarSign,
  IdCard,
  MapPin,
  Phone,
  UsersRound,
} from "lucide-react";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import { listCustomerAmountEntries, listCustomers } from "../services/userAuth";
import { buildEmployeeCustomerSummary } from "../utils/employeeCustomerSummary";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `Rs ${amount.toLocaleString("en-IN")}`;
}

const FROM_LIST_DETAIL_FIELDS = [
  { key: "customerId", label: "Customer ID", icon: IdCard },
  { key: "customerName", label: "Name", icon: UsersRound },
  { key: "phoneNumber", label: "Phone Number", icon: Phone },
  { key: "centerLabel", label: "Center", icon: MapPin },
  { key: "currentDueAmount", label: "Current Due", icon: DollarSign },
  { key: "pendingTenuresLabel", label: "Pending Tenure", icon: Clock3, wide: true },
  { key: "loanDate", label: "Loan Date", icon: CalendarDays },
  { key: "currentTenure", label: "Current Tenure", icon: BadgeCheck },
];

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

function DetailStatTile({ icon: Icon, label, value, wide = false }) {
  return (
    <div className={`app-panel-muted rounded-2xl p-3 sm:rounded-[22px] sm:p-3.5 ${wide ? "col-span-2" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-[10px] sm:tracking-[0.2em]">
            {label}
          </p>
          <p className="mt-1 break-words text-sm font-semibold leading-snug text-slate-950 sm:text-base">
            {value || "—"}
          </p>
        </div>
        <div className="app-icon-shell flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/70 sm:h-10 sm:w-10">
          <Icon className="h-4 w-4 text-slate-700 sm:h-[18px] sm:w-[18px]" />
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
  const { entries: syncedEntries } = useLoanDataSync();
  const { allCenters } = useEmployeeCenterScope();

  const [customer, setCustomer] = useState(location.state?.customer || null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(!location.state?.customer);
  const [error, setError] = useState("");

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

  const pageWidthClass = fromList ? "max-w-lg" : "max-w-2xl";

  return (
    <div className={`mx-auto flex w-full ${pageWidthClass} flex-col gap-3 pb-6 text-slate-900`}>
      {fromList ? (
        <button
          type="button"
          onClick={() => navigate("/employee/customers")}
          className="app-panel-muted inline-flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium text-slate-700 transition active:scale-[0.99] sm:px-4 sm:py-3"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Back to My Customers
        </button>
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
    </div>
  );
}
