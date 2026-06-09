import { calculateLoanValues } from "./loanCalculation.js";
import { getCollectionIntervalDays, normalizeCollectionFrequency } from "./loanTimelineDates.js";
import { resolveCustomerCenterDisplay } from "./centerDisplay.js";
import { getCenterMatchLabels } from "./employeeScope.js";
import { isActiveCustomerRecord } from "./recordFlags.js";

const LOAN_MERGE_FIELDS = [
  "loanAmount",
  "loanWeeks",
  "weeklyDue",
  "emiAmount",
  "totalPayable",
  "interestAmount",
  "disbursementDate",
  "dueDate",
  "collectionFrequency",
  "approvalStatus",
  "loanApprovedAt",
  "nomineeName",
  "nomineeContact",
  "selectedDay",
  "parentCenterLabel",
  "subCenterLabel",
  "customerName",
  "mobileNumber",
];

function hasUsableValue(value) {
  if (value == null || value === "") return false;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return true;
}

function pickLoanField(customerValue, applicationValue) {
  if (hasUsableValue(customerValue)) return customerValue;
  if (hasUsableValue(applicationValue)) return applicationValue;
  return customerValue ?? applicationValue ?? "";
}

export function mergeCustomersWithLoanApplications(customers = [], applications = []) {
  const latestByCustomer = new Map();
  applications.forEach((application) => {
    const customerId = application?.customerId;
    if (!customerId) return;
    const previous = latestByCustomer.get(customerId);
    if (!previous || String(application.submittedAt || "") > String(previous.submittedAt || "")) {
      latestByCustomer.set(customerId, application);
    }
  });

  return customers.map((customer) => {
    const application = latestByCustomer.get(customer.customerId);
    if (!application) return customer;

    const merged = { ...customer };
    LOAN_MERGE_FIELDS.forEach((field) => {
      merged[field] = pickLoanField(customer[field], application[field]);
    });
    return merged;
  });
}

function computeDueDate(disbursementDate, loanWeeks, collectionFrequency) {
  const baseDate = disbursementDate ? new Date(disbursementDate) : new Date();
  if (Number.isNaN(baseDate.getTime())) return "";
  const weeks = Math.max(Number(loanWeeks || 0), 1);
  const intervalDays = getCollectionIntervalDays(collectionFrequency || "Weekly");
  const end = new Date(baseDate);
  end.setDate(end.getDate() + weeks * intervalDays);
  return end.toISOString().slice(0, 10);
}

export function enrichCustomerForCollection(customer) {
  if (!customer) return customer;

  const loanAmount = Number(customer.loanAmount || 0);
  let loanWeeks = Math.max(Number(customer.loanWeeks || 0), 0);
  const frequency = normalizeCollectionFrequency(customer.collectionFrequency);
  const preset =
    Number(customer.loanPresetTotalPayable || 0) > 0
      ? {
          emiAmount: Number(customer.loanPresetEmiAmount || customer.emiAmount || customer.weeklyDue || 0),
          totalPayable: Number(customer.loanPresetTotalPayable || 0),
          loanAmount: Number(customer.loanPresetLoanAmount || loanAmount),
          loanWeeks: Number(customer.loanPresetLoanWeeks || loanWeeks),
        }
      : null;

  if (loanAmount > 0 && !loanWeeks) loanWeeks = Math.max(Number(customer.loanPresetLoanWeeks || 0), 20);

  const calculated = calculateLoanValues({
    loanAmount,
    loanWeeks,
    preset,
  });

  const disbursementDate =
    customer.disbursementDate ||
    (customer.loanApprovedAt ? String(customer.loanApprovedAt).slice(0, 10) : "") ||
    (customer.submittedAt ? String(customer.submittedAt).slice(0, 10) : "") ||
    new Date().toISOString().slice(0, 10);

  const weeklyDue = Number(customer.weeklyDue || customer.emiAmount || calculated.emiAmount || 0);
  const resolvedWeeks = loanWeeks || calculated.loanWeeks || 0;
  const resolvedEmi = Number(customer.emiAmount || weeklyDue || calculated.emiAmount || 0);
  let totalPayable = Number(customer.totalPayable || calculated.totalPayable || 0);
  if (totalPayable <= 0 && resolvedEmi > 0 && resolvedWeeks > 0) {
    totalPayable = resolvedEmi * resolvedWeeks;
  }

  return {
    ...customer,
    loanAmount: loanAmount || calculated.loanAmount,
    loanWeeks: resolvedWeeks || (loanAmount > 0 ? 1 : 0),
    weeklyDue,
    emiAmount: resolvedEmi,
    totalPayable,
    interestAmount: Number(customer.interestAmount || calculated.interestAmount || 0),
    disbursementDate,
    dueDate: customer.dueDate || computeDueDate(disbursementDate, loanWeeks || calculated.loanWeeks, frequency),
    collectionFrequency: frequency,
  };
}

export function hasValidLoanForCollection(customer) {
  const enriched = enrichCustomerForCollection(customer);
  const loanAmount = Number(enriched.loanAmount || 0);
  const loanWeeks = Number(enriched.loanWeeks || 0);
  const totalPayable = Number(enriched.totalPayable || 0);
  const weeklyDue = Number(enriched.weeklyDue || enriched.emiAmount || 0);

  if (loanAmount > 0 && loanWeeks > 0) return true;
  if (totalPayable > 0 && loanWeeks > 0) return true;
  if (loanAmount > 0 && totalPayable > 0) return true;
  if (loanAmount > 0 && weeklyDue > 0) return true;
  return false;
}

export function isCollectionEligibleCustomer(customer) {
  if (!isActiveCustomerRecord(customer)) return false;
  if (String(customer.approvalStatus || "").toLowerCase() === "rejected") return false;
  return hasValidLoanForCollection(customer);
}

export function prepareCustomersForCollectionReport(customers = [], loanApplications = []) {
  const merged = mergeCustomersWithLoanApplications(customers, loanApplications);
  const knownIds = new Set(merged.map((customer) => customer.customerId).filter(Boolean));

  loanApplications.forEach((application) => {
    const customerId = application?.customerId;
    if (!customerId || knownIds.has(customerId)) return;
    knownIds.add(customerId);
    merged.push({
      customerId,
      customerName: application.customerName,
      mobileNumber: application.mobileNumber,
      ...application,
    });
  });

  return merged.map(enrichCustomerForCollection).filter(isCollectionEligibleCustomer);
}

export function customerMatchesEmployeeCenters(customer, assignedCenter, allCenters) {
  const { dayCenter, subCenter } = resolveCustomerCenterDisplay(customer, allCenters);
  const matchLabels = new Set(getCenterMatchLabels(assignedCenter, allCenters));
  const labels = [customer.selectedDay, dayCenter, subCenter]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return labels.some((label) => matchLabels.has(label));
}
