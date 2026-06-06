import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { resolveCustomerCenterDisplay } from "./centerDisplay";
import { sanitizeFileName } from "./loanSheet";
import {
  RFS_PALETTE as PALETTE,
  drawAllReportFooters,
  fmtDatePdf,
  fmtInrPdf,
  getPageLayout,
  loadLogoDataUrl,
} from "./pdfReportLayout";
import { resolveLoanTimelineDates } from "./loanTimelineDates";

const MARGIN = 12;
const FOOTER_RESERVE = 16;
const COMPANY = {
  name: "Ruthra Financial Solutions",
  address: "Tamil Nadu, India",
  phone: "Contact your branch office",
  email: "admin@loanweb.com",
};

const STANDARD_TERMS = [
  "The borrower confirms that all information provided in this application is true and complete.",
  "Loan disbursement is subject to verification, centre approval, and available wallet balance.",
  "Repayment must follow the agreed collection frequency, EMI amount, and schedule shown in the loan summary.",
  "Late or missed payments may attract additional follow-up, rescheduling review, or collection action as per company policy.",
  "The nominee details are recorded for communication and recovery support where applicable.",
  "Uploaded KYC documents remain on file for audit and regulatory purposes.",
  "The customer agrees to cooperate with field verification and update contact details when they change.",
];

function dash(value) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function fmtLoanDatePdf(value) {
  const formatted = fmtDatePdf(value);
  return formatted === "—" ? "N/A" : formatted;
}

function imageFormatFromDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  if (dataUrl.includes("image/png")) return "PNG";
  return "JPEG";
}

function tryAddImage(doc, dataUrl, x, y, w, h) {
  const fmt = imageFormatFromDataUrl(dataUrl);
  if (!fmt) return false;
  try {
    doc.addImage(dataUrl, fmt, x, y, w, h, undefined, "FAST");
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize saved loan + customer + nominee state for PDF generation.
 */
export function buildLoanApplicationFormPayload({
  customer,
  loan = {},
  nominee = {},
  centers = [],
}) {
  const crif =
    customer?.crifDemoEligibility && typeof customer.crifDemoEligibility === "object"
      ? customer.crifDemoEligibility
      : null;
  const { dayCenter, subCenter } = resolveCustomerCenterDisplay(customer || {}, centers);

  const verificationStatus =
    crif?.verificationStatus ||
    (String(customer?.approvalStatus || "").toLowerCase() === "approved" ? "Verified" : "Pending verification");

  const timeline = resolveLoanTimelineDates({
    loanIssueDate: loan.loanIssueDate,
    emiStartDate: loan.emiStartDate,
    emiEndDate: loan.emiEndDate,
    disbursementDate: loan.disbursementDate,
    dueDate: loan.dueDate,
    loanWeeks: loan.loanWeeks,
    collectionFrequency: loan.collectionFrequency,
    submittedAt: loan.submittedAt,
  });

  return {
    company: COMPANY,
    customer: {
      photoDataUrl: customer?.customerPhotoDataUrl || "",
      customerId: dash(customer?.customerId),
      customerName: dash(customer?.customerName),
      mobileNumber: dash(customer?.mobileNumber),
      alternateNumber: dash(customer?.alternateNumber),
      address: dash(customer?.address),
      identityType: dash(customer?.identityType),
      identityNumber: dash(customer?.identityNumber),
      dayCenter,
      subCenter,
      verificationStatus,
      approvalStatus: dash(customer?.approvalStatus || "pending"),
    },
    nominee: {
      photoDataUrl: nominee?.photoDataUrl || customer?.coApplicantPhotoDataUrl || "",
      name: dash(nominee?.name || customer?.nomineeName || customer?.coApplicantName),
      relation: dash(nominee?.relation || customer?.nomineeRelation || customer?.coApplicantRelation),
      contact: dash(nominee?.contact || customer?.nomineeContact || customer?.coApplicantContact),
      address: dash(nominee?.address || customer?.coApplicantAddress),
      identityType: dash(nominee?.identityType || customer?.coApplicantIdentityType),
      identityNumber: dash(nominee?.identityNumber || customer?.coApplicantIdentityNumber),
      idProofName: dash(nominee?.idProofName || customer?.coApplicantIdProofName),
    },
    loan: {
      loanId: dash(loan.loanId),
      loanAmount: loan.loanAmount,
      interestAmount: loan.interestAmount,
      emiAmount: loan.emiAmount,
      totalPayable: loan.totalPayable,
      collectionFrequency: dash(loan.collectionFrequency),
      collectionDay: dash(loan.collectionDay),
      loanIssueDate: fmtLoanDatePdf(timeline.loanIssueDate),
      emiStartDate: fmtLoanDatePdf(timeline.emiStartDate),
      emiEndDate: fmtLoanDatePdf(timeline.emiEndDate),
      disbursementDate: fmtLoanDatePdf(loan.disbursementDate),
      dueDate: fmtLoanDatePdf(timeline.emiEndDate || loan.dueDate),
      loanWeeks: dash(loan.loanWeeks),
      loanStatus: dash(loan.loanStatus || "active"),
      presetLabel: dash(loan.presetLabel),
    },
    eligibility: {
      creditScore: crif?.creditScore != null ? String(crif.creditScore) : "—",
      creditTier: dash(crif?.creditTier),
      riskLevel: dash(crif?.riskLevel),
      eligibilityStatus: dash(crif?.eligibilityStatus),
      approvalChance: crif?.approvalChanceLabel
        ? `${crif.approvalChanceLabel}${crif.approvalChancePercent != null ? ` (${crif.approvalChancePercent}%)` : ""}`
        : "—",
      existingLoans: crif?.activeLoans != null ? String(crif.activeLoans) : dash(crif?.existingLoanStatus),
      paymentHistory: dash(crif?.paymentHistoryStatus || crif?.repaymentQuality),
      financialStability: dash(crif?.financialStability),
      checkedAt: crif?.checkedAt ? fmtDatePdf(crif.checkedAt) : "—",
    },
    documents: [
      { label: "Applicant photo", fileName: dash(customer?.customerPhotoName), dataUrl: customer?.customerPhotoDataUrl || "" },
      { label: "ID proof", fileName: dash(customer?.idDocumentName), dataUrl: "" },
      { label: "Address proof", fileName: dash(customer?.addressProofName), dataUrl: "" },
      { label: "Loan document", fileName: dash(customer?.loanAgreementName), dataUrl: "" },
    ],
  };
}

function ensureSpace(doc, layout, y, needed) {
  const { margin, pageHeight, footerReserve } = layout;
  if (y + needed <= pageHeight - footerReserve) return y;
  doc.addPage();
  return margin + 4;
}

function drawCompanyHeader(doc, layout, payload, generatedLabel, logoDataUrl) {
  const { margin, pageWidth } = layout;
  const bandH = 32;

  doc.setFillColor(...PALETTE.headBg);
  doc.rect(0, 0, pageWidth, bandH, "F");
  doc.setDrawColor(...PALETTE.accent);
  doc.setLineWidth(0.4);
  doc.line(0, bandH, pageWidth, bandH);

  let textX = margin;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin, 9, 14, 10);
      textX = margin + 18;
    } catch {
      /* ignore */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PALETTE.headText);
  doc.text(payload.company.name, textX, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(220, 235, 240);
  doc.text(payload.company.address, textX, 18.5);
  doc.text(`${payload.company.phone}  ·  ${payload.company.email}`, textX, 23);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...PALETTE.headText);
  doc.text("Loan Application Form", pageWidth - margin, 14, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.text(`Generated ${generatedLabel}`, pageWidth - margin, 20, { align: "right" });

  return bandH + 6;
}

function drawSectionHeading(doc, layout, y, title) {
  const { margin, contentW } = layout;
  y = ensureSpace(doc, layout, y, 12);

  doc.setFillColor(...PALETTE.surfaceAlt);
  doc.setDrawColor(...PALETTE.line);
  doc.roundedRect(margin, y, contentW, 7, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PALETTE.accent);
  doc.text(title.toUpperCase(), margin + 3, y + 4.8);

  return y + 10;
}

function drawKeyValueSection(doc, layout, startY, rows) {
  const { margin, contentW } = layout;
  const body = rows.map(([label, value]) => [label, value]);

  autoTable(doc, {
    startY,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.2,
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2.5 },
      textColor: PALETTE.inkSoft,
      lineColor: PALETTE.line,
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { cellWidth: contentW * 0.34, fontStyle: "bold", textColor: PALETTE.ink },
      1: { cellWidth: contentW * 0.66 },
    },
    body,
  });

  return doc.lastAutoTable.finalY + 4;
}

const LOAN_DETAIL_FINANCIAL_LABELS = new Set(["Loan amount", "Interest", "EMI amount", "Total payable"]);

function drawPremiumLoanDetailsTable(doc, layout, startY, rows) {
  const { margin, contentW } = layout;
  const body = rows.map(([label, value]) => [label, value]);

  autoTable(doc, {
    startY,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    theme: "grid",
    head: [["Field", "Details"]],
    styles: {
      font: "helvetica",
      fontSize: 8.4,
      cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.8 },
      textColor: PALETTE.inkSoft,
      lineColor: PALETTE.line,
      lineWidth: 0.2,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: PALETTE.headBg,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.6,
      halign: "left",
      cellPadding: { top: 2.4, right: 2.5, bottom: 2.4, left: 2.8 },
    },
    alternateRowStyles: { fillColor: PALETTE.surfaceAlt },
    columnStyles: {
      0: { cellWidth: contentW * 0.36, fontStyle: "bold", textColor: PALETTE.ink },
      1: { cellWidth: contentW * 0.64 },
    },
    body,
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 1) return;
      const label = String(data.row.raw?.[0] ?? "");
      if (LOAN_DETAIL_FINANCIAL_LABELS.has(label)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = PALETTE.accent;
        data.cell.styles.fontSize = 9.2;
      }
    },
  });

  return doc.lastAutoTable.finalY + 5;
}

function drawPhotoAndDetails(doc, layout, y, photoDataUrl, rows) {
  const { margin, contentW } = layout;
  y = ensureSpace(doc, layout, y, 42);

  const photoW = 28;
  const photoH = 32;
  const textX = margin + photoW + 5;
  const textW = contentW - photoW - 5;

  doc.setDrawColor(...PALETTE.line);
  doc.setFillColor(...PALETTE.surfaceAlt);
  doc.roundedRect(margin, y, photoW, photoH, 2, 2, "FD");

  const embedded = tryAddImage(doc, photoDataUrl, margin + 1.5, y + 1.5, photoW - 3, photoH - 3);
  if (!embedded) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...PALETTE.muted);
    doc.text("No photo", margin + photoW / 2, y + photoH / 2, { align: "center" });
  }

  let yy = y + 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  rows.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PALETTE.ink);
    doc.text(`${label}:`, textX, yy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...PALETTE.inkSoft);
    const lines = doc.splitTextToSize(String(value), textW - 22);
    doc.text(lines, textX + 22, yy);
    yy += Math.max(4.5, lines.length * 4.2);
  });

  return Math.max(y + photoH, yy) + 4;
}

function drawDocumentGrid(doc, layout, startY, documents) {
  const { margin, contentW } = layout;
  let y = ensureSpace(doc, layout, startY, 50);
  const colW = (contentW - 4) / 2;
  const boxH = 38;

  documents.forEach((docItem, index) => {
    const col = index % 2;
    if (col === 0 && index > 0) {
      y += boxH + 4;
      y = ensureSpace(doc, layout, y, boxH + 4);
    }
    const x = margin + col * (colW + 4);

    doc.setDrawColor(...PALETTE.line);
    doc.setFillColor(...PALETTE.surface);
    doc.roundedRect(x, y, colW, boxH, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...PALETTE.accent);
    doc.text(docItem.label, x + 2.5, y + 5);

    const imgY = y + 7;
    const imgH = 22;
    const embedded = tryAddImage(doc, docItem.dataUrl, x + 2.5, imgY, colW - 5, imgH);
    if (!embedded) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...PALETTE.muted);
      const fileLines = doc.splitTextToSize(docItem.fileName, colW - 6);
      doc.text(fileLines, x + colW / 2, imgY + imgH / 2 - 2, { align: "center" });
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...PALETTE.inkSoft);
    const nameLines = doc.splitTextToSize(docItem.fileName, colW - 5);
    doc.text(nameLines, x + 2.5, y + boxH - 3, { align: "left" });
  });

  return y + boxH + 4;
}

function drawTerms(doc, layout, startY) {
  let y = startY;
  y = drawSectionHeading(doc, layout, y, "Terms & conditions");

  const { margin, contentW } = layout;
  STANDARD_TERMS.forEach((line, index) => {
    y = ensureSpace(doc, layout, y, 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    doc.setTextColor(...PALETTE.inkSoft);
    const wrapped = doc.splitTextToSize(`${index + 1}. ${line}`, contentW - 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 3.6 + 1.5;
  });

  return y + 2;
}

function drawSignatures(doc, layout, startY) {
  let y = drawSectionHeading(doc, layout, startY, "Signatures");
  const { margin, contentW } = layout;
  y = ensureSpace(doc, layout, y, 42);

  const colW = (contentW - 4) / 2;
  const boxH = 22;
  const labels = [
    "Customer signature",
    "Nominee signature",
    "Collector signature",
    "Manager / Admin signature",
  ];

  labels.forEach((label, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = margin + col * (colW + 4);
    const boxY = y + row * (boxH + 4);

    doc.setDrawColor(...PALETTE.line);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, boxY, colW, boxH, 1.5, 1.5, "S");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(...PALETTE.muted);
    doc.text(label, x + 2, boxY + boxH - 3);

    doc.setFontSize(6.5);
    doc.text("Date: _______________", x + colW - 2, boxY + boxH - 3, { align: "right" });
  });

  return y + 2 * (boxH + 4) + 4;
}

/**
 * Generate and download a premium A4 loan application PDF.
 * @param {ReturnType<typeof buildLoanApplicationFormPayload>} payload
 */
export async function downloadLoanApplicationFormPdf(payload) {
  if (!payload?.customer?.customerName || payload.customer.customerName === "—") {
    throw new Error("Customer details are required to generate the application form.");
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const generatedAt = new Date();
  const generatedLabel = generatedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const logoDataUrl = await loadLogoDataUrl(origin);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const layout = getPageLayout(doc, { margin: MARGIN, footerReserve: FOOTER_RESERVE });

  let y = drawCompanyHeader(doc, layout, payload, generatedLabel, logoDataUrl);

  y = drawSectionHeading(doc, layout, y, "Customer details");
  y = drawPhotoAndDetails(doc, layout, y, payload.customer.photoDataUrl, [
    ["Customer ID", payload.customer.customerId],
    ["Full name", payload.customer.customerName],
    ["Mobile", payload.customer.mobileNumber],
    ["Alternate", payload.customer.alternateNumber],
    ["Address", payload.customer.address],
    [`${payload.customer.identityType}`, payload.customer.identityNumber],
    ["Center", payload.customer.dayCenter],
    ["Sub-center", payload.customer.subCenter],
    ["Verification", payload.customer.verificationStatus],
  ]);

  y = drawSectionHeading(doc, layout, y, "Nominee details");
  y = drawPhotoAndDetails(doc, layout, y, payload.nominee.photoDataUrl, [
    ["Name", payload.nominee.name],
    ["Relationship", payload.nominee.relation],
    ["Mobile", payload.nominee.contact],
    ["Address", payload.nominee.address],
    [`${payload.nominee.identityType}`, payload.nominee.identityNumber],
    ["ID proof file", payload.nominee.idProofName],
  ]);

  y = drawSectionHeading(doc, layout, y, "Loan details");
  y = drawPremiumLoanDetailsTable(doc, layout, y, [
    ["Loan ID", payload.loan.loanId],
    ["Loan amount", fmtInrPdf(payload.loan.loanAmount)],
    ["Interest", fmtInrPdf(payload.loan.interestAmount)],
    ["EMI amount", fmtInrPdf(payload.loan.emiAmount)],
    ["Total payable", fmtInrPdf(payload.loan.totalPayable)],
    ["Collection type", payload.loan.collectionFrequency],
    ["Collection day", payload.loan.collectionDay],
    ["Loan issue date", payload.loan.loanIssueDate],
    ["EMI start date", payload.loan.emiStartDate],
    ["EMI end date", payload.loan.emiEndDate],
    ["Due date", payload.loan.dueDate],
    ["Duration", `${payload.loan.loanWeeks} installments`],
    ["Loan status", payload.loan.loanStatus],
    ["Preset", payload.loan.presetLabel],
  ]);

  y = drawSectionHeading(doc, layout, y, "Eligibility & verification");
  y = drawKeyValueSection(doc, layout, y, [
    ["Credit score", payload.eligibility.creditScore],
    ["Credit tier", payload.eligibility.creditTier],
    ["Risk level", payload.eligibility.riskLevel],
    ["Eligibility", payload.eligibility.eligibilityStatus],
    ["Approval chance", payload.eligibility.approvalChance],
    ["Existing loans", payload.eligibility.existingLoans],
    ["Payment history", payload.eligibility.paymentHistory],
    ["Financial stability", payload.eligibility.financialStability],
    ["Last checked", payload.eligibility.checkedAt],
  ]);

  y = drawSectionHeading(doc, layout, y, "Uploaded documents");
  y = drawDocumentGrid(doc, layout, y, payload.documents);

  y = drawTerms(doc, layout, y);
  drawSignatures(doc, layout, y);

  drawAllReportFooters(doc, generatedLabel, MARGIN);

  const fileStem = sanitizeFileName(payload.loan.loanId || payload.customer.customerId || "loan-application");
  doc.save(`${fileStem}-application-form.pdf`);
}
