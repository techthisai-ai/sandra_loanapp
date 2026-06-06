import { getCustomersForAssignedCenter, loadEmployeeCenters } from "./employeeScope.js";
import {
  customerMatchesEmployeeCenters,
  isCollectionEligibleCustomer,
} from "./collectionCustomerUtils.js";

export function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function normalizeEmployeeId(value) {
  return String(value || "").trim().toUpperCase();
}

export function validateEmployeeId(value) {
  const employeeId = normalizeEmployeeId(value);
  if (!employeeId) return "Employee ID is required.";
  if (employeeId.length < 2) return "Employee ID must be at least 2 characters.";
  return "";
}

export function employeeLoginEmail(username) {
  const slug = normalizeUsername(username);
  return `${slug || "employee"}@employees.loanweb`;
}

export function validateAadhaarNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 12) return "Aadhaar number must be exactly 12 digits.";
  return "";
}

export function validateEmployeePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 10) return "Mobile number must be exactly 10 digits.";
  return "";
}

/** De-dupe centre labels and drop parent day labels when specific sub-centres are assigned. */
export function pruneAssignedCenters(centers = [], allCenters = loadEmployeeCenters()) {
  const normalized = [
    ...new Set(
      (Array.isArray(centers) ? centers : [centers])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    ),
  ];
  const selected = new Set(normalized);
  allCenters
    .filter((center) => !center.parent)
    .forEach((root) => {
      const subs = allCenters.filter((center) => center.parent === root.label).map((center) => center.label);
      if (subs.some((sub) => selected.has(sub))) {
        selected.delete(root.label);
      }
    });
  return [...selected].sort((a, b) => a.localeCompare(b));
}

export function getEmployeeAssignedCenters(employee, allCenters = loadEmployeeCenters()) {
  if (Array.isArray(employee?.assignedCenters)) {
    return pruneAssignedCenters(employee.assignedCenters, allCenters);
  }
  const legacy = String(employee?.location || "").trim();
  return legacy ? pruneAssignedCenters([legacy], allCenters) : [];
}

export function formatAssignedCentersLabel(employee) {
  const centers = getEmployeeAssignedCenters(employee);
  if (!centers.length) return "--";
  return centers.join(", ");
}

export function getCustomersForEmployeeCenters(customers, employee, allCenters = loadEmployeeCenters()) {
  const centers = getEmployeeAssignedCenters(employee);
  if (!centers.length) return [];
  const seen = new Set();
  const result = [];
  centers.forEach((center) => {
    getCustomersForAssignedCenter(customers, center, allCenters).forEach((customer) => {
      if (seen.has(customer.customerId)) return;
      seen.add(customer.customerId);
      result.push(customer);
    });
  });
  return result;
}

/** Collection report: eligible loan customers for an employee's assigned centres. */
export function getCollectionCustomersForEmployeeCenters(
  customers,
  employee,
  allCenters = loadEmployeeCenters()
) {
  const eligible = customers.filter(isCollectionEligibleCustomer);
  const centers = getEmployeeAssignedCenters(employee);
  if (!centers.length) return eligible;

  const seen = new Set();
  const result = [];
  centers.forEach((center) => {
    eligible.forEach((customer) => {
      if (!customerMatchesEmployeeCenters(customer, center, allCenters)) return;
      if (seen.has(customer.customerId)) return;
      seen.add(customer.customerId);
      result.push(customer);
    });
  });
  return result;
}

export function employeeMatchesCollector(employee, entry) {
  const collector = String(entry?.collectorName || entry?.createdBy || "").trim().toLowerCase();
  if (!collector) return false;
  const aliases = [
    employee?.displayName,
    employee?.username,
    employee?.employeeId,
    employee?.email?.split("@")[0],
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  return aliases.includes(collector);
}
