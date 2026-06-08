/**
 * Collection Report alert system — used only on the Collection Report page.
 *
 * Priority (highest first):
 * 1. Not paid 1+ year → entire row red TEXT only (customer details columns)
 * 2. Unpaid 2–8 months (overdue tenures before current) → Customer ID cell background red
 * 3. Interest / loan about to expire → Customer ID cell background yellow
 * 4. Otherwise (paid / 0–1 month overdue) → normal styling
 */

export const COLLECTION_REPORT_ALERT_TEXT = {
  redFull: "text-rose-700",
};

export const COLLECTION_REPORT_ALERT_CELL_BG = {
  red: "bg-rose-100",
  yellow: "bg-amber-100",
};

const ALERT_NONE = {
  kind: "none",
  scope: "none",
  textClass: "",
  cellBgClass: "",
  pdfColor: null,
  pdfFill: null,
};

/**
 * @param {object} row Report row from buildCustomerDetailRow / collection report rows.
 */
function isCustomerFullyPaid(row) {
  const balance = Number(row.balanceAmountRaw ?? NaN);
  if (!Number.isNaN(balance) && balance <= 0) return true;
  const pendingAmount = Number(row.pendingAmountRaw ?? NaN);
  if (!Number.isNaN(pendingAmount) && pendingAmount <= 0) {
    const overdueMonths = Array.isArray(row.pendingTenures) ? row.pendingTenures.length : 0;
    if (overdueMonths === 0) return true;
  }
  return false;
}

export function getCollectionReportAlert(row) {
  if (!row) return ALERT_NONE;

  if (row.isFullyPaid || isCustomerFullyPaid(row)) return ALERT_NONE;

  const overdueMonths = Array.isArray(row.pendingTenures) ? row.pendingTenures.length : 0;

  if (row.longTermNoPayment) {
    return {
      kind: "severeUnpaid",
      scope: "fullRow",
      textClass: COLLECTION_REPORT_ALERT_TEXT.redFull,
      cellBgClass: "",
      pdfColor: "danger",
      pdfFill: null,
    };
  }

  if (overdueMonths >= 2 && overdueMonths <= 8) {
    return {
      kind: "overdue2to8",
      scope: "customerIdCell",
      textClass: "",
      cellBgClass: COLLECTION_REPORT_ALERT_CELL_BG.red,
      pdfColor: null,
      pdfFill: "dangerSoft",
    };
  }

  if (row.nearEndAlert) {
    return {
      kind: "nearEnd",
      scope: "customerIdCell",
      textClass: "",
      cellBgClass: COLLECTION_REPORT_ALERT_CELL_BG.yellow,
      pdfColor: null,
      pdfFill: "warnSoft",
    };
  }

  return ALERT_NONE;
}

/** Full-row red text only — customer ID cell uses background alerts instead of red text. */
export function collectionReportCellTextClass(alert, columnKey) {
  if (!alert || alert.scope !== "fullRow" || !alert.textClass) return "";
  if (columnKey === "serial" || columnKey === "customerId") return "";
  return alert.textClass;
}

/** Customer ID cell background only (red / yellow) — never applied to other columns. */
export function collectionReportCellBgClass(alert, columnKey) {
  if (columnKey !== "customerId") return "";
  if (!alert || alert.scope !== "customerIdCell") return "";
  return alert.cellBgClass || "";
}

/** CSS class names for HTML/print output (matches on-screen red text + red/yellow ID cell backgrounds). */
export function collectionReportPrintCellClass(alert, columnKey) {
  if (!alert || alert.kind === "none") return "";

  const classes = [];
  if (collectionReportCellTextClass(alert, columnKey)) {
    classes.push("cr-alert-text-red");
  }
  const bgClass = collectionReportCellBgClass(alert, columnKey);
  if (bgClass === COLLECTION_REPORT_ALERT_CELL_BG.red) classes.push("cr-alert-bg-red");
  if (bgClass === COLLECTION_REPORT_ALERT_CELL_BG.yellow) classes.push("cr-alert-bg-yellow");
  return classes.join(" ");
}
