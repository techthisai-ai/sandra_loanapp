import { useCallback, useMemo } from "react";
import useAuth from "./useAuth";
import {
  getCustomersForAssignedCenters,
  isCenterAccessibleToEmployee,
  loadEmployeeCenters,
  resolveEmployeeDayRoute,
} from "../utils/employeeScope";
import { formatAssignedCentersLabel, getEmployeeAssignedCenters } from "../utils/employeeManagement";

export default function useEmployeeCenterScope() {
  const { profile } = useAuth();
  const assignedCenters = useMemo(() => getEmployeeAssignedCenters(profile || {}), [profile]);
  const assignedCenter = assignedCenters[0] || "";
  const assignedCentersLabel = useMemo(() => formatAssignedCentersLabel(profile || {}), [profile]);
  const allCenters = useMemo(() => loadEmployeeCenters(), []);

  const scopeCustomers = useCallback(
    (customers) => getCustomersForAssignedCenters(customers, assignedCenters, allCenters),
    [assignedCenters, allCenters]
  );

  const canAccessCenter = useCallback(
    (centerLabel) => isCenterAccessibleToEmployee(centerLabel, assignedCenters, allCenters),
    [assignedCenters, allCenters]
  );

  const defaultDayRoute = useMemo(
    () => resolveEmployeeDayRoute(assignedCenter, allCenters),
    [assignedCenter, allCenters]
  );

  return {
    assignedCenter,
    assignedCenters,
    assignedCentersLabel,
    allCenters,
    hasAssignedCenter: assignedCenters.length > 0,
    scopeCustomers,
    canAccessCenter,
    defaultDayRoute,
  };
}
