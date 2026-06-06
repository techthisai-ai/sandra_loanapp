import { useEffect, useRef, useState } from "react";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `Rs ${amount.toLocaleString("en-IN")}`;
}

const ACCENT_GRADIENT = {
  wallet: "dash-kpi-accent-wallet",
  emerald: "dash-kpi-accent-emerald",
  loan: "dash-kpi-accent-loan",
  violet: "dash-kpi-accent-loan",
  sky: "dash-kpi-accent-sky",
  cyan: "dash-kpi-accent-cyan",
  amber: "dash-kpi-accent-amber",
  pending: "dash-kpi-accent-pending",
  rose: "dash-kpi-accent-rose",
  slate: "dash-kpi-accent-slate",
};

const ACCENT_RING = {
  wallet:
    "border-emerald-300/45 shadow-[0_10px_40px_-14px_rgba(16,185,129,0.38)] hover:shadow-[0_18px_52px_-14px_rgba(14,165,233,0.42)] hover:ring-2 hover:ring-emerald-400/30",
  emerald:
    "border-emerald-300/40 shadow-[0_10px_40px_-14px_rgba(16,185,129,0.4)] hover:shadow-[0_16px_48px_-16px_rgba(16,185,129,0.5)] hover:ring-2 hover:ring-emerald-400/25",
  loan:
    "border-violet-300/40 shadow-[0_10px_40px_-14px_rgba(139,92,246,0.32)] hover:shadow-[0_18px_52px_-14px_rgba(59,130,246,0.38)] hover:ring-2 hover:ring-violet-400/25",
  violet:
    "border-violet-300/40 shadow-[0_10px_40px_-14px_rgba(139,92,246,0.32)] hover:shadow-[0_18px_52px_-14px_rgba(59,130,246,0.38)] hover:ring-2 hover:ring-violet-400/25",
  sky:
    "border-sky-300/40 shadow-[0_10px_40px_-14px_rgba(14,165,233,0.32)] hover:shadow-[0_16px_48px_-16px_rgba(14,165,233,0.42)] hover:ring-2 hover:ring-sky-400/25",
  cyan:
    "border-cyan-300/40 shadow-[0_10px_40px_-14px_rgba(6,182,212,0.32)] hover:shadow-[0_16px_48px_-16px_rgba(6,182,212,0.42)] hover:ring-2 hover:ring-cyan-400/25",
  amber:
    "border-amber-300/40 shadow-[0_10px_40px_-14px_rgba(245,158,11,0.32)] hover:shadow-[0_16px_48px_-16px_rgba(245,158,11,0.42)] hover:ring-2 hover:ring-amber-400/25",
  pending:
    "border-orange-300/40 shadow-[0_10px_40px_-14px_rgba(249,115,22,0.3)] hover:shadow-[0_18px_52px_-14px_rgba(239,68,68,0.35)] hover:ring-2 hover:ring-orange-400/25",
  rose:
    "border-rose-300/35 shadow-[0_10px_40px_-14px_rgba(244,63,94,0.28)] hover:shadow-[0_16px_48px_-16px_rgba(244,63,94,0.38)] hover:ring-2 hover:ring-rose-400/20",
  slate:
    "border-slate-200/70 shadow-[0_10px_36px_-18px_rgba(15,23,42,0.14)] hover:shadow-[0_18px_44px_-18px_rgba(37,99,235,0.22)] hover:ring-2 hover:ring-blue-400/15",
};

export default function PremiumKpiCard({
  icon: Icon,
  label,
  amount,
  sub,
  accent = "slate",
  amountTone = "neutral",
  healthLine,
  trendUp,
}) {
  const target = Math.round(Number(amount) || 0);
  const displayRef = useRef(target);
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    const from = displayRef.current;
    let raf;
    const start = performance.now();
    const duration = 420;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      const next = Math.round(from + (target - from) * eased);
      setDisplay(next);
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        displayRef.current = target;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const value = formatCurrency(display);
  const toneCls =
    amountTone === "positive"
      ? "text-emerald-700"
      : amountTone === "negative"
        ? "text-rose-700"
        : amountTone === "warning"
          ? "text-amber-700"
          : amountTone === "info"
            ? "text-sky-700"
            : "text-slate-950";

  const accentKey = accent in ACCENT_GRADIENT ? accent : "slate";
  const gradientCls = ACCENT_GRADIENT[accentKey];
  const accentRing = ACCENT_RING[accentKey] || ACCENT_RING.slate;

  const TrendEl = trendUp === false ? TrendingDown : trendUp === true ? TrendingUp : ArrowRight;
  const trendColor =
    trendUp === false ? "text-rose-500" : trendUp === true ? "text-emerald-500" : "text-slate-300";

  return (
    <div
      className={`dash-stat-card group relative min-w-0 overflow-hidden rounded-2xl border p-3 shadow-sm backdrop-blur-md transition-all duration-300 ease ${gradientCls} ${accentRing}`}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-all duration-300 ease group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(135deg, rgba(59,130,246,0.12) 0%, transparent 42%, rgba(6,182,212,0.08) 100%)",
        }}
      />
      <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br from-blue-500/[0.14] to-cyan-400/[0.07] blur-2xl transition-all duration-300 ease group-hover:from-blue-500/[0.22]" />
      <div className="relative flex items-start gap-2.5 sm:gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-600 text-white shadow-md ring-1 ring-white/25 transition-all duration-300 ease group-hover:scale-[1.04] sm:h-10 sm:w-10">
          <Icon className="h-[17px] w-[17px] sm:h-[18px] sm:w-[18px]" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">{label}</p>
            <TrendEl className={`h-3.5 w-3.5 shrink-0 opacity-75 transition-all duration-300 ease group-hover:opacity-100 ${trendColor}`} strokeWidth={2} />
          </div>
          <p className={`mt-0.5 font-mono text-[1.28rem] font-bold leading-none tracking-tight sm:text-xl md:text-[1.55rem] ${toneCls}`}>
            {value}
          </p>
          {sub ? <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-600 sm:text-[11px]">{sub}</p> : null}
          {healthLine ? (
            <p className="mt-1.5 truncate rounded-lg bg-slate-900/[0.04] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200/50">
              {healthLine}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
