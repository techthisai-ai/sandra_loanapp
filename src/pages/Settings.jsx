import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Save, Trash2 } from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import LogoutButton from "../components/dashboard/LogoutButton";
import useAuth from "../hooks/useAuth";
import { updateUserSettings } from "../services/userAuth";
import { ProfilePanel } from "./Profile";
import { NotificationsPanel } from "./Notifications";

function createPreset(seed = {}) {
  return {
    id:
      seed.id ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    loanAmount: seed.loanAmount ?? "",
    loanWeeks: seed.loanWeeks ?? "",
    emiAmount: seed.emiAmount ?? "",
  };
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/** Total payable = tenure (weeks) × EMI */
function presetTotal(loanWeeks, emiAmount) {
  return toNumber(loanWeeks) * toNumber(emiAmount);
}

export default function Settings() {
  const { user, profile, setProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "repayment";

  const [loanPresets, setLoanPresets] = useState([
    createPreset({
      loanAmount: 20000,
      loanWeeks: 20,
      emiAmount: 1000,
    }),
  ]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const storedPresets = Array.isArray(profile?.preferences?.loanPresets) ? profile.preferences.loanPresets : [];
    setLoanPresets(
      storedPresets.length > 0
        ? storedPresets.map((preset) => createPreset(preset))
        : [
            createPreset({
              loanAmount: 20000,
              loanWeeks: 20,
              emiAmount: 1000,
            }),
          ]
    );
  }, [profile]);

  const updatePreset = (id, field, value) => {
    setLoanPresets((current) =>
      current.map((preset) =>
        preset.id === id
          ? {
              ...preset,
              [field]: value,
            }
          : preset
      )
    );
  };

  const addPreset = () => {
    setLoanPresets((current) => [...current, createPreset()]);
  };

  const removePreset = (id) => {
    setLoanPresets((current) => {
      if (current.length === 1) return [createPreset()];
      return current.filter((preset) => preset.id !== id);
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user) return;

    setSaving(true);
    setStatus("");
    setError("");

    try {
      const updatedProfile = await updateUserSettings(user.uid, {
        loanPresets: loanPresets.map((preset) => {
          const loanAmount = toNumber(preset.loanAmount);
          const loanWeeks = toNumber(preset.loanWeeks);
          const emiAmount = toNumber(preset.emiAmount);
          const totalPayable = presetTotal(loanWeeks, emiAmount);
          return {
            id: preset.id,
            loanAmount,
            loanWeeks,
            emiAmount,
            totalPayable,
            interestAmount: Math.max(totalPayable - loanAmount, 0),
          };
        }),
      });
      setProfile(updatedProfile);
      setStatus("Loan presets saved");
    } catch (submitError) {
      setError(submitError.message || "Unable to update settings");
    } finally {
      setSaving(false);
    }
  };

  const setTab = (nextTab) => {
    if (nextTab === "repayment") {
      setSearchParams({});
      return;
    }
    setSearchParams({ tab: nextTab });
  };

  const settingsTabs = (
    <div className="app-segmented inline-flex w-full max-w-full shrink-0 flex-wrap rounded-2xl p-1 sm:w-auto">
      <button
        type="button"
        onClick={() => setTab("repayment")}
        className={`rounded-xl px-3 py-2 text-sm font-medium transition sm:px-4 ${
          tab === "repayment" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        Repayment
      </button>
      <button
        type="button"
        onClick={() => setTab("profile")}
        className={`rounded-xl px-3 py-2 text-sm font-medium transition sm:px-4 ${
          tab === "profile" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        Profile
      </button>
      <button
        type="button"
        onClick={() => setTab("notifications")}
        className={`rounded-xl px-3 py-2 text-sm font-medium transition sm:px-4 ${
          tab === "notifications" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        Notifications
      </button>
    </div>
  );

  return (
    <AdminLayout
      title="Setting"
      description="Manage app settings."
      action={
        <>
          {settingsTabs}
          <LogoutButton />
        </>
      }
    >
      <div className="app-grid-page grid gap-3">
        {tab === "profile" ? <ProfilePanel /> : null}
        {tab === "notifications" ? <NotificationsPanel /> : null}

        {tab === "repayment" ? (
          <div className="grid w-full gap-3">
            <form onSubmit={handleSubmit} className="app-section-card p-4 md:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight text-slate-950">Repayment presets</h2>
                <button
                  type="button"
                  onClick={addPreset}
                  className="app-button-secondary inline-flex items-center gap-2 rounded-2xl border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                  Add row
                </button>
              </div>

              <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white">
                <div>
                  <table className="w-full table-fixed border-collapse">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="border-b border-r border-slate-200 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Loan</th>
                        <th className="border-b border-r border-slate-200 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Tenure</th>
                        <th className="border-b border-r border-slate-200 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">EMI</th>
                        <th className="border-b border-r border-slate-200 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Total</th>
                        <th className="border-b border-slate-200 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loanPresets.map((preset) => (
                        <tr key={preset.id} className="border-t border-slate-100 even:bg-slate-50/60">
                          <td className="border-r border-slate-200 px-2 py-2 align-top">
                            <input
                              value={preset.loanAmount}
                              onChange={(event) =>
                                updatePreset(preset.id, "loanAmount", event.target.value.replace(/\D/g, ""))
                              }
                              inputMode="numeric"
                              className="app-input h-9 px-2 py-1.5 text-sm"
                              placeholder="20000"
                            />
                          </td>
                          <td className="border-r border-slate-200 px-2 py-2 align-top">
                            <input
                              value={preset.loanWeeks}
                              onChange={(event) =>
                                updatePreset(preset.id, "loanWeeks", event.target.value.replace(/\D/g, ""))
                              }
                              inputMode="numeric"
                              className="app-input h-9 px-2 py-1.5 text-sm"
                              placeholder="20"
                            />
                          </td>
                          <td className="border-r border-slate-200 px-2 py-2 align-top">
                            <input
                              value={preset.emiAmount}
                              onChange={(event) =>
                                updatePreset(preset.id, "emiAmount", event.target.value.replace(/\D/g, ""))
                              }
                              inputMode="numeric"
                              className="app-input h-9 px-2 py-1.5 text-sm"
                              placeholder="1000"
                            />
                          </td>
                          <td className="border-r border-slate-200 px-2 py-2 align-top">
                            <input
                              readOnly
                              tabIndex={-1}
                              value={presetTotal(preset.loanWeeks, preset.emiAmount) || ""}
                              className="app-input h-9 cursor-default bg-slate-50 px-2 py-1.5 text-sm text-slate-700"
                              placeholder="0"
                              aria-label="Total (tenure × EMI)"
                            />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => removePreset(preset.id)}
                                className="app-button-secondary inline-flex items-center gap-1 rounded-xl border-rose-200 bg-white px-2 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Del
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {loanPresets.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                            No presets yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              {error ? <div className="app-alert-error mt-5">{error}</div> : null}
              {status ? <div className="app-alert-success mt-5">{status}</div> : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="app-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium text-white disabled:opacity-70"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save repayment presets"}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
