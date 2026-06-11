import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import useAuth from "../hooks/useAuth";
import { updateUserProfile } from "../services/userAuth";
import { normalizePhoneNumber, normalizeText } from "../utils/customerValidation";

function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function validateOptionalPhone(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const digits = normalizePhoneNumber(value);
  if (digits.length !== 10) {
    return "Phone number must be exactly 10 digits (or leave blank)";
  }
  return "";
}

export function ProfilePanel() {
  const { user, profile, setProfile } = useAuth();
  const [form, setForm] = useState({
    displayName: "",
    phone: "",
    location: "",
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  /** When true, ignore remote `profile` updates so auth refresh / Firestore reload does not wipe in-progress edits. */
  const [dirty, setDirty] = useState(false);
  const lastSyncedKey = useRef("");

  useEffect(() => {
    if (dirty) return;
    const key = [
      profile?.displayName ?? "",
      profile?.phone ?? "",
      profile?.location ?? "",
      profile?.email ?? "",
    ].join("|");
    if (key === lastSyncedKey.current && profile) return;
    lastSyncedKey.current = key;
    setForm({
      displayName: normalizeText(profile?.displayName || ""),
      phone: normalizePhoneNumber(profile?.phone || ""),
      location: normalizeText(profile?.location || ""),
    });
  }, [profile, dirty]);

  const updateField = (field) => (event) => {
    setDirty(true);
    setStatus("");
    setError("");
    let value = event.target.value;
    if (field === "phone") {
      value = value.replace(/\D/g, "").slice(0, 10);
    }
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (!user) return;

    const displayName = normalizeText(form.displayName);
    const phone = normalizePhoneNumber(form.phone);
    const location = normalizeText(form.location);

    if (!displayName) {
      setError("Display name is required");
      return;
    }

    const phoneErr = validateOptionalPhone(phone);
    if (phoneErr) {
      setError(phoneErr);
      return;
    }

    setSaving(true);
    setStatus("");
    setError("");

    try {
      const payload = { displayName, phone, location };
      const updatedProfile = await updateUserProfile(user.uid, payload);
      setProfile(updatedProfile);
      setForm({
        displayName: normalizeText(updatedProfile?.displayName || ""),
        phone: normalizePhoneNumber(updatedProfile?.phone || ""),
        location: normalizeText(updatedProfile?.location || ""),
      });
      lastSyncedKey.current = [
        updatedProfile?.displayName ?? "",
        updatedProfile?.phone ?? "",
        updatedProfile?.location ?? "",
        updatedProfile?.email ?? "",
      ].join("|");
      setDirty(false);
      setStatus("Profile updated successfully");
    } catch (submitError) {
      setError(submitError?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const identityItems = [
    { label: "Email", value: profile?.email || user?.email || "Not available", icon: Mail },
    { label: "Phone", value: profile?.phone || "Not set", icon: Phone },
    { label: "Location", value: profile?.location || "Not set", icon: MapPin },
    { label: "Role", value: profile?.role || "Not available", icon: ShieldCheck },
    { label: "Employee ID", value: profile?.employeeId || "Not assigned", icon: BadgeCheck },
    { label: "Created", value: formatDate(profile?.createdAt?.toDate?.() || profile?.createdAt), icon: UserRound },
  ];

  return (
    <div className="app-panel app-content-wrap w-full rounded-[26px] p-4 md:p-5">
      <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <div className="app-subsection p-6">
            <div className="grid gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Display name</span>
                <input
                  value={form.displayName}
                  onChange={updateField("displayName")}
                  className="app-input"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Phone</span>
                <input
                  value={form.phone}
                  onChange={updateField("phone")}
                  inputMode="numeric"
                  maxLength={10}
                  className="app-input"
                  placeholder="10 digits"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Location</span>
                <input
                  value={form.location}
                  onChange={updateField("location")}
                  className="app-input"
                  placeholder="Enter office or branch name"
                />
              </label>
            </div>

            {error ? (
              <div className="app-alert-error mt-4">
                {error}
              </div>
            ) : null}

            {status ? (
              <div className="app-alert-success mt-4">
                {status}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="app-button-primary mt-6 inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-white disabled:opacity-70"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save profile"}
            </button>
          </div>

          <div className="grid gap-3">
            {identityItems.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.label}
                  className="app-panel-muted flex items-center justify-between rounded-2xl px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-slate-900">{item.label}</span>
                  </div>
                  <span className="text-sm text-slate-600">{item.value}</span>
                </div>
              );
            })}
          </div>
      </div>
    </div>
  );
}

export default function Profile() {
  return (
    <AdminLayout>
      <ProfilePanel />
    </AdminLayout>
  );
}
