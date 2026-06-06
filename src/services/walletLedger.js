import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";

export const WALLET_LEDGER_TYPES = {
  INVESTOR_DEPOSIT: "investor_deposit",
  LOAN_DISBURSEMENT: "loan_disbursement",
  EMI_COLLECTION: "emi_collection",
  OFFICE_INCOME: "office_income",
  EXPENSE: "expense",
  SALARY_PAYMENT: "salary_payment",
  MANUAL: "manual_entry",
};

export function walletDocIdForAccountsTransaction(transactionId) {
  return `office-txn-${String(transactionId || "").trim()}`;
}

export function walletDocIdForSalary(salaryId) {
  return `office-sal-${String(salaryId || "").trim()}`;
}

function accountsTxnSubmittedAt(record) {
  const date = clean(record.date);
  const iso = clean(record.submitted_at || record.submittedAt);
  if (iso && iso.includes("T")) return iso;
  if (date) return `${date}T12:00:00.000Z`;
  return new Date().toISOString();
}

/** Mirror completed office income/expense into the shared wallet ledger (idempotent). */
export async function syncAccountsTransactionToWallet(record) {
  const transactionId = clean(record.transaction_id || record.transactionId || record.id);
  if (!transactionId) return null;

  const docId = walletDocIdForAccountsTransaction(transactionId);
  const status = clean(record.status).toLowerCase();
  if (status !== "completed") {
    try {
      await deleteDoc(doc(db, "walletTransactions", docId));
    } catch {
      /* doc may not exist */
    }
    return null;
  }

  const amt = Math.round(Number(record.amount || 0));
  if (amt <= 0) {
    try {
      await deleteDoc(doc(db, "walletTransactions", docId));
    } catch {
      /* noop */
    }
    return null;
  }

  const isIncome = clean(record.transaction_type || record.transactionType).toLowerCase() === "income";
  const party = clean(record.party_name || record.partyName) || "—";
  const category = clean(record.category) || (isIncome ? "Income" : "Expense");
  const submittedAt = accountsTxnSubmittedAt(record);
  const createdBy = clean(record.created_by_name || record.createdByName) || "Accounts";

  await setDoc(doc(db, "walletTransactions", docId), {
    transactionId: docId,
    ledgerType: isIncome ? WALLET_LEDGER_TYPES.OFFICE_INCOME : WALLET_LEDGER_TYPES.EXPENSE,
    type: isIncome ? WALLET_LEDGER_TYPES.OFFICE_INCOME : WALLET_LEDGER_TYPES.EXPENSE,
    amount: amt,
    credit: isIncome ? amt : 0,
    debit: isIncome ? 0 : amt,
    personName: party,
    payeeName: party,
    referenceId: transactionId,
    accountsTransactionId: transactionId,
    category,
    description: clean(record.description) || `${isIncome ? "Office income" : "Office expense"} — ${category}`,
    paymentMethod: clean(record.payment_method || record.paymentMethod) || "—",
    referenceNumber: clean(record.reference_number || record.referenceNumber),
    createdBy,
    submittedAt,
    createdAt: serverTimestamp(),
  });

  return docId;
}

export async function removeAccountsTransactionFromWallet(transactionId) {
  const id = clean(transactionId);
  if (!id) return;
  try {
    await deleteDoc(doc(db, "walletTransactions", walletDocIdForAccountsTransaction(id)));
  } catch {
    /* noop */
  }
}

/** Mirror paid payroll into wallet ledger; remove line when not paid. */
export async function syncSalaryRecordToWallet(record) {
  const salaryId = clean(record.salary_id || record.salaryId || record.id);
  if (!salaryId) return null;

  const docId = walletDocIdForSalary(salaryId);
  const status = clean(record.payment_status || record.paymentStatus).toLowerCase();
  if (status !== "paid") {
    try {
      await deleteDoc(doc(db, "walletTransactions", docId));
    } catch {
      /* noop */
    }
    return null;
  }

  const amt = Math.round(Number(record.final_salary || record.finalSalary || 0));
  if (amt <= 0) {
    try {
      await deleteDoc(doc(db, "walletTransactions", docId));
    } catch {
      /* noop */
    }
    return null;
  }

  const name = clean(record.employee_name || record.employeeName) || "Employee";
  const payDate = clean(record.payment_date || record.paymentDate) || clean(record.salary_month || record.salaryMonth);
  const submittedAt = payDate
    ? payDate.includes("T")
      ? payDate
      : `${payDate.length === 7 ? `${payDate}-01` : payDate}T12:00:00.000Z`
    : new Date().toISOString();

  await setDoc(doc(db, "walletTransactions", docId), {
    transactionId: docId,
    ledgerType: WALLET_LEDGER_TYPES.SALARY_PAYMENT,
    type: WALLET_LEDGER_TYPES.SALARY_PAYMENT,
    amount: amt,
    credit: 0,
    debit: amt,
    personName: name,
    employeeName: name,
    referenceId: salaryId,
    salaryId,
    description: clean(record.description) || `Salary — ${name}`,
    createdBy: clean(record.created_by_name || record.createdByName) || "Accounts",
    submittedAt,
    createdAt: serverTimestamp(),
  });

  return docId;
}

export async function removeSalaryFromWallet(salaryId) {
  const id = clean(salaryId);
  if (!id) return;
  try {
    await deleteDoc(doc(db, "walletTransactions", walletDocIdForSalary(id)));
  } catch {
    /* noop */
  }
}

function clean(s) {
  return String(s ?? "").trim();
}

/**
 * Live listener for walletTransactions (ascending by time for running-balance math).
 */
export function subscribeWalletLedger(onUpdate, onError) {
  return onSnapshot(
    collection(db, "walletTransactions"),
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ta = new Date(a.submittedAt || 0).getTime();
        const tb = new Date(b.submittedAt || 0).getTime();
        if (ta !== tb) return ta - tb;
        return String(a.transactionId || a.id).localeCompare(String(b.transactionId || b.id));
      });
      onUpdate(rows);
    },
    (err) => {
      if (typeof onError === "function") onError(err);
    }
  );
}

/**
 * Records an investor capital deposit (increases wallet in dashboard formula).
 */
export async function recordInvestorDeposit({
  investorName,
  amount,
  depositDate,
  paymentMethod,
  referenceNumber,
  notes,
  createdBy,
}) {
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error("Deposit amount must be greater than zero");
  const id = `invdep-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const dateStr = clean(depositDate) || new Date().toISOString().slice(0, 10);
  const iso = `${dateStr}T12:00:00.000Z`;
  const inv = clean(investorName) || "Investor";

  await setDoc(doc(db, "walletTransactions", id), {
    transactionId: id,
    ledgerType: WALLET_LEDGER_TYPES.INVESTOR_DEPOSIT,
    type: WALLET_LEDGER_TYPES.INVESTOR_DEPOSIT,
    amount: amt,
    credit: amt,
    debit: 0,
    investorName: inv,
    personName: inv,
    paymentMethod: clean(paymentMethod) || "—",
    referenceNumber: clean(referenceNumber),
    referenceId: clean(referenceNumber),
    notes: clean(notes),
    description: `Investor deposit — ${inv}`,
    createdBy: clean(createdBy) || "Admin",
    submittedAt: iso,
    createdAt: serverTimestamp(),
  });

  return { id, submittedAt: iso };
}

/**
 * Idempotent ledger line when a collection entry is approved (audit trail).
 */
export async function recordEmiCollectionLedgerEntry(entry, approvedAtIso) {
  const entryId = entry.entryId || entry.id;
  if (!entryId) return null;
  const amt = Math.round(Number(entry.amount || 0));
  if (amt <= 0) return null;

  const walletDocId = `emi-${entryId}`;
  const name = clean(entry.customerName) || entry.customerId || "Customer";

  await setDoc(doc(db, "walletTransactions", walletDocId), {
    transactionId: walletDocId,
    ledgerType: WALLET_LEDGER_TYPES.EMI_COLLECTION,
    type: WALLET_LEDGER_TYPES.EMI_COLLECTION,
    amount: amt,
    credit: amt,
    debit: 0,
    personName: name,
    customerId: clean(entry.customerId),
    referenceId: entryId,
    entryId,
    description: `EMI collection — ${name}`,
    createdBy: "system",
    submittedAt: approvedAtIso,
    createdAt: serverTimestamp(),
  });

  return walletDocId;
}

/**
 * Idempotent loan disbursement line when a loan is approved or booked (decreases wallet).
 */
export async function recordLoanDisbursementLedgerEntry({
  customerId,
  customerName,
  principalAmount,
  disbursementDateIso,
  notes = "",
}) {
  const cid = clean(customerId);
  const amt = Math.round(Number(principalAmount) || 0);
  if (!cid || amt <= 0) return null;

  const walletDocId = `loan-disb-${cid}`;
  const name = clean(customerName) || cid;
  const dateStr = clean(disbursementDateIso) || new Date().toISOString().slice(0, 10);
  const submittedAt = dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00.000Z`;

  await setDoc(doc(db, "walletTransactions", walletDocId), {
    transactionId: walletDocId,
    ledgerType: WALLET_LEDGER_TYPES.LOAN_DISBURSEMENT,
    type: WALLET_LEDGER_TYPES.LOAN_DISBURSEMENT,
    amount: amt,
    credit: 0,
    debit: amt,
    personName: name,
    customerName: name,
    customerId: cid,
    referenceId: cid,
    description: notes || `Loan disbursement — ${name}`,
    createdBy: "system",
    submittedAt,
    createdAt: serverTimestamp(),
  });

  return walletDocId;
}

/** Additional principal when an approved loan amount increases. */
export async function recordLoanDisbursementDeltaLedgerEntry({
  customerId,
  customerName,
  deltaAmount,
  disbursementDateIso,
}) {
  const cid = clean(customerId);
  const delta = Math.round(Number(deltaAmount) || 0);
  if (!cid || delta <= 0) return null;

  const walletDocId = `loan-disb-${cid}-adj-${Date.now()}`;
  const name = clean(customerName) || cid;
  const dateStr = clean(disbursementDateIso) || new Date().toISOString().slice(0, 10);
  const submittedAt = dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00.000Z`;

  await setDoc(doc(db, "walletTransactions", walletDocId), {
    transactionId: walletDocId,
    ledgerType: WALLET_LEDGER_TYPES.LOAN_DISBURSEMENT,
    type: WALLET_LEDGER_TYPES.LOAN_DISBURSEMENT,
    amount: delta,
    credit: 0,
    debit: delta,
    personName: name,
    customerName: name,
    customerId: cid,
    referenceId: cid,
    description: `Loan principal increase — ${name}`,
    createdBy: "system",
    submittedAt,
    createdAt: serverTimestamp(),
  });

  return walletDocId;
}
