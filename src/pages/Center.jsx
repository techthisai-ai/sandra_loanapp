import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import {
  ADDITIONAL_CENTER_COLORS,
  DEFAULT_DAY_CENTERS,
  loadLoanCenters,
  saveLoanCentersExtras,
} from "../constants/dayCenters";
import { listAllCustomerAmountEntries, listCustomers, updateCustomerDay } from "../services/userAuth";
import { hasAppliedForLoan } from "../utils/customerSheets";
import { persistableCenterFieldsFromSelectedDay } from "../utils/centerDisplay";

const defaultCenters = DEFAULT_DAY_CENTERS;
const additionalColors = ADDITIONAL_CENTER_COLORS;

function loadCenters() {
  return loadLoanCenters();
}

function saveCentersToStorage(centers) {
  saveLoanCentersExtras(centers);
}

function formatLabel(parentDay, name) {
  const key = parentDay.trim().toLowerCase().slice(0, 3).replace(/[^a-z0-9]/g, "") || "day";
  const cleaned = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return cleaned.startsWith(`${key}-`) ? cleaned : `${key}-${cleaned}`;
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
}

export default function Center() {
  const navigate = useNavigate();
  const [centers, setCenters] = useState(() => loadCenters());
  const [allCustomers, setAllCustomers] = useState([]);
  const [amountEntries, setAmountEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectionByCenter, setSelectionByCenter] = useState({});
  const [previewSelectionByCenter, setPreviewSelectionByCenter] = useState({});
  const [actionError, setActionError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [modalParent, setModalParent] = useState("");
  const [newName, setNewName] = useState("");
  const [activeDay, setActiveDay] = useState(defaultCenters[0].label);
  const [activeCenter, setActiveCenter] = useState("");
  const [rightSubCenterFilter, setRightSubCenterFilter] = useState("");
  const [expandedDays, setExpandedDays] = useState(() =>
    defaultCenters.reduce((acc, day, index) => ({ ...acc, [day.label]: index === 0 }), {})
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [customers, entries] = await Promise.all([listCustomers(), listAllCustomerAmountEntries()]);
        if (!active) return;
        setAllCustomers(customers);
        setAmountEntries(entries);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const dayGroups = useMemo(
    () => defaultCenters.map((dayCenter) => ({ ...dayCenter, subCenters: centers.filter((c) => c.parent === dayCenter.label) })),
    [centers]
  );
  const activeDayGroup = useMemo(
    () => dayGroups.find((group) => group.label === activeDay) || dayGroups[0],
    [dayGroups, activeDay]
  );
  const showAllSubCenters = !activeCenter;
  const currentCenterLabel = activeCenter || "";
  const centersForActiveDay = useMemo(
    () => (activeDayGroup ? activeDayGroup.subCenters : []),
    [activeDayGroup]
  );
  const assignedToCurrentCenter = useMemo(
    () => allCustomers.filter((c) => c.selectedDay === currentCenterLabel),
    [allCustomers, currentCenterLabel]
  );

  const sheetRows = useMemo(() => {
    return allCustomers
      .filter((c) => hasAppliedForLoan(c))
      .map((customer, index) => {
        const customerEntries = amountEntries.filter((e) => e.customerId === customer.customerId);
        const approvedEntries = customerEntries.filter((e) => e.approvalStatus === "approved");
        const totalCollected = approvedEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const pendingWeeks = Math.max(Number(customer.loanWeeks || 0) - approvedEntries.length, 0);
        return {
          sno: index + 1,
          center: customer.selectedDay || "--",
          customerId: customer.customerId,
          customerName: customer.customerName || "Unnamed",
          mobile: customer.mobileNumber || "--",
          loanAmount: Number(customer.loanAmount || 0),
          collected: totalCollected,
          dueDate: formatDate(customer.dueDate),
          pendingWeeks,
        };
      });
  }, [allCustomers, amountEntries]);
  const sheetRowById = useMemo(
    () => new Map(sheetRows.map((row) => [row.customerId, row])),
    [sheetRows]
  );
  const customersBySubCenter = useMemo(() => {
    const map = new Map();
    centersForActiveDay.forEach((center) => {
      map.set(
        center.label,
        allCustomers.filter((customer) => customer.selectedDay === center.label)
      );
    });
    return map;
  }, [centersForActiveDay, allCustomers]);
  /** Customers whose centre is the parent day (e.g. "Monday Centre") — Customer page counts these under that day too. */
  const customersOnParentDayCentre = useMemo(() => {
    const parent = activeDayGroup?.label;
    if (!parent) return [];
    return allCustomers.filter((c) => c.selectedDay === parent);
  }, [allCustomers, activeDayGroup]);

  const filteredDayCustomers = useMemo(() => {
    if (!showAllSubCenters) return [];
    if (rightSubCenterFilter) return customersBySubCenter.get(rightSubCenterFilter) || [];
    const fromSubCenters = centersForActiveDay.flatMap((subCenter) => customersBySubCenter.get(subCenter.label) || []);
    const merged = new Map();
    customersOnParentDayCentre.forEach((c) => merged.set(c.customerId, c));
    fromSubCenters.forEach((c) => merged.set(c.customerId, c));
    return Array.from(merged.values());
  }, [
    showAllSubCenters,
    rightSubCenterFilter,
    customersBySubCenter,
    centersForActiveDay,
    customersOnParentDayCentre,
  ]);
  const targetCenterLabel = showAllSubCenters ? rightSubCenterFilter : currentCenterLabel;

  function renderCenterCustomerGrid() {
    if (showAllSubCenters) {
      return (
        <div className="max-h-[calc(100%-120px)] overflow-hidden rounded-xl border border-slate-200 bg-white">
          {filteredDayCustomers.length > 0 ? (
            <>
              <div className="grid grid-cols-[minmax(170px,1.8fr)_minmax(120px,1fr)_minmax(90px,.8fr)_minmax(90px,.8fr)_minmax(90px,.8fr)_minmax(70px,.5fr)_42px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                <span>Customer</span>
                <span>Mobile</span>
                <span>Loan</span>
                <span>Collected</span>
                <span>Due</span>
                <span>Pend</span>
                <span />
              </div>
              <div className="max-h-[calc(100%-34px)] overflow-y-auto">
                {filteredDayCustomers.map((customer) => {
                  const customerSheet = sheetRowById.get(customer.customerId);
                  const loanAmount = Number(customer.loanAmount || 0);
                  const collected = customerSheet?.collected ?? 0;
                  const dueDate = customerSheet?.dueDate ?? formatDate(customer.dueDate);
                  const pending = customerSheet?.pendingWeeks ?? Math.max(Number(customer.loanWeeks || 0), 0);
                  return (
                    <div
                      key={customer.customerId}
                      className="grid grid-cols-[minmax(170px,1.8fr)_minmax(120px,1fr)_minmax(90px,.8fr)_minmax(90px,.8fr)_minmax(90px,.8fr)_minmax(70px,.5fr)_42px] items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs text-slate-700"
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/dashboard/customer/${customer.customerId}`)}
                        className="truncate text-left font-medium text-slate-900 hover:text-blue-600"
                      >
                        {customer.customerName || "Unnamed"}
                      </button>
                      <span className="truncate">{customer.mobileNumber || "--"}</span>
                      <span>{loanAmount.toLocaleString("en-IN")}</span>
                      <span>{Number(collected).toLocaleString("en-IN")}</span>
                      <span>{dueDate}</span>
                      <span>{pending}</span>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => dropCustomer(customer.customerId)}
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-rose-600"
                        aria-label="Remove customer from center"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="p-3 text-xs text-slate-400">
              {centersForActiveDay.length === 0
                ? `No customers on ${activeDayGroup?.label} yet. Add a sub-center with “Sub-center”, or assign customers to this day centre from Customer.`
                : "No customers found for this selection."}
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="max-h-[calc(100%-120px)] overflow-hidden rounded-xl border border-slate-200 bg-white">
        {currentCenterLabel && assignedToCurrentCenter.length > 0 ? (
          <>
            <div className="grid grid-cols-[minmax(170px,1.8fr)_minmax(120px,1fr)_minmax(90px,.8fr)_minmax(90px,.8fr)_minmax(90px,.8fr)_minmax(70px,.5fr)_42px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <span>Customer</span>
              <span>Mobile</span>
              <span>Loan</span>
              <span>Collected</span>
              <span>Due</span>
              <span>Pend</span>
              <span />
            </div>
            <div className="max-h-[calc(100%-34px)] overflow-y-auto">
              {assignedToCurrentCenter.map((customer) => {
                const customerSheet = sheetRowById.get(customer.customerId);
                const loanAmount = Number(customer.loanAmount || 0);
                const collected = customerSheet?.collected ?? 0;
                const dueDate = customerSheet?.dueDate ?? formatDate(customer.dueDate);
                const pending = customerSheet?.pendingWeeks ?? Math.max(Number(customer.loanWeeks || 0), 0);

                return (
                  <div
                    key={customer.customerId}
                    className="grid grid-cols-[minmax(170px,1.8fr)_minmax(120px,1fr)_minmax(90px,.8fr)_minmax(90px,.8fr)_minmax(90px,.8fr)_minmax(70px,.5fr)_42px] items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs text-slate-700"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewSelectionByCenter((current) => ({
                          ...current,
                          [currentCenterLabel]: customer.customerId,
                        }))
                      }
                      className={`truncate text-left font-medium hover:text-blue-600 ${
                        previewSelectionByCenter[currentCenterLabel] === customer.customerId
                          ? "text-blue-700"
                          : "text-slate-900"
                      }`}
                    >
                      {customer.customerName || "Unnamed"}
                    </button>
                    <span className="truncate">{customer.mobileNumber || "--"}</span>
                    <span>{loanAmount.toLocaleString("en-IN")}</span>
                    <span>{Number(collected).toLocaleString("en-IN")}</span>
                    <span>{dueDate}</span>
                    <span>{pending}</span>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => dropCustomer(customer.customerId)}
                      className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-rose-600"
                      aria-label="Remove customer from center"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : !currentCenterLabel ? (
          <p className="p-3 text-xs text-slate-400">Select a sub-center to view customers.</p>
        ) : (
          <p className="p-3 text-xs text-slate-400">No customers in this center.</p>
        )}
      </div>
    );
  }

  const selectedCustomerPreview = useMemo(() => {
    const selectedId = previewSelectionByCenter[currentCenterLabel];
    if (!selectedId) return null;
    const customer = allCustomers.find((c) => c.customerId === selectedId);
    if (!customer) return null;
    const row = sheetRows.find((r) => r.customerId === selectedId);
    return {
      customerName: customer.customerName || "Unnamed",
      customerId: customer.customerId || "--",
      mobile: customer.mobileNumber || "--",
      center: customer.selectedDay || "--",
      loanAmount: Number(customer.loanAmount || 0),
      collected: row?.collected ?? 0,
      dueDate: row?.dueDate ?? formatDate(customer.dueDate),
      pendingWeeks: row?.pendingWeeks ?? Math.max(Number(customer.loanWeeks || 0), 0),
    };
  }, [previewSelectionByCenter, currentCenterLabel, allCustomers, sheetRows]);

  useEffect(() => {
    if (!activeDayGroup) return;
    if (activeCenter && centersForActiveDay.some((center) => center.label === activeCenter)) return;
    if (activeCenter && !centersForActiveDay.some((center) => center.label === activeCenter)) {
      setActiveCenter("");
    }
  }, [activeDayGroup, activeCenter, centersForActiveDay]);

  useEffect(() => {
    setRightSubCenterFilter("");
  }, [activeDay]);

  function toggleDay(dayLabel) {
    setExpandedDays((current) => ({ ...current, [dayLabel]: !current[dayLabel] }));
  }

  async function moveCustomer(customerId, targetCenter) {
    if (!customerId || !targetCenter) return;
    setSaving(true);
    setActionError("");
    try {
      await updateCustomerDay(
        customerId,
        targetCenter,
        persistableCenterFieldsFromSelectedDay(targetCenter, centers)
      );
      const customers = await listCustomers();
      setAllCustomers(customers);
      setSelectionByCenter((current) => ({ ...current, [targetCenter]: "" }));
    } catch (err) {
      setActionError(err.message || "Unable to move customer");
    } finally {
      setSaving(false);
    }
  }

  async function dropCustomer(customerId) {
    setSaving(true);
    setActionError("");
    try {
      await updateCustomerDay(customerId, "");
      const customers = await listCustomers();
      setAllCustomers(customers);
    } catch (err) {
      setActionError(err.message || "Unable to remove customer from center");
    } finally {
      setSaving(false);
    }
  }

  function handleAddCenter() {
    if (!newName.trim()) return;
    const label = formatLabel(modalParent, newName);
    if (centers.some((c) => c.label.toLowerCase() === label.toLowerCase())) return;
    const colorIndex = centers.length % additionalColors.length;
    const updated = [...centers, { label, color: additionalColors[colorIndex], parent: modalParent }];
    saveCentersToStorage(updated);
    setCenters(updated);
    setNewName("");
    setModalParent("");
    setShowModal(false);
  }

  return (
    <AdminLayout
      title="Center"
      description="Manage sub-centers and customer assignment"
    >
      <div className="h-[calc(100vh-5.5rem)] w-full max-w-6xl overflow-hidden">
        <div className="grid h-full gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
            <section className="app-section-card min-h-0 overflow-hidden p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Day centers</h3>
              </div>
              <div className="space-y-1 overflow-y-auto pr-1">
                {dayGroups.map((group) => (
                  <div key={group.label} className="rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDay(group.label);
                          setActiveCenter("");
                        }}
                        className={`flex min-w-0 flex-1 items-center justify-between rounded-l-lg px-2 py-2 text-left text-xs font-medium transition ${
                          activeDay === group.label ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="truncate">{group.label}</span>
                        <span className="ml-2 shrink-0 text-[10px] text-slate-400">{group.subCenters.length}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleDay(group.label)}
                        className="rounded-r-lg px-2 py-2 text-slate-500 hover:bg-slate-50"
                        aria-label={`Toggle ${group.label} sub-centers`}
                      >
                        {expandedDays[group.label] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    {expandedDays[group.label] ? (
                      <div className="space-y-1 border-t border-slate-100 px-2 py-2">
                        {group.subCenters.length > 0 ? (
                          group.subCenters.map((subCenter) => (
                            <button
                              key={subCenter.label}
                              type="button"
                              onClick={() => {
                                setActiveDay(group.label);
                                setActiveCenter(subCenter.label);
                              }}
                              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
                                activeCenter === subCenter.label
                                  ? "bg-blue-100 font-semibold text-blue-700"
                                  : "bg-blue-50/45 text-blue-700 hover:bg-blue-100/60"
                              }`}
                            >
                              <span className="truncate">{subCenter.label}</span>
                              <span className="ml-2 shrink-0 text-[10px] text-slate-400">
                                {allCustomers.filter((c) => c.selectedDay === subCenter.label).length}
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="px-2 py-1 text-[11px] text-slate-400">No sub-centers</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="app-section-card min-h-0 overflow-hidden p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    {activeDayGroup?.label} {showAllSubCenters ? "all sub-centers" : "sub-center"}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      navigate("/dashboard/customer/new", {
                        state: {
                          selectedDay: activeDayGroup?.label || "",
                          selectedCenter: targetCenterLabel || "",
                        },
                      })
                    }
                    className="app-button-primary inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New customer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalParent(activeDayGroup?.label || "");
                      setShowModal(true);
                    }}
                    className="app-button-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    <Plus className="mr-1 inline h-3.5 w-3.5" />
                    Sub-center
                  </button>
                </div>
              </div>

              {showAllSubCenters ? (
                <p className="mb-2 text-xs text-slate-400">
                  Lists everyone on this day: the day centre ({activeDayGroup?.label}) plus each sub-center. Use the pills
                  to filter one sub-center.
                </p>
              ) : null}

              {showAllSubCenters ? (
                <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setRightSubCenterFilter("")}
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      rightSubCenterFilter === "" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-blue-200 bg-blue-50/40 text-blue-700"
                    }`}
                  >
                    All sub-centers
                  </button>
                  {centersForActiveDay.map((subCenter) => (
                    <button
                      key={subCenter.label}
                      type="button"
                      onClick={() => setRightSubCenterFilter(subCenter.label)}
                      className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        rightSubCenterFilter === subCenter.label
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-blue-200 bg-blue-50/40 text-blue-700"
                      }`}
                    >
                      {subCenter.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mb-2 flex gap-2">
                <select
                  value={selectionByCenter[targetCenterLabel] || ""}
                  onChange={(event) =>
                    setSelectionByCenter((current) => ({ ...current, [targetCenterLabel]: event.target.value }))
                  }
                  className="app-select py-2 text-xs"
                  disabled={!targetCenterLabel}
                >
                  <option value="">Move customer from other center…</option>
                  {allCustomers
                    .filter((c) => !c.isArchived && !c.isDeleted && c.selectedDay !== targetCenterLabel)
                    .map((c) => (
                      <option key={c.customerId} value={c.customerId}>
                        {c.customerName || "Unnamed"} · {c.mobileNumber || c.customerId}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!selectionByCenter[targetCenterLabel] || saving || !targetCenterLabel}
                  onClick={() => moveCustomer(selectionByCenter[targetCenterLabel], targetCenterLabel)}
                  className="app-button-primary rounded-lg px-3 py-2 text-xs disabled:opacity-50"
                >
                  Move
                </button>
              </div>

              {!showAllSubCenters ? (
                <div className="mb-2">
                  <select
                    value={previewSelectionByCenter[currentCenterLabel] || ""}
                    onChange={(event) =>
                      setPreviewSelectionByCenter((current) => ({
                        ...current,
                        [currentCenterLabel]: event.target.value,
                      }))
                    }
                    className="app-select py-2 text-xs"
                    disabled={!currentCenterLabel}
                  >
                    <option value="">View customer from this sub-center…</option>
                    {assignedToCurrentCenter.map((customer) => (
                      <option key={customer.customerId} value={customer.customerId}>
                        {customer.customerName || "Unnamed"} · {customer.mobileNumber || customer.customerId}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {selectedCustomerPreview ? (
                <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50/60 p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-700">Selected customer preview</p>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
                    <span className="truncate font-semibold text-slate-900">{selectedCustomerPreview.customerName}</span>
                    <span className="truncate">{selectedCustomerPreview.customerId}</span>
                    <span>{selectedCustomerPreview.mobile}</span>
                    <span className="truncate">{selectedCustomerPreview.center}</span>
                    <span>Loan: {selectedCustomerPreview.loanAmount.toLocaleString("en-IN")}</span>
                    <span>Collected: {selectedCustomerPreview.collected.toLocaleString("en-IN")}</span>
                    <span>Due: {selectedCustomerPreview.dueDate}</span>
                    <span>Pending: {selectedCustomerPreview.pendingWeeks}</span>
                  </div>
                </div>
              ) : null}

              {renderCenterCustomerGrid()}
            </section>
          </div>

        {actionError ? <p className="mt-2 app-alert-error">{actionError}</p> : null}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">Create sub-center</p>
            <p className="mt-1 text-xs text-slate-500">Inside {modalParent}</p>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className="app-input mt-3" placeholder="Center name" />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => { setShowModal(false); setNewName(""); }} className="app-button-secondary flex-1 rounded-xl px-3 py-2 text-sm">Cancel</button>
              <button type="button" onClick={handleAddCenter} disabled={!newName.trim()} className="app-button-primary flex-1 rounded-xl px-3 py-2 text-sm">Create</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
