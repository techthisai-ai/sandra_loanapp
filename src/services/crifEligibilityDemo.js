/**
 * Demo CRIF eligibility — frontend-only mock for presentations.
 *
 * When integrating a paid CRIF API, add e.g. `src/services/crifEligibilityApi.js`
 * that exports `fetchCrifEligibility({ identityNumber, ... })` and switch the
 * import in `CustomerCreateProfessionalForm` (or a thin hook) from
 * `fetchDemoCrifEligibility` to the production client. Keep the same return shape
 * as {@link DemoCrifEligibilityResult} where possible.
 */

/** @typedef {"Excellent" | "Good" | "Risky"} CreditTier */

/**
 * @typedef {Object} DemoCrifEligibilityResult
 * @property {number} creditScore
 * @property {CreditTier} creditTier
 * @property {string} eligibilityStatus
 * @property {number} suggestedLoanAmountRupees
 * @property {string} suggestedLoanDisplay
 * @property {"Low" | "Medium" | "High"} riskLevel
 * @property {number} activeLoans
 * @property {string} paymentHistoryStatus
 * @property {string} healthStatus
 * @property {string} approvalChanceLabel
 * @property {number} approvalChancePercent
 * @property {number} emiCapacityRupees
 * @property {string} emiCapacityDisplay
 * @property {string} recommendedLoanLimitDisplay
 * @property {string} verificationStatus
 * @property {string} financialStability
 * @property {string} existingLoanStatus
 * @property {string} repaymentQuality
 * @property {string} checkedAt ISO timestamp
 * @property {true} demoMode
 */

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function formatInr(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * @param {number} score
 * @returns {CreditTier}
 */
export function creditTierFromScore(score) {
  if (score >= 750) return "Excellent";
  if (score >= 650) return "Good";
  return "Risky";
}

/**
 * Derives presentation fields from score (demo rules).
 * @param {number} creditScore
 * @returns {Pick<DemoCrifEligibilityResult, "eligibilityStatus" | "riskLevel" | "paymentHistoryStatus" | "suggestedLoanAmountRupees" | "suggestedLoanDisplay">}
 */
export function deriveDemoFieldsFromScore(creditScore) {
  const tier = creditTierFromScore(creditScore);

  let eligibilityStatus;
  let riskLevel;
  let paymentHistoryStatus;
  let suggestedLoanAmountRupees;
  let healthStatus;
  let approvalChanceLabel;
  let approvalChancePercent;
  let emiCapacityRupees;
  let verificationStatus;
  let financialStability;
  let repaymentQuality;

  if (creditScore >= 720) {
    eligibilityStatus = "Eligible";
    riskLevel = creditScore >= 780 ? "Low" : "Low";
    paymentHistoryStatus = "Good";
    suggestedLoanAmountRupees = randomInt(150000, 500000) + (creditScore - 720) * 1800;
    healthStatus = creditScore >= 780 ? "Excellent" : "Very good";
    approvalChanceLabel = creditScore >= 780 ? "High Approval Chance" : "Strong Approval Chance";
    approvalChancePercent = randomInt(82, 96);
    emiCapacityRupees = randomInt(18000, 42000);
    verificationStatus = "Pre-approved";
    financialStability = "Strong";
    repaymentQuality = "Strong";
  } else if (creditScore >= 600) {
    eligibilityStatus = "Review required";
    riskLevel = "Medium";
    paymentHistoryStatus = "Fair";
    suggestedLoanAmountRupees = randomInt(80000, 280000);
    healthStatus = "Moderate";
    approvalChanceLabel = "Manual Review Needed";
    approvalChancePercent = randomInt(48, 74);
    emiCapacityRupees = randomInt(9000, 22000);
    verificationStatus = "Needs verification";
    financialStability = "Moderate";
    repaymentQuality = "Average";
  } else {
    eligibilityStatus = "Not eligible";
    riskLevel = "High";
    paymentHistoryStatus = "Poor";
    suggestedLoanAmountRupees = randomInt(0, 120000);
    healthStatus = "Weak";
    approvalChanceLabel = "Low Approval Chance";
    approvalChancePercent = randomInt(12, 40);
    emiCapacityRupees = randomInt(3000, 9000);
    verificationStatus = "Hold";
    financialStability = "Fragile";
    repaymentQuality = "Weak";
  }

  suggestedLoanAmountRupees = Math.min(Math.max(Math.round(suggestedLoanAmountRupees), 0), 1_500_000);
  const suggestedLoanDisplay = formatInr(suggestedLoanAmountRupees);
  const emiCapacityDisplay = formatInr(emiCapacityRupees);
  const recommendedLoanLimitDisplay = formatInr(Math.round(suggestedLoanAmountRupees * 0.9));

  return {
    eligibilityStatus,
    riskLevel,
    paymentHistoryStatus,
    suggestedLoanAmountRupees,
    suggestedLoanDisplay,
    healthStatus,
    approvalChanceLabel,
    approvalChancePercent,
    emiCapacityRupees,
    emiCapacityDisplay,
    recommendedLoanLimitDisplay,
    verificationStatus,
    financialStability,
    repaymentQuality,
    creditTier: tier,
  };
}

/**
 * Mock “API” call with network-like delay. Safe for demos (no external requests).
 * @param {{ identityNumber?: string, customerName?: string }} [_input]
 * @param {{ minDelayMs?: number }} [options]
 * @returns {Promise<DemoCrifEligibilityResult>}
 */
export async function fetchDemoCrifEligibility(_input = {}, options = {}) {
  const minDelay = options.minDelayMs ?? 900;
  const jitter = randomInt(0, 600);
  await new Promise((r) => setTimeout(r, minDelay + jitter));

  const creditScore = randomInt(550, 850);
  const derived = deriveDemoFieldsFromScore(creditScore);
  const activeLoans = randomInt(0, 3);
  const existingLoanStatus =
    activeLoans === 0
      ? "No active loans"
      : activeLoans === 1
        ? "1 active loan"
        : `${activeLoans} active loans`;

  return {
    creditScore,
    creditTier: derived.creditTier,
    eligibilityStatus: derived.eligibilityStatus,
    suggestedLoanAmountRupees: derived.suggestedLoanAmountRupees,
    suggestedLoanDisplay: derived.suggestedLoanDisplay,
    riskLevel: derived.riskLevel,
    activeLoans,
    paymentHistoryStatus: derived.paymentHistoryStatus,
    healthStatus: derived.healthStatus,
    approvalChanceLabel: derived.approvalChanceLabel,
    approvalChancePercent: derived.approvalChancePercent,
    emiCapacityRupees: derived.emiCapacityRupees,
    emiCapacityDisplay: derived.emiCapacityDisplay,
    recommendedLoanLimitDisplay: derived.recommendedLoanLimitDisplay,
    verificationStatus: derived.verificationStatus,
    financialStability: derived.financialStability,
    existingLoanStatus,
    repaymentQuality: derived.repaymentQuality,
    checkedAt: new Date().toISOString(),
    demoMode: true,
  };
}
