import { useEffect, useState } from "react";
import { Database, RefreshCw, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import { notifyLoanCentersChanged } from "../constants/loanCenterStorage";
import useAuth from "../hooks/useAuth";
import { ensureDefaultAccountsCategories } from "../services/accounts";
import {
  listAuditLogs,
  listUsers,
  resetDemoData,
  seedAllTestData,
  seedDemoLoanFlowData,
  seedDummySubcenterCustomers,
  updateUserRole,
} from "../services/userAuth";
import { isUsingFirebaseEmulators } from "../firebase/environment";
import { isDevTestingMode } from "../utils/devTesting";

export default function AdminControls() {
  const { user, profile, refreshProfile } = useAuth();
  const showDevReset = isDevTestingMode();
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [savingId, setSavingId] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [seedingBundle, setSeedingBundle] = useState(false);
  const [seedingSub, setSeedingSub] = useState(false);
  const [seedSummary, setSeedSummary] = useState(null);
  const [bundleSummary, setBundleSummary] = useState(null);
  const [subcenterSummary, setSubcenterSummary] = useState(null);
  const [resettingFinance, setResettingFinance] = useState(false);
  const [resetSummary, setResetSummary] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [userList, auditLogs] = await Promise.all([listUsers(), listAuditLogs()]);
      setUsers(userList);
      setLogs(auditLogs);
    } catch (loadError) {
      setError(loadError.message || "Unable to load admin controls");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSeedDemo = async () => {
    if (
      !window.confirm(
        "Create demo data: new customer on Monday Centre, approved loan, and one pending collection for admin approval?"
      )
    ) {
      return;
    }
    setSeeding(true);
    setSeedSummary(null);
    setError("");
    setStatus("");
    try {
      const result = await seedDemoLoanFlowData();
      setSeedSummary(result);
      setStatus("Demo loan flow data created. Check Customers, Monday day list, and Collection approvals.");
      await loadData();
    } catch (seedError) {
      setError(seedError.message || "Unable to seed demo data");
    } finally {
      setSeeding(false);
    }
  };

  const handleSeedBundle = async () => {
    if (
      !window.confirm(
        "Create full test dataset? This adds 5 loan customers (Mon–Fri centres; Monday has a pending collection; Friday is archived), plus one KYC-only customer with no loan."
      )
    ) {
      return;
    }
    setSeedingBundle(true);
    setBundleSummary(null);
    setError("");
    setStatus("");
    try {
      const result = await seedAllTestData();
      setBundleSummary(result);
      setStatus("Test dataset created. Use Customer day filters, Archived tab, and employee Monday/Tue… views.");
      await loadData();
    } catch (seedError) {
      setError(seedError.message || "Unable to seed test dataset");
    } finally {
      setSeedingBundle(false);
    }
  };

  const handleSeedSubcenters = async () => {
    if (
      !window.confirm(
        "Add dummy sub-centres (Demo Block A/B) under each Mon–Fri day centre in this browser, then create one approved loan customer per sub-centre where none exists yet? Safe to run again: existing sub-centre slots are skipped."
      )
    ) {
      return;
    }
    setSeedingSub(true);
    setSubcenterSummary(null);
    setError("");
    setStatus("");
    try {
      const result = await seedDummySubcenterCustomers();
      setSubcenterSummary(result);
      setStatus(
        `Dummy sub-centres: created ${result.createdCount} customer(s); ${result.skippedSlotCount} slot(s) already had a customer. Reports and Center views update automatically.`
      );
      await loadData();
    } catch (seedError) {
      setError(seedError.message || "Unable to seed dummy sub-centre customers");
    } finally {
      setSeedingSub(false);
    }
  };

  const handleResetDemoData = async () => {
    if (
      !window.confirm(
        "RESET DEMO DATA (testing only)\n\nThis sets Dashboard and Accounts finance to ZERO:\n• Wallet, loans, EMI, pending recovery, deposits, ledger\n• Office income, expense, salary, saved reports\n• Opening wallet balance for all admins\n\nUsers and login are kept. Cannot be undone. Continue?"
      )
    ) {
      return;
    }
    if (!window.confirm("Confirm: wipe all demo finance and office account transactions now?")) {
      return;
    }
    setResettingFinance(true);
    setResetSummary(null);
    setError("");
    setStatus("");
    try {
      const result = await resetDemoData();
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("loanCenters");
        notifyLoanCentersChanged();
      }
      await ensureDefaultAccountsCategories({
        uid: user?.uid || "",
        name: profile?.displayName || profile?.email || user?.email || "Admin",
        role: profile?.role || "admin",
      });
      await refreshProfile();
      setResetSummary(result);
      setStatus(
        `Demo data cleared (${result.totalDeleted} docs). Dashboard and Accounts should show ₹0 — hard-refresh (Ctrl+F5) if needed, then test deposit → loan → EMI flow.`
      );
      await loadData();
    } catch (resetError) {
      setError(resetError.message || "Unable to reset demo data");
    } finally {
      setResettingFinance(false);
    }
  };

  const handleRoleChange = async (userId, role) => {
    setSavingId(userId);
    setStatus("");
    setError("");
    try {
      await updateUserRole(userId, role);
      setStatus("User role updated");
      await loadData();
    } catch (updateError) {
      setError(updateError.message || "Unable to update role");
    } finally {
      setSavingId("");
    }
  };

  return (
    <AdminLayout
      title="Admin Controls"
      description="User management, permission roles, audit logs, and activity tracking."
    >
      <div className="app-grid-page grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="app-panel rounded-[30px] p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">QA / demos</p>
                <h3 className="text-2xl font-semibold text-slate-950">Demo loan &amp; collection</h3>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  {showDevReset ? (
                    <>
                      <span className="font-semibold text-slate-800">Seed demo data</span> adds one customer (Monday Centre,
                      loan approved, one pending collection).{" "}
                      <span className="font-semibold text-slate-800">Seed full test dataset</span> adds five weekday
                      customers plus one KYC-only draft.{" "}
                      <span className="font-semibold text-slate-800">Reset demo data</span> wipes emulator finance data only.
                    </>
                  ) : (
                    <>
                      Seed and reset tools are available only on the{" "}
                      <span className="font-semibold text-slate-800">Firebase Emulator</span> so localhost testing cannot
                      delete data on your deployed website. Run{" "}
                      <code className="rounded bg-slate-100 px-1 text-xs">npm run emulators</code> then{" "}
                      <code className="rounded bg-slate-100 px-1 text-xs">npm run dev</code>.
                      {isUsingFirebaseEmulators() ? null : " You are currently connected to live Firebase."}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSeedDemo}
                disabled={seeding || seedingBundle || seedingSub || resettingFinance}
                className="app-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
              >
                {seeding ? "Seeding…" : "Seed demo data"}
              </button>
              <button
                type="button"
                onClick={handleSeedBundle}
                disabled={seeding || seedingBundle || seedingSub || resettingFinance}
                className="app-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-60"
              >
                {seedingBundle ? "Seeding…" : "Seed full test dataset"}
              </button>
              <button
                type="button"
                onClick={handleSeedSubcenters}
                disabled={seeding || seedingBundle || seedingSub || resettingFinance}
                className="app-button-secondary inline-flex items-center gap-2 rounded-2xl border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-900 disabled:opacity-60"
              >
                {seedingSub ? "Seeding…" : "Seed dummy sub-centres"}
              </button>
              {showDevReset ? (
                <button
                  type="button"
                  onClick={handleResetDemoData}
                  disabled={resettingFinance || seeding || seedingBundle || seedingSub}
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
                  title="Dev/QA only — hidden in production builds"
                >
                  <Trash2 className="h-4 w-4" />
                  {resettingFinance ? "Resetting…" : "Reset demo data"}
                </button>
              ) : null}
            </div>
          </div>
          {showDevReset ? (
            <p className="mt-3 text-xs text-slate-500">
              <span className="font-semibold text-rose-800">Reset demo data</span> (local/dev only) clears loan wallet and
              office accounts to zero for fresh QA. Users stay. Hard-refresh Dashboard and Accounts after reset.
            </p>
          ) : null}
          {resetSummary ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 font-mono text-xs text-slate-700">
              <p className="font-sans font-semibold text-rose-900">Deleted {resetSummary.totalDeleted} document(s)</p>
              <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
                {Object.entries(resetSummary.deletedByCollection || {}).map(([name, count]) => (
                  <li key={name}>
                    {name}: {count}
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-sans text-[11px] text-slate-600">Opening wallet: ₹{resetSummary.cashInHandOpening}</p>
            </div>
          ) : null}
          {seedSummary ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700">
              <p>customerId: {seedSummary.customerId}</p>
              <p>applicationId: {seedSummary.applicationId}</p>
              <p>amountEntryId: {seedSummary.amountEntryId}</p>
              <p>mobile: {seedSummary.mobileNumber}</p>
            </div>
          ) : null}
          {bundleSummary ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700">
              <p className="mb-2 font-sans text-[11px] font-semibold text-slate-600">KYC-only (no loan): {bundleSummary.kycOnlyCustomerId}</p>
              <ul className="space-y-1">
                {bundleSummary.customers?.map((c) => (
                  <li key={c.customerId}>
                    {c.selectedDay} — {c.customerId}
                    {c.archived ? " (archived)" : ""}
                    {c.amountEntryId ? ` — collection ${c.amountEntryId}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {subcenterSummary ? (
            <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/80 px-4 py-3 text-xs text-slate-800">
              <p className="font-sans text-[11px] font-semibold text-violet-900">
                Created {subcenterSummary.createdCount} customer(s) · skipped {subcenterSummary.skippedSlotCount} occupied
                sub-centre slot(s)
              </p>
              <p className="mt-2 font-mono text-[11px] text-slate-600">
                Sub-centre keys: {subcenterSummary.subCenterLabels?.join(", ")}
              </p>
              {subcenterSummary.customers?.length > 0 ? (
                <ul className="mt-2 space-y-1 font-mono text-[11px]">
                  {subcenterSummary.customers.map((c) => (
                    <li key={c.customerId}>
                      {c.parent} → {c.selectedDay}: {c.customerName} ({c.customerId})
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="app-panel rounded-[30px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
                <UsersRound className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">User management</p>
                <h3 className="text-2xl font-semibold text-slate-950">Permission roles</h3>
              </div>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="app-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>

          {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          {status ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{status}</div> : null}

          <div className="mt-5 space-y-3">
            {users.map((user) => (
              <div key={user.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{user.displayName || user.email}</p>
                    <p className="mt-1 text-xs text-slate-500">{user.email}</p>
                  </div>
                  <select
                    value={user.role || "employee"}
                    onChange={(event) => handleRoleChange(user.id, event.target.value)}
                    disabled={savingId === user.id}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                  >
                    <option value="admin">admin</option>
                    <option value="employee">employee</option>
                  </select>
                </div>
              </div>
            ))}

            {!loading && users.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                No users available.
              </div>
            ) : null}
          </div>
        </section>

        <section className="app-panel-muted rounded-[30px] p-6">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Audit logs</p>
              <h3 className="text-2xl font-semibold text-slate-950">Activity tracking</h3>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {logs.map((log) => (
              <div key={log.auditId} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{log.action}</p>
                    <p className="mt-1 text-sm text-slate-600">{log.message}</p>
                    <p className="mt-2 text-xs text-slate-400">{log.entityType} | {log.entityId}</p>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <p>{log.actorName || "System"}</p>
                    <p>{log.actorRole || "admin"}</p>
                    <p>{log.submittedAt?.slice(0, 16).replace("T", " ") || "--"}</p>
                  </div>
                </div>
              </div>
            ))}

            {!loading && logs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                No audit logs yet.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
