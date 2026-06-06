import {
  WALLET_LEDGER_TYPES,
  walletDocIdForAccountsTransaction,
  walletDocIdForSalary,
} from "../services/walletLedger";

const OFFICE_LEDGER_TYPES = new Set([
  WALLET_LEDGER_TYPES.EXPENSE,
  WALLET_LEDGER_TYPES.SALARY_PAYMENT,
  WALLET_LEDGER_TYPES.OFFICE_INCOME,
]);

/** Ledger rows for loan-only aggregates (deposits, disbursements, EMI) — excludes office lines. */
export function filterLoanWalletLedgerRows(walletRows) {
  return (walletRows || []).filter((r) => {
    if (r.isDeleted) return false;
    const lt = String(r.ledgerType || r.type || "").trim().toLowerCase();
    return !OFFICE_LEDGER_TYPES.has(lt);
  });
}

function ledgerHasAccountsTransaction(walletRows, transactionId) {
  const tid = String(transactionId || "");
  if (!tid) return false;
  const docId = walletDocIdForAccountsTransaction(tid);
  return (walletRows || []).some(
    (r) =>
      String(r.id || "") === docId ||
      String(r.accountsTransactionId || "") === tid ||
      String(r.referenceId || "") === tid
  );
}

function ledgerHasSalaryPayment(walletRows, salaryId) {
  const sid = String(salaryId || "");
  if (!sid) return false;
  const docId = walletDocIdForSalary(sid);
  return (walletRows || []).some(
    (r) =>
      String(r.id || "") === docId ||
      String(r.salaryId || "") === sid ||
      (String(r.ledgerType || r.type || "") === WALLET_LEDGER_TYPES.SALARY_PAYMENT &&
        String(r.referenceId || "") === sid)
  );
}

/** Office accounts not yet mirrored to walletTransactions (legacy rows). */
export function sumUnsyncedOfficeWalletDelta(walletRows, officeTransactions = [], salaryRecords = []) {
  let delta = 0;

  (officeTransactions || []).forEach((txn) => {
    if (String(txn.status || "").toLowerCase() !== "completed") return;
    const tid = txn.transaction_id || txn.transactionId || txn.id;
    if (ledgerHasAccountsTransaction(walletRows, tid)) return;
    const amt = Math.round(Number(txn.amount || 0));
    if (amt <= 0) return;
    if (String(txn.transaction_type || "").toLowerCase() === "income") {
      delta += amt;
    } else {
      delta -= amt;
    }
  });

  (salaryRecords || []).forEach((row) => {
    if (String(row.payment_status || "").toLowerCase() !== "paid") return;
    const sid = row.salary_id || row.salaryId || row.id;
    if (ledgerHasSalaryPayment(walletRows, sid)) return;
    const amt = Math.round(Number(row.final_salary || 0));
    if (amt > 0) delta -= amt;
  });

  return delta;
}

/** Sum disbursement debits already recorded for a customer. */
export function sumLoanDisbursementsForCustomer(walletRows, customerId) {
  const cid = String(customerId || "");
  if (!cid) return 0;
  return filterLoanWalletLedgerRows(walletRows).reduce((sum, r) => {
    const lt = r.ledgerType || r.type || "";
    if (lt !== WALLET_LEDGER_TYPES.LOAN_DISBURSEMENT) return sum;
    if (String(r.referenceId || r.customerId || "") !== cid) return sum;
    return sum + Number(r.debit ?? r.amount ?? 0);
  }, 0);
}

function disbursementSortTime(customer) {
  const raw = customer.disbursementDate || customer.loanApprovedAt || customer.submittedAt;
  const t = new Date(raw || Date.now()).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

/** Principal on the book for wallet & portfolio (excludes pending / rejected applications). */
export function isBookedLoanCustomer(c) {
  if (c?.isDeleted) return false;
  if (Number(c?.loanAmount || 0) <= 0) return false;
  const st = String(c?.approvalStatus ?? "").trim().toLowerCase();
  if (st === "pending" || st === "rejected") return false;
  return true;
}

/** True if an explicit loan_disbursement ledger row exists for this customer. */
export function ledgerHasLoanDisbursementForCustomer(walletRows, customerId) {
  const cid = String(customerId || "");
  if (!cid) return false;
  return filterLoanWalletLedgerRows(walletRows).some((r) => {
    const lt = r.ledgerType || r.type || "";
    if (lt !== WALLET_LEDGER_TYPES.LOAN_DISBURSEMENT) return false;
    return String(r.referenceId || r.customerId || "") === cid;
  });
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Builds the same chronological wallet ledger used on the dashboard:
 * walletTransactions rows + synthetic EMI (approved entries missing from ledger)
 * + synthetic loan disbursements (active loans missing from ledger).
 * Returns rows newest-first with running balanceAfter (newest row = current wallet).
 */
export function buildWalletTransactionTimelineDescending(
  walletRows,
  customers,
  entries,
  cashOpening,
  officeTransactions = [],
  salaryRecords = []
) {
  const opening = Number(cashOpening) || 0;
  const allLedgerRows = (walletRows || []).filter((r) => !r.isDeleted);
  const ledgerEmiEntryIds = new Set();
  const ledgerLoanCustomerIds = new Set();
  allLedgerRows.forEach((r) => {
    const lt = r.ledgerType || r.type || "";
    if (lt === WALLET_LEDGER_TYPES.EMI_COLLECTION && (r.entryId || r.referenceId)) {
      ledgerEmiEntryIds.add(r.entryId || r.referenceId);
    }
    if (lt === WALLET_LEDGER_TYPES.LOAN_DISBURSEMENT && (r.referenceId || r.customerId)) {
      ledgerLoanCustomerIds.add(String(r.referenceId || r.customerId));
    }
  });

  const approvedEntries = (entries || []).filter(
    (e) => !e.isDeleted && String(e.approvalStatus || "").toLowerCase() === "approved"
  );
  const activeLoans = (customers || []).filter((c) => isBookedLoanCustomer(c));
  const items = [];

  allLedgerRows.forEach((r) => {
    const lt = r.ledgerType || r.type || "manual_entry";
    if (lt === WALLET_LEDGER_TYPES.EMI_COLLECTION) {
      items.push({
        id: String(r.transactionId || r.id),
        sortAt: new Date(r.submittedAt || 0).getTime(),
        atLabel: formatDateTime(r.submittedAt),
        ledgerType: WALLET_LEDGER_TYPES.EMI_COLLECTION,
        label: "EMI collection",
        personName: r.personName || r.customerName || "—",
        referenceId: String(r.referenceId || r.entryId || r.transactionId || "—"),
        credit: Number(r.credit || r.amount || 0),
        debit: 0,
        remarks: r.description || r.notes || "",
      });
      return;
    }
    if (lt === WALLET_LEDGER_TYPES.INVESTOR_DEPOSIT || lt === "investor_deposit") {
      items.push({
        id: String(r.transactionId || r.id),
        sortAt: new Date(r.submittedAt || 0).getTime(),
        atLabel: formatDateTime(r.submittedAt),
        ledgerType: WALLET_LEDGER_TYPES.INVESTOR_DEPOSIT,
        label: "Investor deposit",
        personName: r.personName || r.investorName || "Investor",
        referenceId: String(r.referenceNumber || r.referenceId || "—"),
        credit: Number(r.credit || r.amount || 0),
        debit: 0,
        remarks: r.notes || r.description || "",
      });
      return;
    }
    if (lt === WALLET_LEDGER_TYPES.LOAN_DISBURSEMENT) {
      const debitAmt = Number(r.debit || r.amount || 0);
      items.push({
        id: String(r.transactionId || r.id),
        sortAt: new Date(r.submittedAt || 0).getTime(),
        atLabel: formatDateTime(r.submittedAt),
        ledgerType: WALLET_LEDGER_TYPES.LOAN_DISBURSEMENT,
        label: "Loan disbursement",
        personName: r.personName || r.customerName || "Customer",
        referenceId: String(r.referenceId || r.customerId || r.transactionId || "—"),
        credit: 0,
        debit: debitAmt,
        remarks: r.description || r.notes || "",
      });
      return;
    }
    if (lt === WALLET_LEDGER_TYPES.OFFICE_INCOME) {
      const creditAmt = Number(r.credit || r.amount || 0);
      items.push({
        id: String(r.transactionId || r.id),
        sortAt: new Date(r.submittedAt || 0).getTime(),
        atLabel: formatDateTime(r.submittedAt),
        ledgerType: WALLET_LEDGER_TYPES.OFFICE_INCOME,
        label: "Office income",
        personName: r.personName || r.payeeName || r.createdBy || "—",
        referenceId: String(r.referenceId || r.transactionId || "—"),
        credit: creditAmt,
        debit: 0,
        remarks: r.description || r.notes || "",
      });
      return;
    }
    if (lt === WALLET_LEDGER_TYPES.EXPENSE) {
      const debitAmt = Number(r.debit || r.amount || 0);
      items.push({
        id: String(r.transactionId || r.id),
        sortAt: new Date(r.submittedAt || 0).getTime(),
        atLabel: formatDateTime(r.submittedAt),
        ledgerType: WALLET_LEDGER_TYPES.EXPENSE,
        label: "Office expense",
        personName: r.personName || r.payeeName || r.createdBy || "—",
        referenceId: String(r.referenceId || r.transactionId || "—"),
        credit: 0,
        debit: debitAmt,
        remarks: r.description || r.notes || "",
      });
      return;
    }
    if (lt === WALLET_LEDGER_TYPES.SALARY_PAYMENT) {
      const debitAmt = Number(r.debit || r.amount || 0);
      items.push({
        id: String(r.transactionId || r.id),
        sortAt: new Date(r.submittedAt || 0).getTime(),
        atLabel: formatDateTime(r.submittedAt),
        ledgerType: WALLET_LEDGER_TYPES.SALARY_PAYMENT,
        label: "Salary payment",
        personName: r.personName || r.employeeName || r.createdBy || "—",
        referenceId: String(r.referenceId || r.transactionId || "—"),
        credit: 0,
        debit: debitAmt,
        remarks: r.description || r.notes || "",
      });
      return;
    }
    const amt = Number(r.amount || 0);
    const isDebit = String(r.adjustmentType || "").toLowerCase() === "debit";
    items.push({
      id: String(r.transactionId || r.id),
      sortAt: new Date(r.submittedAt || 0).getTime(),
      atLabel: formatDateTime(r.submittedAt),
      ledgerType: WALLET_LEDGER_TYPES.MANUAL,
      label: "Wallet adjustment",
      personName: r.createdBy || "—",
      referenceId: String(r.transactionId || "—"),
      credit: isDebit ? 0 : amt,
      debit: isDebit ? amt : 0,
      remarks: r.description || "",
    });
  });

  approvedEntries.forEach((e) => {
    const eid = e.entryId || e.id;
    if (!eid || ledgerEmiEntryIds.has(eid)) return;
    const amt = Number(e.amount || 0);
    if (amt <= 0) return;
    items.push({
      id: `syn-emi-${eid}`,
      sortAt: new Date(e.approvedAt || e.collectionDate || e.submittedAt || 0).getTime(),
      atLabel: formatDateTime(e.approvedAt || e.collectionDate || e.submittedAt),
      ledgerType: WALLET_LEDGER_TYPES.EMI_COLLECTION,
      label: "EMI collection",
      personName: e.customerName || e.customerId || "Customer",
      referenceId: String(eid),
      credit: amt,
      debit: 0,
      remarks: "Approved collection (ledger sync)",
    });
  });

  activeLoans.forEach((c) => {
    const cid = String(c.customerId || "");
    if (cid && ledgerLoanCustomerIds.has(cid)) return;
    const principal = Number(c.loanAmount || 0);
    if (principal <= 0) return;
    const sortAt = disbursementSortTime(c);
    const raw = c.disbursementDate || c.loanApprovedAt || c.submittedAt;
    items.push({
      id: `syn-loan-${c.customerId}`,
      sortAt,
      atLabel: formatDateTime(raw || new Date(sortAt).toISOString()),
      ledgerType: WALLET_LEDGER_TYPES.LOAN_DISBURSEMENT,
      label: "Loan disbursement",
      personName: c.customerName || c.customerId || "Customer",
      referenceId: String(c.customerId || "—"),
      credit: 0,
      debit: principal,
      remarks: `Principal out${c.selectedDay ? ` · ${c.selectedDay}` : ""}`,
    });
  });

  (officeTransactions || []).forEach((txn) => {
    if (String(txn.status || "").toLowerCase() !== "completed") return;
    const tid = txn.transaction_id || txn.transactionId || txn.id;
    if (!tid || ledgerHasAccountsTransaction(allLedgerRows, tid)) return;
    const amt = Math.round(Number(txn.amount || 0));
    if (amt <= 0) return;
    const isIncome = String(txn.transaction_type || "").toLowerCase() === "income";
    const dateRaw = txn.date || txn.submitted_at;
    const sortAt = new Date(dateRaw && !String(dateRaw).includes("T") ? `${dateRaw}T12:00:00.000Z` : dateRaw || 0).getTime();
    items.push({
      id: `syn-office-txn-${tid}`,
      sortAt: Number.isFinite(sortAt) ? sortAt : Date.now(),
      atLabel: formatDateTime(dateRaw),
      ledgerType: isIncome ? WALLET_LEDGER_TYPES.OFFICE_INCOME : WALLET_LEDGER_TYPES.EXPENSE,
      label: isIncome ? "Office income" : "Office expense",
      personName: txn.party_name || txn.category || "—",
      referenceId: String(tid),
      credit: isIncome ? amt : 0,
      debit: isIncome ? 0 : amt,
      remarks: txn.description || "",
    });
  });

  (salaryRecords || []).forEach((row) => {
    if (String(row.payment_status || "").toLowerCase() !== "paid") return;
    const sid = row.salary_id || row.salaryId || row.id;
    if (!sid || ledgerHasSalaryPayment(allLedgerRows, sid)) return;
    const amt = Math.round(Number(row.final_salary || 0));
    if (amt <= 0) return;
    const dateRaw = row.payment_date || row.salary_month;
    const sortAt = new Date(
      dateRaw && String(dateRaw).length === 7 ? `${dateRaw}-01T12:00:00.000Z` : dateRaw && !String(dateRaw).includes("T") ? `${dateRaw}T12:00:00.000Z` : dateRaw || 0
    ).getTime();
    items.push({
      id: `syn-office-sal-${sid}`,
      sortAt: Number.isFinite(sortAt) ? sortAt : Date.now(),
      atLabel: formatDateTime(dateRaw),
      ledgerType: WALLET_LEDGER_TYPES.SALARY_PAYMENT,
      label: "Salary payment",
      personName: row.employee_name || "Employee",
      referenceId: String(sid),
      credit: 0,
      debit: amt,
      remarks: row.description || "",
    });
  });

  items.sort((a, b) => a.sortAt - b.sortAt);
  let balance = opening;
  const asc = items.map((row) => {
    balance += row.credit - row.debit;
    return { ...row, balanceAfter: balance };
  });
  return asc.reverse();
}

/** Current available wallet from ledger timeline (newest row). Falls back to opening when empty. */
export function getLedgerWalletBalance(
  walletRows,
  customers,
  entries,
  cashOpening,
  officeTransactions = [],
  salaryRecords = []
) {
  const timeline = buildWalletTransactionTimelineDescending(
    walletRows,
    customers,
    entries,
    cashOpening,
    officeTransactions,
    salaryRecords
  );
  if (timeline.length > 0) return Math.round(Number(timeline[0].balanceAfter) || 0);
  const opening = Math.round(Number(cashOpening) || 0);
  return opening + sumUnsyncedOfficeWalletDelta(walletRows, officeTransactions, salaryRecords);
}

export function sumInvestorDeposits(walletRows) {
  return filterLoanWalletLedgerRows(walletRows)
    .filter((r) => {
      const t = r.ledgerType || r.type || "";
      return t === WALLET_LEDGER_TYPES.INVESTOR_DEPOSIT || t === "investor_deposit";
    })
    .reduce((s, r) => s + Number(r.credit ?? r.amount ?? 0), 0);
}
