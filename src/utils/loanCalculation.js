function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function calculateLoanValues({ loanAmount, loanWeeks, interestRate = 0, preset = null } = {}) {
  const principal = toNumber(loanAmount);
  const weeks = Math.max(0, Math.round(toNumber(loanWeeks)));
  const presetEmiAmount = toNumber(preset?.emiAmount);
  const hasUsablePreset = Boolean(preset) && weeks > 0 && presetEmiAmount > 0;

  if (hasUsablePreset) {
    const emiAmount = presetEmiAmount;
    const totalPayable = emiAmount * weeks;
    const interestAmount = Math.max(totalPayable - principal, 0);

    return {
      loanAmount: principal,
      loanWeeks: weeks,
      emiAmount,
      interestAmount,
      totalPayable,
    };
  }

  if (!principal || !weeks) {
    return {
      loanAmount: principal,
      loanWeeks: weeks,
      emiAmount: 0,
      interestAmount: 0,
      totalPayable: 0,
    };
  }

  const totalPayable = Math.round(principal * (1 + Number(interestRate || 0) / 100));
  const emiAmount = Math.round(totalPayable / weeks);
  const interestAmount = Math.max(totalPayable - principal, 0);

  return {
    loanAmount: principal,
    loanWeeks: weeks,
    emiAmount,
    interestAmount,
    totalPayable,
  };
}

export function findLoanPreset(presets = [], loanAmount, loanWeeks) {
  const amount = toNumber(loanAmount);
  const weeks = toNumber(loanWeeks);

  return (
    presets.find((preset) => toNumber(preset.loanAmount) === amount && toNumber(preset.loanWeeks) === weeks) || null
  );
}

export function formatPresetLabel(preset) {
  const amount = toNumber(preset?.loanAmount);
  const weeks = toNumber(preset?.loanWeeks);
  if (!amount && !weeks) return "Custom preset";
  const amountLabel = amount ? `₹${amount.toLocaleString("en-IN")}` : "Amount";
  const weeksLabel = weeks ? `${weeks} weeks` : "Weeks";
  return `${amountLabel} / ${weeksLabel}`;
}
