import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, UsersRound } from "lucide-react";
import { EMPLOYEE_ROOT_DAYS } from "../constants/employeeDays";
import { EmployeeDayCardsSkeleton } from "../components/employee/EmployeePageSkeleton";
import useEmployeeCenterScope from "../hooks/useEmployeeCenterScope";
import {
  countCustomersForCenter,
  countCustomersForDay,
  employeeHasWholeDayAssignment,
  getAssignedSubCentersForDayCenter,
  getDayCentersFromAssignments,
  resolveEmployeeCentersLandingRoute,
} from "../utils/employeeScope";
import { useLoanDataSync } from "../context/LoanDataSyncContext";

export default function EmployeeCenters() {
  const navigate = useNavigate();
  const { customers, loading, error: syncError } = useLoanDataSync();
  const {
    assignedCenters,
    assignedCentersLabel,
    allCenters,
    hasAssignedCenter,
    canAccessCenter,
  } = useEmployeeCenterScope();

  const landingRoute = useMemo(
    () => resolveEmployeeCentersLandingRoute(assignedCenters, allCenters),
    [assignedCenters, allCenters]
  );

  useEffect(() => {
    if (!hasAssignedCenter || loading || !landingRoute) return;
    navigate(`/employee/customers/${encodeURIComponent(landingRoute)}`, { replace: true });
  }, [hasAssignedCenter, landingRoute, loading, navigate]);

  const visibleDays = useMemo(() => {
    if (!hasAssignedCenter) return EMPLOYEE_ROOT_DAYS;
    const dayLabels = getDayCentersFromAssignments(assignedCenters, allCenters);
    if (!dayLabels.length) return [];
    return EMPLOYEE_ROOT_DAYS.filter((day) => dayLabels.includes(day.label));
  }, [allCenters, assignedCenters, hasAssignedCenter]);

  const counts = useMemo(() => {
    const c = {};
    visibleDays.forEach(({ label }) => {
      if (!hasAssignedCenter) {
        c[label] = countCustomersForDay(customers, label, allCenters);
        return;
      }
      if (employeeHasWholeDayAssignment(label, assignedCenters, allCenters)) {
        c[label] = countCustomersForDay(customers, label, allCenters);
        return;
      }
      const allowedSubs = getAssignedSubCentersForDayCenter(label, assignedCenters, allCenters);
      c[label] = allowedSubs.reduce(
        (sum, subLabel) => sum + countCustomersForCenter(customers, subLabel, allCenters),
        0
      );
    });
    return c;
  }, [allCenters, assignedCenters, customers, hasAssignedCenter, visibleDays]);

  return (
    <div className="mx-auto w-full max-w-lg pb-1">
      <header className="app-panel mb-2.5 flex items-center gap-3 rounded-2xl px-3 py-2.5 sm:mb-3 sm:gap-3.5 sm:px-4 sm:py-3">
        <div className="app-icon-shell flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/70 sm:h-10 sm:w-10">
          <UsersRound className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="app-eyebrow text-[9px] font-semibold uppercase tracking-[0.2em] sm:text-[10px] sm:tracking-[0.22em]">
            Centres
          </p>
          <h1 className="text-base font-semibold leading-tight tracking-tight text-slate-950 sm:text-lg">Pick a day</h1>
        </div>
      </header>

      {syncError ? (
        <div className="mb-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 sm:text-sm">
          {syncError}. Pull to refresh or check your connection.
        </div>
      ) : null}

      {hasAssignedCenter ? (
        <p className="mb-2 rounded-2xl border border-blue-100 bg-blue-50/80 px-3 py-2 text-xs text-blue-900">
          Your assigned centres: <span className="font-semibold">{assignedCentersLabel}</span>
        </p>
      ) : (
        <p className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No centre assigned yet. All centres are shown until an administrator assigns your centre.
        </p>
      )}

      {loading ? (
        <EmployeeDayCardsSkeleton count={visibleDays.length || EMPLOYEE_ROOT_DAYS.length} />
      ) : visibleDays.length === 0 && hasAssignedCenter ? (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-600">
          No centres are available for your assignment yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5">
          {visibleDays.map((day) => {
            const count = counts[day.label] ?? 0;
            const accessible = canAccessCenter(day.label);
            return (
              <button
                key={day.label}
                type="button"
                disabled={!accessible}
                onClick={() => navigate(`/employee/customers/${encodeURIComponent(day.label)}`)}
                className={`relative flex min-h-[7.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-center shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] sm:min-h-[7.75rem] sm:gap-2 sm:rounded-[22px] sm:p-3.5 ${day.color}`}
              >
                {count > 0 ? (
                  <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-950 px-1 text-[10px] font-bold text-white shadow-sm sm:right-2.5 sm:top-2.5 sm:h-6 sm:min-w-6 sm:text-[11px]">
                    {count}
                  </span>
                ) : null}
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border bg-white/90 shadow-sm sm:h-10 sm:w-10 sm:rounded-2xl ${day.color}`}
                >
                  <CalendarDays className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                </div>
                <div className="min-w-0 px-0.5">
                  <p className="text-[11px] font-semibold leading-snug text-slate-950 sm:text-xs">{day.short}</p>
                  <p className="mt-0.5 line-clamp-2 text-[9px] leading-tight text-slate-600 sm:text-[10px]">
                    {day.label.replace(" Centre", "")}
                  </p>
                  <p className="mt-0.5 text-[9px] font-medium text-slate-500 sm:text-[10px]">
                    {count > 0 ? `${count} cust.` : "None"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
