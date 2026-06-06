import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { normalizeText } from "../utils/customerValidation";
import {
  removeAccountsTransactionFromWallet,
  removeSalaryFromWallet,
  syncAccountsTransactionToWallet,
  syncSalaryRecordToWallet,
} from "./walletLedger";

export const ACCOUNTS_TRANSACTIONS_COLLECTION = "accounts_transactions";
export const ACCOUNTS_CATEGORIES_COLLECTION = "accounts_categories";
export const ACCOUNTS_SALARY_COLLECTION = "accounts_salary";
export const ACCOUNTS_REPORTS_COLLECTION = "accounts_reports";

export const EXPENSE_CATEGORY_SEEDS = [
  "Employee Salary",
  "Office Rent",
  "Electricity",
  "Internet",
  "Fuel",
  "Travel",
  "Marketing",
  "Office Maintenance",
  "Software Subscription",
  "Tax",
  "Stationery",
  "Miscellaneous",
];

export const INCOME_SOURCE_SEEDS = [
  "Loan Interest",
  "Processing Fees",
  "Penalty Collection",
  "Service Charges",
  "Investments",
  "Other Income",
];

export const TRANSACTION_STATUSES = ["completed", "pending", "cancelled"];
export const TRANSACTION_PAYMENT_METHODS = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Wallet"];
export const RECURRING_FREQUENCIES = ["none", "daily", "weekly", "monthly", "yearly"];
export const SALARY_PAYMENT_STATUSES = ["paid", "pending", "processing"];

function nowIso() {
  return new Date().toISOString();
}

function formatDayIdPart(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10).replace(/-/g, "");
}

function makeRecordId(prefix) {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${formatDayIdPart()}-${randomPart}`;
}

function toNumber(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeActor(actor = {}) {
  return {
    uid: normalizeText(actor.uid),
    name: normalizeText(actor.name) || "Admin",
    role: normalizeText(actor.role) || "admin",
  };
}

function mapSnapshot(snapshot) {
  return snapshot.docs.map((entry) => ({
    id: entry.id,
    ...entry.data(),
  }));
}

function validateCompletedTransactionDate(dateValue) {
  const date = normalizeText(dateValue);
  const today = nowIso().slice(0, 10);
  if (date && date > today) {
    throw new Error("Completed transactions cannot use a future date.");
  }
}

function validateSalaryPaymentDate(paymentStatus, paymentDate) {
  const status = normalizeText(paymentStatus).toLowerCase();
  const date = normalizeText(paymentDate);
  const today = nowIso().slice(0, 10);
  if (status === "paid" && !date) {
    throw new Error("Payment date is required when salary status is marked as paid.");
  }
  if (status === "paid" && date > today) {
    throw new Error("Paid salary cannot use a future payment date.");
  }
}

function validateSalaryMonthAlignment(salaryMonth, paymentStatus, paymentDate) {
  const month = normalizeText(salaryMonth);
  const status = normalizeText(paymentStatus).toLowerCase();
  const date = normalizeText(paymentDate);
  if (status === "paid" && month && date && date.slice(0, 7) !== month) {
    throw new Error("Payment date must match the selected salary month.");
  }
}

function buildCategoryRecord({ categoryId, name, categoryType, isDefault = false, actor }) {
  const safeActor = normalizeActor(actor);
  const iso = nowIso();
  return {
    category_id: categoryId,
    name: normalizeText(name),
    category_type: normalizeText(categoryType).toLowerCase() === "income" ? "income" : "expense",
    is_default: Boolean(isDefault),
    is_active: true,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    created_by: safeActor.uid,
    created_by_name: safeActor.name,
    submitted_at: iso,
    updated_local_at: iso,
  };
}

export async function ensureDefaultAccountsCategories(actor) {
  const safeActor = normalizeActor(actor);
  if (!safeActor.uid) return;

  const snapshot = await getDocs(collection(db, ACCOUNTS_CATEGORIES_COLLECTION));
  const existingNames = new Set(
    snapshot.docs.map((item) => `${String(item.data()?.category_type || "").toLowerCase()}::${String(item.data()?.name || "").toLowerCase()}`)
  );

  const writes = [];
  for (const name of EXPENSE_CATEGORY_SEEDS) {
    const key = `expense::${name.toLowerCase()}`;
    if (!existingNames.has(key)) {
      const id = makeRecordId("CAT");
      writes.push(setDoc(doc(db, ACCOUNTS_CATEGORIES_COLLECTION, id), buildCategoryRecord({
        categoryId: id,
        name,
        categoryType: "expense",
        isDefault: true,
        actor: safeActor,
      })));
    }
  }
  for (const name of INCOME_SOURCE_SEEDS) {
    const key = `income::${name.toLowerCase()}`;
    if (!existingNames.has(key)) {
      const id = makeRecordId("CAT");
      writes.push(setDoc(doc(db, ACCOUNTS_CATEGORIES_COLLECTION, id), buildCategoryRecord({
        categoryId: id,
        name,
        categoryType: "income",
        isDefault: true,
        actor: safeActor,
      })));
    }
  }
  if (writes.length > 0) {
    await Promise.all(writes);
  }
}

export function subscribeAccountsTransactions(onNext, onError) {
  return onSnapshot(
    query(collection(db, ACCOUNTS_TRANSACTIONS_COLLECTION), orderBy("date", "desc")),
    (snapshot) => onNext(mapSnapshot(snapshot)),
    onError
  );
}

export function subscribeAccountsCategories(onNext, onError) {
  return onSnapshot(
    query(collection(db, ACCOUNTS_CATEGORIES_COLLECTION), orderBy("name", "asc")),
    (snapshot) => onNext(mapSnapshot(snapshot)),
    onError
  );
}

export function subscribeAccountsSalary(onNext, onError) {
  return onSnapshot(
    query(collection(db, ACCOUNTS_SALARY_COLLECTION), orderBy("salary_month", "desc")),
    (snapshot) => onNext(mapSnapshot(snapshot)),
    onError
  );
}

export function subscribeAccountsReports(onNext, onError) {
  return onSnapshot(
    query(collection(db, ACCOUNTS_REPORTS_COLLECTION), orderBy("created_label", "desc")),
    (snapshot) => onNext(mapSnapshot(snapshot)),
    onError
  );
}

export async function createAccountsCategory(payload, actor) {
  const safeActor = normalizeActor(actor);
  const categoryId = makeRecordId("CAT");
  const record = buildCategoryRecord({
    categoryId,
    name: payload.name,
    categoryType: payload.categoryType,
    isDefault: false,
    actor: safeActor,
  });
  await setDoc(doc(db, ACCOUNTS_CATEGORIES_COLLECTION, categoryId), record);
  return { categoryId, ...record };
}

export async function updateAccountsCategory(categoryId, payload, actor) {
  normalizeActor(actor);
  const iso = nowIso();
  await updateDoc(doc(db, ACCOUNTS_CATEGORIES_COLLECTION, categoryId), {
    name: normalizeText(payload.name),
    category_type: normalizeText(payload.categoryType).toLowerCase() === "income" ? "income" : "expense",
    updated_at: serverTimestamp(),
    updated_local_at: iso,
  });
}

export async function deleteAccountsCategory(categoryId, actor) {
  normalizeActor(actor);
  await deleteDoc(doc(db, ACCOUNTS_CATEGORIES_COLLECTION, categoryId));
}

export async function createAccountsTransaction(payload, actor) {
  const safeActor = normalizeActor(actor);
  const transactionId = makeRecordId("TXN");
  const iso = nowIso();
  const amount = toNumber(payload.amount);
  if (normalizeText(payload.status) === "completed") {
    validateCompletedTransactionDate(payload.date);
  }
  const record = {
    transaction_id: transactionId,
    date: normalizeText(payload.date) || iso.slice(0, 10),
    transaction_type: normalizeText(payload.transactionType).toLowerCase() === "income" ? "income" : "expense",
    category: normalizeText(payload.category),
    amount,
    payment_method: normalizeText(payload.paymentMethod) || "Cash",
    reference_number: normalizeText(payload.referenceNumber),
    party_name: normalizeText(payload.partyName),
    description: normalizeText(payload.description),
    attachment_name: normalizeText(payload.attachmentName),
    status: normalizeText(payload.status) || "completed",
    is_recurring: Boolean(payload.isRecurring),
    recurring_frequency: normalizeText(payload.recurringFrequency) || "none",
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    created_by: safeActor.uid,
    created_by_name: safeActor.name,
    submitted_at: iso,
    updated_local_at: iso,
  };
  await setDoc(doc(db, ACCOUNTS_TRANSACTIONS_COLLECTION, transactionId), record);
  await syncAccountsTransactionToWallet({ transactionId, ...record });
  return { transactionId, ...record };
}

export async function updateAccountsTransaction(transactionId, payload, actor) {
  normalizeActor(actor);
  const iso = nowIso();
  const amount = toNumber(payload.amount);
  if (normalizeText(payload.status) === "completed") {
    validateCompletedTransactionDate(payload.date);
  }
  const record = {
    date: normalizeText(payload.date),
    transaction_type: normalizeText(payload.transactionType).toLowerCase() === "income" ? "income" : "expense",
    category: normalizeText(payload.category),
    amount,
    payment_method: normalizeText(payload.paymentMethod) || "Cash",
    reference_number: normalizeText(payload.referenceNumber),
    party_name: normalizeText(payload.partyName),
    description: normalizeText(payload.description),
    attachment_name: normalizeText(payload.attachmentName),
    status: normalizeText(payload.status) || "completed",
    is_recurring: Boolean(payload.isRecurring),
    recurring_frequency: normalizeText(payload.recurringFrequency) || "none",
    updated_at: serverTimestamp(),
    updated_local_at: iso,
  };
  await updateDoc(doc(db, ACCOUNTS_TRANSACTIONS_COLLECTION, transactionId), record);
  await syncAccountsTransactionToWallet({ transaction_id: transactionId, ...record });
}

export async function deleteAccountsTransaction(transactionId, actor) {
  normalizeActor(actor);
  await deleteDoc(doc(db, ACCOUNTS_TRANSACTIONS_COLLECTION, transactionId));
  await removeAccountsTransactionFromWallet(transactionId);
}

export async function createSalaryRecord(payload, actor) {
  const safeActor = normalizeActor(actor);
  const salaryId = makeRecordId("SAL");
  const iso = nowIso();
  const basicSalary = toNumber(payload.basicSalary);
  const bonus = toNumber(payload.bonus);
  const deduction = toNumber(payload.deduction);
  const finalSalary = Math.max(basicSalary + bonus - deduction, 0);
  validateSalaryPaymentDate(payload.paymentStatus, payload.paymentDate);
  validateSalaryMonthAlignment(payload.salaryMonth, payload.paymentStatus, payload.paymentDate);
  const record = {
    salary_id: salaryId,
    employee_name: normalizeText(payload.employeeName),
    employee_id: normalizeText(payload.employeeId),
    department: normalizeText(payload.department),
    salary_month: normalizeText(payload.salaryMonth),
    basic_salary: basicSalary,
    bonus,
    deduction,
    final_salary: finalSalary,
    payment_status: normalizeText(payload.paymentStatus) || "pending",
    payment_date: normalizeText(payload.paymentDate),
    description: normalizeText(payload.description),
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    created_by: safeActor.uid,
    created_by_name: safeActor.name,
    created_label: iso,
    updated_local_at: iso,
  };
  await setDoc(doc(db, ACCOUNTS_SALARY_COLLECTION, salaryId), record);
  await syncSalaryRecordToWallet({ salaryId, ...record });
  return { salaryId, ...record };
}

export async function updateSalaryRecord(salaryId, payload, actor) {
  const safeActor = normalizeActor(actor);
  const basicSalary = toNumber(payload.basicSalary);
  const bonus = toNumber(payload.bonus);
  const deduction = toNumber(payload.deduction);
  const finalSalary = Math.max(basicSalary + bonus - deduction, 0);
  validateSalaryPaymentDate(payload.paymentStatus, payload.paymentDate);
  validateSalaryMonthAlignment(payload.salaryMonth, payload.paymentStatus, payload.paymentDate);
  await updateDoc(doc(db, ACCOUNTS_SALARY_COLLECTION, salaryId), {
    employee_name: normalizeText(payload.employeeName),
    employee_id: normalizeText(payload.employeeId),
    department: normalizeText(payload.department),
    salary_month: normalizeText(payload.salaryMonth),
    basic_salary: basicSalary,
    bonus,
    deduction,
    final_salary: finalSalary,
    payment_status: normalizeText(payload.paymentStatus) || "pending",
    payment_date: normalizeText(payload.paymentDate),
    description: normalizeText(payload.description),
    updated_at: serverTimestamp(),
    updated_local_at: nowIso(),
  });
  await syncSalaryRecordToWallet({
    salary_id: salaryId,
    employee_name: normalizeText(payload.employeeName),
    final_salary: finalSalary,
    payment_status: normalizeText(payload.paymentStatus) || "pending",
    payment_date: normalizeText(payload.paymentDate),
    description: normalizeText(payload.description),
    created_by_name: safeActor.name,
  });
}

export async function deleteSalaryRecord(salaryId, actor) {
  normalizeActor(actor);
  await deleteDoc(doc(db, ACCOUNTS_SALARY_COLLECTION, salaryId));
  await removeSalaryFromWallet(salaryId);
}

export async function saveAccountsReportSnapshot(payload, actor) {
  const safeActor = normalizeActor(actor);
  const reportId = makeRecordId("RPT");
  const iso = nowIso();
  const record = {
    report_id: reportId,
    report_type: normalizeText(payload.reportType),
    report_title: normalizeText(payload.reportTitle),
    period_label: normalizeText(payload.periodLabel),
    filters: payload.filters || {},
    summary: payload.summary || {},
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    created_by: safeActor.uid,
    created_by_name: safeActor.name,
    created_label: iso,
    updated_local_at: iso,
  };
  await setDoc(doc(db, ACCOUNTS_REPORTS_COLLECTION, reportId), record);
  return { reportId, ...record };
}

export async function deleteAccountsReportSnapshot(reportId, actor) {
  normalizeActor(actor);
  await deleteDoc(doc(db, ACCOUNTS_REPORTS_COLLECTION, reportId));
}
