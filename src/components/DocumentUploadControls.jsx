import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, FileImage, Upload, UserRound, X } from "lucide-react";
import CameraCaptureModal from "./CameraCaptureModal";

function facingFromCapture(capture) {
  return capture === "environment" ? "environment" : "user";
}

/** Document card with Camera (live / mobile capture) + Upload (gallery/files only). */
export function DocumentCompactAttach({
  label,
  value,
  url,
  accept,
  capture = "environment",
  onPick,
  onClear,
  disabled = false,
  required = false,
  invalid = false,
  helperText = "",
  emptyHint = "Drop a file here or use Camera / Upload",
  dense = false,
}) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fallbackCameraRef = useRef(null);
  const uploadRef = useRef(null);
  const hasFile = Boolean(value);

  const handleUpload = (file) => {
    if (!file || disabled) return;
    onPick(file);
  };

  const openCamera = () => {
    if (disabled) return;
    if (navigator.mediaDevices?.getUserMedia) {
      setCameraOpen(true);
      return;
    }
    fallbackCameraRef.current?.click();
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    setIsDragging(false);
    handleUpload(event.dataTransfer.files?.[0]);
  };

  const btn = dense
    ? "inline-flex !min-h-0 h-8 w-full items-center justify-center gap-1 rounded-lg border px-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
    : "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border px-3 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

  const resolvedEmptyHint = dense ? "Camera or Upload" : emptyHint;

  return (
    <div
      className={`rounded-2xl border bg-white shadow-sm ring-1 transition hover:shadow-md ${
        dense ? "p-2" : "p-3"
      } ${
        invalid
          ? "border-rose-400 bg-rose-50/40 ring-rose-100/80"
          : "border-slate-200/90 ring-slate-100/80 hover:border-blue-200/70"
      } ${
        disabled ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={dense ? "loan-apply-label" : "text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600"}>
          {label}
          {required ? <span className="ml-1 text-rose-500">*</span> : null}
        </p>
        {hasFile ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-emerald-800">
            <CheckCircle2 className="h-2.5 w-2.5" />
            {dense ? "OK" : "Uploaded"}
          </span>
        ) : null}
      </div>

      {!dense ? (
      <div
        className={`mt-2 rounded-xl border border-dashed px-3 py-3 text-center transition ${
          invalid
            ? "border-rose-300 bg-rose-50/60"
            : isDragging
              ? "border-blue-400 bg-blue-50/80"
              : "border-slate-200 bg-slate-50/80"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
          <FileImage className="h-4.5 w-4.5" />
        </div>
        <p className="mt-2 text-[11px] font-medium text-slate-600">{hasFile ? "Document ready" : resolvedEmptyHint}</p>
        <p className="mt-1 truncate text-[10px] text-slate-400" title={value || undefined}>
          {hasFile ? value : helperText || "JPG, PNG, PDF supported"}
        </p>
      </div>
      ) : (
        <p className="loan-apply-hint mt-1.5 truncate text-slate-400" title={value || undefined}>
          {hasFile ? value : helperText || "JPG, PNG, PDF"}
        </p>
      )}

      <div className={`grid grid-cols-2 gap-1.5 ${dense ? "mt-2" : "mt-3 gap-2"}`}>
        <button
          type="button"
          onClick={openCamera}
          disabled={disabled}
          className={`${btn} border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100`}
        >
          <Camera className={`shrink-0 ${dense ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
          Camera
        </button>
        <button
          type="button"
          onClick={() => !disabled && uploadRef.current?.click()}
          disabled={disabled}
          className={`${btn} border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`}
        >
          <Upload className={`shrink-0 ${dense ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
          Upload
        </button>
        <input
          ref={uploadRef}
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={(e) => {
            handleUpload(e.target.files?.[0]);
            e.target.value = "";
          }}
          className="hidden"
        />
        <input
          ref={fallbackCameraRef}
          type="file"
          accept="image/*"
          capture={capture}
          disabled={disabled}
          onChange={(e) => {
            handleUpload(e.target.files?.[0]);
            e.target.value = "";
          }}
          className="hidden"
        />
      </div>
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleUpload}
        facingMode={facingFromCapture(capture)}
        title={`Camera — ${label}`}
      />
      {hasFile ? (
        <div className={`mt-1.5 flex items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50/60 ${dense ? "px-2 py-1" : "px-2.5 py-2"}`}>
          <CheckCircle2 className={`shrink-0 text-emerald-600 ${dense ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
          <span className={`min-w-0 flex-1 truncate text-emerald-900 ${dense ? "loan-apply-hint" : "text-[9px] font-medium"}`}>{value}</span>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className={`shrink-0 font-semibold text-blue-600 hover:underline ${dense ? "loan-apply-hint" : "text-[9px]"}`}>
              View
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="shrink-0 rounded p-0.5 text-rose-600 hover:bg-rose-50"
            aria-label={`Remove ${label}`}
          >
            <X className={`${dense ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
          </button>
        </div>
      ) : !dense ? (
        <p className={`mt-2 text-[10px] font-medium ${invalid ? "text-rose-600" : "text-slate-400"}`}>
          {helperText || "No file selected"}
        </p>
      ) : null}
    </div>
  );
}

/** Square photo preview with Camera + Upload — vertical, centered fintech layout. */
export function DocumentPhotoTile({
  label,
  preview,
  fileName,
  onPick,
  onClear,
  capture = "user",
  disabled = false,
  className = "",
  required = false,
  invalid = false,
  helperText = "",
  dense = false,
}) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewLoadFailed, setPreviewLoadFailed] = useState(false);
  const fallbackCameraRef = useRef(null);
  const uploadRef = useRef(null);
  const hasFile = Boolean(fileName);

  useEffect(() => {
    setPreviewLoadFailed(false);
  }, [preview]);

  const handleUpload = (file) => {
    if (!file || disabled) return;
    onPick(file);
  };

  const openCamera = () => {
    if (disabled) return;
    if (navigator.mediaDevices?.getUserMedia) {
      setCameraOpen(true);
      return;
    }
    fallbackCameraRef.current?.click();
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    setIsDragging(false);
    handleUpload(event.dataTransfer.files?.[0]);
  };

  const actionBtn = dense
    ? "inline-flex !min-h-0 aspect-square h-9 w-full min-w-0 items-center justify-center rounded-lg border p-0 shadow-sm transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
    : "inline-flex !min-h-0 h-10 w-full items-center justify-center gap-1.5 rounded-xl border px-3 text-[11px] font-semibold leading-none shadow-sm transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      className={`mx-auto flex w-full shrink-0 flex-col items-center rounded-2xl border bg-white shadow-md shadow-slate-900/5 ring-1 transition ${
        dense ? "max-w-[112px] p-2" : "max-w-[184px] p-3.5"
      } ${
        invalid ? "border-rose-400 bg-rose-50/40 ring-rose-100/90" : "border-slate-200/90 ring-slate-100/90"
      } ${className}`}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <p className={dense ? "loan-apply-label min-w-0" : "min-w-0 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500"}>
          {label}
          {required ? <span className="ml-1 text-rose-500">*</span> : null}
        </p>
        {hasFile ? (
          <span className={`inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 font-bold uppercase text-emerald-800 ${dense ? "px-1.5 py-0 text-[8px]" : "px-2 py-0.5 text-[9px]"}`}>
            <CheckCircle2 className={dense ? "h-2.5 w-2.5" : "h-3 w-3"} />
            {dense ? "OK" : "Ready"}
          </span>
        ) : null}
      </div>

      <div
        className={`relative w-full ${dense ? "mt-1.5" : "mt-3"}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div
          className={`aspect-square w-full overflow-hidden rounded-xl border bg-gradient-to-br shadow-inner ring-1 transition ${
            invalid
              ? "border-rose-300 from-rose-50 via-white to-rose-50/70 ring-rose-100/80"
              : isDragging
                ? "border-blue-400 from-blue-50 via-white to-blue-50/70 ring-blue-100/80"
                : "border-slate-200/90 from-slate-50 via-white to-slate-100/90 ring-slate-100/80"
          }`}
        >
          <div className="flex h-full w-full items-center justify-center">
            {preview && !previewLoadFailed ? (
              <img
                src={preview}
                alt=""
                className="h-full w-full object-cover object-center"
                onError={() => setPreviewLoadFailed(true)}
              />
            ) : (
              <UserRound className={`text-slate-300/90 ${dense ? "h-6 w-6" : "h-10 w-10"}`} strokeWidth={1.5} />
            )}
          </div>
        </div>
        {fileName && onClear ? (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-rose-600 shadow-sm backdrop-blur-sm transition hover:bg-rose-50 disabled:opacity-50"
            aria-label={`Remove ${label}`}
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      <div className={`grid w-full ${dense ? "mt-1.5 grid-cols-2 gap-1" : "mt-3 grid-cols-2 gap-2 max-[360px]:grid-cols-1"}`}>
        <button
          type="button"
          onClick={openCamera}
          disabled={disabled}
          aria-label={`Camera — ${label}`}
          title="Camera"
          className={`${actionBtn} border-blue-300/90 bg-blue-50 text-blue-800 hover:border-blue-400 hover:bg-blue-100`}
        >
          <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {!dense ? <span>Camera</span> : null}
        </button>
        <button
          type="button"
          onClick={() => !disabled && uploadRef.current?.click()}
          disabled={disabled}
          aria-label={`Upload — ${label}`}
          title="Upload"
          className={`${actionBtn} border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`}
        >
          <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {!dense ? <span>Upload</span> : null}
        </button>
      </div>

      <input
        ref={uploadRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/*"
        disabled={disabled}
        onChange={(e) => {
          handleUpload(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="hidden"
      />
      <input
        ref={fallbackCameraRef}
        type="file"
        accept="image/*"
        capture={capture}
        disabled={disabled}
        onChange={(e) => {
          handleUpload(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="hidden"
      />

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleUpload}
        facingMode={facingFromCapture(capture)}
        title={`Camera — ${label}`}
      />

      <p
        className={`w-full px-0.5 text-center leading-snug ${
          dense ? "loan-apply-hint mt-1" : "mt-2.5 text-[10px] font-medium"
        } ${
          fileName ? "text-emerald-800" : invalid ? "text-rose-600" : "text-slate-400"
        }`}
        title={fileName || undefined}
      >
        <span className="block truncate">{fileName || helperText || "No file selected"}</span>
      </p>
    </div>
  );
}
