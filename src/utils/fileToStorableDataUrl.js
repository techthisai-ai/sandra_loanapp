/**
 * Converts an uploaded file into a data URL that is safe to store inside a
 * Firestore document. Firestore caps each document at ~1 MB, and customer
 * records embed several images (photo, ID proof, address proof, etc.) in the
 * same document. To avoid "document too large" write failures we compress and
 * resize images on the client before persisting them.
 *
 * Non-image files (e.g. PDFs) cannot be re-encoded here, so they are returned
 * as-is. Images of any size are downscaled / re-compressed until they fit under
 * the target byte budget.
 */

const DEFAULT_TARGET_BYTES = 320 * 1024; // ~320 KB per attachment
const DEFAULT_MAX_DIMENSION = 1400; // longest edge in pixels

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

/** Approximate decoded byte length of a base64 data URL. */
export function dataUrlByteLength(dataUrl) {
  if (typeof dataUrl !== "string") return 0;
  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to decode image"));
    img.src = src;
  });
}

/**
 * @param {File} file
 * @param {{ targetBytes?: number, maxDimension?: number }} [options]
 * @returns {Promise<string>} a data URL small enough to embed in Firestore
 */
export async function fileToStorableDataUrl(file, options = {}) {
  if (!file) return "";

  const targetBytes = options.targetBytes || DEFAULT_TARGET_BYTES;
  const maxDimension = options.maxDimension || DEFAULT_MAX_DIMENSION;

  const original = await readFileAsDataUrl(file);
  if (!original) return "";

  const isImage = String(file.type || "").startsWith("image/");
  if (!isImage) {
    // Cannot re-encode PDFs / other docs; return what we have.
    return original;
  }

  // Small enough already (and not a huge-dimension image) – keep original.
  if (dataUrlByteLength(original) <= targetBytes) {
    return original;
  }

  let image;
  try {
    image = await loadImage(original);
  } catch {
    return original;
  }

  const longestEdge = Math.max(image.width, image.height) || 1;
  let dimension = Math.min(maxDimension, longestEdge);
  let quality = 0.82;
  let best = original;

  for (let attempt = 0; attempt < 9; attempt += 1) {
    const scale = Math.min(1, dimension / longestEdge);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;

    // White backdrop so transparent PNGs don't turn black as JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const candidate = canvas.toDataURL("image/jpeg", quality);
    if (candidate && candidate.length > 0) {
      best = candidate;
      if (dataUrlByteLength(candidate) <= targetBytes) {
        return candidate;
      }
    }

    // Reduce quality first, then shrink dimensions once quality is low.
    if (quality > 0.5) {
      quality -= 0.12;
    } else {
      dimension = Math.round(dimension * 0.82);
      quality = 0.7;
    }
  }

  return best;
}
