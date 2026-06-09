import { useCallback, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import EnterpriseReportPreview from "../components/reports/EnterpriseReportPreview.jsx";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import useReportMeta from "../hooks/useReportMeta";
import CollectionApprovalTable from "../components/collection/CollectionApprovalTable";
import { resolveCollectionEntryDisplayStatus } from "../utils/collectionEntryDisplay.js";
import {
  approveCustomerAmountEntry,
  bulkApproveCustomerAmountEntries,
  bulkRejectCustomerAmountEntries,
  rejectCustomerAmountEntry,
} from "../services/userAuth";
import { downloadApprovalRegisterXlsx } from "../utils/collectionReportExports";
import { reportDateStamp } from "../utils/reportFilenames";
import {
  downloadApprovalRegisterPdf,
  printApprovalRegisterPdf,
} from "../utils/approvalRegisterReportPdf";
import { normalizeCollectionFrequency as normalizeFrequency } from "../utils/loanTimelineDates";

const VIEW_OPTIONS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
];

const EXPORT_COLUMNS = [
  { key: "customerName", label: "Customer Name" },
  { key: "customerId", label: "Customer ID" },
  { key: "center", label: "Center" },
  { key: "collectionFrequency", label: "Collection Type" },
  { key: "dueDate", label: "Due Date" },
  { key: "collectionDate", label: "Collection Date" },
  { key: "amount", label: "Collected Amount" },
  { key: "paymentMethod", label: "Payment Method" },
  { key: "collectorName", label: "Collector Name" },
  { key: "collectionStatus", label: "Status" },
  { key: "remarks", label: "Remarks" },
  { key: "approvalStatus", label: "Approval Status" },
  { key: "approvedAt", label: "Approved At" },
  { key: "rejectedAt", label: "Rejected At" },
];

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

const APPROVAL_STAT_ACCENTS = {
  blue: {
    card: "border-blue-200 bg-blue-50/50",
    label: "text-blue-800/75",
    icon: "bg-blue-100 text-blue-600",
  },
  orange: {
    card: "border-amber-200 bg-amber-50/50",
    label: "text-amber-800/75",
    icon: "bg-amber-100 text-amber-600",
  },
  green: {
    card: "border-emerald-200 bg-emerald-50/50",
    label: "text-emerald-800/75",
    icon: "bg-emerald-100 text-emerald-600",
  },
  purple: {
    card: "border-violet-200 bg-violet-50/50",
    label: "text-violet-800/75",
    icon: "bg-violet-100 text-violet-600",
  },
};

function ApprovalStats({ label, value, icon: Icon, accent = "blue" }) {
  const tone = APPROVAL_STAT_ACCENTS[accent] || APPROVAL_STAT_ACCENTS.blue;

  return (
    <div className={`rounded-xl border px-3 py-2.5 shadow-sm ${tone.card}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`min-w-0 text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] ${tone.label}`}>
          {label}
        </p>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-1.5 text-center text-lg font-semibold tabular-nums leading-tight tracking-tight text-slate-950 sm:text-xl">
        {value}
      </p>
    </div>
  );
}

/** Full approval register UI (used on Collection page and legacy route). */
export function ApprovalRegisterPanel() {
  const { customers, entries, loading, error: syncError } = useLoanDataSync();
  const reportMeta = useReportMeta("RFS-APR");
  const [actionError, setActionError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [savingId, setSavingId] = useState("");
  const [view, setView] = useState("pending");
  const [search, setSearch] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const error = syncError || actionError;

  const customerMap = useMemo(() => {
    const map = {};
    customers.forEach((customer) => {
      map[customer.customerId] = customer;
    });
    return map;
  }, [customers]);

  const tableRows = useMemo(() => {
    return entries
      .map((entry) => {
        const customer = customerMap[entry.customerId];
        if (!customer) return null;

        return {
          entryId: entry.entryId || entry.id || `${entry.customerId}-${entry.collectionDate || entry.submittedAt || ""}`,
          customerName: customer.customerName || entry.customerName || "Unnamed customer",
          customerId: customer.customerId || entry.customerId || "",
          center: customer.selectedDay || "Not available",
          collectionFrequency: normalizeFrequency(customer.collectionFrequency),
          dueDate: formatDate(customer.dueDate),
          collectionDate: formatDate(entry.collectionDate || entry.submittedAt),
          amount: Number(entry.amount || 0),
          paymentMethod: entry.paymentMethod || "Cash",
          collectorName: entry.collectorName || "Employee",
          collectionStatus: entry.collectionStatus || "Pending",
          collectionDisplayStatus: resolveCollectionEntryDisplayStatus(entry, customer),
          remarks: entry.note || "",
          approvalStatus: String(entry.approvalStatus || "pending").toLowerCase(),
          approvedAt: formatDate(entry.approvedAt),
          rejectedAt: formatDate(entry.rejectedAt),
        };
      })
      .filter(Boolean)
      .filter((row) => {
        const query = search.trim().toLowerCase();
        const matchesView = view === "pending" ? row.approvalStatus !== "approved" : row.approvalStatus === "approved";
        const matchesSearch =
          !query ||
          row.customerName.toLowerCase().includes(query) ||
          row.customerId.toLowerCase().includes(query) ||
          row.center.toLowerCase().includes(query) ||
          row.collectorName.toLowerCase().includes(query);
        return matchesView && matchesSearch;
      });
  }, [customerMap, entries, search, view]);

  const pendingEntries = useMemo(() => entries.filter((entry) => String(entry.approvalStatus || "").toLowerCase() !== "approved"), [entries]);
  const approvedEntries = useMemo(() => entries.filter((entry) => String(entry.approvalStatus || "").toLowerCase() === "approved"), [entries]);

  const totals = useMemo(() => {
    return tableRows.reduce(
      (acc, row) => {
        acc.totalAmount += Number(row.amount || 0);
        acc.customers.add(row.customerId);
        return acc;
      },
      { totalAmount: 0, customers: new Set() }
    );
  }, [tableRows]);

  const exportTitle = `Approval Sheet - ${view === "pending" ? "Pending" : "Approved"}`;

  const previewColumns = useMemo(
    () =>
      EXPORT_COLUMNS.map((col) => {
        const base = { key: col.key, label: col.label, sortable: true };
        if (col.key === "amount") return { ...base, cellType: "currency", align: "right" };
        if (col.key === "collectionStatus" || col.key === "approvalStatus") return { ...base, cellType: "status" };
        return base;
      }),
    []
  );

  const previewRows = useMemo(
    () =>
      tableRows.map((row) => ({
        ...row,
        __key: row.entryId,
        approvalStatus: row.approvalStatus === "approved" ? "Approved" : row.approvalStatus === "rejected" ? "Rejected" : "Pending",
        collectionStatus: row.collectionStatus || "—",
      })),
    [tableRows]
  );

  const previewFilterLines = useMemo(() => {
    const lines = [`View: ${view === "pending" ? "Pending approval" : "Approved"}`];
    if (search.trim()) lines.push(`Search: "${search.trim()}"`);
    return lines;
  }, [search, view]);

  const previewMetrics = useMemo(
    () => [
      { icon: Wallet, label: "Register entries", value: String(entries.length), note: "All loaded collections", tone: "slate" },
      { icon: Clock3, label: "Pending", value: String(pendingEntries.length), note: "Awaiting approval", tone: "amber" },
      { icon: CheckCircle2, label: "Approved", value: String(approvedEntries.length), note: "Approved in system", tone: "blue" },
      { icon: Users, label: "Filtered customers", value: String(totals.customers.size), note: "In current view", tone: "teal" },
      { icon: BarChart3, label: "Filtered amount", value: formatCurrency(totals.totalAmount), note: "Sum of visible rows", tone: "emerald" },
      { icon: Download, label: "Rows in report", value: String(tableRows.length), note: exportTitle, tone: "slate" },
    ],
    [approvedEntries.length, entries.length, exportTitle, pendingEntries.length, tableRows.length, totals]
  );

  const approvalPdfPayload = useMemo(
    () => ({
      title: "Approval register",
      subtitle: exportTitle,
      filterLines: previewFilterLines,
      summaryCards: previewMetrics.map((m) => ({ label: m.label, value: m.value, note: m.note })),
      rows: tableRows,
      reportMeta,
    }),
    [exportTitle, previewFilterLines, previewMetrics, reportMeta, tableRows]
  );

  const handleApprovalPdf = useCallback(async () => {
    setPdfLoading(true);
    try {
      await downloadApprovalRegisterPdf(approvalPdfPayload);
    } catch (err) {
      console.error(err);
      window.alert("Could not generate PDF. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  }, [approvalPdfPayload]);

  const handleApprovalExcel = useCallback(async () => {
    setExcelLoading(true);
    try {
      downloadApprovalRegisterXlsx(tableRows, reportDateStamp(), {
        title: exportTitle,
        generatedAt: reportMeta.generatedLabel,
        filterLines: previewFilterLines,
      });
    } finally {
      setExcelLoading(false);
    }
  }, [exportTitle, previewFilterLines, reportMeta.generatedLabel, tableRows]);

  const handleApprovalPrint = useCallback(async () => {
    setPrintLoading(true);
    try {
      await printApprovalRegisterPdf(approvalPdfPayload);
    } catch (err) {
      console.error(err);
      window.alert("Could not open print dialog. Try downloading PDF instead.");
    } finally {
      setPrintLoading(false);
    }
  }, [approvalPdfPayload]);

  const handleApprove = async (entryId) => {
    setSavingId(entryId);
    setStatusMessage("");
    setActionError("");
    try {
      await approveCustomerAmountEntry(entryId);
      setStatusMessage("Amount approved successfully");
    } catch (approveError) {
      setActionError(approveError.message || "Unable to approve");
    } finally {
      setSavingId("");
    }
  };

  const handleReject = async (entryId) => {
    setSavingId(entryId);
    setStatusMessage("");
    setActionError("");
    try {
      await rejectCustomerAmountEntry(entryId);
      setStatusMessage("Entry rejected successfully");
    } catch (rejectError) {
      setActionError(rejectError.message || "Unable to reject");
    } finally {
      setSavingId("");
    }
  };

  const handleBulkApprove = async (ids) => {
    if (!ids.length || bulkProcessing) return;
    setBulkProcessing(true);
    setStatusMessage("");
    setActionError("");
    try {
      const result = await bulkApproveCustomerAmountEntries(ids);
      const failedNote = result.failed.length ? ` (${result.failed.length} failed)` : "";
      const skippedNote = result.skipped ? ` · ${result.skipped} skipped` : "";
      setStatusMessage(
        `${result.approved} payment${result.approved === 1 ? "" : "s"} approved successfully${skippedNote}${failedNote}`
      );
      if (result.failed.length) {
        setActionError(`Could not approve ${result.failed.length} entr${result.failed.length === 1 ? "y" : "ies"}.`);
      }
    } catch (bulkError) {
      setActionError(bulkError.message || "Bulk approval failed");
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkReject = async (ids, rejectionNote) => {
    if (!ids.length || bulkProcessing) return;
    setBulkProcessing(true);
    setStatusMessage("");
    setActionError("");
    try {
      const result = await bulkRejectCustomerAmountEntries(ids, { rejectionNote });
      const failedNote = result.failed.length ? ` (${result.failed.length} failed)` : "";
      const skippedNote = result.skipped ? ` · ${result.skipped} skipped` : "";
      setStatusMessage(
        `${result.rejected} payment${result.rejected === 1 ? "" : "s"} rejected successfully${skippedNote}${failedNote}`
      );
      if (result.failed.length) {
        setActionError(`Could not reject ${result.failed.length} entr${result.failed.length === 1 ? "y" : "ies"}.`);
      }
    } catch (bulkError) {
      setActionError(bulkError.message || "Bulk rejection failed");
    } finally {
      setBulkProcessing(false);
    }
  };

  return (
    <section className="app-panel min-w-0 max-w-full p-5 md:p-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ApprovalStats
              icon={Wallet}
              label="Total entries"
              value={String(entries.length)}
              accent="blue"
            />
            <ApprovalStats
              icon={Clock3}
              label="Pending"
              value={String(pendingEntries.length)}
              accent="orange"
            />
            <ApprovalStats
              icon={CheckCircle2}
              label="Approved"
              value={String(approvedEntries.length)}
              accent="green"
            />
            <ApprovalStats
              icon={Download}
              label="Filtered total"
              value={formatCurrency(totals.totalAmount)}
              accent="purple"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <div className="relative w-full max-w-xs sm:w-56 md:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer, center, collector..."
                className="app-input w-full !min-h-[40px] !py-2 !pl-10 !pr-3 text-sm bg-slate-50"
              />
            </div>

            <div className="app-segmented w-full sm:w-auto">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setView(option.key)}
                  className={`min-h-[40px] rounded-xl px-4 py-2 text-sm font-medium transition ${
                    view === option.key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {option.label} View
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="app-button-primary inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold shadow-sm"
            >
              <FileText className="h-4 w-4" />
              Report &amp; export
            </button>

            <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
              Live sync
            </span>
          </div>

          {error ? (
            <div className="app-alert-error mt-5">
              {error}
            </div>
          ) : null}

          {statusMessage ? (
            <div className="app-alert-success mt-5">
              {statusMessage}
            </div>
          ) : null}

          <div className="mt-4 min-w-0 max-w-full">
            <CollectionApprovalTable
              rows={tableRows}
              loading={loading}
              savingId={savingId}
              bulkProcessing={bulkProcessing}
              onApprove={handleApprove}
              onReject={handleReject}
              onBulkApprove={handleBulkApprove}
              onBulkReject={handleBulkReject}
              showRemarksColumn
              emptyMessage="No approval rows match the selected view."
            />
          </div>

      <EnterpriseReportPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Approval register"
        subtitle={exportTitle}
        generatedAt={reportMeta.generatedLabel}
        filterLines={previewFilterLines}
        metrics={previewMetrics}
        columns={previewColumns}
        rows={previewRows}
        pageSize={12}
        reportMeta={reportMeta}
        pdfLoading={pdfLoading}
        excelLoading={excelLoading}
        printLoading={printLoading}
        onDownloadPdf={handleApprovalPdf}
        onDownloadExcel={handleApprovalExcel}
        onPrint={handleApprovalPrint}
        shareTitle="Approval register — Ruthra"
      />
    </section>
  );
}

export default function ApprovalPage() {
  return (
    <AdminLayout title="Approval page" description="Review and approve collection entries.">
      <div className="app-grid-page grid gap-4">
        <ApprovalRegisterPanel />
      </div>
    </AdminLayout>
  );
}
