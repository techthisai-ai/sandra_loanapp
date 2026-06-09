import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { collection, getDocsFromServer, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import useAuth from "../hooks/useAuth";
import { isRecordDeleted, isVisibleCustomerRecord } from "../utils/recordFlags";

const LoanDataSyncContext = createContext(null);

function mapCustomerDocs(docs) {
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

function mapEntryDocs(docs) {
  return docs
    .map((amountDoc) => ({
      id: amountDoc.id,
      ...amountDoc.data(),
    }))
    .filter((entry) => !isRecordDeleted(entry))
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
    .filter((application) => !isRecordDeleted(application))
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

    let cancelled = false;
    let unsubCustomers = () => {};
    let unsubEntries = () => {};
    let unsubLoanRequests = () => {};
    let unsubLoanApplications = () => {};

    setLoading(true);
    setError(null);
    const isAdmin = profile?.role === "admin";
    // Core lists (customers + collections) must not wait on loan requests/applications —
    // otherwise the Customer page can stay on "Loading…" forever while Firestore data exists.
    const gates = { customers: false, entries: false };

    const tryDone = () => {
      if (gates.customers && gates.entries) {
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
      if (cancelled) return;
      setError(err?.message || "Unable to sync data from Firebase");
      setLoading(false);
    };

    const startListeners = async () => {
      try {
        const [serverCustomers, serverEntries] = await Promise.all([
          getDocsFromServer(query(collection(db, "customers"))),
          getDocsFromServer(collection(db, "customerAmounts")),
        ]);
        if (!cancelled) {
          setCustomers(mapCustomerDocs(serverCustomers.docs));
          setEntries(mapEntryDocs(serverEntries.docs));
          if (!gates.customers) {
            gates.customers = true;
            tryDone();
          }
          if (!gates.entries) {
            gates.entries = true;
            tryDone();
          }
        }
      } catch (serverError) {
        console.warn("[sync] server fetch:", serverError?.message || serverError);
      }

      unsubCustomers = onSnapshot(query(collection(db, "customers")), (snap) => {
        if (cancelled) return;
        setCustomers(mapCustomerDocs(snap.docs));
        if (!gates.customers) {
          gates.customers = true;
          tryDone();
        }
      }, onCoreErr);

      unsubEntries = onSnapshot(collection(db, "customerAmounts"), (snap) => {
        if (cancelled) return;
        setEntries(mapEntryDocs(snap.docs));
        if (!gates.entries) {
          gates.entries = true;
          tryDone();
        }
      }, onCoreErr);

      if (isAdmin) {
        unsubLoanRequests = onSnapshot(
          collection(db, "loanRequests"),
          (snap) => {
            if (cancelled) return;
            setLoanRequests(mapLoanRequestDocs(snap.docs));
            markLoanRequestsReady();
          },
          () => {
            if (cancelled) return;
            setLoanRequests([]);
            markLoanRequestsReady();
          }
        );
      } else if (user?.uid) {
        unsubLoanRequests = onSnapshot(
          query(collection(db, "loanRequests"), where("requestedByUid", "==", user.uid)),
          (snap) => {
            if (cancelled) return;
            setLoanRequests(mapLoanRequestDocs(snap.docs));
            markLoanRequestsReady();
          },
          () => {
            if (cancelled) return;
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

      unsubLoanApplications = onSnapshot(
        query(collection(db, "loanApplications")),
        (snap) => {
          if (cancelled) return;
          setLoanApplications(mapLoanApplicationDocs(snap.docs));
          markLoanApplicationsReady();
        },
        () => {
          if (cancelled) return;
          setLoanApplications([]);
          markLoanApplicationsReady();
        }
      );
    };

    (async () => {
      try {
        await user.getIdToken(true);
        if (cancelled) return;
        startListeners();
      } catch (tokenError) {
        try {
          await user.getIdToken();
          if (cancelled) return;
          startListeners();
        } catch (retryError) {
          onCoreErr(retryError);
        }
      }
    })();

    return () => {
      cancelled = true;
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
