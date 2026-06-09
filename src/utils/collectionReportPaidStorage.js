const STORAGE_KEY_V1 = "loanweb.collectionReportPaidEntries";
const STORAGE_KEY = "loanweb.collectionReportPaidEntries.v2";

export function sanitizePaidAmount(value) {
  const cleaned = String(value || "").replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const [whole, ...fraction] = cleaned.split(".");
  const normalized = fraction.length ? `${whole}.${fraction.join("")}` : whole;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return String(amount);
}

export function makePaidEntryKey(customerId, installmentNumber) {
  return `${customerId}::${installmentNumber}`;
}

export function parsePaidEntryKey(key) {
  const [customerId, installment] = String(key || "").split("::");
  return {
    customerId: customerId || "",
    installmentNumber: Number(installment) || 0,
  };
}

function emptyPaidState() {
  return { drafts: {}, committed: {} };
}

function migrateV1FlatEntries(v1Entries) {
  const state = emptyPaidState();
  Object.entries(v1Entries || {}).forEach(([customerId, amount]) => {
    if (!customerId || customerId.includes("::")) return;
    const sanitized = sanitizePaidAmount(amount);
    if (!sanitized) return;
    const key = makePaidEntryKey(customerId, 1);
    state.committed[key] = {
      amount: sanitized,
      paidAt: new Date().toISOString(),
    };
  });
  return state;
}

export function loadCollectionReportPaidState() {
  try {
    const rawV2 = window.localStorage.getItem(STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      if (parsed && typeof parsed === "object") {
        return {
          drafts: parsed.drafts && typeof parsed.drafts === "object" ? parsed.drafts : {},
          committed: parsed.committed && typeof parsed.committed === "object" ? parsed.committed : {},
        };
      }
    }
  } catch {
    // Fall through to migration.
  }

  try {
    const rawV1 = window.localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const parsed = JSON.parse(rawV1);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return migrateV1FlatEntries(parsed);
      }
    }
  } catch {
    // Ignore parse errors.
  }

  return emptyPaidState();
}

export function saveCollectionReportPaidState(state) {
  try {
    const drafts = Object.fromEntries(
      Object.entries(state?.drafts || {}).filter(([, value]) => value != null && String(value).trim() !== "")
    );
    const committed = Object.fromEntries(
      Object.entries(state?.committed || {}).filter(([, value]) => sanitizePaidAmount(value?.amount))
    );
    if (!Object.keys(drafts).length && !Object.keys(committed).length) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(STORAGE_KEY_V1);
      return;
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        drafts,
        committed,
      })
    );
    window.localStorage.removeItem(STORAGE_KEY_V1);
  } catch {
    // Ignore quota / private mode errors.
  }
}

/** @deprecated Use loadCollectionReportPaidState */
export function loadCollectionReportPaidEntries() {
  const state = loadCollectionReportPaidState();
  const merged = { ...state.drafts };
  Object.entries(state.committed).forEach(([key, record]) => {
    merged[key] = record.amount;
  });
  return merged;
}

/** @deprecated Use saveCollectionReportPaidState */
export function saveCollectionReportPaidEntries(entries) {
  const committed = {};
  Object.entries(entries || {}).forEach(([key, amount]) => {
    const sanitized = sanitizePaidAmount(amount);
    if (!sanitized) return;
    committed[key] = { amount: sanitized, paidAt: new Date().toISOString() };
  });
  saveCollectionReportPaidState({ drafts: {}, committed });
}

export function getCommittedPaymentsForCustomer(customerId, paidState) {
  const map = new Map();
  Object.entries(paidState?.committed || {}).forEach(([key, record]) => {
    const parsed = parsePaidEntryKey(key);
    if (parsed.customerId !== customerId) return;
    const amount = sanitizePaidAmount(record?.amount);
    if (!amount || !parsed.installmentNumber) return;
    map.set(parsed.installmentNumber, {
      amount,
      paidAt: record?.paidAt || new Date().toISOString(),
    });
  });
  return map;
}

export function getCommittedInstallmentNumbers(customerId, paidState) {
  return new Set(getCommittedPaymentsForCustomer(customerId, paidState).keys());
}

export function getCommittedPaidAmount(entryKey, paidState) {
  return sanitizePaidAmount(paidState?.committed?.[entryKey]?.amount);
}

/**
 * Manual Paid-field commit for the current installment (any date — not today-only).
 * Used by the Paid/Unpaid list filter.
 */
export function isPaidFieldCommittedForInstallment(customerId, installmentNumber, paidState, dueAmount = 0) {
  if (!customerId || installmentNumber == null) return false;
  const entryKey = makePaidEntryKey(customerId, installmentNumber);
  const committedAmount = Number(getCommittedPaidAmount(entryKey, paidState) || 0);
  if (!committedAmount) return false;
  const due = Number(dueAmount || 0);
  if (due > 0) return committedAmount >= due;
  return true;
}

function isSameCalendarDay(isoDate, reference = new Date()) {
  const paidDay = String(isoDate || "").slice(0, 10);
  if (!paidDay) return false;
  return paidDay === reference.toISOString().slice(0, 10);
}

/**
 * Latest manual payment committed today for a customer.
 * When installmentNumber is provided, only that week's/month's Paid cell is considered.
 */
export function getTodayPaidDisplayForCustomer(
  customerId,
  paidState,
  reference = new Date(),
  installmentNumber = null
) {
  let latest = null;

  Object.entries(paidState?.committed || {}).forEach(([key, record]) => {
    const parsed = parsePaidEntryKey(key);
    if (parsed.customerId !== customerId) return;
    if (installmentNumber != null && parsed.installmentNumber !== installmentNumber) return;
    if (!isSameCalendarDay(record?.paidAt, reference)) return;

    const amount = sanitizePaidAmount(record?.amount);
    if (!amount) return;

    if (!latest || String(record.paidAt || "") > String(latest.paidAt || "")) {
      latest = {
        amount,
        paidAt: record.paidAt,
        entryKey: key,
        installmentNumber: parsed.installmentNumber,
      };
    }
  });

  return latest;
}

export function commitPaidDraftEntry(paidState, entryKey) {
  const sanitized = sanitizePaidAmount(paidState?.drafts?.[entryKey]);
  const nextDrafts = { ...paidState.drafts };
  delete nextDrafts[entryKey];

  if (!sanitized) {
    return { drafts: nextDrafts, committed: { ...paidState.committed } };
  }

  const existing = Number(getCommittedPaidAmount(entryKey, paidState) || 0);
  const increment = Number(sanitized);
  const nextAmount = existing + increment;

  return {
    drafts: nextDrafts,
    committed: {
      ...paidState.committed,
      [entryKey]: {
        amount: String(nextAmount),
        paidAt: new Date().toISOString(),
      },
    },
  };
}
