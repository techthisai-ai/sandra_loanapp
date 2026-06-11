import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";
import CustomerDetailLink from "../customer/CustomerDetailLink";

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function ApprovalStatusBadge({ approvalStatus }) {
  const status = String(approvalStatus || "pending").toLowerCase();
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/90 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 shadow-sm">
        <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
        Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200/90 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-800 shadow-sm">
        <XCircle className="h-3 w-3 shrink-0" aria-hidden />
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/90 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-900 shadow-sm">
      <Clock3 className="h-3 w-3 shrink-0" aria-hidden />
      Pending
    </span>
  );
}

function CollectionStatusBadge({ collectionStatus }) {
  const status = String(collectionStatus || "Pending");
  const tone =
    status === "Partially Paid" || status === "Partial Payment"
      ? "border-blue-200/90 bg-blue-50 text-blue-800"
      : status === "Collected"
        ? "border-emerald-200/90 bg-emerald-50 text-emerald-800"
        : status === "Skipped"
          ? "border-rose-200/90 bg-rose-50 text-rose-800"
          : status === "Rescheduled"
            ? "border-indigo-200/90 bg-indigo-50 text-indigo-800"
            : "border-slate-200/90 bg-slate-50 text-slate-700";
  const label =
    status === "Partial Payment" ? "Partially Paid" : status;
  return (
    <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold shadow-sm ${tone}`}>
      <span className="truncate">{label}</span>
    </span>
  );
}

const PremiumCheckbox = forwardRef(function PremiumCheckbox(
  { checked, indeterminate, disabled, onChange, ariaLabel },
  forwardedRef
) {
  return (
    <input
      ref={(el) => {
        if (typeof forwardedRef === "function") forwardedRef(el);
        else if (forwardedRef) forwardedRef.current = el;
        if (el) el.indeterminate = Boolean(indeterminate);
      }}
      type="checkbox"
      className="h-[18px] w-[18px] cursor-pointer rounded-md border-2 border-slate-300 bg-white text-blue-600 shadow-sm transition hover:border-blue-400 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={ariaLabel}
    />
  );
});

/**
 * Premium collection approval table with select-all, bulk actions, and status badges.
 */
export default function CollectionApprovalTable({
  rows = [],
  loading = false,
  savingId = "",
  bulkProcessing = false,
  onApprove,
  onReject,
  onBulkApprove,
  onBulkReject,
  showRemarksColumn = true,
  enableBulkSelect = true,
  emptyMessage = "No rows match the selected filters.",
}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const selectAllRef = useRef(null);

  const selectableRows = useMemo(
    () => rows.filter((row) => row.approvalStatus !== "approved" && row.approvalStatus !== "rejected"),
    [rows]
  );

  const selectableIdSet = useMemo(() => new Set(selectableRows.map((row) => row.entryId)), [selectableRows]);

  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    selectableRows.length > 0 && selectableRows.every((row) => selectedIds.has(row.entryId));
  const someVisibleSelected = selectableRows.some((row) => selectedIds.has(row.entryId));

  useEffect(() => {
    setSelectedIds(new Set());
  }, [rows]);

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  const actionsDisabled = Boolean(savingId) || bulkProcessing;

  const toggleRowSelection = (entryId) => {
    if (!selectableIdSet.has(entryId) || actionsDisabled) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const handleSelectAllVisible = (checked) => {
    if (actionsDisabled) return;
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(selectableRows.map((row) => row.entryId)));
  };

  const clearSelection = () => {
    if (actionsDisabled) return;
    setSelectedIds(new Set());
  };

  const runBulkApprove = async () => {
    const ids = [...selectedIds];
    if (!ids.length || actionsDisabled) return;
    setApproveModalOpen(false);
    await onBulkApprove?.(ids);
    setSelectedIds(new Set());
  };

  const runBulkReject = async () => {
    const ids = [...selectedIds];
    if (!ids.length || actionsDisabled) return;
    await onBulkReject?.(ids, rejectNote);
    setRejectModalOpen(false);
    setRejectNote("");
    setSelectedIds(new Set());
  };

  const colSpan = (showRemarksColumn ? 13 : 12) - (enableBulkSelect ? 0 : 1);
  const tableWidth = (showRemarksColumn ? 1584 : 1464) - (enableBulkSelect ? 0 : 48);

  return (
    <>
      {enableBulkSelect && selectedCount > 0 ? (
        <div
          className="sticky top-0 z-20 mb-4 flex flex-col gap-3 rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50/95 via-white to-slate-50/95 p-3 shadow-lg shadow-blue-900/5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between"
          role="region"
          aria-label="Bulk actions"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-blue-600 px-2 text-sm font-bold text-white shadow-sm">
              {selectedCount}
            </span>
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-slate-950">
                {selectedCount} payment{selectedCount === 1 ? "" : "s"} selected
              </span>
              <span className="hidden sm:inline text-slate-500"> · visible pending rows only</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => setApproveModalOpen(true)}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-md transition hover:brightness-105 disabled:opacity-50 sm:flex-none"
            >
              {bulkProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Approve Selected
            </button>
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => setRejectModalOpen(true)}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 disabled:opacity-50 sm:flex-none"
            >
              <XCircle className="h-4 w-4" />
              Reject Selected
            </button>
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={clearSelection}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <div className="min-w-0 max-w-full overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm [contain:inline-size]">
        <div className="max-h-[min(70vh,720px)] overflow-x-auto overflow-y-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]">
          <table
            className="table-fixed border-collapse text-left"
            style={{ minWidth: `${tableWidth}px`, width: `${tableWidth}px` }}
          >
            <colgroup>
              {enableBulkSelect ? <col className="w-[48px]" /> : null}
              <col className="w-[140px]" />
              <col className="w-[190px]" />
              <col className="w-[140px]" />
              <col className="w-[76px]" />
              <col className="w-[96px]" />
              <col className="w-[96px]" />
              <col className="w-[104px]" />
              <col className="w-[80px]" />
              <col className="w-[110px]" />
              <col className="w-[108px]" />
              <col className="w-[108px]" />
              {showRemarksColumn ? <col className="w-[120px]" /> : null}
              <col className="w-[168px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm">
              <tr>
                {enableBulkSelect ? (
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center">
                    <PremiumCheckbox
                      ref={selectAllRef}
                      checked={allVisibleSelected}
                      indeterminate={someVisibleSelected && !allVisibleSelected}
                      disabled={!selectableRows.length || actionsDisabled}
                      onChange={(e) => handleSelectAllVisible(e.target.checked)}
                      ariaLabel="Select all visible pending payments"
                    />
                  </th>
                ) : null}
                <th className="border-b border-r border-slate-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Customer
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Customer ID
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Center
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Type
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Due
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Collected
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Amount
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Payment
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Collector
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Collection
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Approval
                </th>
                {showRemarksColumn ? (
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Remarks
                  </th>
                ) : null}
                <th className="border-b border-slate-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-slate-500">
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" />
                    Loading collection data…
                  </td>
                </tr>
              ) : rows.length > 0 ? (
                rows.map((row) => {
                  const isApproved = row.approvalStatus === "approved";
                  const isRejected = row.approvalStatus === "rejected";
                  const isSelectable = selectableIdSet.has(row.entryId);
                  const isSelected = selectedIds.has(row.entryId);
                  return (
                    <tr
                      key={row.entryId}
                      className={`border-t border-slate-100 transition-colors ${
                        enableBulkSelect && isSelected
                          ? "bg-blue-50/80 ring-1 ring-inset ring-blue-300/50"
                          : "even:bg-slate-50/40 hover:bg-slate-50/90"
                      }`}
                    >
                      {enableBulkSelect ? (
                        <td className="border-r border-slate-100 px-3 py-3 text-center align-middle">
                          {isSelectable ? (
                            <PremiumCheckbox
                              checked={isSelected}
                              disabled={actionsDisabled}
                              onChange={() => toggleRowSelection(row.entryId)}
                              ariaLabel={`Select ${row.customerName}`}
                            />
                          ) : (
                            <span className="inline-block h-[18px] w-[18px]" aria-hidden />
                          )}
                        </td>
                      ) : null}
                      <td className="overflow-hidden border-r border-slate-100 px-3 py-3 align-middle text-xs font-semibold text-slate-900">
                        <CustomerDetailLink
                          customerId={row.customerId}
                          className="block truncate font-semibold text-slate-900"
                          title={row.customerName}
                        >
                          {row.customerName}
                        </CustomerDetailLink>
                      </td>
                      <td className="overflow-hidden border-r border-slate-100 px-3 py-3 align-middle text-xs text-slate-700">
                        <span className="block truncate font-mono text-[11px]" title={row.customerId}>
                          {row.customerId}
                        </span>
                      </td>
                      <td className="overflow-hidden border-r border-slate-100 px-3 py-3 align-middle text-xs text-slate-700">
                        <span className="block truncate" title={row.center}>
                          {row.center}
                        </span>
                      </td>
                      <td className="overflow-hidden border-r border-slate-100 px-3 py-3 align-middle text-xs text-slate-700 whitespace-nowrap">
                        {row.collectionFrequency}
                      </td>
                      <td className="overflow-hidden border-r border-slate-100 px-3 py-3 align-middle text-xs text-slate-700 whitespace-nowrap">
                        {row.dueDate}
                      </td>
                      <td className="overflow-hidden border-r border-slate-100 px-3 py-3 align-middle text-xs text-slate-700 whitespace-nowrap">
                        {row.collectionDate}
                      </td>
                      <td className="overflow-hidden border-r border-slate-100 px-3 py-3 align-middle text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {formatCurrency(row.amount)}
                      </td>
                      <td className="overflow-hidden border-r border-slate-100 px-3 py-3 align-middle text-xs text-slate-700 whitespace-nowrap">
                        {row.paymentMethod}
                      </td>
                      <td className="overflow-hidden border-r border-slate-100 px-3 py-3 align-middle text-xs text-slate-700">
                        <span className="block truncate" title={row.collectorName}>
                          {row.collectorName}
                        </span>
                      </td>
                      <td className="overflow-hidden border-r border-slate-100 px-3 py-3 align-middle">
                        <CollectionStatusBadge
                          collectionStatus={row.collectionDisplayStatus || row.collectionStatus}
                        />
                      </td>
                      <td className="overflow-hidden border-r border-slate-100 px-3 py-3 align-middle">
                        <ApprovalStatusBadge approvalStatus={row.approvalStatus} />
                      </td>
                      {showRemarksColumn ? (
                        <td className="overflow-hidden border-r border-slate-100 px-3 py-3 align-middle text-xs text-slate-600">
                          <span className="block truncate" title={row.remarks || ""}>
                            {row.remarks || "—"}
                          </span>
                        </td>
                      ) : null}
                      <td className="overflow-hidden px-3 py-3 align-middle">
                        {!isApproved && !isRejected ? (
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={actionsDisabled || savingId === row.entryId}
                              onClick={() => onReject?.(row.entryId)}
                              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </button>
                            <button
                              type="button"
                              disabled={actionsDisabled || savingId === row.entryId}
                              onClick={() => onApprove?.(row.entryId)}
                              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60"
                            >
                              {savingId === row.entryId ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              {savingId === row.entryId ? "Saving…" : "Approve"}
                            </button>
                          </div>
                        ) : (
                          <p className={`text-[10px] font-medium ${isApproved ? "text-emerald-700" : "text-rose-700"}`}>
                            {isApproved
                              ? `Approved ${formatDate(row.approvedAt)}`
                              : `Rejected ${formatDate(row.rejectedAt)}`}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-slate-500">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {enableBulkSelect && approveModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-semibold text-slate-950">Approve selected payments?</h4>
            <p className="mt-2 text-sm text-slate-600">
              You are about to approve <strong>{selectedCount}</strong> payment{selectedCount === 1 ? "" : "s"}. Already
              approved or rejected entries are skipped automatically.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={bulkProcessing}
                onClick={() => setApproveModalOpen(false)}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkProcessing}
                onClick={runBulkApprove}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {bulkProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {bulkProcessing ? "Approving…" : "Confirm Approve"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {enableBulkSelect && rejectModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-semibold text-slate-950">
              Reject {selectedCount} selected {selectedCount === 1 ? "payment" : "payments"}?
            </h4>
            <p className="mt-1 text-sm text-slate-600">Optional reason is saved on each rejected record.</p>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={4}
              placeholder="Reason for rejection (optional)"
              className="app-input mt-4 w-full resize-y bg-slate-50"
              disabled={bulkProcessing}
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={bulkProcessing}
                onClick={() => {
                  setRejectModalOpen(false);
                  setRejectNote("");
                }}
                className="min-h-[44px] rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkProcessing}
                onClick={runBulkReject}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {bulkProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                {bulkProcessing ? "Rejecting…" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
