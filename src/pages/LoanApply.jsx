import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  IdCard,
  IndianRupee,
  MapPin,
  Phone,
  Printer,
  UserRound,
  FileSpreadsheet,
  FileText,
  Wallet,
} from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import LoanNomineeSection from "../components/LoanNomineeSection";
import useWalletAvailable from "../hooks/useWalletAvailable";
import { approveLoanApplication, getLoanSettings, listCustomers, upsertLoanApplication } from "../services/userAuth";
import {
  coerceIdentityType,
  safeValidateIdentityNumber,
  validatePhoneNumber,
} from "../utils/customerValidation";
import { loadLoanCenters } from "../constants/dayCenters";
import {
  buildLoanApplicationFormPayload,
  downloadLoanApplicationFormPdf,
} from "../utils/loanApplicationFormPdf";
import {
  downloadLoanSheetHtml,
  openPrintableLoanSheet,
} from "../utils/loanSheet";
import { calculateLoanValues, findLoanPreset, formatPresetLabel } from "../utils/loanCalculation";
import { isValidNomineeRelation, normalizeNomineeRelation } from "../utils/nomineeRelationship";
import {
  calculateLoanDueDate,
  resolveEmiStartDate,
  resolveLoanIssueDate,
  resolveLoanTimelineDates,
} from "../utils/loanTimelineDates";

function calculateDueDate(disbursementDate, weeks, frequency) {
  return calculateLoanDueDate(disbursementDate, weeks, frequency);
}

function formatSummaryDate(value) {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatInr(n) {
  return `Rs ${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
}

function generateLoanId(now) {
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `LOAN-${dd}${mm}${yyyy}-${rand}`;
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
      <Icon className="h-5 w-5 shrink-0 text-blue-600" />
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
        <p className="text-sm font-medium text-slate-900">{value || "--"}</p>
      </div>
    </div>
  );
}

function LoanSummaryStatCard({ icon: Icon, label, value, highlight = false, tone = "slate", className = "" }) {
  const toneStyles = {
    blue: "border-blue-100/90 bg-gradient-to-br from-blue-50/95 via-white to-white text-blue-600",
    emerald: "border-emerald-100/90 bg-gradient-to-br from-emerald-50/95 via-white to-white text-emerald-600",
    amber: "border-amber-100/90 bg-gradient-to-br from-amber-50/95 via-white to-white text-amber-600",
    slate: "border-slate-200/90 bg-gradient-to-br from-slate-50/95 via-white to-white text-slate-600",
  };

  return (
    <div
      className={`group flex min-h-[88px] flex-col justify-between rounded-2xl border p-3.5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${toneStyles[tone] || toneStyles.slate} ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm ring-1 ring-black/5">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p
        className={`mt-2 text-sm leading-snug ${highlight ? "text-base font-bold tabular-nums text-slate-950" : "font-semibold text-slate-900"}`}
      >
        {value}
      </p>
    </div>
  );
}

function LoanSummaryStatsGrid({ emiAmount, interestAmount, totalPayable, loanIssueDate, emiStartDate, emiEndDate }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <LoanSummaryStatCard icon={IndianRupee} label="EMI amount" value={formatInr(emiAmount)} highlight tone="blue" />
      <LoanSummaryStatCard icon={Wallet} label="Interest amount" value={formatInr(interestAmount)} tone="amber" />
      <LoanSummaryStatCard icon={IndianRupee} label="Total payable" value={formatInr(totalPayable)} highlight tone="emerald" />
      <LoanSummaryStatCard icon={CalendarDays} label="EMI end date" value={formatSummaryDate(emiEndDate)} tone="emerald" />
      <LoanSummaryStatCard icon={Clock} label="Loan issue date" value={formatSummaryDate(loanIssueDate)} tone="slate" />
      <LoanSummaryStatCard icon={CalendarDays} label="EMI start date" value={formatSummaryDate(emiStartDate)} tone="blue" />
    </div>
  );
}

export default function LoanApply() {
  const { customerId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const now = useMemo(() => new Date(), []);
  const { balance: walletBalance } = useWalletAvailable();

  const [customer, setCustomer] = useState(location.state?.customer || null);
  const [loanSettings, setLoanSettings] = useState({ loanPresets: [] });
  const [selectedPresetId, setSelectedPresetId] = useState(location.state?.customer?.loanPresetId || "");

  const [nomineeName, setNomineeName] = useState("");
  const [nomineeContact, setNomineeContact] = useState("");
  const [additionalContact, setAdditionalContact] = useState("");
  const [nomineeAddress, setNomineeAddress] = useState("");
  const [nomineeRelation, setNomineeRelation] = useState("");
  const [nomineeIdentityType, setNomineeIdentityType] = useState("Aadhaar Card");
  const [nomineeIdentityNumber, setNomineeIdentityNumber] = useState("");
  const [nomineePhotoName, setNomineePhotoName] = useState("");
  const [nomineePhotoDataUrl, setNomineePhotoDataUrl] = useState("");
  const [nomineePhotoPreview, setNomineePhotoPreview] = useState("");
  const [nomineeIdProofName, setNomineeIdProofName] = useState("");
  const [nomineeAttachmentUrls, setNomineeAttachmentUrls] = useState({});
  const [nomineeNameError, setNomineeNameError] = useState("");
  const [nomineeContactRequiredError, setNomineeContactRequiredError] = useState("");
  const [nomineePhoneError, setNomineePhoneError] = useState("");
  const [nomineeRelationError, setNomineeRelationError] = useState("");
  const [nomineeIdentityError, setNomineeIdentityError] = useState("");
  const [validationPulse, setValidationPulse] = useState(0);

  const [loanAmount, setLoanAmount] = useState("");
  const [loanWeeks, setLoanWeeks] = useState(20);
  const [disbursementDate, setDisbursementDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [collectionFrequency, setCollectionFrequency] = useState("Weekly");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [appFormLoading, setAppFormLoading] = useState(false);
  const [appFormMessage, setAppFormMessage] = useState("");
  const [appFormError, setAppFormError] = useState("");

  const matchedPreset = findLoanPreset(loanSettings.loanPresets, loanAmount, loanWeeks);
  const selectedPreset = loanSettings.loanPresets.find((item) => item.id === selectedPresetId) || null;
  const activePreset = selectedPreset || matchedPreset;

  const { emiAmount, totalPayable, interestAmount } = calculateLoanValues({
    loanAmount,
    loanWeeks,
    preset: activePreset,
  });
  const collectionDay = customer?.selectedDay || "--";

  const { principalDelta, insufficientWalletForSave } = useMemo(() => {
    if (!customer) {
      return { principalDelta: 0, insufficientWalletForSave: false };
    }
    const st = String(customer.approvalStatus || "").trim().toLowerCase();
    const isApprovedBook = st === "approved";
    const requested = Math.round(Number(loanAmount) || 0);
    const prior = Math.round(Number(customer.loanAmount) || 0);
    const delta = Math.max(0, requested - prior);
    const insufficientWalletForSave = isApprovedBook && delta > walletBalance;
    return { principalDelta: delta, insufficientWalletForSave };
  }, [customer, loanAmount, walletBalance]);
  const resolvedDueDate = dueDate || calculateDueDate(disbursementDate, loanWeeks, collectionFrequency);
  const emiStartDate = resolveEmiStartDate(disbursementDate);
  const loanTimelinePreview = useMemo(
    () =>
      resolveLoanTimelineDates({
        loanIssueDate: resolveLoanIssueDate(now),
        emiStartDate,
        emiEndDate: resolvedDueDate,
        disbursementDate,
        dueDate: resolvedDueDate,
        loanWeeks,
        collectionFrequency,
      }),
    [collectionFrequency, disbursementDate, emiStartDate, loanWeeks, now, resolvedDueDate]
  );
  const loanId = useMemo(() => generateLoanId(now), [now]);
  const loanSheetData = useMemo(
    () => ({
      loanId,
      customerId: customer?.customerId || "--",
      customerName: customer?.customerName || "--",
      mobileNumber: customer?.mobileNumber || "--",
      collectionDay,
      nomineeName: nomineeName || "--",
      nomineeContact: nomineeContact || "--",
      loanPresetLabel: activePreset ? formatPresetLabel(activePreset) : "",
      disbursementDate,
      dueDate: resolvedDueDate,
      loanIssueDate: result?.loanIssueDate || loanTimelinePreview.loanIssueDate,
      emiStartDate: result?.emiStartDate || loanTimelinePreview.emiStartDate,
      emiEndDate: (result?.emiEndDate || result?.dueDate) ?? loanTimelinePreview.emiEndDate,
      companyName: "RUTHRA FINANCIAL SOLUTION",
      loanAmount: Number(loanAmount || 0),
      loanWeeks: Number(loanWeeks || 0),
      emiAmount: Number(emiAmount || 0),
      interestAmount: Number(interestAmount || 0),
      totalPayable: Number(totalPayable || 0),
      collectionFrequency,
    }),
    [
      collectionDay,
      collectionFrequency,
      customer?.customerName,
      customer?.customerId,
      customer?.mobileNumber,
      disbursementDate,
      emiAmount,
      interestAmount,
      loanAmount,
      loanId,
      nomineeContact,
      nomineeName,
      loanWeeks,
      loanTimelinePreview.emiEndDate,
      loanTimelinePreview.emiStartDate,
      loanTimelinePreview.loanIssueDate,
      resolvedDueDate,
      result?.dueDate,
      result?.emiEndDate,
      result?.emiStartDate,
      result?.loanIssueDate,
      totalPayable,
      activePreset,
    ]
  );

  useEffect(() => {
    if (!customer) {
      listCustomers().then((list) => {
        const found = list.find((item) => item.customerId === customerId);
        if (found) {
          setCustomer(found);
        } else {
          navigate("/dashboard/customer", { replace: true });
        }
      });
    }
  }, [customer, customerId, navigate]);

  useEffect(() => {
    let active = true;

    getLoanSettings()
      .then((settings) => {
        if (!active) return;
        const presets = Array.isArray(settings?.loanPresets) ? settings.loanPresets : [];
        setLoanSettings({ ...(settings || {}), loanPresets: presets });
      })
      .catch(() => {
        if (active) setLoanSettings({ loanPresets: [] });
      });

    return () => {
      active = false;
    };
  }, []);

  const hydrateNomineeFromCustomer = useCallback((record) => {
    if (!record) return;
    const contact = record.nomineeContact || record.coApplicantContact || "";
    setNomineeName(record.nomineeName || record.coApplicantName || "");
    setNomineeContact(contact);
    setAdditionalContact(record.additionalContact || "");
    setNomineeAddress(record.coApplicantAddress || "");
    setNomineeRelation(
      normalizeNomineeRelation(record.nomineeRelation || record.coApplicantRelation || "")
    );
    setNomineeIdentityType(coerceIdentityType(record.coApplicantIdentityType || "Aadhaar Card"));
    setNomineeIdentityNumber(record.coApplicantIdentityNumber || "");
    setNomineePhotoName(record.coApplicantPhotoName || "");
    setNomineePhotoDataUrl(record.coApplicantPhotoDataUrl || "");
    setNomineePhotoPreview(record.coApplicantPhotoDataUrl || "");
    setNomineeIdProofName(record.coApplicantIdProofName || "");
    setNomineeNameError("");
    setNomineeContactRequiredError("");
    setNomineePhoneError("");
    setNomineeRelationError("");
    setNomineeIdentityError("");
  }, []);

  useEffect(() => {
    if (!customer) return;
    hydrateNomineeFromCustomer(customer);
    setLoanAmount(customer.loanAmount ?? "");
    setLoanWeeks(customer.loanWeeks || 20);
    setDisbursementDate(customer.disbursementDate || new Date().toISOString().slice(0, 10));
    setDueDate(customer.dueDate || "");
    setCollectionFrequency(customer.collectionFrequency || "Weekly");
  }, [customer, hydrateNomineeFromCustomer]);

  useEffect(() => {
    return () => Object.values(nomineeAttachmentUrls).forEach((url) => url && URL.revokeObjectURL(url));
  }, [nomineeAttachmentUrls]);

  const onNomineeFieldChange = (field, value) => {
    if (field === "nomineeName") {
      setNomineeName(value);
      setNomineeNameError(value?.trim() ? "" : "Nominee name is required");
    }
    if (field === "additionalContact") setAdditionalContact(value);
    if (field === "nomineeAddress") setNomineeAddress(value);
    if (field === "nomineeRelation") {
      setNomineeRelation(value);
      setNomineeRelationError(
        value && !isValidNomineeRelation(value) ? "Please select a valid relationship" : ""
      );
    }
    if (field === "nomineeIdentityType") {
      setNomineeIdentityType(value);
      setNomineeIdentityError(
        nomineeIdentityNumber ? safeValidateIdentityNumber(value, nomineeIdentityNumber) : ""
      );
    }
    if (field === "nomineeIdentityNumber") {
      setNomineeIdentityNumber(value);
      setNomineeIdentityError(
        value?.trim()
          ? safeValidateIdentityNumber(nomineeIdentityType, value)
          : "Aadhaar number is required"
      );
    }
  };

  const onNomineePhoneChange = (digits) => {
    const clean = digits.replace(/\D/g, "").slice(0, 10);
    setNomineeContact(clean);
    setNomineeContactRequiredError(clean ? "" : "Mobile number is required");
    setNomineePhoneError(clean ? validatePhoneNumber(clean, "Nominee phone") : "");
  };

  const pickNomineeFile = (field, previewSetter, dataField = "") => (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setNomineeAttachmentUrls((current) => {
      if (current[field]) URL.revokeObjectURL(current[field]);
      return { ...current, [field]: url };
    });
    if (field === "nomineeIdProofName") setNomineeIdProofName(file.name || "");
    if (field === "nomineePhotoName") {
      setNomineePhotoName(file.name || "");
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        previewSetter(dataUrl);
        if (dataField) setNomineePhotoDataUrl(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearNomineeFile = (field, previewSetter, dataField = "") => {
    if (field === "nomineeIdProofName") setNomineeIdProofName("");
    if (field === "nomineePhotoName") {
      setNomineePhotoName("");
      if (dataField) setNomineePhotoDataUrl("");
      previewSetter("");
    }
    setNomineeAttachmentUrls((current) => {
      if (current[field]) URL.revokeObjectURL(current[field]);
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  useEffect(() => {
    if (selectedPresetId || loanAmount || loanWeeks || loanSettings.loanPresets.length === 0) return;
    const initialPreset = loanSettings.loanPresets[0];
    if (!initialPreset) return;
    setSelectedPresetId(initialPreset.id || "");
    setLoanAmount(String(initialPreset.loanAmount || ""));
    setLoanWeeks(Number(initialPreset.loanWeeks || 0) || 20);
  }, [loanAmount, loanSettings.loanPresets, loanWeeks, selectedPresetId]);

  const downloadLoanSheet = () => {
    downloadLoanSheetHtml(loanSheetData);
  };

  const applicationFormPayload = useMemo(() => {
    if (!customer || !result) return null;
    return buildLoanApplicationFormPayload({
      customer,
      loan: {
        loanId: result.loanId,
        loanAmount: Number(loanAmount || 0),
        loanWeeks: Number(loanWeeks || 0),
        emiAmount: Number(result.emiAmount ?? emiAmount ?? 0),
        interestAmount: Number(result.interestAmount ?? interestAmount ?? 0),
        totalPayable: Number(result.totalPayable ?? totalPayable ?? 0),
        collectionFrequency,
        collectionDay,
        disbursementDate,
        dueDate: result.dueDate || resolvedDueDate,
        loanIssueDate: result.loanIssueDate,
        emiStartDate: result.emiStartDate,
        emiEndDate: result.emiEndDate || result.dueDate,
        submittedAt: result.loanIssueDate ? new Date(result.loanIssueDate) : new Date(),
        loanStatus: "active",
        presetLabel: result.presetLabel || (activePreset ? formatPresetLabel(activePreset) : ""),
      },
      nominee: {
        name: nomineeName,
        relation: nomineeRelation,
        contact: nomineeContact,
        address: nomineeAddress,
        identityType: nomineeIdentityType,
        identityNumber: nomineeIdentityNumber,
        idProofName: nomineeIdProofName,
        photoDataUrl: nomineePhotoDataUrl,
      },
      centers: loadLoanCenters(),
    });
  }, [
    activePreset,
    collectionDay,
    collectionFrequency,
    customer,
    disbursementDate,
    emiAmount,
    interestAmount,
    loanAmount,
    loanWeeks,
    nomineeAddress,
    nomineeContact,
    nomineeIdProofName,
    nomineeIdentityNumber,
    nomineeIdentityType,
    nomineeName,
    nomineePhotoDataUrl,
    nomineeRelation,
    resolvedDueDate,
    result,
    totalPayable,
  ]);

  const handleDownloadApplicationForm = async () => {
    if (!applicationFormPayload) return;
    setAppFormLoading(true);
    setAppFormMessage("");
    setAppFormError("");
    try {
      await downloadLoanApplicationFormPdf(applicationFormPayload);
      setAppFormMessage("Application form downloaded successfully.");
    } catch (formError) {
      setAppFormError(formError.message || "Unable to generate application form.");
    } finally {
      setAppFormLoading(false);
    }
  };

  const handleSubmit = async () => {
    const scrollToField = (id) => {
      if (!id) return;
      setTimeout(() => {
        const el = document.getElementById(id);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof el.focus === "function") el.focus();
      }, 0);
    };

    const nextNameError = nomineeName?.trim() ? "" : "Nominee name is required";
    const nextContactRequiredError = nomineeContact ? "" : "Mobile number is required";
    const nextPhoneError = validatePhoneNumber(nomineeContact, "Nominee phone");
    const nextIdentityError = safeValidateIdentityNumber(nomineeIdentityType, nomineeIdentityNumber);
    const nextRelationError = isValidNomineeRelation(nomineeRelation)
      ? ""
      : "Please select nominee relationship";
    const nextIdRequiredError = nomineeIdentityNumber?.trim() ? "" : "Aadhaar number is required";

    setNomineeNameError(nextNameError);
    setNomineeContactRequiredError(nextContactRequiredError);
    setNomineePhoneError(nextPhoneError);
    setNomineeRelationError(nextRelationError);
    setNomineeIdentityError(nextIdRequiredError || nextIdentityError);

    const firstInvalidId =
      nextNameError
        ? "nominee-name"
        : nextContactRequiredError || nextPhoneError
          ? "nominee-phone"
          : nextRelationError
            ? "nominee-relationship"
            : nextIdRequiredError || nextIdentityError
              ? "nominee-id-number"
              : "";

    if (firstInvalidId) {
      setValidationPulse(Date.now());
      scrollToField(firstInvalidId);
    }

    if (nextNameError || nextContactRequiredError) {
      setError("Please complete nominee details.");
      return;
    }
    if (nextRelationError) {
      setError("Please select nominee relationship");
      return;
    }
    if (nextPhoneError || nextIdentityError || nextIdRequiredError) {
      setError("Please fix nominee validation errors");
      return;
    }
    if (!loanAmount || !loanWeeks || !disbursementDate || !collectionFrequency) {
      setError("Please complete all required loan fields.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const wasApproved = String(customer.approvalStatus || "").toLowerCase() === "approved";

      await upsertLoanApplication({
        customerId: customer.customerId,
        applicationId: loanId,
        customerName: customer.customerName,
        mobileNumber: customer.mobileNumber,
        alternateNumber: customer.alternateNumber,
        identityType: customer.identityType,
        identityNumber: customer.identityNumber,
        address: customer.address,
        country: customer.country,
        selectedDay: customer.selectedDay,
        loanAmount,
        loanWeeks,
        loanPresetId: activePreset?.id || selectedPresetId || "",
        loanPresetLabel: activePreset ? formatPresetLabel(activePreset) : "",
        loanPresetLoanAmount: Number(activePreset?.loanAmount || 0),
        loanPresetLoanWeeks: Number(activePreset?.loanWeeks || 0),
        loanPresetEmiAmount: Number(activePreset?.emiAmount || 0),
        loanPresetInterestAmount: Number(activePreset?.interestAmount || 0),
        loanPresetTotalPayable: Number(activePreset?.totalPayable || 0),
        disbursementDate,
        dueDate: resolvedDueDate,
        collectionFrequency,
        nomineeName: nomineeName.trim(),
        nomineeContact,
        additionalContact,
        idDocumentName: customer.idDocumentName,
        addressProofName: customer.addressProofName,
        loanAgreementName: customer.loanAgreementName,
        supportingDocumentNames: customer.supportingDocumentNames || [],
        coApplicantName: nomineeName.trim(),
        coApplicantContact: nomineeContact,
        coApplicantRelation: nomineeRelation,
        coApplicantAddress: nomineeAddress,
        coApplicantIdentityType: nomineeIdentityType,
        coApplicantIdentityNumber: nomineeIdentityNumber,
        coApplicantIdProofName: nomineeIdProofName,
        coApplicantPhotoName: nomineePhotoName,
        coApplicantPhotoDataUrl: nomineePhotoDataUrl || "",
        customerPhotoName: customer.customerPhotoName || "",
        customerPhotoDataUrl: customer.customerPhotoDataUrl || "",
        isArchived: customer.isArchived,
        archivedAt: customer.archivedAt || null,
        loanStatus: "active",
        closedAt: null,
        rescheduledAt: customer.rescheduledAt || null,
        rescheduleReason: customer.rescheduleReason || "",
      });

      let approvalMessage = wasApproved ? "Loan updated." : "Loan saved and approved.";
      if (!wasApproved) {
        try {
          await approveLoanApplication(loanId);
        } catch (approveError) {
          approvalMessage = `Loan saved. Approval pending: ${approveError.message || "check wallet balance and approve from Loan Apply."}`;
        }
      }

      const loanIssueDate = resolveLoanIssueDate(new Date());

      setResult({
        loanId,
        emiAmount,
        totalPayable,
        interestAmount,
        dueDate: resolvedDueDate,
        loanIssueDate,
        emiStartDate: emiStartDate || resolveEmiStartDate(disbursementDate),
        emiEndDate: resolvedDueDate,
        presetLabel: activePreset ? formatPresetLabel(activePreset) : "",
        approvalMessage,
      });
    } catch (submitError) {
      setError(submitError.message || "Unable to submit");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <AdminLayout title="Loan application" description="Loan saved successfully.">
        <div className="w-full max-w-2xl rounded-3xl border border-emerald-200 bg-gradient-to-b from-emerald-50/90 to-white p-6 shadow-lg shadow-emerald-100/50 sm:p-8">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h3 className="mt-4 text-center text-xl font-semibold text-slate-900">Loan saved</h3>
          <p className="mt-1 text-center text-sm text-slate-600">
            {result.approvalMessage || "Loan summary and repayment timeline"}
          </p>

          <div className="mt-6 space-y-4 rounded-2xl border border-emerald-200/80 bg-white/95 p-4 shadow-sm backdrop-blur-sm sm:p-5">
            <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Loan ID</p>
              <p className="mt-1 break-all font-mono text-sm font-bold text-slate-900">{result.loanId}</p>
            </div>

            <LoanSummaryStatsGrid
              emiAmount={result.emiAmount}
              interestAmount={result.interestAmount}
              totalPayable={result.totalPayable}
              loanIssueDate={result.loanIssueDate}
              emiStartDate={result.emiStartDate}
              emiEndDate={result.emiEndDate || result.dueDate}
            />

            <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Selected preset</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{result.presetLabel || "Custom amount"}</p>
              </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Customer</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{customer?.customerName}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Collection day</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{collectionDay}</p>
            </div>
          </div>

          {appFormError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {appFormError}
            </div>
          ) : null}
          {appFormMessage ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800">
              {appFormMessage}
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              disabled={appFormLoading || !applicationFormPayload}
              onClick={handleDownloadApplicationForm}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 to-blue-900 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <FileText className="h-4 w-4 shrink-0" />
              {appFormLoading ? "Generating Application Form…" : "Application Form"}
            </button>
            <button
              type="button"
              onClick={downloadLoanSheet}
              disabled={appFormLoading}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-55"
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              Download repayment sheet
            </button>
            <button
              type="button"
              onClick={() => openPrintableLoanSheet(loanSheetData)}
              disabled={appFormLoading}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-55 sm:col-span-2 lg:col-span-1"
            >
              <Printer className="h-4 w-4 shrink-0" />
              Print repayment sheet
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate("/dashboard/customer")}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-700"
          >
            Back to customer list
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Loan application"
      description="Nominee details and loan terms — captured when applying a loan for an existing customer."
    >
      <div className="w-full min-w-0 max-w-[min(1460px,100%)]">
        <section className="dash-glass-panel rounded-3xl p-3 sm:p-4 md:p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-blue-600/90">Customer details</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoRow icon={UserRound} label="Name" value={customer?.customerName} />
            <InfoRow icon={Phone} label="Phone" value={customer?.mobileNumber} />
            <InfoRow icon={IdCard} label={customer?.identityType || "ID"} value={customer?.identityNumber} />
            <InfoRow icon={CalendarDays} label="Collection day" value={collectionDay} />
            <div className="sm:col-span-2">
              <InfoRow icon={MapPin} label="Address" value={customer?.address} />
            </div>
          </div>

          <div className="my-5 border-t border-slate-200/80" />

          <LoanNomineeSection
            nominee={{
              nomineeName,
              nomineeContact,
              additionalContact,
              nomineeAddress,
              nomineeRelation,
              nomineeIdentityType,
              nomineeIdentityNumber,
              nomineePhotoName,
              nomineeIdProofName,
            }}
            onFieldChange={onNomineeFieldChange}
            onNomineePhoneChange={onNomineePhoneChange}
            nameError={nomineeNameError}
            contactRequiredError={nomineeContactRequiredError}
            phoneError={nomineePhoneError}
            relationshipError={nomineeRelationError}
            identityError={nomineeIdentityError}
            phoneVerified
            canOpenOtp={false}
            disableOtp
            validationPulse={validationPulse}
            photoPreview={nomineePhotoPreview}
            onPhotoPick={pickNomineeFile("nomineePhotoName", setNomineePhotoPreview, "nomineePhotoDataUrl")}
            onPhotoClear={() => clearNomineeFile("nomineePhotoName", setNomineePhotoPreview, "nomineePhotoDataUrl")}
            onIdProofPick={pickNomineeFile("nomineeIdProofName")}
            onIdProofClear={() => clearNomineeFile("nomineeIdProofName")}
            attachmentUrls={nomineeAttachmentUrls}
          />

          <div className="my-5 border-t border-slate-200/80" />

          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-blue-600/90">Loan details</p>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/90 bg-gradient-to-r from-slate-50 to-blue-50/40 px-3 py-2.5 text-xs shadow-sm ring-1 ring-slate-100">
            <span className="font-semibold uppercase tracking-wide text-slate-500">Available wallet</span>
            <span className={`font-mono text-sm font-bold tabular-nums ${walletBalance <= 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {formatInr(walletBalance)}
            </span>
          </div>

          {insufficientWalletForSave ? (
            <div className="mb-3 flex items-start gap-2 rounded-2xl border border-rose-200/80 bg-gradient-to-r from-rose-50 to-orange-50/90 px-3 py-2.5 text-xs text-rose-950 shadow-sm ring-1 ring-rose-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" strokeWidth={2} />
              <div>
                <p className="font-semibold tracking-tight">Insufficient wallet balance</p>
                <p className="mt-0.5 leading-snug text-rose-900/90">
                  Approved book increases need {formatInr(principalDelta)}; only {formatInr(walletBalance)} is available.
                  Add an investor deposit or reduce the principal increase before saving.
                </p>
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Loan ID</p>
                <p className="mt-0.5 break-all text-sm font-bold leading-snug text-slate-900">{loanId}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Collection day</p>
                <p className="mt-0.5 truncate text-sm font-bold text-slate-900">{collectionDay}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Loan amount</span>
                <input
                  value={loanAmount}
                  onChange={(event) => setLoanAmount(event.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-300 focus:bg-white"
                  placeholder="Enter loan amount"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Tenure (weeks)</span>
                <input
                  value={loanWeeks}
                  onChange={(e) => setLoanWeeks(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-300 focus:bg-white"
                  placeholder="Enter number of weeks"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Collection frequency</span>
                <select
                  value={collectionFrequency}
                  onChange={(event) => setCollectionFrequency(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-300 focus:bg-white"
                >
                  <option>Weekly</option>
                  <option>Daily</option>
                  <option>Monthly</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">First EMI date</span>
                <input
                  type="date"
                  value={disbursementDate}
                  onChange={(event) => setDisbursementDate(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-300 focus:bg-white"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">End EMI date</span>
                <input
                  type="date"
                  value={resolvedDueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-300 focus:bg-white"
                />
              </label>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">First EMI date is used to calculate end EMI date and schedule.</p>

          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600/90">Loan summary preview</p>
            <LoanSummaryStatsGrid
              emiAmount={emiAmount}
              interestAmount={interestAmount}
              totalPayable={totalPayable}
              loanIssueDate={loanTimelinePreview.loanIssueDate}
              emiStartDate={loanTimelinePreview.emiStartDate}
              emiEndDate={loanTimelinePreview.emiEndDate}
            />
          </div>

          {error ? <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => navigate("/dashboard/loan-apply")}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || insufficientWalletForSave}
              title={
                insufficientWalletForSave
                  ? "Insufficient wallet balance — reduce principal increase or add capital"
                  : undefined
              }
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <CheckCircle2 className="h-4 w-4" />
              {loading ? "Saving..." : "Save loan"}
            </button>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
