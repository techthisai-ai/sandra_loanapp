import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileDown,
  FileSpreadsheet,
  History,
  IndianRupee,
  Landmark,
  Layers3,
  Pencil,
  PiggyBank,
  Plus,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import PremiumKpiCard from "../components/dashboard/PremiumKpiCard";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import useAuth from "../hooks/useAuth";
import useWalletAvailable from "../hooks/useWalletAvailable";
import { listNotifications, updateUserSettings } from "../services/userAuth";
import { recordInvestorDeposit, WALLET_LEDGER_TYPES } from "../services/walletLedger";
import { isBookedLoanCustomer, sumInvestorDeposits } from "../utils/walletLedgerBalance";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `Rs ${amount.toLocaleString("en-IN")}`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function downloadCsv(filename, aoa) {
  const lines = aoa.map((row) =>
    row
      .map((cell) => {
        const s = String(cell ?? "");
        if (s.includes(",") || s.includes("\n") || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
        return s;
      })
      .join(",")
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getFirstEmiDate(customer) {
  const baseValue = customer?.disbursementDate || customer?.loanApprovedAt || customer?.submittedAt;
  if (!baseValue) return null;

  const baseDate = new Date(baseValue);
  if (Number.isNaN(baseDate.getTime())) return null;

  const frequency = String(customer?.collectionFrequency || "weekly").toLowerCase();
  const daysToAdd = frequency === "daily" ? 1 : frequency.startsWith("month") ? 30 : 7;
  const firstEmiDate = new Date(baseDate);
  firstEmiDate.setDate(firstEmiDate.getDate() + daysToAdd);
  return firstEmiDate;
}

function getCollectionDate(entry) {
  const value = entry?.collectionDate || entry?.submittedAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildActivityItems(customers, entries) {
  const customerActivities = customers.map((customer) => ({
    id: `customer-${customer.customerId}`,
    date: new Date(customer.submittedAt || customer.loanApprovedAt || 0),
    title: customer.customerName || customer.customerId || "Customer",
    subtitle: customer.loanAmount
      ? `Loan record updated for ${formatCurrency(customer.loanAmount)}`
      : "Customer profile created",
    tone: "bg-blue-50 text-blue-700 border-blue-200",
  }));

  const entryActivities = entries.map((entry) => ({
    id: `entry-${entry.entryId}`,
    date: new Date(entry.submittedAt || entry.collectionDate || 0),
    title: entry.customerName || entry.customerId || "Collection entry",
    subtitle: `${entry.approvalStatus === "approved" ? "Approved" : "Pending"} collection of ${formatCurrency(entry.amount)}`,
    tone: entry.approvalStatus === "approved"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-amber-50 text-amber-700 border-amber-200",
  }));

  return [...customerActivities, ...entryActivities]
    .filter((item) => !Number.isNaN(item.date.getTime()))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8);
}

function DashSectionLabel({ children, className = "" }) {
  return (
    <p className={`text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600/90 ${className}`}>{children}</p>
  );
}

function MiniStatPill({ label, value, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-50/90 text-slate-900 ring-slate-200/70 shadow-sm hover:shadow-md hover:ring-slate-300/60",
    emerald: "bg-emerald-50/95 text-emerald-900 ring-emerald-200/55 shadow-sm hover:shadow-[0_10px_24px_-14px_rgba(16,185,129,0.35)] hover:ring-emerald-300/50",
    blue: "bg-blue-50/95 text-blue-900 ring-blue-200/55 shadow-sm hover:shadow-[0_10px_24px_-14px_rgba(37,99,235,0.32)] hover:ring-blue-300/50",
    violet: "bg-violet-50/95 text-violet-900 ring-violet-200/55 shadow-sm hover:shadow-[0_10px_24px_-14px_rgba(139,92,246,0.3)] hover:ring-violet-300/50",
    amber: "bg-amber-50/95 text-amber-950 ring-amber-200/55 shadow-sm hover:shadow-[0_10px_24px_-14px_rgba(245,158,11,0.32)] hover:ring-amber-300/50",
  };
  return (
    <div
      className={`flex min-w-0 flex-1 basis-[calc(50%-0.25rem)] flex-col rounded-xl px-2.5 py-2 ring-1 ring-inset backdrop-blur-sm transition-all duration-300 ease hover:scale-[1.02] sm:basis-0 sm:px-3 ${tones[tone] || tones.slate}`}
    >
      <span className="text-[8px] font-semibold uppercase tracking-wider text-slate-600">{label}</span>
      <span className="mt-0.5 truncate font-mono text-xs font-bold tabular-nums text-slate-950 sm:text-sm">{value}</span>
    </div>
  );
}

function WalletSparkline({ points }) {
  if (!points || points.length < 2) {
    return (
      <div className="flex h-[48px] items-center justify-center rounded-xl border border-dashed border-slate-200/90 bg-slate-50/50 text-[10px] text-slate-400">
        Flow builds as transactions post
      </div>
    );
  }
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200/50 bg-gradient-to-b from-white/80 to-slate-50/40 p-2 shadow-inner">
      <p className="mb-1 text-[8px] font-semibold uppercase tracking-wider text-slate-500">Wallet trend</p>
      <svg viewBox="0 0 100 100" className="h-11 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="dashSparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(59 130 246 / 0.28)" />
            <stop offset="100%" stopColor="rgb(59 130 246 / 0)" />
          </linearGradient>
        </defs>
        <path d={`${d} L 100 100 L 0 100 Z`} fill="url(#dashSparkFill)" />
        <path d={d} fill="none" stroke="rgb(37 99 235)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function CompactProgressCard({ collected, target }) {
  const percentage = target > 0 ? Math.min(Math.round((collected / target) * 100), 100) : 0;
  return (
    <div className="dash-glass-panel relative min-h-0 min-w-0 overflow-hidden rounded-2xl p-4 transition-all duration-300 ease hover:scale-[1.01]">
      <div className="pointer-events-none absolute right-0 top-0 h-36 w-36 translate-x-1/4 -translate-y-1/3 rounded-full bg-blue-500/[0.07] blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight text-slate-950">Recovery vs payable</h3>
        </div>
        <div className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgb(241 245 249)" strokeWidth="3.5" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="url(#dashProgGrad)"
              strokeWidth="3.5"
              strokeDasharray={`${(percentage / 100) * 97.4} 97.4`}
              strokeLinecap="round"
              className="transition-[stroke-dasharray] duration-700 ease-out"
            />
            <defs>
              <linearGradient id="dashProgGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
          </svg>
          <span className="text-[11px] font-bold tabular-nums text-slate-900">{percentage}%</span>
        </div>
      </div>
      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100/90">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 transition-all duration-700 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="relative mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white/70 px-2.5 py-2 ring-1 ring-slate-200/40">
          <p className="text-[9px] font-medium text-slate-500">Collected</p>
          <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-900">{formatCurrency(collected)}</p>
        </div>
        <div className="rounded-xl bg-white/70 px-2.5 py-2 ring-1 ring-slate-200/40">
          <p className="text-[9px] font-medium text-slate-500">Payable</p>
          <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-900">{formatCurrency(target)}</p>
        </div>
      </div>
    </div>
  );
}

function QuickActionButton({ to, onClick, icon: Icon, label, variant = "light", disabled = false, title: tip }) {
  const base =
    "group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl px-2 py-3 text-center transition-all duration-300 ease sm:flex-row sm:gap-2 sm:py-3.5";
  const light =
    "border border-slate-200/70 bg-white/85 text-slate-800 shadow-sm ring-1 ring-white/60 backdrop-blur-sm hover:scale-[1.02] hover:border-blue-200/80 hover:bg-white hover:shadow-[0_14px_32px_-16px_rgba(37,99,235,0.28)]";
  const primary =
    "border border-transparent bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25 hover:scale-[1.02] hover:from-blue-500 hover:to-indigo-500 hover:shadow-[0_16px_36px_-14px_rgba(37,99,235,0.45)]";
  const cls = `${base} ${variant === "primary" ? primary : light}`;
  const disabledCls = disabled ? "pointer-events-none cursor-not-allowed opacity-45 saturate-[0.65]" : "";
  const inner = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ease sm:h-11 sm:w-11 ${
          variant === "primary" ? "bg-white/15 ring-1 ring-white/25" : "bg-slate-100 ring-1 ring-slate-200/60 group-hover:bg-blue-50 group-hover:ring-blue-200/60"
        }`}
      >
        <Icon className={`h-5 w-5 ${variant === "primary" ? "text-white" : "text-blue-600"}`} strokeWidth={1.85} />
      </span>
      <span className={`relative max-w-[7.5rem] text-[10px] font-bold leading-tight sm:max-w-none sm:text-xs ${variant === "primary" ? "text-white/95" : "text-slate-700"}`}>
        {label}
      </span>
    </>
  );
  if (to && !disabled) {
    return (
      <Link to={to} className={`${cls} ${disabledCls}`}>
        {inner}
      </Link>
    );
  }
  if (to && disabled) {
    return (
      <span title={tip || undefined} className={`${cls} ${disabledCls}`} role="presentation">
        {inner}
      </span>
    );
  }
  return (
    <button type="button" title={tip || undefined} onClick={onClick} disabled={disabled} className={`${cls} ${disabledCls}`}>
      {inner}
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dash-skeleton grid animate-pulse gap-3 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[100px] rounded-2xl bg-gradient-to-br from-slate-100 via-blue-50/50 to-cyan-50/40 shadow-inner ring-1 ring-slate-200/50"
        />
      ))}
      <div className="h-36 rounded-2xl bg-gradient-to-br from-slate-100 via-indigo-50/30 to-slate-50/80 shadow-inner ring-1 ring-slate-200/50 md:col-span-2 xl:col-span-2" />
      <div className="h-36 rounded-2xl bg-gradient-to-br from-slate-100 via-sky-50/35 to-slate-50/80 shadow-inner ring-1 ring-slate-200/50 md:col-span-2 xl:col-span-2" />
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, profile, setProfile } = useAuth();
  const { customers, entries, loading: syncLoading, error: syncError } = useLoanDataSync();
  const {
    balance: cashInHand,
    opening: cashOpening,
    walletRows,
    timeline: walletTransactionTimeline,
  } = useWalletAvailable();
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifError, setNotifError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [cashEditOpen, setCashEditOpen] = useState(false);
  const [cashDraft, setCashDraft] = useState("");
  const [cashSaving, setCashSaving] = useState(false);
  const [cashError, setCashError] = useState("");
  const [investorOpen, setInvestorOpen] = useState(false);
  const [invName, setInvName] = useState("");
  const [invAmount, setInvAmount] = useState("");
  const [invDate, setInvDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [invMethod, setInvMethod] = useState("Bank transfer");
  const [invRef, setInvRef] = useState("");
  const [invNotes, setInvNotes] = useState("");
  const [invSaving, setInvSaving] = useState(false);
  const [invError, setInvError] = useState("");
  const [txFilterType, setTxFilterType] = useState("all");
  const [txSearch, setTxSearch] = useState("");
  const [txDateFrom, setTxDateFrom] = useState("");
  const [txDateTo, setTxDateTo] = useState("");
  const [txAmountMin, setTxAmountMin] = useState("");
  const [txAmountMax, setTxAmountMax] = useState("");
  const [txPersonFilter, setTxPersonFilter] = useState("");
  const walletHistoryRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setNotifLoading(true);
      setNotifError("");
      try {
        const notificationItems = await listNotifications();
        if (!cancelled) {
          setUnreadCount(notificationItems.filter((n) => n.status !== "read").length);
        }
      } catch (loadError) {
        if (!cancelled) {
          setNotifError(loadError.message || "Unable to load notifications");
        }
      } finally {
        if (!cancelled) {
          setNotifLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = syncLoading || notifLoading;
  const error = syncError || notifError || "";

  const metrics = useMemo(() => {
    const today = startOfDay(new Date());
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const approvedEntries = entries.filter(
      (entry) => String(entry?.approvalStatus || "").toLowerCase() === "approved"
    );
    const pendingApprovalEntries = entries.filter((entry) => {
      const s = String(entry?.approvalStatus || "").toLowerCase();
      return s !== "approved" && s !== "rejected";
    });
    const totalCustomers = customers.length;
    const activeLoans = customers.filter((customer) => isBookedLoanCustomer(customer));

    const approvedByCustomer = approvedEntries.reduce((acc, entry) => {
      const customerId = entry.customerId || "unknown";
      acc[customerId] = (acc[customerId] || 0) + Number(entry.amount || 0);
      return acc;
    }, {});

    const dailyCollection = approvedEntries.reduce((sum, entry) => {
      const date = getCollectionDate(entry);
      return date && startOfDay(date).getTime() === today.getTime()
        ? sum + Number(entry.amount || 0)
        : sum;
    }, 0);

    const monthlyCollection = approvedEntries.reduce((sum, entry) => {
      const date = getCollectionDate(entry);
      const entryKey = date
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
        : "";
      return entryKey === monthKey ? sum + Number(entry.amount || 0) : sum;
    }, 0);

    const totalCollected = approvedEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const pendingCollectionAmount = pendingApprovalEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const totalPayable = activeLoans.reduce((sum, customer) => sum + Number(customer.totalPayable || 0), 0);
    const totalPrincipal = activeLoans.reduce((sum, customer) => sum + Number(customer.loanAmount || 0), 0);
    const totalOutstanding = activeLoans.reduce((sum, customer) => {
      const collected = approvedByCustomer[customer.customerId] || 0;
      const balance = Math.max(Number(customer.totalPayable || 0) - collected, 0);
      return sum + balance;
    }, 0);

    const dueSoonCustomers = activeLoans
      .map((customer) => {
        const collected = approvedByCustomer[customer.customerId] || 0;
        const balance = Math.max(Number(customer.totalPayable || 0) - collected, 0);
        const dueDate = customer.dueDate ? startOfDay(new Date(customer.dueDate)) : null;
        const diffDays = dueDate ? Math.round((dueDate.getTime() - today.getTime()) / 86400000) : null;
        return {
          ...customer,
          balance,
          dueDate,
          diffDays,
        };
      })
      .filter((customer) => customer.dueDate && customer.balance > 0 && customer.diffDays >= 0 && customer.diffDays <= 7)
      .sort((a, b) => a.diffDays - b.diffDays)
      .slice(0, 5);

    const overdueCustomers = activeLoans
      .map((customer) => {
        const collected = approvedByCustomer[customer.customerId] || 0;
        const balance = Math.max(Number(customer.totalPayable || 0) - collected, 0);
        const dueDate = customer.dueDate ? startOfDay(new Date(customer.dueDate)) : null;
        const overdueDays = dueDate ? Math.round((today.getTime() - dueDate.getTime()) / 86400000) : null;
        return {
          ...customer,
          balance,
          dueDate,
          overdueDays,
        };
      })
      .filter((customer) => customer.dueDate && customer.balance > 0 && customer.overdueDays > 0)
      .sort((a, b) => b.overdueDays - a.overdueDays)
      .slice(0, 5);

    const firstEmiOverview = activeLoans
      .map((customer) => {
        const firstEmiDate = getFirstEmiDate(customer);
        return {
          ...customer,
          firstEmiDate,
        };
      })
      .filter((customer) => customer.firstEmiDate)
      .sort((a, b) => a.firstEmiDate.getTime() - b.firstEmiDate.getTime())
      .slice(0, 5);

    const customerTracking = activeLoans
      .map((customer) => {
        const collected = approvedByCustomer[customer.customerId] || 0;
        const target = Number(customer.totalPayable || 0);
        const balance = Math.max(target - collected, 0);
        const progress = target > 0 ? Math.min(Math.round((collected / target) * 100), 100) : 0;
        return {
          ...customer,
          collected,
          target,
          balance,
          progress,
        };
      })
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 8);

    const recentActivity = buildActivityItems(customers, entries);

    return {
      totalCustomers,
      activeLoansCount: activeLoans.length,
      dailyCollection,
      monthlyCollection,
      totalCollected,
      pendingCollectionAmount,
      totalPayable,
      totalPrincipal,
      totalOutstanding,
      pendingRepayments: customerTracking.filter((customer) => customer.balance > 0).length,
      dueSoonCustomers,
      overdueCustomers,
      firstEmiOverview,
      customerTracking,
      recentActivity,
    };
  }, [customers, entries]);

  const investorDepositsTotal = useMemo(() => sumInvestorDeposits(walletRows), [walletRows]);

  const filteredWalletTimeline = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    const pq = txPersonFilter.trim().toLowerCase();
    const from = txDateFrom ? new Date(`${txDateFrom}T00:00:00`).getTime() : null;
    const to = txDateTo ? new Date(`${txDateTo}T23:59:59`).getTime() : null;
    const minAmt = txAmountMin.trim() === "" ? null : Number(String(txAmountMin).replace(/,/g, ""));
    const maxAmt = txAmountMax.trim() === "" ? null : Number(String(txAmountMax).replace(/,/g, ""));
    return walletTransactionTimeline.filter((row) => {
      if (txFilterType !== "all" && row.ledgerType !== txFilterType) return false;
      if (from != null && row.sortAt < from) return false;
      if (to != null && row.sortAt > to) return false;
      if (pq && !String(row.personName || "").toLowerCase().includes(pq)) return false;
      const move = Math.max(Number(row.credit || 0), Number(row.debit || 0));
      if (minAmt != null && Number.isFinite(minAmt) && move < minAmt) return false;
      if (maxAmt != null && Number.isFinite(maxAmt) && move > maxAmt) return false;
      if (!q) return true;
      return [row.label, row.personName, row.referenceId, row.remarks].some((f) => String(f).toLowerCase().includes(q));
    });
  }, [walletTransactionTimeline, txDateFrom, txDateTo, txFilterType, txSearch, txPersonFilter, txAmountMin, txAmountMax]);

  const walletSparklinePts = useMemo(() => {
    const asc = [...walletTransactionTimeline].sort((a, b) => a.sortAt - b.sortAt);
    const slice = asc.slice(-36);
    if (slice.length < 2) return null;
    const vals = slice.map((r) => Number(r.balanceAfter || 0));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    return slice.map((r, i) => ({
      x: slice.length === 1 ? 50 : (i / (slice.length - 1)) * 100,
      y: 12 + (1 - (Number(r.balanceAfter || 0) - min) / range) * 76,
    }));
  }, [walletTransactionTimeline]);

  const recoveryPercent = useMemo(
    () => (metrics.totalPayable > 0 ? Math.min(Math.round((metrics.totalCollected / metrics.totalPayable) * 100), 100) : 0),
    [metrics.totalCollected, metrics.totalPayable]
  );

  const todayVsMonthRatio = useMemo(() => {
    if (metrics.monthlyCollection <= 0) return null;
    return Math.min(Math.round((metrics.dailyCollection / metrics.monthlyCollection) * 100), 100);
  }, [metrics.dailyCollection, metrics.monthlyCollection]);

  const netCashFlow = metrics.totalCollected - metrics.totalPrincipal;

  const summaryFreshAt = useMemo(
    () => new Date(),
    [walletRows, customers, entries, cashOpening]
  );
  const lastUpdatedLabel = useMemo(
    () =>
      summaryFreshAt.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }),
    [summaryFreshAt]
  );

  const isFreshFinanceState = useMemo(
    () =>
      cashOpening === 0 &&
      investorDepositsTotal === 0 &&
      metrics.totalPrincipal === 0 &&
      metrics.totalCollected === 0 &&
      metrics.totalOutstanding === 0,
    [
      cashOpening,
      investorDepositsTotal,
      metrics.totalPrincipal,
      metrics.totalCollected,
      metrics.totalOutstanding,
    ]
  );

  const walletHealthLine = useMemo(() => {
    if (isFreshFinanceState) return "Fresh start · add deposit or opening balance";
    if (cashInHand < 0) return "Low liquidity · negative balance";
    if (cashInHand === 0) return "Low liquidity · add capital";
    if (cashInHand < metrics.totalOutstanding * 0.15) return "Watch liquidity vs pending recovery";
    return "Healthy wallet buffer";
  }, [cashInHand, metrics.totalOutstanding, isFreshFinanceState]);

  const recoveryHealthLine = useMemo(() => {
    if (recoveryPercent >= 55) return "Good recovery pace";
    if (recoveryPercent >= 25) return "Moderate recovery";
    return "Recovery acceleration suggested";
  }, [recoveryPercent]);

  const pendingRiskLine = useMemo(() => {
    if (metrics.totalOutstanding <= 0) return "No pending book balance";
    const ratio = metrics.totalPayable > 0 ? metrics.totalOutstanding / metrics.totalPayable : 0;
    if (ratio > 0.65) return "High pending risk";
    if (ratio > 0.35) return "Elevated pending exposure";
    return "Collection efficiency on track";
  }, [metrics.totalOutstanding, metrics.totalPayable]);

  async function handleSaveCashOpening() {
    if (!user?.uid) return;
    const parsed = Number(String(cashDraft).replace(/,/g, "").trim());
    if (!Number.isFinite(parsed) || parsed < 0) {
      setCashError("Enter a valid amount (0 or more).");
      return;
    }
    setCashSaving(true);
    setCashError("");
    try {
      const updated = await updateUserSettings(user.uid, { cashInHandOpening: Math.round(parsed) });
      if (updated) setProfile(updated);
      setCashEditOpen(false);
    } catch (err) {
      setCashError(err.message || "Could not save opening balance.");
    } finally {
      setCashSaving(false);
    }
  }

  async function handleSaveInvestorDeposit() {
    if (!user?.uid) return;
    setInvSaving(true);
    setInvError("");
    try {
      const amt = Number(String(invAmount).replace(/,/g, "").trim());
      if (!invName.trim()) throw new Error("Investor name is required.");
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Enter a valid deposit amount.");
      await recordInvestorDeposit({
        investorName: invName.trim(),
        amount: amt,
        depositDate: invDate,
        paymentMethod: invMethod,
        referenceNumber: invRef.trim(),
        notes: invNotes.trim(),
        createdBy: profile?.displayName || profile?.email || user.email || "Admin",
      });
      setInvestorOpen(false);
      setInvName("");
      setInvAmount("");
      setInvDate(new Date().toISOString().slice(0, 10));
      setInvMethod("Bank transfer");
      setInvRef("");
      setInvNotes("");
    } catch (err) {
      setInvError(err.message || "Could not save deposit.");
    } finally {
      setInvSaving(false);
    }
  }

  function exportWalletReport(kind) {
    const stamp = new Date().toISOString().slice(0, 10);
    const base = [
      ["Date & time", "Type", "Person", "Reference", "Credit (Rs)", "Debit (Rs)", "Wallet after (Rs)", "Remarks"],
      ...filteredWalletTimeline.map((r) => [
        r.atLabel,
        r.label,
        r.personName,
        r.referenceId,
        r.credit || "",
        r.debit || "",
        r.balanceAfter,
        r.remarks,
      ]),
    ];
    if (kind === "wallet") {
      downloadCsv(`wallet-transaction-report-${stamp}.csv`, base);
      return;
    }
    if (kind === "investor") {
      const rows = walletRows.filter((r) => (r.ledgerType || r.type) === WALLET_LEDGER_TYPES.INVESTOR_DEPOSIT);
      downloadCsv(`investor-deposit-report-${stamp}.csv`, [
        ["Date", "Investor", "Amount (Rs)", "Method", "Reference", "Notes"],
        ...rows.map((r) => [
          formatDateTime(r.submittedAt),
          r.investorName || r.personName,
          Number(r.credit || r.amount || 0),
          r.paymentMethod || "",
          r.referenceNumber || r.referenceId || "",
          r.notes || "",
        ]),
      ]);
      return;
    }
    if (kind === "loan") {
      downloadCsv(`loan-disbursement-report-${stamp}.csv`, [
        ["Customer", "Customer ID", "Principal (Rs)", "Disbursement / approval date"],
        ...customers
          .filter((c) => Number(c.loanAmount || 0) > 0)
          .map((c) => [
            c.customerName || "",
            c.customerId,
            Number(c.loanAmount || 0),
            formatDate(c.disbursementDate || c.loanApprovedAt || c.submittedAt),
          ]),
      ]);
      return;
    }
    if (kind === "emi") {
      downloadCsv(`emi-collection-report-${stamp}.csv`, [
        ["Date", "Customer", "Entry ID", "Amount (Rs)", "Status"],
        ...entries
          .filter((e) => String(e.approvalStatus || "").toLowerCase() === "approved")
          .map((e) => [
            formatDateTime(e.approvedAt || e.collectionDate || e.submittedAt),
            e.customerName || e.customerId,
            e.entryId || e.id,
            Number(e.amount || 0),
            e.approvalStatus,
          ]),
      ]);
    }
  }

  return (
    <AdminLayout
      title="Dashboard"
      description=""
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/settings?tab=notifications")}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 p-0 shadow-sm backdrop-blur-sm transition hover:border-blue-200 hover:bg-white hover:shadow-md"
          >
            <Bell className="h-5 w-5 text-slate-600" strokeWidth={1.75} />
            {unreadCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </button>
        </div>
      }
    >
      <div className="app-grid-page dash-premium grid w-full min-w-0 gap-4 md:gap-5">
        {syncLoading && customers.length === 0 && entries.length === 0 ? <DashboardSkeleton /> : null}

        <div className="relative overflow-hidden rounded-[22px] border border-white/60 bg-gradient-to-br from-slate-50/95 via-white to-blue-50/35 px-3.5 pb-3.5 pt-3 shadow-[0_10px_36px_-22px_rgba(15,23,42,0.16)] ring-1 ring-slate-200/40 backdrop-blur-md sm:px-4 sm:pb-4 sm:pt-3.5 md:px-5 md:pb-5 md:pt-4">
          {cashInHand <= 0 && !isFreshFinanceState ? (
            <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-300/60 bg-gradient-to-r from-amber-50 to-orange-50/90 px-3 py-2.5 text-xs text-amber-950 shadow-sm ring-1 ring-amber-200/50">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={2} />
              <div>
                <p className="font-semibold tracking-tight">Insufficient wallet balance</p>
                <p className="mt-0.5 text-[11px] leading-snug text-amber-900/90">
                  Investor deposits and approved EMI inflows increase available capital. Loan disbursements and expenses reduce it.
                </p>
              </div>
            </div>
          ) : isFreshFinanceState ? (
            <div className="mb-2 flex items-start gap-2 rounded-xl border border-sky-200/70 bg-sky-50/90 px-3 py-2.5 text-xs text-sky-950 shadow-sm ring-1 ring-sky-200/50">
              <Activity className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" strokeWidth={2} />
              <div>
                <p className="font-semibold tracking-tight">Ready for QA testing</p>
                <p className="mt-0.5 text-[11px] leading-snug text-sky-900/90">
                  All finance values are zero. Add an investor deposit or set opening balance, then approve your first loan and EMI.
                </p>
              </div>
            </div>
          ) : null}
          <section
            className={`relative grid min-w-0 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4 ${syncLoading ? "opacity-70 transition-opacity" : ""}`}
            aria-busy={syncLoading}
          >
            <PremiumKpiCard
              icon={Wallet}
              label="Wallet balance"
              amount={Math.round(cashInHand)}
              sub={`Deposits ${formatCurrency(Math.round(investorDepositsTotal))} · Opening ${formatCurrency(Math.round(cashOpening))}`}
              accent="wallet"
              amountTone={cashInHand < 0 ? "negative" : cashInHand === 0 ? "warning" : "positive"}
              healthLine={walletHealthLine}
              trendUp={cashInHand > 0}
            />
            <PremiumKpiCard
              icon={Landmark}
              label="Loan given"
              amount={Math.round(metrics.totalPrincipal)}
              sub={`${metrics.activeLoansCount} booked loan${metrics.activeLoansCount === 1 ? "" : "s"} (approved)`}
              accent="loan"
              amountTone="neutral"
              healthLine="Deployed principal · approved book"
              trendUp={metrics.totalPrincipal > 0 ? true : undefined}
            />
            <PremiumKpiCard
              icon={ReceiptText}
              label="EMI collected"
              amount={Math.round(metrics.totalCollected)}
              sub="Approved on ledger"
              accent="sky"
              amountTone="info"
              healthLine={recoveryHealthLine}
              trendUp={recoveryPercent >= 40}
            />
            <PremiumKpiCard
              icon={TrendingUp}
              label="Pending recovery"
              amount={Math.round(metrics.totalOutstanding)}
              sub={`${metrics.pendingRepayments} loan${metrics.pendingRepayments === 1 ? "" : "s"} with balance`}
              accent="amber"
              amountTone="warning"
              healthLine={pendingRiskLine}
              trendUp={metrics.totalOutstanding <= metrics.totalPayable * 0.35}
            />
          </section>

          <p className="mt-2 text-center text-[10px] font-medium tracking-wide text-slate-400">
            Last updated {lastUpdatedLabel} · live wallet ledger
          </p>

          <section className="relative mt-3 md:mt-3.5">
            <DashSectionLabel className="mb-2 text-slate-500">Today overview</DashSectionLabel>
            <div className="flex min-w-0 flex-wrap gap-2 rounded-2xl bg-slate-50/60 p-2 ring-1 ring-slate-200/40 backdrop-blur-sm">
              <MiniStatPill label="Today" value={formatCurrency(metrics.dailyCollection)} tone="blue" />
              <MiniStatPill label="MTD" value={formatCurrency(metrics.monthlyCollection)} tone="emerald" />
              <MiniStatPill label="Recovery" value={`${recoveryPercent}%`} tone="violet" />
              <MiniStatPill label="Today / month" value={todayVsMonthRatio == null ? "—" : `${todayVsMonthRatio}%`} tone="slate" />
              <MiniStatPill label="Customers" value={String(metrics.totalCustomers)} tone="slate" />
              <MiniStatPill label="Pending approval" value={formatCurrency(metrics.pendingCollectionAmount)} tone="amber" />
            </div>
          </section>

          <section className="relative mt-3 md:mt-3.5">
            <DashSectionLabel className="mb-2 text-slate-500">Quick actions</DashSectionLabel>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <QuickActionButton
                variant="primary"
                onClick={() => {
                  setInvError("");
                  setInvestorOpen(true);
                }}
                icon={Plus}
                label="Investor deposit"
              />
              <QuickActionButton
                to="/dashboard/loan-apply"
                icon={Banknote}
                label="Give loan"
                disabled={cashInHand <= 0}
                title={cashInHand <= 0 ? "Insufficient wallet balance — add capital or collect EMI first" : undefined}
              />
              <QuickActionButton to="/dashboard/collection" icon={ReceiptText} label="Add collection" />
              <QuickActionButton to="/dashboard/reports" icon={BarChart3} label="Reports" />
              <QuickActionButton
                onClick={() => walletHistoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                icon={History}
                label="Ledger"
              />
            </div>
          </section>
        </div>

        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(280px,0.92fr)]">
          <CompactProgressCard collected={metrics.totalCollected} target={metrics.totalPayable} />

          <div className="dash-glass-panel relative z-10 min-w-0 overflow-hidden rounded-2xl p-4 transition-all duration-300 ease hover:scale-[1.01]">
            <div className="pointer-events-none absolute -right-12 top-0 h-44 w-44 rounded-full bg-blue-500/[0.07] blur-3xl" />
            <div className="relative flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 pr-2">
                <h2 className="text-lg font-bold tracking-tight text-slate-950">Capital flow</h2>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-sky-800 ring-1 ring-sky-200/50">
                <Activity className="h-3.5 w-3.5" strokeWidth={2} />
                Flow
              </div>
            </div>

            <WalletSparkline points={walletSparklinePts} />

            <div className="relative mt-3 rounded-xl bg-white/50 px-2.5 py-2 ring-1 ring-slate-200/40 backdrop-blur-sm">
              <p className="text-[8px] font-semibold uppercase tracking-wider text-slate-500">Movement</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[9px] font-semibold sm:gap-1.5 sm:text-[10px]">
                <span className="rounded-lg bg-emerald-100/90 px-1.5 py-0.5 text-emerald-900 ring-1 ring-emerald-200/50 sm:px-2 sm:py-1">
                  +In {formatCurrency(Math.round(investorDepositsTotal))}
                </span>
                <span className="text-slate-300">→</span>
                <span className="rounded-lg bg-slate-100/90 px-1.5 py-0.5 text-slate-900 ring-1 ring-slate-200/60 sm:px-2 sm:py-1">
                  Wallet {formatCurrency(Math.round(cashInHand))}
                </span>
                <span className="text-slate-300">→</span>
                <span className="rounded-lg bg-rose-100/90 px-1.5 py-0.5 text-rose-900 ring-1 ring-rose-200/50 sm:px-2 sm:py-1">
                  −Loans {formatCurrency(Math.round(metrics.totalPrincipal))}
                </span>
                <span className="text-slate-300">→</span>
                <span className="rounded-lg bg-sky-100/90 px-1.5 py-0.5 text-sky-950 ring-1 ring-sky-200/50 sm:px-2 sm:py-1">
                  +EMI {formatCurrency(Math.round(metrics.totalCollected))}
                </span>
              </div>
            </div>

            <div className="relative mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-xl bg-white/70 px-2 py-2 ring-1 ring-slate-200/35 backdrop-blur-sm">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-[9px] font-medium text-slate-500">Wallet</p>
                    <p className="font-mono text-sm font-bold tabular-nums leading-tight text-slate-950">{formatCurrency(Math.round(cashInHand))}</p>
                  </div>
                  {user?.uid ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCashError("");
                        setCashDraft(String(Math.round(cashOpening)));
                        setCashEditOpen((o) => !o);
                      }}
                      className="shrink-0 rounded-lg bg-slate-100/90 p-1 text-slate-600 ring-1 ring-slate-200/60 transition hover:bg-slate-200/90"
                      title="Edit opening cash"
                      aria-label="Edit opening cash balance"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                {cashEditOpen ? (
                  <div className="mt-2 space-y-2 border-t border-slate-100/80 pt-2">
                    <label className="block text-[10px] font-medium text-slate-600" htmlFor="cash-opening-input">
                      Opening balance
                    </label>
                    <input
                      id="cash-opening-input"
                      type="text"
                      inputMode="numeric"
                      value={cashDraft}
                      onChange={(e) => setCashDraft(e.target.value.replace(/[^\d]/g, ""))}
                      className="app-input h-8 w-full text-xs"
                      placeholder="e.g. 500000"
                    />
                    {cashError ? <p className="text-[10px] text-rose-600">{cashError}</p> : null}
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={cashSaving}
                        onClick={handleSaveCashOpening}
                        className="app-button-primary inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold"
                      >
                        <Check className="h-3 w-3" />
                        Save
                      </button>
                      <button
                        type="button"
                        disabled={cashSaving}
                        onClick={() => {
                          setCashEditOpen(false);
                          setCashError("");
                        }}
                        className="app-button-secondary inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold"
                      >
                        <X className="h-3 w-3" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="rounded-xl bg-emerald-50/50 px-2 py-2 ring-1 ring-emerald-200/40">
                <p className="text-[9px] font-medium text-emerald-800">Deposits</p>
                <p className="font-mono text-sm font-bold tabular-nums leading-tight text-emerald-900">{formatCurrency(Math.round(investorDepositsTotal))}</p>
              </div>
              <div className="rounded-xl bg-rose-50/50 px-2 py-2 ring-1 ring-rose-200/40">
                <p className="text-[9px] font-medium text-rose-800">Disbursed</p>
                <p className="font-mono text-sm font-bold tabular-nums leading-tight text-rose-900">{formatCurrency(metrics.totalPrincipal)}</p>
              </div>
              <div className="rounded-xl bg-sky-50/50 px-2 py-2 ring-1 ring-sky-200/40">
                <p className="text-[9px] font-medium text-sky-900">EMI in</p>
                <p className="font-mono text-sm font-bold tabular-nums leading-tight text-sky-950">{formatCurrency(metrics.totalCollected)}</p>
              </div>
              <div className="rounded-xl bg-amber-50/50 px-2 py-2 ring-1 ring-amber-200/40">
                <p className="text-[9px] font-medium text-amber-900">Outstanding</p>
                <p className="font-mono text-sm font-bold tabular-nums leading-tight text-amber-950">{formatCurrency(metrics.totalOutstanding)}</p>
              </div>
              <div className="col-span-2 rounded-xl bg-slate-50/80 px-2 py-2 ring-1 ring-slate-200/50 sm:col-span-1 lg:col-span-1">
                <p className="text-[9px] font-medium text-slate-600">Net (coll. − principal)</p>
                <p className={`font-mono text-sm font-bold tabular-nums leading-tight ${netCashFlow >= 0 ? "text-emerald-800" : "text-rose-700"}`}>
                  {formatCurrency(Math.round(netCashFlow))}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="wallet-history"
          ref={walletHistoryRef}
          className="relative overflow-hidden rounded-[26px] border border-white/60 bg-gradient-to-b from-white via-slate-50/40 to-white p-4 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.14)] ring-1 ring-slate-200/40 backdrop-blur-md md:p-5"
        >
          <div className="pointer-events-none absolute -right-20 top-0 h-40 w-40 rounded-full bg-blue-500/[0.06] blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-lg font-bold tracking-tight text-slate-950">Wallet ledger</h3>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:justify-end">
              <button
                type="button"
                onClick={() => exportWalletReport("investor")}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200/80 hover:bg-white hover:shadow-md"
              >
                <Download className="h-3.5 w-3.5 text-blue-600" />
                Deposits
              </button>
              <button
                type="button"
                onClick={() => exportWalletReport("wallet")}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200/80 hover:bg-white hover:shadow-md"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600" />
                Wallet CSV
              </button>
              <button
                type="button"
                onClick={() => exportWalletReport("loan")}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200/80 hover:bg-white hover:shadow-md"
              >
                <Landmark className="h-3.5 w-3.5 text-blue-600" />
                Disbursements
              </button>
              <button
                type="button"
                onClick={() => exportWalletReport("emi")}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200/80 hover:bg-white hover:shadow-md"
              >
                <PiggyBank className="h-3.5 w-3.5 text-blue-600" />
                EMI CSV
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {[
              {
                key: "type",
                label: "Type",
                control: (
                  <select
                    value={txFilterType}
                    onChange={(e) => setTxFilterType(e.target.value)}
                    className="wallet-filter-control"
                  >
                    <option value="all">All types</option>
                    <option value={WALLET_LEDGER_TYPES.INVESTOR_DEPOSIT}>Investor deposit</option>
                    <option value={WALLET_LEDGER_TYPES.LOAN_DISBURSEMENT}>Loan disbursement</option>
                    <option value={WALLET_LEDGER_TYPES.EMI_COLLECTION}>EMI collection</option>
                    <option value={WALLET_LEDGER_TYPES.OFFICE_INCOME}>Office income</option>
                    <option value={WALLET_LEDGER_TYPES.EXPENSE}>Office expense</option>
                    <option value={WALLET_LEDGER_TYPES.SALARY_PAYMENT}>Salary payment</option>
                    <option value={WALLET_LEDGER_TYPES.MANUAL}>Manual adjustment</option>
                  </select>
                ),
              },
              {
                key: "from",
                label: "From date",
                control: (
                  <input
                    type="date"
                    value={txDateFrom}
                    onChange={(e) => setTxDateFrom(e.target.value)}
                    className="wallet-filter-control"
                  />
                ),
              },
              {
                key: "to",
                label: "To date",
                control: (
                  <input
                    type="date"
                    value={txDateTo}
                    onChange={(e) => setTxDateTo(e.target.value)}
                    className="wallet-filter-control"
                  />
                ),
              },
              {
                key: "person",
                label: "Person",
                labelTitle: "Person / investor / customer",
                control: (
                  <input
                    type="search"
                    value={txPersonFilter}
                    onChange={(e) => setTxPersonFilter(e.target.value)}
                    placeholder="Name contains…"
                    className="wallet-filter-control"
                  />
                ),
              },
              {
                key: "min",
                label: "Min (Rs)",
                labelTitle: "Min amount (Rs)",
                control: (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={txAmountMin}
                    onChange={(e) => setTxAmountMin(e.target.value.replace(/[^\d]/g, ""))}
                    className="wallet-filter-control"
                  />
                ),
              },
              {
                key: "max",
                label: "Max (Rs)",
                labelTitle: "Max amount (Rs)",
                control: (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={txAmountMax}
                    onChange={(e) => setTxAmountMax(e.target.value.replace(/[^\d]/g, ""))}
                    className="wallet-filter-control"
                  />
                ),
              },
              {
                key: "search",
                label: "Remarks / ref",
                labelTitle: "Search remarks / ref",
                control: (
                  <input
                    type="search"
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                    placeholder="Global text…"
                    className="wallet-filter-control"
                  />
                ),
              },
            ].map((field) => (
              <label key={field.key} className="wallet-filter-field">
                <span className="wallet-filter-label" title={field.labelTitle || field.label}>
                  {field.label}
                </span>
                {field.control}
              </label>
            ))}
          </div>

          <div className="relative mt-5 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/95 shadow-inner backdrop-blur-sm">
            <table className="min-w-[960px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="sticky top-0 z-[1] border-b border-slate-200/80 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-wide text-slate-600 backdrop-blur-sm">
                  <th className="px-3 py-2.5">Date and time</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Person</th>
                  <th className="px-3 py-2.5">Reference</th>
                  <th className="px-3 py-2.5 text-right">Credit (+)</th>
                  <th className="px-3 py-2.5 text-right">Debit (−)</th>
                  <th className="px-3 py-2.5 text-right">Balance after</th>
                  <th className="px-3 py-2.5">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filteredWalletTimeline.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                      No transactions match your filters. Record an investor deposit or approve a collection to see history.
                    </td>
                  </tr>
                ) : (
                  filteredWalletTimeline.map((row) => {
                    const isEmi = row.ledgerType === WALLET_LEDGER_TYPES.EMI_COLLECTION;
                    const isCredit = row.credit > 0;
                    const rowTone = isEmi
                      ? "bg-sky-50/70 text-sky-950"
                      : isCredit
                        ? "bg-emerald-50/50 text-emerald-950"
                        : "bg-rose-50/40 text-rose-950";
                    return (
                      <tr key={row.id} className={`border-b border-slate-100 ${rowTone}`}>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs font-medium">{row.atLabel}</td>
                        <td className="px-3 py-2.5 text-xs">{row.label}</td>
                        <td className="px-3 py-2.5 text-xs">{row.personName}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{row.referenceId}</td>
                        <td className="px-3 py-2.5 text-right text-xs font-semibold text-emerald-800">
                          {row.credit ? `+ ${formatCurrency(row.credit)}` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs font-semibold text-rose-800">
                          {row.debit ? `− ${formatCurrency(row.debit)}` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs font-bold text-slate-900">{formatCurrency(Math.round(row.balanceAfter))}</td>
                        <td className="max-w-[220px] px-3 py-2.5 text-xs text-slate-700">
                          <span className="line-clamp-2">{row.remarks || "—"}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="dash-glass-panel relative overflow-hidden rounded-[22px] p-4">
            <div className="pointer-events-none absolute -left-16 bottom-0 h-32 w-32 rounded-full bg-blue-500/[0.05] blur-2xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <DashSectionLabel>Active book</DashSectionLabel>
                <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-950">By customer</h3>
              </div>
              <Link
                to="/dashboard/customer"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-md"
              >
                Customers
                <ArrowRight className="h-3.5 w-3.5 text-blue-600" />
              </Link>
            </div>

            <div className="relative mt-3 space-y-2">
              {metrics.customerTracking.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500 backdrop-blur-sm">
                  No active loan records available for tracking.
                </div>
              ) : (
                metrics.customerTracking.map((customer) => (
                  <div
                    key={customer.customerId}
                    className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/95 to-slate-50/80 p-3 shadow-sm ring-1 ring-slate-200/30 backdrop-blur-sm transition hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{customer.customerName || customer.customerId}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {customer.selectedDay || "No centre"} | Due {formatDate(customer.dueDate)}
                        </p>
                      </div>
                      <span className="rounded-full border border-blue-100 bg-blue-50/90 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-blue-800 ring-1 ring-blue-100/80">
                        {customer.progress}%
                      </span>
                    </div>

                    <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500"
                        style={{ width: `${customer.progress}%` }}
                      />
                    </div>

                    <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-slate-500">Collected</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(customer.collected)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Target</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(customer.target)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Balance</p>
                        <p className="mt-1 text-sm font-semibold text-amber-700">{formatCurrency(customer.balance)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid gap-3">
            <div className="dash-glass-panel relative overflow-hidden rounded-[22px] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-600/20">
                  <CalendarClock className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <DashSectionLabel>Upcoming EMI</DashSectionLabel>
                  <h3 className="mt-0.5 text-base font-bold tracking-tight text-slate-950">First EMI starts</h3>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {metrics.firstEmiOverview.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200/80 bg-white/70 px-4 py-5 text-xs text-slate-500 backdrop-blur-sm">
                    First EMI dates appear when loans are created.
                  </p>
                ) : (
                  metrics.firstEmiOverview.map((customer) => (
                    <div
                      key={customer.customerId}
                      className="rounded-xl border border-white/80 bg-white/90 px-3 py-2 shadow-sm ring-1 ring-slate-200/25 backdrop-blur-sm transition hover:shadow-md"
                    >
                      <p className="text-sm font-semibold text-slate-950">{customer.customerName || customer.customerId}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        First EMI on {formatDate(customer.firstEmiDate)} | {customer.collectionFrequency || "Weekly"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="dash-glass-panel relative overflow-hidden rounded-[22px] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/25">
                  <Clock3 className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <DashSectionLabel>Due soon</DashSectionLabel>
                  <h3 className="mt-0.5 text-base font-bold tracking-tight text-slate-950">Next 7 days</h3>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {metrics.dueSoonCustomers.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200/80 bg-white/70 px-4 py-5 text-xs text-slate-500 backdrop-blur-sm">
                    Nothing due in the next week.
                  </p>
                ) : (
                  metrics.dueSoonCustomers.map((customer) => (
                    <div
                      key={customer.customerId}
                      className="rounded-xl border border-white/80 bg-white/90 px-3 py-2 shadow-sm ring-1 ring-slate-200/25 backdrop-blur-sm transition hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{customer.customerName || customer.customerId}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Due {formatDate(customer.dueDate)} | Balance {formatCurrency(customer.balance)}
                          </p>
                        </div>
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          {customer.diffDays === 0 ? "Today" : `${customer.diffDays} day${customer.diffDays === 1 ? "" : "s"}`}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="dash-glass-panel relative overflow-hidden rounded-[22px] p-4 ring-1 ring-rose-100/40">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-rose-400/[0.08] blur-2xl" />
            <div className="relative flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-md shadow-rose-500/25">
                <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <DashSectionLabel className="text-rose-600">Alerts</DashSectionLabel>
                <h3 className="mt-0.5 text-base font-bold tracking-tight text-slate-950">Overdue</h3>
              </div>
            </div>

            <div className="relative mt-3 space-y-2">
              {metrics.overdueCustomers.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200/80 bg-white/70 px-4 py-5 text-xs text-slate-500 backdrop-blur-sm">
                  No overdue loans.
                </p>
              ) : (
                metrics.overdueCustomers.map((customer) => (
                  <div
                    key={customer.customerId}
                    className="rounded-xl border border-rose-200/60 bg-gradient-to-br from-rose-50/95 to-white/90 px-3 py-2 shadow-sm backdrop-blur-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-rose-950">{customer.customerName || customer.customerId}</p>
                        <p className="mt-1 text-xs text-rose-700">
                          Due {formatDate(customer.dueDate)} | Pending {formatCurrency(customer.balance)}
                        </p>
                      </div>
                      <span className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-700">
                        {customer.overdueDays} day{customer.overdueDays === 1 ? "" : "s"} late
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="dash-glass-panel relative overflow-hidden rounded-[22px] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-md">
                <Layers3 className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <DashSectionLabel>Live feed</DashSectionLabel>
                <h3 className="mt-0.5 text-base font-bold tracking-tight text-slate-950">Latest updates</h3>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {metrics.recentActivity.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200/80 bg-white/70 px-4 py-5 text-xs text-slate-500 backdrop-blur-sm">
                  Activity appears after collections and updates.
                </p>
              ) : (
                metrics.recentActivity.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-white/80 bg-white/90 px-3 py-2 shadow-sm ring-1 ring-slate-200/25 backdrop-blur-sm transition hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${item.tone}`}>
                        {formatDate(item.date)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {investorOpen ? (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/45 p-4 sm:items-center">
            <button
              type="button"
              aria-label="Close"
              disabled={invSaving}
              className="absolute inset-0 cursor-default"
              onClick={() => !invSaving && setInvestorOpen(false)}
            />
            <div className="relative z-[101] w-full max-w-lg overflow-hidden rounded-3xl border border-white/70 bg-gradient-to-b from-white via-white to-slate-50/95 p-5 shadow-2xl ring-1 ring-slate-200/50 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <DashSectionLabel>Investor deposit</DashSectionLabel>
                  <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-950">Record capital</h3>
                  <p className="mt-1 text-[11px] text-slate-500">Updates wallet and ledger.</p>
                </div>
                <button
                  type="button"
                  disabled={invSaving}
                  onClick={() => setInvestorOpen(false)}
                  className="rounded-xl border border-slate-200/80 bg-white/80 p-2 text-slate-600 shadow-sm transition hover:bg-slate-50"
                  aria-label="Close dialog"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
                  Investor name
                  <input
                    value={invName}
                    onChange={(e) => setInvName(e.target.value)}
                    className="app-input mt-1 h-10 w-full text-sm"
                    placeholder="e.g. Ruthra Capital"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Deposit amount (Rs)
                  <input
                    value={invAmount}
                    onChange={(e) => setInvAmount(e.target.value)}
                    className="app-input mt-1 h-10 w-full text-sm"
                    inputMode="decimal"
                    placeholder="500000"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Deposit date
                  <input
                    type="date"
                    value={invDate}
                    onChange={(e) => setInvDate(e.target.value)}
                    className="app-input mt-1 h-10 w-full text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
                  Payment method
                  <select
                    value={invMethod}
                    onChange={(e) => setInvMethod(e.target.value)}
                    className="app-input mt-1 h-10 w-full text-sm"
                  >
                    <option>Bank transfer</option>
                    <option>UPI</option>
                    <option>Cash</option>
                    <option>Cheque</option>
                    <option>Other</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
                  Reference number
                  <input
                    value={invRef}
                    onChange={(e) => setInvRef(e.target.value)}
                    className="app-input mt-1 h-10 w-full text-sm"
                    placeholder="UTR / cheque no."
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
                  Notes
                  <textarea
                    value={invNotes}
                    onChange={(e) => setInvNotes(e.target.value)}
                    className="app-input mt-1 min-h-[72px] w-full resize-y text-sm"
                    placeholder="Optional context for audit"
                  />
                </label>
              </div>
              {invError ? <p className="mt-3 text-sm text-rose-600">{invError}</p> : null}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={invSaving}
                  onClick={() => setInvestorOpen(false)}
                  className="app-button-secondary rounded-xl px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={invSaving}
                  onClick={handleSaveInvestorDeposit}
                  className="app-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                >
                  {invSaving ? "Saving…" : "Save deposit"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-[26px] border border-slate-200/60 bg-gradient-to-b from-slate-50/90 to-white px-4 py-10 text-sm text-slate-500 shadow-sm backdrop-blur-sm">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              Loading dashboard…
            </span>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[22px] border border-rose-200/80 bg-rose-50/90 px-4 py-4 text-sm text-rose-800 shadow-sm backdrop-blur-sm">
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="grid gap-2 md:grid-cols-3">
            <Link
              to="/dashboard/collection?tab=approvals"
              className="group flex items-center justify-between gap-2 rounded-2xl border border-white/70 bg-gradient-to-br from-white to-slate-50/90 px-3 py-2.5 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200/40 backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200/80 hover:shadow-md md:px-4 md:py-3 md:text-sm"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-200/50">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span className="truncate">Collection approvals</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-blue-600 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
            </Link>
            <Link
              to="/dashboard/customer"
              className="group flex items-center justify-between gap-2 rounded-2xl border border-white/70 bg-gradient-to-br from-white to-slate-50/90 px-3 py-2.5 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200/40 backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200/80 hover:shadow-md md:px-4 md:py-3 md:text-sm"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-700 ring-1 ring-blue-200/50">
                  <UsersRound className="h-4 w-4" />
                </span>
                <span className="truncate">Customer list</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-blue-600 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
            </Link>
            <Link
              to="/dashboard/image-details"
              className="group flex items-center justify-between gap-2 rounded-2xl border border-white/70 bg-gradient-to-br from-white to-slate-50/90 px-3 py-2.5 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200/40 backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200/80 hover:shadow-md md:px-4 md:py-3 md:text-sm"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 ring-1 ring-violet-200/50">
                  <IndianRupee className="h-4 w-4" />
                </span>
                <span className="truncate">Center sheet</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-blue-600 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
            </Link>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
