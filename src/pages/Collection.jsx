import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  ClipboardList,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  Search,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import EnterpriseReportPreview from "../components/reports/EnterpriseReportPreview.jsx";
import { useLoanDataSync } from "../context/LoanDataSyncContext";
import useAuth from "../hooks/useAuth";
import {
  approveCustomerAmountEntry,
  bulkApproveCustomerAmountEntries,
  bulkRejectCustomerAmountEntries,
  rejectCustomerAmountEntry,
} from "../services/userAuth";
import CollectionApprovalTable from "../components/collection/CollectionApprovalTable";
import { useSearchParams } from "react-router-dom";
import { downloadCollectionRegisterXlsx } from "../utils/collectionReportExports.js";
import {
  downloadCollectionRegisterPdf,
  printCollectionRegisterPdf,
} from "../utils/collectionRegisterReportPdf.js";
import { reportDateStamp } from "../utils/reportFilenames.js";
import { ApprovalRegisterPanel } from "./ApprovalPage";
import CollectionReportPanel from "../components/collection/CollectionReportPanel.jsx";
import { normalizeCollectionFrequency as normalizeFrequency } from "../utils/loanTimelineDates";

const FREQUENCY_OPTIONS = ["All", "Daily", "Weekly", "Monthly"];
const STATUS_OPTIONS = ["All", "Collected", "Partial Payment", "Skipped", "Rescheduled", "Pending"];

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
];

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB");
}

function sanitizeFileName(value) {
  return String(value || "collection-sheet")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getLabelText(label) {
  return Array.isArray(label) ? label.join(" ") : label;
}

function makeCsv(rows) {
  const header = EXPORT_COLUMNS.map((column) => `"${getLabelText(column.label)}"`).join(",");
  const body = rows.map((row) =>
    EXPORT_COLUMNS.map((column) => `"${String(row[column.key] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  return [header, ...body].join("\n");
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function parseGbDate(value) {
  if (!value || value === "--") return null;
  const text = String(value).trim();
  const slash = text.split("/");
  if (slash.length === 3) {
    const d = new Date(Number(slash[2]), Number(slash[1]) - 1, Number(slash[0]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameCalendarDay(a, b = new Date()) {
  if (!a) return false;
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

function CollectionStats({ label, value, icon: Icon }) {
  return (
    <div className="app-panel-muted rounded-[26px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function Collection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const mainTab =
    tabParam === "collections" ? "collections" : tabParam === "approvals" ? "approvals" : "report";

  const setMainTab = (tab) => {
    setSearchParams({ tab });
  };

  const { user, profile } = useAuth();
  const { customers, entries, loading: syncLoading, error: syncError } = useLoanDataSync();
  const [actionError, setActionError] = useState("");
  const [frequencyFilter, setFrequencyFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [collectionPreviewOpen, setCollectionPreviewOpen] = useState(false);
  const [collectionPdfExportLoading, setCollectionPdfExportLoading] = useState(false);
  const [collectionExcelExportLoading, setCollectionExcelExportLoading] = useState(false);
  const [collectionPrintLoading, setCollectionPrintLoading] = useState(false);

  const loading = syncLoading;
  const error = syncError || actionError;

  const collectionRows = useMemo(() => {
    const approvedCustomers = customers.filter((customer) => String(customer.approvalStatus || "").toLowerCase() === "approved");
    const customerMap = new Map(approvedCustomers.map((customer) => [customer.customerId, customer]));
    return entries
      .map((entry) => {
        const customer = customerMap.get(entry.customerId);
        if (!customer) return null;

        const customerFrequency = normalizeFrequency(customer.collectionFrequency);
        return {
          entryId: entry.entryId || entry.id || `${entry.customerId}-${entry.collectionDate || entry.submittedAt || ""}`,
          customerId: customer.customerId || "",
          customerName: customer.customerName || "Unnamed customer",
          center: customer.selectedDay || "Not available",
          collectionFrequency: customerFrequency,
          dueDate: formatDate(customer.dueDate),
          collectionDate: formatDate(entry.collectionDate || entry.submittedAt),
          amount: Number(entry.amount || 0),
          paymentMethod: entry.paymentMethod || "Cash",
          collectorName: entry.collectorName || "Employee",
          collectionStatus: entry.collectionStatus || "Collected",
          remarks: entry.note || "",
          approvalStatus: String(entry.approvalStatus || "pending").toLowerCase(),
          approvedAt: entry.approvedAt || "",
          rejectedAt: entry.rejectedAt || "",
          loanAmount: Number(customer.loanAmount || 0),
          totalPayable: Number(customer.totalPayable || 0),
        };
      })
      .filter(Boolean);
  }, [customers, entries]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return collectionRows.filter((row) => {
      const matchesFrequency = frequencyFilter === "All" || row.collectionFrequency === frequencyFilter;
      const matchesStatus = statusFilter === "All" || row.collectionStatus === statusFilter;
      const matchesSearch =
        !query ||
        row.customerName.toLowerCase().includes(query) ||
        row.customerId.toLowerCase().includes(query) ||
        row.center.toLowerCase().includes(query) ||
        row.collectorName.toLowerCase().includes(query);
      return matchesFrequency && matchesStatus && matchesSearch;
    });
  }, [collectionRows, frequencyFilter, search, statusFilter]);

  const totals = useMemo(() => {
    const approvalOf = (row) => String(row.approvalStatus || "pending").toLowerCase();
    const isApprovedPayment = (row) => approvalOf(row) === "approved";
    const isRejectedPayment = (row) => approvalOf(row) === "rejected";

    const base = {
      totalCollected: 0,
      totalDue: 0,
      totalOutstanding: 0,
      pendingAmount: 0,
      collectedToday: 0,
      dueCount: 0,
      customerIds: new Set(),
      approvedPaymentCustomerIds: new Set(),
      records: filteredRows.length,
      daily: 0,
      weekly: 0,
      monthly: 0,
    };
    const today = new Date();

    const payableByCustomer = new Map();
    const approvedPaidByCustomer = new Map();

    filteredRows.forEach((row) => {
      const cid = row.customerId;
      if (cid) {
        base.customerIds.add(cid);
        const payable = Number(row.totalPayable || 0);
        if (!payableByCustomer.has(cid)) payableByCustomer.set(cid, payable);
      }
      const amount = Number(row.amount || 0);
      const status = String(row.collectionStatus || "").toLowerCase();
      const due = parseGbDate(row.dueDate);
      const collectedOn = parseGbDate(row.collectionDate);

      if (isApprovedPayment(row)) {
        base.totalCollected += amount;
        if (cid) {
          approvedPaidByCustomer.set(cid, (approvedPaidByCustomer.get(cid) || 0) + amount);
          base.approvedPaymentCustomerIds.add(cid);
        }
        if (isSameCalendarDay(collectedOn, today)) base.collectedToday += amount;
      } else if (!isRejectedPayment(row)) {
        base.pendingAmount += amount;
      }

      if (due && due < today && !status.includes("collect")) base.dueCount += 1;
      if (row.collectionFrequency === "Daily") base.daily += 1;
      if (row.collectionFrequency === "Weekly") base.weekly += 1;
      if (row.collectionFrequency === "Monthly") base.monthly += 1;
    });

    payableByCustomer.forEach((payable, cid) => {
      base.totalDue += payable;
      const paid = approvedPaidByCustomer.get(cid) || 0;
      base.totalOutstanding += Math.max(payable - paid, 0);
    });

    return base;
  }, [filteredRows]);

  const recoveryPct = totals.totalDue > 0 ? Math.min(100, Math.round((totals.totalCollected / totals.totalDue) * 100)) : 0;

  const exportTitle = `Collection Sheet - ${frequencyFilter} - ${statusFilter}`;

  const collectionReportMeta = useMemo(
    () => ({
      reportId: `RFS-CR-${reportDateStamp()}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
      preparedBy: profile?.displayName || user?.email || "Operations",
      branch: frequencyFilter === "All" ? "All centers" : `Frequency: ${frequencyFilter}`,
      contact: "support@ruthra.financial",
    }),
    [frequencyFilter, profile?.displayName, user?.email]
  );

  const collectionPdfPayload = useMemo(
    () => ({
      title: "Collection register",
      subtitle: exportTitle,
      filterLines: [
        `Frequency: ${frequencyFilter}`,
        `Status: ${statusFilter}`,
        ...(search.trim() ? [`Search: "${search.trim()}"`] : []),
      ],
      summaryCards: [
        { label: "Total collected (approved)", value: formatCurrency(totals.totalCollected) },
        { label: "Pending approval (amount)", value: formatCurrency(totals.pendingAmount) },
        { label: "Customers", value: String(totals.customerIds.size) },
        { label: "Collected today", value: formatCurrency(totals.collectedToday) },
        { label: "Due / overdue rows", value: String(totals.dueCount) },
        { label: "Recovery", value: `${recoveryPct}%`, note: "Collected vs payable" },
      ],
      rows: filteredRows,
      reportMeta: collectionReportMeta,
    }),
    [collectionReportMeta, exportTitle, filteredRows, frequencyFilter, recoveryPct, search, statusFilter, totals]
  );

  const collectionPreviewColumns = useMemo(
    () => [
      { key: "customerName", label: "Customer" },
      { key: "customerId", label: "Customer ID" },
      { key: "center", label: "Center" },
      { key: "collectionFrequency", label: "Type" },
      { key: "dueDate", label: "Due date" },
      { key: "collectionDate", label: "Collected on" },
      { key: "amount", label: "Amount", cellType: "currency", align: "right" },
      { key: "paymentMethod", label: "Method" },
      { key: "collectorName", label: "Collector" },
      { key: "collectionStatus", label: "Status", cellType: "status" },
      { key: "remarks", label: "Remarks" },
    ],
    []
  );

  const collectionPreviewRows = useMemo(
    () =>
      filteredRows.map((row, i) => ({
        __key: row.entryId || `${row.customerId}-${i}`,
        ...row,
        amount: Number(row.amount || 0),
      })),
    [filteredRows]
  );

  const collectionPreviewMetrics = useMemo(
    () => [
      { icon: Wallet, label: "Total collections", value: formatCurrency(totals.totalCollected), note: "Approved payments in current view", tone: "teal" },
      { icon: Clock, label: "Pending (approx.)", value: formatCurrency(totals.pendingAmount), note: "Pending / partial rows", tone: "amber" },
      { icon: Users, label: "Total customers", value: String(totals.customerIds.size), note: "Unique in view", tone: "blue" },
      { icon: TrendingUp, label: "Collected today", value: formatCurrency(totals.collectedToday), note: "Same-day receipts", tone: "emerald" },
      { icon: AlertCircle, label: "Due count", value: String(totals.dueCount), note: "Past due, not collected", tone: "rose" },
      { icon: CheckCircle2, label: "Recovery", value: `${recoveryPct}%`, note: "Collected vs payable", tone: "slate" },
    ],
    [recoveryPct, totals]
  );

  const collectionPreviewFilterLines = useMemo(
    () => [`Frequency: ${frequencyFilter}`, `Status: ${statusFilter}`, ...(search.trim() ? [`Search: "${search.trim()}"`] : [])],
    [frequencyFilter, statusFilter, search]
  );

  const handleCollectionPreviewPdf = useCallback(async () => {
    setCollectionPdfExportLoading(true);
    try {
      await downloadCollectionRegisterPdf(collectionPdfPayload);
    } finally {
      setCollectionPdfExportLoading(false);
    }
  }, [collectionPdfPayload]);

  const handleCollectionPrint = useCallback(async () => {
    setCollectionPrintLoading(true);
    try {
      await printCollectionRegisterPdf(collectionPdfPayload);
    } finally {
      setCollectionPrintLoading(false);
    }
  }, [collectionPdfPayload]);

  const handleCollectionPreviewExcel = useCallback(async () => {
    setCollectionExcelExportLoading(true);
    try {
      await Promise.resolve();
      downloadCollectionRegisterXlsx(filteredRows);
    } finally {
      setCollectionExcelExportLoading(false);
    }
  }, [filteredRows]);

  const handleApprove = async (entryId) => {
    setSavingId(entryId);
    setStatusMessage("");
    setActionError("");
    try {
      await approveCustomerAmountEntry(entryId);
      setStatusMessage("Amount approved successfully");
    } catch (approveError) {
      setActionError(approveError.message || "Unable to approve entry");
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
      setActionError(rejectError.message || "Unable to reject entry");
    } finally {
      setSavingId("");
    }
  };

  const handleBulkApprove = async (ids) => {
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
    <AdminLayout title="Collection" description=" ">
      <div className="app-grid-page grid min-w-0 gap-4">
        <div className="flex w-full justify-end">
          <div className="app-segmented w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setMainTab("collections")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                mainTab === "collections" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Collections
            </button>
            <button
              type="button"
              onClick={() => setMainTab("report")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                mainTab === "report" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Collection Report
            </button>
            <button
              type="button"
              onClick={() => setMainTab("approvals")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                mainTab === "approvals" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Approvals
            </button>
          </div>
        </div>

        {mainTab === "approvals" ? (
          <ApprovalRegisterPanel />
        ) : mainTab === "report" ? (
          <CollectionReportPanel />
        ) : (
          <section className="app-panel min-w-0 p-5 md:p-6">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <CollectionStats
                icon={Wallet}
                label="Total collected"
                value={formatCurrency(totals.totalCollected)}
              />
              <CollectionStats
                icon={ClipboardList}
                label="Collection records"
                value={String(totals.records)}
              />
              <CollectionStats
                icon={FileText}
                label="Outstanding total"
                value={formatCurrency(totals.totalOutstanding)}
              />
              <CollectionStats
                icon={Download}
                label="Approved customers"
                value={String(totals.approvedPaymentCustomerIds.size)}
              />
            </div>

            <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search customer, center, collector..."
                  className="app-input w-full !pl-11 pr-4 bg-slate-50"
                />
              </div>

              <select
                value={frequencyFilter}
                onChange={(event) => setFrequencyFilter(event.target.value)}
                className="app-select"
              >
                {FREQUENCY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} Collection
                  </option>
                ))}
              </select>

              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="app-select">
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCollectionPreviewOpen(true)}
                  className="group inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/70 hover:text-blue-900"
                >
                  <Eye className="h-4 w-4 shrink-0 text-blue-600 transition group-hover:scale-105" aria-hidden />
                  View Report
                </button>
                <button
                  type="button"
                  disabled={collectionExcelExportLoading}
                  onClick={handleCollectionPreviewExcel}
                  className="app-button-secondary inline-flex items-center gap-2 rounded-2xl border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                >
                  {collectionExcelExportLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                      Excel…
                    </span>
                  ) : (
                    <>
                      <FileSpreadsheet className="h-4 w-4" />
                      Excel
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => downloadFile(makeCsv(filteredRows), `collection-register-${reportDateStamp()}.csv`, "text/csv;charset=utf-8;")}
                  className="app-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  CSV
                </button>
                <button
                  type="button"
                  disabled={collectionPdfExportLoading}
                  onClick={() => {
                    setCollectionPreviewOpen(true);
                  }}
                  className="app-button-secondary inline-flex items-center gap-2 rounded-2xl border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
                >
                  <FileText className="h-4 w-4" />
                  Report & PDF
                </button>
              </div>
            </div>

            {error ? <div className="app-alert-error mt-5">{error}</div> : null}
            {statusMessage ? <div className="app-alert-success mt-5">{statusMessage}</div> : null}

            <div className="mt-4 min-w-0">
              <CollectionApprovalTable
                rows={filteredRows}
                loading={loading}
                savingId={savingId}
                bulkProcessing={bulkProcessing}
                onApprove={handleApprove}
                onReject={handleReject}
                onBulkApprove={handleBulkApprove}
                onBulkReject={handleBulkReject}
                showRemarksColumn={false}
                emptyMessage="No collection rows match the selected filters."
              />
            </div>
          </section>
        )}
      </div>

      <EnterpriseReportPreview
        open={collectionPreviewOpen}
        onClose={() => setCollectionPreviewOpen(false)}
        title="Collection register"
        subtitle={exportTitle}
        generatedAt={new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
        filterLines={collectionPreviewFilterLines}
        metrics={collectionPreviewMetrics}
        columns={collectionPreviewColumns}
        rows={collectionPreviewRows}
        pageSize={15}
        pdfLoading={collectionPdfExportLoading}
        excelLoading={collectionExcelExportLoading}
        reportMeta={collectionReportMeta}
        onDownloadPdf={handleCollectionPreviewPdf}
        onDownloadExcel={handleCollectionPreviewExcel}
        onPrint={handleCollectionPrint}
        printLoading={collectionPrintLoading}
        shareTitle="Collection register — Ruthra"
      />
    </AdminLayout>
  );
}
