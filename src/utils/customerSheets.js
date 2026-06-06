function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function getCustomerCountry(customer) {
  if (hasText(customer?.country)) {
    return customer.country.trim();
  }

  return "";
}

export function hasAppliedForLoan(customer) {
  const requiredTextFields = [
    customer?.customerName,
    customer?.mobileNumber,
    customer?.identityType,
    customer?.identityNumber,
    customer?.address,
    customer?.selectedDay,
    customer?.nomineeName,
    customer?.nomineeContact,
  ];

  const hasRequiredText = requiredTextFields.every(hasText);
  const hasRequiredNumbers = [
    customer?.loanAmount,
    customer?.loanWeeks,
    customer?.weeklyDue,
    customer?.totalPayable,
  ].every((value) => Number(value) > 0);

  return hasRequiredText && hasRequiredNumbers;
}

export function isCustomerSheetReady(customer) {
  return hasAppliedForLoan(customer);
}

export {
  enrichCustomerForCollection,
  hasValidLoanForCollection,
  isCollectionEligibleCustomer,
  mergeCustomersWithLoanApplications,
  prepareCustomersForCollectionReport,
} from "./collectionCustomerUtils.js";
