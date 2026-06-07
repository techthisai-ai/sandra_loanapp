import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CircleDollarSign,
  CheckCircle2,
  FileText,
  Landmark,
  Loader2,
  ShieldAlert,
  Shield,
  TrendingUp,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { DocumentCompactAttach, DocumentPhotoTile } from "./DocumentUploadControls";
import {
  IDENTITY_TYPE_OPTIONS,
  coerceIdentityType,
  safeValidateIdentityNumber,
  validateCustomerId,
  validatePhoneNumber,
} from "../utils/customerValidation";
import { getNextCustomerId } from "../services/userAuth";
import { getDocumentDataUrlField } from "../utils/customerDocumentAttachments";
import { persistableCenterFieldsFromSelectedDay } from "../utils/centerDisplay";
import { DAY_CENTER_LABELS, loadLoanCenters } from "../constants/dayCenters";

const INVALID_FIELD =
  "border-rose-400 bg-rose-50/40 ring-2 ring-rose-500/15 focus:border-rose-500 focus:ring-rose-500/25";

function fieldClass(base, invalid) {
  return invalid ? `${base} ${INVALID_FIELD}` : base;
}

function RequiredLabel({ label, required = false, hint = "" }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
        {label}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </label>
      {hint ? <span className="text-[10px] text-slate-400">{hint}</span> : null}
    </div>
  );
}

function FieldError({ message }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] font-medium text-rose-600">{message}</p>;
}

const SectionHead = memo(function SectionHead({ icon: Icon, title, badge }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">{title}</p>
      </div>
      {badge}
    </div>
  );
});

const StatusPill = memo(function StatusPill({ ok, label }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        ok ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : null}
      {label}
    </span>
  );
});

const EligibilityMetric = memo(function EligibilityMetric({ icon: Icon, label, value, tone = "slate" }) {
  const toneClasses =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50/80 text-emerald-900"
      : tone === "yellow"
        ? "border-amber-200 bg-amber-50/85 text-amber-900"
        : tone === "red"
          ? "border-rose-200 bg-rose-50/85 text-rose-900"
          : "border-slate-200 bg-white text-slate-900";

  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${toneClasses}`}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/75 shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-75">{label}</p>
          <p className="mt-1 text-sm font-semibold leading-5">{value}</p>
        </div>
      </div>
    </div>
  );
});

const buildInitialForm = (initialSelectedDay, initialSelectedCenter) => ({
  customerId: "",
  customerName: "",
  mobileNumber: "",
  alternateNumber: "",
  identityType: "Aadhaar Card",
  identityNumber: "",
  address: "",
  idDocumentName: "",
  idDocumentDataUrl: "",
  customerPhotoName: "",
  customerPhotoDataUrl: "",
  addressProofName: "",
  addressProofDataUrl: "",
  loanAgreementName: "",
  loanAgreementDataUrl: "",
  selectedDay: initialSelectedDay,
  selectedCenter: initialSelectedCenter,
});

function legacyCoApplicantFields(source) {
  if (!source) {
    return {
      coApplicantName: "",
      coApplicantContact: "",
      coApplicantRelation: "",
      coApplicantAddress: "",
      coApplicantIdentityType: "",
      coApplicantIdentityNumber: "",
      coApplicantIdProofName: "",
      coApplicantPhotoName: "",
      coApplicantPhotoDataUrl: "",
    };
  }
  return {
    coApplicantName: source.coApplicantName || "",
    coApplicantContact: source.coApplicantContact || "",
    coApplicantRelation: source.coApplicantRelation || "",
    coApplicantAddress: source.coApplicantAddress || "",
    coApplicantIdentityType: source.coApplicantIdentityType || "",
    coApplicantIdentityNumber: source.coApplicantIdentityNumber || "",
    coApplicantIdProofName: source.coApplicantIdProofName || "",
    coApplicantPhotoName: source.coApplicantPhotoName || "",
    coApplicantPhotoDataUrl: source.coApplicantPhotoDataUrl || "",
  };
}

export default function CustomerCreateStreamlinedForm({
  initialSelectedDay = "",
  initialSelectedCenter = "",
  initialData = null,
  isEdit = false,
  onSubmitForm,
  onSuccess,
  onCancel,
  submitLabel = "Create customer",
}) {
  const [form, setForm] = useState(() => buildInitialForm(initialSelectedDay, initialSelectedCenter));
  const [applicantPhotoPreview, setApplicantPhotoPreview] = useState("");
  const [attachmentUrls, setAttachmentUrls] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customerIdError, setCustomerIdError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [alternatePhoneError, setAlternatePhoneError] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [crifDemoResult, setCrifDemoResult] = useState(null);
  const [lastEligibilityCheckedAt, setLastEligibilityCheckedAt] = useState(null);
  const [crifCheckLoading, setCrifCheckLoading] = useState(false);
  const [crifPrecheckError, setCrifPrecheckError] = useState("");
  const [crifModalOpen, setCrifModalOpen] = useState(false);
  const [highlightedFields, setHighlightedFields] = useState(() => new Set());
  const strictOnboarding = !isEdit;

  const allCenters = useMemo(() => loadLoanCenters(), []);
  const isHighlighted = useCallback((key) => highlightedFields.has(key), [highlightedFields]);
  const clearHighlight = useCallback((key) => {
    setHighlightedFields((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }, []);
  const phoneDigitsOk = form.mobileNumber.length === 10 && !phoneError;
  const dayOptions = DAY_CENTER_LABELS;
  const daySelectOptions = useMemo(
    () => (form.selectedDay && !DAY_CENTER_LABELS.includes(form.selectedDay) ? [form.selectedDay, ...DAY_CENTER_LABELS] : DAY_CENTER_LABELS),
    [form.selectedDay]
  );
  const subOptions = useMemo(
    () => (form.selectedDay ? allCenters.filter((c) => c.parent === form.selectedDay).map((c) => c.label) : []),
    [allCenters, form.selectedDay]
  );
  const subSelectOptions = useMemo(
    () =>
      form.selectedCenter && !subOptions.includes(form.selectedCenter)
        ? [form.selectedCenter, ...subOptions]
        : subOptions,
    [form.selectedCenter, subOptions]
  );

  const applicantReady = useMemo(
    () =>
      Boolean(
        form.customerName &&
          form.mobileNumber &&
          form.identityType &&
          form.identityNumber &&
          form.address &&
          form.selectedDay &&
          (!strictOnboarding ||
            (form.alternateNumber && (subOptions.length === 0 || form.selectedCenter) && form.customerPhotoName))
      ),
    [
      form.address,
      form.alternateNumber,
      form.customerName,
      form.customerPhotoName,
      form.identityNumber,
      form.identityType,
      form.mobileNumber,
      form.selectedCenter,
      form.selectedDay,
      strictOnboarding,
      subOptions.length,
    ]
  );
  const docsAttached = useMemo(
    () => [form.customerPhotoName, form.idDocumentName, form.addressProofName, form.loanAgreementName].filter(Boolean).length,
    [form.addressProofName, form.customerPhotoName, form.idDocumentName, form.loanAgreementName]
  );

  useEffect(() => {
    if (!initialData) return;
    setForm({
      ...buildInitialForm(initialSelectedDay, initialSelectedCenter),
      customerId: initialData.customerId || "",
      customerName: initialData.customerName || "",
      mobileNumber: initialData.mobileNumber || "",
      alternateNumber: initialData.alternateNumber || "",
      identityType: coerceIdentityType(initialData.identityType),
      identityNumber: initialData.identityNumber || "",
      address: initialData.address || "",
      idDocumentName: initialData.idDocumentName || "",
      idDocumentDataUrl: initialData.idDocumentDataUrl || "",
      addressProofDataUrl: initialData.addressProofDataUrl || "",
      loanAgreementDataUrl: initialData.loanAgreementDataUrl || "",
      coApplicantIdProofDataUrl: initialData.coApplicantIdProofDataUrl || "",
      customerPhotoName: initialData.customerPhotoName || "",
      customerPhotoDataUrl: initialData.customerPhotoDataUrl || "",
      addressProofName: initialData.addressProofName || "",
      loanAgreementName: initialData.loanAgreementName || "",
      selectedDay: initialData.parentCenterLabel || initialSelectedDay || initialData.selectedDay || "",
      selectedCenter: initialData.subCenterLabel || initialSelectedCenter || initialData.selectedCenter || "",
    });
    setApplicantPhotoPreview(initialData.customerPhotoDataUrl || "");
    setCrifDemoResult(initialData.crifDemoEligibility || null);
    setLastEligibilityCheckedAt(initialData.lastEligibilityCheckedAt || null);
  }, [initialData, initialSelectedDay, initialSelectedCenter]);

  const crifTierStyles = useMemo(() => {
    const tier = crifDemoResult?.creditTier;
    if (tier === "Excellent") {
      return { border: "border-emerald-300", ring: "ring-emerald-200/80", bg: "from-emerald-50/90 to-white", accent: "text-emerald-800", badge: "bg-emerald-600 text-white" };
    }
    if (tier === "Good") {
      return { border: "border-amber-300", ring: "ring-amber-200/80", bg: "from-amber-50/90 to-white", accent: "text-amber-900", badge: "bg-amber-500 text-white" };
    }
    if (tier === "Risky") {
      return { border: "border-rose-300", ring: "ring-rose-200/80", bg: "from-rose-50/90 to-white", accent: "text-rose-900", badge: "bg-rose-600 text-white" };
    }
    return { border: "border-slate-200", ring: "ring-slate-200/80", bg: "from-slate-50 to-white", accent: "text-slate-800", badge: "bg-slate-700 text-white" };
  }, [crifDemoResult?.creditTier]);

  const collectRequiredFieldIssues = useCallback(() => {
    const nextIdentityError = safeValidateIdentityNumber(form.identityType, form.identityNumber);
    const nextPhoneError = validatePhoneNumber(form.mobileNumber, "Phone number");
    const nextAltError =
      strictOnboarding || form.alternateNumber?.trim()
        ? validatePhoneNumber(form.alternateNumber, "Alternate number")
        : "";
    const nextCustomerIdError = validateCustomerId(form.customerId, { allowLegacy: isEdit });
    const issues = new Set();

    if (nextCustomerIdError) issues.add("customerId");
    if (!form.customerName?.trim()) issues.add("customerName");
    if (!form.mobileNumber?.trim() || nextPhoneError) issues.add("mobileNumber");
    if (strictOnboarding && (!form.alternateNumber?.trim() || nextAltError)) issues.add("alternateNumber");
    if (!form.address?.trim()) issues.add("address");
    if (!form.identityType?.trim()) issues.add("identityType");
    if (!form.identityNumber?.trim() || nextIdentityError) issues.add("identityNumber");
    if (!form.selectedDay?.trim()) issues.add("selectedDay");
    if (strictOnboarding && subOptions.length > 0 && !form.selectedCenter?.trim()) issues.add("selectedCenter");
    if (strictOnboarding && !form.customerPhotoName?.trim()) issues.add("customerPhotoName");
    if (strictOnboarding && !form.idDocumentName?.trim()) issues.add("idDocumentName");

    return { issues, nextIdentityError, nextPhoneError, nextAltError, nextCustomerIdError };
  }, [form, isEdit, strictOnboarding, subOptions.length]);

  useEffect(() => {
    if (isEdit || initialData) return;
    let active = true;
    getNextCustomerId()
      .then((nextCustomerId) => {
        if (!active) return;
        setForm((current) => ({ ...current, customerId: nextCustomerId }));
        setCustomerIdError("");
      })
      .catch((loadError) => {
        if (!active) return;
        setCustomerIdError(loadError.message || "Unable to generate customer ID.");
      });
    return () => {
      active = false;
    };
  }, [initialData, isEdit]);

  const update = (field) => (event) => {
    const value = event?.target?.value ?? "";
    clearHighlight(field);
    if (field === "selectedDay") {
      setForm((c) => ({ ...c, selectedDay: value, selectedCenter: "" }));
      clearHighlight("selectedCenter");
      return;
    }
    if (field === "selectedCenter") {
      setForm((c) => ({ ...c, selectedCenter: value }));
      return;
    }
    if (field === "identityType" || field === "identityNumber") {
      setForm((c) => {
        const next = { ...c, [field]: value };
        setIdentityError(next.identityNumber ? safeValidateIdentityNumber(next.identityType, next.identityNumber) : "");
        return next;
      });
      setCrifPrecheckError("");
      return;
    }
    setForm((c) => ({ ...c, [field]: value }));
  };

  const updatePhone = (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 10);
    setForm((c) => ({ ...c, mobileNumber: digits }));
    setPhoneError(digits ? validatePhoneNumber(digits, "Phone number") : "");
    clearHighlight("mobileNumber");
  };

  const updateAlternatePhone = (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 10);
    setForm((c) => ({ ...c, alternateNumber: digits }));
    setAlternatePhoneError(digits ? validatePhoneNumber(digits, "Alternate number") : strictOnboarding ? "Enter alternate number" : "");
    setCrifPrecheckError("");
    clearHighlight("alternateNumber");
  };

  const runDemoCrifCheck = useCallback(async () => {
    const idErr = safeValidateIdentityNumber(form.identityType, form.identityNumber);
    const altErr = validatePhoneNumber(form.alternateNumber, "Alternate number");
    const issues = new Set();

    if (!form.identityNumber?.trim() || idErr) issues.add("identityNumber");
    if (!form.alternateNumber?.trim() || altErr) issues.add("alternateNumber");

    if (issues.size > 0) {
      setHighlightedFields(issues);
      setIdentityError(idErr);
      setAlternatePhoneError(altErr);
      setCrifPrecheckError("Enter a valid ID number and 10-digit alternate mobile before checking eligibility.");
      return;
    }

    setHighlightedFields(new Set());
    setCrifPrecheckError("");
    setIdentityError("");
    setAlternatePhoneError("");
    setCrifCheckLoading(true);
    try {
      const { fetchDemoCrifEligibility } = await import("../services/crifEligibilityDemo");
      const result = await fetchDemoCrifEligibility(
        { identityNumber: form.identityNumber, customerName: form.customerName },
        { minDelayMs: 700 }
      );
      setCrifDemoResult(result);
      setLastEligibilityCheckedAt(result.checkedAt);
      setCrifModalOpen(true);
    } catch (checkError) {
      setCrifPrecheckError(checkError.message || "Eligibility check failed. Try again.");
    } finally {
      setCrifCheckLoading(false);
    }
  }, [form.alternateNumber, form.customerName, form.identityNumber, form.identityType]);

  const pickNamedFile = (field, previewSetter, dataField = "") => (file) => {
    if (!file) return;
    clearHighlight(field);
    const url = URL.createObjectURL(file);
    const resolvedDataField = dataField || getDocumentDataUrlField(field);
    setAttachmentUrls((c) => {
      if (c[field]) URL.revokeObjectURL(c[field]);
      return { ...c, [field]: url };
    });
    setForm((cur) => ({ ...cur, [field]: file.name || "" }));
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (previewSetter) previewSetter(dataUrl);
      if (resolvedDataField) {
        setForm((cur) => ({ ...cur, [resolvedDataField]: dataUrl }));
      }
    };
    reader.readAsDataURL(file);
  };

  const clearAttachment = (field, previewSetter, dataField = "") => {
    const resolvedDataField = dataField || getDocumentDataUrlField(field);
    setForm((c) => ({
      ...c,
      [field]: "",
      ...(resolvedDataField ? { [resolvedDataField]: "" } : {}),
    }));
    if (previewSetter) previewSetter("");
    setAttachmentUrls((c) => {
      if (c[field]) URL.revokeObjectURL(c[field]);
      const next = { ...c };
      delete next[field];
      return next;
    });
  };

  useEffect(() => {
    return () => Object.values(attachmentUrls).forEach((url) => url && URL.revokeObjectURL(url));
  }, [attachmentUrls]);

  const buildPayload = useCallback(() => {
    const centerLabel = form.selectedCenter || form.selectedDay || "";
    const centerFields = persistableCenterFieldsFromSelectedDay(centerLabel, allCenters);
    const preservedCo = legacyCoApplicantFields(isEdit ? initialData : null);
    const isLegacyUnknownDay = Boolean(form.selectedDay && !DAY_CENTER_LABELS.includes(form.selectedDay) && !form.selectedCenter);
    const isLegacyUnknownSubCenter = Boolean(form.selectedCenter && !subOptions.includes(form.selectedCenter));
    const preserveLegacyCenterFields = isLegacyUnknownDay || isLegacyUnknownSubCenter;
    return {
      ...form,
      ...preservedCo,
      selectedDay: preserveLegacyCenterFields ? initialData?.selectedDay ?? centerLabel : centerLabel,
      parentCenterLabel: preserveLegacyCenterFields ? initialData?.parentCenterLabel ?? form.selectedDay ?? "" : centerFields.parentCenterLabel,
      subCenterLabel: preserveLegacyCenterFields ? initialData?.subCenterLabel ?? form.selectedCenter ?? "" : centerFields.subCenterLabel,
      country: initialData?.country || "India",
      idDocumentName: isEdit ? form.idDocumentName || initialData?.idDocumentName || "" : form.idDocumentName || "",
      addressProofName: isEdit ? form.addressProofName || initialData?.addressProofName || "" : form.addressProofName || "",
      loanAgreementName: isEdit ? form.loanAgreementName || initialData?.loanAgreementName || "" : form.loanAgreementName || "",
      customerPhotoName: isEdit ? form.customerPhotoName || initialData?.customerPhotoName || "" : form.customerPhotoName || "",
      customerPhotoDataUrl: isEdit
        ? form.customerPhotoDataUrl || initialData?.customerPhotoDataUrl || ""
        : form.customerPhotoDataUrl || "",
      ...(crifDemoResult
        ? { crifDemoEligibility: crifDemoResult, lastEligibilityCheckedAt: lastEligibilityCheckedAt || crifDemoResult.checkedAt || "" }
        : {}),
    };
  }, [form, allCenters, initialData, isEdit, crifDemoResult, lastEligibilityCheckedAt, subOptions]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const { issues, nextIdentityError, nextPhoneError, nextAltError, nextCustomerIdError } =
      collectRequiredFieldIssues();
    setIdentityError(nextIdentityError);
    setPhoneError(nextPhoneError);
    setAlternatePhoneError(nextAltError);
    setCustomerIdError(nextCustomerIdError);

    if (issues.size > 0) {
      setHighlightedFields(issues);
      setError("Please complete all required fields marked in red.");
      return;
    }
    if (nextIdentityError || nextPhoneError || nextAltError) {
      const validationIssues = new Set();
      if (nextIdentityError) validationIssues.add("identityNumber");
      if (nextPhoneError) validationIssues.add("mobileNumber");
      if (nextAltError) validationIssues.add("alternateNumber");
      setHighlightedFields(validationIssues);
      setError("Please fix validation errors.");
      return;
    }

    setHighlightedFields(new Set());

    setError("");
    setLoading(true);
    try {
      const payload = buildPayload();
      if (!payload.customerId && !isEdit) {
        payload.customerId = await getNextCustomerId();
      }
      if (onSubmitForm) await onSubmitForm(payload);
      else {
        const { createCustomer } = await import("../services/userAuth");
        await createCustomer(payload);
      }
      onSuccess?.();
    } catch (submitError) {
      setError(submitError.message || "Unable to save customer");
    } finally {
      setLoading(false);
    }
  };

  const eligibilityTone = crifDemoResult
    ? crifDemoResult.creditTier === "Excellent"
      ? "green"
      : crifDemoResult.creditTier === "Good"
        ? "yellow"
        : "red"
    : "slate";
  const documentIssuesActive = isHighlighted("idDocumentName");

  return (
    <form className="mx-auto w-full min-w-0 max-w-[min(840px,100%)]" onSubmit={handleSubmit}>
      <section className="dash-glass-panel rounded-3xl p-3 shadow-lg shadow-slate-200/40 sm:p-4 md:p-5">
        <div className="space-y-5 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50/70 p-3 ring-1 ring-slate-100/90 sm:p-5">
          <SectionHead
            icon={UserRound}
            title="Applicant"
            badge={
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase shadow-sm ${
                  applicantReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                }`}
              >
                {applicantReady ? "Complete" : "In progress"}
              </span>
            }
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_190px]">
            <div className="space-y-4">
              <div>
                <RequiredLabel label="Customer ID" required hint="Auto-generated (CX0001)" />
                <input
                  value={form.customerId}
                  readOnly
                  className={fieldClass(
                    "app-input h-11 w-full cursor-not-allowed bg-slate-50 text-sm uppercase tracking-wide transition",
                    isHighlighted("customerId")
                  )}
                  placeholder="CX0001"
                  autoComplete="off"
                  required
                  aria-invalid={isHighlighted("customerId") || customerIdError ? true : undefined}
                />
                <FieldError
                  message={
                    isHighlighted("customerId") || customerIdError
                      ? customerIdError || "Customer ID must be in the format CX0001"
                      : ""
                  }
                />
              </div>

              <div>
                <RequiredLabel label="Applicant Name" required />
                <input
                  value={form.customerName}
                  onChange={update("customerName")}
                  className={fieldClass("app-input h-11 w-full text-sm transition", isHighlighted("customerName"))}
                  placeholder="Enter applicant name"
                  required
                  aria-invalid={isHighlighted("customerName") || undefined}
                />
                <FieldError message={isHighlighted("customerName") ? "Applicant name is required." : ""} />
              </div>

              <div>
                <RequiredLabel label="Mobile Number" required />
                <input
                  value={form.mobileNumber}
                  onChange={updatePhone}
                  inputMode="numeric"
                  maxLength={10}
                  className={fieldClass("app-input h-11 w-full text-sm transition", isHighlighted("mobileNumber"))}
                  placeholder="10-digit mobile number"
                  required
                  aria-invalid={isHighlighted("mobileNumber") || undefined}
                />
                <FieldError message={phoneError || (isHighlighted("mobileNumber") ? "Mobile number is required." : "")} />
              </div>

              <div>
                <RequiredLabel label="Address" required />
                <textarea
                  value={form.address}
                  onChange={update("address")}
                  rows={3}
                  className={fieldClass("app-textarea min-h-[96px] w-full text-sm transition", isHighlighted("address"))}
                  placeholder="Enter full address"
                  required
                  aria-invalid={isHighlighted("address") || undefined}
                />
                <FieldError message={isHighlighted("address") ? "Address is required." : ""} />
              </div>
            </div>
            <DocumentPhotoTile
              label="Applicant Photo"
              preview={applicantPhotoPreview}
              fileName={form.customerPhotoName}
              onPick={pickNamedFile("customerPhotoName", setApplicantPhotoPreview, "customerPhotoDataUrl")}
              onClear={() => clearAttachment("customerPhotoName", setApplicantPhotoPreview, "customerPhotoDataUrl")}
              required={strictOnboarding}
              invalid={isHighlighted("customerPhotoName")}
              helperText={isHighlighted("customerPhotoName") ? "Applicant photo is required." : "Upload applicant image"}
            />
          </div>
          <FieldError message={isHighlighted("customerPhotoName") ? "Applicant photo is required before submission." : ""} />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <RequiredLabel label="ID Type" required />
              <select
                value={form.identityType}
                onChange={update("identityType")}
                className={fieldClass("app-select h-11 text-sm transition", isHighlighted("identityType"))}
              >
                {IDENTITY_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <RequiredLabel label="ID Number" required />
              <input
                value={form.identityNumber}
                onChange={update("identityNumber")}
                className={fieldClass("app-input h-11 text-sm transition", isHighlighted("identityNumber"))}
                placeholder="Enter ID number"
                required
                aria-invalid={isHighlighted("identityNumber") || undefined}
              />
            </div>
          </div>
          <FieldError message={identityError || (isHighlighted("identityNumber") ? "Valid ID details are required." : "")} />

          <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-blue-50/40 p-4 shadow-sm ring-1 ring-slate-100/90">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <RequiredLabel label="Alternate Number" required={strictOnboarding} hint="Needed for eligibility" />
                <input
                  value={form.alternateNumber}
                  onChange={updateAlternatePhone}
                  inputMode="numeric"
                  maxLength={10}
                  className={fieldClass("app-input h-11 w-full max-w-xl text-sm transition", isHighlighted("alternateNumber"))}
                  placeholder="Enter alternate mobile number"
                  aria-invalid={isHighlighted("alternateNumber") || undefined}
                />
                <FieldError
                  message={alternatePhoneError || (isHighlighted("alternateNumber") ? "Alternate number is required." : "")}
                />
              </div>
              <button
                type="button"
                onClick={runDemoCrifCheck}
                disabled={crifCheckLoading}
                className="app-button-primary inline-flex h-11 min-w-[180px] items-center justify-center whitespace-nowrap rounded-2xl px-5 text-sm font-semibold shadow-sm transition hover:brightness-105 disabled:opacity-60"
              >
                {crifCheckLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Check Eligibility"}
              </button>
            </div>
            <FieldError message={crifPrecheckError} />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={runDemoCrifCheck}
                disabled={crifCheckLoading || !lastEligibilityCheckedAt}
                className="app-button-secondary px-3.5 py-2 text-[11px] font-semibold disabled:opacity-50"
              >
                Recheck
              </button>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-bold uppercase text-amber-900">
                <ShieldAlert className="h-3 w-3" />
                Demo mode
              </span>
              {lastEligibilityCheckedAt ? (
                <span className="text-[10px] font-medium text-slate-500">
                  Checked {new Date(lastEligibilityCheckedAt).toLocaleString("en-IN")}
                </span>
              ) : null}
            </div>

            {crifDemoResult ? (
              <div
                className={`mt-4 rounded-2xl border bg-gradient-to-br p-4 shadow-sm ring-1 ${crifTierStyles.border} ${crifTierStyles.ring} ${crifTierStyles.bg}`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Eligibility snapshot</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${crifTierStyles.badge}`}>
                        Score {crifDemoResult.creditScore}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-semibold text-slate-700">
                        {crifDemoResult.eligibilityStatus}
                      </span>
                    </div>
                    <p className={`mt-3 text-base font-semibold ${crifTierStyles.accent}`}>
                      {crifDemoResult.approvalChanceLabel}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Suggested loan: {crifDemoResult.suggestedLoanDisplay} · Status: {crifDemoResult.verificationStatus}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCrifModalOpen(true)}
                    className="app-button-secondary inline-flex h-11 items-center justify-center px-4 text-sm font-semibold"
                  >
                    Open detailed report
                  </button>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <span>Approval chance</span>
                    <span>{crifDemoResult.approvalChancePercent}%</span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/80">
                    <div
                      className={`h-full rounded-full ${
                        eligibilityTone === "green"
                          ? "bg-emerald-500"
                          : eligibilityTone === "yellow"
                            ? "bg-amber-500"
                            : "bg-rose-500"
                      }`}
                      style={{ width: `${crifDemoResult.approvalChancePercent}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <EligibilityMetric icon={Activity} label="Health Status" value={crifDemoResult.healthStatus} tone={eligibilityTone} />
                  <EligibilityMetric icon={Shield} label="Risk Level" value={crifDemoResult.riskLevel} tone={eligibilityTone} />
                  <EligibilityMetric icon={TrendingUp} label="Repayment Quality" value={crifDemoResult.repaymentQuality} tone={eligibilityTone} />
                  <EligibilityMetric icon={Wallet} label="EMI Capacity" value={crifDemoResult.emiCapacityDisplay} tone="slate" />
                  <EligibilityMetric icon={CircleDollarSign} label="Recommended Loan" value={crifDemoResult.recommendedLoanLimitDisplay} tone="slate" />
                  <EligibilityMetric icon={Landmark} label="Financial Stability" value={crifDemoResult.financialStability} tone="slate" />
                  <EligibilityMetric icon={FileText} label="Verification Status" value={crifDemoResult.verificationStatus} tone="slate" />
                  <EligibilityMetric icon={Wallet} label="Existing Loans" value={crifDemoResult.existingLoanStatus} tone="slate" />
                  <EligibilityMetric icon={AlertTriangle} label="Payment History" value={crifDemoResult.paymentHistoryStatus} tone={eligibilityTone} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <RequiredLabel label="Center" required />
              <select
                value={form.selectedDay}
                onChange={update("selectedDay")}
                className={fieldClass("app-select h-11 text-sm transition", isHighlighted("selectedDay"))}
                required
                aria-invalid={isHighlighted("selectedDay") || undefined}
              >
                <option value="">Select center</option>
                {daySelectOptions.map((d) => (
                  <option key={d} value={d}>
                    {DAY_CENTER_LABELS.includes(d) ? d : `${d} (legacy)`}
                  </option>
                ))}
              </select>
              <FieldError message={isHighlighted("selectedDay") ? "Center is required." : ""} />
            </div>
            <div>
              <RequiredLabel
                label="Sub Center"
                required={strictOnboarding && subOptions.length > 0}
                hint={strictOnboarding && form.selectedDay && !subOptions.length ? "No child sub center configured yet" : ""}
              />
              <select
                value={form.selectedCenter}
                onChange={update("selectedCenter")}
                disabled={!form.selectedDay || !subOptions.length}
                className={fieldClass("app-select h-11 text-sm transition disabled:opacity-50", isHighlighted("selectedCenter"))}
              >
                <option value="">
                  {!form.selectedDay ? "Select center first" : !subOptions.length ? "No sub center available" : "Select sub center"}
                </option>
                {subSelectOptions.map((s) => (
                  <option key={s} value={s}>
                    {subOptions.includes(s) ? s : `${s} (legacy)`}
                  </option>
                ))}
              </select>
              <FieldError
                message={isHighlighted("selectedCenter") ? "Sub center is required when child centers are available." : ""}
              />
            </div>
          </div>

          <div>
            <RequiredLabel
              label="Supporting Documents"
              required={false}
              hint={strictOnboarding ? "ID proof is required for submission" : ""}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <DocumentCompactAttach
                label="ID Proof"
                value={form.idDocumentName}
                url={attachmentUrls.idDocumentName}
                accept=".pdf,.jpg,.jpeg,.png,image/*"
                capture="environment"
                onPick={pickNamedFile("idDocumentName")}
                onClear={() => clearAttachment("idDocumentName")}
                required={strictOnboarding}
                invalid={isHighlighted("idDocumentName")}
                helperText={isHighlighted("idDocumentName") ? "ID proof is required." : "Government ID image or PDF"}
              />
              <DocumentCompactAttach
                label="Address Proof"
                value={form.addressProofName}
                url={attachmentUrls.addressProofName}
                accept=".pdf,.jpg,.jpeg,.png,image/*"
                capture="environment"
                onPick={pickNamedFile("addressProofName")}
                onClear={() => clearAttachment("addressProofName")}
                required={false}
                invalid={false}
                emptyHint="Upload address proof if available"
                helperText="Upload address proof if available"
              />
              <DocumentCompactAttach
                label="Loan Document"
                value={form.loanAgreementName}
                url={attachmentUrls.loanAgreementName}
                accept=".pdf,.jpg,.jpeg,.png,image/*"
                capture="environment"
                onPick={pickNamedFile("loanAgreementName")}
                onClear={() => clearAttachment("loanAgreementName")}
                required={false}
                invalid={false}
                emptyHint="Upload loan document if available"
                helperText="Upload loan document if available"
              />
            </div>
            <FieldError
              message={documentIssuesActive ? "Upload ID proof before submission." : ""}
            />
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-white p-3 shadow-sm ring-1 ring-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Verification summary</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusPill ok={applicantReady} label="Applicant" />
              <StatusPill ok={phoneDigitsOk} label="Mobile" />
              <StatusPill ok={Boolean(crifDemoResult)} label="Eligibility" />
              <StatusPill ok={docsAttached >= 4} label={`Docs ${docsAttached}/4`} />
            </div>
            <p className="mt-2 text-[10px] leading-snug text-slate-500">
              Nominee and loan terms are added when you apply a loan from the customer list.
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-200/70 pt-3 sm:flex-row sm:justify-end">
            {onCancel ? (
              <button type="button" onClick={onCancel} className="app-button-secondary px-5 py-2.5 text-sm font-semibold transition hover:bg-slate-50">
                Cancel
              </button>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 to-blue-900 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-105 disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              {loading ? "Saving…" : submitLabel}
            </button>
          </div>
        </div>
      </section>

      {crifModalOpen && crifDemoResult ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setCrifModalOpen(false)}>
          <div className={`relative w-full max-w-md rounded-2xl border bg-gradient-to-br p-4 shadow-xl ring-2 ${crifTierStyles.border} ${crifTierStyles.ring} ${crifTierStyles.bg}`} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setCrifModalOpen(false)} className="absolute right-3 top-3 rounded-lg border border-slate-200 bg-white p-1">
              <X className="h-4 w-4" />
            </button>
            <p className={`text-lg font-bold ${crifTierStyles.accent}`}>Eligibility report</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-white/80 p-2">
                <dt className="text-[10px] uppercase text-slate-500">Score</dt>
                <dd className={`font-bold ${crifTierStyles.accent}`}>{crifDemoResult.creditScore}</dd>
              </div>
              <div className="rounded-lg bg-white/80 p-2">
                <dt className="text-[10px] uppercase text-slate-500">Status</dt>
                <dd className="font-semibold">{crifDemoResult.eligibilityStatus}</dd>
              </div>
              <div className="rounded-lg bg-white/80 p-2">
                <dt className="text-[10px] uppercase text-slate-500">Risk</dt>
                <dd className="font-semibold">{crifDemoResult.riskLevel}</dd>
              </div>
              <div className="rounded-lg bg-white/80 p-2">
                <dt className="text-[10px] uppercase text-slate-500">Repayment</dt>
                <dd className="font-semibold">{crifDemoResult.repaymentQuality}</dd>
              </div>
              <div className="rounded-lg bg-white/80 p-2">
                <dt className="text-[10px] uppercase text-slate-500">EMI capacity</dt>
                <dd className="font-semibold">{crifDemoResult.emiCapacityDisplay}</dd>
              </div>
              <div className="rounded-lg bg-white/80 p-2">
                <dt className="text-[10px] uppercase text-slate-500">Recommended</dt>
                <dd className="font-semibold">{crifDemoResult.recommendedLoanLimitDisplay}</dd>
              </div>
            </dl>
            <button type="button" onClick={() => setCrifModalOpen(false)} className="app-button-secondary mt-3 w-full py-2 text-sm">
              Close
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div className="app-alert-error mt-3 text-sm">{error}</div> : null}
    </form>
  );
}
