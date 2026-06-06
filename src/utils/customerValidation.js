function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizePhoneNumber(value) {
  return digitsOnly(value).slice(-10);
}

export function normalizeIdentityValue(value) {
  return normalizeText(value).replace(/\s+/g, "").toUpperCase();
}

export function validatePhoneNumber(value, label = "Phone number") {
  const phone = normalizePhoneNumber(value);

  if (!phone) {
    return `Enter ${label.toLowerCase()}`;
  }

  if (phone.length !== 10) {
    return `${label} must contain 10 digits`;
  }

  return "";
}

/** Canonical identity types shown in customer forms (keep in sync with UI selects). */
export const IDENTITY_TYPE_OPTIONS = [
  "Aadhaar Card",
  "PAN Card",
  "Voter ID",
  "Driving License",
  "Passport",
];

/**
 * @param {unknown} identityType
 * @returns {string} A value from {@link IDENTITY_TYPE_OPTIONS}
 */
export function coerceIdentityType(identityType) {
  const t = normalizeText(identityType);
  if (IDENTITY_TYPE_OPTIONS.includes(t)) return t;
  return "Aadhaar Card";
}

/**
 * @param {unknown} identityType
 * @param {unknown} identityNumber
 * @returns {string} Empty string if valid, otherwise a user-facing error message.
 */
export function validateIdentityNumber(identityType, identityNumber) {
  const normalizedType = coerceIdentityType(identityType);
  const rawValue = normalizeIdentityValue(identityNumber);

  if (!rawValue) {
    return "Enter the ID number";
  }

  if (normalizedType === "Aadhaar Card") {
    return digitsOnly(identityNumber).length === 12 ? "" : "Aadhaar number must contain 12 digits";
  }

  if (normalizedType === "Voter ID") {
    return /^[A-Z]{3}\d{7}$/i.test(rawValue) ? "" : "Voter ID must be 3 letters followed by 7 digits";
  }

  if (normalizedType === "PAN Card") {
    return /^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(rawValue) ? "" : "PAN must be 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)";
  }

  if (normalizedType === "Driving License") {
    return /^[A-Z0-9/-]{6,20}$/i.test(rawValue) ? "" : "Enter a valid driving licence number (6–20 letters/digits)";
  }

  if (normalizedType === "Passport") {
    return /^[A-PR-WYa-pr-wy][1-9]\d{6}$/.test(rawValue) ? "" : "Enter a valid 8-character passport number";
  }

  return "";
}

/**
 * Same as {@link validateIdentityNumber} but never throws (guards regex / edge cases).
 * @param {unknown} identityType
 * @param {unknown} identityNumber
 * @returns {string}
 */
export function safeValidateIdentityNumber(identityType, identityNumber) {
  try {
    return validateIdentityNumber(identityType, identityNumber);
  } catch {
    return "Unable to validate ID number. Check the format and try again.";
  }
}

/** Customer ID format: CUST- + 2-digit year + 3-digit running number (e.g. CUST-26001). */
export const CUSTOMER_ID_PATTERN = /^CUST-\d{5}$/;
export const CUSTOMER_ID_FORMAT_MESSAGE = "Customer ID must be in the format CUST-26001";

export function normalizeCustomerId(value) {
  return normalizeText(value).toUpperCase();
}

/**
 * Live input formatter: forces the mandatory "CUST-" prefix and limits the
 * numeric part to exactly 5 digits (2-digit year + 3-digit sequence).
 */
export function formatCustomerIdInput(value) {
  const upper = String(value || "").toUpperCase();
  const withoutPrefix = upper.replace(/^C?U?S?T?-?/, "");
  const digits = withoutPrefix.replace(/\D/g, "").slice(0, 5);
  return digits ? `CUST-${digits}` : "";
}

export function validateCustomerId(value) {
  const id = normalizeCustomerId(value);
  if (!id) return "Customer ID is required.";
  if (!CUSTOMER_ID_PATTERN.test(id)) return CUSTOMER_ID_FORMAT_MESSAGE;
  return "";
}

export function hasDuplicatePhone(customers, phoneNumber, customerId) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) return false;

  return customers.some((customer) => {
    if (customer.customerId === customerId) return false;

    const primary = normalizePhoneNumber(customer.mobileNumber);
    const alternate = normalizePhoneNumber(customer.alternateNumber);
    return normalizedPhone === primary || normalizedPhone === alternate;
  });
}

export function hasDuplicateIdentity(customers, identityNumber, customerId) {
  const normalizedIdentity = normalizeIdentityValue(identityNumber);
  if (!normalizedIdentity) return false;

  return customers.some((customer) => {
    if (customer.customerId === customerId) return false;
    return normalizeIdentityValue(customer.identityNumber) === normalizedIdentity;
  });
}
