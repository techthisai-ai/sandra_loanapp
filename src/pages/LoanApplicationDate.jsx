import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  DollarSign,
  Send,
  UsersRound,
} from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import { getLoanSettings } from "../services/userAuth";
import { calculateLoanValues, findLoanPreset, formatPresetLabel } from "../utils/loanCalculation";

const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatCurrentDate(date) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatCurrentTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function readDraftFromStorage() {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem("loanApplicationDraft");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toNumber(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatCurrency(value) {
  return `Rs ${toNumber(value).toLocaleString("en-IN")}`;
}

function getPresetLabel(preset) {
  return formatPresetLabel(preset);
}

export default function LoanApplicationDate() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentMoment = useMemo(() => new Date(), []);
  const [draft] = useState(() => location.state?.customerDraft ?? readDraftFromStorage());
  const [loanAmount, setLoanAmount] = useState(draft?.loanAmount ?? "");
  const [loanWeeks, setLoanWeeks] = useState(draft?.loanWeeks ?? 20);
  const [selectedDay, setSelectedDay] = useState(
    draft?.selectedDay || weekDays[currentMoment.getDay() === 0 ? 6 : currentMoment.getDay() - 1]
  );
  const [loanSettings, setLoanSettings] = useState({ loanPresets: [] });
  const [selectedPresetId, setSelectedPresetId] = useState(draft?.loanPresetId || "");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!draft) {
      navigate("/dashboard/loan-applications", { replace: true });
    }
  }, [draft, navigate]);

  useEffect(() => {
    let active = true;

    getLoanSettings()
      .then((settings) => {
        if (!active) return;

        const presets = Array.isArray(settings?.loanPresets) ? settings.loanPresets : [];
        setLoanSettings({ ...(settings || {}), loanPresets: presets });

        if ((draft?.loanAmount || draft?.loanWeeks || draft?.loanPresetId) || presets.length === 0) {
          return;
        }

        const initialPreset = presets[0];
        setSelectedPresetId(initialPreset.id || "");
        setLoanAmount(String(initialPreset.loanAmount || ""));
        setLoanWeeks(initialPreset.loanWeeks || 20);
      })
      .catch(() => {
        if (active) setLoanSettings({ loanPresets: [] });
      });

    return () => {
      active = false;
    };
  }, [draft]);

  const selectedPreset = loanSettings.loanPresets.find((item) => item.id === selectedPresetId) || null;
  const matchedPreset = findLoanPreset(loanSettings.loanPresets, loanAmount, loanWeeks);
  const activePreset = selectedPreset || matchedPreset;
  const calculatedLoan = calculateLoanValues({
    loanAmount,
    loanWeeks,
    preset: activePreset,
  });

  const weeklyDue = calculatedLoan.emiAmount;
  const totalPayable = calculatedLoan.totalPayable;
  const interestAmount = calculatedLoan.interestAmount;

  const handleNext = (event) => {
    event.preventDefault();

    if (!loanAmount || !loanWeeks) {
      setError("Please enter the loan amount and select the weekly tenure");
      return;
    }

    const nextDraft = {
      ...draft,
      loanAmount,
      loanWeeks,
      loanPresetId: selectedPresetId,
      loanPresetLabel: activePreset ? getPresetLabel(activePreset) : "",
      loanPresetLoanAmount: toNumber(activePreset?.loanAmount),
      loanPresetLoanWeeks: toNumber(activePreset?.loanWeeks),
      loanPresetEmiAmount: toNumber(activePreset?.emiAmount),
      loanPresetInterestAmount: toNumber(activePreset?.interestAmount),
      loanPresetTotalPayable: toNumber(activePreset?.totalPayable),
      selectedDay,
      weeklyDue,
      totalPayable,
      interestAmount,
    };

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("loanApplicationDraft", JSON.stringify(nextDraft));
    }

    navigate("/dashboard/loan-applications/review", {
      state: { customerDraft: nextDraft },
    });
  };

  return (
    <AdminLayout
      title="Loan application"
      description="Step 2 of 3. Choose a repayment preset or enter custom values, then continue."
    >
      <div className="grid w-full max-w-6xl gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Step 2</p>
              <h3 className="text-xl font-semibold tracking-tight text-slate-900">Amount and tenure</h3>
            </div>
          </div>

          <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
              <CalendarDays className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Today</p>
                <p className="text-sm font-medium text-slate-900">{formatCurrentDate(currentMoment)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
              <Clock3 className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Time</p>
                <p className="text-sm font-medium text-slate-900">{formatCurrentTime(currentMoment)}</p>
              </div>
            </div>
          </div>

          <form className="mt-6 grid gap-4" onSubmit={handleNext}>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Repayment preset</span>
              <select
                value={selectedPresetId}
                onChange={(event) => {
                  const nextPresetId = event.target.value;
                  setSelectedPresetId(nextPresetId);
                  const nextPreset = loanSettings.loanPresets.find((item) => item.id === nextPresetId);
                  if (nextPreset) {
                    setLoanAmount(String(nextPreset.loanAmount || ""));
                    setLoanWeeks(Number(nextPreset.loanWeeks || 0) || 20);
                    setError("");
                  }
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
              >
                <option value="">Custom preset</option>
                {loanSettings.loanPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {getPresetLabel(preset)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Select a saved preset from Settings, or keep custom values.
              </p>
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <DollarSign className="h-4 w-4 text-blue-600" />
                Loan amount
              </span>
              <input
                value={loanAmount}
                onChange={(event) => {
                  setSelectedPresetId("");
                  setLoanAmount(event.target.value);
                }}
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                placeholder="Enter loan amount"
              />
            </label>

            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Tenure (weeks)</span>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-7 lg:grid-cols-10">
                {Array.from({ length: 50 }, (_, index) => index + 1).map((week) => (
                  <button
                    key={week}
                    type="button"
                    onClick={() => {
                      setSelectedPresetId("");
                      setLoanWeeks(week);
                    }}
                    className={`rounded-xl border px-0 py-2 text-sm font-medium transition ${
                      Number(loanWeeks) === week
                        ? "border-blue-200 bg-blue-50 text-slate-900"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {week}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">EMI amount</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{formatCurrency(weeklyDue)}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total payable</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{formatCurrency(totalPayable)}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Interest amount</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{formatCurrency(interestAmount)}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Selected preset</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{selectedPreset ? getPresetLabel(selectedPreset) : "Custom preset"}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700">Select collection day</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {weekDays.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      selectedDay === day
                        ? "border-blue-200 bg-blue-50 text-slate-900"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate("/dashboard/loan-applications")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Next step
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Summary</p>
          <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <UsersRound className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">{draft?.customerName}</p>
                <p className="text-sm text-slate-600">{draft?.mobileNumber}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600">
            This step prepares the loan amount, weekly count, preset selection, and date before the final application screen.
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current draft</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>{draft?.identityType || "Identity"}</p>
              <p>{draft?.identityNumber || "Card number"}</p>
              <p>{draft?.address || "Address"}</p>
            </div>
          </div>
        </aside>
      </div>
    </AdminLayout>
  );
}
