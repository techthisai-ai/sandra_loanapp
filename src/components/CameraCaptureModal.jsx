import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";

export default function CameraCaptureModal({ open, onClose, onCapture, facingMode = "user", title = "Take photo" }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      setError("");
      setStarting(false);
      return undefined;
    }

    let cancelled = false;
    setStarting(true);
    setError("");

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera is not supported in this browser. Use Upload instead.");
        setStarting(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
      } catch {
        setError("Unable to access the camera. Allow permission or use Upload instead.");
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facingMode, open, stopStream]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture?.(file);
        onClose?.();
      },
      "image/jpeg",
      0.92
    );
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition hover:bg-slate-50"
            aria-label="Close camera"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative aspect-[4/3] bg-slate-950">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          {starting ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          ) : null}
        </div>

        {error ? <p className="px-4 py-2 text-sm text-rose-600">{error}</p> : null}

        <div className="flex gap-2 border-t border-slate-100 p-4">
          <button type="button" onClick={onClose} className="app-button-secondary flex-1 rounded-xl py-2.5 text-sm font-medium">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCapture}
            disabled={starting || Boolean(error)}
            className="app-button-primary inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            Capture
          </button>
        </div>
      </div>
    </div>
  );
}
