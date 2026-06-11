/** Tamil + Latin font for jsPDF (Helvetica cannot render ₹ or Tamil script). */

const PDF_FONT_FAMILY = "RFSNoto";
const PDF_FONT_FILE = "NotoSansTamil-Regular.ttf";

let fontLoadPromise = null;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(""));
}

/**
 * Register and activate Noto Sans Tamil for a jsPDF instance.
 * @param {import("jspdf").jsPDF} doc
 * @param {string} [origin]
 * @returns {Promise<string>} font family name for autoTable styles
 */
export async function ensurePdfUnicodeFont(doc, origin = "") {
  const base = (origin || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");

  if (!fontLoadPromise) {
    fontLoadPromise = (async () => {
      const res = await fetch(`${base}/fonts/${PDF_FONT_FILE}`);
      if (!res.ok) {
        throw new Error(`Could not load PDF font (${res.status})`);
      }
      const base64 = arrayBufferToBase64(await res.arrayBuffer());
      doc.addFileToVFS(PDF_FONT_FILE, base64);
      doc.addFont(PDF_FONT_FILE, PDF_FONT_FAMILY, "normal");
      doc.addFont(PDF_FONT_FILE, PDF_FONT_FAMILY, "bold");
    })();
  }

  await fontLoadPromise;
  doc.setFont(PDF_FONT_FAMILY, "normal");
  return PDF_FONT_FAMILY;
}

export const PDF_UNICODE_FONT = PDF_FONT_FAMILY;
