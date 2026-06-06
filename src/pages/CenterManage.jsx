import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarDays, CheckSquare, Plus, Save, Square, UsersRound } from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import {
  ADDITIONAL_CENTER_COLORS,
  DEFAULT_DAY_CENTERS,
  loadLoanCenters,
  saveLoanCentersExtras,
} from "../constants/dayCenters";
import { listCustomers, updateCustomerDay } from "../services/userAuth";
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
  return cleaned.startsWith(key + "-") ? cleaned : key + "-" + cleaned;
}

export default function CenterManage() {
  const navigate = useNavigate();
  const [centers, setCenters] = useState(() => loadCenters());
  const [allCustomers, setAllCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // step 1 = day list, step 2 = sub-centers + customer assign
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedCenter, setSelectedCenter] = useState(null);

  // customer assign state
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [viewMode, setViewMode] = useState(false); // true = show only assigned customers

  // add center modal
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState("");

  const fetchCustomers = () => {
    setLoading(true);
    listCustomers()
      .then((list) => setAllCustomers(list))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCustomers(); }, []);

  // when center selected, pre-select already assigned customers
  useEffect(() => {
    if (!selectedCenter) { setSelectedIds([]); setSearch(""); setSaved(false); setSaveError(""); setViewMode(false); return; }
    const assigned = allCustomers.filter((c) => c.selectedDay === selectedCenter).map((c) => c.customerId);
    setSelectedIds(assigned);
    setSearch("");
    setSaved(false);
    setSaveError("");
    // if already has assigned customers, open in view mode
    setViewMode(assigned.length > 0);
  }, [selectedCenter, allCustomers]);

  const childCenters = useMemo(
    () => centers.filter((c) => c.parent === selectedDay),
    [centers, selectedDay]
  );

  // all customers available to assign: already in this center + in parent day + unassigned
  const assignableCustomers = useMemo(() => {
    if (!selectedCenter) return [];
    return allCustomers.filter(
      (c) => c.selectedDay === selectedCenter || c.selectedDay === selectedDay || !c.selectedDay
    );
  }, [allCustomers, selectedCenter, selectedDay]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignableCustomers;
    return assignableCustomers.filter(
      (c) =>
        (c.customerName || "").toLowerCase().includes(q) ||
        (c.mobileNumber || "").includes(q) ||
        (c.identityNumber || "").toLowerCase().includes(q)
    );
  }, [assignableCustomers, search]);

  function toggleCustomer(id) {
    setSaved(false);
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function toggleAll() {
    setSaved(false);
    const allFiltered = filteredCustomers.map((c) => c.customerId);
    const allSelected = allFiltered.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allFiltered.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...allFiltered])]);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const currentAssigned = allCustomers.filter((c) => c.selectedDay === selectedCenter).map((c) => c.customerId);
      const toAdd    = selectedIds.filter((id) => !currentAssigned.includes(id));
      const toRemove = currentAssigned.filter((id) => !selectedIds.includes(id));
      await Promise.all([
        ...toAdd.map((id) =>
          updateCustomerDay(id, selectedCenter, persistableCenterFieldsFromSelectedDay(selectedCenter, centers))
        ),
        ...toRemove.map((id) => updateCustomerDay(id, "")),
      ]);
      await fetchCustomers();
      setSaved(true);
      setViewMode(true);
    } catch (err) {
      setSaveError(err.message || "Unable to save");
    } finally {
      setSaving(false);
    }
  }

  function handleAddCenter() {
    if (!newName.trim()) return;
    const label = formatLabel(selectedDay, newName);
    if (centers.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      alert("Center already exists");
      return;
    }
    const colorIndex = centers.length % additionalColors.length;
    const newCenter = { label, color: additionalColors[colorIndex], parent: selectedDay };
    const updated = [...centers, newCenter];
    saveCentersToStorage(updated);
    setCenters(updated);
    setNewName("");
    setShowModal(false);
  }

  const allFilteredSelected = filteredCustomers.length > 0 &&
    filteredCustomers.every((c) => selectedIds.includes(c.customerId));

  return (
    <AdminLayout
      title="Center Manage"
      description={
        selectedCenter ? `${selectedDay} / ${selectedCenter}` :
        selectedDay    ? `Centers inside ${selectedDay}` :
        "All day centers"
      }
    >
      <div className="mx-auto w-full max-w-2xl flex flex-col gap-5">

        {/* ── STEP 1: Day centers ── */}
        {!selectedDay && (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Day Centers</p>
            <div className="flex flex-col gap-3">
              {defaultCenters.map((center) => {
                const subLabels = centers.filter((c) => c.parent === center.label).map((c) => c.label);
                const custCount = allCustomers.filter((cu) => cu.selectedDay === center.label || subLabels.includes(cu.selectedDay)).length;
                const subCount  = subLabels.length;
                return (
                  <button
                    key={center.label}
                    type="button"
                    onClick={() => setSelectedDay(center.label)}
                    className={"flex items-center gap-4 rounded-2xl border p-4 text-left transition hover:shadow-sm " + center.color}
                  >
                    <div className={"flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-white/80 " + center.color}>
                      <CalendarDays className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{center.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {loading ? "Loading..." : `${subCount} center${subCount !== 1 ? "s" : ""} · ${custCount} customer${custCount !== 1 ? "s" : ""}`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── STEP 2: Sub-centers ── */}
        {selectedDay && !selectedCenter && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{selectedDay}</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900">Centers</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" /> Create Center
              </button>
            </div>

            {childCenters.length > 0 ? (
              <div className="flex flex-col gap-3">
                {childCenters.map((child) => {
                  const count = allCustomers.filter((c) => c.selectedDay === child.label).length;
                  return (
                    <button
                      key={child.label}
                      type="button"
                      onClick={() => setSelectedCenter(child.label)}
                      className={"flex items-center gap-3 rounded-2xl border p-4 text-left transition hover:shadow-sm " + child.color}
                    >
                      <div className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white/80 " + child.color}>
                        <UsersRound className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{child.label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {count > 0 ? `${count} customer${count !== 1 ? "s" : ""}` : "No customers"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                No centers yet. Click "Create Center" to add one.
              </div>
            )}

            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="inline-flex items-center gap-2 self-start rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back to days
            </button>
          </>
        )}

        {/* ── STEP 3: View / Assign customers ── */}
        {selectedDay && selectedCenter && (() => {
          const assignedCustomers = allCustomers.filter((c) => c.selectedDay === selectedCenter);
          return (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {selectedDay} / {selectedCenter}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900">
                    {viewMode ? "Customers" : "Assign Customers"}
                  </h3>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {viewMode
                      ? `${assignedCustomers.length} customer${assignedCustomers.length !== 1 ? "s" : ""}`
                      : `${selectedIds.length} selected · ${assignableCustomers.length} available`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      navigate("/dashboard/customer?create=1", {
                        state: {
                          selectedDay,
                          selectedCenter,
                        },
                      })
                    }
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    <Plus className="h-4 w-4" />
                    Create customer
                  </button>
                  {viewMode && (
                    <button
                      type="button"
                      onClick={() => { setViewMode(false); setSaved(false); }}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* ── VIEW MODE: only assigned customers ── */}
              {viewMode && (
                <>
                  {assignedCustomers.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                      No customers assigned. Click Edit to assign.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2">
                        <span className="w-6 text-xs font-semibold text-slate-400">#</span>
                        <span className="flex-1 text-xs font-semibold text-slate-500">Name</span>
                        <span className="hidden w-28 text-xs font-semibold text-slate-500 sm:block">Mobile</span>
                        <span className="w-24 text-xs font-semibold text-slate-500">ID</span>
                      </div>
                      {assignedCustomers.map((customer, index) => (
                        <div
                          key={customer.customerId}
                          className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 cursor-pointer hover:bg-blue-50 transition"
                          onClick={() => navigate("/dashboard/customer/" + customer.customerId)}
                        >
                          <span className="w-6 text-xs font-bold text-slate-400">{index + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{customer.customerName || "Unnamed"}</p>
                            <p className="text-xs text-slate-400">{customer.identityType} · {customer.identityNumber}</p>
                          </div>
                          <span className="hidden w-28 text-xs text-slate-500 sm:block">{customer.mobileNumber}</span>
                          <span className="w-24 text-xs text-slate-400 truncate">{customer.identityNumber}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedCenter(null)}
                    className="inline-flex items-center gap-2 self-start rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                </>
              )}

              {/* ── EDIT/ASSIGN MODE ── */}
              {!viewMode && (
                <>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setSaved(false); }}
                    placeholder="Search by name, phone or ID..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
                  />

                  {loading ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Loading...</div>
                  ) : filteredCustomers.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                      {assignableCustomers.length === 0 ? "No customers available to assign." : "No results match your search."}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2">
                        <button type="button" onClick={toggleAll} className="shrink-0">
                          {allFilteredSelected
                            ? <CheckSquare className="h-4 w-4 text-blue-600" />
                            : <Square className="h-4 w-4 text-slate-400" />}
                        </button>
                        <span className="w-6 text-xs font-semibold text-slate-400">#</span>
                        <span className="flex-1 text-xs font-semibold text-slate-500">Name</span>
                        <span className="hidden w-28 text-xs font-semibold text-slate-500 sm:block">Mobile</span>
                        <span className="w-20 text-xs font-semibold text-slate-500 text-right">Status</span>
                      </div>
                      {filteredCustomers.map((customer, index) => {
                        const isSelected = selectedIds.includes(customer.customerId);
                        const tag =
                          customer.selectedDay === selectedCenter ? "assigned" :
                          customer.selectedDay === selectedDay    ? "parent"   :
                          customer.selectedDay                    ? "other"    : "free";
                        return (
                          <div
                            key={customer.customerId}
                            className={"flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 transition cursor-pointer " + (isSelected ? "bg-blue-50" : "hover:bg-slate-50")}
                            onClick={() => toggleCustomer(customer.customerId)}
                          >
                            <span className="shrink-0">
                              {isSelected
                                ? <CheckSquare className="h-4 w-4 text-blue-600" />
                                : <Square className="h-4 w-4 text-slate-300" />}
                            </span>
                            <span className="w-6 text-xs font-bold text-slate-400">{index + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-sm font-medium text-blue-600 underline-offset-2 hover:underline truncate"
                                onClick={(e) => { e.stopPropagation(); navigate("/dashboard/customer/" + customer.customerId); }}
                              >
                                {customer.customerName || "Unnamed"}
                              </p>
                              <p className="text-xs text-slate-400">{customer.identityType} · {customer.identityNumber}</p>
                            </div>
                            <span className="hidden w-28 text-xs text-slate-500 sm:block">{customer.mobileNumber}</span>
                            <span className={"w-20 text-right text-xs font-medium " +
                              (tag === "assigned" ? "text-blue-600" :
                               tag === "parent"   ? "text-emerald-600" :
                               tag === "other"    ? "text-amber-600" : "text-slate-400")}>
                              {tag === "assigned" ? "In center" :
                               tag === "parent"   ? "In day" :
                               tag === "other"    ? customer.selectedDay :
                               "Free"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {saveError && (
                    <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{saveError}</p>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedCenter(null)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <ArrowLeft className="h-4 w-4" /> Back
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className={"inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition " +
                        (saved
                          ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50")}
                    >
                      <Save className="h-4 w-4" />
                      {saving ? "Saving..." : saved ? `✓ Saved (${selectedIds.length})` : `Save (${selectedIds.length} selected)`}
                    </button>
                  </div>
                </>
              )}
            </>
          );
        })()}
      </div>

      {/* Add center modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900">Create Center</h3>
            <p className="mt-1 text-sm text-slate-500">Inside {selectedDay}</p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCenter()}
              className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
              placeholder="Center name"
              autoFocus
            />
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => { setShowModal(false); setNewName(""); }} className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={handleAddCenter} disabled={!newName.trim()} className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
