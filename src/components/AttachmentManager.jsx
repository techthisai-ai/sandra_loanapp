import { useRef, useState } from "react";
import { Eye, FileText, RefreshCw, Trash2, Upload } from "lucide-react";

function AttachmentRow({ title, value, accept, previewUrl, onPick, onPreview, onDelete }) {
  const inputRef = useRef(null);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{value || "No file uploaded"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="app-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-700"
          >
            {value ? <RefreshCw className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
            {value ? "Replace" : "Upload"}
          </button>
          <button
            type="button"
            onClick={onPreview}
            disabled={!value}
            className="app-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!value}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(event) => onPick(event.target.files?.[0] || null)}
        className="hidden"
      />

      {previewUrl ? <p className="mt-2 text-xs text-blue-600">Preview available for the current session.</p> : null}
    </div>
  );
}

export default function AttachmentManager({
  attachments,
  onUpdateSingle,
}) {
  const [previewItem, setPreviewItem] = useState(null);
  const [previewUrls, setPreviewUrls] = useState({});
  const previewName = previewItem?.name?.toLowerCase() || "";
  const isPdfPreview = previewName.endsWith(".pdf");
  const isImagePreview = [".jpg", ".jpeg", ".png", ".gif", ".webp"].some((extension) => previewName.endsWith(extension));

  const updatePreview = (key, file) => {
    setPreviewUrls((current) => {
      const next = { ...current };
      if (next[key]) {
        URL.revokeObjectURL(next[key]);
      }
      next[key] = file ? URL.createObjectURL(file) : "";
      return next;
    });
  };

  const singleRows = [
    { key: "idDocumentName", title: "Main Person (Primary Applicant) - ID proof", accept: ".pdf,.jpg,.jpeg,.png" },
    { key: "addressProofName", title: "Main Person (Primary Applicant) - Address proof", accept: ".pdf,.jpg,.jpeg,.png" },
    { key: "loanAgreementName", title: "Main Person (Primary Applicant) - Loan agreement PDF", accept: ".pdf" },
  ];

  return (
    <>
      <div className="app-subsection">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Upload required documents</p>
            <p className="mt-1 text-xs text-slate-500">Preview uploaded files, replace existing files, and delete unwanted files.</p>
          </div>
        </div>

        <div className="grid gap-3">
          {singleRows.map((row) => (
            <AttachmentRow
              key={row.key}
              title={row.title}
              value={attachments[row.key]}
              accept={row.accept}
              previewUrl={previewUrls[row.key]}
              onPick={(file) => {
                onUpdateSingle(row.key, file?.name || "");
                updatePreview(row.key, file);
              }}
              onPreview={() =>
                setPreviewItem({
                  title: row.title,
                  name: attachments[row.key],
                  url: previewUrls[row.key] || "",
                })
              }
              onDelete={() => {
                onUpdateSingle(row.key, "");
                updatePreview(row.key, null);
              }}
            />
          ))}

        </div>
      </div>

      {previewItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="app-section-card w-full max-w-3xl shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Attachment preview</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">{previewItem.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{previewItem.name || "No file selected"}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {previewItem.url ? (
                isPdfPreview ? (
                  <iframe title={previewItem.name} src={previewItem.url} className="h-[480px] w-full rounded-xl border border-slate-200 bg-white" />
                ) : isImagePreview ? (
                  <img src={previewItem.url} alt={previewItem.name} className="max-h-[480px] w-full rounded-xl object-contain" />
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
                    Preview is not available for this file type. The uploaded file reference is still saved.
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
                  Preview is available for files uploaded in the current session. Stored records keep the attachment reference name.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
