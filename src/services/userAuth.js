import { Capacitor } from "@capacitor/core";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  ACCOUNTS_REPORTS_COLLECTION,
  ACCOUNTS_SALARY_COLLECTION,
  ACCOUNTS_TRANSACTIONS_COLLECTION,
} from "./accounts.js";
import { auth, db, firebaseConfig } from "../firebase/config";
import { canRunDemoBootstrap } from "../firebase/environment.js";
import { calculateLoanValues } from "../utils/loanCalculation";
import { getLedgerWalletBalance, ledgerHasLoanDisbursementForCustomer } from "../utils/walletLedgerBalance";
import { notifyLoanCentersChanged } from "../constants/loanCenterStorage";
import {
  recordEmiCollectionLedgerEntry,
  recordLoanDisbursementDeltaLedgerEntry,
  recordLoanDisbursementLedgerEntry,
} from "./walletLedger.js";
import {
  hasDuplicateIdentity,
  hasDuplicatePhone,
  normalizeCustomerId,
  normalizePhoneNumber,
  normalizeText,
  validateCustomerId,
  validatePhoneNumber,
} from "../utils/customerValidation";
import {
  isActiveCustomerRecord,
  isRecordDeleted,
  isVisibleCustomerRecord,
} from "../utils/recordFlags";
import {
  getEmployeeCollectorAliases,
  normalizeCollectorKey,
} from "../utils/employeeCollectionDetails.js";
import { loadLoanCenters } from "../constants/dayCenters.js";
import { formatSequentialLoanId, generateLoanRequestId, maxSequentialLoanNumber } from "../utils/loanIds.js";
import { normalizeCollectionFrequency } from "../utils/loanTimelineDates.js";
import { preserveCustomerDocumentDataUrls } from "../utils/customerDocumentAttachments.js";
import {
  employeeLoginEmail,
  normalizeUsername,
  pruneAssignedCenters,
  validateAadhaarNumber,
  validateEmployeePhone,
} from "../utils/employeeManagement.js";

const USERS_COLLECTION = "users";
const EMPLOYEE_LOGINS_COLLECTION = "employee_logins";
const ADMIN_EMAIL = "admin@loanweb.com";
const ADMIN_PASSWORD = "Admin@123";
const ADMIN_EMPLOYEE_ID = "ADM-0001";

/** Default collector / employee account (created on first app load when no user is signed in). */
const DEMO_EMPLOYEE_EMAIL = "employee@loanweb.com";
const DEMO_EMPLOYEE_PASSWORD = "Employee@123";
const DEMO_EMPLOYEE_DISPLAY_NAME = "Demo Collector";
const DEMO_EMPLOYEE_ID = "EMP-DEMO01";
/** Fixed demo customer recreated after bootstrap or finance reset. */
const DEMO_CUSTOMER_ID = "CUST-26001";
const DEMO_CUSTOMER_NAME = "Demo Customer";
const DEMO_CUSTOMER_MOBILE = "9000000001";
const DEMO_CUSTOMER_IDENTITY = "123456789012";
const DEMO_CUSTOMER_NOMINEE_CONTACT = "8000000001";
const DEFAULT_LOAN_PRESET = {
  id: "preset-1",
  loanAmount: 20000,
  loanWeeks: 20,
  emiAmount: 1000,
  interestAmount: 0,
  totalPayable: 20000,
};

const FIRESTORE_READ_TIMEOUT_MS = 12_000;
let defaultAccountsBootstrapPromise = null;

function scheduleTimeout(ms) {
  const schedule =
    typeof window !== "undefined" ? window.setTimeout.bind(window) : setTimeout;
  const clear =
    typeof window !== "undefined" ? window.clearTimeout.bind(window) : clearTimeout;
  return { schedule, clear };
}

async function getDocWithTimeout(docRef, timeoutMs = FIRESTORE_READ_TIMEOUT_MS, label = "Profile load") {
  const { schedule, clear } = scheduleTimeout();
  let timeoutId;
  try {
    return await Promise.race([
      getDoc(docRef),
      new Promise((_, reject) => {
        timeoutId = schedule(() => {
          reject(
            new Error(
              `${label} timed out. Check your internet connection and try again.`
            )
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId != null) clear(timeoutId);
  }
}

async function waitForBootstrapBeforeLogin() {
  if (!defaultAccountsBootstrapPromise) return;
  try {
    await Promise.race([
      defaultAccountsBootstrapPromise,
      new Promise((resolve) => {
        const { schedule } = scheduleTimeout();
        schedule(resolve, 4000);
      }),
    ]);
  } catch {
    // Demo bootstrap failures should not block real user sign-in.
  }
}

const EMPLOYEE_SEQUENTIAL_ID_PATTERN = /^EMP(\d{3})$/;

function makeEmployeeId() {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `EMP-${randomPart}`;
}

function formatSequentialEmployeeId(sequenceNumber) {
  const next = Number(sequenceNumber);
  if (!Number.isFinite(next) || next < 1 || next > 999) {
    throw new Error("Employee ID limit reached (EMP999).");
  }
  return `EMP${String(next).padStart(3, "0")}`;
}

function maxSequentialEmployeeNumber(employeeIds = []) {
  return employeeIds.reduce((max, employeeId) => {
    const match = String(employeeId || "").toUpperCase().match(EMPLOYEE_SEQUENTIAL_ID_PATTERN);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);
}

/** Returns the next available employee ID in the format EMP001. */
export async function getNextEmployeeId() {
  const snapshot = await getDocs(query(collection(db, USERS_COLLECTION), where("role", "==", "employee")));
  const max = maxSequentialEmployeeNumber(snapshot.docs.map((docSnap) => docSnap.data().employeeId));
  const candidate = formatSequentialEmployeeId(max + 1);
  await assertEmployeeIdAvailable(candidate);
  return candidate;
}

async function assertUsernameAvailable(username, excludeDocId = "") {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    throw new Error("Username is required.");
  }
  const usernameQuery = query(collection(db, USERS_COLLECTION), where("username", "==", normalizedUsername));
  const usernameSnap = await getDocs(usernameQuery);
  const conflict = usernameSnap.docs.find((docSnap) => docSnap.id !== excludeDocId);
  if (conflict) {
    throw new Error("This username is already taken. Choose another username.");
  }
  return normalizedUsername;
}

export async function resolveLoginEmail(identifier) {
  const raw = normalizeText(identifier);
  if (!raw) {
    throw new Error("Username or email is required.");
  }
  if (raw.includes("@")) return raw.toLowerCase();

  const normalizedUsername = normalizeUsername(raw);
  try {
    const mappingSnap = await getDocWithTimeout(
      doc(db, EMPLOYEE_LOGINS_COLLECTION, normalizedUsername),
      8_000,
      "Username lookup"
    );
    if (mappingSnap.exists()) {
      const loginEmail = normalizeText(mappingSnap.data().loginEmail);
      if (loginEmail) return loginEmail.toLowerCase();
    }
  } catch {
    // If employee_logins rules are not deployed yet, fall back to the default login email.
  }

  return employeeLoginEmail(normalizedUsername);
}

async function setEmployeeLoginMapping(username, loginEmail, uid) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedEmail = normalizeText(loginEmail).toLowerCase();
  if (!normalizedUsername || !normalizedEmail || !uid) return;
  try {
    await setDoc(doc(db, EMPLOYEE_LOGINS_COLLECTION, normalizedUsername), {
      username: normalizedUsername,
      loginEmail: normalizedEmail,
      uid,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[loan-web] Could not save employee login mapping:", error);
  }
}

async function signInWithPasswordRest(email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Unable to sign in.");
  }
  return payload;
}

async function updateAuthPasswordWithIdToken(idToken, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${firebaseConfig.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken,
        password,
        returnSecureToken: true,
      }),
    }
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Unable to update password.");
  }
  return payload;
}

async function updateAuthEmailWithIdToken(idToken, email) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${firebaseConfig.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken,
        email,
        returnSecureToken: true,
      }),
    }
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Unable to update login email.");
  }
  return payload;
}

async function migrateEmployeeProfile(authUid, profileData, oldDocId, username, loginEmail) {
  await setDoc(doc(db, USERS_COLLECTION, authUid), {
    ...profileData,
    uid: authUid,
    email: loginEmail,
    username: normalizeUsername(username) || profileData.username || "",
  });
  if (oldDocId && oldDocId !== authUid) {
    await deleteDoc(doc(db, USERS_COLLECTION, oldDocId));
  }
  if (username) {
    await setEmployeeLoginMapping(username, loginEmail, authUid);
  }
}

function makeEmployeeAliasLoginEmail(username) {
  const slug = normalizeUsername(username) || "employee";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slug}.${suffix}@employees.loanweb`;
}

async function applyEmployeePasswordChange({
  email,
  username,
  newPassword,
  profileData,
  employeeDocId,
  currentPassword = "",
}) {
  const loginEmail = username
    ? await resolveLoginEmail(username)
    : normalizeText(email).toLowerCase();
  const trimmedCurrentPassword = String(currentPassword ?? "").trim();

  if (trimmedCurrentPassword) {
    const session = await signInWithPasswordRest(loginEmail, trimmedCurrentPassword);
    await updateAuthPasswordWithIdToken(session.idToken, newPassword);
    await migrateEmployeeProfile(session.localId, profileData, employeeDocId, username, loginEmail);
    return session;
  }

  try {
    const existingSession = await signInWithPasswordRest(loginEmail, newPassword);
    await migrateEmployeeProfile(existingSession.localId, profileData, employeeDocId, username, loginEmail);
    return existingSession;
  } catch {
    // Password differs from the requested value — create or recreate the login account.
  }

  try {
    const authResult = await createAuthAccount(loginEmail, newPassword);
    await migrateEmployeeProfile(authResult.localId, profileData, employeeDocId, username, loginEmail);
    return authResult;
  } catch (error) {
    if (!isAuthEmailExistsError(error)) {
      throw error;
    }
  }

  const aliasEmail = makeEmployeeAliasLoginEmail(username);
  const authResult = await createAuthAccount(aliasEmail, newPassword);
  await migrateEmployeeProfile(authResult.localId, profileData, employeeDocId, username, aliasEmail);
  return authResult;
}

async function assertEmployeeIdAvailable(employeeId, excludeDocId = "") {
  const normalized = normalizeText(employeeId).toUpperCase();
  if (!normalized) {
    throw new Error("Employee ID is required.");
  }
  if (!EMPLOYEE_SEQUENTIAL_ID_PATTERN.test(normalized)) {
    throw new Error("Employee ID must be in the format EMP001.");
  }
  const idQuery = query(collection(db, USERS_COLLECTION), where("employeeId", "==", normalized));
  const idSnap = await getDocs(idQuery);
  const conflict = idSnap.docs.find((docSnap) => docSnap.id !== excludeDocId);
  if (conflict) {
    throw new Error("This employee ID is already in use. Choose another ID.");
  }
  return normalized;
}

function normalizeAssignedCenters(centers = []) {
  const values = Array.isArray(centers) ? centers : [centers];
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

function finalizeAssignedCenters(centers = []) {
  return pruneAssignedCenters(normalizeAssignedCenters(centers), loadLoanCenters());
}

const CUSTOMER_SEQUENTIAL_ID_PATTERN = /^CX(\d{4})$/;

function formatSequentialCustomerId(sequenceNumber) {
  const next = Number(sequenceNumber);
  if (!Number.isFinite(next) || next < 1 || next > 9999) {
    throw new Error("Customer ID limit reached (CX9999).");
  }
  return `CX${String(next).padStart(4, "0")}`;
}

function maxSequentialCustomerNumber(customerIds = []) {
  return customerIds.reduce((max, customerId) => {
    const match = String(customerId || "").toUpperCase().match(CUSTOMER_SEQUENTIAL_ID_PATTERN);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);
}

/** Returns the next available customer ID in the format CX0001. */
export async function getNextCustomerId() {
  const snapshot = await getDocs(collection(db, "customers"));
  const ids = snapshot.docs.flatMap((docSnap) => [docSnap.id, docSnap.data()?.customerId].filter(Boolean));
  const max = maxSequentialCustomerNumber(ids);
  const candidate = formatSequentialCustomerId(max + 1);
  await assertCustomerIdAvailable(candidate);
  return candidate;
}

async function makeCustomerId() {
  return getNextCustomerId();
}

/** Validates the manual Customer ID format and ensures it is not already used. */
async function assertCustomerIdAvailable(customerId, excludeId = "") {
  const normalized = normalizeCustomerId(customerId);
  const formatError = validateCustomerId(normalized);
  if (formatError) {
    throw new Error(formatError);
  }
  if (normalized === excludeId) {
    return normalized;
  }
  const existing = await getDoc(doc(db, "customers", normalized));
  if (existing.exists()) {
    throw new Error("This Customer ID is already in use. Choose another ID.");
  }
  return normalized;
}

/** Returns the next available loan ID in the format SA0001. */
export async function getNextLoanId() {
  const [applicationsSnap, customersSnap, requestsSnap] = await Promise.all([
    getDocs(collection(db, "loanApplications")),
    getDocs(collection(db, "customers")),
    getDocs(collection(db, "loanRequests")).catch(() => null),
  ]);

  const loanIds = [
    ...applicationsSnap.docs.map((docSnap) => docSnap.data().applicationId || docSnap.id),
    ...customersSnap.docs.map((docSnap) => docSnap.data().applicationId),
    ...(requestsSnap?.docs || []).map((docSnap) => docSnap.data().loanId || docSnap.data().applicationId),
  ].filter(Boolean);

  return formatSequentialLoanId(maxSequentialLoanNumber(loanIds) + 1);
}

function makeNotificationId() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `NOTI-${datePart}-${randomPart}`;
}

function makeAuditId() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AUD-${datePart}-${randomPart}`;
}

function makeWalletTransactionId() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WTX-${datePart}-${randomPart}`;
}

function buildDueDate(disbursementDate, loanWeeks, collectionFrequency) {
  const baseDate = disbursementDate ? new Date(disbursementDate) : new Date();
  if (Number.isNaN(baseDate.getTime())) {
    return "";
  }

  const weeks = Number(loanWeeks || 0);
  const frequency = normalizeText(collectionFrequency).toLowerCase();
  const intervalDays =
    frequency === "daily" ? 1 : frequency.startsWith("month") ? 30 : 7;
  baseDate.setDate(baseDate.getDate() + Math.max(weeks * intervalDays, 0));
  return baseDate.toISOString().slice(0, 10);
}

async function validateCustomerUniqueness({ customerId, mobileNumber, alternateNumber, identityNumber }) {
  const snapshot = await getDocs(query(collection(db, "customers")));
  const customers = snapshot.docs.map((customerDoc) => customerDoc.data());

  const phoneError = validatePhoneNumber(mobileNumber, "Mobile number");
  if (phoneError) {
    throw new Error(phoneError);
  }

  if (alternateNumber) {
    const alternateError = validatePhoneNumber(alternateNumber, "Alternate number");
    if (alternateError) {
      throw new Error(alternateError);
    }
  }

  if (hasDuplicatePhone(customers, mobileNumber, customerId)) {
    throw new Error("This mobile number already exists");
  }

  if (alternateNumber && hasDuplicatePhone(customers, alternateNumber, customerId)) {
    throw new Error("This alternate number already exists");
  }

  if (hasDuplicateIdentity(customers, identityNumber, customerId)) {
    throw new Error("This ID number already exists");
  }
}

/** Phone duplicate check before OTP — identity not required yet. */
export async function assertNewCustomerMobileAvailable(mobileNumber, alternateNumber = "") {
  const snapshot = await getDocs(query(collection(db, "customers")));
  const customers = snapshot.docs.map((customerDoc) => customerDoc.data());

  const phoneError = validatePhoneNumber(mobileNumber, "Mobile number");
  if (phoneError) throw new Error(phoneError);

  if (alternateNumber) {
    const altErr = validatePhoneNumber(alternateNumber, "Alternate number");
    if (altErr) throw new Error(altErr);
  }

  if (hasDuplicatePhone(customers, mobileNumber, undefined)) {
    throw new Error("This mobile number already exists");
  }
  if (alternateNumber && hasDuplicatePhone(customers, alternateNumber, undefined)) {
    throw new Error("This alternate number already exists");
  }
}

/** Full uniqueness preflight (same rules as {@link createCustomer}). */
export async function assertNewCustomerProfileAvailable({ mobileNumber, alternateNumber = "", identityNumber }) {
  await validateCustomerUniqueness({
    customerId: undefined,
    mobileNumber,
    alternateNumber,
    identityNumber,
  });
}

async function createNotification({
  type,
  title,
  message,
  audienceRole = "admin",
  customerId = "",
  customerName = "",
  relatedId = "",
  status = "unread",
}) {
  const notificationId = makeNotificationId();
  const now = new Date();

  await setDoc(doc(db, "notifications", notificationId), {
    notificationId,
    type: normalizeText(type),
    title: normalizeText(title),
    message: normalizeText(message),
    audienceRole: normalizeText(audienceRole) || "admin",
    customerId: normalizeText(customerId),
    customerName: normalizeText(customerName),
    relatedId: normalizeText(relatedId),
    status: normalizeText(status) || "unread",
    createdAt: serverTimestamp(),
    submittedAt: now.toISOString(),
  });

  return {
    notificationId,
    submittedAt: now.toISOString(),
  };
}

async function createAuditLog({
  action,
  entityType,
  entityId,
  message,
  actorName = "System",
  actorRole = "admin",
}) {
  const auditId = makeAuditId();
  const now = new Date();

  await setDoc(doc(db, "auditLogs", auditId), {
    auditId,
    action: normalizeText(action),
    entityType: normalizeText(entityType),
    entityId: normalizeText(entityId),
    message: normalizeText(message),
    actorName: normalizeText(actorName) || "System",
    actorRole: normalizeText(actorRole) || "admin",
    createdAt: serverTimestamp(),
    submittedAt: now.toISOString(),
  });

  return {
    auditId,
    submittedAt: now.toISOString(),
  };
}

async function buildLoanApplicationRecord({
  customerId,
  applicationId,
  customerName,
  mobileNumber,
  alternateNumber,
  identityType,
  identityNumber,
  address,
  country,
  selectedDay,
  parentCenterLabel = "",
  subCenterLabel = "",
  loanAmount,
  loanWeeks,
  loanPresetId = "",
  loanPresetLabel = "",
  loanPresetLoanAmount = 0,
  loanPresetLoanWeeks = 0,
  loanPresetEmiAmount = 0,
  loanPresetInterestAmount = 0,
  loanPresetTotalPayable = 0,
  disbursementDate,
  dueDate,
  collectionFrequency,
  nomineeName,
  nomineeContact,
  additionalContact,
  idDocumentName,
  idDocumentDataUrl = "",
  addressProofName,
  addressProofDataUrl = "",
  loanAgreementName,
  loanAgreementDataUrl = "",
  supportingDocumentNames = [],
  coApplicantName,
  coApplicantContact,
  coApplicantRelation,
  coApplicantAddress,
  coApplicantIdentityType,
  coApplicantIdentityNumber,
  coApplicantIdProofName,
  coApplicantIdProofDataUrl = "",
  coApplicantPhotoName,
  customerPhotoName = "",
  customerPhotoDataUrl = "",
  coApplicantPhotoDataUrl = "",
  isArchived = false,
  archivedAt = null,
  loanStatus = "active",
  closedAt = null,
  rescheduledAt = null,
  rescheduleReason = "",
}) {
  const now = new Date();
  const finalCustomerId = customerId || (await makeCustomerId());
  const finalApplicationId = applicationId || (await getNextLoanId());
  const preset = {
    id: loanPresetId,
    loanAmount: loanPresetLoanAmount,
    loanWeeks: loanPresetLoanWeeks,
    emiAmount: loanPresetEmiAmount,
    interestAmount: loanPresetInterestAmount,
    totalPayable: loanPresetTotalPayable,
  };
  const calculated = calculateLoanValues({ loanAmount, loanWeeks, preset });
  const normalizedFrequency = normalizeText(collectionFrequency) || "Weekly";
  const finalDisbursementDate = disbursementDate || now.toISOString().slice(0, 10);
  const finalDueDate = dueDate || buildDueDate(finalDisbursementDate, loanWeeks, normalizedFrequency);

  return {
    customerId: finalCustomerId,
    applicationId: finalApplicationId,
    customerName: normalizeText(customerName),
    mobileNumber: normalizePhoneNumber(mobileNumber),
    alternateNumber: normalizePhoneNumber(alternateNumber),
    identityType: normalizeText(identityType),
    identityNumber: normalizeText(identityNumber),
    address: normalizeText(address),
    country: normalizeText(country),
    selectedDay: normalizeText(selectedDay),
    parentCenterLabel: normalizeText(parentCenterLabel),
    subCenterLabel: normalizeText(subCenterLabel),
    loanAmount: calculated.loanAmount,
    loanWeeks: calculated.loanWeeks,
    weeklyDue: calculated.emiAmount,
    totalPayable: calculated.totalPayable,
    interestAmount: calculated.interestAmount,
    emiAmount: calculated.emiAmount,
    loanPresetId: normalizeText(loanPresetId),
    loanPresetLabel: normalizeText(loanPresetLabel),
    loanPresetLoanAmount: Number(loanPresetLoanAmount || 0),
    loanPresetLoanWeeks: Number(loanPresetLoanWeeks || 0),
    loanPresetEmiAmount: Number(loanPresetEmiAmount || 0),
    loanPresetInterestAmount: Number(loanPresetInterestAmount || 0),
    loanPresetTotalPayable: Number(loanPresetTotalPayable || 0),
    disbursementDate: finalDisbursementDate,
    dueDate: finalDueDate,
    collectionFrequency: normalizedFrequency,
    nomineeName: normalizeText(nomineeName),
    nomineeContact: normalizeText(nomineeContact),
    additionalContact: normalizeText(additionalContact),
    idDocumentName: normalizeText(idDocumentName),
    idDocumentDataUrl: normalizeText(idDocumentDataUrl),
    addressProofName: normalizeText(addressProofName),
    addressProofDataUrl: normalizeText(addressProofDataUrl),
    loanAgreementName: normalizeText(loanAgreementName),
    loanAgreementDataUrl: normalizeText(loanAgreementDataUrl),
    supportingDocumentNames: Array.isArray(supportingDocumentNames)
      ? supportingDocumentNames.map((name) => normalizeText(name)).filter(Boolean)
      : [],
    coApplicantName: normalizeText(coApplicantName),
    coApplicantContact: normalizeText(coApplicantContact),
    coApplicantRelation: normalizeText(coApplicantRelation),
    coApplicantAddress: normalizeText(coApplicantAddress),
    coApplicantIdentityType: normalizeText(coApplicantIdentityType),
    coApplicantIdentityNumber: normalizeText(coApplicantIdentityNumber),
    coApplicantIdProofName: normalizeText(coApplicantIdProofName),
    coApplicantIdProofDataUrl: normalizeText(coApplicantIdProofDataUrl),
    coApplicantPhotoName: normalizeText(coApplicantPhotoName),
    customerPhotoName: normalizeText(customerPhotoName),
    customerPhotoDataUrl: normalizeText(customerPhotoDataUrl),
    coApplicantPhotoDataUrl: normalizeText(coApplicantPhotoDataUrl),
    isArchived: Boolean(isArchived),
    archivedAt: archivedAt || null,
    loanStatus: normalizeText(loanStatus) || "active",
    closedAt: closedAt || null,
    rescheduledAt: rescheduledAt || null,
    rescheduleReason: normalizeText(rescheduleReason),
    approvalStatus: "pending",
    amountStatus: "open",
    loanApprovedAt: null,
    loanAppliedAt: now.toISOString(),
    createdAt: serverTimestamp(),
    submittedAt: now.toISOString(),
  };
}

function isAuthEmailExistsError(error) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");
  return (
    code === "EMAIL_EXISTS" ||
    message === "EMAIL_EXISTS" ||
    message.includes("EMAIL_EXISTS") ||
    message.toLowerCase().includes("already registered")
  );
}

async function createAuthAccount(email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  const payload = await response.json();

  if (!response.ok) {
    const errorMessage = payload?.error?.message || "Unable to create account";
    if (errorMessage === "EMAIL_EXISTS") {
      const error = new Error("This login is already registered.");
      error.code = "EMAIL_EXISTS";
      throw error;
    }
    throw new Error(errorMessage);
  }

  return payload;
}

async function ensureUserProfile({ uid, email, role, displayName, employeeId }) {
  const userRef = doc(db, USERS_COLLECTION, uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    await setDoc(userRef, {
      uid,
      email,
      role,
      displayName,
      employeeId,
      createdAt: serverTimestamp(),
    });
  }
}

/** Ensures Firestore profile matches Auth (e.g. role) without wiping other fields. */
async function ensureAdminProfileForUid(uid) {
  const userRef = doc(db, USERS_COLLECTION, uid);
  const snapshot = await getDoc(userRef);
  const base = {
    uid,
    email: ADMIN_EMAIL,
    role: "admin",
    displayName: "Loan Web Admin",
    employeeId: ADMIN_EMPLOYEE_ID,
  };
  try {
    if (!snapshot.exists()) {
      await setDoc(userRef, { ...base, createdAt: serverTimestamp() });
      return;
    }
    await setDoc(
      userRef,
      {
        ...base,
        createdAt: snapshot.data()?.createdAt ?? serverTimestamp(),
      },
      { merge: true }
    );
  } catch (profileError) {
    const message = profileError?.message || "";
    if (message.includes("permission") || message.includes("Permission")) {
      throw new Error(
        "Could not save the admin profile. Deploy Firestore rules: firebase deploy --only firestore:rules"
      );
    }
    throw profileError;
  }
}

async function fetchLedgerWalletBalanceAndRows() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("You must be signed in to manage loans or the wallet.");
  }
  const [wSnap, cSnap, eSnap, uSnap] = await Promise.all([
    getDocs(collection(db, "walletTransactions")),
    getDocs(collection(db, "customers")),
    getDocs(collection(db, "customerAmounts")),
    getDoc(doc(db, USERS_COLLECTION, uid)),
  ]);
  const walletRows = wSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  walletRows.sort((a, b) => {
    const ta = new Date(a.submittedAt || 0).getTime();
    const tb = new Date(b.submittedAt || 0).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.transactionId || a.id).localeCompare(String(b.transactionId || b.id));
  });
  const customers = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const entries = eSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const opening = Number(uSnap.data()?.preferences?.cashInHandOpening ?? 0) || 0;
  const balance = getLedgerWalletBalance(walletRows, customers, entries, opening);
  return { balance, walletRows, customers, entries, opening };
}

function formatInr(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

async function ensureDemoEmployeeProfileForUid(uid) {
  const userRef = doc(db, USERS_COLLECTION, uid);
  const snapshot = await getDoc(userRef);
  const base = {
    uid,
    email: DEMO_EMPLOYEE_EMAIL,
    role: "employee",
    displayName: DEMO_EMPLOYEE_DISPLAY_NAME,
    employeeId: DEMO_EMPLOYEE_ID,
    phone: "",
    employeeStatus: "active",
    username: "demo",
    assignedCenters: ["Monday Centre"],
    location: "Monday Centre",
  };
  if (!snapshot.exists()) {
    await setDoc(userRef, { ...base, createdAt: serverTimestamp() });
    await setEmployeeLoginMapping("demo", DEMO_EMPLOYEE_EMAIL, uid);
    return;
  }
  await setDoc(
    userRef,
    {
      ...base,
      createdAt: snapshot.data()?.createdAt ?? serverTimestamp(),
    },
    { merge: true }
  );
  await setEmployeeLoginMapping("demo", DEMO_EMPLOYEE_EMAIL, uid);
}

/** Avoids re-running sign-in bootstrap on every refresh (Firebase rate-limits burst sign-ins). */
const SEED_SESSION_STORAGE_KEY = "loan_bootstrap_signins_v1";
const DEMO_CUSTOMER_RESEED_SESSION_KEY = "loan_demo_customer_reseed_v1";

async function releaseBootstrapAuthSession(expectedEmail) {
  try {
    const currentEmail = auth.currentUser?.email?.toLowerCase() || "";
    if (currentEmail === String(expectedEmail || "").toLowerCase()) {
      await signOut(auth);
    }
  } catch {
    // ignore — login page will recover on next attempt
  }
}

/** @returns {Promise<boolean>} true if admin account exists and profile is OK (or was just created). */
async function seedAdminUser() {
  try {
    const credential = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
    await ensureAdminProfileForUid(credential.user.uid);
    return true;
  } catch (signInError) {
    const code = signInError?.code || "";

    if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
      console.warn(
        "[loan-web] Admin password does not match the default in code. In Firebase Console → Authentication, reset the password for",
        ADMIN_EMAIL,
        "or change ADMIN_PASSWORD in src/services/userAuth.js to match your project."
      );
      return false;
    }

    if (code === "auth/too-many-requests") {
      console.warn(
        "[loan-web] Admin bootstrap skipped: Firebase rate limit. Wait before retrying or clear sessionStorage key",
        SEED_SESSION_STORAGE_KEY,
        "and reload once."
      );
      return false;
    }

    if (code !== "auth/user-not-found" && code !== "auth/invalid-email") {
      console.warn("[loan-web] Admin bootstrap:", signInError);
      return false;
    }

    try {
      const adminAuth = await createAuthAccount(ADMIN_EMAIL, ADMIN_PASSWORD);
      await ensureUserProfile({
        uid: adminAuth.localId,
        email: ADMIN_EMAIL,
        role: "admin",
        displayName: "Loan Web Admin",
        employeeId: ADMIN_EMPLOYEE_ID,
      });
      return true;
    } catch (createError) {
      const message = createError?.message || String(createError);
      if (message.includes("EMAIL_EXISTS") || message === "EMAIL_EXISTS") {
        console.warn(
          "[loan-web] Admin email exists in Firebase Auth but sign-in failed. Reset the password in Firebase Console for",
          ADMIN_EMAIL
        );
        return false;
      }
      console.warn("[loan-web] Admin create failed:", createError);
      return false;
    }
  } finally {
    await releaseBootstrapAuthSession(ADMIN_EMAIL);
  }
}

/** @returns {Promise<boolean>} true if demo employee exists and profile is OK (or was just created). */
async function seedDemoEmployeeUser() {
  try {
    const credential = await signInWithEmailAndPassword(auth, DEMO_EMPLOYEE_EMAIL, DEMO_EMPLOYEE_PASSWORD);
    await ensureDemoEmployeeProfileForUid(credential.user.uid);
    return true;
  } catch (signInError) {
    const code = signInError?.code || "";

    if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
      console.warn(
        "[loan-web] Demo employee password does not match the default. Reset in Firebase Console for",
        DEMO_EMPLOYEE_EMAIL,
        "or change DEMO_EMPLOYEE_PASSWORD in src/services/userAuth.js."
      );
      return false;
    }

    if (code === "auth/too-many-requests") {
      console.warn("[loan-web] Employee bootstrap skipped: Firebase rate limit (same as admin).");
      return false;
    }

    if (code !== "auth/user-not-found" && code !== "auth/invalid-email") {
      console.warn("[loan-web] Employee bootstrap:", signInError);
      return false;
    }

    try {
      const authResult = await createAuthAccount(DEMO_EMPLOYEE_EMAIL, DEMO_EMPLOYEE_PASSWORD);
      await setDoc(doc(db, USERS_COLLECTION, authResult.localId), {
        uid: authResult.localId,
        email: DEMO_EMPLOYEE_EMAIL,
        role: "employee",
        displayName: DEMO_EMPLOYEE_DISPLAY_NAME,
        phone: "",
        employeeId: DEMO_EMPLOYEE_ID,
        employeeStatus: "active",
        username: "demo",
        assignedCenters: ["Monday Centre"],
        location: "Monday Centre",
        createdAt: serverTimestamp(),
      });
      await setEmployeeLoginMapping("demo", DEMO_EMPLOYEE_EMAIL, authResult.localId);
      return true;
    } catch (createError) {
      const message = createError?.message || String(createError);
      if (message.includes("EMAIL_EXISTS") || message === "EMAIL_EXISTS") {
        console.warn(
          "[loan-web] Employee email exists in Firebase Auth but sign-in failed. Reset the password in Firebase Console for",
          DEMO_EMPLOYEE_EMAIL
        );
        return false;
      }
      console.warn("[loan-web] Employee create failed:", createError);
      return false;
    }
  } finally {
    await releaseBootstrapAuthSession(DEMO_EMPLOYEE_EMAIL);
  }
}

let defaultAccountsSeedAttempted = false;

function shouldSkipSeedThisBrowserSession() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.sessionStorage.getItem(SEED_SESSION_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeedFinishedThisBrowserSession() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(SEED_SESSION_STORAGE_KEY, "1");
  } catch {
    // ignore (private mode, etc.)
  }
}

function shouldSkipDemoCustomerReseedThisSession() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.sessionStorage.getItem(DEMO_CUSTOMER_RESEED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markDemoCustomerReseededThisSession() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(DEMO_CUSTOMER_RESEED_SESSION_KEY, "1");
  } catch {
    // ignore
  }
}

/**
 * Creates default admin + demo employee Auth users and Firestore profiles on first use.
 * Safe when nobody is signed in (e.g. login screen). Does nothing if a session exists.
 * Runs at most once per browser tab session to reduce Firebase "too many attempts" rate limits.
 */
export async function seedDefaultAccounts() {
  if (Capacitor.isNativePlatform()) {
    return;
  }
  if (!canRunDemoBootstrap()) {
    return;
  }
  if (auth.currentUser) {
    return;
  }
  if (shouldSkipSeedThisBrowserSession()) {
    if (!shouldSkipDemoCustomerReseedThisSession()) {
      await seedDemoCustomerIfMissing();
      markDemoCustomerReseededThisSession();
    }
    return;
  }
  if (defaultAccountsBootstrapPromise) {
    return defaultAccountsBootstrapPromise;
  }
  if (defaultAccountsSeedAttempted) {
    return;
  }
  defaultAccountsSeedAttempted = true;

  defaultAccountsBootstrapPromise = (async () => {
    try {
      const adminOk = await withBootstrapTimeout(seedAdminUser(), "Admin account setup");
      const employeeOk = await withBootstrapTimeout(seedDemoEmployeeUser(), "Employee account setup");
      // Only skip future bootstrap attempts when both demo accounts are ready — avoids poisoning
      // the tab with sessionStorage after a failed create (e.g. sign-up disabled in Firebase).
      if (adminOk && employeeOk) {
        await withBootstrapTimeout(seedDemoCustomerIfMissing(), "Demo customer setup");
        markSeedFinishedThisBrowserSession();
      }
    } catch (e) {
      console.warn("[loan-web] Default accounts bootstrap:", e);
    } finally {
      defaultAccountsBootstrapPromise = null;
    }
  })();

  return defaultAccountsBootstrapPromise;
}

/** @deprecated Use seedDefaultAccounts — kept for existing imports. */
export const seedAdminAccount = seedDefaultAccounts;

export async function loginWithRole({ email, password }) {
  await waitForBootstrapBeforeLogin();
  const normalizedEmail = await resolveLoginEmail(email);
  const loginPassword = String(password ?? "").trim();
  if (!loginPassword) {
    throw new Error("Password is required.");
  }
  let credential;
  try {
    credential = await signInWithEmailAndPassword(auth, normalizedEmail, loginPassword);
    await credential.user.getIdToken();
  } catch (authError) {
    const code = authError?.code || "";
    if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
      const identifier = normalizeText(email);
      const loginHint = identifier.includes("@")
        ? "Check the email and password from your admin."
        : `Sign in with your username "${normalizeUsername(identifier)}" and the exact password set by your admin (case-sensitive).`;
      throw new Error(`Invalid username or password. ${loginHint}`);
    }
    if (code === "auth/user-not-found") {
      const identifier = normalizeText(email);
      const loginTarget = identifier.includes("@")
        ? identifier.toLowerCase()
        : normalizeUsername(identifier);
      throw new Error(
        identifier.includes("@")
          ? `No login account found for ${loginTarget}. Ask your admin to create your employee login from the Employee page.`
          : `No login account found for username "${loginTarget}". Ask your admin to create or reset your login from the Employee page.`
      );
    }
    if (code === "auth/too-many-requests") {
      throw new Error(
        "Firebase has temporarily limited sign-ins from this device or network (often 15–60 minutes). " +
          "Wait before trying again, use another network or device, or reset the password in Firebase Console → Authentication. " +
          "Refreshing the login page repeatedly can also trigger this limit."
      );
    }
    throw new Error(authError?.message || "Login failed");
  }

  const profileRef = doc(db, USERS_COLLECTION, credential.user.uid);
  let profileSnap;
  try {
    profileSnap = await getDocWithTimeout(profileRef, FIRESTORE_READ_TIMEOUT_MS, "Profile load");
  } catch (profileError) {
    await signOut(auth);
    const message = profileError?.message || "";
    if (message.includes("permission") || message.includes("Permission")) {
      throw new Error(
        "Could not load your employee profile. Ask an admin to open the Employee page, edit your account, set your password again, and save."
      );
    }
    if (message.includes("timed out")) {
      throw profileError;
    }
    throw profileError;
  }

  const signedInEmail = (credential.user.email || "").toLowerCase();

  if (!profileSnap.exists()) {
    if (signedInEmail === ADMIN_EMAIL.toLowerCase()) {
      await ensureAdminProfileForUid(credential.user.uid);
      const created = await getDoc(profileRef);
      if (created.exists()) {
        return { credential, profile: created.data() };
      }
    }
    if (signedInEmail === DEMO_EMPLOYEE_EMAIL.toLowerCase()) {
      await ensureDemoEmployeeProfileForUid(credential.user.uid);
      const created = await getDoc(profileRef);
      if (created.exists()) {
        return { credential, profile: created.data() };
      }
    }
    await signOut(auth);
    const identifier = normalizeText(signedInEmail);
    const usernameLabel = identifier.includes("@") ? identifier : normalizeUsername(identifier);
    throw new Error(
      signedInEmail === ADMIN_EMAIL.toLowerCase()
        ? "Admin sign-in succeeded but the admin profile could not be saved. Deploy the latest Firestore rules (firebase deploy --only firestore:rules) and try again."
        : `Login account exists for "${usernameLabel}" but the employee profile is missing. Ask an admin to edit this employee on the Employee page, set the password, and save again.`
    );
  }

  let profile = profileSnap.data();

  if (signedInEmail === ADMIN_EMAIL.toLowerCase()) {
    await ensureAdminProfileForUid(credential.user.uid);
    const refreshed = await getDoc(profileRef);
    if (refreshed.exists()) {
      profile = refreshed.data();
    }
  }

  if (signedInEmail === DEMO_EMPLOYEE_EMAIL.toLowerCase()) {
    await ensureDemoEmployeeProfileForUid(credential.user.uid);
    const refreshed = await getDoc(profileRef);
    if (refreshed.exists()) {
      profile = refreshed.data();
    }
  }

  if (profile.role === "employee" && normalizeEmployeeStatus(profile.employeeStatus) === "inactive") {
    await signOut(auth);
    throw new Error("This employee account is inactive. Contact your admin to activate it.");
  }

  if (!profile.role) {
    await signOut(auth);
    throw new Error("Your account profile is incomplete. Contact your admin.");
  }

  return { credential, profile };
}

const LOGIN_TIMEOUT_MS = 45_000;
const BOOTSTRAP_TIMEOUT_MS = 15_000;

async function withBootstrapTimeout(promise, label) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        const schedule =
          typeof window !== "undefined" ? window.setTimeout.bind(window) : setTimeout;
        timeoutId = schedule(() => {
          reject(new Error(`${label} timed out. Check your internet connection and reload.`));
        }, BOOTSTRAP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId != null) {
      const clear =
        typeof window !== "undefined" ? window.clearTimeout.bind(window) : clearTimeout;
      clear(timeoutId);
    }
  }
}

export async function loginWithRoleTimed(credentials, timeoutMs = LOGIN_TIMEOUT_MS) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    const schedule =
      typeof window !== "undefined" ? window.setTimeout.bind(window) : setTimeout;
    timeoutId = schedule(() => {
      reject(
        new Error(
          "Sign-in timed out. Check your internet connection, wait a moment, and try again. " +
            "If you are on a slow network, reload the page before signing in."
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([loginWithRole(credentials), timeoutPromise]);
  } finally {
    if (timeoutId != null) {
      const clear =
        typeof window !== "undefined" ? window.clearTimeout.bind(window) : clearTimeout;
      clear(timeoutId);
    }
  }
}

function normalizeEmployeeStatus(status) {
  return String(status || "").toLowerCase() === "inactive" ? "inactive" : "active";
}

/** Internal email for collectors promoted to register without a login mailbox. */
export function buildEmployeeRegisterEmail(displayName) {
  const slug =
    String(displayName || "employee")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "") || "employee";
  return `${slug}@employees.loanweb`;
}

async function assertEmployeeEmailAvailable(email) {
  const normalizedEmail = normalizeText(email).toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Email address is required.");
  }
  const existingQuery = query(collection(db, USERS_COLLECTION), where("email", "==", normalizedEmail));
  const existingSnap = await getDocs(existingQuery);
  if (!existingSnap.empty) {
    throw new Error("This username is already registered for login. Choose another username.");
  }
  return normalizedEmail;
}

export async function createManagedEmployee({
  employeeId,
  displayName,
  secondName = "",
  username,
  password,
  aadhaarNumber,
  phone,
  assignedCenters = [],
  employeeStatus = "active",
}) {
  const normalizedEmployeeId = normalizeText(employeeId)
    ? await assertEmployeeIdAvailable(employeeId)
    : await getNextEmployeeId();

  // Run username/email uniqueness lookups in parallel.
  const [normalizedUsername, normalizedEmail] = await Promise.all([
    assertUsernameAvailable(username),
    assertEmployeeEmailAvailable(employeeLoginEmail(normalizeUsername(username))),
  ]);
  const aadhaarError = validateAadhaarNumber(aadhaarNumber);
  if (aadhaarError) throw new Error(aadhaarError);
  const phoneError = validateEmployeePhone(phone);
  if (phoneError) throw new Error(phoneError);
  const loginPassword = String(password ?? "").trim();
  if (!loginPassword || loginPassword.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }
  const centers = finalizeAssignedCenters(assignedCenters);
  const authResult = await createAuthAccount(normalizedEmail, loginPassword);

  await setDoc(doc(db, USERS_COLLECTION, authResult.localId), {
    uid: authResult.localId,
    email: normalizedEmail,
    username: normalizedUsername,
    loginPassword,
    role: "employee",
    displayName: normalizeText(displayName),
    secondName: normalizeText(secondName),
    phone: normalizePhoneNumber(phone),
    aadhaarNumber: String(aadhaarNumber || "").replace(/\D/g, ""),
    assignedCenters: centers,
    location: centers[0] || "",
    employeeStatus: normalizeEmployeeStatus(employeeStatus),
    employeeId: normalizedEmployeeId,
    createdAt: serverTimestamp(),
  });
  await setEmployeeLoginMapping(normalizedUsername, normalizedEmail, authResult.localId);

  await createAuditLog({
    action: "create_employee",
    entityType: "user",
    entityId: authResult.localId,
    message: `${[normalizeText(displayName), normalizeText(secondName)].filter(Boolean).join(" ") || normalizedUsername} (${normalizedEmployeeId}) was created${centers.length ? ` with centres ${centers.join(", ")}` : " without centres yet"}.`,
    actorName: "Admin",
    actorRole: "admin",
  });

  return { id: authResult.localId, employeeId: normalizedEmployeeId, username: normalizedUsername };
}

export async function createEmployeeProfile({
  name,
  email,
  phone = "",
  address = "",
  location = "",
  joiningDate = "",
  employeeStatus = "active",
}) {
  const normalizedEmail = await assertEmployeeEmailAvailable(email);
  const normalizedLocation = normalizeText(location);
  if (!normalizedLocation) {
    throw new Error("Assigned center is required.");
  }
  const employeeId = makeEmployeeId();
  const profileRef = doc(collection(db, USERS_COLLECTION));

  await setDoc(profileRef, {
    email: normalizedEmail,
    role: "employee",
    displayName: normalizeText(name),
    phone: normalizeText(phone),
    address: normalizeText(address),
    location: normalizedLocation,
    joiningDate: normalizeText(joiningDate),
    employeeStatus: normalizeEmployeeStatus(employeeStatus),
    employeeId,
    createdAt: serverTimestamp(),
  });

  await createAuditLog({
    action: "create_employee_profile",
    entityType: "user",
    entityId: profileRef.id,
    message: `${normalizeText(name) || normalizedEmail} was added to the employee register.`,
    actorName: "Admin",
    actorRole: "admin",
  });

  return {
    id: profileRef.id,
    employeeId,
  };
}

export async function createEmployeeAccount({
  name,
  email = "",
  username = "",
  password,
  phone,
  role,
  address = "",
  location = "",
  joiningDate = "",
  employeeStatus = "active",
}) {
  const loginPassword = String(password ?? "").trim() || `Emp@${Math.random().toString(36).slice(2, 10)}!1`;
  if (loginPassword.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const usernameCandidate = normalizeUsername(username || (!String(email).includes("@") ? email : ""));
  let normalizedUsername = "";
  let normalizedEmail = "";

  if (usernameCandidate) {
    normalizedUsername = await assertUsernameAvailable(usernameCandidate);
    normalizedEmail = await assertEmployeeEmailAvailable(employeeLoginEmail(normalizedUsername));
  } else {
    normalizedEmail = await assertEmployeeEmailAvailable(email);
    normalizedUsername = normalizeUsername(normalizedEmail.split("@")[0] || "");
  }

  const authResult = await createAuthAccount(normalizedEmail, loginPassword);
  const employeeId = makeEmployeeId();

  await setDoc(doc(db, USERS_COLLECTION, authResult.localId), {
    uid: authResult.localId,
    email: normalizedEmail,
    username: normalizedUsername,
    role: normalizeText(role) || "employee",
    displayName: normalizeText(name),
    phone: normalizeText(phone),
    address: normalizeText(address),
    location: normalizeText(location),
    joiningDate: normalizeText(joiningDate),
    employeeStatus: normalizeEmployeeStatus(employeeStatus),
    employeeId,
    createdAt: serverTimestamp(),
  });
  if (normalizedUsername) {
    await setEmployeeLoginMapping(normalizedUsername, normalizedEmail, authResult.localId);
  }

  await createAuditLog({
    action: "create_user",
    entityType: "user",
    entityId: authResult.localId,
    message: `${name || email} account was created with role ${role}.`,
    actorName: "Admin",
    actorRole: "admin",
  });

  return {
    uid: authResult.localId,
    employeeId,
    username: normalizedUsername,
    loginUsername: normalizedUsername,
  };
}

export async function loadCurrentProfile(user) {
  if (!user) return null;

  const profileSnap = await getDoc(doc(db, USERS_COLLECTION, user.uid));
  return profileSnap.exists() ? profileSnap.data() : null;
}

export async function updateEmployeeAdmin(employeeDocId, payload) {
  if (!employeeDocId) {
    throw new Error("Employee record is missing.");
  }

  const userRef = doc(db, USERS_COLLECTION, employeeDocId);
  const currentSnap = await getDoc(userRef);
  if (!currentSnap.exists()) {
    throw new Error("Employee record was not found.");
  }
  const current = currentSnap.data();

  const centers =
    payload.assignedCenters !== undefined
      ? finalizeAssignedCenters(payload.assignedCenters)
      : finalizeAssignedCenters(
          Array.isArray(current.assignedCenters)
            ? current.assignedCenters
            : current.location
              ? [current.location]
              : []
        );

  const phone = normalizePhoneNumber(payload.phone ?? current.phone ?? "");
  const phoneError = validateEmployeePhone(phone);
  if (phoneError) throw new Error(phoneError);

  if (payload.aadhaarNumber !== undefined) {
    const aadhaarError = validateAadhaarNumber(payload.aadhaarNumber);
    if (aadhaarError) throw new Error(aadhaarError);
  }

  let nextEmployeeId = current.employeeId || "";
  if (payload.employeeId !== undefined) {
    nextEmployeeId = await assertEmployeeIdAvailable(payload.employeeId, employeeDocId);
  }

  let nextUsername = current.username || "";
  let nextEmail = current.email || "";
  let usernameChanged = false;
  if (payload.username !== undefined) {
    const normalizedUsername = await assertUsernameAvailable(payload.username, employeeDocId);
    if (normalizedUsername !== (current.username || "")) {
      usernameChanged = true;
      nextUsername = normalizedUsername;
      nextEmail = employeeLoginEmail(normalizedUsername);
    }
  }

  const normalizedPayload = {
    displayName: normalizeText(payload.displayName ?? current.displayName),
    secondName:
      payload.secondName !== undefined
        ? normalizeText(payload.secondName)
        : normalizeText(current.secondName || ""),
    phone,
    aadhaarNumber:
      payload.aadhaarNumber !== undefined
        ? String(payload.aadhaarNumber || "").replace(/\D/g, "")
        : current.aadhaarNumber || "",
    assignedCenters: centers,
    location: centers[0] || "",
    employeeStatus: normalizeEmployeeStatus(payload.employeeStatus ?? current.employeeStatus),
    employeeId: nextEmployeeId,
    username: nextUsername,
    email: nextEmail,
  };

  const nextPassword = String(payload.password ?? "").trim();
  const usernameForLogin = nextUsername || current.username || "";
  const emailForAuth =
    nextEmail ||
    current.email ||
    employeeLoginEmail(usernameForLogin || "employee");

  if (nextPassword) {
    if (nextPassword.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }

    normalizedPayload.loginPassword = nextPassword;

    const mergedProfile = {
      ...current,
      ...normalizedPayload,
      username: usernameForLogin,
      email: emailForAuth,
    };

    await applyEmployeePasswordChange({
      email: emailForAuth,
      username: usernameForLogin,
      newPassword: nextPassword,
      currentPassword: payload.currentPassword,
      profileData: mergedProfile,
      employeeDocId,
    });
  } else if (usernameChanged) {
    await updateDoc(userRef, {
      ...normalizedPayload,
      loginPassword: current.loginPassword || "",
    });
    if (usernameForLogin && current.uid) {
      await setEmployeeLoginMapping(usernameForLogin, emailForAuth, current.uid);
    }
  } else {
    await updateDoc(userRef, {
      ...normalizedPayload,
      loginPassword: current.loginPassword || "",
    });
  }
  await createAuditLog({
    action: "update_employee",
    entityType: "user",
    entityId: employeeDocId,
    message: `${normalizedPayload.displayName || "Employee"} profile was updated by admin.`,
    actorName: "Admin",
    actorRole: "admin",
  });
  const updatedSnap = await getDoc(userRef);
  return updatedSnap.exists() ? updatedSnap.data() : null;
}

const EMPLOYEE_CENTERS_COLLECTION = "employee_centers";

/** Assigns (or clears) the multi-center list for an existing employee. */
export async function updateEmployeeCenters(employeeDocId, assignedCenters = []) {
  if (!employeeDocId) {
    throw new Error("Employee record is missing.");
  }
  const userRef = doc(db, USERS_COLLECTION, employeeDocId);
  const currentSnap = await getDoc(userRef);
  if (!currentSnap.exists()) {
    throw new Error("Employee record was not found.");
  }
  const current = currentSnap.data();
  const centers = finalizeAssignedCenters(assignedCenters);

  // Source of truth for scoping/reports lives on the user profile.
  await updateDoc(userRef, {
    assignedCenters: centers,
    location: centers[0] || "",
    updatedAt: serverTimestamp(),
  });

  // Best-effort mirror into the dedicated employee_centers table. This is
  // optional bookkeeping: if its security rule has not been deployed yet the
  // write is denied, but the assignment above already succeeded, so we must
  // not fail the whole operation here.
  try {
    await setDoc(doc(db, EMPLOYEE_CENTERS_COLLECTION, employeeDocId), {
      employeeDocId,
      employeeId: current.employeeId || "",
      username: current.username || "",
      centers,
      updatedAt: serverTimestamp(),
    });
  } catch (mirrorError) {
    console.warn(
      "[loan-web] employee_centers mirror skipped (deploy firestore rules to enable):",
      mirrorError?.message || mirrorError
    );
  }

  await createAuditLog({
    action: "assign_employee_centers",
    entityType: "user",
    entityId: employeeDocId,
    message: `${current.displayName || current.username || "Employee"} centres set to ${centers.length ? centers.join(", ") : "none"}.`,
    actorName: "Admin",
    actorRole: "admin",
  });

  const updatedSnap = await getDoc(userRef);
  const updated = updatedSnap.exists() ? updatedSnap.data() : null;
  return updated ? { ...updated, assignedCenters: centers } : { assignedCenters: centers };
}

/** Stores or updates the fixed monthly salary on an employee profile. */
export async function assignEmployeeMonthlySalary(employeeDocId, monthlySalary) {
  if (!employeeDocId) {
    throw new Error("Employee record is missing.");
  }

  const amount = Number(monthlySalary);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a valid monthly salary greater than zero.");
  }

  const userRef = doc(db, USERS_COLLECTION, employeeDocId);
  const currentSnap = await getDoc(userRef);
  if (!currentSnap.exists()) {
    throw new Error("Employee record was not found.");
  }
  const current = currentSnap.data();
  if (normalizeEmployeeStatus(current) === "inactive") {
    throw new Error("Salary can only be assigned to active employees.");
  }

  await updateDoc(userRef, {
    monthlySalary: amount,
    updatedAt: serverTimestamp(),
  });

  await createAuditLog({
    action: "assign_employee_monthly_salary",
    entityType: "user",
    entityId: employeeDocId,
    message: `Monthly salary set to ${amount} for ${current.displayName || current.employeeId || "employee"}.`,
    actorName: "Admin",
    actorRole: "admin",
  });

  const updatedSnap = await getDoc(userRef);
  return updatedSnap.exists() ? { id: employeeDocId, ...updatedSnap.data() } : null;
}

/** Reads the assignment record(s) from the employee_centers table. */
export async function listEmployeeCenterAssignments() {
  const snapshot = await getDocs(collection(db, EMPLOYEE_CENTERS_COLLECTION));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function updateEmployeeStatus(employeeDocId, employeeStatus) {
  if (!employeeDocId) {
    throw new Error("Employee record is missing.");
  }

  const userRef = doc(db, USERS_COLLECTION, employeeDocId);
  const normalizedStatus = normalizeEmployeeStatus(employeeStatus);

  await updateDoc(userRef, { employeeStatus: normalizedStatus });
  await createAuditLog({
    action: "update_employee_status",
    entityType: "user",
    entityId: employeeDocId,
    message: `Employee status set to ${normalizedStatus}.`,
    actorName: "Admin",
    actorRole: "admin",
  });
  const updatedSnap = await getDoc(userRef);
  return updatedSnap.exists() ? updatedSnap.data() : null;
}

export async function promoteCollectorToEmployeeProfile({
  collectorName,
  employeeStatus = "active",
  phone = "",
  address = "",
  location = "",
  joiningDate = "",
}) {
  const displayName = normalizeText(collectorName);
  if (!displayName) {
    throw new Error("Collector name is required.");
  }

  const employees = await listEmployees();
  const existing = employees.find((employee) =>
    getEmployeeCollectorAliases(employee).some(
      (alias) => normalizeCollectorKey(alias) === normalizeCollectorKey(displayName)
    )
  );

  if (existing?.id) {
    await updateEmployeeStatus(existing.id, employeeStatus);
    return { id: existing.id, employeeId: existing.employeeId, created: false };
  }

  const created = await createEmployeeProfile({
    name: displayName,
    email: buildEmployeeRegisterEmail(displayName),
    phone,
    address,
    location,
    joiningDate,
    employeeStatus,
  });

  return { ...created, created: true };
}

export async function updateUserProfile(userId, payload) {
  const userRef = doc(db, USERS_COLLECTION, userId);
  const normalizedPayload = {
    displayName: normalizeText(payload.displayName),
    phone: normalizeText(payload.phone),
    location: normalizeText(payload.location),
  };

  await updateDoc(userRef, normalizedPayload);
  await createAuditLog({
    action: "update_profile",
    entityType: "user",
    entityId: userId,
    message: `${normalizedPayload.displayName || "User"} profile was updated.`,
    actorName: normalizedPayload.displayName || "User",
    actorRole: "user",
  });
  const updatedSnap = await getDoc(userRef);
  return updatedSnap.exists() ? updatedSnap.data() : null;
}

export async function updateUserSettings(userId, settings) {
  const userRef = doc(db, USERS_COLLECTION, userId);
  const currentSnap = await getDoc(userRef);
  const existingPrefs = currentSnap.exists() ? currentSnap.data()?.preferences || {} : {};

  const normalizeLoanPreset = (preset, index) => {
    if (!preset) return null;
    const loanAmount = Number(preset.loanAmount ?? 0);
    const loanWeeks = Number(preset.loanWeeks ?? 0);
    const emiAmount = Number(preset.emiAmount ?? 0);
    const totalPayable =
      loanWeeks > 0 && emiAmount > 0 ? loanWeeks * emiAmount : Number(preset.totalPayable ?? 0);
    const interestAmount = Math.max(totalPayable - loanAmount, 0);
    const hasContent =
      (loanAmount > 0 && loanWeeks > 0) || emiAmount > 0 || totalPayable > 0;

    if (!hasContent) return null;

    return {
      id: normalizeText(preset.id) || `preset-${index + 1}`,
      loanAmount,
      loanWeeks,
      emiAmount,
      interestAmount,
      totalPayable,
    };
  };

  const normalizedSettings = {
    preferences: {
      ...existingPrefs,
      theme: normalizeText(settings.theme ?? existingPrefs.theme) || "system",
      dashboardDensity: normalizeText(settings.dashboardDensity ?? existingPrefs.dashboardDensity) || "comfortable",
      collectionStartTime: normalizeText(settings.collectionStartTime ?? existingPrefs.collectionStartTime) || "09:00",
      collectionEndTime: normalizeText(settings.collectionEndTime ?? existingPrefs.collectionEndTime) || "18:00",
      defaultReminderTiming: normalizeText(settings.defaultReminderTiming ?? existingPrefs.defaultReminderTiming) || "24 hours before",
      reportPreference: normalizeText(settings.reportPreference ?? existingPrefs.reportPreference) || "detailed",
      walletAccountName: normalizeText(settings.walletAccountName ?? existingPrefs.walletAccountName) || "Main Wallet",
      walletAccountNumber: normalizeText(settings.walletAccountNumber ?? existingPrefs.walletAccountNumber),
      interestRate: Number(settings.interestRate ?? existingPrefs.interestRate ?? 12.5),
      defaultLoanAmount: Number(settings.defaultLoanAmount ?? existingPrefs.defaultLoanAmount ?? 0),
      emi10Weeks: Number(settings.emi10Weeks ?? existingPrefs.emi10Weeks ?? 0),
      emi20Weeks: Number(settings.emi20Weeks ?? existingPrefs.emi20Weeks ?? 0),
      emi30Weeks: Number(settings.emi30Weeks ?? existingPrefs.emi30Weeks ?? 0),
      loanPresets: Array.isArray(settings.loanPresets)
        ? settings.loanPresets.map(normalizeLoanPreset).filter(Boolean)
        : Array.isArray(existingPrefs.loanPresets)
          ? existingPrefs.loanPresets
          : [],
      emailNotifications: settings.emailNotifications ?? existingPrefs.emailNotifications ?? false,
      inAppNotifications: settings.inAppNotifications ?? existingPrefs.inAppNotifications ?? true,
      smsNotifications: settings.smsNotifications ?? existingPrefs.smsNotifications ?? false,
      approvalAlerts: settings.approvalAlerts ?? existingPrefs.approvalAlerts ?? false,
      weeklySummary: settings.weeklySummary ?? existingPrefs.weeklySummary ?? false,
      /** Opening cash on hand (user-editable). Dashboard shows: this − total loan principal out + approved collections. */
      cashInHandOpening: Number(settings.cashInHandOpening ?? existingPrefs.cashInHandOpening ?? 0) || 0,
      /** Opening EMI collected (user-editable). Added to approved ledger collections on the dashboard. */
      emiCollectedOpening: Number(settings.emiCollectedOpening ?? existingPrefs.emiCollectedOpening ?? 0) || 0,
    },
  };

  await updateDoc(userRef, normalizedSettings);
  await createAuditLog({
    action: "update_settings",
    entityType: "user",
    entityId: userId,
    message: "Settings were updated.",
    actorName: "User",
    actorRole: "user",
  });
  const updatedSnap = await getDoc(userRef);
  return updatedSnap.exists() ? updatedSnap.data() : null;
}

export async function listUsers() {
  const snapshot = await getDocs(collection(db, USERS_COLLECTION));

  return snapshot.docs
    .map((userDoc) => ({
      id: userDoc.id,
      ...userDoc.data(),
    }))
    .sort((a, b) => {
      const left = a.createdAt?.seconds ?? 0;
      const right = b.createdAt?.seconds ?? 0;
      return right - left;
    });
}

export async function updateUserRole(userId, role) {
  const userRef = doc(db, USERS_COLLECTION, userId);
  await updateDoc(userRef, {
    role: normalizeText(role) || "employee",
  });
  await createAuditLog({
    action: "update_role",
    entityType: "user",
    entityId: userId,
    message: `User role was changed to ${role}.`,
    actorName: "Admin",
    actorRole: "admin",
  });
  const updatedSnap = await getDoc(userRef);
  return updatedSnap.exists() ? updatedSnap.data() : null;
}

export async function getEmployeeProfile(employeeDocId) {
  if (!employeeDocId) return null;
  const userRef = doc(db, USERS_COLLECTION, employeeDocId);
  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  const assignedCenters = finalizeAssignedCenters(
    Array.isArray(data.assignedCenters) ? data.assignedCenters : data.location ? [data.location] : []
  );
  return {
    id: snapshot.id,
    ...data,
    assignedCenters,
    location: assignedCenters[0] || data.location || "",
  };
}

export async function listEmployees() {
  const employeesQuery = query(collection(db, USERS_COLLECTION), where("role", "==", "employee"));

  const [snapshot, centerAssignmentsSnap] = await Promise.all([
    getDocs(employeesQuery),
    getDocs(collection(db, EMPLOYEE_CENTERS_COLLECTION)).catch(() => null),
  ]);

  const centersByEmployeeId = new Map();
  centerAssignmentsSnap?.docs?.forEach((assignmentDoc) => {
    const data = assignmentDoc.data();
    const employeeDocId = data.employeeDocId || assignmentDoc.id;
    const centers = normalizeAssignedCenters(data.centers || []);
    if (employeeDocId && centers.length) {
      centersByEmployeeId.set(employeeDocId, centers);
    }
  });

  return snapshot.docs
    .map((employeeDoc) => {
      const data = employeeDoc.data();
      const mirroredCenters = centersByEmployeeId.get(employeeDoc.id) || [];
      const rawCenters = Array.isArray(data.assignedCenters)
        ? data.assignedCenters
        : mirroredCenters;
      const assignedCenters = finalizeAssignedCenters(rawCenters);
      return {
        id: employeeDoc.id,
        ...data,
        assignedCenters,
        location: assignedCenters[0] || data.location || "",
      };
    })
    .sort((a, b) => {
      const left = a.createdAt?.seconds ?? 0;
      const right = b.createdAt?.seconds ?? 0;
      return right - left;
    });
}

export async function upsertLoanApplication({
  customerId,
  applicationId,
  customerName,
  mobileNumber,
  alternateNumber,
  identityType,
  identityNumber,
  address,
  country,
  selectedDay,
  parentCenterLabel,
  subCenterLabel,
  loanAmount,
  loanWeeks,
  loanPresetId,
  loanPresetLabel,
  loanPresetLoanAmount,
  loanPresetLoanWeeks,
  loanPresetEmiAmount,
  loanPresetInterestAmount,
  loanPresetTotalPayable,
  disbursementDate,
  dueDate,
  collectionFrequency,
  nomineeName,
  nomineeContact,
  additionalContact,
  idDocumentName,
  idDocumentDataUrl = "",
  addressProofName,
  addressProofDataUrl = "",
  loanAgreementName,
  loanAgreementDataUrl = "",
  supportingDocumentNames,
  coApplicantName,
  coApplicantContact,
  coApplicantRelation,
  coApplicantAddress,
  coApplicantIdProofName,
  coApplicantIdProofDataUrl = "",
  isArchived,
  archivedAt,
  loanStatus,
  closedAt,
  rescheduledAt,
  rescheduleReason,
  coApplicantIdentityType = "",
  coApplicantIdentityNumber = "",
  coApplicantPhotoName = "",
  coApplicantPhotoDataUrl = "",
  customerPhotoName = "",
  customerPhotoDataUrl = "",
}) {
  await validateCustomerUniqueness({ customerId, mobileNumber, alternateNumber, identityNumber });

  let record = await buildLoanApplicationRecord({
    customerId,
    applicationId,
    customerName,
    mobileNumber,
    alternateNumber,
    identityType,
    identityNumber,
    address,
    country,
    selectedDay,
    parentCenterLabel,
    subCenterLabel,
    loanAmount,
    loanWeeks,
    loanPresetId,
    loanPresetLabel,
    loanPresetLoanAmount,
    loanPresetLoanWeeks,
    loanPresetEmiAmount,
    loanPresetInterestAmount,
    loanPresetTotalPayable,
    disbursementDate,
    dueDate,
    collectionFrequency,
    nomineeName,
    nomineeContact,
    additionalContact,
    idDocumentName,
    idDocumentDataUrl,
    addressProofName,
    addressProofDataUrl,
    loanAgreementName,
    loanAgreementDataUrl,
    supportingDocumentNames,
    coApplicantName,
    coApplicantContact,
    coApplicantRelation,
    coApplicantAddress,
    coApplicantIdentityType,
    coApplicantIdentityNumber,
    coApplicantIdProofName,
    coApplicantIdProofDataUrl,
    coApplicantPhotoName,
    customerPhotoName,
    customerPhotoDataUrl,
    coApplicantPhotoDataUrl,
    isArchived,
    archivedAt,
    loanStatus,
    closedAt,
    rescheduledAt,
    rescheduleReason,
  });

  const customerRef = doc(db, "customers", record.customerId);
  const applicationRef = doc(db, "loanApplications", record.applicationId);
  const [customerSnap, applicationSnap] = await Promise.all([getDoc(customerRef), getDoc(applicationRef)]);

  const newPrincipal = Math.round(Number(record.loanAmount || 0));
  const priorPrincipal = customerSnap.exists() ? Math.round(Number(customerSnap.data().loanAmount || 0)) : 0;
  const principalDelta = newPrincipal - priorPrincipal;

  if (customerSnap.exists()) {
    const prior = customerSnap.data();
    if (prior.approvalStatus) record.approvalStatus = prior.approvalStatus;
    if (prior.loanApprovedAt != null) record.loanApprovedAt = prior.loanApprovedAt;
    preserveCustomerDocumentDataUrls(record, prior);
  } else if (applicationSnap.exists()) {
    const priorApp = applicationSnap.data();
    if (priorApp.approvalStatus) record.approvalStatus = priorApp.approvalStatus;
    if (priorApp.loanApprovedAt != null) record.loanApprovedAt = priorApp.loanApprovedAt;
  }

  const effectiveStatus = String(record.approvalStatus || "").trim().toLowerCase();
  if (effectiveStatus === "approved" && principalDelta > 0) {
    const { balance } = await fetchLedgerWalletBalanceAndRows();
    if (balance < principalDelta) {
      throw new Error(
        `Insufficient wallet balance. Available ${formatInr(balance)}; this change needs ${formatInr(principalDelta)} more principal than the amount already on file. Reduce the loan or add investor capital.`
      );
    }
  }

  if (customerSnap.exists()) {
    await updateDoc(customerRef, record);
  } else {
    await setDoc(customerRef, record);
  }

  if (applicationSnap.exists()) {
    await updateDoc(applicationRef, record);
  } else {
    await setDoc(applicationRef, record);
  }

  await createAuditLog({
    action: customerSnap.exists() || applicationSnap.exists() ? "update_loan" : "create_loan",
    entityType: "loan",
    entityId: record.applicationId,
    message: `${record.customerName || "Customer"} loan record was ${customerSnap.exists() || applicationSnap.exists() ? "updated" : "created"}.`,
    actorName: "Admin",
    actorRole: "admin",
  });

  if (effectiveStatus === "approved" && newPrincipal > 0) {
    const { walletRows } = await fetchLedgerWalletBalanceAndRows();
    const cid = record.customerId;
    const name = record.customerName || cid;
    const dateIso =
      record.disbursementDate || record.loanApprovedAt || new Date().toISOString().slice(0, 10);
    if (priorPrincipal <= 0 && !ledgerHasLoanDisbursementForCustomer(walletRows, cid)) {
      await recordLoanDisbursementLedgerEntry({
        customerId: cid,
        customerName: name,
        principalAmount: newPrincipal,
        disbursementDateIso: dateIso,
      });
    } else if (principalDelta > 0) {
      await recordLoanDisbursementDeltaLedgerEntry({
        customerId: cid,
        customerName: name,
        deltaAmount: principalDelta,
        disbursementDateIso: dateIso,
      });
    }
  }

  return {
    customerId: record.customerId,
    applicationId: record.applicationId,
    submittedAt: record.submittedAt,
    weeklyDue: record.weeklyDue,
    totalPayable: record.totalPayable,
    mode: customerSnap.exists() || applicationSnap.exists() ? "updated" : "created",
  };
}

export async function createLoanApplication(payload) {
  return upsertLoanApplication(payload);
}

export async function updateCustomerDay(customerId, selectedDay, centerMeta = {}) {
  const customerRef = doc(db, "customers", customerId);
  const sd = normalizeText(selectedDay);
  const patch = { selectedDay: sd };
  if (!sd) {
    patch.parentCenterLabel = "";
    patch.subCenterLabel = "";
  } else {
    if (centerMeta.parentCenterLabel !== undefined) {
      patch.parentCenterLabel = normalizeText(centerMeta.parentCenterLabel);
    }
    if (centerMeta.subCenterLabel !== undefined) {
      patch.subCenterLabel = normalizeText(centerMeta.subCenterLabel);
    }
  }
  await updateDoc(customerRef, patch);
}

/** Internal demo reference for CRIF-style flows (not shown in UI). */
export function makeDemoCrifReferenceId() {
  const year = new Date().getFullYear();
  const num = Math.floor(10000 + Math.random() * 90000);
  return `DEMO-CRIF-${year}-${String(num).padStart(5, "0")}`;
}

/** Merges KYC / CRIF demo fields on an existing customer (e.g. detail page save). */
export async function mergeCustomerProfileFields(
  customerId,
  { griefId, crifDemoEligibility, lastEligibilityCheckedAt } = {}
) {
  if (!customerId) return;
  const patch = {};
  if (griefId !== undefined && String(griefId).trim() !== "") {
    patch.griefId = normalizeText(griefId);
  }
  if (crifDemoEligibility && typeof crifDemoEligibility === "object") {
    const snap = await getDoc(doc(db, "customers", customerId));
    const existingRef = snap.exists() ? normalizeText(snap.data()?.griefId) : "";
    patch.crifDemoEligibility = {
      ...crifDemoEligibility,
      ...(existingRef ? { demoInternalReference: existingRef } : {}),
    };
    patch.lastEligibilityCheckedAt = normalizeText(lastEligibilityCheckedAt) || crifDemoEligibility.checkedAt || "";
  }
  if (Object.keys(patch).length === 0) return;
  await updateDoc(doc(db, "customers", customerId), patch);
}

export async function createCustomer({
  customerId: requestedCustomerId = "",
  customerName,
  mobileNumber,
  alternateNumber,
  identityType,
  identityNumber,
  address,
  country,
  griefId = "",
  idDocumentName = "",
  idDocumentDataUrl = "",
  addressProofName = "",
  addressProofDataUrl = "",
  loanAgreementName = "",
  loanAgreementDataUrl = "",
  supportingDocumentNames = [],
  coApplicantName = "",
  coApplicantContact = "",
  coApplicantRelation = "",
  coApplicantAddress = "",
  coApplicantIdentityType = "",
  coApplicantIdentityNumber = "",
  coApplicantIdProofName = "",
  coApplicantIdProofDataUrl = "",
  coApplicantPhotoName = "",
  customerPhotoName = "",
  customerPhotoDataUrl = "",
  coApplicantPhotoDataUrl = "",
  selectedDay = "",
  parentCenterLabel = "",
  subCenterLabel = "",
  crifDemoEligibility = null,
  lastEligibilityCheckedAt = "",
  createdByUid = "",
  createdByEmployeeId = "",
  createdByEmployeeName = "",
  customerSource = "",
}) {
  const customerId = requestedCustomerId
    ? await assertCustomerIdAvailable(requestedCustomerId)
    : await getNextCustomerId();
  await validateCustomerUniqueness({ customerId, mobileNumber, alternateNumber, identityNumber });

  const now = new Date();
  const demoInternalReference = normalizeText(griefId) || makeDemoCrifReferenceId();
  const crifSnapshot =
    crifDemoEligibility && typeof crifDemoEligibility === "object"
      ? { ...crifDemoEligibility, demoInternalReference }
      : null;

  await setDoc(doc(db, "customers", customerId), {
    customerId,
    customerName: normalizeText(customerName),
    mobileNumber: normalizePhoneNumber(mobileNumber),
    alternateNumber: normalizePhoneNumber(alternateNumber),
    identityType: normalizeText(identityType),
    identityNumber: normalizeText(identityNumber),
    address: normalizeText(address),
    country: normalizeText(country),
    griefId: demoInternalReference,
    idDocumentName: normalizeText(idDocumentName),
    idDocumentDataUrl: normalizeText(idDocumentDataUrl),
    addressProofName: normalizeText(addressProofName),
    addressProofDataUrl: normalizeText(addressProofDataUrl),
    loanAgreementName: normalizeText(loanAgreementName),
    loanAgreementDataUrl: normalizeText(loanAgreementDataUrl),
    selectedDay: normalizeText(selectedDay),
    parentCenterLabel: normalizeText(parentCenterLabel),
    subCenterLabel: normalizeText(subCenterLabel),
    loanAmount: "",
    loanWeeks: "",
    weeklyDue: "",
    totalPayable: "",
    interestAmount: "",
    emiAmount: "",
    disbursementDate: "",
    dueDate: "",
    collectionFrequency: "Weekly",
    nomineeName: "",
    nomineeContact: "",
    additionalContact: "",
    supportingDocumentNames: Array.isArray(supportingDocumentNames)
      ? supportingDocumentNames.map((name) => normalizeText(name)).filter(Boolean)
      : [],
    coApplicantName: normalizeText(coApplicantName),
    coApplicantContact: normalizeText(coApplicantContact),
    coApplicantRelation: normalizeText(coApplicantRelation),
    coApplicantAddress: normalizeText(coApplicantAddress),
    coApplicantIdentityType: normalizeText(coApplicantIdentityType),
    coApplicantIdentityNumber: normalizeText(coApplicantIdentityNumber),
    coApplicantIdProofName: normalizeText(coApplicantIdProofName),
    coApplicantIdProofDataUrl: normalizeText(coApplicantIdProofDataUrl),
    coApplicantPhotoName: normalizeText(coApplicantPhotoName),
    customerPhotoName: normalizeText(customerPhotoName),
    customerPhotoDataUrl: normalizeText(customerPhotoDataUrl),
    coApplicantPhotoDataUrl: normalizeText(coApplicantPhotoDataUrl),
    isArchived: false,
    archivedAt: null,
    loanStatus: "open",
    closedAt: null,
    rescheduledAt: null,
    rescheduleReason: "",
    approvalStatus: "pending",
    amountStatus: "open",
    loanApprovedAt: null,
    createdByUid: normalizeText(createdByUid),
    createdByEmployeeId: normalizeText(createdByEmployeeId),
    createdByEmployeeName: normalizeText(createdByEmployeeName),
    customerSource: normalizeText(customerSource) || (createdByUid ? "employee" : "admin"),
    createdAt: serverTimestamp(),
    submittedAt: now.toISOString(),
    ...(crifSnapshot
      ? {
          crifDemoEligibility: crifSnapshot,
          lastEligibilityCheckedAt: normalizeText(lastEligibilityCheckedAt) || crifDemoEligibility.checkedAt || "",
        }
      : {}),
  });

  const actorName = normalizeText(createdByEmployeeName) || "Admin";
  const actorRole = createdByUid ? "employee" : "admin";
  const displayName = normalizeText(customerName) || "Customer";

  await createNotification({
    type: "approval_notification",
    title: "New customer submitted",
    message: createdByUid
      ? `${displayName} (${customerId}) was added by ${actorName} and is pending review.`
      : `${displayName} (${customerId}) was created and is pending review.`,
    audienceRole: "admin",
    customerId,
    customerName: displayName,
    relatedId: customerId,
  });

  if (createdByUid) {
    await createNotification({
      type: "approval_notification",
      title: "Customer submitted",
      message: `${displayName} (${customerId}) was saved and is pending admin approval.`,
      audienceRole: "employee",
      customerId,
      customerName: displayName,
      relatedId: customerId,
    });
  }

  await createAuditLog({
    action: "create_customer",
    entityType: "customer",
    entityId: customerId,
    message: `${displayName} record was created.`,
    actorName,
    actorRole,
  });

  return { customerId };
}

export async function approveCustomer(customerId, { reviewerName = "Admin" } = {}) {
  const normalizedId = normalizeCustomerId(customerId);
  const customerRef = doc(db, "customers", normalizedId);
  const customerSnap = await getDoc(customerRef);
  if (!customerSnap.exists()) {
    throw new Error("Customer not found.");
  }

  const customer = customerSnap.data();
  if (String(customer.approvalStatus || "").toLowerCase() !== "pending") {
    throw new Error("Only pending customers can be approved.");
  }

  const approvedAt = new Date().toISOString();
  const displayName = normalizeText(customer.customerName) || "Customer";

  await updateDoc(customerRef, {
    approvalStatus: "approved",
    customerApprovedAt: approvedAt,
  });

  await createNotification({
    type: "approval_notification",
    title: "Customer approved",
    message: `${displayName} (${normalizedId}) was approved. You can now apply for a loan.`,
    audienceRole: "employee",
    customerId: normalizedId,
    customerName: displayName,
    relatedId: normalizedId,
  });

  await createAuditLog({
    action: "approve_customer",
    entityType: "customer",
    entityId: normalizedId,
    message: `${displayName} was approved.`,
    actorName: normalizeText(reviewerName) || "Admin",
    actorRole: "admin",
  });

  return { customerId: normalizedId, approvedAt };
}

export async function rejectCustomer(customerId, { rejectionNote = "", reviewerName = "Admin" } = {}) {
  const normalizedId = normalizeCustomerId(customerId);
  const customerRef = doc(db, "customers", normalizedId);
  const customerSnap = await getDoc(customerRef);
  if (!customerSnap.exists()) {
    throw new Error("Customer not found.");
  }

  const customer = customerSnap.data();
  if (String(customer.approvalStatus || "").toLowerCase() !== "pending") {
    throw new Error("Only pending customers can be rejected.");
  }

  const rejectedAt = new Date().toISOString();
  const note = normalizeText(rejectionNote);
  const displayName = normalizeText(customer.customerName) || "Customer";

  await updateDoc(customerRef, {
    approvalStatus: "rejected",
    customerRejectedAt: rejectedAt,
    isArchived: true,
    archivedAt: rejectedAt,
    ...(note ? { customerRejectionNote: note } : {}),
  });

  await createNotification({
    type: "approval_notification",
    title: "Customer rejected",
    message: `${displayName} (${normalizedId}) was rejected.${note ? ` Note: ${note}` : ""}`,
    audienceRole: "employee",
    customerId: normalizedId,
    customerName: displayName,
    relatedId: normalizedId,
  });

  await createAuditLog({
    action: "reject_customer",
    entityType: "customer",
    entityId: normalizedId,
    message: `${displayName} was rejected.`,
    actorName: normalizeText(reviewerName) || "Admin",
    actorRole: "admin",
  });

  return { customerId: normalizedId, rejectedAt };
}

/**
 * Renames a customer's primary ID and migrates every linked record
 * (loan applications, collection amounts, wallet transactions, notifications).
 */
export async function renameCustomerId(oldId, newId) {
  const normalizedOld = normalizeCustomerId(oldId);
  const normalizedNew = await assertCustomerIdAvailable(newId, normalizedOld);
  if (normalizedOld === normalizedNew) {
    return normalizedNew;
  }

  const oldRef = doc(db, "customers", normalizedOld);
  const oldSnap = await getDoc(oldRef);
  if (!oldSnap.exists()) {
    throw new Error("Customer record not found.");
  }
  const data = oldSnap.data();

  const [appsSnap, amountsSnap, walletSnap, notificationsSnap] = await Promise.all([
    getDocs(query(collection(db, "loanApplications"), where("customerId", "==", normalizedOld))),
    getDocs(query(collection(db, "customerAmounts"), where("customerId", "==", normalizedOld))),
    getDocs(query(collection(db, "walletTransactions"), where("customerId", "==", normalizedOld))),
    getDocs(query(collection(db, "notifications"), where("customerId", "==", normalizedOld))),
  ]);

  const batch = writeBatch(db);
  batch.set(doc(db, "customers", normalizedNew), { ...data, customerId: normalizedNew });
  appsSnap.forEach((appDoc) => batch.update(appDoc.ref, { customerId: normalizedNew }));
  amountsSnap.forEach((amountDoc) => batch.update(amountDoc.ref, { customerId: normalizedNew }));
  notificationsSnap.forEach((noteDoc) => batch.update(noteDoc.ref, { customerId: normalizedNew }));
  walletSnap.forEach((walletDoc) => {
    if (walletDoc.id === `loan-disb-${normalizedOld}`) {
      const newDisbId = `loan-disb-${normalizedNew}`;
      batch.set(doc(db, "walletTransactions", newDisbId), {
        ...walletDoc.data(),
        customerId: normalizedNew,
        transactionId: newDisbId,
      });
      batch.delete(walletDoc.ref);
    } else {
      batch.update(walletDoc.ref, { customerId: normalizedNew });
    }
  });
  batch.delete(oldRef);

  await batch.commit();

  await createAuditLog({
    action: "rename_customer_id",
    entityType: "customer",
    entityId: normalizedNew,
    message: `Customer ID changed from ${normalizedOld} to ${normalizedNew}.`,
    actorName: "Admin",
    actorRole: "admin",
  });

  return normalizedNew;
}

export async function listCustomers() {
  if (!auth.currentUser) {
    throw new Error("Sign in required to load customers.");
  }
  const loadCustomers = async () => {
    const customersQuery = query(collection(db, "customers"));
    const snapshot = await getDocs(customersQuery);
    return snapshot.docs;
  };

  await auth.currentUser.getIdToken();
  let docs;
  try {
    docs = await loadCustomers();
  } catch (error) {
    const permissionDenied =
      error?.code === "permission-denied" || String(error?.message || "").toLowerCase().includes("permission");
    if (!permissionDenied || !auth.currentUser) {
      throw error;
    }
    // Retry once with a forced token refresh to recover from stale sessions.
    await auth.currentUser.getIdToken(true);
    docs = await loadCustomers();
  }

  return docs
    .map((customerDoc) => {
      const data = customerDoc.data();
      return {
        id: customerDoc.id,
        ...data,
        customerId: String(data?.customerId || customerDoc.id || "").trim() || customerDoc.id,
      };
    })
    .filter(isVisibleCustomerRecord)
    .sort((a, b) => {
      const left = a.submittedAt || "";
      const right = b.submittedAt || "";
      return right.localeCompare(left);
    });
}

const DELETED_CUSTOMERS_COLLECTION = "deletedCustomers";

async function resolveCustomerDoc(customerId, firestoreDocId, { allowDeleted = false } = {}) {
  const normalizedInputId = normalizeText(customerId);
  const normalizedDocId = normalizeText(firestoreDocId);

  const fromSnap = (docSnap) => {
    const data = docSnap.data();
    if (!allowDeleted && isRecordDeleted(data)) {
      throw new Error("Customer was already deleted.");
    }
    const canonicalId = normalizeText(data.customerId) || docSnap.id;
    return { customerRef: docSnap.ref, customerData: data, canonicalId };
  };

  if (normalizedDocId) {
    const byDocIdSnap = await getDoc(doc(db, "customers", normalizedDocId));
    if (byDocIdSnap.exists()) {
      return fromSnap(byDocIdSnap);
    }
  }

  if (normalizedInputId) {
    const byCustomerIdSnap = await getDoc(doc(db, "customers", normalizedInputId));
    if (byCustomerIdSnap.exists()) {
      return fromSnap(byCustomerIdSnap);
    }

    const fieldQuery = await getDocs(
      query(collection(db, "customers"), where("customerId", "==", normalizedInputId))
    );
    if (!fieldQuery.empty) {
      return fromSnap(fieldQuery.docs[0]);
    }
  }

  throw new Error("Customer not found.");
}

async function resolveCustomerDocForDelete(customerId, firestoreDocId) {
  return resolveCustomerDoc(customerId, firestoreDocId, { allowDeleted: false });
}

async function assertAdminActor(actorRole) {
  if (actorRole === "admin") return;
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("Sign in required to delete customers.");
  }
  const userSnap = await getDoc(doc(db, USERS_COLLECTION, uid));
  if (!userSnap.exists() || userSnap.data().role !== "admin") {
    throw new Error("Only administrators can delete customers.");
  }
}

async function batchPatchDocuments(docRefs, patch) {
  if (!docRefs.length) return;
  for (let i = 0; i < docRefs.length; i += 450) {
    const batch = writeBatch(db);
    docRefs.slice(i, i + 450).forEach((ref) => batch.update(ref, patch));
    await batch.commit();
  }
}

async function batchMarkDeleted(docRefs, deletePatch) {
  return batchPatchDocuments(docRefs, deletePatch);
}

const CUSTOMER_RESTORE_PATCH = {
  isDeleted: false,
  deletedAt: null,
  deletedByUid: "",
  deletedByName: "",
  isArchived: false,
  archivedAt: null,
};

function mapCustomerDocSnap(customerDoc) {
  const data = customerDoc.data();
  return {
    id: customerDoc.id,
    ...data,
    customerId: String(data?.customerId || customerDoc.id || "").trim() || customerDoc.id,
  };
}

/** Customers hidden by soft-delete (still in Firestore `customers` collection). */
export async function listSoftDeletedCustomers() {
  if (!auth.currentUser) {
    throw new Error("Sign in required to load deleted customers.");
  }
  const snapshot = await getDocs(collection(db, "customers"));
  return snapshot.docs
    .map(mapCustomerDocSnap)
    .filter(isRecordDeleted)
    .sort((a, b) => String(b.deletedAt || b.submittedAt || "").localeCompare(String(a.deletedAt || a.submittedAt || "")));
}

/**
 * Soft-deletes a customer and linked loan/collection/ledger rows (production-safe).
 * Customer is archived in `customers`, snapshot stored in `deletedCustomers`, hidden from live lists.
 */
export async function deleteCustomer(
  customerId,
  { actorUid, actorName, actorRole, firestoreDocId } = {}
) {
  if (!auth.currentUser) {
    throw new Error("Sign in required to delete customers.");
  }

  if (!normalizeText(customerId) && !normalizeText(firestoreDocId)) {
    throw new Error("Customer id is required.");
  }

  await assertAdminActor(actorRole);

  const { customerRef, customerData, canonicalId } = await resolveCustomerDocForDelete(
    customerId,
    firestoreDocId
  );

  const deletedAt = new Date().toISOString();
  const deletedByUid = actorUid || auth.currentUser.uid;
  const deletedByName = normalizeText(actorName) || "Admin";
  const deletePatch = {
    isDeleted: true,
    deletedAt,
    deletedByUid,
    deletedByName,
    isArchived: true,
    archivedAt: deletedAt,
  };

  const [applicationSnap, amountSnap, walletSnap, notificationSnap] = await Promise.all([
    getDocs(query(collection(db, "loanApplications"), where("customerId", "==", canonicalId))),
    getDocs(query(collection(db, "customerAmounts"), where("customerId", "==", canonicalId))),
    getDocs(query(collection(db, "walletTransactions"), where("customerId", "==", canonicalId))),
    getDocs(query(collection(db, "notifications"), where("customerId", "==", canonicalId))),
  ]);

  const walletRefs = [...walletSnap.docs.map((d) => d.ref)];
  const loanDisbRef = doc(db, "walletTransactions", `loan-disb-${canonicalId}`);
  const loanDisbSnap = await getDoc(loanDisbRef);
  if (loanDisbSnap.exists() && !loanDisbSnap.data()?.isDeleted) {
    walletRefs.push(loanDisbRef);
  }

  for (const amountDoc of amountSnap.docs) {
    const entryId = amountDoc.data()?.entryId || amountDoc.id;
    if (!entryId) continue;
    const emiRef = doc(db, "walletTransactions", `emi-${entryId}`);
    const emiSnap = await getDoc(emiRef);
    if (emiSnap.exists() && !emiSnap.data()?.isDeleted) {
      walletRefs.push(emiRef);
    }
  }

  await updateDoc(customerRef, deletePatch);

  try {
    await setDoc(doc(db, DELETED_CUSTOMERS_COLLECTION, canonicalId), {
      ...customerData,
      customerId: canonicalId,
      deletedAt,
      deletedByUid,
      deletedByName,
      originalCollection: "customers",
    });
  } catch (archiveError) {
    console.warn("[loan-web] deletedCustomers archive skipped:", archiveError);
  }

  await batchMarkDeleted(applicationSnap.docs.map((d) => d.ref), deletePatch);
  await batchMarkDeleted(amountSnap.docs.map((d) => d.ref), deletePatch);
  await batchMarkDeleted(notificationSnap.docs.map((d) => d.ref), deletePatch);
  await batchMarkDeleted(walletRefs, deletePatch);

  try {
    await createAuditLog({
      action: "delete_customer",
      entityType: "customer",
      entityId: canonicalId,
      message: `${normalizeText(customerData.customerName) || "Customer"} and linked records were removed from active lists.`,
      actorName: deletedByName,
      actorRole: "admin",
    });
  } catch (auditError) {
    console.warn("[loan-web] delete_customer audit log skipped:", auditError);
  }

  return {
    customerId: canonicalId,
    deletedAt,
    related: {
      loanApplications: applicationSnap.size,
      collections: amountSnap.size,
      walletLedger: walletRefs.length,
      notifications: notificationSnap.size,
    },
  };
}

/** Restores a soft-deleted customer and linked loan/collection/ledger rows. */
export async function restoreCustomer(customerId, { actorName, actorRole, firestoreDocId } = {}) {
  if (!auth.currentUser) {
    throw new Error("Sign in required to restore customers.");
  }
  await assertAdminActor(actorRole);

  const { customerRef, customerData, canonicalId } = await resolveCustomerDoc(customerId, firestoreDocId, {
    allowDeleted: true,
  });
  if (!isRecordDeleted(customerData)) {
    throw new Error("This customer is not deleted.");
  }

  const [applicationSnap, amountSnap, walletSnap, notificationSnap] = await Promise.all([
    getDocs(query(collection(db, "loanApplications"), where("customerId", "==", canonicalId))),
    getDocs(query(collection(db, "customerAmounts"), where("customerId", "==", canonicalId))),
    getDocs(query(collection(db, "walletTransactions"), where("customerId", "==", canonicalId))),
    getDocs(query(collection(db, "notifications"), where("customerId", "==", canonicalId))),
  ]);

  const walletRefs = [...walletSnap.docs.map((d) => d.ref)];
  const loanDisbRef = doc(db, "walletTransactions", `loan-disb-${canonicalId}`);
  const loanDisbSnap = await getDoc(loanDisbRef);
  if (loanDisbSnap.exists()) {
    walletRefs.push(loanDisbRef);
  }
  for (const amountDoc of amountSnap.docs) {
    const entryId = amountDoc.data()?.entryId || amountDoc.id;
    if (!entryId) continue;
    const emiRef = doc(db, "walletTransactions", `emi-${entryId}`);
    const emiSnap = await getDoc(emiRef);
    if (emiSnap.exists()) {
      walletRefs.push(emiRef);
    }
  }

  await updateDoc(customerRef, CUSTOMER_RESTORE_PATCH);
  await batchPatchDocuments(applicationSnap.docs.map((d) => d.ref), CUSTOMER_RESTORE_PATCH);
  await batchPatchDocuments(amountSnap.docs.map((d) => d.ref), CUSTOMER_RESTORE_PATCH);
  await batchPatchDocuments(notificationSnap.docs.map((d) => d.ref), CUSTOMER_RESTORE_PATCH);
  await batchPatchDocuments(walletRefs, CUSTOMER_RESTORE_PATCH);

  try {
    await deleteDoc(doc(db, DELETED_CUSTOMERS_COLLECTION, canonicalId));
  } catch {
    /* archive row may be missing */
  }

  const restoredByName = normalizeText(actorName) || "Admin";
  await createAuditLog({
    action: "restore_customer",
    entityType: "customer",
    entityId: canonicalId,
    message: `${normalizeText(customerData.customerName) || "Customer"} was restored to active lists.`,
    actorName: restoredByName,
    actorRole: "admin",
  });

  return { customerId: canonicalId, customerName: customerData.customerName || "" };
}

/** Restores every soft-deleted customer in Firestore. */
export async function restoreAllDeletedCustomers({ actorName, actorRole } = {}) {
  const deletedRows = await listSoftDeletedCustomers();
  const restored = [];
  for (const row of deletedRows) {
    const result = await restoreCustomer(row.customerId, {
      actorName,
      actorRole,
      firestoreDocId: row.id,
    });
    restored.push(result);
  }
  return { restoredCount: restored.length, customers: restored };
}

export async function setCustomerArchived(customerId, isArchived) {
  const customerRef = doc(db, "customers", customerId);
  const customerSnap = await getDoc(customerRef);

  if (!customerSnap.exists()) {
    throw new Error("Customer not found");
  }

  const archivedAt = isArchived ? new Date().toISOString() : null;
  await updateDoc(customerRef, {
    isArchived: Boolean(isArchived),
    archivedAt,
  });

  const applicationQuery = query(collection(db, "loanApplications"), where("customerId", "==", customerId));
  const applicationSnap = await getDocs(applicationQuery);

  await Promise.all(
    applicationSnap.docs.map((applicationDoc) =>
      updateDoc(doc(db, "loanApplications", applicationDoc.id), {
        isArchived: Boolean(isArchived),
        archivedAt,
      })
    )
  );

  return {
    customerId,
    isArchived: Boolean(isArchived),
    archivedAt,
  };
}

export async function closeCustomerLoan(customerId) {
  const customerRef = doc(db, "customers", customerId);
  const customerSnap = await getDoc(customerRef);

  if (!customerSnap.exists()) {
    throw new Error("Customer not found");
  }

  const closedAt = new Date().toISOString();
  await updateDoc(customerRef, {
    loanStatus: "closed",
    closedAt,
  });

  const applicationQuery = query(collection(db, "loanApplications"), where("customerId", "==", customerId));
  const applicationSnap = await getDocs(applicationQuery);

  await Promise.all(
    applicationSnap.docs.map((applicationDoc) =>
      updateDoc(doc(db, "loanApplications", applicationDoc.id), {
        loanStatus: "closed",
        closedAt,
      })
    )
  );

  return {
    customerId,
    loanStatus: "closed",
    closedAt,
  };
}

export async function rescheduleCustomerLoan(customerId, { dueDate, collectionFrequency, rescheduleReason }) {
  const customerRef = doc(db, "customers", customerId);
  const customerSnap = await getDoc(customerRef);

  if (!customerSnap.exists()) {
    throw new Error("Customer not found");
  }

  const rescheduledAt = new Date().toISOString();
  const payload = {
    dueDate: normalizeText(dueDate),
    collectionFrequency: normalizeText(collectionFrequency) || "Weekly",
    loanStatus: "rescheduled",
    rescheduledAt,
    rescheduleReason: normalizeText(rescheduleReason),
    closedAt: null,
  };

  await updateDoc(customerRef, payload);

  const applicationQuery = query(collection(db, "loanApplications"), where("customerId", "==", customerId));
  const applicationSnap = await getDocs(applicationQuery);

  await Promise.all(
    applicationSnap.docs.map((applicationDoc) =>
      updateDoc(doc(db, "loanApplications", applicationDoc.id), payload)
    )
  );

  return {
    customerId,
    ...payload,
  };
}

export async function listLoanApplications() {
  const applicationsQuery = query(collection(db, "loanApplications"));
  const snapshot = await getDocs(applicationsQuery);

  return snapshot.docs
    .map((applicationDoc) => ({
      id: applicationDoc.id,
      ...applicationDoc.data(),
    }))
    .sort((a, b) => {
      const left = a.submittedAt || "";
      const right = b.submittedAt || "";
      return right.localeCompare(left);
    });
}

export async function approveLoanApplication(applicationId) {
  const applicationRef = doc(db, "loanApplications", applicationId);
  const applicationSnap = await getDoc(applicationRef);

  if (!applicationSnap.exists()) {
    throw new Error("Application not found");
  }

  const application = applicationSnap.data();
  const approvedAt = new Date().toISOString();

  const principal = Math.round(Number(application.loanAmount || 0));
  if (principal > 0) {
    const { balance, walletRows } = await fetchLedgerWalletBalanceAndRows();
    const cid = application.customerId;
    if (!ledgerHasLoanDisbursementForCustomer(walletRows, cid) && balance < principal) {
      throw new Error(
        `Insufficient wallet balance. Available ${formatInr(balance)}; approved principal is ${formatInr(principal)}. Add investor capital before approving this loan.`
      );
    }
  }

  await updateDoc(applicationRef, {
    approvalStatus: "approved",
    loanApprovedAt: approvedAt,
  });

  await updateDoc(doc(db, "customers", application.customerId), {
    approvalStatus: "approved",
    loanApprovedAt: approvedAt,
  });

  await createNotification({
    type: "approval_notification",
    title: "Loan approved",
    message: `${application.customerName || "Customer"} loan application was approved.`,
    audienceRole: "admin",
    customerId: application.customerId,
    customerName: application.customerName,
    relatedId: applicationId,
  });
  await createAuditLog({
    action: "approve_loan",
    entityType: "loan",
    entityId: applicationId,
    message: `${application.customerName || "Customer"} loan application was approved.`,
    actorName: "Admin",
    actorRole: "admin",
  });

  if (principal > 0) {
    const { walletRows } = await fetchLedgerWalletBalanceAndRows();
    const cid = application.customerId;
    if (!ledgerHasLoanDisbursementForCustomer(walletRows, cid)) {
      await recordLoanDisbursementLedgerEntry({
        customerId: cid,
        customerName: application.customerName,
        principalAmount: principal,
        disbursementDateIso: application.disbursementDate || approvedAt,
      });
    }
  }

  return {
    applicationId,
    approvedAt,
  };
}

function buildLoanPayloadFromCustomer(customer, request, applicationId) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    customerId: customer.customerId,
    applicationId,
    customerName: customer.customerName,
    mobileNumber: customer.mobileNumber,
    alternateNumber: customer.alternateNumber,
    identityType: customer.identityType,
    identityNumber: customer.identityNumber,
    address: customer.address,
    country: customer.country,
    selectedDay: customer.selectedDay,
    parentCenterLabel: customer.parentCenterLabel,
    subCenterLabel: customer.subCenterLabel,
    loanAmount: Number(request.loanAmount || 0),
    loanWeeks: Number(request.loanWeeks || 0),
    loanPresetId: customer.loanPresetId,
    loanPresetLabel: customer.loanPresetLabel,
    loanPresetLoanAmount: customer.loanPresetLoanAmount,
    loanPresetLoanWeeks: customer.loanPresetLoanWeeks,
    loanPresetEmiAmount: customer.loanPresetEmiAmount,
    loanPresetInterestAmount: customer.loanPresetInterestAmount,
    loanPresetTotalPayable: customer.loanPresetTotalPayable,
    disbursementDate: today,
    collectionFrequency: normalizeCollectionFrequency(request.collectionFrequency),
    nomineeName: customer.nomineeName,
    nomineeContact: customer.nomineeContact,
    additionalContact: customer.additionalContact,
    idDocumentName: customer.idDocumentName,
    addressProofName: customer.addressProofName,
    loanAgreementName: customer.loanAgreementName,
    supportingDocumentNames: customer.supportingDocumentNames,
    coApplicantName: customer.coApplicantName,
    coApplicantContact: customer.coApplicantContact,
    coApplicantRelation: customer.coApplicantRelation,
    coApplicantAddress: customer.coApplicantAddress,
    coApplicantIdentityType: customer.coApplicantIdentityType,
    coApplicantIdentityNumber: customer.coApplicantIdentityNumber,
    coApplicantIdProofName: customer.coApplicantIdProofName,
    coApplicantPhotoName: customer.coApplicantPhotoName,
    customerPhotoName: customer.customerPhotoName,
    customerPhotoDataUrl: customer.customerPhotoDataUrl,
    coApplicantPhotoDataUrl: customer.coApplicantPhotoDataUrl,
  };
}

export async function createLoanRequest({
  customerId,
  loanAmount,
  loanWeeks,
  collectionFrequency,
  remarks = "",
  employeeId = "",
  employeeName = "",
  requestedByUid = "",
}) {
  const normalizedCustomerId = normalizeText(customerId);
  if (!normalizedCustomerId) {
    throw new Error("Customer is required.");
  }

  const principal = Math.round(Number(loanAmount || 0));
  const tenure = Math.round(Number(loanWeeks || 0));
  if (principal <= 0) throw new Error("Loan amount must be greater than zero.");
  if (tenure <= 0) throw new Error("Tenure must be greater than zero.");

  const customerRef = doc(db, "customers", normalizedCustomerId);
  const customerSnap = await getDoc(customerRef);
  if (!customerSnap.exists()) {
    throw new Error("Customer not found.");
  }
  const customer = customerSnap.data();

  if (String(customer.approvalStatus || "pending").toLowerCase() !== "approved") {
    throw new Error("This customer is not approved yet. Wait for admin approval before applying for a loan.");
  }

  const activeLoanAmount = Number(customer.loanAmount || 0);
  const activeTotalPayable = Number(customer.totalPayable || 0);
  const activeLoanStatus = String(customer.loanStatus || "").toLowerCase();
  if (activeLoanAmount > 0 && activeTotalPayable > 0 && activeLoanStatus !== "closed") {
    throw new Error("This customer already has an active loan.");
  }

  const pendingQuery = query(collection(db, "loanRequests"), where("customerId", "==", normalizedCustomerId));
  const pendingSnap = await getDocs(pendingQuery);
  const hasPending = pendingSnap.docs.some((item) => String(item.data().status || "").toLowerCase() === "pending");
  if (hasPending) {
    throw new Error("A pending loan request already exists for this customer.");
  }

  const requestId = generateLoanRequestId();
  const now = new Date();
  const submittedAt = now.toISOString();
  const frequency = normalizeCollectionFrequency(collectionFrequency);

  await setDoc(doc(db, "loanRequests", requestId), {
    requestId,
    customerId: normalizedCustomerId,
    customerName: normalizeText(customer.customerName),
    loanAmount: principal,
    loanWeeks: tenure,
    collectionFrequency: frequency,
    remarks: normalizeText(remarks),
    status: "pending",
    employeeId: normalizeText(employeeId),
    employeeName: normalizeText(employeeName),
    requestedByUid: normalizeText(requestedByUid),
    submittedAt,
    approvedAt: null,
    rejectedAt: null,
    rejectionNote: "",
    loanId: "",
    applicationId: "",
    createdAt: serverTimestamp(),
  });

  const customerLabel = normalizeText(customer.customerName) || "Customer";
  const employeeLabel = normalizeText(employeeName) || "employee";

  await createNotification({
    type: "approval_notification",
    title: "New loan request",
    message: `${customerLabel} loan request of ₹${principal.toLocaleString("en-IN")} submitted by ${employeeLabel}.`,
    audienceRole: "admin",
    customerId: normalizedCustomerId,
    customerName: customer.customerName,
    relatedId: requestId,
  });

  if (requestedByUid) {
    await createNotification({
      type: "approval_notification",
      title: "Loan request sent",
      message: `Your loan request for ${customerLabel} (₹${principal.toLocaleString("en-IN")}) was sent for admin approval.`,
      audienceRole: "employee",
      customerId: normalizedCustomerId,
      customerName: customer.customerName,
      relatedId: requestId,
    });
  }

  await createAuditLog({
    action: "create_loan_request",
    entityType: "loan_request",
    entityId: requestId,
    message: `${normalizeText(customer.customerName) || "Customer"} loan request was submitted.`,
    actorName: normalizeText(employeeName) || "Employee",
    actorRole: "employee",
  });

  return { requestId, submittedAt };
}

export async function listLoanRequests() {
  const snapshot = await getDocs(collection(db, "loanRequests"));
  return snapshot.docs
    .map((requestDoc) => ({
      id: requestDoc.id,
      ...requestDoc.data(),
    }))
    .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
}

export async function approveLoanRequest(requestId) {
  const requestRef = doc(db, "loanRequests", requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error("Loan request not found.");
  }

  const request = requestSnap.data();
  if (String(request.status || "").toLowerCase() !== "pending") {
    throw new Error("Only pending loan requests can be approved.");
  }

  const customerRef = doc(db, "customers", request.customerId);
  const customerSnap = await getDoc(customerRef);
  if (!customerSnap.exists()) {
    throw new Error("Customer not found.");
  }
  const customer = { ...customerSnap.data(), customerId: request.customerId };

  const loanId = await getNextLoanId();
  const approvedAt = new Date().toISOString();

  await upsertLoanApplication(buildLoanPayloadFromCustomer(customer, request, loanId));
  await approveLoanApplication(loanId);

  const historyEntry = {
    applicationId: loanId,
    loanAmount: Number(request.loanAmount || 0),
    loanWeeks: Number(request.loanWeeks || 0),
    collectionFrequency: request.collectionFrequency,
    remarks: request.remarks || "",
    employeeId: request.employeeId || "",
    employeeName: request.employeeName || "",
    requestedAt: request.submittedAt || approvedAt,
    approvedAt,
    source: "employee_request",
    requestId,
  };

  await updateDoc(customerRef, {
    loanHistory: arrayUnion(historyEntry),
  });

  await updateDoc(requestRef, {
    status: "approved",
    approvedAt,
    loanId,
    applicationId: loanId,
  });

  await createNotification({
    type: "approval_notification",
    title: "Loan request approved",
    message: `${request.customerName || "Customer"} loan request was approved. Loan ID: ${loanId}.`,
    audienceRole: "employee",
    customerId: request.customerId,
    customerName: request.customerName,
    relatedId: requestId,
  });

  await createAuditLog({
    action: "approve_loan_request",
    entityType: "loan_request",
    entityId: requestId,
    message: `${request.customerName || "Customer"} loan request was approved (${loanId}).`,
    actorName: "Admin",
    actorRole: "admin",
  });

  return { requestId, loanId, applicationId: loanId, approvedAt };
}

export async function rejectLoanRequest(requestId, { rejectionNote = "" } = {}) {
  const requestRef = doc(db, "loanRequests", requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error("Loan request not found.");
  }

  const request = requestSnap.data();
  if (String(request.status || "").toLowerCase() !== "pending") {
    throw new Error("Only pending loan requests can be rejected.");
  }

  const rejectedAt = new Date().toISOString();
  const note = normalizeText(rejectionNote);

  await updateDoc(requestRef, {
    status: "rejected",
    rejectedAt,
    ...(note ? { rejectionNote: note } : {}),
  });

  await createNotification({
    type: "approval_notification",
    title: "Loan request rejected",
    message: `${request.customerName || "Customer"} loan request was rejected.`,
    audienceRole: "employee",
    customerId: request.customerId,
    customerName: request.customerName,
    relatedId: requestId,
  });

  await createAuditLog({
    action: "reject_loan_request",
    entityType: "loan_request",
    entityId: requestId,
    message: `${request.customerName || "Customer"} loan request was rejected.`,
    actorName: "Admin",
    actorRole: "admin",
  });

  return { requestId, rejectedAt };
}

function buildDemoLoanApplicationPayload({
  customerId = "",
  customerName = DEMO_CUSTOMER_NAME,
  mobileNumber = DEMO_CUSTOMER_MOBILE,
  identityNumber = DEMO_CUSTOMER_IDENTITY,
  nomineeContact = DEMO_CUSTOMER_NOMINEE_CONTACT,
} = {}) {
  return {
    customerId,
    customerName,
    mobileNumber,
    alternateNumber: "",
    identityType: "Aadhaar Card",
    identityNumber,
    address: "123 Demo Street, Demo City",
    country: "India",
    selectedDay: "Monday Centre",
    loanAmount: DEFAULT_LOAN_PRESET.loanAmount,
    loanWeeks: DEFAULT_LOAN_PRESET.loanWeeks,
    loanPresetId: DEFAULT_LOAN_PRESET.id,
    loanPresetLabel: "₹20,000 / 20 weeks",
    loanPresetLoanAmount: DEFAULT_LOAN_PRESET.loanAmount,
    loanPresetLoanWeeks: DEFAULT_LOAN_PRESET.loanWeeks,
    loanPresetEmiAmount: DEFAULT_LOAN_PRESET.emiAmount,
    loanPresetInterestAmount: DEFAULT_LOAN_PRESET.interestAmount,
    loanPresetTotalPayable: DEFAULT_LOAN_PRESET.totalPayable,
    disbursementDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    collectionFrequency: "Weekly",
    nomineeName: "Demo Nominee",
    nomineeContact,
    additionalContact: "",
    idDocumentName: "demo-id-proof.pdf",
    addressProofName: "demo-address-proof.pdf",
    loanAgreementName: "demo-loan-agreement.pdf",
    supportingDocumentNames: [],
    coApplicantName: "",
    coApplicantContact: "",
    coApplicantRelation: "",
    coApplicantAddress: "",
    coApplicantIdProofName: "",
  };
}

/** Recreates the fixed demo customer (CUST-26001) when missing — e.g. after finance reset. */
async function seedDemoCustomerIfMissing() {
  if (typeof window === "undefined") {
    return false;
  }

  let signedIn = false;
  try {
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
    signedIn = true;

    const customerRef = doc(db, "customers", DEMO_CUSTOMER_ID);
    const existing = await getDoc(customerRef);
    if (existing.exists() && !existing.data()?.isDeleted && !existing.data()?.isArchived) {
      return true;
    }

    const loan = await upsertLoanApplication(
      buildDemoLoanApplicationPayload({ customerId: DEMO_CUSTOMER_ID })
    );

    try {
      await approveLoanApplication(loan.applicationId);
    } catch (approveError) {
      console.warn("[loan-web] Demo customer saved; loan approval skipped:", approveError?.message || approveError);
    }

    try {
      await createCustomerAmountEntry({
        customerId: loan.customerId,
        customerName: DEMO_CUSTOMER_NAME,
        amount: DEFAULT_LOAN_PRESET.emiAmount,
        note: "Demo seed — first weekly collection",
        createdBy: DEMO_EMPLOYEE_DISPLAY_NAME,
        collectorName: DEMO_EMPLOYEE_DISPLAY_NAME,
        paymentMethod: "Cash",
        collectionStatus: "Collected",
        collectionDate: new Date().toISOString().slice(0, 10),
      });
    } catch (collectionError) {
      console.warn("[loan-web] Demo collection entry skipped:", collectionError?.message || collectionError);
    }

    return true;
  } catch (error) {
    console.warn("[loan-web] Demo customer bootstrap:", error);
    return false;
  } finally {
    if (signedIn) {
      try {
        await signOut(auth);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Creates one demo customer with a full loan application (Monday Centre), approves the loan,
 * and adds a pending collection entry so admin can exercise approval and employees can see the customer on Monday.
 */
export async function seedDemoLoanFlowData() {
  const stamp = Date.now();
  const mobileNumber = `9${String(stamp).slice(-9)}`;
  const identityNumber = String(stamp).padStart(12, "0").slice(-12);
  const customerName = `Demo Customer ${String(stamp).slice(-4)}`;
  const nomineeContact = `8${String(stamp + 7).slice(-9)}`;

  const loan = await upsertLoanApplication(
    buildDemoLoanApplicationPayload({
      customerName,
      mobileNumber,
      identityNumber,
      nomineeContact,
    })
  );

  await approveLoanApplication(loan.applicationId);

  const collection = await createCustomerAmountEntry({
    customerId: loan.customerId,
    customerName,
    amount: DEFAULT_LOAN_PRESET.emiAmount,
    note: "Demo seed — first weekly collection",
    createdBy: DEMO_EMPLOYEE_DISPLAY_NAME,
    collectorName: DEMO_EMPLOYEE_DISPLAY_NAME,
    paymentMethod: "Cash",
    collectionStatus: "Collected",
    collectionDate: new Date().toISOString().slice(0, 10),
  });

  return {
    customerId: loan.customerId,
    applicationId: loan.applicationId,
    customerName,
    mobileNumber,
    amountEntryId: collection.entryId,
  };
}

/**
 * Seeds several customers for QA: one approved loan per weekday centre (Mon–Sat),
 * Monday includes a pending collection entry, Tuesday includes a co-applicant,
 * Friday is archived after creation, plus one KYC-only customer (no loan yet).
 */
export async function seedAllTestData() {
  const base = Date.now();
  const disbursementDate = new Date().toISOString().slice(0, 10);
  const collectionDate = disbursementDate;

  const rows = [
    { centre: "Monday Centre", short: "Mon", withCollection: true, coApplicantName: "", coApplicantContact: "" },
    {
      centre: "Tuesday Centre",
      short: "Tue",
      withCollection: false,
      coApplicantName: "Test Co-Applicant",
      coApplicantContact: `7${String(base + 211).slice(-9)}`,
    },
    { centre: "Wednesday Centre", short: "Wed", withCollection: false, coApplicantName: "", coApplicantContact: "" },
    { centre: "Thursday Centre", short: "Thu", withCollection: false, coApplicantName: "", coApplicantContact: "" },
    { centre: "Friday Centre", short: "Fri", withCollection: false, coApplicantName: "", coApplicantContact: "", archiveAfter: true },
    { centre: "Saturday Centre", short: "Sat", withCollection: false, coApplicantName: "", coApplicantContact: "" },
  ];

  const customers = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const mobileNumber = `9${String(base + i * 791).slice(-9)}`;
    const identityNumber = String(base + i * 10_000).padStart(12, "0").slice(-12);
    const nomineeContact = `8${String(base + i * 503 + 1).slice(-9)}`;
    const customerName = `Test Customer ${row.short}`;

    const loan = await upsertLoanApplication({
      customerName,
      mobileNumber,
      alternateNumber: "",
      identityType: "Aadhaar Card",
      identityNumber,
      address: `${100 + i} Seed Street, Test Nagar`,
      country: "India",
      selectedDay: row.centre,
      loanAmount: DEFAULT_LOAN_PRESET.loanAmount,
      loanWeeks: DEFAULT_LOAN_PRESET.loanWeeks,
      loanPresetId: DEFAULT_LOAN_PRESET.id,
      loanPresetLabel: "₹20,000 / 20 weeks",
      loanPresetLoanAmount: DEFAULT_LOAN_PRESET.loanAmount,
      loanPresetLoanWeeks: DEFAULT_LOAN_PRESET.loanWeeks,
      loanPresetEmiAmount: DEFAULT_LOAN_PRESET.emiAmount,
      loanPresetInterestAmount: DEFAULT_LOAN_PRESET.interestAmount,
      loanPresetTotalPayable: DEFAULT_LOAN_PRESET.totalPayable,
      disbursementDate,
      dueDate: "",
      collectionFrequency: "Weekly",
      nomineeName: `Nominee ${row.short}`,
      nomineeContact,
      additionalContact: "",
      idDocumentName: `seed-id-${row.short}.pdf`,
      addressProofName: `seed-addr-${row.short}.pdf`,
      loanAgreementName: `seed-loan-${row.short}.pdf`,
      supportingDocumentNames: [],
      coApplicantName: row.coApplicantName || "",
      coApplicantContact: row.coApplicantContact || "",
      coApplicantRelation: row.coApplicantName ? "Spouse" : "",
      coApplicantAddress: row.coApplicantName ? "Same as applicant" : "",
      coApplicantIdProofName: "",
    });

    await approveLoanApplication(loan.applicationId);

    let amountEntryId = null;
    if (row.withCollection) {
      const col = await createCustomerAmountEntry({
        customerId: loan.customerId,
        customerName,
        amount: DEFAULT_LOAN_PRESET.emiAmount,
        note: `Seed — ${row.centre} collection`,
        createdBy: DEMO_EMPLOYEE_DISPLAY_NAME,
        collectorName: DEMO_EMPLOYEE_DISPLAY_NAME,
        paymentMethod: "Cash",
        collectionStatus: "Collected",
        collectionDate,
      });
      amountEntryId = col.entryId;
    }

    if (row.archiveAfter) {
      await setCustomerArchived(loan.customerId, true);
    }

    customers.push({
      customerId: loan.customerId,
      applicationId: loan.applicationId,
      customerName,
      mobileNumber,
      selectedDay: row.centre,
      amountEntryId,
      archived: Boolean(row.archiveAfter),
    });
  }

  const kycMobile = `9${String(base + 50_000).slice(-9)}`;
  const kycIdentity = String(base + 60_000).padStart(12, "0").slice(-12);
  const kycOnly = await createCustomer({
    customerName: "Test Customer (KYC only)",
    mobileNumber: kycMobile,
    alternateNumber: "",
    identityType: "Aadhaar Card",
    identityNumber: kycIdentity,
    address: "88 Draft Lane",
    country: "India",
    selectedDay: "Wednesday Centre",
    idDocumentName: "kyc-id.pdf",
    addressProofName: "kyc-address.pdf",
    loanAgreementName: "",
  });

  return { customers, kycOnlyCustomerId: kycOnly.customerId };
}

/** Top-level day centres used across the app (sub-centres use these as `parent`). */
/** Re-exported list kept local to avoid circular imports; mirrors `DAY_CENTER_LABELS` in dayCenters.js */
const DUMMY_DAY_CENTER_PARENTS = [
  "Monday Centre",
  "Tuesday Centre",
  "Wednesday Centre",
  "Thursday Centre",
  "Friday Centre",
  "Saturday Centre",
];

const DUMMY_SUBCENTER_SUFFIXES = ["Demo Block A", "Demo Block B"];

const DUMMY_SUBCENTER_EXTRA_COLORS = [
  "border-cyan-200 bg-cyan-50 text-cyan-600",
  "border-indigo-200 bg-indigo-50 text-indigo-600",
  "border-lime-200 bg-lime-50 text-lime-600",
  "border-orange-200 bg-orange-50 text-orange-600",
  "border-pink-200 bg-pink-50 text-pink-600",
];

function formatDummySubcenterLabel(parentDay, displaySuffix) {
  const key = parentDay.trim().toLowerCase().slice(0, 3).replace(/[^a-z0-9]/g, "") || "day";
  const cleaned = displaySuffix.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return cleaned.startsWith(`${key}-`) ? cleaned : `${key}-${cleaned}`;
}

/**
 * Merges two named dummy sub-centres per weekday into `loanCenters` localStorage (same shape as Center Manage).
 * Idempotent: skips labels that already exist.
 * @returns {{ added: string[], labels: string[] }}
 */
export function ensureDummySubcentersInLocalStorage() {
  if (typeof window === "undefined") {
    return { added: [], labels: [] };
  }

  let extra = [];
  try {
    const stored = window.localStorage.getItem("loanCenters");
    extra = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(extra)) extra = [];
  } catch {
    extra = [];
  }

  const labels = [];
  for (const parent of DUMMY_DAY_CENTER_PARENTS) {
    for (const suffix of DUMMY_SUBCENTER_SUFFIXES) {
      labels.push(formatDummySubcenterLabel(parent, suffix));
    }
  }

  const added = [];
  let colorIdx = 0;
  for (const parent of DUMMY_DAY_CENTER_PARENTS) {
    for (const suffix of DUMMY_SUBCENTER_SUFFIXES) {
      const label = formatDummySubcenterLabel(parent, suffix);
      if (extra.some((c) => c.label === label)) continue;
      if (DUMMY_DAY_CENTER_PARENTS.includes(label)) continue;
      extra.push({
        label,
        color: DUMMY_SUBCENTER_EXTRA_COLORS[colorIdx % DUMMY_SUBCENTER_EXTRA_COLORS.length],
        parent,
      });
      added.push(label);
      colorIdx += 1;
    }
  }

  if (added.length > 0) {
    window.localStorage.setItem("loanCenters", JSON.stringify(extra));
  }
  notifyLoanCentersChanged();
  return { added, labels };
}

/**
 * For QA: ensures dummy sub-centres under Mon–Fri day centres, then creates one approved loan customer
 * per sub-centre (skipped if a customer already has that `selectedDay`). Reloads centre-dependent UI via event.
 */
export async function seedDummySubcenterCustomers() {
  if (typeof window === "undefined") {
    throw new Error("This seed runs in the browser only.");
  }

  const { labels } = ensureDummySubcentersInLocalStorage();
  const existing = await listCustomers();
  const takenDays = new Set(existing.map((c) => normalizeText(c.selectedDay)));
  const initiallyTakenLabels = labels.filter((l) => takenDays.has(normalizeText(l)));

  const base = Date.now();
  const disbursementDate = new Date().toISOString().slice(0, 10);
  const customers = [];
  let idx = 0;

  for (const parent of DUMMY_DAY_CENTER_PARENTS) {
    for (const suffix of DUMMY_SUBCENTER_SUFFIXES) {
      const label = formatDummySubcenterLabel(parent, suffix);
      if (takenDays.has(normalizeText(label))) continue;

      const mobileNumber = `9${String(base + idx * 137 + 120_000).slice(-9)}`;
      const identityNumber = String(base + idx * 10_000 + 190_000).padStart(12, "0").slice(-12);
      const nomineeContact = `8${String(base + idx * 331 + 190_000).slice(-9)}`;
      const dayShort = parent.replace(" Centre", "");
      const customerName = `Dummy ${dayShort} — ${suffix}`;

      const loan = await upsertLoanApplication({
        customerName,
        mobileNumber,
        alternateNumber: "",
        identityType: "Aadhaar Card",
        identityNumber,
        address: `${200 + idx} Dummy Subcenter Rd, Test Nagar`,
        country: "India",
        selectedDay: label,
        loanAmount: DEFAULT_LOAN_PRESET.loanAmount,
        loanWeeks: DEFAULT_LOAN_PRESET.loanWeeks,
        loanPresetId: DEFAULT_LOAN_PRESET.id,
        loanPresetLabel: "₹20,000 / 20 weeks",
        loanPresetLoanAmount: DEFAULT_LOAN_PRESET.loanAmount,
        loanPresetLoanWeeks: DEFAULT_LOAN_PRESET.loanWeeks,
        loanPresetEmiAmount: DEFAULT_LOAN_PRESET.emiAmount,
        loanPresetInterestAmount: DEFAULT_LOAN_PRESET.interestAmount,
        loanPresetTotalPayable: DEFAULT_LOAN_PRESET.totalPayable,
        disbursementDate,
        dueDate: "",
        collectionFrequency: "Weekly",
        nomineeName: `Nominee ${dayShort}`,
        nomineeContact,
        additionalContact: "",
        idDocumentName: `dummy-sub-${label}.pdf`,
        addressProofName: `dummy-sub-addr-${label}.pdf`,
        loanAgreementName: `dummy-sub-loan-${label}.pdf`,
        supportingDocumentNames: [],
        coApplicantName: "",
        coApplicantContact: "",
        coApplicantRelation: "",
        coApplicantAddress: "",
        coApplicantIdProofName: "",
      });

      await approveLoanApplication(loan.applicationId);
      customers.push({ customerId: loan.customerId, customerName, selectedDay: label, parent });
      takenDays.add(normalizeText(label));
      idx += 1;
    }
  }

  return {
    subCenterLabels: labels,
    customers,
    skippedSlotCount: initiallyTakenLabels.length,
    createdCount: customers.length,
  };
}

export async function createCustomerAmountEntry({
  customerId,
  customerName,
  amount,
  note,
  createdBy,
  collectorName,
  paymentMethod,
  collectionStatus,
  collectionDate,
}) {
  const entryId = `AMT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
  const now = new Date();

  await setDoc(doc(db, "customerAmounts", entryId), {
    entryId,
    customerId,
    customerName,
    amount,
    note,
    createdBy,
    collectorName: normalizeText(collectorName),
    paymentMethod: normalizeText(paymentMethod) || "Cash",
    collectionStatus: normalizeText(collectionStatus) || "Collected",
    collectionDate: normalizeText(collectionDate) || now.toISOString().slice(0, 10),
    approvalStatus: "pending",
    approvedAt: null,
    createdAt: serverTimestamp(),
    submittedAt: now.toISOString(),
  });

  if ((normalizeText(collectionStatus) || "Collected") !== "Skipped") {
    await createNotification({
      type: "payment_received_confirmation",
      title: "Payment received",
      message: `${normalizeText(customerName) || "Customer"} payment of ₹${Number(amount || 0).toLocaleString("en-IN")} was recorded.`,
      audienceRole: "admin",
      customerId,
      customerName,
      relatedId: entryId,
    });
  }

  await createAuditLog({
    action: "create_collection_entry",
    entityType: "collection",
    entityId: entryId,
    message: `${normalizeText(customerName) || "Customer"} collection entry was recorded.`,
    actorName: normalizeText(collectorName) || "Employee",
    actorRole: "employee",
  });

  return {
    entryId,
    submittedAt: now.toISOString(),
  };
}

/**
 * Records an admin-approved collection entry so employee apps see the payment immediately.
 */
export async function recordApprovedCollectionEntry({
  customerId,
  customerName,
  amount,
  note = "",
  createdByUid = "",
  collectorName = "Admin",
  paymentMethod = "Cash",
  collectionStatus = "Collected",
  collectionDate,
  entrySource = "admin_collection_report",
}) {
  const principal = Math.round(Number(amount || 0));
  if (principal <= 0) {
    throw new Error("Collection amount must be greater than zero.");
  }

  const normalizedCustomerId = normalizeText(customerId);
  if (!normalizedCustomerId) {
    throw new Error("Customer is required.");
  }

  const entryId = `AMT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
  const now = new Date();
  const approvedAt = now.toISOString();
  const collectionDay = normalizeText(collectionDate) || now.toISOString().slice(0, 10);
  const actorName = normalizeText(collectorName) || "Admin";
  const displayName = normalizeText(customerName) || "Customer";
  const status = normalizeText(collectionStatus) || "Collected";

  await setDoc(doc(db, "customerAmounts", entryId), {
    entryId,
    customerId: normalizedCustomerId,
    customerName: displayName,
    amount: principal,
    note: normalizeText(note),
    createdBy: normalizeText(createdByUid) || "admin",
    collectorName: actorName,
    paymentMethod: normalizeText(paymentMethod) || "Cash",
    collectionStatus: status,
    collectionDate: collectionDay,
    approvalStatus: "approved",
    approvedAt,
    entrySource: normalizeText(entrySource),
    createdAt: serverTimestamp(),
    submittedAt: approvedAt,
  });

  const customerRef = doc(db, "customers", normalizedCustomerId);
  const applicationQuery = query(collection(db, "loanApplications"), where("customerId", "==", normalizedCustomerId));
  const applicationSnap = await getDocs(applicationQuery);

  await updateDoc(customerRef, {
    approvalStatus: "approved",
    amountStatus: "approved",
    latestAmountEntryId: entryId,
    latestAmount: principal,
    latestAmountApprovedAt: approvedAt,
  });

  await Promise.all(
    applicationSnap.docs.map((applicationDoc) =>
      updateDoc(doc(db, "loanApplications", applicationDoc.id), {
        approvalStatus: "approved",
        amountStatus: "approved",
        latestAmountEntryId: entryId,
        latestAmount: principal,
        latestAmountApprovedAt: approvedAt,
      })
    )
  );

  await createNotification({
    type: "approval_notification",
    title: "Collection recorded",
    message: `${displayName} payment of ₹${principal.toLocaleString("en-IN")} was recorded by ${actorName}.`,
    audienceRole: "employee",
    customerId: normalizedCustomerId,
    customerName: displayName,
    relatedId: entryId,
  });

  await createAuditLog({
    action: "record_approved_collection_entry",
    entityType: "collection",
    entityId: entryId,
    message: `${displayName} collection of ₹${principal.toLocaleString("en-IN")} was recorded by ${actorName}.`,
    actorName,
    actorRole: "admin",
  });

  await recordEmiCollectionLedgerEntry(
    {
      entryId,
      customerId: normalizedCustomerId,
      customerName: displayName,
      amount: principal,
      collectionDate: collectionDay,
      collectorName: actorName,
      paymentMethod: normalizeText(paymentMethod) || "Cash",
      collectionStatus: status,
    },
    approvedAt
  ).catch((ledgerErr) => {
    console.error("wallet ledger emi:", ledgerErr);
  });

  return { entryId, approvedAt, submittedAt: approvedAt };
}

export async function listCustomerAmountEntries(customerId) {
  const amountQuery = query(collection(db, "customerAmounts"), where("customerId", "==", customerId));
  const snapshot = await getDocs(amountQuery);

  return snapshot.docs
    .map((amountDoc) => ({
      id: amountDoc.id,
      ...amountDoc.data(),
    }))
    .filter((entry) => !entry.isDeleted)
    .sort((a, b) => {
      const left = a.submittedAt || "";
      const right = b.submittedAt || "";
      return right.localeCompare(left);
    });
}

export async function listAllCustomerAmountEntries() {
  const snapshot = await getDocs(collection(db, "customerAmounts"));

  return snapshot.docs
    .map((amountDoc) => ({
      id: amountDoc.id,
      ...amountDoc.data(),
    }))
    .filter((entry) => !entry.isDeleted)
    .sort((a, b) => {
      const left = a.submittedAt || "";
      const right = b.submittedAt || "";
      return right.localeCompare(left);
    });
}

export async function approveCustomerAmountEntry(entryId) {
  const entryRef = doc(db, "customerAmounts", entryId);
  const entrySnap = await getDoc(entryRef);

  if (!entrySnap.exists()) {
    throw new Error("Amount entry not found");
  }

  const entry = entrySnap.data();
  const approvedAt = new Date().toISOString();

  await updateDoc(entryRef, {
    approvalStatus: "approved",
    approvedAt,
  });

  const customerRef = doc(db, "customers", entry.customerId);
  const applicationQuery = query(collection(db, "loanApplications"), where("customerId", "==", entry.customerId));
  const applicationSnap = await getDocs(applicationQuery);

  await updateDoc(customerRef, {
    approvalStatus: "approved",
    amountStatus: "approved",
    latestAmountEntryId: entryId,
    latestAmount: entry.amount,
    latestAmountApprovedAt: approvedAt,
  });

  await Promise.all(
    applicationSnap.docs.map((applicationDoc) =>
      updateDoc(doc(db, "loanApplications", applicationDoc.id), {
        approvalStatus: "approved",
        amountStatus: "approved",
        latestAmountEntryId: entryId,
        latestAmount: entry.amount,
        latestAmountApprovedAt: approvedAt,
      })
    )
  );

  await createNotification({
    type: "approval_notification",
    title: "Collection approved",
    message: `${entry.customerName || "Customer"} collection entry was approved.`,
    audienceRole: "admin",
    customerId: entry.customerId,
    customerName: entry.customerName,
    relatedId: entryId,
  });

  await createNotification({
    type: "approval_notification",
    title: "Collection approved",
    message: `${entry.customerName || "Customer"} collection of ₹${Number(entry.amount || 0).toLocaleString("en-IN")} was approved by admin.`,
    audienceRole: "employee",
    customerId: entry.customerId,
    customerName: entry.customerName,
    relatedId: entryId,
  });

  await createAuditLog({
    action: "approve_collection_entry",
    entityType: "collection",
    entityId: entryId,
    message: `${entry.customerName || "Customer"} collection entry was approved.`,
    actorName: "Admin",
    actorRole: "admin",
  });

  await recordEmiCollectionLedgerEntry(entry, approvedAt).catch((ledgerErr) => {
    console.error("wallet ledger emi:", ledgerErr);
  });

  return {
    entryId,
    approvedAt,
  };
}

export async function rejectCustomerAmountEntry(entryId, { rejectionNote = "" } = {}) {
  const entryRef = doc(db, "customerAmounts", entryId);
  const entrySnap = await getDoc(entryRef);

  if (!entrySnap.exists()) {
    throw new Error("Amount entry not found");
  }

  const entry = entrySnap.data();
  const rejectedAt = new Date().toISOString();
  const note = normalizeText(rejectionNote);

  await updateDoc(entryRef, {
    approvalStatus: "rejected",
    rejectedAt,
    ...(note ? { rejectionNote: note } : {}),
  });

  await createNotification({
    type: "reject_notification",
    title: "Collection rejected",
    message: `${entry.customerName || "Customer"} collection entry was rejected.`,
    audienceRole: "admin",
    customerId: entry.customerId,
    customerName: entry.customerName,
    relatedId: entryId,
  });

  await createNotification({
    type: "reject_notification",
    title: "Collection rejected",
    message: `${entry.customerName || "Customer"} collection was rejected by admin.${note ? ` Note: ${note}` : ""}`,
    audienceRole: "employee",
    customerId: entry.customerId,
    customerName: entry.customerName,
    relatedId: entryId,
  });

  await createAuditLog({
    action: "reject_collection_entry",
    entityType: "collection",
    entityId: entryId,
    message: `${entry.customerName || "Customer"} collection entry was rejected.`,
    actorName: "Admin",
    actorRole: "admin",
  });

  return {
    entryId,
    rejectedAt,
  };
}

const BULK_APPROVAL_CONCURRENCY = 6;

async function runWithConcurrency(items, limit, handler) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      try {
        results[current] = { ok: true, value: await handler(items[current], current) };
      } catch (error) {
        results[current] = { ok: false, error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function classifyEntryForBulkApproval(entryData) {
  const status = String(entryData?.approvalStatus || "pending").toLowerCase();
  if (status === "approved") return "already_approved";
  if (status === "rejected") return "already_rejected";
  if (entryData?.isDeleted) return "invalid";
  return "pending";
}

/**
 * Approve many collection entries with bounded concurrency (skips approved/rejected/missing).
 */
export async function bulkApproveCustomerAmountEntries(entryIds, { concurrency = BULK_APPROVAL_CONCURRENCY } = {}) {
  await assertAdminActor();

  const uniqueIds = [...new Set((entryIds || []).map((id) => normalizeText(id)).filter(Boolean))];
  if (!uniqueIds.length) {
    return { approved: 0, skipped: 0, failed: [] };
  }

  const snaps = await Promise.all(uniqueIds.map((id) => getDoc(doc(db, "customerAmounts", id))));
  const pendingIds = [];
  let skipped = 0;

  snaps.forEach((snap, index) => {
    const entryId = uniqueIds[index];
    if (!snap.exists()) {
      skipped += 1;
      return;
    }
    const bucket = classifyEntryForBulkApproval(snap.data());
    if (bucket !== "pending") {
      skipped += 1;
      return;
    }
    pendingIds.push(entryId);
  });

  const failed = [];
  let approved = 0;

  const outcomes = await runWithConcurrency(pendingIds, concurrency, async (entryId) => {
    await approveCustomerAmountEntry(entryId);
    return entryId;
  });

  outcomes.forEach((outcome, index) => {
    if (outcome?.ok) {
      approved += 1;
      return;
    }
    failed.push({
      entryId: pendingIds[index],
      error: outcome?.error?.message || "Unable to approve entry",
    });
  });

  if (approved > 0) {
    await createAuditLog({
      action: "bulk_approve_collection_entries",
      entityType: "collection",
      entityId: "bulk",
      message: `${approved} collection payment${approved === 1 ? "" : "s"} approved in bulk.`,
      actorName: "Admin",
      actorRole: "admin",
    });
  }

  return { approved, skipped, failed };
}

/**
 * Reject many collection entries with bounded concurrency (skips approved/rejected/missing).
 */
export async function bulkRejectCustomerAmountEntries(
  entryIds,
  { rejectionNote = "", concurrency = BULK_APPROVAL_CONCURRENCY } = {}
) {
  await assertAdminActor();

  const uniqueIds = [...new Set((entryIds || []).map((id) => normalizeText(id)).filter(Boolean))];
  if (!uniqueIds.length) {
    return { rejected: 0, skipped: 0, failed: [] };
  }

  const snaps = await Promise.all(uniqueIds.map((id) => getDoc(doc(db, "customerAmounts", id))));
  const pendingIds = [];
  let skipped = 0;

  snaps.forEach((snap, index) => {
    const entryId = uniqueIds[index];
    if (!snap.exists()) {
      skipped += 1;
      return;
    }
    const bucket = classifyEntryForBulkApproval(snap.data());
    if (bucket !== "pending") {
      skipped += 1;
      return;
    }
    pendingIds.push(entryId);
  });

  const failed = [];
  let rejected = 0;
  const note = normalizeText(rejectionNote);

  const outcomes = await runWithConcurrency(pendingIds, concurrency, async (entryId) => {
    await rejectCustomerAmountEntry(entryId, { rejectionNote: note });
    return entryId;
  });

  outcomes.forEach((outcome, index) => {
    if (outcome?.ok) {
      rejected += 1;
      return;
    }
    failed.push({
      entryId: pendingIds[index],
      error: outcome?.error?.message || "Unable to reject entry",
    });
  });

  if (rejected > 0) {
    await createAuditLog({
      action: "bulk_reject_collection_entries",
      entityType: "collection",
      entityId: "bulk",
      message: `${rejected} collection payment${rejected === 1 ? "" : "s"} rejected in bulk.`,
      actorName: "Admin",
      actorRole: "admin",
    });
  }

  return { rejected, skipped, failed };
}

export async function listNotifications() {
  const snapshot = await getDocs(collection(db, "notifications"));

  return snapshot.docs
    .map((notificationDoc) => ({
      id: notificationDoc.id,
      ...notificationDoc.data(),
    }))
    .sort((a, b) => {
      const left = a.submittedAt || "";
      const right = b.submittedAt || "";
      return right.localeCompare(left);
    });
}

export async function markNotificationRead(notificationId) {
  const notificationRef = doc(db, "notifications", notificationId);
  await updateDoc(notificationRef, { status: "read" });
}

export async function markAllNotificationsRead() {
  const snapshot = await getDocs(collection(db, "notifications"));
  await Promise.all(
    snapshot.docs.map((notificationDoc) =>
      updateDoc(doc(db, "notifications", notificationDoc.id), {
        status: "read",
      })
    )
  );
}

export async function createWalletTransaction({
  type,
  amount,
  description,
  createdBy,
  adjustmentType = "",
}) {
  const transactionId = makeWalletTransactionId();
  const now = new Date();

  await setDoc(doc(db, "walletTransactions", transactionId), {
    transactionId,
    type: normalizeText(type) || "manual_entry",
    amount: Number(amount || 0),
    description: normalizeText(description),
    createdBy: normalizeText(createdBy),
    adjustmentType: normalizeText(adjustmentType),
    createdAt: serverTimestamp(),
    submittedAt: now.toISOString(),
  });

  await createAuditLog({
    action: "wallet_transaction",
    entityType: "wallet",
    entityId: transactionId,
    message: `Wallet transaction of ₹${Number(amount || 0).toLocaleString("en-IN")} was recorded.`,
    actorName: normalizeText(createdBy) || "Admin",
    actorRole: "admin",
  });

  return {
    transactionId,
    submittedAt: now.toISOString(),
  };
}

export async function listWalletTransactions() {
  const snapshot = await getDocs(collection(db, "walletTransactions"));

  return snapshot.docs
    .map((transactionDoc) => ({
      id: transactionDoc.id,
      ...transactionDoc.data(),
    }))
    .sort((a, b) => {
      const left = a.submittedAt || "";
      const right = b.submittedAt || "";
      return right.localeCompare(left);
    });
}

export async function listAuditLogs() {
  const snapshot = await getDocs(collection(db, "auditLogs"));

  return snapshot.docs
    .map((auditDoc) => ({
      id: auditDoc.id,
      ...auditDoc.data(),
    }))
    .sort((a, b) => {
      const left = a.submittedAt || "";
      const right = b.submittedAt || "";
      return right.localeCompare(left);
    });
}

const FINANCE_AND_ACCOUNTS_RESET_COLLECTIONS = [
  "walletTransactions",
  "customers",
  "loanApplications",
  "customerAmounts",
  "notifications",
  ACCOUNTS_TRANSACTIONS_COLLECTION,
  ACCOUNTS_SALARY_COLLECTION,
  ACCOUNTS_REPORTS_COLLECTION,
];

async function deleteAllDocumentsInCollection(collectionName) {
  const snapshot = await getDocs(collection(db, collectionName));
  const refs = snapshot.docs.map((entry) => entry.ref);
  let deleted = 0;
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    const chunk = refs.slice(i, i + 450);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

async function resetAllAdminWalletOpeningBalances() {
  const adminSnap = await getDocs(query(collection(db, USERS_COLLECTION), where("role", "==", "admin")));
  let updated = 0;
  await Promise.all(
    adminSnap.docs.map(async (adminDoc) => {
      const prefs = adminDoc.data()?.preferences || {};
      await updateDoc(adminDoc.ref, {
        preferences: {
          ...prefs,
          cashInHandOpening: 0,
        },
      });
      updated += 1;
    })
  );
  return updated;
}

/**
 * Clears loan finance + company office accounts for QA (keeps users, categories, audit logs).
 * Resets all admin opening wallet balances to 0. Does not delete collection schemas.
 */
export async function resetFinanceAndAccountsTestData() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("You must be signed in to reset test data.");
  }
  const userSnap = await getDoc(doc(db, USERS_COLLECTION, uid));
  if (!userSnap.exists() || userSnap.data().role !== "admin") {
    throw new Error("Only administrators can reset finance and accounts data.");
  }

  const deletedByCollection = {};
  for (const collectionName of FINANCE_AND_ACCOUNTS_RESET_COLLECTIONS) {
    deletedByCollection[collectionName] = await deleteAllDocumentsInCollection(collectionName);
  }

  const adminsReset = await resetAllAdminWalletOpeningBalances();

  await createAuditLog({
    action: "reset_finance_test_data",
    entityType: "system",
    entityId: "finance-and-accounts",
    message: "Loan finance and office accounts test data were cleared (all admin wallet openings set to 0).",
    actorName: userSnap.data()?.displayName || userSnap.data()?.email || "Admin",
    actorRole: "admin",
  });

  const totalDeleted = Object.values(deletedByCollection).reduce((sum, n) => sum + n, 0);

  try {
    await seedDemoCustomerIfMissing();
  } catch (reseedError) {
    console.warn("[loan-web] Demo customer reseed after reset:", reseedError);
  }

  return {
    deletedByCollection,
    totalDeleted,
    cashInHandOpening: 0,
    adminsOpeningReset: adminsReset,
  };
}

/** Alias for dev/QA UI — same as resetFinanceAndAccountsTestData. */
export const resetDemoData = resetFinanceAndAccountsTestData;

export async function getLoanSettings() {
  const snapshot = await getDocs(query(collection(db, USERS_COLLECTION), where("role", "==", "admin")));
  if (snapshot.empty) {
    return {
      interestRate: 12.5,
      defaultLoanAmount: 0,
      emi10Weeks: 0,
      emi20Weeks: 0,
      emi30Weeks: 0,
      loanPresets: [DEFAULT_LOAN_PRESET],
    };
  }
  const prefs = snapshot.docs[0].data()?.preferences || {};
  const loanPresets = Array.isArray(prefs.loanPresets)
    ? prefs.loanPresets
        .map((preset, index) => {
          const loanAmount = Number(preset.loanAmount ?? 0);
          const loanWeeks = Number(preset.loanWeeks ?? 0);
          const emiAmount = Number(preset.emiAmount ?? 0);
          const totalPayable =
            loanWeeks > 0 && emiAmount > 0 ? loanWeeks * emiAmount : Number(preset.totalPayable ?? 0);
          return {
            id: normalizeText(preset.id) || `preset-${index + 1}`,
            loanAmount,
            loanWeeks,
            emiAmount,
            interestAmount: Math.max(totalPayable - loanAmount, 0),
            totalPayable,
          };
        })
        .filter(
          (preset) =>
            (preset.loanAmount > 0 && preset.loanWeeks > 0) || preset.emiAmount > 0 || preset.totalPayable > 0
        )
    : [DEFAULT_LOAN_PRESET];

  return {
    interestRate: Number(prefs.interestRate ?? 12.5),
    defaultLoanAmount: Number(prefs.defaultLoanAmount ?? 0),
    emi10Weeks: Number(prefs.emi10Weeks ?? 0),
    emi20Weeks: Number(prefs.emi20Weeks ?? 0),
    emi30Weeks: Number(prefs.emi30Weeks ?? 0),
    loanPresets,
  };
}

export {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_EMPLOYEE_ID,
  DEMO_EMPLOYEE_EMAIL,
  DEMO_EMPLOYEE_PASSWORD,
  DEMO_EMPLOYEE_DISPLAY_NAME,
  DEMO_EMPLOYEE_ID,
  DEMO_CUSTOMER_ID,
  DEMO_CUSTOMER_NAME,
};
