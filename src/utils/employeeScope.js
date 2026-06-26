import { EMPLOYEE_ROOT_DAYS, loadLoanCenters } from "../constants/dayCenters";
import { NO_CENTER_LABEL, NO_SUB_CENTER_LABEL, resolveCustomerCenterDisplay } from "./centerDisplay.js";
import { isActiveCustomerRecord } from "./recordFlags.js";

/** Centres list: root weekdays plus optional extras from localStorage (same shape as day-customer screen). */
export function loadEmployeeCenters() {
  return loadLoanCenters();
}

/** Active customers that may appear on employee centre screens (not sheet/loan gated). */
export function isEmployeeVisibleCustomer(customer) {
  if (!isActiveCustomerRecord(customer)) return false;
  return Boolean(String(customer.customerId || customer.id || "").trim());
}

/** All centre labels associated with a customer (selectedDay + resolved parent/sub). */
export function getCustomerAssignableLabels(customer, allCenters = loadEmployeeCenters()) {
  const { dayCenter, subCenter } = resolveCustomerCenterDisplay(customer, allCenters);
  const labels = new Set();
  const selected = String(customer.selectedDay || "").trim();
  if (selected) labels.add(selected);
  if (dayCenter && dayCenter !== NO_CENTER_LABEL) labels.add(dayCenter);
  if (subCenter && subCenter !== NO_SUB_CENTER_LABEL && subCenter !== NO_CENTER_LABEL) {
    labels.add(subCenter);
  }
  return [...labels];
}

export function customerMatchesCenterLabel(customer, centerLabel, allCenters = loadEmployeeCenters()) {
  if (!isEmployeeVisibleCustomer(customer)) return false;
  const allowed = new Set(getCenterMatchLabels(centerLabel, allCenters));
  return getCustomerAssignableLabels(customer, allCenters).some((label) => allowed.has(label));
}

/** Customers assigned to a weekday centre (or a child centre under one). */
export function isEmployeeRoutedCustomer(customer, allCenters = loadEmployeeCenters()) {
  if (!isEmployeeVisibleCustomer(customer)) return false;
  return getCustomerAssignableLabels(customer, allCenters).some((label) => {
    if (isRootDayLabel(label, allCenters)) return true;
    const center = findCenterByLabel(label, allCenters);
    return Boolean(center?.parent);
  });
}

export function filterRoutedCustomers(customers, allCenters = loadEmployeeCenters()) {
  return customers.filter((customer) => isEmployeeRoutedCustomer(customer, allCenters));
}

export function getSubCenterLabels(dayLabel, allCenters = loadEmployeeCenters()) {
  return allCenters.filter((center) => center.parent === dayLabel).map((center) => center.label);
}

/** Active customers for a specific centre or sub-centre label. */
export function getCustomersForCenter(customers, centerLabel, allCenters = loadEmployeeCenters()) {
  return customers.filter((customer) => customerMatchesCenterLabel(customer, centerLabel, allCenters));
}

export function countCustomersForCenter(customers, centerLabel, allCenters = loadEmployeeCenters()) {
  return getCustomersForCenter(customers, centerLabel, allCenters).length;
}

/** Count customers under a weekday root (direct on root + all child centres). */
export function countCustomersForDay(customers, dayLabel, allCenters = loadEmployeeCenters()) {
  return getCustomersForAssignedCenter(customers, dayLabel, allCenters).length;
}

export function isRootDayLabel(label, allCenters = loadEmployeeCenters()) {
  return EMPLOYEE_ROOT_DAYS.some(({ label: root }) => root === label);
}

export function findCenterByLabel(label, allCenters = loadEmployeeCenters()) {
  return allCenters.find((center) => center.label === label) ?? null;
}

/** Dropdown options: day centres first, then sub-centres grouped under each parent. */
export function buildCenterAssignmentOptions(allCenters = loadEmployeeCenters()) {
  const roots = allCenters.filter((center) => !center.parent);
  const options = [];

  roots.forEach((root) => {
    options.push({
      value: root.label,
      label: root.label,
      group: "Day centres",
    });
    allCenters
      .filter((center) => center.parent === root.label)
      .sort((a, b) => a.label.localeCompare(b.label))
      .forEach((sub) => {
        options.push({
          value: sub.label,
          label: sub.label,
          group: root.label,
        });
      });
  });

  return options;
}

/** Labels used when matching a customer to a centre assignment (exact `selectedDay`). */
export function getCenterMatchLabels(assignedCenter, allCenters = loadEmployeeCenters()) {
  const label = String(assignedCenter || "").trim();
  if (!label) return [];

  if (isRootDayLabel(label, allCenters)) {
    const subLabels = getSubCenterLabels(label, allCenters);
    return [label, ...subLabels];
  }

  return [label];
}

export function customerMatchesAssignedCenter(customer, assignedCenter, allCenters = loadEmployeeCenters()) {
  return customerMatchesCenterLabel(customer, assignedCenter, allCenters);
}

/** Customers visible across multiple assigned centres (de-duplicated). */
export function getCustomersForAssignedCenters(customers, assignedCenters = [], allCenters = loadEmployeeCenters()) {
  const labels = Array.isArray(assignedCenters) ? assignedCenters.filter(Boolean) : [];
  if (!labels.length) return [];
  const seen = new Set();
  const result = [];
  labels.forEach((label) => {
    getCustomersForAssignedCenter(customers, label, allCenters).forEach((customer) => {
      if (seen.has(customer.customerId)) return;
      seen.add(customer.customerId);
      result.push(customer);
    });
  });
  return result;
}

/** Customers visible to an employee based on their assigned centre (root includes all sub-centres). */
export function getCustomersForAssignedCenter(customers, assignedCenter, allCenters = loadEmployeeCenters()) {
  const label = String(assignedCenter || "").trim();
  if (!label) return [];
  return customers.filter((customer) => customerMatchesCenterLabel(customer, label, allCenters));
}

export function countCustomersForAssignedCenter(customers, assignedCenter, allCenters = loadEmployeeCenters()) {
  return getCustomersForAssignedCenter(customers, assignedCenter, allCenters).length;
}

/** Whether an employee may open a centre route (day or sub-centre screen). */
export function isCenterAccessibleToEmployee(requestedCenter, assignedCenter, allCenters = loadEmployeeCenters()) {
  const centers = Array.isArray(assignedCenter)
    ? assignedCenter
    : String(assignedCenter || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
  if (!centers.length) return true;
  return centers.some((assigned) => isSingleCenterAccessibleToEmployee(requestedCenter, assigned, allCenters));
}

function isSingleCenterAccessibleToEmployee(requestedCenter, assignedCenter, allCenters = loadEmployeeCenters()) {
  const requested = String(requestedCenter || "").trim();
  const assigned = String(assignedCenter || "").trim();
  if (!assigned) return true;
  if (!requested) return false;
  if (requested === assigned) return true;

  if (isRootDayLabel(assigned, allCenters)) {
    const subLabels = getSubCenterLabels(assigned, allCenters);
    return requested === assigned || subLabels.includes(requested);
  }

  const assignedMeta = findCenterByLabel(assigned, allCenters);
  if (assignedMeta?.parent && requested === assignedMeta.parent) {
    return true;
  }

  return false;
}

// Fix recursive call - replace isCenterAccessibleToEmployee body

export function resolveEmployeeDayRoute(assignedCenter, allCenters = loadEmployeeCenters()) {
  const assigned = String(assignedCenter || "").trim();
  if (!assigned) return null;
  if (isRootDayLabel(assigned, allCenters)) return assigned;
  const center = findCenterByLabel(assigned, allCenters);
  if (center?.parent) return center.parent;
  return assigned;
}

/** Auto-navigation from the centres picker: single sub-centre only; otherwise stay on day list. */
export function resolveEmployeeCentersLandingRoute(assignedCenters = [], allCenters = loadEmployeeCenters()) {
  const labels = (Array.isArray(assignedCenters) ? assignedCenters : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (labels.length !== 1) return null;
  const only = labels[0];
  if (isRootDayLabel(only, allCenters)) return null;
  const center = findCenterByLabel(only, allCenters);
  return center?.parent ? only : only;
}

/** Day-centre labels implied by an employee's centre assignments (root or sub-centre parent). */
export function getDayCentersFromAssignments(assignedCenters = [], allCenters = loadEmployeeCenters()) {
  const days = new Set();
  (Array.isArray(assignedCenters) ? assignedCenters : []).forEach((label) => {
    const trimmed = String(label || "").trim();
    if (!trimmed) return;
    if (isRootDayLabel(trimmed, allCenters)) {
      days.add(trimmed);
      return;
    }
    const center = findCenterByLabel(trimmed, allCenters);
    if (center?.parent) days.add(center.parent);
  });
  return Array.from(days).sort((a, b) => a.localeCompare(b));
}

/** Whether the employee is assigned the full day centre (all sub-centres under it). */
export function employeeHasWholeDayAssignment(dayCenter, assignedCenters = [], allCenters = loadEmployeeCenters()) {
  const day = String(dayCenter || "").trim();
  return (Array.isArray(assignedCenters) ? assignedCenters : []).some(
    (label) => String(label || "").trim() === day && isRootDayLabel(label, allCenters)
  );
}

/** Sub-centre labels an employee may access under a day centre. */
export function getAssignedSubCentersForDayCenter(
  dayCenter,
  assignedCenters = [],
  allCenters = loadEmployeeCenters()
) {
  const day = String(dayCenter || "").trim();
  if (!day) return [];
  const allSubs = getSubCenterLabels(day, allCenters);
  const labels = (Array.isArray(assignedCenters) ? assignedCenters : []).filter(Boolean);
  if (!labels.length) return allSubs;
  if (employeeHasWholeDayAssignment(day, labels, allCenters)) return allSubs;

  const allowed = labels
    .filter((label) => !isRootDayLabel(label, allCenters))
    .map((label) => findCenterByLabel(label, allCenters))
    .filter((center) => center?.parent === day)
    .map((center) => center.label);

  return [...new Set(allowed)].sort((a, b) => a.localeCompare(b));
}

/** Sub-centre labels an employee may filter by across all assigned day centres. */
export function getEmployeeAssignedSubCenterOptions(assignedCenters = [], allCenters = loadEmployeeCenters()) {
  const labels = (Array.isArray(assignedCenters) ? assignedCenters : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!labels.length) return [];

  const options = new Set();
  getDayCentersFromAssignments(labels, allCenters).forEach((day) => {
    if (employeeHasWholeDayAssignment(day, labels, allCenters)) {
      options.add(NO_SUB_CENTER_LABEL);
      getSubCenterLabels(day, allCenters).forEach((sub) => options.add(sub));
      return;
    }
    getAssignedSubCentersForDayCenter(day, labels, allCenters).forEach((sub) => options.add(sub));
  });

  return Array.from(options).sort((left, right) => left.localeCompare(right));
}
