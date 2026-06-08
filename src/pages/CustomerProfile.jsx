import { Component, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  History,
  IndianRupee,
  Pencil,
  Phone,
  Printer,
  ReceiptText,
  Search,
  UserRound,
} from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import { buildInstallmentSchedule, safeDate } from "../utils/customerProfileSchedule";
import { downloadCustomerProfilePdf } from "../utils/customerProfilePdf";
import { isImageAttachment, isPdfAttachment, openCustomerDocument } from "../utils/customerDocumentAttachments";

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function DocumentAttachmentCard({ label, name, url }) {
  const hasFile = Boolean(name);
  const canOpen = Boolean(url);

  if (!hasFile) {
    return (
      <li className="flex flex-col rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <span className="mt-1 text-sm text-slate-500">Not attached</span>
      </li>
    );
  }

  const openInNewTab = (event) => {
    event.preventDefault();
    openCustomerDocument(url);
  };

  return (
    <li className="flex flex-col rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      {canOpen && isImageAttachment(name, url) ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={openInNewTab}
          className="mt-2 w-fit rounded-lg border border-slate-200 bg-white p-0.5 transition hover:border-blue-200 hover:shadow-sm"
          title={`Open ${name} in a new tab`}
        >
          <img src={url} alt={name} className="h-24 w-24 rounded-lg object-cover" />
        </a>
      ) : null}
      {canOpen ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={openInNewTab}
          className="mt-2 text-left text-sm font-semibold text-blue-700 hover:underline"
          title="Open in new tab"
        >
          {name}
        </a>
      ) : (
        <span className="mt-1 text-sm text-slate-600">{name}</span>
      )}
      {canOpen ? (
        <span className="mt-1 text-[11px] text-slate-500">
          {isPdfAttachment(name, url) ? "Click to open PDF in a new tab" : "Click to open in a new tab"}
        </span>
      ) : (
        <span className="mt-1 text-[11px] text-slate-400">File content not stored for this record</span>
      )}
    </li>
  );
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function rowStatusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("paid") && !s.includes("overdue")) return "bg-emerald-50 text-emerald-900 font-semibold";
  if (s.includes("pending")) return "bg-amber-50 text-amber-900 font-semibold";
  if (s.includes("overdue") || s.includes("partial") || s.includes("late")) return "bg-rose-50 text-rose-900 font-semibold";
  return "bg-slate-50 text-slate-800";
}

function formatCrifDemoEligibility(value) {
  if (!value) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  if (typeof value !== "object") return "—";

  const pick = (key) => {
    const v = value?.[key];
    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
    return "";
  };

  const parts = [
    pick("eligibilityStatus"),
    pick("riskLevel"),
    pick("creditTier"),
    pick("creditScore"),
    pick("repaymentQuality"),
    pick("verificationStatus"),
    pick("financialStability"),
  ].filter(Boolean);

  if (parts.length) return parts.join(" · ");

  const knownAny = [
    "eligibilityStatus",
    "riskLevel",
    "creditTier",
    "creditScore",
    "repaymentQuality",
    "verificationStatus",
    "financialStability",
  ].some((k) => value?.[k] !== undefined);
  if (knownAny) return "Available";

  return "—";
}

class CustomerProfileErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message ? String(error.message) : "Unknown error" };
  }

  componentDidCatch(error) {
    // Helps correlate blank screens with actual runtime crashes.
    console.error("CustomerProfile crashed", error);
  }

  handleRetry = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  handleBack = () => {
    if (typeof window !== "undefined") window.location.assign("/dashboard/customer");
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <AdminLayout
        title="Customer profile"
        description=""
        action={
          <div className="no-print flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={this.handleBack}
              className="app-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
            >
              Back to customers
            </button>
          </div>
        }
      >
        <div className="mx-auto w-full max-w-md rounded-[24px] border border-rose-200 bg-white/95 p-6 text-slate-900 shadow-sm">
          <h2 className="text-lg font-semibold">Unable to load customer profile</h2>
          <p className="mt-2 text-sm text-slate-600">
            {this.state.errorMessage || "The page failed while rendering."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="app-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={this.handleBack}
              className="app-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Back
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }
}

function CustomerProfileContent() {
  const { customerId: rawCustomerId } = useParams();
  const customerId = typeof rawCustomerId === "string" ? rawCustomerId.trim() : "";
  const navigate = useNavigate();
  const { customers, entries, loading: syncLoading, error: syncError } = useLoanDataSync();
  const [profileSearch, setProfileSearch] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [timedOutCustomerId, setTimedOutCustomerId] = useState(null);

  const customerIdValid = customerId.length > 0 && customerId.length <= 80;
  const safeCustomers = useMemo(() => (Array.isArray(customers) ? customers : []), [customers]);
  const safeEntries = useMemo(() => (Array.isArray(entries) ? entries : []), [entries]);

  useEffect(() => {
    if (!customerIdValid) return undefined;
    if (!syncLoading) return undefined;
    const t = window.setTimeout(() => {
      setTimedOutCustomerId(customerId);
    }, 12000);
    return () => window.clearTimeout(t);
  }, [customerIdValid, syncLoading, customerId]);

  const customer = useMemo(() => {
    if (!customerIdValid) return null;
    return (
      safeCustomers.find((c) => String(c?.customerId || c?.id || "").trim() === customerId) || null
    );
  }, [safeCustomers, customerIdValid, customerId]);

  const customerEntries = useMemo(() => {
    if (!customerIdValid) return [];
    return safeEntries.filter((e) => String(e?.customerId || "").trim() === customerId);
  }, [safeEntries, customerIdValid, customerId]);

  const orderedIds = useMemo(() => {
    return safeCustomers
      .map((c) => c?.customerId || c?.id)
      .filter((v) => typeof v === "string" && v.trim().length > 0);
  }, [safeCustomers]);
  const navIndex = orderedIds.indexOf(customerId);
  const prevCustomerId = navIndex >= 0 && navIndex < orderedIds.length - 1 ? orderedIds[navIndex + 1] : null;
  const nextCustomerId = navIndex > 0 ? orderedIds[navIndex - 1] : null;

  const totalPayable = Number(customer?.totalPayable || 0);
  const principal = Number(customer?.loanAmount || 0);
  const interestAmount = Math.max(totalPayable - principal, 0);
  const approvedEntries = useMemo(
    () => customerEntries.filter((e) => String(e.approvalStatus || "").toLowerCase() === "approved"),
    [customerEntries]
  );
  const totalCollected = approvedEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
  const pendingBalance = Math.max(totalPayable - totalCollected, 0);
  const hasLoan = principal > 0;

  const schedule = useMemo(() => {
    if (!customer || !hasLoan) return [];
    return buildInstallmentSchedule(customer, customerEntries);
  }, [customer, customerEntries, hasLoan]);

  const firstEmiAmount = schedule[0]?.dueAmount ?? 0;

  const scheduleFiltered = useMemo(() => {
    const q = profileSearch.trim().toLowerCase();
    if (!q) return schedule;
    return schedule.filter((row) =>
      [row.status, row.collectedBy, row.remarks, String(row.installmentNumber), formatDateShort(row.dueDate)]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [schedule, profileSearch]);

  const timeline = useMemo(() => {
    if (!customer) return [];
    const rows = [];
    if (customer.submittedAt) {
      rows.push({ at: customer.submittedAt, label: "Customer registered", sort: new Date(customer.submittedAt).getTime() });
    }
    if (customer.loanApprovedAt) {
      rows.push({ at: customer.loanApprovedAt, label: "Loan approved", sort: new Date(customer.loanApprovedAt).getTime() });
    }
    if (customer.disbursementDate) {
      rows.push({ at: customer.disbursementDate, label: "Loan disbursed", sort: new Date(customer.disbursementDate).getTime() });
    }
    approvedEntries.forEach((e) => {
      const when = e.approvedAt || e.collectionDate || e.submittedAt;
      if (when) {
        rows.push({
          at: when,
          label: `EMI collected ${formatCurrency(e.amount)}`,
          sort: new Date(when).getTime(),
        });
      }
    });
    if (customer.closedAt) {
      rows.push({ at: customer.closedAt, label: "Loan closed", sort: new Date(customer.closedAt).getTime() });
    }
    rows.sort((a, b) => a.sort - b.sort);
    return rows;
  }, [customer, approvedEntries]);

  const badges = useMemo(() => {
    if (!customer) return [];
    const list = [];
    if (!customer.isArchived) list.push({ label: "Active", className: "bg-blue-50 text-blue-800 border-blue-200" });
    if (customer.isArchived) list.push({ label: "Archived", className: "bg-amber-100 text-amber-900 border-amber-200" });
    if (!hasLoan) list.push({ label: "Pending", className: "bg-slate-100 text-slate-800 border-slate-200" });
    else if (pendingBalance <= 0 && totalPayable > 0) list.push({ label: "Closed", className: "bg-emerald-100 text-emerald-900 border-emerald-200" });
    else list.push({ label: "Loan running", className: "bg-sky-100 text-sky-900 border-sky-200" });
    if (hasLoan && pendingBalance > 0 && customer.dueDate) {
      const due = safeDate(customer.dueDate);
      if (due && startOfDay(due) < startOfDay(new Date())) {
        list.push({ label: "Overdue risk", className: "bg-rose-100 text-rose-900 border-rose-200" });
      }
    }
    return list;
  }, [customer, hasLoan, pendingBalance, totalPayable]);

  useEffect(() => {
    if (customer?.customerName) {
      document.title = `${customer.customerName} — Profile`;
    }
    return () => {
      document.title = "Ruthra Financial Solutions";
    };
  }, [customer?.customerName]);

  const handlePdf = useCallback(async () => {
    if (!customer) return;
    setPdfBusy(true);
    try {
      const summaryLines = [
        { label: "Principal", value: formatCurrency(principal) },
        { label: "Total payable", value: formatCurrency(totalPayable) },
        { label: "Collected (approved)", value: formatCurrency(totalCollected) },
        { label: "Pending balance", value: formatCurrency(pendingBalance) },
        { label: "Co-applicant", value: customer.coApplicantName || "—" },
      ];
      const tl = timeline.map((t) => ({ date: formatDateTime(t.at), label: t.label }));
      await downloadCustomerProfilePdf({
        customer,
        scheduleRows: schedule,
        timeline: tl,
        summaryLines,
      });
    } finally {
      setPdfBusy(false);
    }
  }, [customer, principal, totalPayable, totalCollected, pendingBalance, schedule, timeline]);

  const loading = syncLoading && !customer;
  const showInvalidId = !syncLoading && !customerIdValid;
  const showSyncError = Boolean(syncError);
  const showNotFound = !syncLoading && customerIdValid && !customer && !syncError;
  const showTimeout = timedOutCustomerId === customerId && customerIdValid && !customer;

  const retry = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  if (showInvalidId) {
    return (
      <AdminLayout title="Customer profile" description="">
        <div className="app-panel rounded-[24px] p-8 text-center">
          <p className="text-slate-900 font-semibold">Customer profile not available</p>
          <p className="mt-2 text-sm text-slate-600">
            Invalid customer id. Please return to the customer list and open the profile again.
          </p>
          <Link to="/dashboard/customer" className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline">
            Back to customers
          </Link>
        </div>
      </AdminLayout>
    );
  }

  if (showSyncError) {
    return (
      <AdminLayout title="Customer profile" description="">
        <div className="app-panel rounded-[24px] p-8 text-center">
          <p className="text-slate-900 font-semibold">Unable to load customer profile</p>
          <p className="mt-2 text-sm text-slate-600">{syncError}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={retry} className="app-button-primary px-4 py-2 text-sm font-semibold">
              Retry
            </button>
            <Link
              to="/dashboard/customer"
              className="app-button-secondary inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Back
            </Link>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (showTimeout || showNotFound) {
    return (
      <AdminLayout title="Customer profile" description="">
        <div className="app-panel rounded-[24px] p-8 text-center">
          <p className="text-slate-900 font-semibold">
            {showTimeout ? "Unable to load customer profile" : "Customer profile not available"}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {showTimeout ? "Data sync timed out. Try again." : "Customer not found."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={retry} className="app-button-primary px-4 py-2 text-sm font-semibold">
              Retry
            </button>
            <Link to="/dashboard/customer" className="mt-0 inline-block text-sm font-semibold text-blue-700 hover:underline">
              Back to customers
            </Link>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const docItems = [
    { key: "id", label: "ID proof", name: customer?.idDocumentName, url: customer?.idDocumentDataUrl },
    { key: "addr", label: "Address proof", name: customer?.addressProofName, url: customer?.addressProofDataUrl },
    { key: "loan", label: "Loan agreement", name: customer?.loanAgreementName, url: customer?.loanAgreementDataUrl },
    { key: "photo", label: "Customer photo", name: customer?.customerPhotoName, url: customer?.customerPhotoDataUrl },
    { key: "coph", label: "Co-applicant photo", name: customer?.coApplicantPhotoName, url: customer?.coApplicantPhotoDataUrl },
    { key: "coid", label: "Co-applicant ID", name: customer?.coApplicantIdProofName, url: customer?.coApplicantIdProofDataUrl },
  ];

  return (
    <AdminLayout
      title="Customer profile"
      description=""
      action={
        <div className="no-print flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/dashboard/customer")}
            className="app-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            List
          </button>
        </div>
      }
    >
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-break { break-inside: avoid; }
        }
      `}</style>

      {loading ? (
        <div className="mx-auto w-full max-w-6xl space-y-4 rounded-[22px] border border-slate-200/60 bg-white p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <div className="flex shrink-0 items-center justify-center">
              <div className="h-28 w-28 animate-pulse rounded-2xl bg-slate-100" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-5 w-2/5 animate-pulse rounded bg-slate-100" />
              <div className="flex flex-wrap gap-2">
                <div className="h-6 w-24 animate-pulse rounded-full bg-slate-100" />
                <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
                <div className="h-6 w-28 animate-pulse rounded-full bg-slate-100" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="h-14 animate-pulse rounded-xl bg-slate-50" />
                <div className="h-14 animate-pulse rounded-xl bg-slate-50" />
              </div>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="h-44 animate-pulse rounded-xl bg-slate-50" />
            <div className="h-44 animate-pulse rounded-xl bg-slate-50" />
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-slate-50" />
          <p className="text-center text-sm text-slate-500">Loading customer profile…</p>
        </div>
      ) : customer ? (
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
          <aside className="no-print space-y-1 lg:sticky lg:top-4 lg:self-start">
            <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">On this page</p>
            {["#header", "#loan", "#emi", "#personal", "#documents", "#financial", "#timeline"].map((hash, i) => {
              const labels = ["Overview", "Loan", "EMI history", "Personal", "Documents", "Financial", "Timeline"];
              return (
                <a
                  key={hash}
                  href={hash}
                  className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  {labels[i]}
                </a>
              );
            })}
          </aside>

          <div className="min-w-0 space-y-4">
            <div id="header" className="scroll-mt-24 rounded-[22px] border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm print-break">
              <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {prevCustomerId ? (
                    <Link
                      to={`/dashboard/customer/${prevCustomerId}/profile`}
                      className="app-button-secondary inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Link>
                  ) : (
                    <span className="rounded-xl border border-dashed border-slate-200 px-3 py-1.5 text-xs text-slate-400">Previous</span>
                  )}
                  {nextCustomerId ? (
                    <Link
                      to={`/dashboard/customer/${nextCustomerId}/profile`}
                      className="app-button-secondary inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span className="rounded-xl border border-dashed border-slate-200 px-3 py-1.5 text-xs text-slate-400">Next</span>
                  )}
                </div>
                <div className="relative max-w-xs flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={profileSearch}
                    onChange={(e) => setProfileSearch(e.target.value)}
                    placeholder="Search in EMI rows…"
                    className="app-input h-9 w-full pl-9 text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4 md:flex-row md:items-start">
                <div className="flex shrink-0 justify-center md:justify-start">
                  {customer.customerPhotoDataUrl ? (
                    <img
                      src={customer.customerPhotoDataUrl}
                      alt=""
                      className="h-28 w-28 rounded-2xl border border-slate-200 object-cover shadow-md"
                    />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-600 to-blue-800 text-3xl font-bold text-white shadow-md">
                      {(customer.customerName || "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-bold text-slate-950 md:text-2xl">{customer.customerName || "Customer"}</h1>
                    {badges.map((b) => (
                      <span key={b.label} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${b.className}`}>
                        {b.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <p>
                      <span className="font-medium text-slate-500">Customer ID</span>
                      <br />
                      <span className="font-mono text-slate-900">{customer.customerId}</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <span>
                        <span className="font-medium text-slate-500">Phone</span>
                        <br />
                        {customer.mobileNumber || "—"}
                      </span>
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Aadhaar / ID</span>
                      <br />
                      <span className="break-all">{customer.identityNumber || "—"}</span>
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Co-applicant</span>
                      <br />
                      {customer.coApplicantName || "—"}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Centre</span>
                      <br />
                      {customer.selectedDay || "—"}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Loan status (record)</span>
                      <br />
                      {customer.loanStatus || "—"}
                    </p>
                  </div>

                  <div className="no-print mt-4 flex flex-wrap gap-2">
                    <Link
                      to={`/dashboard/loan-apply/${customer.customerId}`}
                      state={{ customer }}
                      className="app-button-primary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                    >
                      <Banknote className="h-4 w-4" />
                      Apply loan
                    </Link>
                    <Link
                      to="/dashboard/collection"
                      className="app-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                    >
                      <ReceiptText className="h-4 w-4" />
                      Add collection
                    </Link>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="app-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                    >
                      <Printer className="h-4 w-4" />
                      Print report
                    </button>
                    <button
                      type="button"
                      disabled={pdfBusy}
                      onClick={handlePdf}
                      className="app-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                    >
                      <Download className="h-4 w-4" />
                      {pdfBusy ? "PDF…" : "Download PDF"}
                    </button>
                    <Link
                      to={`/dashboard/customer/${customer.customerId}`}
                      className="app-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit customer
                    </Link>
                    <Link
                      to="/dashboard/collection"
                      className="app-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                    >
                      <History className="h-4 w-4" />
                      View transactions
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {hasLoan ? (
              <section id="loan" className="scroll-mt-24 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm print-break">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-blue-700">
                  <IndianRupee className="h-4 w-4" />
                  Loan information
                </h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Loan amount", formatCurrency(principal)],
                    ["Interest (est.)", formatCurrency(interestAmount)],
                    ["EMI amount", formatCurrency(firstEmiAmount)],
                    ["Loan start", formatDateShort(customer.disbursementDate || customer.loanApprovedAt || customer.submittedAt)],
                    ["Due date", formatDateShort(customer.dueDate)],
                    ["Paid amount", formatCurrency(totalCollected)],
                    ["Pending amount", formatCurrency(pendingBalance)],
                    ["Remaining balance", formatCurrency(pendingBalance)],
                    ["Loan status", customer.loanStatus || (pendingBalance <= 0 ? "Settled" : "Active")],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{k}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{v}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                No active loan on file. Use <strong>Apply loan</strong> to start a loan application.
              </section>
            )}

            <section id="emi" className="scroll-mt-24 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm print-break">
              <h2 className="text-sm font-bold uppercase tracking-wide text-blue-700">EMI and collection history</h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100">
                <table className="min-w-[880px] w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      <th className="px-3 py-2">EMI date</th>
                      <th className="px-3 py-2 text-right">EMI amount</th>
                      <th className="px-3 py-2 text-right">Collected</th>
                      <th className="px-3 py-2 text-right">Pending</th>
                      <th className="px-3 py-2">Payment status</th>
                      <th className="px-3 py-2">Collected by</th>
                      <th className="px-3 py-2">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleFiltered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          No rows to show.
                        </td>
                      </tr>
                    ) : (
                      scheduleFiltered.map((row) => (
                        <tr key={row.installmentNumber} className="border-b border-slate-100">
                          <td className="whitespace-nowrap px-3 py-2 text-slate-800">{formatDateShort(row.dueDate)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.dueAmount)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-800">{formatCurrency(row.paidAmount)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-amber-800">{formatCurrency(row.pendingAmount)}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${rowStatusClass(row.status)}`}>{row.status}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-700">{row.collectedBy}</td>
                          <td className="max-w-[200px] px-3 py-2 text-xs text-slate-600">{row.remarks || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="personal" className="scroll-mt-24 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm print-break">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-blue-700">
                <UserRound className="h-4 w-4" />
                Personal details
              </h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  ["Name", customer.customerName],
                  ["Phone", customer.mobileNumber],
                  ["Alternate number", customer.alternateNumber],
                  ["Address", customer.address],
                  ["Aadhaar / ID number", customer.identityNumber],
                  ["ID type", customer.identityType],
                  ["Co-applicant name", customer.coApplicantName],
                  ["Co-applicant contact", customer.coApplicantContact],
                  ["Co-applicant relation", customer.coApplicantRelation],
                  ["Co-applicant address", customer.coApplicantAddress],
                  ["Co-applicant ID", customer.coApplicantIdentityNumber],
                ].map(([label, val]) => (
                  <div key={label}>
                    <dt className="text-[11px] font-semibold uppercase text-slate-500">{label}</dt>
                    <dd className="mt-0.5 text-sm text-slate-900">{val || "—"}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section id="documents" className="scroll-mt-24 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm print-break">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-blue-700">
                <FileText className="h-4 w-4" />
                Uploaded documents
              </h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {docItems.map((d) => (
                  <DocumentAttachmentCard key={d.key} label={d.label} name={d.name} url={d.url} />
                ))}
              </ul>
            </section>

            <section id="financial" className="scroll-mt-24 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm print-break">
              <h2 className="text-sm font-bold uppercase tracking-wide text-blue-700">Financial information</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">CRIF eligibility (demo)</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{formatCrifDemoEligibility(customer.crifDemoEligibility)}</p>
                  <p className="mt-1 text-[10px] text-slate-500">Last check: {formatDateTime(customer.lastEligibilityCheckedAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">Credit / eligibility notes</p>
                  <p className="mt-1 text-sm text-slate-800">Loan eligibility follows internal policy and KYC.</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">Wallet impact (collections in)</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-800">{formatCurrency(totalCollected)}</p>
                  <p className="text-[10px] text-slate-500">Approved posts attributed to this customer</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">Collection summary</p>
                  <p className="mt-1 text-sm">
                    Approved: {approvedEntries.length} · Pending:{" "}
                    {customerEntries.filter((e) => String(e.approvalStatus || "").toLowerCase() !== "approved").length}
                  </p>
                </div>
              </div>
            </section>

            <section id="timeline" className="scroll-mt-24 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm print-break">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-blue-700">
                <Calendar className="h-4 w-4" />
                Activity timeline
              </h2>
              <ol className="relative mt-4 border-l border-slate-200 pl-6">
                {timeline.map((item, idx) => (
                  <li key={`${item.sort}-${idx}`} className="mb-6 last:mb-0">
                    <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-white bg-blue-600 shadow" />
                    <p className="text-xs font-semibold text-slate-500">{formatDateTime(item.at)}</p>
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}

export default function CustomerProfile() {
  return (
    <CustomerProfileErrorBoundary>
      <CustomerProfileContent />
    </CustomerProfileErrorBoundary>
  );
}
