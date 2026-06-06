import { useState } from "react";
import { Phone, CheckCircle2 } from "lucide-react";
import { DAY_CENTER_LABELS, loadLoanCenters } from "../constants/dayCenters";
import { createCustomer } from "../services/userAuth";
import { validateIdentityNumber, validatePhoneNumber } from "../utils/customerValidation";
import { DocumentCompactAttach, DocumentPhotoTile } from "./DocumentUploadControls";

function loadCenters() {
  return loadLoanCenters();
}

export const customerCreateInitialForm = {
  customerName: "",
  mobileNumber: "",
  alternateNumber: "",
  identityType: "Aadhaar Card",
  identityNumber: "",
  address: "",
  griefId: "",
  idDocumentName: "",
  customerPhotoName: "",
  addressProofName: "",
  loanAgreementName: "",
  supportingDocumentNames: [],
  coApplicantName: "",
  coApplicantContact: "",
  coApplicantRelation: "",
  coApplicantAddress: "",
  coApplicantIdentityType: "Aadhaar Card",
  coApplicantIdentityNumber: "",
  coApplicantIdProofName: "",
  coApplicantPhotoName: "",
  selectedDay: "",
  selectedCenter: "",
};

/**
 * Embedded customer create wizard (same steps as standalone create).
 * @param {{ initialSelectedDay?: string, initialSelectedCenter?: string, onSuccess: () => void, onCancel?: () => void, showClose?: boolean }} props
 */
export default function CustomerCreateForm({
  initialSelectedDay = "",
  initialSelectedCenter = "",
  onSuccess,
  onCancel,
  showClose = false,
  singlePage = false,
}) {
  const [form, setForm] = useState(() => ({
    ...customerCreateInitialForm,
    selectedDay: initialSelectedDay,
    selectedCenter: initialSelectedCenter,
  }));
  const [error, setError] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [alternatePhoneError, setAlternatePhoneError] = useState("");
  const [coApplicantIdentityError, setCoApplicantIdentityError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [addCoApplicant, setAddCoApplicant] = useState(false);

  const allCenters = loadCenters();
  const dayOptions = DAY_CENTER_LABELS;
  const subOptions = form.selectedDay
    ? allCenters.filter((c) => c.parent === form.selectedDay).map((c) => c.label)
    : [];

  const updatePhone = (field, setErr) => (e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
    setForm((f) => ({ ...f, [field]: digits }));
    setErr(digits ? validatePhoneNumber(digits, field === "mobileNumber" ? "Phone number" : "Alternate number") : "");
  };

  const update = (field) => (e) => {
    const value = e.target.value;

    if (field === "selectedDay") {
      setForm((f) => ({ ...f, selectedDay: value, selectedCenter: "" }));
      return;
    }

    setForm((f) => ({ ...f, [field]: value }));

    if (field === "identityType" || field === "identityNumber") {
      const nextType = field === "identityType" ? value : form.identityType;
      const nextNumber = field === "identityNumber" ? value : form.identityNumber;
      setIdentityError(validateIdentityNumber(nextType, nextNumber));
    }

    if (field === "coApplicantIdentityType" || field === "coApplicantIdentityNumber") {
      const nextType = field === "coApplicantIdentityType" ? value : form.coApplicantIdentityType;
      const nextNumber = field === "coApplicantIdentityNumber" ? value : form.coApplicantIdentityNumber;
      setCoApplicantIdentityError(nextNumber ? validateIdentityNumber(nextType, nextNumber) : "");
    }

    if (field === "mobileNumber") {
      setPhoneError(validatePhoneNumber(value, "Phone number"));
    }

    if (field === "alternateNumber") {
      setAlternatePhoneError(value ? validatePhoneNumber(value, "Alternate number") : "");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!singlePage && step < 2) {
      setStep((current) => Math.min(current + 1, 2));
      return;
    }
    const nextIdentityError = validateIdentityNumber(form.identityType, form.identityNumber);
    const nextPhoneError = validatePhoneNumber(form.mobileNumber, "Phone number");
    const nextAlternateError = form.alternateNumber
      ? validatePhoneNumber(form.alternateNumber, "Alternate number")
      : "";
    const nextCoApplicantIdentityError = form.coApplicantIdentityNumber
      ? validateIdentityNumber(form.coApplicantIdentityType, form.coApplicantIdentityNumber)
      : "";
    setIdentityError(nextIdentityError);
    setPhoneError(nextPhoneError);
    setAlternatePhoneError(nextAlternateError);
    setCoApplicantIdentityError(nextCoApplicantIdentityError);

    if (!form.customerName || !form.mobileNumber || !form.identityNumber || !form.address) {
      setError("Please fill in all fields");
      return;
    }
    if (nextPhoneError || nextAlternateError || nextIdentityError || nextCoApplicantIdentityError) {
      setError("Fix the validation errors before creating the customer");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await createCustomer({
        customerName: form.customerName,
        mobileNumber: form.mobileNumber,
        alternateNumber: form.alternateNumber,
        identityType: form.identityType,
        identityNumber: form.identityNumber,
        address: form.address,
        griefId: form.griefId,
        idDocumentName: form.idDocumentName,
        customerPhotoName: form.customerPhotoName,
        addressProofName: form.addressProofName,
        loanAgreementName: form.loanAgreementName,
        supportingDocumentNames: form.supportingDocumentNames,
        coApplicantName: form.coApplicantName,
        coApplicantContact: form.coApplicantContact,
        coApplicantRelation: form.coApplicantRelation,
        coApplicantAddress: form.coApplicantAddress,
        coApplicantIdentityType: form.coApplicantIdentityType,
        coApplicantIdentityNumber: form.coApplicantIdentityNumber,
        coApplicantIdProofName: form.coApplicantIdProofName,
        coApplicantPhotoName: form.coApplicantPhotoName,
        selectedDay: form.selectedCenter || form.selectedDay || "",
      });
      setForm({ ...customerCreateInitialForm, selectedDay: initialSelectedDay, selectedCenter: initialSelectedCenter });
      setStep(0);
      setAddCoApplicant(false);
      onSuccess();
    } catch (err) {
      setError(err.message || "Unable to create customer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <UserRound className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-blue-600">New record</p>
            <h4 className="text-sm font-semibold text-slate-900">Create customer</h4>
          </div>
        </div>
        {showClose && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
            aria-label="Close create form"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {!singlePage ? (
        <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {["Primary", "Co + files", "Review"].map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(index)}
              className={`rounded-lg px-2 py-1.5 text-[10px] font-semibold transition sm:text-xs ${
                step === index ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/80 p-3">
          {singlePage ? (
            <div className="mb-3 grid gap-2.5 md:grid-cols-2">
              <DocumentPhotoTile
                label="Applicant photo"
                fileName={form.customerPhotoName}
                capture="user"
                onPick={(file) => setForm((current) => ({ ...current, customerPhotoName: file?.name || "" }))}
                onClear={() => setForm((current) => ({ ...current, customerPhotoName: "" }))}
                className="max-w-none"
              />
              <DocumentPhotoTile
                label="Co-applicant photo"
                fileName={form.coApplicantPhotoName}
                capture="user"
                onPick={(file) => {
                  const name = file?.name || "";
                  setForm((current) => ({ ...current, coApplicantPhotoName: name }));
                  if (name) setAddCoApplicant(true);
                }}
                onClear={() => setForm((current) => ({ ...current, coApplicantPhotoName: "" }))}
                className="max-w-none"
              />
            </div>
          ) : null}

          {(singlePage || step === 0) && (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-slate-700">Customer name</span>
                <input value={form.customerName} onChange={update("customerName")} className="app-input py-2 text-sm" placeholder="Full name" />
              </label>
              <label className="space-y-1">
                <span className="flex items-center gap-1 text-xs font-medium text-slate-700">
                  <Phone className="h-3.5 w-3.5 text-blue-600" />
                  Phone
                </span>
                <input
                  value={form.mobileNumber}
                  onChange={updatePhone("mobileNumber", setPhoneError)}
                  inputMode="numeric"
                  maxLength={10}
                  className="app-input py-2 text-sm"
                  placeholder="10-digit"
                />
                {phoneError ? <p className="text-[11px] text-rose-600">{phoneError}</p> : null}
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-700">Alternate</span>
                <input
                  value={form.alternateNumber}
                  onChange={updatePhone("alternateNumber", setAlternatePhoneError)}
                  inputMode="numeric"
                  maxLength={10}
                  className="app-input py-2 text-sm"
                  placeholder="Optional"
                />
                {alternatePhoneError ? <p className="text-[11px] text-rose-600">{alternatePhoneError}</p> : null}
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-700">Identity type</span>
                <div className="app-input bg-slate-100 py-2 text-sm text-slate-700">Aadhaar Card</div>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-700">Identity number</span>
                <input
                  value={form.identityNumber}
                  onChange={update("identityNumber")}
                  onBlur={() => setIdentityError(validateIdentityNumber(form.identityType, form.identityNumber))}
                  className="app-input py-2 text-sm"
                  placeholder="Card number"
                />
                {identityError ? <p className="text-[11px] text-rose-600">{identityError}</p> : null}
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-700">Day center</span>
                <select value={form.selectedDay} onChange={update("selectedDay")} className="app-select py-2 text-sm">
                  <option value="">Select day</option>
                  {dayOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-700">Sub center</span>
                <select
                  value={form.selectedCenter}
                  onChange={update("selectedCenter")}
                  disabled={!form.selectedDay || subOptions.length === 0}
                  className="app-select py-2 text-sm disabled:opacity-50"
                >
                  <option value="">
                    {!form.selectedDay ? "Select day first" : subOptions.length === 0 ? "None" : "Sub-center"}
                  </option>
                  {subOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-slate-700">Address</span>
                <textarea value={form.address} onChange={update("address")} rows={2} className="app-textarea text-sm" placeholder="Full address" />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-slate-700">Grief ID</span>
                <input value={form.griefId} onChange={update("griefId")} className="app-input py-2 text-sm" placeholder="If applicable" />
              </label>
            </div>
          )}

          {(singlePage || step === 1) && (
            <div className="grid gap-3 md:grid-cols-2">
              <DocumentCompactAttach
                label="ID proof"
                value={form.idDocumentName}
                accept=".pdf,.jpg,.jpeg,.png,image/*"
                capture="environment"
                onPick={(file) => setForm((c) => ({ ...c, idDocumentName: file?.name || "" }))}
                onClear={() => setForm((c) => ({ ...c, idDocumentName: "" }))}
              />
              <DocumentPhotoTile
                label="Applicant photo"
                fileName={form.customerPhotoName}
                capture="user"
                onPick={(file) => setForm((c) => ({ ...c, customerPhotoName: file?.name || "" }))}
                onClear={() => setForm((c) => ({ ...c, customerPhotoName: "" }))}
                className="max-w-none"
              />
              <DocumentCompactAttach
                label="Address proof"
                value={form.addressProofName}
                accept=".pdf,.jpg,.jpeg,.png,image/*"
                capture="environment"
                onPick={(file) => setForm((c) => ({ ...c, addressProofName: file?.name || "" }))}
                onClear={() => setForm((c) => ({ ...c, addressProofName: "" }))}
              />
              <DocumentCompactAttach
                label="Loan agreement"
                value={form.loanAgreementName}
                accept=".pdf,.jpg,.jpeg,.png,image/*"
                capture="environment"
                onPick={(file) => setForm((c) => ({ ...c, loanAgreementName: file?.name || "" }))}
                onClear={() => setForm((c) => ({ ...c, loanAgreementName: "" }))}
              />
              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-2.5">
                <button
                  type="button"
                  onClick={() => setAddCoApplicant((current) => !current)}
                  className={`inline-flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                    addCoApplicant
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  {addCoApplicant ? "Co-applicant section enabled" : "Add co-applicant (optional)"}
                </button>
              </div>

              {addCoApplicant ? (
                <>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-slate-700">Co-person name</span>
                    <input value={form.coApplicantName} onChange={update("coApplicantName")} className="app-input py-2 text-sm" placeholder="Optional" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-700">Co contact</span>
                    <input value={form.coApplicantContact} onChange={update("coApplicantContact")} inputMode="numeric" className="app-input py-2 text-sm" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-700">Relationship</span>
                    <input value={form.coApplicantRelation} onChange={update("coApplicantRelation")} className="app-input py-2 text-sm" />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-slate-700">Co address</span>
                    <textarea value={form.coApplicantAddress} onChange={update("coApplicantAddress")} rows={2} className="app-textarea text-sm" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-700">Co ID type</span>
                    <select value={form.coApplicantIdentityType} onChange={update("coApplicantIdentityType")} className="app-select bg-slate-50 py-2 text-sm">
                      <option>Aadhaar Card</option>
                      <option>Voter ID</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-700">Co ID number</span>
                    <input
                      value={form.coApplicantIdentityNumber}
                      onChange={update("coApplicantIdentityNumber")}
                      onBlur={() =>
                        setCoApplicantIdentityError(
                          form.coApplicantIdentityNumber
                            ? validateIdentityNumber(form.coApplicantIdentityType, form.coApplicantIdentityNumber)
                            : ""
                        )
                      }
                      className="app-input bg-slate-50 py-2 text-sm"
                    />
                    {coApplicantIdentityError ? <p className="text-[11px] text-rose-600">{coApplicantIdentityError}</p> : null}
                  </label>
                  <DocumentCompactAttach
                    label="Co ID proof"
                    value={form.coApplicantIdProofName}
                    accept=".pdf,.jpg,.jpeg,.png,image/*"
                    capture="environment"
                    onPick={(file) => setForm((c) => ({ ...c, coApplicantIdProofName: file?.name || "" }))}
                    onClear={() => setForm((c) => ({ ...c, coApplicantIdProofName: "" }))}
                  />
                  <DocumentPhotoTile
                    label="Co photo"
                    fileName={form.coApplicantPhotoName}
                    capture="user"
                    onPick={(file) => setForm((c) => ({ ...c, coApplicantPhotoName: file?.name || "" }))}
                    onClear={() => setForm((c) => ({ ...c, coApplicantPhotoName: "" }))}
                    className="max-w-none"
                  />
                </>
              ) : null}
            </div>
          )}

          {!singlePage && step === 2 && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Primary</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{form.customerName || "—"}</p>
                <p className="text-xs text-slate-600">
                  {form.mobileNumber || "—"} · {form.selectedCenter || form.selectedDay || "No center"}
                </p>
                <p className="mt-2 text-xs text-slate-600">{form.address || "—"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Co-applicant</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{form.coApplicantName || "Optional"}</p>
                <p className="text-xs text-slate-600">
                  {form.coApplicantContact || "—"} · {form.coApplicantRelation || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 md:col-span-2">
                <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Documents</p>
                <div className="mt-2 grid gap-1 text-xs text-slate-700 md:grid-cols-2">
                  <span>ID: {form.idDocumentName || "—"}</span>
                  <span>Photo: {form.customerPhotoName || "—"}</span>
                  <span>Address: {form.addressProofName || "—"}</span>
                  <span>Agreement: {form.loanAgreementName || "—"}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {error ? <div className="app-alert-error mt-2 py-2 text-xs">{error}</div> : null}

        <div className="mt-2 flex shrink-0 gap-2">
          {singlePage ? (
            <>
              {onCancel ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="app-button-secondary flex-1 rounded-xl py-2.5 text-sm"
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="submit"
                disabled={loading}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-70"
              >
                <CheckCircle2 className="h-4 w-4" />
                {loading ? "Saving…" : "Create customer"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(s - 1, 0))}
                disabled={step === 0}
                className="app-button-secondary flex-1 rounded-xl py-2.5 text-sm disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-70"
              >
                <CheckCircle2 className="h-4 w-4" />
                {step < 2 ? "Continue" : loading ? "Saving…" : "Create"}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
