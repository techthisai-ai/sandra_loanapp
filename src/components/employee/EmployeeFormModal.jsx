import { useEffect, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { getNextEmployeeId } from "../../services/userAuth";
import { normalizePhoneNumber, normalizeText } from "../../utils/customerValidation";
import {
  normalizeUsername,
  validateAadhaarNumber,
  validateEmployeePhone,
} from "../../utils/employeeManagement";

export const EMPTY_EMPLOYEE_FORM = {
  employeeId: "",
  employeeName: "",
  employeeSecondName: "",
  aadhaarNumber: "",
  mobileNumber: "",
  username: "",
  password: "",
  confirmPassword: "",
  assignedCenters: [],
  status: "active",
};

function cloneInitialValues(values = EMPTY_EMPLOYEE_FORM, mode = "add") {
  const storedPassword = mode === "edit" ? String(values.password || "") : "";
  return {
    ...EMPTY_EMPLOYEE_FORM,
    ...values,
    assignedCenters: [...(values.assignedCenters || [])],
    password: storedPassword,
    confirmPassword: storedPassword,
  };
}

/** Forces the EMP prefix and limits to exactly 3 trailing digits (e.g. EMP001). */
function formatEmployeeIdInput(value) {
  const upper = String(value || "").toUpperCase();
  const digits = upper.replace(/^E?M?P?/, "").replace(/\D/g, "").slice(0, 3);
  return digits ? `EMP${digits}` : "";
}

const EMPLOYEE_ID_PATTERN = /^EMP\d{3}$/;

function validateForm(values, mode) {
  if (mode === "edit") {
    if (!normalizeText(values.employeeId)) return "Employee ID is required.";
    if (!EMPLOYEE_ID_PATTERN.test(String(values.employeeId).toUpperCase())) {
      return "Employee ID must be in the format EMP001.";
    }
  }
  if (!normalizeText(values.employeeName)) return "Employee name is required.";
  const aadhaarError = validateAadhaarNumber(values.aadhaarNumber);
  if (aadhaarError) return aadhaarError;
  const phoneError = validateEmployeePhone(values.mobileNumber);
  if (phoneError) return phoneError;
  if (!normalizeText(values.username)) return "Username is required.";
  if (mode === "add") {
    if (!values.password || values.password.length < 6) return "Password must be at least 6 characters.";
    if (values.password !== values.confirmPassword) return "Password and confirm password must match.";
  } else if (values.password) {
    if (values.password.length < 6) return "Password must be at least 6 characters.";
    if (values.password !== values.confirmPassword) return "Password and confirm password must match.";
  }
  return "";
}

export default function EmployeeFormModal({
  open,
  mode = "add",
  initialValues = EMPTY_EMPLOYEE_FORM,
  saving = false,
  error = "",
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() => cloneInitialValues(initialValues, mode));
  const [localError, setLocalError] = useState("");
  const [employeeIdLoading, setEmployeeIdLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isEdit = mode === "edit";

  useEffect(() => {
    if (!open) return;
    setForm(cloneInitialValues(initialValues, mode));
    setLocalError("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [open, mode, initialValues.employeeId, initialValues.username, initialValues.password]);

  useEffect(() => {
    if (!open || isEdit) return;
    let active = true;
    setEmployeeIdLoading(true);
    getNextEmployeeId()
      .then((nextId) => {
        if (!active) return;
        setForm((current) => ({ ...current, employeeId: nextId }));
      })
      .catch(() => {
        if (!active) return;
        setForm((current) => ({ ...current, employeeId: "" }));
      })
      .finally(() => {
        if (active) setEmployeeIdLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, isEdit]);

  if (!open) return null;

  const updateField = (field) => (event) => {
    setLocalError("");
    let value = event.target.value;
    if (field === "username") {
      value = value.toLowerCase().replace(/\s+/g, "");
    } else if (field === "employeeId") {
      value = formatEmployeeIdInput(value);
    }
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateForm(form, mode);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    await onSubmit({
      ...form,
      employeeId: String(form.employeeId || "").trim().toUpperCase(),
      mobileNumber: normalizePhoneNumber(form.mobileNumber),
      aadhaarNumber: String(form.aadhaarNumber || "").replace(/\D/g, ""),
      username: normalizeUsername(form.username),
    });
  };

  const displayError = localError || error;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow)]"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600">
              {isEdit ? "Edit employee" : "Add employee"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Employee name</span>
              <input value={form.employeeName} onChange={updateField("employeeName")} className="app-input" required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Employee second name</span>
              <input
                value={form.employeeSecondName}
                onChange={updateField("employeeSecondName")}
                className="app-input"
                placeholder="Optional"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Employee ID</span>
              <input
                value={employeeIdLoading && !isEdit ? "Generating…" : form.employeeId}
                onChange={updateField("employeeId")}
                className="app-input uppercase tracking-wide"
                placeholder={isEdit ? "e.g. EMP001" : "Auto-generated"}
                maxLength={6}
                inputMode="numeric"
                readOnly={!isEdit}
                required={isEdit}
              />
              <span className="text-xs text-slate-500">
                {isEdit
                  ? "Format EMP001 (3 digits). Must stay unique."
                  : "Auto-generated as EMP001, EMP002, EMP003…"}
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Aadhaar number</span>
              <input
                value={form.aadhaarNumber}
                onChange={updateField("aadhaarNumber")}
                className="app-input"
                inputMode="numeric"
                maxLength={12}
                placeholder="12 digits"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Mobile number</span>
              <div className="flex gap-2">
                <span className="inline-flex items-center rounded-2xl border border-slate-200 bg-slate-100 px-3 text-sm font-medium text-slate-700">
                  +91
                </span>
                <input
                  value={form.mobileNumber}
                  onChange={updateField("mobileNumber")}
                  className="app-input min-w-0 flex-1"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10 digits"
                  required
                />
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Username</span>
              <input
                type="text"
                id="employee-form-username"
                value={form.username}
                onChange={updateField("username")}
                className="app-input"
                placeholder="e.g. ravi_kumar"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              {isEdit ? (
                <span className="text-xs text-slate-500">
                  Changing the username also changes the employee login.
                </span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</span>
              <select value={form.status} onChange={updateField("status")} className="app-select">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Password</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={updateField("password")}
                  className="app-input !pr-11"
                  placeholder={isEdit ? (form.password ? "" : "No password saved yet") : "Create password"}
                  autoComplete={isEdit ? "off" : "new-password"}
                  required={!isEdit}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 transition hover:text-slate-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Confirm password</span>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={updateField("confirmPassword")}
                  className="app-input !pr-11"
                  placeholder="Confirm password"
                  autoComplete={isEdit ? "off" : "new-password"}
                  required={!isEdit || Boolean(form.password)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 transition hover:text-slate-700"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
          </div>

          {!isEdit ? (
            <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">
              Assign centers after creating the employee, using the "Assign centers" action on the employee row.
            </p>
          ) : null}

          {displayError ? <div className="app-alert-error mt-4">{displayError}</div> : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="app-button-secondary rounded-2xl px-5 py-2.5 text-sm font-medium">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
