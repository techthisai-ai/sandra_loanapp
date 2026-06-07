import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  MapPin,
  Plus,
  Trash2,
  UsersRound,
} from "lucide-react";
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
function formatLoanAmount(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function countCustomersForDayGroup(group, customers) {
  const labels = new Set([group.label, ...group.subCenters.map((subCenter) => subCenter.label)]);
  return customers.filter((customer) => labels.has(customer.selectedDay)).length;
}

function CenterAvatar({ name }) {
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
    .slice(0, 2);

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-[11px] font-bold text-white shadow-sm">
      {initials}
    </div>
  );
}

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

  const displayCustomers = useMemo(() => {
    if (showAllSubCenters) return filteredDayCustomers;
    return assignedToCurrentCenter;
  }, [showAllSubCenters, filteredDayCustomers, assignedToCurrentCenter]);

  const activeDayCustomerCount = useMemo(() => {
    if (!activeDayGroup) return 0;
    return countCustomersForDayGroup(activeDayGroup, allCustomers);
  }, [activeDayGroup, allCustomers]);

  function renderCustomerRow(customer, rowIndex) {
    const customerSheet = sheetRowById.get(customer.customerId);
    const collected = customerSheet?.collected ?? 0;
    const dueDate = customerSheet?.dueDate ?? formatDate(customer.dueDate);
    const pending = customerSheet?.pendingWeeks ?? Math.max(Number(customer.loanWeeks || 0), 0);

    return (
      <tr key={customer.customerId} className="transition hover:bg-blue-50/30">
        <td className="px-2 py-2.5 text-center text-xs font-semibold text-slate-400">{rowIndex}</td>
        <td className="max-w-0 px-2 py-2.5">
          <button
            type="button"
            onClick={() => navigate(`/dashboard/customer/${customer.customerId}`)}
            className="flex min-w-0 items-center gap-2 text-left"
          >
            <CenterAvatar name={customer.customerName} />
            <span className="truncate text-xs font-semibold text-slate-900 hover:text-blue-700">
              {customer.customerName || "Unnamed"}
            </span>
          </button>
        </td>
        <td className="truncate px-2 py-2.5 text-xs text-slate-600">{customer.mobileNumber || "--"}</td>
        <td className="truncate px-2 py-2.5 text-right text-xs font-medium tabular-nums text-slate-700">
          {formatLoanAmount(customer.loanAmount)}
        </td>
        <td className="truncate px-2 py-2.5 text-right text-xs font-medium tabular-nums text-emerald-600">
          {formatLoanAmount(collected)}
        </td>
        <td className="truncate px-2 py-2.5 text-xs text-slate-600">{dueDate}</td>
        <td className="truncate px-2 py-2.5 text-xs tabular-nums text-slate-700">{pending}</td>
        <td className="px-2 py-2.5 text-center">
          <button
            type="button"
            disabled={saving}
            onClick={() => dropCustomer(customer.customerId)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
            aria-label="Remove customer from center"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>
    );
  }

  function renderCenterCustomerTable() {
    if (!showAllSubCenters && !currentCenterLabel) {
      return <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-500">Select a sub-center to view customers.</p>;
    }

    if (displayCustomers.length === 0) {
      return (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-500">
          {showAllSubCenters && centersForActiveDay.length === 0
            ? `No customers on ${activeDayGroup?.label} yet. Add a sub-center, or assign customers from Customer.`
            : "No customers found for this selection."}
        </p>
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-sm">
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
              <tr>
                <th className="px-2 py-2.5 text-center">#</th>
                <th className="px-2 py-2.5 text-left">Customer</th>
                <th className="px-2 py-2.5 text-left">Mobile</th>
                <th className="px-2 py-2.5 text-right">Loan</th>
                <th className="px-2 py-2.5 text-right">Collected</th>
                <th className="px-2 py-2.5 text-left">Due</th>
                <th className="px-2 py-2.5 text-left">Pending</th>
                <th className="px-2 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {displayCustomers.map((customer, index) => renderCustomerRow(customer, index + 1))}
            </tbody>
          </table>
        </div>

        <div className="shrink-0 border-t border-slate-100 px-4 py-2.5 text-center text-[11px] text-slate-400">
          Showing {displayCustomers.length} customer{displayCustomers.length === 1 ? "" : "s"}
        </div>
      </div>
    );
  }

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
    <AdminLayout title="Center" description="Manage sub-centers and customer assignment">
      <div className="flex h-[calc(100vh-5.5rem)] w-full min-w-0 max-w-full flex-col overflow-hidden lg:max-w-[min(1440px,100%)]">
        {actionError ? <p className="mb-2 shrink-0 app-alert-error">{actionError}</p> : null}

        <div className="grid min-h-0 flex-1 items-start gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
          <section className="flex w-full flex-col rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm lg:sticky lg:top-3">
            <div className="mb-2 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-blue-600" aria-hidden />
              <h3 className="text-xs font-semibold text-slate-900">Day centers</h3>
            </div>

            <div className="space-y-1">
              {dayGroups.map((group) => {
                const dayActive = activeDay === group.label;
                const dayCustomerCount = countCustomersForDayGroup(group, allCustomers);

                return (
                  <div
                    key={group.label}
                    className={`overflow-hidden rounded-xl border transition ${
                      dayActive ? "border-blue-200 bg-blue-50/70" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDay(group.label);
                          setActiveCenter("");
                          setExpandedDays((current) => ({ ...current, [group.label]: true }));
                        }}
                        className={`flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-xs font-medium transition ${
                          dayActive ? "text-blue-700" : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <CalendarDays className={`h-3.5 w-3.5 shrink-0 ${dayActive ? "text-blue-600" : "text-slate-400"}`} />
                        <span className="min-w-0 flex-1 truncate">{group.label}</span>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold ${
                            dayActive ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {dayCustomerCount}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleDay(group.label)}
                        className="px-2 py-1.5 text-slate-500 hover:bg-white/60"
                        aria-label={`Toggle ${group.label} sub-centers`}
                      >
                        {expandedDays[group.label] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    {expandedDays[group.label] ? (
                      <div className="space-y-0.5 border-t border-slate-200/80 px-1.5 py-1">
                        {group.subCenters.length > 0 ? (
                          group.subCenters.map((subCenter) => {
                            const subCount = allCustomers.filter((customer) => customer.selectedDay === subCenter.label).length;
                            const subActive = activeCenter === subCenter.label;

                            return (
                              <button
                                key={subCenter.label}
                                type="button"
                                onClick={() => {
                                  setActiveDay(group.label);
                                  setActiveCenter(subCenter.label);
                                }}
                                className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[11px] font-medium transition ${
                                  subActive
                                    ? "bg-blue-600 text-white shadow-sm"
                                    : "bg-white text-blue-700 hover:bg-blue-100/60"
                                }`}
                              >
                                <span className="truncate">{subCenter.label}</span>
                                <span
                                  className={`ml-2 shrink-0 rounded-full px-1.5 text-[10px] font-bold ${
                                    subActive ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"
                                  }`}
                                >
                                  {subCount}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <p className="px-2 py-1 text-[11px] text-slate-400">No sub-centers</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                <UsersRound className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                Total customers
              </div>
              <span className="text-xs font-bold tabular-nums text-slate-900">{activeDayCustomerCount}</span>
            </div>
          </section>

          <div className="flex min-h-0 min-w-0 flex-col gap-3">
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
                className="app-button-primary inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold"
              >
                <Plus className="h-4 w-4" />
                New customer
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalParent(activeDayGroup?.label || "");
                  setShowModal(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" />
                Sub-center
              </button>
            </div>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm">
            {showAllSubCenters ? (
              <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setRightSubCenterFilter("")}
                  className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    rightSubCenterFilter === ""
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/80"
                  }`}
                >
                  All sub-centers
                </button>
                {centersForActiveDay.map((subCenter) => (
                  <button
                    key={subCenter.label}
                    type="button"
                    onClick={() => setRightSubCenterFilter(subCenter.label)}
                    className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition ${
                      rightSubCenterFilter === subCenter.label
                        ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200/80"
                    }`}
                  >
                    {subCenter.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mb-4 flex flex-wrap gap-2">
              <select
                value={selectionByCenter[targetCenterLabel] || ""}
                onChange={(event) =>
                  setSelectionByCenter((current) => ({ ...current, [targetCenterLabel]: event.target.value }))
                }
                className="app-select min-w-0 flex-1 py-2.5 text-sm"
                disabled={!targetCenterLabel}
              >
                <option value="">Move customer from other center...</option>
                {allCustomers
                  .filter((customer) => !customer.isArchived && !customer.isDeleted && customer.selectedDay !== targetCenterLabel)
                  .map((customer) => (
                    <option key={customer.customerId} value={customer.customerId}>
                      {customer.customerName || "Unnamed"} · {customer.mobileNumber || customer.customerId}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!selectionByCenter[targetCenterLabel] || saving || !targetCenterLabel}
                onClick={() => moveCustomer(selectionByCenter[targetCenterLabel], targetCenterLabel)}
                className="app-button-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                Move
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {loading ? (
              <p className="py-10 text-center text-sm text-slate-500">Loading customers…</p>
            ) : (
              renderCenterCustomerTable()
            )}
            </section>
          </div>
        </div>
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
