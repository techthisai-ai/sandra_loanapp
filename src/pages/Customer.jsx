import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Eye,
  FileText,
  Filter,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import {
  deleteCustomer,
  listSoftDeletedCustomers,
  restoreAllDeletedCustomers,
  restoreCustomer,
} from "../services/userAuth";
import FirebaseSyncAlert from "../components/FirebaseSyncAlert";
import AdminLayout from "../components/dashboard/AdminLayout";
import { CUSTOMER_DAY_FILTER_OPTIONS, loadCentersWithDay } from "../constants/dayCenters";
import useAuth from "../hooks/useAuth";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import { preloadCustomerCreatePage } from "../utils/customerCreateRouteLoader";
import { isActiveCustomerRecord } from "../utils/recordFlags";
const DAY_FILTERS = CUSTOMER_DAY_FILTER_OPTIONS;

const FAVORITES_STORAGE_KEY = "loanCustomerFavorites";

function formatLoanAmount(value) {
  if (value == null || Number(value) <= 0) return "—";
  return `₹${Number(value).toLocaleString("en-IN")}`;
}

function loadFavoriteIds() {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id.trim()) : [];
  } catch {
    return [];
  }
}

function loadAllCenters() {
  return loadCentersWithDay();
}

function getCenterLabelsForDay(day, allCenters) {
  const root = allCenters.find((center) => center.day === day || center.label === `${day} Centre`);
  if (!root) return new Set();
  const labels = new Set([root.label]);
  allCenters.forEach((center) => {
    if (center.parent === root.label) {
      labels.add(center.label);
    }
  });
  return labels;
}

function Avatar({ name, size = "md" }) {
  const initials = useMemo(() => {
    if (!name) return "?";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("")
      .slice(0, 2);
  }, [name]);

  const box = size === "sm" ? "h-7 w-7 rounded-lg text-[10px]" : "h-9 w-9 rounded-xl text-xs";

  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-blue-600 to-blue-700 font-bold text-white shadow-sm ${box}`}
    >
      {initials}
    </div>
  );
}

function ActionPanel({ customer, isAdmin, onView, onApplyLoan, onDelete }) {
  const iconButtonClass =
    "inline-flex h-9 w-9 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-xl border transition active:scale-[0.97]";

  return (
    <div className="group/action isolate flex w-fit min-w-0 flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white/80 p-2 shadow-sm shadow-slate-900/5 ring-1 ring-slate-100/80 transition hover:border-blue-200/70 hover:shadow-md hover:shadow-slate-900/10">
      <Link
        to={`/dashboard/customer/${customer.customerId}`}
        state={{ customerId: customer.customerId }}
        className={`${iconButtonClass} border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`}
        aria-label="Edit customer"
        title="Edit"
      >
        <Pencil className="h-4 w-4 shrink-0" aria-hidden />
      </Link>
      <button
        type="button"
        onClick={() => onView(customer)}
        className={`${iconButtonClass} border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`}
        aria-label="View customer details"
        title="View details"
      >
        <Eye className="h-4 w-4 shrink-0" aria-hidden />
      </button>
      {isAdmin ? (
        <button
          type="button"
          onClick={() => onDelete(customer)}
          className={`${iconButtonClass} border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100/70`}
          aria-label={`Delete ${customer.customerName || "customer"}`}
          title="Delete"
        >
          <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onApplyLoan(customer)}
        className="inline-flex w-auto shrink-0 cursor-pointer touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 px-3 py-2 text-[11px] font-semibold text-white shadow-md shadow-blue-600/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-600/30 active:translate-y-0 active:scale-[0.99]"
        aria-label="Apply loan for this customer"
      >
        <FileText className="h-3.5 w-3.5 shrink-0 opacity-95" aria-hidden />
        Apply loan
      </button>
    </div>
  );
}

export default function Customer() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const { customers, loading, error } = useLoanDataSync();
  const [dayFilter, setDayFilter] = useState("All");
  const [centerFilter, setCenterFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [favoriteIds, setFavoriteIds] = useState(loadFavoriteIds);
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deletedCustomers, setDeletedCustomers] = useState([]);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [restoringId, setRestoringId] = useState("");
  const [restoringAll, setRestoringAll] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);
  const filterRef = useRef(null);

  const isAdmin = profile?.role === "admin";
  const listLoading = statusFilter === "Deleted" ? deletedLoading : loading;

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
    } catch {
      /* ignore quota */
    }
  }, [favoriteIds]);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const favoriteCount = useMemo(
    () => favoriteIds.filter((id) => customers.some((c) => c.customerId === id)).length,
    [favoriteIds, customers]
  );

  useEffect(() => {
    if (customers.length === 0) return;
    setFavoriteIds((ids) => {
      const next = ids.filter((id) => customers.some((c) => c.customerId === id));
      return next.length === ids.length ? ids : next;
    });
  }, [customers]);

  const toggleFavorite = useCallback((customerId) => {
    setFavoriteIds((prev) =>
      prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId]
    );
  }, []);

  const allCenters = useMemo(() => loadAllCenters(), []);

  const loadDeletedCustomers = useCallback(async () => {
    if (!isAdmin) return;
    setDeletedLoading(true);
    try {
      const rows = await listSoftDeletedCustomers();
      setDeletedCustomers(rows);
    } catch (loadError) {
      setToastError(loadError.message || "Unable to load deleted customers.");
    } finally {
      setDeletedLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (statusFilter === "Deleted" && isAdmin) {
      loadDeletedCustomers();
    }
  }, [statusFilter, isAdmin, loadDeletedCustomers]);

  useEffect(() => {
    if (!isAdmin) return;
    listSoftDeletedCustomers()
      .then((rows) => setDeletedCount(rows.length))
      .catch(() => setDeletedCount(0));
  }, [isAdmin, customers.length]);

  const scopedCustomers = useMemo(() => {
    if (statusFilter === "Deleted") {
      return deletedCustomers;
    }
    if (statusFilter === "Favourite") {
      return customers.filter((c) => favoriteSet.has(c.customerId));
    }
    return customers.filter(isActiveCustomerRecord);
  }, [customers, deletedCustomers, statusFilter, favoriteSet]);

  const centerOptions = useMemo(() => {
    const labels = new Set();
    allCenters.forEach((center) => labels.add(center.label));
    scopedCustomers.forEach((customer) => {
      if (customer.selectedDay) labels.add(customer.selectedDay);
    });
    return ["All", ...Array.from(labels).sort((a, b) => a.localeCompare(b)), "No Centre"];
  }, [allCenters, scopedCustomers]);

  const dayCount = useMemo(() => {
    const counts = { All: scopedCustomers.length };
    DAY_FILTERS.slice(1).forEach((day) => {
      if (day === "No Centre") {
        counts[day] = scopedCustomers.filter((c) => !c.selectedDay).length;
      } else {
        const labels = getCenterLabelsForDay(day, allCenters);
        counts[day] = scopedCustomers.filter((c) => labels.has(c.selectedDay)).length;
      }
    });
    return counts;
  }, [scopedCustomers, allCenters]);

  const filtered = useMemo(() => {
    let list = scopedCustomers;

    if (dayFilter === "No Centre") {
      list = list.filter((c) => !c.selectedDay);
    } else if (dayFilter !== "All") {
      const labels = getCenterLabelsForDay(dayFilter, allCenters);
      list = list.filter((c) => labels.has(c.selectedDay));
    }

    if (centerFilter === "No Centre") {
      list = list.filter((c) => !c.selectedDay);
    } else if (centerFilter !== "All") {
      list = list.filter((c) => c.selectedDay === centerFilter);
    }

    if (search.trim()) {
      const query = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.customerName?.toLowerCase().includes(query) ||
          c.mobileNumber?.includes(query) ||
          c.customerId?.toLowerCase().includes(query) ||
          c.identityNumber?.toLowerCase().includes(query) ||
          c.coApplicantName?.toLowerCase().includes(query) ||
          c.coApplicantContact?.includes(query)
      );
    }

    return list;
  }, [allCenters, centerFilter, dayFilter, scopedCustomers, search]);

  useEffect(() => {
    if (!filterOpen) return undefined;
    const handlePointerDown = (event) => {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [filterOpen]);

  const openCreate = () => {
    navigate("/dashboard/customer/new", {
      state: {
        selectedDay: location.state?.selectedDay || "",
        selectedCenter: location.state?.selectedCenter || "",
      },
    });
  };

  const handleViewDetails = useCallback(
    (customer) => {
      navigate(`/dashboard/customer/${customer.customerId}/profile`, {
        state: { customerId: customer.customerId },
      });
    },
    [navigate]
  );

  const handleApplyLoan = useCallback(
    (customer) => {
      navigate(`/dashboard/loan-apply/${customer.customerId}`, { state: { customer } });
    },
    [navigate]
  );

  const closeDeleteModal = useCallback(() => {
    if (deleting) return;
    setDeleteTarget(null);
  }, [deleting]);

  const handleRestoreCustomer = useCallback(
    async (customer) => {
      if (!isAdmin || restoringId) return;
      setRestoringId(customer.customerId || customer.id);
      setToastError("");
      try {
        await restoreCustomer(customer.customerId || customer.id, {
          actorName: profile?.displayName || profile?.email || "Admin",
          actorRole: "admin",
          firestoreDocId: customer.id,
        });
        setToast(`Restored ${customer.customerName || customer.customerId}.`);
        setDeletedCount((count) => Math.max(0, count - 1));
        await loadDeletedCustomers();
      } catch (restoreError) {
        setToastError(restoreError.message || "Unable to restore customer.");
      } finally {
        setRestoringId("");
      }
    },
    [isAdmin, loadDeletedCustomers, profile?.displayName, profile?.email, restoringId]
  );

  const handleRestoreAllDeleted = useCallback(async () => {
    if (!isAdmin || restoringAll || deletedCustomers.length === 0) return;
    if (
      !window.confirm(
        `Restore all ${deletedCustomers.length} deleted customer(s)? They will appear on the Active list again.`
      )
    ) {
      return;
    }
    setRestoringAll(true);
    setToastError("");
    try {
      const result = await restoreAllDeletedCustomers({
        actorName: profile?.displayName || profile?.email || "Admin",
        actorRole: "admin",
      });
      setToast(`Restored ${result.restoredCount} customer(s).`);
      setDeletedCustomers([]);
      setDeletedCount(0);
      setStatusFilter("Active");
    } catch (restoreError) {
      setToastError(restoreError.message || "Unable to restore deleted customers.");
    } finally {
      setRestoringAll(false);
    }
  }, [deletedCustomers.length, isAdmin, profile?.displayName, profile?.email, restoringAll]);

  const handleConfirmDelete = useCallback(async () => {
    if ((!deleteTarget?.customerId && !deleteTarget?.id) || deleting) return;
    if (!isAdmin) {
      setToastError("Only administrators can delete customers.");
      return;
    }

    setDeleting(true);
    setToastError("");
    try {
      await deleteCustomer(deleteTarget.customerId, {
        actorUid: user?.uid,
        actorName: profile?.displayName || profile?.email || "Admin",
        actorRole: profile?.role,
        firestoreDocId: deleteTarget.id,
      });
      setFavoriteIds((prev) => prev.filter((id) => id !== deleteTarget.customerId));
      setDeleteTarget(null);
      setToast("Customer deleted successfully");
      window.setTimeout(() => setToast(""), 4000);
    } catch (deleteError) {
      setToastError(deleteError.message || "Unable to delete customer.");
      window.setTimeout(() => setToastError(""), 5000);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting, isAdmin, profile, user?.uid]);

  const hasActiveCenterFilter = centerFilter !== "All";

  return (
    <AdminLayout
      title="Customer"
      description="Directory and onboarding."
      action={
        <button
          type="button"
          onClick={openCreate}
          onMouseEnter={preloadCustomerCreatePage}
          onFocus={preloadCustomerCreatePage}
          className="app-button-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          New customer
        </button>
      }
    >
      <div className="flex h-[calc(100vh-5.5rem)] w-full min-w-0 max-w-full flex-col gap-3 overflow-hidden px-0.5 md:px-0 lg:max-w-[min(1440px,100%)]">
        <FirebaseSyncAlert error={error} customerCount={customers.length} loading={loading} />
        {isAdmin && statusFilter === "Active" && deletedCount > 0 ? (
          <div className="shrink-0 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">{deletedCount} customer(s) are hidden (soft-deleted)</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900">
              They still exist in Firebase but were removed from the Active list. Open the{" "}
              <button
                type="button"
                onClick={() => setStatusFilter("Deleted")}
                className="font-semibold text-amber-950 underline"
              >
                Deleted
              </button>{" "}
              tab to restore them.
            </p>
          </div>
        ) : null}
        {toast ? (
          <div className="app-alert-success shrink-0 py-2 text-sm" role="status">
            {toast}
          </div>
        ) : null}
        {toastError ? (
          <div className="app-alert-error shrink-0 py-2 text-sm" role="alert">
            {toastError}
          </div>
        ) : null}

        <div className="grid min-h-0 min-w-0 w-full max-w-full flex-1 gap-3 overflow-hidden grid-cols-1">
          <div className="customer-module-panel flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 shadow-sm shadow-slate-900/5 ring-1 ring-slate-100/80">
            <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100/80 bg-white px-3 py-2">
              <div className="flex min-w-0 shrink-0 flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => setStatusFilter("Active")}
                  className={`inline-flex items-center gap-1.5 border-b-2 pb-2 text-sm font-semibold transition ${
                    statusFilter === "Active"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("Favourite")}
                  className={`inline-flex items-center gap-1.5 border-b-2 pb-2 text-sm font-semibold transition ${
                    statusFilter === "Favourite"
                      ? "border-violet-500 text-violet-700"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${statusFilter === "Favourite" ? "fill-current" : ""}`} />
                  Favourites
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-bold ${
                      statusFilter === "Favourite" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {favoriteCount}
                  </span>
                </button>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => setStatusFilter("Deleted")}
                    className={`inline-flex items-center gap-1.5 border-b-2 pb-2 text-sm font-semibold transition ${
                      statusFilter === "Deleted"
                        ? "border-rose-500 text-rose-700"
                        : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Deleted
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-bold ${
                        statusFilter === "Deleted" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {deletedCount}
                    </span>
                  </button>
                ) : null}
                {isAdmin && statusFilter === "Deleted" && deletedCustomers.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleRestoreAllDeleted}
                    disabled={restoringAll}
                    className="app-button-primary ml-auto rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    {restoringAll ? "Restoring…" : `Restore all (${deletedCustomers.length})`}
                  </button>
                ) : null}
              </div>

              <select
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) navigate(`/dashboard/customer/${id}`, { state: { customerId: id } });
                }}
                className="app-select w-full max-w-[min(220px,100%)] shrink-0 py-2 text-xs sm:max-w-xs"
              >
                <option value="">Jump to customer…</option>
                {scopedCustomers.map((c) => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.customerName || "Unnamed"} — {c.mobileNumber || c.customerId}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain border-b border-slate-100 px-3 py-2 [-webkit-overflow-scrolling:touch]">
              {DAY_FILTERS.map((day) => {
                const active = dayFilter === day;
                const count = dayCount[day] ?? 0;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setDayFilter(day)}
                    className={`customer-day-chip inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium shadow-sm transition ${
                      active
                        ? "customer-day-chip--active border-blue-500 bg-blue-600 text-white shadow-blue-600/15"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {day}
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-bold ${
                        active ? "bg-white/20 text-white" : "bg-white text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="shrink-0 border-b border-slate-100 px-3 py-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, phone, or ID..."
                    className="app-input w-full rounded-2xl bg-white py-2.5 text-sm shadow-sm shadow-slate-900/5 ring-1 ring-slate-100/80"
                    style={{ paddingLeft: "3rem", paddingRight: "1rem" }}
                    aria-label="Search customers"
                  />
                </div>

                <div className="relative shrink-0" ref={filterRef}>
                  <button
                    type="button"
                    onClick={() => setFilterOpen((open) => !open)}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                      hasActiveCenterFilter || filterOpen
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                    aria-expanded={filterOpen}
                    aria-haspopup="true"
                  >
                    <Filter className="h-4 w-4 shrink-0" aria-hidden />
                    Filter
                    {hasActiveCenterFilter ? (
                      <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">1</span>
                    ) : null}
                  </button>

                  {filterOpen ? (
                    <div className="absolute right-0 z-20 mt-2 w-[min(280px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/10">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Center</p>
                      <select
                        value={centerFilter}
                        onChange={(event) => setCenterFilter(event.target.value)}
                        className="app-select py-2 text-sm"
                        aria-label="Filter by center"
                      >
                        {centerOptions.map((option) => (
                          <option key={option} value={option}>
                            {option === "All" ? "All centers" : option}
                          </option>
                        ))}
                      </select>
                      {hasActiveCenterFilter ? (
                        <button
                          type="button"
                          onClick={() => setCenterFilter("All")}
                          className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
                        >
                          Clear center filter
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {listLoading ? (
                <div className="customer-loading-state py-12 text-sm">Loading customers…</div>
              ) : null}
              {error && statusFilter !== "Deleted" ? (
                <div className="app-alert-error mb-2 text-sm">{error}</div>
              ) : null}

              {!listLoading && (statusFilter === "Deleted" || !error) && filtered.length === 0 ? (
                <div className="app-empty-state py-12 text-sm">
                  {search.trim() ? (
                    `No matches for “${search.trim()}”.`
                  ) : statusFilter === "Favourite" ? (
                    <>
                      No favourite customers yet. Click the{" "}
                      <Star className="mx-0.5 inline-block h-3.5 w-3.5 align-text-bottom text-amber-500" /> on any row
                      while viewing Active customers to add one here.
                    </>
                  ) : statusFilter === "Deleted" ? (
                    "No deleted customers. All records are on the Active tab."
                  ) : (
                    `No ${statusFilter.toLowerCase()} customers here.`
                  )}
                </div>
              ) : null}

              {!listLoading && (statusFilter === "Deleted" || !error) && filtered.length > 0 ? (
                <div className="customer-table-wrap overflow-y-visible overflow-x-auto rounded-3xl border border-slate-200/70 bg-white shadow-sm shadow-slate-900/5 ring-1 ring-slate-100/80">
                  <table className="w-full min-w-[1020px] table-auto border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                      <tr>
                        <th scope="col" className="w-9 whitespace-nowrap px-3 py-2.5 text-center">
                          #
                        </th>
                        <th scope="col" className="w-8 whitespace-nowrap px-3 py-2.5 text-center" title="Favourite">
                          <span className="sr-only">Favourite</span>
                          <Star className="mx-auto h-3 w-3 text-slate-500" aria-hidden />
                        </th>
                        <th scope="col" className="min-w-[120px] whitespace-nowrap px-3 py-2.5 text-left">
                          Name
                        </th>
                        <th scope="col" className="min-w-[96px] whitespace-nowrap px-3 py-2.5 text-left">
                          Phone
                        </th>
                        <th scope="col" className="min-w-[120px] max-w-[180px] whitespace-nowrap px-3 py-2.5 text-left">
                          Co-applicant
                        </th>
                        <th scope="col" className="min-w-[88px] whitespace-nowrap px-3 py-2.5 text-left">
                          Center
                        </th>
                        <th scope="col" className="w-16 whitespace-nowrap px-3 py-2.5 text-right">
                          Loan
                        </th>
                        <th scope="col" className="min-w-[132px] whitespace-nowrap px-3 py-2.5 text-center">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filtered.map((customer, index) => {
                        const coName = customer.coApplicantName?.trim();
                        const coContact = customer.coApplicantContact?.trim();
                        const isFav = favoriteSet.has(customer.customerId);
                        return (
                          <tr
                            key={customer.customerId}
                            className="customer-row transition hover:bg-blue-50/35"
                          >
                            <td className="px-2 py-3 text-center align-middle text-[10px] font-bold text-slate-400">
                              {index + 1}
                            </td>
                            <td className="px-0 py-3 text-center align-middle">
                              <button
                                type="button"
                                onClick={() => toggleFavorite(customer.customerId)}
                                className={`rounded-md p-1 transition ${
                                  isFav
                                    ? "text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                                    : "text-slate-300 hover:bg-slate-100 hover:text-amber-400"
                                }`}
                                aria-label={isFav ? "Remove from favourites" : "Add to favourites"}
                                aria-pressed={isFav}
                              >
                                <Star className={`h-3.5 w-3.5 ${isFav ? "fill-amber-400 text-amber-600" : ""}`} />
                              </button>
                            </td>
                            <td className="max-w-0 px-2 py-3 align-middle">
                              <div className="flex min-w-0 items-center gap-2">
                                <Avatar name={customer.customerName} size="sm" />
                                <Link
                                  to={`/dashboard/customer/${customer.customerId}`}
                                  state={{ customerId: customer.customerId }}
                                  className="min-w-0 truncate text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                                >
                                  {customer.customerName || "Unnamed"}
                                </Link>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-2 py-3 align-middle text-slate-600">
                              {customer.mobileNumber || "—"}
                            </td>
                            <td className="max-w-[180px] px-2 py-3 align-middle text-slate-600" title={[coName, coContact].filter(Boolean).join(" · ")}>
                              {coName || coContact ? (
                                <span className="line-clamp-2">
                                  {coName ? <span className="font-medium text-slate-800">{coName}</span> : null}
                                  {coName && coContact ? <span className="text-slate-400"> · </span> : null}
                                  {coContact ? <span className="tabular-nums">{coContact}</span> : null}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-2 py-3 align-middle">
                              <span
                                className={`inline-block max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                                  customer.isArchived
                                    ? "border-amber-200 bg-amber-50 text-amber-800"
                                    : customer.selectedDay
                                      ? "border-blue-100 bg-blue-50 text-blue-700"
                                      : "border-slate-100 bg-slate-50 text-slate-500"
                                }`}
                                title={customer.isArchived ? "Archived" : customer.selectedDay || "No centre"}
                              >
                                {customer.isArchived ? "Archived" : customer.selectedDay || "No centre"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-2 py-3 text-right align-middle tabular-nums font-medium text-slate-700">
                              {formatLoanAmount(customer.loanAmount)}
                            </td>
                            <td className="align-middle p-2 text-center">
                              <div className="inline-flex justify-center">
                                {statusFilter === "Deleted" ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreCustomer(customer)}
                                    disabled={restoringId === (customer.customerId || customer.id)}
                                    className="app-button-primary rounded-xl px-3 py-2 text-[11px] font-semibold disabled:opacity-60"
                                  >
                                    {restoringId === (customer.customerId || customer.id) ? "Restoring…" : "Restore"}
                                  </button>
                                ) : (
                                  <ActionPanel
                                    customer={customer}
                                    isAdmin={isAdmin}
                                    onView={handleViewDetails}
                                    onApplyLoan={handleApplyLoan}
                                    onDelete={setDeleteTarget}
                                  />
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-slate-100 px-3 py-2 text-center text-[11px] text-slate-400">
              Showing {filtered.length} of {scopedCustomers.length}
            </div>
          </div>

        </div>
      </div>

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6"
          role="presentation"
          onClick={closeDeleteModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-customer-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="delete-customer-title" className="text-lg font-semibold text-slate-900">
              Delete Customer?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              This action will permanently remove the customer and related records. This cannot be undone.
            </p>
            <p className="mt-2 text-sm font-medium text-slate-800">
              {deleteTarget.customerName || deleteTarget.customerId}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleting}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-transparent bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}
