import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { pruneAssignedCenters } from "../../utils/employeeManagement";
import { loadLoanCenters } from "../../constants/dayCenters";

/**
 * Builds a tree of main centres → sub centres from the flat option list.
 * Main centres carry group "Day centres"; their sub centres carry group === main label.
 */
function buildCenterTree(centerOptions) {
  const mains = centerOptions.filter((option) => option.group === "Day centres");
  return mains.map((main) => ({
    value: main.value,
    label: main.label,
    subs: centerOptions.filter((option) => option.group === main.label),
  }));
}

export default function AssignCentersModal({
  open,
  employee,
  centerOptions = [],
  saving = false,
  error = "",
  onClose,
  onSubmit,
}) {
  const tree = useMemo(() => buildCenterTree(centerOptions), [centerOptions]);

  const [selected, setSelected] = useState(() => new Set(employee?.assignedCenters || []));
  const [expanded, setExpanded] = useState(() => {
    // Expand any main centre that already has a selected sub (or is itself selected).
    const initial = new Set();
    const preselected = new Set(employee?.assignedCenters || []);
    buildCenterTree(centerOptions).forEach((main) => {
      const hasSelected =
        preselected.has(main.value) || main.subs.some((sub) => preselected.has(sub.value));
      if (hasSelected) initial.add(main.label);
    });
    return initial;
  });
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open || !employee) return;
    const assigned = Array.isArray(employee.assignedCenters) ? employee.assignedCenters : [];
    setSelected(new Set(assigned));
    const initialExpanded = new Set();
    const preselected = new Set(assigned);
    buildCenterTree(centerOptions).forEach((main) => {
      const hasSelected =
        preselected.has(main.value) || main.subs.some((sub) => preselected.has(sub.value));
      if (hasSelected) initialExpanded.add(main.label);
    });
    setExpanded(initialExpanded);
    setLocalError("");
  }, [open, employee?.id, (employee?.assignedCenters || []).join("|"), centerOptions]);

  if (!open) return null;

  const toggleExpand = (label) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const toggleSub = (value) => {
    setLocalError("");
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  // Selecting a main centre auto-selects ALL of its sub centres (and expands it).
  const toggleMain = (main) => {
    setLocalError("");
    if (main.subs.length === 0) {
      // No sub centres → the main centre itself is the assignable unit.
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(main.value)) next.delete(main.value);
        else next.add(main.value);
        return next;
      });
      return;
    }
    const allSelected = main.subs.every((sub) => selected.has(sub.value));
    setSelected((current) => {
      const next = new Set(current);
      main.subs.forEach((sub) => {
        if (allSelected) next.delete(sub.value);
        else next.add(sub.value);
      });
      return next;
    });
    if (!allSelected) {
      setExpanded((current) => new Set(current).add(main.label));
    }
  };

  const mainState = (main) => {
    if (main.subs.length === 0) {
      return { checked: selected.has(main.value), indeterminate: false, count: 0, total: 0 };
    }
    const count = main.subs.filter((sub) => selected.has(sub.value)).length;
    return {
      checked: count === main.subs.length,
      indeterminate: count > 0 && count < main.subs.length,
      count,
      total: main.subs.length,
    };
  };

  const totalSelected = selected.size;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const centers = pruneAssignedCenters(Array.from(selected), loadLoanCenters());
    if (!centers.length) {
      setLocalError("Select at least one center to assign.");
      return;
    }
    await onSubmit(centers);
  };

  const handleClearAll = () => {
    setLocalError("");
    setSelected(new Set());
  };

  const displayError = localError || error;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow)]"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600">Assign centers</p>
            <h3 className="mt-1 truncate text-lg font-semibold text-slate-950">
              {employee?.employeeName || "Employee"}
              {employee?.employeeId ? ` · ${employee.employeeId}` : ""}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Select centres to assign. Uncheck old centres to remove them.
            </p>
            <div className="flex items-center gap-2">
              {totalSelected > 0 ? (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Clear all
                </button>
              ) : null}
              <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                {totalSelected} selected
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6">
            <div className="space-y-2.5">
              {tree.length === 0 ? (
                <p className="text-sm text-slate-500">No centers are available yet.</p>
              ) : (
                tree.map((main) => {
                  const state = mainState(main);
                  const isOpen = expanded.has(main.label);
                  return (
                    <div key={main.label} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => toggleMain(main)}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                            state.checked
                              ? "border-blue-600 bg-blue-600 text-white"
                              : state.indeterminate
                                ? "border-blue-600 bg-blue-100 text-blue-700"
                                : "border-slate-300 bg-white text-transparent hover:border-blue-400"
                          }`}
                          aria-label={`Select all sub centres of ${main.label}`}
                        >
                          {state.checked ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : state.indeterminate ? (
                            <span className="h-0.5 w-2.5 rounded bg-blue-600" />
                          ) : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => (main.subs.length ? toggleExpand(main.label) : toggleMain(main))}
                          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                        >
                          <span className="truncate text-sm font-semibold text-slate-900">{main.label}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            {main.subs.length ? (
                              <span className="text-[11px] font-medium text-slate-500">
                                {state.count}/{state.total}
                              </span>
                            ) : null}
                            {main.subs.length ? (
                              isOpen ? (
                                <ChevronDown className="h-4 w-4 text-slate-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-slate-400" />
                              )
                            ) : null}
                          </span>
                        </button>
                      </div>

                      {main.subs.length && isOpen ? (
                        <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2.5">
                          <div className="grid gap-2 sm:grid-cols-2">
                            {main.subs.map((sub) => {
                              const checked = selected.has(sub.value);
                              return (
                                <label
                                  key={sub.value}
                                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                                    checked
                                      ? "border-blue-300 bg-blue-50 text-blue-900"
                                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                    checked={checked}
                                    onChange={() => toggleSub(sub.value)}
                                  />
                                  <span className="truncate">{sub.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            {displayError ? <div className="app-alert-error mt-4">{displayError}</div> : null}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button type="button" onClick={onClose} className="app-button-secondary rounded-2xl px-5 py-2.5 text-sm font-medium">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
