import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  IdCard,
  ListChecks,
  Phone,
  Printer,
  Send,
  UserRound,
} from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import { upsertLoanApplication } from "../services/userAuth";
import {
  downloadLoanSheetHtml,
  formatCurrency,
  formatDisplayDate,
  openPrintableLoanSheet,
} from "../utils/loanSheet";

function readDraftFromStorage() {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem("loanApplicationDraft");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export default function LoanApplicationReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const [draft] = useState(() => location.state?.customerDraft ?? readDraftFromStorage());
  const [form, setForm] = useState({
    nomineeName: draft?.nomineeName || "",
    nomineeContact: draft?.nomineeContact || "",
    additionalContact: draft?.additionalContact || "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(null);

  useEffect(() => {
    if (!draft) {
      navigate("/dashboard/loan-applications", { replace: true });
    }
  }, [draft, navigate]);

  const loanSheetData = useMemo(
    () => {
      if (!draft) return null;
      return {
        loanId: completed?.applicationId || draft.applicationId || draft.loanId || "LOAN",
        customerId: draft.customerId || "--",
        customerName: draft.customerName || "--",
        mobileNumber: draft.mobileNumber || "--",
        collectionDay: draft.selectedDay || "--",
        nomineeName: form.nomineeName || draft.nomineeName || "--",
        nomineeContact: form.nomineeContact || draft.nomineeContact || "--",
        loanPresetLabel: draft.loanPresetLabel || "",
        loanAmount: toNumber(draft.loanAmount),
        loanWeeks: toNumber(draft.loanWeeks),
        emiAmount: toNumber(draft.weeklyDue || draft.emiAmount),
        interestAmount: toNumber(draft.interestAmount),
        totalPayable: toNumber(draft.totalPayable),
        disbursementDate: draft.disbursementDate,
        dueDate: draft.dueDate,
        collectionFrequency: draft.collectionFrequency || "Weekly",
      };
    },
    [completed?.applicationId, draft, form.nomineeContact, form.nomineeName]
  );

  const downloadLoanSheet = () => {
    if (!loanSheetData) return;
    downloadLoanSheetHtml(loanSheetData);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.nomineeName?.trim()) {
      setError("Please enter nominee name");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await upsertLoanApplication({
        customerId: draft.customerId,
        applicationId: draft.applicationId,
        customerName: draft.customerName,
        mobileNumber: draft.mobileNumber,
        alternateNumber: draft.alternateNumber,
        identityType: draft.identityType,
        identityNumber: draft.identityNumber,
        address: draft.address,
        country: draft.country,
        selectedDay: draft.selectedDay,
        loanAmount: draft.loanAmount,
        loanWeeks: draft.loanWeeks,
        loanPresetId: draft.loanPresetId,
        loanPresetLabel: draft.loanPresetLabel,
        loanPresetLoanAmount: draft.loanPresetLoanAmount,
        loanPresetLoanWeeks: draft.loanPresetLoanWeeks,
        loanPresetEmiAmount: draft.loanPresetEmiAmount,
        loanPresetInterestAmount: draft.loanPresetInterestAmount,
        loanPresetTotalPayable: draft.loanPresetTotalPayable,
        disbursementDate: draft.disbursementDate,
        dueDate: draft.dueDate,
        collectionFrequency: draft.collectionFrequency,
        nomineeName: form.nomineeName,
        nomineeContact: form.nomineeContact,
        additionalContact: form.additionalContact,
        idDocumentName: draft.idDocumentName,
        idDocumentDataUrl: draft.idDocumentDataUrl || "",
        addressProofName: draft.addressProofName,
        addressProofDataUrl: draft.addressProofDataUrl || "",
        loanAgreementName: draft.loanAgreementName,
        loanAgreementDataUrl: draft.loanAgreementDataUrl || "",
        supportingDocumentNames: draft.supportingDocumentNames || [],
        coApplicantName: draft.coApplicantName,
        coApplicantContact: draft.coApplicantContact,
        coApplicantRelation: draft.coApplicantRelation,
        coApplicantAddress: draft.coApplicantAddress,
        coApplicantIdentityType: draft.coApplicantIdentityType,
        coApplicantIdentityNumber: draft.coApplicantIdentityNumber,
        coApplicantIdProofName: draft.coApplicantIdProofName,
        coApplicantIdProofDataUrl: draft.coApplicantIdProofDataUrl || "",
        coApplicantPhotoName: draft.coApplicantPhotoName,
        coApplicantPhotoDataUrl: draft.coApplicantPhotoDataUrl || "",
        customerPhotoName: draft.customerPhotoName || "",
        customerPhotoDataUrl: draft.customerPhotoDataUrl || "",
        isArchived: draft.isArchived,
        archivedAt: draft.archivedAt || null,
        loanStatus: "active",
        closedAt: null,
        rescheduledAt: draft.rescheduledAt || null,
        rescheduleReason: draft.rescheduleReason || "",
      });

      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("loanApplicationDraft");
      }

      setCompleted({
        customerId: result.customerId,
        applicationId: result.applicationId,
      });
    } catch (submitError) {
      setError(submitError.message || "Unable to update application");
    } finally {
      setLoading(false);
    }
  };

  if (completed && loanSheetData) {
    return (
      <AdminLayout
        title="Loan applications"
        description="Loan application completed. Download or print the EMI sheet below."
      >
        <div className="grid w-full max-w-6xl gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-emerald-700">Completed</p>
                <h3 className="text-xl font-semibold tracking-tight text-slate-900">Loan EMI sheet ready</h3>
              </div>
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl border border-emerald-200 bg-white p-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 px-4 py-3 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Loan ID</p>
                <p className="mt-1 break-all text-sm font-bold text-slate-900">{loanSheetData.loanId}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Customer</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{loanSheetData.customerName}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Loan amount</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{formatCurrency(loanSheetData.loanAmount)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">EMI amount</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{formatCurrency(loanSheetData.emiAmount)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Preset</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{loanSheetData.loanPresetLabel || "Custom amount"}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Interest amount</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{formatCurrency(loanSheetData.interestAmount)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total payable</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{formatCurrency(loanSheetData.totalPayable)}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={downloadLoanSheet}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Download Excel sheet
              </button>
              <button
                type="button"
                onClick={() => openPrintableLoanSheet(loanSheetData)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" />
                Print sheet
              </button>
            </div>

            <button
              type="button"
              onClick={() => navigate("/dashboard/customer", { replace: true, state: { createdCustomerId: completed.customerId } })}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-700"
            >
              Back to Customer List
            </button>
          </section>

          <aside className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Sheet summary</p>
            <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <ListChecks className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{loanSheetData.nomineeName}</p>
                  <p className="text-sm text-slate-600">{loanSheetData.nomineeContact}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600">
              This EMI sheet includes the key loan values that can be downloaded or printed after completion.
            </div>

            <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
              <div className="space-y-2 text-sm text-slate-700">
                <p><span className="font-medium text-slate-900">Mobile:</span> {loanSheetData.mobileNumber}</p>
                <p><span className="font-medium text-slate-900">Day:</span> {loanSheetData.collectionDay}</p>
                <p><span className="font-medium text-slate-900">Due date:</span> {formatDisplayDate(loanSheetData.dueDate)}</p>
                <p><span className="font-medium text-slate-900">Frequency:</span> {loanSheetData.collectionFrequency}</p>
              </div>
            </div>
          </aside>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Loan applications"
      description="Step 3 of 3. Update nominee contacts and save the application."
    >
      <div className="grid w-full max-w-6xl gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <ListChecks className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Step 3</p>
              <h3 className="text-xl font-semibold tracking-tight text-slate-900">Update details</h3>
            </div>
          </div>

          <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Customer</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{draft?.customerName}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Mobile</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{draft?.mobileNumber}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Loan amount</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{draft?.loanAmount}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Weekly due</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{draft?.weeklyDue}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Weeks</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{draft?.loanWeeks}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Day</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{draft?.selectedDay}</p>
            </div>
          </div>

          <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <UserRound className="h-4 w-4 text-blue-600" />
                Nominee name *
              </span>
              <input
                value={form.nomineeName}
                onChange={(event) => setForm((current) => ({ ...current, nomineeName: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                placeholder="Enter nominee name"
              />
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Phone className="h-4 w-4 text-blue-600" />
                Nominee contact (optional)
              </span>
              <input
                value={form.nomineeContact}
                onChange={(event) => setForm((current) => ({ ...current, nomineeContact: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                placeholder="Enter nominee contact"
              />
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Phone className="h-4 w-4 text-blue-600" />
                Additional contact
              </span>
              <input
                value={form.additionalContact}
                onChange={(event) => setForm((current) => ({ ...current, additionalContact: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                placeholder="Optional additional contact"
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate("/dashboard/loan-applications/date", { state: { customerDraft: draft } })}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Send className="h-4 w-4" />
                {loading ? "Saving..." : "Complete application"}
              </button>
            </div>
          </form>
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Final review</p>
          <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600">
            After completion, the EMI sheet will be available for download and print on this screen.
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <IdCard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">{draft?.identityType}</p>
                <p className="text-sm text-slate-600">{draft?.identityNumber}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-blue-600" />
              <p className="font-medium text-slate-900">Auto date and time saved</p>
            </div>
            <p className="mt-2">The application stores the submit time automatically when the button is clicked.</p>
          </div>
        </aside>
      </div>
    </AdminLayout>
  );
}
