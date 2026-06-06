/**
 * Collection Report alert system — used only on the Collection Report page.
 *
 * Priority (highest first):
 * 1. Not paid 1+ year OR 3+ overdue months → entire row red TEXT only (no background)
 * 2. Not paid 1–2 months → Customer ID cell background red (normal text)
 * 3. Interest about to expire → Customer ID cell background yellow (normal text)
 * 4. Otherwise (paid / no overdue) → normal styling
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
 * @param {object} row Report row from buildCustomerDetailRow.
 */
export function getCollectionReportAlert(row) {
  if (!row) return ALERT_NONE;

  const overdueCount = Array.isArray(row.pendingTenures) ? row.pendingTenures.length : 0;

  if (row.longTermNoPayment || overdueCount >= 3) {
    return {
      kind: "severeUnpaid",
      scope: "fullRow",
      textClass: COLLECTION_REPORT_ALERT_TEXT.redFull,
      cellBgClass: "",
      pdfColor: "danger",
      pdfFill: null,
    };
  }

  if (overdueCount >= 1 && overdueCount <= 2) {
    return {
      kind: "overdue1to2",
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

/** Full-row red text only — no row/cell background. */
export function collectionReportCellTextClass(alert, columnKey) {
  if (!alert || alert.scope !== "fullRow" || !alert.textClass) return "";
  if (columnKey === "serial") return "";
  return alert.textClass;
}

/** Customer ID cell background only (red / yellow) — text stays normal. */
export function collectionReportCellBgClass(alert, columnKey) {
  if (!alert || alert.scope !== "customerIdCell" || columnKey !== "customerId") return "";
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
