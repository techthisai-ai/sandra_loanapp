import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Loader2,
  Printer,
  Search,
  Share2,
  X,
  CheckCircle2,
} from "lucide-react";
import BrandLogo from "../BrandLogo";
import { BRAND_COMPANY_NAME, BRAND_SUPPORT_EMAIL } from "../../constants/brand";
import { formatCurrencyForPrint, toPrintCurrencyText } from "../../utils/formatCurrency.js";
import { ExportToolbar, ExportToolbarButton } from "./ExportToolbar.jsx";

/**
 * @typedef {Object} PreviewMetric
 * @property {import("react").ComponentType<{ className?: string }>} [icon]
 * @property {string} label
 * @property {string} value
 * @property {string} [note]
 * @property {"emerald"|"blue"|"amber"|"rose"|"slate"|"teal"} [tone]
 */

/**
 * @typedef {Object} PreviewColumn
 * @property {string} key
 * @property {string} label
 * @property {"left"|"center"|"right"} [align]
 * @property {"text"|"currency"|"status"|"date"} [cellType]
 * @property {boolean} [sortable]
 */

/**
 * @typedef {Object} ReportMeta
 * @property {string} [reportId]
 * @property {string} [preparedBy]
 * @property {string} [branch]
 * @property {string} [contact]
 * @property {string} [center]
 */

const METRIC_TONES = {
  emerald: "from-emerald-50 to-white border-emerald-100/80 text-emerald-700",
  blue: "from-blue-50 to-white border-blue-100/80 text-blue-700",
  amber: "from-amber-50 to-white border-amber-100/80 text-amber-800",
  rose: "from-rose-50 to-white border-rose-100/80 text-rose-700",
  teal: "from-teal-50 to-white border-teal-100/80 text-teal-700",
  slate: "from-slate-50 to-white border-slate-100/80 text-slate-700",
};

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadgeClass(raw) {
  const v = String(raw || "").toLowerCase();
  if (v.includes("approv")) return "border-blue-200/90 bg-blue-50 text-blue-800 shadow-sm shadow-blue-100/50";
  if (v.includes("reject") || v.includes("declin")) return "border-rose-200/90 bg-rose-50 text-rose-800 shadow-sm shadow-rose-100/50";
  if (v.includes("collect") && !v.includes("partial")) return "border-emerald-200/90 bg-emerald-50 text-emerald-800 shadow-sm shadow-emerald-100/50";
  if (v.includes("skip")) return "border-slate-200 bg-slate-100 text-slate-700";
  if (v.includes("overdue") || v.includes("late")) return "border-rose-900/20 bg-rose-950/90 text-rose-50 shadow-sm";
  if (v.includes("pend") || v.includes("partial") || v.includes("resched"))
    return "border-amber-200/90 bg-amber-50 text-amber-900 shadow-sm shadow-amber-100/40";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function parseSortableValue(cellType, val) {
  if (cellType === "currency") {
    const n = Number(String(val).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  if (cellType === "date") {
    const t = new Date(val).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return String(val ?? "").toLowerCase();
}

function formatCellDisplay(cellType, val) {
  if (val == null || val === "") return "—";
  if (cellType === "currency" && typeof val === "number") return formatCurrencyForPrint(val);
  if (cellType === "date") {
    if (val instanceof Date && !Number.isNaN(val.getTime())) return val.toLocaleDateString("en-GB");
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("en-GB");
  }
  return String(val);
}

function buildPremiumPrintHtml({ title, subtitle, generatedAt, filterLines, reportMeta, metrics, columns, rows }) {
  const metaRows = [
    reportMeta?.reportId ? `Report ID: ${reportMeta.reportId}` : "",
    reportMeta?.preparedBy ? `Prepared by: ${reportMeta.preparedBy}` : "",
    reportMeta?.branch || reportMeta?.center ? `Center: ${reportMeta.branch || reportMeta.center}` : "",
    reportMeta?.contact ? `Contact: ${reportMeta.contact}` : "",
  ].filter(Boolean);

  const metricHtml = metrics.length
    ? `<div class="metrics">${metrics
        .map(
          (m) =>
            `<div class="metric"><div class="ml">${escapeHtml(m.label)}</div><div class="mv">${escapeHtml(toPrintCurrencyText(m.value))}</div>${m.note ? `<div class="mn">${escapeHtml(toPrintCurrencyText(m.note))}</div>` : ""}</div>`
        )
        .join("")}</div>`
    : "";

  const filterHtml = filterLines.length
    ? `<ul class="filters">${filterLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`
    : "";

  const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => {
            const raw = row[c.key];
            const text = escapeHtml(formatCellDisplay(c.cellType, raw));
            const align = c.align === "right" ? "right" : c.align === "center" ? "center" : "left";
            if (c.cellType === "status") {
              return `<td class="${align}"><span class="badge">${text}</span></td>`;
            }
            return `<td class="${align}">${text}</td>`;
          })
          .join("")}</tr>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;700&display=swap" />
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Noto Sans Tamil", "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 0; padding: 0; font-size: 10px; font-variant-numeric: normal; letter-spacing: normal; }
  .wrap { padding: 0; }
  .band { background: linear-gradient(135deg, #f0f9ff 0%, #f8fafc 50%, #fff 100%); border-bottom: 2px solid #0d9488; padding: 14px 16px 12px; margin-bottom: 14px; }
  .brand { font-size: 9px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #0369a1; margin: 0 0 4px; }
  h1 { margin: 0; font-size: 18px; font-weight: 700; color: #0f172a; }
  .sub { margin: 4px 0 0; color: #475569; font-size: 11px; }
  .meta-grid { display: flex; flex-wrap: wrap; gap: 12px 24px; margin-top: 10px; font-size: 9px; color: #64748b; }
  .filters { list-style: none; padding: 0; margin: 10px 0 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .filters li { background: #fff; border: 1px solid #e2e8f0; border-radius: 999px; padding: 3px 10px; font-size: 9px; }
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 14px; }
  .metric { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; background: #fff; }
  .ml { font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-weight: 600; }
  .mv { font-size: 14px; font-weight: 700; margin-top: 4px; color: #0f172a; }
  .mn { font-size: 8px; color: #94a3b8; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
  th { background: #0f4d5c; color: #f8fafc; font-size: 8px; text-transform: uppercase; letter-spacing: 0.06em; padding: 7px 6px; text-align: left; }
  td { border-bottom: 1px solid #f1f5f9; padding: 6px; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .right { text-align: right; }
  .center { text-align: center; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 8px; font-weight: 600; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
  .footer { margin-top: 16px; text-align: center; font-size: 8px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
</style></head><body><div class="wrap">
  <div class="band">
    <p class="brand">${BRAND_COMPANY_NAME}</p>
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ""}
    <div class="meta-grid">
      <span>Generated · ${escapeHtml(generatedAt)}</span>
      ${metaRows.map((r) => `<span>${escapeHtml(r)}</span>`).join("")}
    </div>
    ${filterHtml}
  </div>
  ${metricHtml}
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  <p class="footer">Generated from ${BRAND_COMPANY_NAME} System · Confidential — authorised use only</p>
</div></body></html>`;
}

/**
 * Reusable full report preview (modal). Parent supplies data + export handlers.
 */
export default function EnterpriseReportPreview({
  open,
  onClose,
  title,
  subtitle = "",
  generatedAt,
  filterLines = [],
  metrics = [],
  columns = [],
  rows = [],
  pageSize = 12,
  reportMeta = null,
  onDownloadPdf,
  onDownloadExcel,
  onPrint,
  pdfLoading = false,
  excelLoading = false,
  printLoading = false,
  shareTitle = "Report",
  children = null,
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(/** @type {string | null} */ (null));
  const [sortDir, setSortDir] = useState(/** @type {"asc"|"desc"} */ ("asc"));
  const [page, setPage] = useState(1);
  const [printPreviewMode, setPrintPreviewMode] = useState(false);
  const [toast, setToast] = useState(/** @type {{ message: string } | null} */ (null));
  const printFrameRef = useRef(/** @type {HTMLIFrameElement | null} */ (null));

  useEffect(() => {
    if (!open) {
      setSearch("");
      setPage(1);
      setPrintPreviewMode(false);
      setToast(null);
    }
  }, [open]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => columns.some((col) => String(row[col.key] ?? "").toLowerCase().includes(q)));
  }, [rows, columns, search]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const col = columns.find((c) => c.key === sortKey);
    const cellType = col?.cellType || "text";
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const va = parseSortableValue(cellType, a[sortKey]);
      const vb = parseSortableValue(cellType, b[sortKey]);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filteredRows, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    if (printPreviewMode) return sortedRows;
    const start = (safePage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, safePage, pageSize, printPreviewMode]);

  const handleSort = useCallback(
    (key) => {
      const col = columns.find((c) => c.key === key);
      if (col && col.sortable === false) return;
      if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSortKey(key);
        setSortDir("asc");
      }
      setPage(1);
    },
    [columns, sortKey]
  );

  const runPremiumIframePrint = useCallback(() => {
    const html = buildPremiumPrintHtml({
      title,
      subtitle,
      generatedAt,
      filterLines,
      reportMeta,
      metrics,
      columns,
      rows: sortedRows,
    });

    let frame = printFrameRef.current;
    if (!frame) {
      frame = document.createElement("iframe");
      frame.setAttribute("title", "Report print");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
      document.body.appendChild(frame);
      printFrameRef.current = frame;
    }

    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        /* ignore */
      }
    }, 400);
  }, [columns, filterLines, generatedAt, metrics, reportMeta, sortedRows, subtitle, title]);

  const handlePrintInternal = useCallback(() => {
    if (onPrint) {
      void Promise.resolve(onPrint()).then(() => setToast({ message: "Print dialog opened" }));
      return;
    }
    runPremiumIframePrint();
    setToast({ message: "Print-ready layout sent to printer" });
  }, [onPrint, runPremiumIframePrint]);

  const handlePdfClick = useCallback(async () => {
    if (!onDownloadPdf) return;
    try {
      await onDownloadPdf();
      setToast({ message: "PDF downloaded successfully" });
    } catch {
      setToast({ message: "PDF export failed — try again" });
    }
  }, [onDownloadPdf]);

  const handleExcelClick = useCallback(async () => {
    if (!onDownloadExcel) return;
    try {
      await onDownloadExcel();
      setToast({ message: "Excel file downloaded" });
    } catch {
      setToast({ message: "Excel export failed — try again" });
    }
  }, [onDownloadExcel]);

  const handleShare = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `${title}${subtitle ? ` — ${subtitle}` : ""}\n${generatedAt}\n${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setToast({ message: "Summary copied to clipboard" });
      }
    } catch {
      /* user cancelled */
    }
  }, [generatedAt, shareTitle, subtitle, title]);

  if (!open) return null;

  const meta = reportMeta || {};

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4 print:static print:inset-auto print:block print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="erp-preview-title"
    >
      <button type="button" className="absolute inset-0 cursor-default print:hidden" aria-label="Close overlay" onClick={onClose} />
      <div
        className={`erp-report-shell relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-200/90 bg-[var(--app-surface,#fff)] shadow-[0_24px_80px_rgba(15,23,42,0.22)] print:max-h-none print:max-w-none print:rounded-none print:border-0 print:shadow-none ${printPreviewMode ? "print-preview-mode" : ""}`}
      >
        <div className="erp-report-watermark pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden opacity-[0.035] print:opacity-[0.06]">
          <span className="rotate-[-24deg] text-[4.5rem] font-black uppercase tracking-[0.35em] text-slate-900 sm:text-[6rem]">RFS</span>
        </div>

        <div className="erp-preview-toolbar relative flex flex-shrink-0 flex-col gap-2 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-teal-50/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 print:hidden">
          <ExportToolbar className="min-w-0 w-full sm:w-auto">
            {onDownloadPdf ? (
              <ExportToolbarButton variant="pdf" loading={pdfLoading} disabled={pdfLoading} onClick={() => void handlePdfClick()}>
                PDF
              </ExportToolbarButton>
            ) : null}
            {onDownloadExcel ? (
              <ExportToolbarButton variant="excel" loading={excelLoading} disabled={excelLoading} onClick={() => void handleExcelClick()}>
                Excel
              </ExportToolbarButton>
            ) : null}
            <ExportToolbarButton variant="print" loading={printLoading} disabled={printLoading} onClick={handlePrintInternal}>
              Print
            </ExportToolbarButton>
            <ExportToolbarButton
              variant="neutral"
              onClick={() => setPrintPreviewMode((v) => !v)}
              className={printPreviewMode ? "border-teal-300 bg-teal-50 text-teal-900" : ""}
            >
              <span className="sm:hidden">{printPreviewMode ? "Paged" : "Preview"}</span>
              <span className="hidden sm:inline">{printPreviewMode ? "Paged view" : "Print preview"}</span>
            </ExportToolbarButton>
            <ExportToolbarButton variant="neutral" icon={Share2} onClick={() => void handleShare()}>
              Share
            </ExportToolbarButton>
          </ExportToolbar>
          <button
            type="button"
            onClick={onClose}
            className="erp-preview-close-btn inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-rose-50 hover:text-rose-700 sm:w-auto"
          >
            <X className="h-3.5 w-3.5" />
            Close
          </button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 print:overflow-visible print:px-8 print:py-6">
          <header className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-blue-50/60 p-4 shadow-[0_4px_24px_rgba(15,23,42,0.06)] sm:p-6">
            <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-teal-500/5 to-transparent" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <BrandLogo variant="sm" className="shrink-0 drop-shadow-sm" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-teal-700">{BRAND_COMPANY_NAME}</p>
                  <h2 id="erp-preview-title" className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                    {title}
                  </h2>
                  {subtitle ? <p className="mt-1 text-sm font-medium text-slate-600">{subtitle}</p> : null}
                  <p className="mt-2.5 text-xs text-slate-500">
                    <span className="font-semibold text-slate-600">Generated</span> · {generatedAt}
                  </p>
                </div>
              </div>
              <div className="grid shrink-0 gap-2 text-xs sm:min-w-[220px] sm:text-right">
                {meta.reportId ? (
                  <p>
                    <span className="font-semibold uppercase tracking-wider text-slate-400">Report ID</span>
                    <br />
                    <span className="font-mono text-sm font-semibold text-slate-800">{meta.reportId}</span>
                  </p>
                ) : null}
                {meta.preparedBy ? (
                  <p>
                    <span className="font-semibold uppercase tracking-wider text-slate-400">Prepared by</span>
                    <br />
                    <span className="font-medium text-slate-800">{meta.preparedBy}</span>
                  </p>
                ) : null}
                {meta.branch || meta.center ? (
                  <p>
                    <span className="font-semibold uppercase tracking-wider text-slate-400">Center</span>
                    <br />
                    <span className="font-medium text-slate-800">{meta.branch || meta.center}</span>
                  </p>
                ) : null}
                {meta.contact ? (
                  <p className="text-slate-600">{meta.contact}</p>
                ) : null}
              </div>
            </div>
            {filterLines.length ? (
              <ul className="relative mt-4 flex flex-wrap gap-2">
                {filterLines.map((line) => (
                  <li
                    key={line}
                    className="rounded-full border border-white/80 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur-sm"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}
          </header>

          {metrics.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              {metrics.map((m) => {
                const Icon = m.icon;
                const tone = METRIC_TONES[m.tone || "blue"] || METRIC_TONES.blue;
                return (
                  <div
                    key={m.label}
                    className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 shadow-[0_2px_16px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-lg ${tone}`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent" />
                    <div className="relative flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{m.label}</p>
                        <p className="mt-2 text-lg font-bold tracking-tight text-slate-950 sm:text-xl">{m.value}</p>
                        {m.note ? <p className="mt-1 text-[11px] text-slate-500">{m.note}</p> : null}
                      </div>
                      {Icon ? (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/60 bg-white/80 text-teal-700 shadow-sm backdrop-blur-sm">
                          <Icon className="h-4 w-4" />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {children}

          <div className="mt-6 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:p-4 print:border-slate-300 print:shadow-none">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between print:hidden">
              <p className="text-sm font-bold text-slate-900">Register detail</p>
              <div className="relative min-w-0 w-full sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search in report…"
                  aria-label="Search in report"
                  className="app-input reports-detail-toolbar-filter-control reports-detail-toolbar-search erp-report-detail-search w-full rounded-xl border-slate-200 bg-slate-50/80 text-sm"
                />
              </div>
            </div>

            <div className="max-h-[min(52vh,520px)] overflow-auto rounded-xl border border-slate-100 bg-slate-50/30 print:max-h-none print:overflow-visible">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-[2] bg-gradient-to-b from-slate-100 to-slate-50 shadow-[0_1px_0_0_#e2e8f0]">
                  <tr>
                    {columns.map((col) => {
                      const active = sortKey === col.key;
                      return (
                        <th
                          key={col.key}
                          className={`whitespace-nowrap border-b border-slate-200 px-3 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600 ${
                            col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSort(col.key)}
                            className="inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-inherit transition hover:bg-white/80 print:pointer-events-none"
                          >
                            {col.label}
                            {active ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> : null}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-slate-500">
                        No records match your search.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row, idx) => (
                      <tr
                        key={row.__key ?? idx}
                        className="border-b border-slate-100/80 transition-colors odd:bg-white even:bg-slate-50/70 hover:bg-blue-50/40 print:hover:bg-transparent"
                      >
                        {columns.map((col) => {
                          const raw = row[col.key];
                          const align = col.align === "right" ? "text-right tabular-nums" : col.align === "center" ? "text-center" : "text-left";
                          if (col.cellType === "status") {
                            return (
                              <td key={col.key} className={`px-3 py-2.5 ${align}`}>
                                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusBadgeClass(raw)}`}>
                                  {String(raw ?? "—")}
                                </span>
                              </td>
                            );
                          }
                          return (
                            <td key={col.key} className={`px-3 py-2.5 text-slate-800 ${align}`}>
                              {formatCellDisplay(col.cellType, raw)}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {!printPreviewMode ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 print:hidden">
                <span>
                  Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sortedRows.length)} of {sortedRows.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="px-2 font-medium">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs font-medium text-teal-700 print:hidden">Print preview — all {sortedRows.length} rows visible</p>
            )}
          </div>

          <footer className="mt-6 border-t border-slate-100 pt-4 text-center">
            <p className="text-[11px] font-semibold text-slate-500">Generated from {BRAND_COMPANY_NAME} System</p>
            <p className="mt-1 text-[10px] text-slate-400">
              Confidential — for authorised use only · {BRAND_SUPPORT_EMAIL} · +91 44 0000 0000
            </p>
          </footer>
        </div>

        {toast ? (
          <div
            role="status"
            className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-lg print:hidden"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {toast.message}
          </div>
        ) : null}
      </div>
    </div>
  );
}
