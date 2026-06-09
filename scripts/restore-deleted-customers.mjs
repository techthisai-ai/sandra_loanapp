/**
 * One-time utility: restore all soft-deleted customers in Firestore.
 * Usage: node scripts/restore-deleted-customers.mjs
 */
import { initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyDwQJ8-9Ttp3xJ9Tr7Yruj0iVFfFP99ymE",
  projectId: "sandraloanapp-85985",
});
const db = getFirestore(app);

const RESTORE_PATCH = {
  isDeleted: false,
  deletedAt: null,
  deletedByUid: "",
  deletedByName: "",
  isArchived: false,
  archivedAt: null,
};

async function batchPatch(refs) {
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach((ref) => batch.update(ref, RESTORE_PATCH));
    await batch.commit();
  }
}

async function restoreLinked(canonicalId) {
  const [apps, amounts, wallets, notes] = await Promise.all([
    getDocs(query(collection(db, "loanApplications"), where("customerId", "==", canonicalId))),
    getDocs(query(collection(db, "customerAmounts"), where("customerId", "==", canonicalId))),
    getDocs(query(collection(db, "walletTransactions"), where("customerId", "==", canonicalId))),
    getDocs(query(collection(db, "notifications"), where("customerId", "==", canonicalId))),
  ]);
  const walletRefs = wallets.docs.map((d) => d.ref);
  const loanDisbRef = doc(db, "walletTransactions", `loan-disb-${canonicalId}`);
  if ((await getDoc(loanDisbRef)).exists()) walletRefs.push(loanDisbRef);
  for (const amountDoc of amounts.docs) {
    const entryId = amountDoc.data()?.entryId || amountDoc.id;
    const emiRef = doc(db, "walletTransactions", `emi-${entryId}`);
    if ((await getDoc(emiRef)).exists()) walletRefs.push(emiRef);
  }
  await batchPatch(apps.docs.map((d) => d.ref));
  await batchPatch(amounts.docs.map((d) => d.ref));
  await batchPatch(walletRefs);
  await batchPatch(notes.docs.map((d) => d.ref));
}

const snap = await getDocs(collection(db, "customers"));
const deleted = snap.docs.filter((d) => d.data()?.isDeleted === true);
console.log(`Restoring ${deleted.length} soft-deleted customer(s)...`);

for (const customerDoc of deleted) {
  const id = customerDoc.id;
  const name = customerDoc.data()?.customerName || id;
  await updateDoc(customerDoc.ref, RESTORE_PATCH);
  await restoreLinked(id);
  console.log(`  restored ${id} (${name})`);
}

console.log("Done.");
