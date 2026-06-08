import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DollarSign, PlusCircle, X } from "lucide-react";

function formatDate(date) {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function formatTime(date) {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatPendingAmount(value) {
  const amount = Math.max(Number(value || 0), 0);
  return amount > 0 ? `₹${amount.toLocaleString("en-IN")}` : "—";
}

export default function EmployeeCustomerEntryModal({
  customer,
  defaultCollectorName = "",
  pendingAmount = 0,
  pendingLabel = "—",
  onClose,
  onSave,
}) {
  const now = useMemo(() => new Date(), []);
  const collectionDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [collectionStatus, setCollectionStatus] = useState("Collected");
  const [collectorName, setCollectorName] = useState(defaultCollectorName);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const pendingDisplay = useMemo(() => {
    const due = Number(pendingAmount || 0);
    const collected = Number(amount || 0);
    if (amount && due > 0) {
      return formatPendingAmount(due - collected);
    }
    return pendingLabel || formatPendingAmount(due);
  }, [amount, pendingAmount, pendingLabel]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!amount) {
      setError("Enter amount");
      return;
    }

    setSaving(true);
    try {
      await onSave({ amount, note, paymentMethod, collectionStatus, collectionDate, collectorName });
      onClose();
    } catch (err) {
      setError(err.message || "Unable to save");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-entry-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Customer Entry</p>
              <h3 id="customer-entry-modal-title" className="truncate text-lg font-semibold text-slate-900">
                {customer?.customerName}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Close customer entry form"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
              <p className="text-xs text-slate-500">Date</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(now)}</p>
            </div>
            <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
              <p className="text-xs text-slate-500">Time</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{formatTime(now)}</p>
            </div>
          </div>

          <form className="grid gap-4" onSubmit={handleSubmit}>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Amount collected</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
                placeholder="Enter amount"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Pending</span>
              <input
                value={pendingDisplay}
                readOnly
                className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 outline-none"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Collector name</span>
              <input
                value={collectorName}
                onChange={(event) => setCollectorName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
                placeholder="Optional collector name"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Note <span className="text-slate-400">(optional)</span>
              </span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
                placeholder="Optional note"
              />
            </label>
            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
            >
              <PlusCircle className="h-4 w-4" />
              {saving ? "Saving..." : "Save Entry"}
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
