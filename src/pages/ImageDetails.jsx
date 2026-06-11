import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Database, Download, FileSearch, FileSpreadsheet, FileText, Search, SquarePen } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import logoUrl from "../assets/logo.jpeg";
import AdminLayout from "../components/dashboard/AdminLayout";
import { CUSTOMER_DAY_FILTER_OPTIONS, loadCentersWithDay } from "../constants/dayCenters";
import { LOAN_CENTERS_CHANGED_EVENT } from "../constants/loanCenterStorage";
import useAuth from "../hooks/useAuth";
import { listAllCustomerAmountEntries, listCustomers } from "../services/userAuth";
import { getCustomerCountry, hasAppliedForLoan } from "../utils/customerSheets";

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function formatDate(value) {
  if (!value) return "Pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return value || "--";
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function getAllCenters() {
  return loadCentersWithDay();
}

function resolveRootDay(dayLabel) {
  if (!dayLabel) return null;
  const centers = getAllCenters();
  let current = dayLabel.trim();
  for (let i = 0; i < 10; i++) {
    const found = centers.find((c) => c.label === current);
    if (!found) break;
    if (!found.parent) return found.label;
    current = found.parent;
  }
  const matched = DAY_NAMES.find((d) => current.toLowerCase().startsWith(d.toLowerCase()));
  return matched ? current : null;
}

function resolveDayName(dayLabel) {
  const root = resolveRootDay(dayLabel);
  if (!root) return null;
  const matched = DAY_NAMES.find((d) => root.toLowerCase().startsWith(d.toLowerCase()));
  return matched || root.split(/\s+/)[0];
}

function formatCenterName(dayLabel, dateValue) {
  const day = resolveDayName(dayLabel);
  if (!day) return "Not available";
  const baseDate = dateValue ? new Date(dateValue) : null;
  const validDate = baseDate && !Number.isNaN(baseDate.getTime()) ? baseDate : new Date();
  const month = String(validDate.getMonth() + 1).padStart(2, "0");
  const year = validDate.getFullYear();
  return day + "-" + month + "-" + year;
}

const sheetColumns = [
  { key: "sno", label: "SNO", width: "4%", align: "text-center" },
  { key: "center", label: "Center", width: "8%", align: "text-center" },
  { key: "centerName", label: ["Center", "Name"], width: "8%", align: "text-center" },
  { key: "customerId", label: ["Customer", "ID"], width: "10%", align: "text-center" },
  { key: "customerName", label: ["Customer", "Name"], width: "9%", align: "text-left" },
  { key: "customerMobile", label: ["Customer", "Mobile No"], width: "8%", align: "text-center" },
  { key: "otherMobile", label: ["Other", "Mobile No"], width: "8%", align: "text-center" },
  { key: "loanAmount", label: ["Loan", "Amt"], width: "6%", align: "text-center" },
  { key: "principal", label: "Principal", width: "6%", align: "text-center" },
  { key: "progressAmount", label: "EMI Amt", width: "5%", align: "text-center" },
  { key: "disbursementDate", label: ["Loan Dispose", "Date"], width: "7%", align: "text-center" },
  { key: "dueDate", label: "Due Date", width: "6%", align: "text-center" },
  { key: "onTime", label: ["Loan Start", "Date"], width: "7%", align: "text-center" },
  { key: "week", label: "Week", width: "4%", align: "text-center" },
  { key: "collectedWeek", label: ["Collected", "Week"], width: "6%", align: "text-center" },
  { key: "pendingWeek", label: ["Pending", "Week"], width: "6%", align: "text-center" },
  { key: "od", label: "OD", width: "4%", align: "text-center" },
];

function renderHeaderLabel(label) {
  if (!Array.isArray(label)) {
    return label;
  }

  return (
    <span className="flex flex-col items-center leading-tight">
      {label.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </span>
  );
}

function getLabelText(label) {
  return Array.isArray(label) ? label.join(" ") : label;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFileName(value) {
  return String(value || "export")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSheetHtml(rows, title, logoSrc) {
  const tableRows = rows
    .map(
      (row) =>
        `<tr>${sheetColumns.map((c) => `<td>${escapeHtml(row[c.key] ?? "")}</td>`).join("")}</tr>`
    )
    .join("");

  const headerCells = sheetColumns
    .map((c) => `<th>${escapeHtml(getLabelText(c.label)).replace(/\s+/g, " ")}</th>`)
    .join("");

  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" alt="Logo" style="height:56px;width:auto;object-fit:contain;" />`
    : "";

  return `
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: landscape; margin: 12mm; }
          body { font-family: Arial, sans-serif; padding: 0; font-size: 10px; color: #0f172a; }
          .header { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
          .header-text h1 { margin: 0; font-size: 20px; font-weight: 700; color: #0f172a; }
          .header-text p { margin: 2px 0 0; font-size: 11px; color: #64748b; }
          p.meta { margin: 0 0 10px; color: #64748b; font-size: 10px; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; vertical-align: top; }
          th { background: #f1f5f9; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }
          td { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          tr:nth-child(even) { background: #f8fafc; }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoHtml}
          <div class="header-text">
            <h1>RUTHRA FINANCIAL</h1>
            <p>Collection Centre Sheet</p>
          </div>
        </div>
        <p class="meta">Report: ${escapeHtml(title)} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString("en-IN")}</p>
        <table>
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `;
}

function downloadSheetHtml(rows, filename, title, logoSrc) {
  const blob = new Blob([buildSheetHtml(rows, title, logoSrc)], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function openPdf(rows, title, logoSrc) {
  const popup = window.open("", "_blank", "width=1200,height=800");
  if (!popup) return;
  popup.document.write(buildSheetHtml(rows, title, logoSrc));
  popup.document.close();
  popup.focus();
  popup.print();
}

function buildExportLabel(row, fallback) {
  if (!row) return fallback;
  const parts = [row.centerName || row.center, row.onTime || row.disbursementDate, row.customerName]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : fallback;
}

export default function ImageDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const { day, customerId } = useParams();
  const { profile } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [amountEntries, setAmountEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState("All");
  const [exportCustomerId, setExportCustomerId] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [customerList, amountList] = await Promise.all([listCustomers(), listAllCustomerAmountEntries()]);
        if (!active) return;
        setCustomers(customerList);
        setAmountEntries(amountList);
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "Unable to load database values");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => {
    return customers.map((customer, index) => {
      const customerEntries = amountEntries.filter((e) => e.customerId === customer.customerId);
      const approvedEntries = customerEntries.filter((e) => e.approvalStatus === "approved");
      const latestEntry = customerEntries[0];
      const totalCollected = approvedEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const targetAmount = Number(customer.totalPayable || 0);
      const collectedAmount = Math.min(totalCollected, targetAmount);
      const totalWeeks = Number(customer.loanWeeks || 0);
      const completedWeeks = approvedEntries.length;
      const pendingWeeks = Math.max(totalWeeks - completedWeeks, 0);

      const loanStartDate = formatDate(customer.disbursementDate || customer.loanApprovedAt || customer.submittedAt);

      return {
        sno: String(index + 1),
        center: customer.selectedDay || "Not available",
        centerName: formatCenterName(customer.selectedDay, customer.loanApprovedAt || customer.submittedAt),
        customerId: customer.customerId || "Not available",
        customerName: customer.customerName || "Not available",
        customerMobile: formatPhone(customer.mobileNumber),
        otherMobile: formatPhone(customer.additionalContact || customer.nomineeContact),
        country: getCustomerCountry(customer) || "Pending",
        loanAmount: customer.loanAmount ? "₹" + formatCurrency(customer.loanAmount) : "Pending",
        disbursementDate: formatDate(customer.disbursementDate),
        dueDate: formatDate(customer.dueDate),
        onTime: loanStartDate,
        week: totalWeeks ? `${totalWeeks}${(customer.collectionFrequency || "Weekly").toLowerCase() === "daily" ? "D" : "W"}` : "Pending",
        status: customer.approvalStatus || "pending",
        principal: targetAmount ? formatCurrency(targetAmount) : "Pending",
        balance: targetAmount ? formatCurrency(collectedAmount) : "0",
        progressAmount: targetAmount ? formatCurrency(collectedAmount) : "0",
        collectedWeek: String(completedWeeks),
        pendingWeek: totalWeeks ? `${pendingWeeks}${(customer.collectionFrequency || "Weekly").toLowerCase() === "daily" ? "D" : "W"}` : "Pending",
        od: latestEntry?.approvalStatus === "approved" ? "0D" : "Pending",
        isReady: hasAppliedForLoan(customer),
      };
    });
  }, [amountEntries, customers]);

  const isEmployeeView = location.pathname.startsWith("/employee/");
  const openedFromEmployeeCard = Boolean(location.state?.fromEmployeeCustomerCard);
  const isJeevaEmployee = profile?.displayName?.trim().toLowerCase() === "jeeva";
  const filterDay = location.state?.filterDay || null;

  const selectedRow = useMemo(() => {
    if (customerId) return rows.find((row) => row.customerId === customerId) || null;
    return rows.find((row) => row.isReady) || null;
  }, [customerId, rows]);

  const employeeAccessValid = useMemo(() => {
    if (!isEmployeeView) return true;
    if (!isJeevaEmployee) return false;
    if (!openedFromEmployeeCard) return false;
    if (!selectedRow) return false;
    if (!day) return false;
    return selectedRow.center === day && location.state?.customerId === customerId;
  }, [customerId, day, isEmployeeView, isJeevaEmployee, location.state, openedFromEmployeeCard, selectedRow]);

  const backPath = isEmployeeView && day && customerId
    ? "/employee/customers/" + day + "/" + customerId
    : filterDay
    ? "/dashboard/loan-apply-day/" + encodeURIComponent(filterDay)
    : "/dashboard";

  const selectedCustomer = useMemo(() => {
    if (!selectedRow) return null;
    return customers.find((c) => c.customerId === selectedRow.customerId) || null;
  }, [customers, selectedRow]);

  const DAY_FILTER_OPTIONS = CUSTOMER_DAY_FILTER_OPTIONS;

  const [centersVersion, setCentersVersion] = useState(0);
  useEffect(() => {
    const onCentersChange = () => setCentersVersion((v) => v + 1);
    window.addEventListener(LOAN_CENTERS_CHANGED_EVENT, onCentersChange);
    return () => window.removeEventListener(LOAN_CENTERS_CHANGED_EVENT, onCentersChange);
  }, []);

  const allCenters = useMemo(() => loadCentersWithDay(), [centersVersion]);

  function getCenterLabels(d) {
    const root = allCenters.find((c) => c.day === d || c.label === `${d} Centre`);
    if (!root) return new Set();
    const s = new Set([root.label]);
    allCenters.forEach((c) => { if (c.parent === root.label) s.add(c.label); });
    return s;
  }

  const displayRows = useMemo(() => {
    if (customerId) return selectedRow ? [selectedRow] : [];
    let ready = rows.filter((row) => row.isReady);
    if (filterDay) ready = ready.filter((row) => row.center === filterDay);
    if (dayFilter !== "All") {
      if (dayFilter === "No Centre") {
        ready = ready.filter((row) => !row.center || row.center === "Not available");
      } else {
        const labels = getCenterLabels(dayFilter);
        ready = ready.filter((row) => labels.has(row.center));
      }
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      ready = ready.filter(
        (row) =>
          row.customerName?.toLowerCase().includes(q) ||
          row.customerId?.toLowerCase().includes(q) ||
          row.customerMobile?.includes(q)
      );
    }
    return ready;
  }, [customerId, filterDay, rows, selectedRow, dayFilter, search]);

  // Export rows: specific customer if selected, else current filtered view
  const exportRows = useMemo(() => {
    if (exportCustomerId) {
      const found = displayRows.find((r) => r.customerId === exportCustomerId);
      return found ? [found] : [];
    }
    return displayRows;
  }, [exportCustomerId, displayRows]);

  const exportSourceRow = exportRows[0] || displayRows[0] || selectedRow;
  const exportLabel = buildExportLabel(
    exportSourceRow,
    `${dayFilter !== "All" ? dayFilter : "All"}-${displayRows.length}-records`
  );
  const exportSummary = exportSourceRow
    ? `${exportSourceRow.centerName || exportSourceRow.center || "Center"} - ${exportSourceRow.onTime || exportSourceRow.disbursementDate || "Pending"} - ${exportSourceRow.customerName || "Customer"}`
    : `All filtered records (${displayRows.length})`;

  const sheetPage = (
    <div className="app-grid-page mx-auto flex w-full flex-col items-center gap-4">
        <section className="app-panel-muted w-full rounded-[30px] p-6 md:p-7">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
              <FileSearch className="h-5 w-5" />
            </div>
            <div>
              <p className="app-eyebrow text-[11px] font-semibold uppercase tracking-[0.24em]">Reference image</p>
              <h3 className="text-2xl font-semibold tracking-tight text-slate-950">Image format, database values</h3>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-4 w-4 shrink-0" />
              <p>This page uses the image only as a format reference. The customer sheet values below are loaded from your database.</p>
            </div>
          </div>

          {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
          {!error && !loading && rows.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>No customer data is available in the database yet.</p></div>
            </div>
          ) : null}
        </section>

        <section className="app-panel w-full rounded-[30px] p-6 md:p-7">
          <p className="app-eyebrow text-[11px] font-semibold uppercase tracking-[0.24em]">Customer sheet</p>

          {!loading && !customerId && (
            <div className="mt-4 flex flex-col gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, phone or ID..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Day filter */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {DAY_FILTER_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDayFilter(d)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                      dayFilter === d
                        ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              {/* Export controls */}
              {displayRows.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-col gap-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Export sheet</p>
                    <p className="text-xs text-slate-400">Export by center, customer, and date in one clean sheet.</p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
                    <select
                      value={exportCustomerId}
                      onChange={(e) => setExportCustomerId(e.target.value)}
                      className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-300"
                    >
                      <option value="">All filtered records ({displayRows.length})</option>
                      {displayRows.map((row) => (
                        <option key={row.customerId} value={row.customerId}>
                          {row.centerName || row.center} - {row.onTime || row.disbursementDate} - {row.customerName}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => downloadSheetHtml(exportRows, `${sanitizeFileName(exportLabel)}-sheet.html`, `Centre Sheet - ${exportLabel}`, logoUrl)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      Download sheet
                    </button>

                    <button
                      type="button"
                      onClick={() => openPdf(exportRows, `Centre Sheet - ${exportLabel}`, logoUrl)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
                    >
                      <Download className="h-4 w-4" />
                      Print / Save PDF
                    </button>
                  </div>
                  {exportCustomerId && exportRows.length === 0 ? (
                    <p className="mt-2 text-xs text-rose-600">Selected customer not found in current filter.</p>
                  ) : null}
                  {exportRows.length > 0 ? (
                    <p className="mt-2 text-xs text-slate-400">
                      Exporting <span className="font-semibold text-slate-600">{exportRows.length}</span> record{exportRows.length !== 1 ? "s" : ""} for{" "}
                      <span className="font-semibold text-slate-600">{exportSummary}</span>
                    </p>
                  ) : null}
                </div>
              )}

              <p className="px-1 text-xs text-slate-400">
                Showing <span className="font-semibold text-slate-600">{displayRows.length}</span> record{displayRows.length !== 1 ? "s" : ""}
                {dayFilter !== "All" ? ` · ${dayFilter}` : ""}
                {search ? ` · "${search}"` : ""}
              </p>
            </div>
          )}

          {loading ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Loading database values...
            </div>
          ) : null}

          {!loading && displayRows.length > 0 && employeeAccessValid ? (
            <div className="mt-5 grid gap-4">
              {!isEmployeeView ? (
                <div className="rounded-[26px] border border-blue-200 bg-blue-50 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-blue-600">Loan actions</p>
                      <p className="mt-2 text-sm text-slate-700">Use this customer sheet as the reference view, then open the customer record or loan apply page directly.</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => navigate("/dashboard/customer/" + selectedRow.customerId)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        <SquarePen className="h-4 w-4" />
                        Customer Record
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate("/dashboard/loan-apply/" + selectedRow.customerId, { state: { applyLoan: true, customer: selectedCustomer } })}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
                      >
                        <FileText className="h-4 w-4" />
                        Loan Apply
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="app-panel-muted rounded-[28px] p-5">
                <div className="max-h-[calc(100vh-220px)] overflow-y-auto overflow-x-hidden rounded-[24px] border border-slate-300 bg-white shadow-sm">
                  <table className="w-full table-fixed border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-100">
                      <tr className="bg-slate-100">
                        {sheetColumns.map((column) => (
                          <th
                            key={column.key}
                            style={{ width: column.width }}
                            className={`border-b border-r border-slate-300 px-2 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 last:border-r-0 ${column.align}`}
                          >
                            {renderHeaderLabel(column.label)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row) => (
                        <tr key={row.customerId} className="align-middle even:bg-slate-50/60">
                          {sheetColumns.map((column) => {
                            const value = row[column.key];
                            const muted = value === "Pending" || value === "Not available";
                            return (
                              <td
                                key={column.key}
                                style={{ width: column.width }}
                                className={`border-r border-t border-slate-300 px-2 py-3 text-[11px] font-medium leading-5 whitespace-nowrap overflow-hidden text-ellipsis last:border-r-0 ${column.align} ${muted ? "text-amber-700" : "text-slate-900"}`}
                              >
                                {value}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <div className="flex w-full justify-start">
          <button
            type="button"
            onClick={() => navigate(backPath)}
            className="app-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            {isEmployeeView ? "Back to customer" : "Back to dashboard"}
          </button>
        </div>
    </div>
  );

  if (isEmployeeView) {
    return sheetPage;
  }

  return (
    <AdminLayout
      title="Centre Sheet View"
      description="View one full customer sheet from the database in the same record format."
      eyebrow="Admin"
    >
      {sheetPage}
    </AdminLayout>
  );
}

