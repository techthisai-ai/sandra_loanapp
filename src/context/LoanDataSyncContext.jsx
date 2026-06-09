import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import useAuth from "../hooks/useAuth";

const LoanDataSyncContext = createContext(null);

function mapCustomerDocs(docs) {
  return docs
    .map((customerDoc) => ({
      id: customerDoc.id,
      ...customerDoc.data(),
    }))
    .filter((customer) => !customer.isDeleted)
    .sort((a, b) => {
      const left = a.submittedAt || "";
      const right = b.submittedAt || "";
      return right.localeCompare(left);
    });
}

function mapEntryDocs(docs) {
  return docs
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

function mapLoanRequestDocs(docs) {
  return docs
    .map((requestDoc) => ({
      id: requestDoc.id,
      ...requestDoc.data(),
    }))
    .sort((a, b) => {
      const left = a.submittedAt || "";
      const right = b.submittedAt || "";
      return right.localeCompare(left);
    });
}

function mapLoanApplicationDocs(docs) {
  return docs
    .map((applicationDoc) => ({
      id: applicationDoc.id,
      ...applicationDoc.data(),
    }))
    .filter((application) => !application.isDeleted)
    .sort((a, b) => {
      const left = a.submittedAt || "";
      const right = b.submittedAt || "";
      return right.localeCompare(left);
    });
}

/**
 * Keeps customers + collection entries in sync across admin and employee apps
 * using Firestore listeners (same source as listCustomers / listAllCustomerAmountEntries).
 */
export function LoanDataSyncProvider({ children }) {
  const { user, profile } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loanRequests, setLoanRequests] = useState([]);
  const [loanApplications, setLoanApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
      setCustomers([]);
      setEntries([]);
      setLoanRequests([]);
      setLoanApplications([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);
    const isAdmin = profile?.role === "admin";
    const gates = { customers: false, entries: false, loanRequests: false, loanApplications: false };

    const tryDone = () => {
      if (gates.customers && gates.entries && gates.loanRequests && gates.loanApplications) {
        setLoading(false);
      }
    };

    const markLoanRequestsReady = () => {
      if (!gates.loanRequests) {
        gates.loanRequests = true;
        tryDone();
      }
    };

    const onCoreErr = (err) => {
      setError(err?.message || "Unable to sync data");
      setLoading(false);
    };

    const unsubCustomers = onSnapshot(query(collection(db, "customers")), (snap) => {
      setCustomers(mapCustomerDocs(snap.docs));
      if (!gates.customers) {
        gates.customers = true;
        tryDone();
      }
    }, onCoreErr);

    const unsubEntries = onSnapshot(collection(db, "customerAmounts"), (snap) => {
      setEntries(mapEntryDocs(snap.docs));
      if (!gates.entries) {
        gates.entries = true;
        tryDone();
      }
    }, onCoreErr);

    let unsubLoanRequests = () => {};
    if (isAdmin) {
      unsubLoanRequests = onSnapshot(
        collection(db, "loanRequests"),
        (snap) => {
          setLoanRequests(mapLoanRequestDocs(snap.docs));
          markLoanRequestsReady();
        },
        () => {
          setLoanRequests([]);
          markLoanRequestsReady();
        }
      );
    } else if (user?.uid) {
      unsubLoanRequests = onSnapshot(
        query(collection(db, "loanRequests"), where("requestedByUid", "==", user.uid)),
        (snap) => {
          setLoanRequests(mapLoanRequestDocs(snap.docs));
          markLoanRequestsReady();
        },
        () => {
          setLoanRequests([]);
          markLoanRequestsReady();
        }
      );
    } else {
      setLoanRequests([]);
      markLoanRequestsReady();
    }

    const markLoanApplicationsReady = () => {
      if (!gates.loanApplications) {
        gates.loanApplications = true;
        tryDone();
      }
    };

    const unsubLoanApplications = onSnapshot(
      query(collection(db, "loanApplications")),
      (snap) => {
        setLoanApplications(mapLoanApplicationDocs(snap.docs));
        markLoanApplicationsReady();
      },
      () => {
        setLoanApplications([]);
        markLoanApplicationsReady();
      }
    );

    return () => {
      unsubCustomers();
      unsubEntries();
      unsubLoanRequests();
      unsubLoanApplications();
    };
  }, [user, profile?.role]);

  const value = useMemo(
    () => ({
      customers,
      entries,
      loanRequests,
      loanApplications,
      loading,
      error,
    }),
    [customers, entries, loanRequests, loanApplications, loading, error]
  );

  return <LoanDataSyncContext.Provider value={value}>{children}</LoanDataSyncContext.Provider>;
}

export function useLoanDataSync() {
  const ctx = useContext(LoanDataSyncContext);
  if (!ctx) {
    throw new Error("useLoanDataSync must be used within LoanDataSyncProvider");
  }
  return ctx;
}
