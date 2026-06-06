import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, FileSearch, Pencil, Plus, Save, UsersRound } from "lucide-react";
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

function saveCenters(centers) {
  saveLoanCentersExtras(centers);
}

function formatInnerCenterLabel(parentDayLabel, centerName) {
  const parentKey = parentDayLabel.trim().toLowerCase().slice(0, 3).replace(/[^a-z0-9]/g, "") || "day";
  const cleaned = centerName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return cleaned.startsWith(`${parentKey}-`) ? cleaned : `${parentKey}-${cleaned}`;
}

export default function LoanApplyDay() {
  const { day } = useParams();
  const navigate = useNavigate();

  const [centers, setCenters] = useState(() => loadCenters());
  const [allCustomers, setAllCustomers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCenterName, setNewCenterName] = useState("");
  const [adding, setAdding] = useState(false);

  const currentCenter = useMemo(
    () => centers.find((c) => c.label === day) ?? { label: day, color: "border-slate-200 bg-slate-50 text-slate-600", parent: "" },
    [centers, day]
  );

  const isSubCenter = Boolean(currentCenter.parent);

  // customers assigned to THIS center
  const assignedCustomers = useMemo(
    () => allCustomers.filter((c) => c.selectedDay === day),
    [allCustomers, day]
  );

  // customers assigned to parent day (movable into sub-center)
  const parentAssignedCustomers = useMemo(
    () => currentCenter.parent ? allCustomers.filter((c) => c.selectedDay === currentCenter.parent) : [],
    [allCustomers, currentCenter.parent]
  );

  // unassigned customers
  const unassignedCustomers = useMemo(
    () => allCustomers.filter((c) => !c.selectedDay),
    [allCustomers]
  );

  const selectableCustomers = useMemo(
    () => [...assignedCustomers, ...parentAssignedCustomers, ...unassignedCustomers],
    [assignedCustomers, parentAssignedCustomers, unassignedCustomers]
  );

  // child centers of this day
  const childCenters = useMemo(
    () => centers.filter((c) => c.parent === day),
    [centers, day]
  );

  const isViewMode = assignedCustomers.length > 0 && !isEditMode;

  const fetchCustomers = () => {
    setLoading(true);
    setError("");
    listCustomers()
      .then((list) => setAllCustomers(list))
      .catch((err) => setError(err.message || "Unable to load customers"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setIsEditMode(false);
    setSelectedIds([]);
    setSaveError("");
    fetchCustomers();
  }, [day]);

  const handleEdit = () => {
    setSelectedIds(assignedCustomers.map((c) => c.customerId));
    setIsEditMode(true);
  };

  const toggleSelect = (customerId) => {
    setSelectedIds((prev) =>
      prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const currentAssignedIds = assignedCustomers.map((c) => c.customerId);
      const toAdd = selectedIds.filter((id) => !currentAssignedIds.includes(id));
      const toRemove = currentAssignedIds.filter((id) => !selectedIds.includes(id));
      await Promise.all([
        ...toAdd.map((id) => updateCustomerDay(id, day, persistableCenterFieldsFromSelectedDay(day, centers))),
        ...toRemove.map((id) => updateCustomerDay(id, "")),
      ]);
      await fetchCustomers();
      setIsEditMode(false);
      setSelectedIds([]);
    } catch (err) {
      setSaveError(err.message || "Unable to save");
    } finally {
      setSaving(false);
    }
  };

  const handleAddCenter = () => {
    if (!newCenterName.trim()) return;
    setAdding(true);
    const label = formatInnerCenterLabel(day, newCenterName);
    const current = loadCenters();
    if (current.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      alert("Center already exists");
      setAdding(false);
      return;
    }
    const colorIndex = current.length % additionalColors.length;
    const newCenter = { label, color: additionalColors[colorIndex], parent: day };
    const updated = [...current, newCenter];
    saveCenters(updated);
    setCenters(updated);
    setNewCenterName("");
    setShowAddModal(false);
    setAdding(false);
  };

  const parentLabel = currentCenter.parent || "";
  const displayLabel = isSubCenter ? `${parentLabel} / ${day}` : day;

  return (
    <AdminLayout
      title={`Loan Apply — ${displayLabel}`}
      description={isSubCenter ? `Customers in ${day}` : `Centers and customers for ${day}`}
    >
      <div className="mx-auto w-full max-w-2xl flex flex-col gap-4">

        {/* Back button */}
        <button
          type="button"
          onClick={() => navigate(isSubCenter ? `/dashboard/loan-apply-day/${encodeURIComponent(parentLabel)}` : "/dashboard/loan-apply")}
          className="inline-flex items-center gap-2 self-start rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          {isSubCenter ? `Back to ${parentLabel}` : "Back to days"}
        </button>

        {/* Header card */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-blue-600">{displayLabel}</p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                {isSubCenter ? "Customers" : "Centers"}
              </h3>
            </div>
            <div className="flex gap-2">
              {/* Centre Sheet button — always visible */}
              <button
                type="button"
                onClick={() => navigate(`/dashboard/image-details`, { state: { filterDay: day } })}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <FileSearch className="h-4 w-4" />
                Centre Sheet
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate("/dashboard/customer?create=1", {
                    state: {
                      selectedDay: currentCenter.parent || day,
                      selectedCenter: isSubCenter ? day : "",
                    },
                  })
                }
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              >
                <Plus className="h-4 w-4" />
                Create customer
              </button>
              {/* Add inner center — only on day centers (not sub-centers) */}
              {!isSubCenter && (
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-100"
                >
                  <Plus className="h-4 w-4" />
                  Add center
                </button>
              )}
              {isViewMode && (
                <button
                  type="button"
                  onClick={handleEdit}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
              )}
            </div>
          </div>

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Loading...
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          {saveError && (
            <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {saveError}
            </div>
          )}

          {/* ── DAY CENTER: show sub-centers ── */}
          {!isSubCenter && !loading && (
            <div className="mb-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Centers inside {day}
              </p>
              {childCenters.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {childCenters.map((child) => {
                    const count = allCustomers.filter((c) => c.selectedDay === child.label).length;
                    return (
                      <button
                        key={child.label}
                        type="button"
                        onClick={() => navigate(`/dashboard/loan-apply-day/${encodeURIComponent(child.label)}`)}
                        className={`relative flex items-center gap-3 rounded-2xl border p-4 text-left transition hover:shadow-sm ${child.color}`}
                      >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white/80 ${child.color}`}>
                          <UsersRound className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{child.label}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {count > 0 ? `${count} customer${count > 1 ? "s" : ""}` : "No customers"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                  No centers yet. Add one above.
                </div>
              )}
            </div>
          )}

          {/* ── SUB-CENTER ONLY: show customers ── */}
          {!loading && isSubCenter && (
            <>
              {/* VIEW MODE */}
              {isViewMode && (
                <div className="space-y-3">
                  {assignedCustomers.map((customer, index) => (
                    <button
                      key={customer.customerId}
                      type="button"
                      onClick={() => navigate(`/dashboard/loan-apply/${customer.customerId}`, { state: { customer } })}
                      className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{customer.customerName || "Unnamed"}</p>
                        <p className="text-xs text-slate-500">{customer.mobileNumber}</p>
                        <p className="text-xs text-slate-400">{customer.identityType} · {customer.identityNumber}</p>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-blue-500 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {/* SELECT / EDIT MODE */}
              {(isEditMode || (!isViewMode)) && (
                <>
                  <div className="space-y-3">
                    {selectableCustomers.map((customer, index) => {
                      const isSelected = selectedIds.includes(customer.customerId);
                      const alreadyThisDay = customer.selectedDay === day;
                      const alreadyParentDay = customer.selectedDay === currentCenter.parent;
                      return (
                        <button
                          key={customer.customerId}
                          type="button"
                          onClick={() => toggleSelect(customer.customerId)}
                          className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition ${
                            isSelected ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                          }`}
                        >
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition ${
                            isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                          }`}>
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{customer.customerName || "Unnamed"}</p>
                            <p className="text-xs text-slate-500">{customer.mobileNumber}</p>
                            <p className="text-xs text-slate-400">{customer.identityType} · {customer.identityNumber}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {alreadyThisDay && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                {day}
                              </span>
                            )}
                            {alreadyParentDay && (
                              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                {currentCenter.parent}
                              </span>
                            )}
                            {isSelected && <CheckCircle2 className="h-5 w-5 text-blue-600" />}
                          </div>
                        </button>
                      );
                    })}

                    {selectableCustomers.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                        No customers available to assign.
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex gap-3">
                    {isEditMode && (
                      <button
                        type="button"
                        onClick={() => setIsEditMode(false)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={selectedIds.length === 0 || saving}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? "Saving..." : `Save (${selectedIds.length})`}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>

      {/* Add center modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900">Add New Center</h3>
            <p className="mt-1 text-sm text-slate-500">Enter the center name inside {day}.</p>
            <input
              value={newCenterName}
              onChange={(e) => setNewCenterName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCenter()}
              className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
              placeholder="Enter center name"
            />
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCenter}
                disabled={adding || !newCenterName.trim()}
                className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {adding ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
