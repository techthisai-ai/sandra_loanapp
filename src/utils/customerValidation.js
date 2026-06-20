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

/** Validate phone only when the user entered a value. */
export function validatePhoneNumberIfProvided(value, label = "Phone number") {
  if (!String(value ?? "").trim()) return "";
  return validatePhoneNumber(value, label);
}

/** Validate ID only when the user entered a number. */
export function validateIdentityNumberIfProvided(identityType, identityNumber) {
  if (!normalizeIdentityValue(identityNumber)) return "";
  return safeValidateIdentityNumber(identityType, identityNumber);
}

/** Customer ID format: CX + 4-digit running number (e.g. CX0001). */
export const CUSTOMER_ID_PATTERN = /^CX\d{4}$/;
export const LEGACY_CUSTOMER_ID_PATTERN = /^CUST-/;
export const CUSTOMER_ID_FORMAT_MESSAGE = "Customer ID must be in the format CX0001";

export function normalizeCustomerId(value) {
  return normalizeText(value).toUpperCase();
}

/**
 * Live input formatter: forces the "CX" prefix and limits the numeric part to 4 digits.
 */
export function formatCustomerIdInput(value) {
  const upper = String(value || "").toUpperCase();
  const withoutPrefix = upper.replace(/^C?X?/, "");
  const digits = withoutPrefix.replace(/\D/g, "").slice(0, 4);
  return digits ? `CX${digits.padStart(4, "0")}` : "";
}

export function validateCustomerId(value, { allowLegacy = false } = {}) {
  const id = normalizeCustomerId(value);
  if (!id) return "Customer ID is required.";
  if (CUSTOMER_ID_PATTERN.test(id)) return "";
  if (allowLegacy && LEGACY_CUSTOMER_ID_PATTERN.test(id)) return "";
  return CUSTOMER_ID_FORMAT_MESSAGE;
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
