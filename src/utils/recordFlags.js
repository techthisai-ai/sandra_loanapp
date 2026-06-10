/**
 * Firestore records may store booleans as strings ("false" / "true") from imports or manual edits.
 * Using `!value` would wrongly hide records where isDeleted/isArchived is the string "false".
 */
export function normalizeBooleanFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined || value === "") {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
  if (normalized === "false" || normalized === "no" || normalized === "0") return false;
  return Boolean(value);
}

export function isRecordDeleted(record) {
  return normalizeBooleanFlag(record?.isDeleted);
}

export function isRecordArchived(record) {
  return normalizeBooleanFlag(record?.isArchived);
}

/** Visible in live customer lists (not soft-deleted). */
export function isVisibleCustomerRecord(record) {
  return Boolean(record) && !isRecordDeleted(record);
}

export function isRejectedCustomerRecord(record) {
  return String(record?.approvalStatus || "").toLowerCase() === "rejected";
}

/** Active tab on admin Customer page (not deleted, archived, or rejected). */
export function isActiveCustomerRecord(record) {
  return (
    isVisibleCustomerRecord(record) && !isRecordArchived(record) && !isRejectedCustomerRecord(record)
  );
}
