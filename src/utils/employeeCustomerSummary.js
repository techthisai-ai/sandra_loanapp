import { NO_CENTER_LABEL, NO_SUB_CENTER_LABEL, resolveCustomerCenterDisplay } from "./centerDisplay.js";
import { buildCustomerDetailRow } from "./employeeCollectionDetails.js";

export function getEmployeeCustomerCenterLabel(customer, allCenters = []) {
  const { dayCenter, subCenter } = resolveCustomerCenterDisplay(customer, allCenters);
  if (subCenter && subCenter !== NO_SUB_CENTER_LABEL) return subCenter;
  if (dayCenter && dayCenter !== NO_CENTER_LABEL) return dayCenter;
  return customer?.selectedDay || "—";
}

export function getEmployeeCustomerPlaceLabel(customer, allCenters = []) {
  const address = String(customer?.address || customer?.place || customer?.location || "").trim();
  if (address) return address;
  return getEmployeeCustomerCenterLabel(customer, allCenters);
}

export function getEmployeeCustomerSearchText(customer, summary, allCenters = []) {
  const { dayCenter, subCenter } = resolveCustomerCenterDisplay(customer, allCenters);
  return [
    summary.customerName,
    summary.customerId,
    summary.phoneNumber,
    summary.centerLabel,
    getEmployeeCustomerPlaceLabel(customer, allCenters),
    customer?.address,
    customer?.place,
    customer?.location,
    customer?.selectedDay,
    customer?.parentCenterLabel,
    customer?.subCenterLabel,
    dayCenter,
    subCenter,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function buildEmployeeCustomerSummary(customer, customerEntries = [], allCenters = []) {
  const detail = buildCustomerDetailRow(customer, customerEntries);
  const centerLabel = getEmployeeCustomerCenterLabel(customer, allCenters);
  return {
    customerId: detail.customerId || "—",
    customerName: detail.customerName || "—",
    phoneNumber: detail.phoneNumber || "—",
    centerLabel,
    placeLabel: getEmployeeCustomerPlaceLabel(customer, allCenters),
    currentDueAmount: detail.currentTenureAmount || "—",
    pendingTenuresLabel: detail.pendingTenuresLabel || "—",
    loanDate: detail.loanDate || "—",
    currentTenure: detail.currentTenure || "—",
  };
}

export const EMPLOYEE_CUSTOMER_DETAIL_FIELDS = [
  { key: "customerId", label: "Customer ID" },
  { key: "customerName", label: "Name" },
  { key: "phoneNumber", label: "Phone Number" },
  { key: "centerLabel", label: "Center" },
  { key: "currentDueAmount", label: "Current Due" },
  { key: "pendingTenuresLabel", label: "Pending Tenure" },
  { key: "loanDate", label: "Loan Date" },
  { key: "currentTenure", label: "Current Tenure" },
];
