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

function dataUrlToBlobUrl(dataUrl) {
  try {
    const [header, payload] = dataUrl.split(",");
    if (!payload) return dataUrl;
    const mime = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch {
    return dataUrl;
  }
}

export function openCustomerDocument(url) {
  if (!url) return;
  const raw = String(url);
  const openUrl = raw.startsWith("data:") ? dataUrlToBlobUrl(raw) : raw;
  const opened = window.open(openUrl, "_blank", "noopener,noreferrer");
  if (!opened) {
    const link = document.createElement("a");
    link.href = openUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  if (openUrl !== raw && openUrl.startsWith("blob:")) {
    window.setTimeout(() => URL.revokeObjectURL(openUrl), 60000);
  }
}

/** Keep stored file content when an update sends the filename but omits the data URL. */
export function preserveCustomerDocumentDataUrls(nextRecord, priorRecord = {}) {
  const prior = priorRecord || {};
  Object.entries(CUSTOMER_DOCUMENT_DATA_URL_FIELDS).forEach(([nameField, dataField]) => {
    if (nextRecord[dataField]) return;
    if (!prior[dataField]) return;
    const nextName = String(nextRecord[nameField] || "").trim();
    const priorName = String(prior[nameField] || "").trim();
    if (!nextName || nextName === priorName) {
      nextRecord[dataField] = prior[dataField];
    }
  });
  return nextRecord;
}
