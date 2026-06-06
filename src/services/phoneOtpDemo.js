/**
 * Demo phone OTP — replace with Twilio, MSG91, Firebase Phone Auth, Fast2SMS, etc.
 * Keep the same surface: generateOtp, validateOtpInput, buildDemoSmsPreview, maskPhoneForDisplay.
 */

export const DEMO_OTP_LENGTH = 6;
export const DEMO_OTP_EXPIRY_SEC = 60;
export const DEMO_OTP_RESEND_COOLDOWN_SEC = 30;
export const DEMO_OTP_MAX_ATTEMPTS = 5;
export const DEMO_OTP_BRAND = "Ruthra Financial Solutions";

/** @returns {string} 6-digit string */
export function generateDemoOtp() {
  const min = 10 ** (DEMO_OTP_LENGTH - 1);
  const max = 10 ** DEMO_OTP_LENGTH - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

export function maskPhoneForDisplay(digits) {
  const d = String(digits || "").replace(/\D/g, "").slice(-10);
  if (d.length < 4) return "••••••••••";
  return `******${d.slice(-4)}`;
}

export function buildDemoSmsPreview(otp, brand = DEMO_OTP_BRAND) {
  return `Dear Customer, your verification OTP is ${otp}. Valid for 5 minutes. - ${brand}`;
}

export function validateOtpInput(expected, input) {
  const a = String(expected || "").trim();
  const b = String(input || "").replace(/\D/g, "").trim();
  return a.length > 0 && b.length > 0 && a === b;
}
