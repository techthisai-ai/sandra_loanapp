import { formatCurrencyForPrint } from "./formatCurrency.js";
import { resolveLoanTimelineDates } from "./loanTimelineDates";

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCurrency(value) {
  return `₹${toNumber(value).toLocaleString("en-IN")}`;
}

export function formatDisplayDate(value) {
  const date = parseDate(value);
  if (!date) return "--";
  return date.toLocaleDateString("en-GB");
}

export function formatSheetDate(value) {
  const date = parseDate(value);
  if (!date) return "--";
  return date.toLocaleDateString("en-GB").replaceAll("/", "-");
}

export function formatWeekday(value) {
  const date = parseDate(value);
  if (!date) return "--";
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeFileName(value) {
  return String(value || "emi-sheet")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildLoanSheetSchedule(data) {
  const tenure = Math.max(1, Math.round(toNumber(data.loanWeeks) || 0));
  const frequency = String(data.collectionFrequency || "Weekly").toLowerCase();
  const intervalDays = frequency.startsWith("daily") ? 1 : frequency.startsWith("month") ? 30 : 7;
  const firstEmiDate = parseDate(data.firstEmiDate || data.disbursementDate || data.dueDate);

  if (!firstEmiDate) return [];

  const emiAmount = toNumber(data.emiAmount);
  const totalPayable = toNumber(data.totalPayable) || emiAmount * tenure;
  const schedule = [];

  for (let index = 0; index < tenure; index += 1) {
    const emiDate = new Date(firstEmiDate);
    emiDate.setDate(emiDate.getDate() + intervalDays * index);

    schedule.push({
      installment: index + 1,
      emiDate: formatSheetDate(emiDate),
      emiDay: formatWeekday(emiDate),
      amount: emiAmount,
      balanceAmount: Math.max(totalPayable - emiAmount * (index + 1), 0),
      sign: "",
    });
  }

  return schedule;
}

export function buildLoanSheetHtml(data) {
  const companyName = data.companyName || "RUTHRA FINANCIAL SOLUTION";
  const customerName = data.customerName || "--";
  const loanAmount = toNumber(data.loanAmount);
  const tenure = Math.max(1, Math.round(toNumber(data.loanWeeks) || 0));
  const emiAmount = toNumber(data.emiAmount);
  const totalPayable = toNumber(data.totalPayable) || emiAmount * tenure;
  const timeline = resolveLoanTimelineDates({
    loanIssueDate: data.loanIssueDate,
    emiStartDate: data.emiStartDate || data.firstEmiDate,
    emiEndDate: data.emiEndDate,
    disbursementDate: data.firstEmiDate || data.disbursementDate,
    dueDate: data.dueDate,
    loanWeeks: data.loanWeeks,
    collectionFrequency: data.collectionFrequency,
    submittedAt: data.submittedAt,
  });

  const firstEmiDate = formatSheetDate(timeline.emiStartDate || data.firstEmiDate || data.disbursementDate || data.dueDate);
  const firstEmiDay = formatWeekday(timeline.emiStartDate || data.firstEmiDate || data.disbursementDate || data.dueDate);
  const issueDate = formatSheetDate(timeline.loanIssueDate);
  const emiStartDate = formatSheetDate(timeline.emiStartDate);
  const emiEndDate = formatSheetDate(timeline.emiEndDate);
  const schedule = buildLoanSheetSchedule({
    ...data,
    totalPayable,
    firstEmiDate: timeline.emiStartDate || data.firstEmiDate || data.disbursementDate || data.dueDate,
  });

  const scheduleRows = schedule
    .map(
      (row) => `
        <tr>
          <td class="center">${row.installment}</td>
          <td class="center">${escapeHtml(row.emiDate)}</td>
          <td class="amount">${escapeHtml(formatCurrencyForPrint(row.amount))}</td>
          <td class="amount">${escapeHtml(formatCurrencyForPrint(row.balanceAmount))}</td>
          <td class="sign">${escapeHtml(row.sign)}</td>
        </tr>`
    )
    .join("");

  const headerRows = [
    {
      label: "Customer name",
      value: customerName,
      highlight: true,
    },
    {
      label: "Loan amt / Tenure",
      value: formatCurrencyForPrint(loanAmount),
      secondary: `${tenure} weeks`,
    },
    {
      label: "1st EMI date / Day",
      value: firstEmiDate,
      secondary: firstEmiDay,
    },
    {
      label: "Loan issue date",
      value: issueDate,
      secondary: "",
    },
    {
      label: "EMI start date",
      value: emiStartDate,
      secondary: "",
    },
    {
      label: "EMI end date",
      value: emiEndDate,
      secondary: "",
    },
  ];

  const headerMarkup = headerRows
    .map(({ label, value, secondary, highlight, spanValue }) => {
      const labelCell = `<td class="label-cell">${escapeHtml(label)}</td>`;
      const valueCell = highlight
        ? `<td colspan="2" class="value-cell highlight">${escapeHtml(value)}</td>`
        : spanValue
          ? `<td colspan="2" class="value-cell">${escapeHtml(value)}</td>`
          : `<td class="value-cell">${escapeHtml(value)}</td><td class="value-cell secondary">${escapeHtml(secondary || "")}</td>`;
      return `<tr>${labelCell}${valueCell}</tr>`;
    })
    .join("");

  const logoMarkup = `<img class="brand-logo" src="/branding/rfs-logo.png" alt="${escapeHtml(companyName)} logo" />`;

  return `
    <html>
      <head>
        <title>${escapeHtml(companyName)} - ${escapeHtml(customerName)}</title>
        <style>
          :root {
            color-scheme: light;
          }
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: #fff;
            color: #333;
            font-family: "Times New Roman", Georgia, serif;
          }
          .sheet {
            width: 100%;
            box-sizing: border-box;
            padding: 2px;
          }
          .brand {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            margin: 0 0 6px;
          }
          .brand-logo {
            width: 72px;
            height: 72px;
            object-fit: contain;
            object-position: center;
            image-rendering: -webkit-optimize-contrast;
            filter: contrast(1.06) saturate(1.08);
          }
          .brand-title {
            text-align: center;
            font-size: 18px;
            line-height: 1.1;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: 0.8px;
          }
          .brand-subtitle {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: #0f4d5c;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          .summary {
            margin-bottom: 7px;
            font-size: 11px;
          }
          .summary td {
            border: 1px solid #9e9e9e;
            padding: 2px 5px;
            vertical-align: middle;
          }
          .label-cell {
            width: 31%;
            text-align: center;
            background: #f8f8f8;
            font-size: 10.5px;
          }
          .value-cell {
            text-align: center;
            font-size: 11.2px;
            min-height: 18px;
          }
          .value-cell.secondary {
            width: 22%;
            font-size: 10.5px;
          }
          .value-cell.highlight {
            background: #f4e36a;
            color: #b15c00;
            font-weight: 700;
          }
          .schedule thead th,
          .schedule tbody td {
            border: 1px solid #9e9e9e;
            padding: 2px 4px;
            font-size: 10.5px;
            font-weight: 400;
          }
          .schedule thead th {
            text-align: center;
            background: #f8f8f8;
            font-size: 11px;
            font-weight: 700;
          }
          .center {
            text-align: center;
          }
          .amount {
            text-align: right;
            padding-right: 6px;
          }
          .sign {
            width: 26%;
          }
          .footer {
            margin-top: 6px;
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #4b5563;
          }
          .note {
            margin-top: 4px;
            font-size: 9px;
            color: #6b7280;
          }
          .disclaimer {
            margin-top: 3px;
            font-size: 8.6px;
            color: #6b7280;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="brand">
            ${logoMarkup}
            <div class="brand-title">${escapeHtml(companyName)}</div>
            <div class="brand-subtitle">Loan Repayment Schedule</div>
          </div>

          <table class="summary">
            <tbody>
              ${headerMarkup}
            </tbody>
          </table>

          <table class="schedule">
            <thead>
              <tr>
                <th style="width: 7%;">S.No</th>
                <th style="width: 22%;">EMI Date</th>
                <th style="width: 19%;">EMI Amount</th>
                <th style="width: 22%;">Balance Amount</th>
                <th style="width: 30%;">Sign</th>
              </tr>
            </thead>
            <tbody>
              ${scheduleRows}
            </tbody>
          </table>

          <div class="footer">
            <span>Customer signature: ____________________</span>
            <span>Staff signature: ____________________</span>
          </div>

          <div class="disclaimer">This schedule is for reference. Amounts are as per approved loan terms.</div>
        </div>
      </body>
    </html>
  `;
}

export function downloadLoanSheetHtml(data) {
  const blob = new Blob([buildLoanSheetHtml(data)], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFileName(data.loanId || data.customerName || "emi-sheet")}-repayment-sheet.xls`;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

export function openPrintableLoanSheet(data) {
  const html = buildLoanSheetHtml(data);
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Loan repayment sheet print");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(frame);

  const doc = frame.contentDocument || frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }
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
    setTimeout(() => frame.remove(), 60_000);
  }, 400);
}
