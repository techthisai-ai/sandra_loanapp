import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Phone, ShieldAlert } from "lucide-react";
import { createCustomer } from "../services/userAuth";
import { fetchDemoCrifEligibility } from "../services/crifEligibilityDemo";
import { DocumentCompactAttach, DocumentPhotoTile } from "./DocumentUploadControls";
import PhoneOtpVerificationModal from "./PhoneOtpVerificationModal";
import {
  IDENTITY_TYPE_OPTIONS,
  coerceIdentityType,
  safeValidateIdentityNumber,
  validatePhoneNumber,
} from "../utils/customerValidation";
import { DAY_CENTER_LABELS, loadLoanCenters } from "../constants/dayCenters";

function loadCenters() {
  return loadLoanCenters();
}

export default function CustomerCreateProfessionalForm({
  initialSelectedDay = "",
  initialSelectedCenter = "",
  initialData = null,
  onSubmitForm,
  onSuccess,
  onCancel,
  submitLabel = "Create customer",
}) {
  const buildInitialForm = () => ({
    customerName: "",
    mobileNumber: "",
    alternateNumber: "",
    identityType: "Aadhaar Card",
    identityNumber: "",
    address: "",
    idDocumentName: "",
    customerPhotoName: "",
    customerPhotoDataUrl: "",
    addressProofName: "",
    loanAgreementName: "",
    coApplicantName: "",
    coApplicantContact: "",
    coApplicantRelation: "",
    coApplicantAddress: "",
    coApplicantIdentityType: "Aadhaar Card",
    coApplicantIdentityNumber: "",
    coApplicantIdProofName: "",
    coApplicantPhotoName: "",
    coApplicantPhotoDataUrl: "",
    selectedDay: initialSelectedDay,
    selectedCenter: initialSelectedCenter,
  });
  const [form, setForm] = useState(buildInitialForm);
  const [crifDemoResult, setCrifDemoResult] = useState(null);
  const [lastEligibilityCheckedAt, setLastEligibilityCheckedAt] = useState(null);
  const [crifCheckLoading, setCrifCheckLoading] = useState(false);
  const [crifModalOpen, setCrifModalOpen] = useState(false);
  const [crifPrecheckError, setCrifPrecheckError] = useState("");
  const [applicantPhotoPreview, setApplicantPhotoPreview] = useState("");
  const [coApplicantPhotoPreview, setCoApplicantPhotoPreview] = useState("");
  const [attachmentUrls, setAttachmentUrls] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [alternatePhoneError, setAlternatePhoneError] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [coApplicantIdentityError, setCoApplicantIdentityError] = useState("");
  const [primaryPhoneVerified, setPrimaryPhoneVerified] = useState(false);
  const [verifiedAtPhone, setVerifiedAtPhone] = useState("");
  const [otpModalOpen, setOtpModalOpen] = useState(false);

  useEffect(() => {
    if (!initialData) return;
    setForm((current) => ({
      ...current,
      customerName: initialData.customerName || "",
      mobileNumber: initialData.mobileNumber || "",
      alternateNumber: initialData.alternateNumber || "",
      identityType: coerceIdentityType(initialData.identityType),
      identityNumber: initialData.identityNumber || "",
      address: initialData.address || "",
      idDocumentName: initialData.idDocumentName || "",
      customerPhotoName: initialData.customerPhotoName || "",
      customerPhotoDataUrl: initialData.customerPhotoDataUrl || "",
      addressProofName: initialData.addressProofName || "",
      loanAgreementName: initialData.loanAgreementName || "",
      coApplicantName: initialData.coApplicantName || "",
      coApplicantContact: initialData.coApplicantContact || "",
      coApplicantRelation: initialData.coApplicantRelation || "",
      coApplicantAddress: initialData.coApplicantAddress || "",
      coApplicantIdentityType: coerceIdentityType(initialData.coApplicantIdentityType),
      coApplicantIdentityNumber: initialData.coApplicantIdentityNumber || "",
      coApplicantIdProofName: initialData.coApplicantIdProofName || "",
      coApplicantPhotoName: initialData.coApplicantPhotoName || "",
      coApplicantPhotoDataUrl: initialData.coApplicantPhotoDataUrl || "",
      selectedDay: initialData.selectedDay || initialSelectedDay || "",
      selectedCenter: initialData.selectedCenter || "",
    }));
    setApplicantPhotoPreview(initialData.customerPhotoDataUrl || "");
    setCoApplicantPhotoPreview(initialData.coApplicantPhotoDataUrl || "");
    if (initialData.crifDemoEligibility && typeof initialData.crifDemoEligibility === "object") {
      setCrifDemoResult(initialData.crifDemoEligibility);
      setLastEligibilityCheckedAt(initialData.lastEligibilityCheckedAt || initialData.crifDemoEligibility.checkedAt || null);
    } else {
      setCrifDemoResult(null);
      setLastEligibilityCheckedAt(null);
    }
  }, [initialData, initialSelectedDay]);

  useEffect(() => {
    if (!initialData) return;
    setPrimaryPhoneVerified(true);
    setVerifiedAtPhone(String(initialData.mobileNumber || "").replace(/\D/g, "").slice(0, 10));
  }, [initialData]);

  useEffect(() => {
    if (initialData) return;
    const d = String(form.mobileNumber || "").replace(/\D/g, "");
    if (!d || !verifiedAtPhone) return;
    if (d !== verifiedAtPhone) {
      setPrimaryPhoneVerified(false);
    }
  }, [form.mobileNumber, verifiedAtPhone, initialData]);

  const allCenters = useMemo(() => loadCenters(), []);
  const requirePhoneOtp = !initialData;
  const submitBlockedByOtp = requirePhoneOtp && !primaryPhoneVerified;
  const phoneDigitsOk = form.mobileNumber.length === 10 && !phoneError;
  const canOpenOtp = requirePhoneOtp && !primaryPhoneVerified && phoneDigitsOk;
  const dayOptions = DAY_CENTER_LABELS;
  const subOptions = form.selectedDay
    ? allCenters.filter((c) => c.parent === form.selectedDay).map((c) => c.label)
    : [];

  const update = (field) => (event) => {
    const value = event?.target?.value ?? "";
    if (field === "selectedDay") {
      setForm((current) => ({ ...current, selectedDay: value, selectedCenter: "" }));
      return;
    }
    if (field === "identityType" || field === "identityNumber") {
      let nextSnapshot = null;
      setForm((current) => {
        const next = { ...current, [field]: value };
        nextSnapshot = next;
        return next;
      });
      if (nextSnapshot) {
        const err = nextSnapshot.identityNumber
          ? safeValidateIdentityNumber(nextSnapshot.identityType, nextSnapshot.identityNumber)
          : "";
        setIdentityError(err);
      }
      setCrifPrecheckError("");
      return;
    }
    setForm((current) => ({ ...current, [field]: value }));
  };

  const runDemoCrifCheck = useCallback(async () => {
    const idErr = safeValidateIdentityNumber(form.identityType, form.identityNumber);
    const altErr = validatePhoneNumber(form.alternateNumber, "Alternate number");
    if (idErr || altErr) {
      setIdentityError(idErr);
      setAlternatePhoneError(altErr);
      setCrifPrecheckError("Enter a valid identity number and a 10-digit alternate number before checking eligibility.");
      return;
    }
    setCrifPrecheckError("");
    setIdentityError("");
    setAlternatePhoneError("");
    setCrifCheckLoading(true);
    try {
      const result = await fetchDemoCrifEligibility(
        { identityNumber: form.identityNumber, customerName: form.customerName },
        { minDelayMs: 700 }
      );
      setCrifDemoResult(result);
      setLastEligibilityCheckedAt(result.checkedAt);
      setCrifModalOpen(true);
    } finally {
      setCrifCheckLoading(false);
    }
  }, [form.alternateNumber, form.customerName, form.identityNumber, form.identityType]);

  const crifTierStyles = useMemo(() => {
    const tier = crifDemoResult?.creditTier;
    if (tier === "Excellent") {
      return {
        ring: "ring-emerald-200/80",
        border: "border-emerald-300",
        bg: "from-emerald-50/90 to-white",
        accent: "text-emerald-800",
        badge: "bg-emerald-600 text-white",
      };
    }
    if (tier === "Good") {
      return {
        ring: "ring-amber-200/80",
        border: "border-amber-300",
        bg: "from-amber-50/90 to-white",
        accent: "text-amber-900",
        badge: "bg-amber-500 text-white",
      };
    }
    if (tier === "Risky") {
      return {
        ring: "ring-rose-200/80",
        border: "border-rose-300",
        bg: "from-rose-50/90 to-white",
        accent: "text-rose-900",
        badge: "bg-rose-600 text-white",
      };
    }
    return {
      ring: "ring-slate-200/80",
      border: "border-slate-200",
      bg: "from-slate-50 to-white",
      accent: "text-slate-800",
      badge: "bg-slate-700 text-white",
    };
  }, [crifDemoResult?.creditTier]);

  const updatePhone = (field, setErr) => (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 10);
    setForm((current) => ({ ...current, [field]: digits }));
    setErr(digits ? validatePhoneNumber(digits, field === "mobileNumber" ? "Phone number" : "Alternate number") : "");
    if (field === "alternateNumber") setCrifPrecheckError("");
  };

  const pickNamedFile = (field, previewSetter, dataField = "") => (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAttachmentUrls((current) => {
      const previous = current[field];
      if (previous) URL.revokeObjectURL(previous);
      return { ...current, [field]: url };
    });
    setForm((current) => ({ ...current, [field]: file.name || "" }));
    if (previewSetter) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        previewSetter(dataUrl);
        if (dataField) {
          setForm((current) => ({ ...current, [dataField]: dataUrl }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const clearAttachment = (field, previewSetter, dataField = "") => {
    setForm((current) => ({ ...current, [field]: "" }));
    if (dataField) {
      setForm((current) => ({ ...current, [dataField]: "" }));
    }
    if (previewSetter) previewSetter("");
    setAttachmentUrls((current) => {
      const existing = current[field];
      if (existing) URL.revokeObjectURL(existing);
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  useEffect(() => {
    return () => {
      Object.values(attachmentUrls).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [attachmentUrls]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const hasCoApplicantData = Boolean(
      form.coApplicantName ||
        form.coApplicantContact ||
        form.coApplicantAddress ||
        form.coApplicantRelation ||
        form.coApplicantIdentityNumber ||
        form.coApplicantIdProofName ||
        form.coApplicantPhotoName
    );
    const useCoApplicant = hasCoApplicantData;
    const nextIdentityError = safeValidateIdentityNumber(form.identityType, form.identityNumber);
    const nextPhoneError = validatePhoneNumber(form.mobileNumber, "Phone number");
    const nextAlternateError = form.alternateNumber ? validatePhoneNumber(form.alternateNumber, "Alternate number") : "";
    const nextCoIdentityError =
      useCoApplicant && form.coApplicantIdentityNumber
        ? safeValidateIdentityNumber(form.coApplicantIdentityType, form.coApplicantIdentityNumber)
        : "";

    setIdentityError(nextIdentityError);
    setPhoneError(nextPhoneError);
    setAlternatePhoneError(nextAlternateError);
    setCoApplicantIdentityError(nextCoIdentityError);

    if (!form.customerName || !form.mobileNumber || !form.identityNumber || !form.address) {
      setError("Please fill applicant required fields.");
      return;
    }
    if (submitBlockedByOtp) {
      setError("Please verify mobile number before submitting.");
      return;
    }
    if (nextIdentityError || nextPhoneError || nextAlternateError || nextCoIdentityError) {
      setError("Please fix validation errors.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const payload = {
        ...form,
        selectedDay: form.selectedCenter || form.selectedDay || "",
        coApplicantName: useCoApplicant ? form.coApplicantName : "",
        coApplicantContact: useCoApplicant ? form.coApplicantContact : "",
        coApplicantRelation: useCoApplicant ? form.coApplicantRelation : "",
        coApplicantAddress: useCoApplicant ? form.coApplicantAddress : "",
        coApplicantIdentityType: useCoApplicant ? form.coApplicantIdentityType : "Aadhaar Card",
        coApplicantIdentityNumber: useCoApplicant ? form.coApplicantIdentityNumber : "",
        coApplicantIdProofName: useCoApplicant ? form.coApplicantIdProofName : "",
        coApplicantPhotoName: useCoApplicant ? form.coApplicantPhotoName : "",
        customerPhotoDataUrl: form.customerPhotoDataUrl || "",
        coApplicantPhotoDataUrl: useCoApplicant ? form.coApplicantPhotoDataUrl || "" : "",
        ...(crifDemoResult
          ? {
              crifDemoEligibility: crifDemoResult,
              lastEligibilityCheckedAt: lastEligibilityCheckedAt || crifDemoResult.checkedAt || "",
            }
          : {}),
      };
      if (onSubmitForm) {
        await onSubmitForm(payload);
      } else {
        await createCustomer(payload);
      }
      onSuccess?.();
    } catch (submitError) {
      setError(submitError.message || "Unable to create customer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="flex h-full min-h-0 flex-col gap-2" onSubmit={handleSubmit}>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-1.5">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Applicant photo</p>
          <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_156px]">
            <div className="min-w-0 space-y-1">
              <input
                value={form.customerName}
                onChange={update("customerName")}
                className="app-input w-full max-w-[320px] py-1.5 text-xs disabled:opacity-55"
                placeholder="Applicant name"
              />
              <div className="flex max-w-[320px] flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                <input
                  value={form.mobileNumber}
                  onChange={updatePhone("mobileNumber", setPhoneError)}
                  inputMode="numeric"
                  maxLength={10}
                  className="app-input min-w-0 flex-1 py-1.5 text-xs"
                  placeholder="Phone"
                />
                {requirePhoneOtp ? (
                  <div className="flex shrink-0 flex-col gap-1 sm:min-w-[148px]">
                    {canOpenOtp ? (
                      <button
                        type="button"
                        onClick={() => setOtpModalOpen(true)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-gradient-to-r from-teal-600 to-cyan-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm transition hover:shadow-md hover:brightness-105"
                      >
                        <Phone className="h-3.5 w-3.5" aria-hidden />
                        Verify OTP
                      </button>
                    ) : null}
                    {primaryPhoneVerified ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-900 shadow-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                        Verified
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <textarea
                value={form.address}
                onChange={update("address")}
                rows={2}
                className="app-textarea w-full text-xs disabled:opacity-55"
                placeholder="Full address"
              />
              {phoneError ? <p className="text-[11px] text-rose-600">{phoneError}</p> : null}
            </div>
            <DocumentPhotoTile
              label="Applicant photo"
              preview={applicantPhotoPreview}
              fileName={form.customerPhotoName}
              capture="user"
              onPick={pickNamedFile("customerPhotoName", setApplicantPhotoPreview, "customerPhotoDataUrl")}
              onClear={() => clearAttachment("customerPhotoName", setApplicantPhotoPreview, "customerPhotoDataUrl")}
              className="max-w-[156px] justify-self-end"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Co-applicant photo</p>
          </div>
          <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_156px]">
            <div className="min-w-0 space-y-1">
              <input
                value={form.coApplicantName}
                onChange={update("coApplicantName")}
                className="app-input w-full max-w-[320px] py-1.5 text-xs disabled:opacity-55"
                placeholder="Co-applicant name"
              />
              <input
                value={form.coApplicantContact}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    coApplicantContact: event.target.value.replace(/\D/g, "").slice(0, 10),
                  }))
                }
                inputMode="numeric"
                maxLength={10}
                className="app-input w-full max-w-[320px] py-1.5 text-xs disabled:opacity-55"
                placeholder="Co phone"
              />
              <textarea
                value={form.coApplicantAddress}
                onChange={update("coApplicantAddress")}
                rows={2}
                className="app-textarea w-full text-xs disabled:opacity-55"
                placeholder="Co-applicant address"
              />
            </div>
            <DocumentPhotoTile
              label="Co-applicant photo"
              preview={coApplicantPhotoPreview}
              fileName={form.coApplicantPhotoName}
              capture="user"
              onPick={pickNamedFile("coApplicantPhotoName", setCoApplicantPhotoPreview, "coApplicantPhotoDataUrl")}
              onClear={() => clearAttachment("coApplicantPhotoName", setCoApplicantPhotoPreview, "coApplicantPhotoDataUrl")}
              className="max-w-[156px] justify-self-end"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600">Applicant details</p>
          <div className="flex flex-col gap-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="customer-identity-type" className="block text-xs font-medium text-slate-700">
                  Identity type
                </label>
                <select
                  id="customer-identity-type"
                  name="identityType"
                  value={form.identityType}
                  onChange={update("identityType")}
                  className="app-select w-full py-2 text-xs transition-shadow hover:shadow-sm disabled:opacity-55"
                >
                  {IDENTITY_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="customer-identity-number" className="block text-xs font-medium text-slate-700">
                  Identity number
                </label>
                <input
                  id="customer-identity-number"
                  name="identityNumber"
                  value={form.identityNumber}
                  onChange={update("identityNumber")}
                  onBlur={() =>
                    setIdentityError(safeValidateIdentityNumber(form.identityType, form.identityNumber))
                  }
                  className="app-input py-2 text-xs transition-shadow hover:shadow-sm disabled:opacity-55"
                  placeholder="Card number"
                />
                {identityError ? <p className="text-[11px] text-rose-600">{identityError}</p> : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Alternate number</span>
                <p className="text-[10px] leading-snug text-slate-500">10 digits required before Check Eligibility.</p>
                <input
                  value={form.alternateNumber}
                  onChange={updatePhone("alternateNumber", setAlternatePhoneError)}
                  inputMode="numeric"
                  maxLength={10}
                  className="app-input py-2 text-xs transition-shadow hover:shadow-sm disabled:opacity-55"
                  placeholder="10-digit alternate mobile"
                />
                {alternatePhoneError ? <p className="text-[11px] text-rose-600">{alternatePhoneError}</p> : null}
              </label>
              <div className="flex flex-col gap-1 sm:items-end">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:text-right">Eligibility</span>
                <button
                  type="button"
                  onClick={runDemoCrifCheck}
                  disabled={crifCheckLoading}
                  className="app-button-primary w-full px-4 py-2.5 text-xs font-semibold shadow-sm transition hover:shadow-md disabled:opacity-60 sm:w-auto sm:min-w-[168px]"
                >
                  {crifCheckLoading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Checking…
                    </span>
                  ) : (
                    "Check Eligibility"
                  )}
                </button>
              </div>
            </div>

            {crifPrecheckError ? <p className="text-center text-[11px] font-medium text-rose-600 sm:text-left">{crifPrecheckError}</p> : null}

            <div className="space-y-4 border-t border-slate-200 pt-6">
              <div className="flex w-full max-w-3xl flex-col items-center gap-3 sm:mx-auto sm:flex-row sm:flex-wrap sm:justify-center">
                <button
                  type="button"
                  onClick={runDemoCrifCheck}
                  disabled={crifCheckLoading || !lastEligibilityCheckedAt}
                  className="app-button-secondary w-full px-4 py-2 text-xs font-semibold shadow-sm transition hover:shadow-md disabled:opacity-50 sm:w-auto"
                >
                  Recheck Eligibility
                </button>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600 shadow-sm"
                  title="Simulated data for demos only. No paid CRIF API."
                >
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                  Demo mode
                </span>
              </div>

              {crifDemoResult ? (
                <button
                  type="button"
                  onClick={() => setCrifModalOpen(true)}
                  className={`group w-full max-w-3xl rounded-2xl border bg-gradient-to-br px-4 py-4 text-left shadow-md ring-1 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:mx-auto disabled:pointer-events-none disabled:opacity-50 ${crifTierStyles.border} ${crifTierStyles.ring} ${crifTierStyles.bg}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className={`text-base font-bold ${crifTierStyles.accent}`}>Credit score: {crifDemoResult.creditScore}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${crifTierStyles.badge}`}>
                      {crifDemoResult.creditTier}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-800">
                    Eligibility: <span className="font-semibold">{crifDemoResult.eligibilityStatus}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-800">
                    Suggested loan: <span className="font-semibold">{crifDemoResult.suggestedLoanDisplay}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-800">
                    Risk: <span className="font-semibold">{crifDemoResult.riskLevel}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Last checked:{" "}
                    <span className="font-medium text-slate-800">
                      {new Date(crifDemoResult.checkedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </p>
                  <p className="mt-2 text-[11px] text-slate-500 transition group-hover:text-slate-700">Tap for full report</p>
                </button>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-700">Day center</span>
                <select value={form.selectedDay} onChange={update("selectedDay")}  className="app-select py-1.5 text-xs disabled:opacity-55">
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
                <select value={form.selectedCenter} onChange={update("selectedCenter")} disabled={!form.selectedDay || subOptions.length === 0} className="app-select py-1.5 text-xs disabled:opacity-50">
                  <option value="">{!form.selectedDay ? "Select day first" : subOptions.length === 0 ? "None" : "Sub-center"}</option>
                  {subOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <DocumentCompactAttach label="ID proof" value={form.idDocumentName} url={attachmentUrls.idDocumentName} accept=".pdf,.jpg,.jpeg,.png,image/*" capture="environment" onPick={pickNamedFile("idDocumentName")} onClear={() => clearAttachment("idDocumentName")} />
              <DocumentCompactAttach label="Address proof" value={form.addressProofName} url={attachmentUrls.addressProofName} accept=".pdf,.jpg,.jpeg,.png,image/*" capture="environment" onPick={pickNamedFile("addressProofName")} onClear={() => clearAttachment("addressProofName")} />
              <DocumentCompactAttach label="Loan agreement" value={form.loanAgreementName} url={attachmentUrls.loanAgreementName} accept=".pdf,.jpg,.jpeg,.png,image/*" capture="environment" onPick={pickNamedFile("loanAgreementName")} onClear={() => clearAttachment("loanAgreementName")} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-2">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600">Co-applicant details</p>
            <div className="grid gap-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="co-applicant-identity-type" className="block text-xs font-medium text-slate-700">
                    Co ID type
                  </label>
                  <select
                    id="co-applicant-identity-type"
                    name="coApplicantIdentityType"
                    value={form.coApplicantIdentityType}
                    onChange={update("coApplicantIdentityType")}
                    className="app-select py-1.5 text-xs"
                  >
                    {IDENTITY_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-700">Co ID number</span>
                  <input
                    value={form.coApplicantIdentityNumber}
                    onChange={update("coApplicantIdentityNumber")}
                    onBlur={() =>
                      setCoApplicantIdentityError(
                        form.coApplicantIdentityNumber
                          ? safeValidateIdentityNumber(form.coApplicantIdentityType, form.coApplicantIdentityNumber)
                          : ""
                      )
                    }
                    className="app-input py-1.5 text-xs"
                  />
                  {coApplicantIdentityError ? <p className="text-[11px] text-rose-600">{coApplicantIdentityError}</p> : null}
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="space-y-1 sm:col-span-1">
                  <span className="text-xs font-medium text-slate-700">Relationship</span>
                  <input value={form.coApplicantRelation} onChange={update("coApplicantRelation")} className="app-input py-1.5 text-xs" />
                </label>
                <DocumentCompactAttach label="Co ID proof" value={form.coApplicantIdProofName} url={attachmentUrls.coApplicantIdProofName} accept=".pdf,.jpg,.jpeg,.png,image/*" capture="environment" onPick={pickNamedFile("coApplicantIdProofName")} onClear={() => clearAttachment("coApplicantIdProofName")} />
                <DocumentCompactAttach label="Co photo" value={form.coApplicantPhotoName} url={attachmentUrls.coApplicantPhotoName} accept=".jpg,.jpeg,.png,.webp,image/*" capture="user" onPick={pickNamedFile("coApplicantPhotoName", setCoApplicantPhotoPreview)} onClear={() => clearAttachment("coApplicantPhotoName", setCoApplicantPhotoPreview)} />
              </div>
            </div>

          <div className="mt-2 flex shrink-0 flex-col items-end justify-end gap-3">
            {onCancel ? (
              <button type="button" onClick={onCancel} className="app-button-secondary w-[430px] rounded-xl px-8 py-3 text-base font-semibold">
                Cancel
              </button>
            ) : null}
            {submitBlockedByOtp ? (
              <p className="w-full max-w-[430px] text-center text-xs font-medium text-amber-900">
                Please verify mobile number before submitting.
              </p>
            ) : null}
            <button type="submit" disabled={loading || submitBlockedByOtp} className="inline-flex w-[430px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-8 py-5 text-[1.45rem] font-semibold text-white disabled:opacity-70">
              <CheckCircle2 className="h-7 w-7" />
              {loading ? "Saving..." : submitLabel}
            </button>
          </div>
        </div>
      </div>

      <PhoneOtpVerificationModal
        isOpen={otpModalOpen}
        phone={form.mobileNumber}
        onVerified={() => {
          setPrimaryPhoneVerified(true);
          setVerifiedAtPhone(String(form.mobileNumber).replace(/\D/g, "").slice(0, 10));
        }}
        onClose={() => setOtpModalOpen(false)}
      />

      {crifModalOpen && crifDemoResult ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="crif-demo-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCrifModalOpen(false);
          }}
        >
          <div
            className={`relative w-full max-w-md rounded-2xl border bg-gradient-to-br p-4 shadow-xl ring-2 ${crifTierStyles.border} ${crifTierStyles.ring} ${crifTierStyles.bg}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setCrifModalOpen(false)}
              className="absolute right-3 top-3 rounded-lg border border-slate-200 bg-white/90 p-1 text-slate-600 hover:bg-white"
              aria-label="Close eligibility report"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2 pr-10">
              <div>
                <p id="crif-demo-title" className={`text-lg font-bold ${crifTierStyles.accent}`}>
                  Eligibility report
                </p>
                <p className="text-[11px] text-slate-600">Simulated CRIF-style summary for stakeholder demos.</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                <ShieldAlert className="h-3 w-3 text-amber-600" aria-hidden />
                Demo mode
              </span>
            </div>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Credit score</dt>
                <dd className={`text-xl font-bold ${crifTierStyles.accent}`}>{crifDemoResult.creditScore}</dd>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Score band</dt>
                <dd className="font-semibold text-slate-800">{crifDemoResult.creditTier}</dd>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Eligibility status</dt>
                <dd className="font-semibold text-slate-900">{crifDemoResult.eligibilityStatus}</dd>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Suggested loan</dt>
                <dd className="font-semibold text-slate-900">{crifDemoResult.suggestedLoanDisplay}</dd>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Risk level</dt>
                <dd className="font-semibold text-slate-900">{crifDemoResult.riskLevel}</dd>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Active loans</dt>
                <dd className="font-semibold text-slate-900">{crifDemoResult.activeLoans}</dd>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 sm:col-span-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">EMI / payment history</dt>
                <dd className="font-semibold text-slate-900">{crifDemoResult.paymentHistoryStatus}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => setCrifModalOpen(false)} className="app-button-secondary flex-1 py-2 text-xs font-semibold">
                Close
              </button>
              <button
                type="button"
                onClick={async () => {
                  await runDemoCrifCheck();
                }}
                disabled={crifCheckLoading}
                className="app-button-primary flex-1 py-2 text-xs font-semibold disabled:opacity-60"
              >
                {crifCheckLoading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Rechecking…
                  </span>
                ) : (
                  "Recheck Eligibility"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="app-alert-error py-2 text-xs">{error}</div> : null}

    </form>
  );
}
