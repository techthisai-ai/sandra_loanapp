import { getInstallmentAmount } from "./customerProfileSchedule.js";

function getCustomerInstallmentDue(customer) {
  const totalPayable = Number(customer?.totalPayable || 0);
  return getInstallmentAmount(customer, totalPayable);
}

/** Admin / collection table label for an amount entry row. */
export function resolveCollectionEntryDisplayStatus(entry, customer) {
  const raw = String(entry?.collectionStatus || "Collected").trim();
  if (raw === "Partial Payment" || raw === "Partially paid" || raw === "Partially Paid") {
    return "Partially Paid";
  }
  if (raw !== "Collected") return raw;

  const amount = Number(entry?.amount || 0);
  const installmentDue = getCustomerInstallmentDue(customer);
  if (installmentDue > 0 && amount > 0 && amount < installmentDue) {
    return "Partially Paid";
  }

  return "Collected";
}
