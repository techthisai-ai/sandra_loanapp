import { useEffect, useMemo, useState } from "react";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import useAuth from "./useAuth";
import { subscribeAccountsSalary, subscribeAccountsTransactions } from "../services/accounts";
import { subscribeWalletLedger } from "../services/walletLedger";
import { buildWalletTransactionTimelineDescending, getLedgerWalletBalance } from "../utils/walletLedgerBalance";

/** Live unified wallet: loan ledger + office income/expense/payroll (single balance across Dashboard & Accounts). */
export default function useWalletAvailable() {
  const { user, profile } = useAuth();
  const { customers, entries } = useLoanDataSync();
  const [walletRows, setWalletRows] = useState([]);
  const [officeTransactions, setOfficeTransactions] = useState([]);
  const [salaryRecords, setSalaryRecords] = useState([]);

  useEffect(() => {
    if (!user?.uid) {
      setWalletRows([]);
      return undefined;
    }
    return subscribeWalletLedger(setWalletRows, () => {});
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setOfficeTransactions([]);
      setSalaryRecords([]);
      return undefined;
    }
    const unsubTx = subscribeAccountsTransactions(setOfficeTransactions, () => {});
    const unsubSal = subscribeAccountsSalary(setSalaryRecords, () => {});
    return () => {
      unsubTx();
      unsubSal();
    };
  }, [user?.uid]);

  const opening = Number(profile?.preferences?.cashInHandOpening ?? 0) || 0;

  const balance = useMemo(
    () => getLedgerWalletBalance(walletRows, customers, entries, opening, officeTransactions, salaryRecords),
    [walletRows, customers, entries, opening, officeTransactions, salaryRecords]
  );

  const timeline = useMemo(
    () => buildWalletTransactionTimelineDescending(walletRows, customers, entries, opening, officeTransactions, salaryRecords),
    [walletRows, customers, entries, opening, officeTransactions, salaryRecords]
  );

  return { balance, opening, walletRows, officeTransactions, salaryRecords, timeline };
}
