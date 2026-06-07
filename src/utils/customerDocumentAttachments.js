export const CUSTOMER_DOCUMENT_DATA_URL_FIELDS = {
  idDocumentName: "idDocumentDataUrl",
  addressProofName: "addressProofDataUrl",
  loanAgreementName: "loanAgreementDataUrl",
  customerPhotoName: "customerPhotoDataUrl",
  coApplicantPhotoName: "coApplicantPhotoDataUrl",
  coApplicantIdProofName: "coApplicantIdProofDataUrl",
};

export function getDocumentDataUrlField(nameField) {
  return CUSTOMER_DOCUMENT_DATA_URL_FIELDS[nameField] || "";
}

export function isImageAttachment(name, url) {
  if (String(url || "").startsWith("data:image/")) return true;
  const lower = String(name || "").toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"].some((ext) => lower.endsWith(ext));
}

export function isPdfAttachment(name, url) {
  if (String(url || "").startsWith("data:application/pdf")) return true;
  return String(name || "").toLowerCase().endsWith(".pdf");
}

export function openCustomerDocument(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}
