import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MessageSquare, Phone, Shield, X } from "lucide-react";
import {
  DEMO_OTP_EXPIRY_SEC,
  DEMO_OTP_MAX_ATTEMPTS,
  DEMO_OTP_RESEND_COOLDOWN_SEC,
  buildDemoSmsPreview,
  generateDemoOtp,
  maskPhoneForDisplay,
  validateOtpInput,
} from "../services/phoneOtpDemo";

/**
 * Demo-only OTP modal. Swap for Twilio, MSG91, Firebase Phone Auth, Fast2SMS, etc.
 * Parent contract: isOpen, phone, onVerified(), onClose().
 */
export default function PhoneOtpVerificationModal({ isOpen, phone, onVerified, onClose }) {
  const [phase, setPhase] = useState("idle");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [expiryLeft, setExpiryLeft] = useState(DEMO_OTP_EXPIRY_SEC);
  const [resendLeft, setResendLeft] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [sendError, setSendError] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [shake, setShake] = useState(false);
  const autoFillTimerRef = useRef(null);
  const expiryTimerRef = useRef(null);
  const resendTimerRef = useRef(null);
  const userTypedRef = useRef(false);
  const sessionRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (autoFillTimerRef.current) clearTimeout(autoFillTimerRef.current);
    if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    autoFillTimerRef.current = null;
    expiryTimerRef.current = null;
    resendTimerRef.current = null;
  }, []);

  const resetState = useCallback(() => {
    clearTimers();
    setPhase("idle");
    setGeneratedOtp("");
    setOtpInput("");
    setExpiryLeft(DEMO_OTP_EXPIRY_SEC);
    setResendLeft(0);
    setAttempts(0);
    setSendError("");
    setVerifyError("");
    setShake(false);
    userTypedRef.current = false;
  }, [clearTimers]);

  const startExpiryCountdown = useCallback(() => {
    if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
    setExpiryLeft(DEMO_OTP_EXPIRY_SEC);
    expiryTimerRef.current = setInterval(() => {
      setExpiryLeft((s) => {
        if (s <= 1) {
          if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  const startResendCooldown = useCallback(() => {
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    setResendLeft(DEMO_OTP_RESEND_COOLDOWN_SEC);
    resendTimerRef.current = setInterval(() => {
      setResendLeft((s) => {
        if (s <= 1) {
          if (resendTimerRef.current) clearInterval(resendTimerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetState();
      return;
    }

    const clean = String(phone || "").replace(/\D/g, "");
    if (clean.length !== 10) {
      setSendError("Enter a valid 10-digit mobile number.");
      setPhase("idle");
      return;
    }

    const sessionId = ++sessionRef.current;
    setSendError("");
    setVerifyError("");
    setOtpInput("");
    userTypedRef.current = false;
    setPhase("sending");

    let cancelled = false;

    (async () => {
      await new Promise((r) => setTimeout(r, 900 + Math.random() * 500));
      if (cancelled || sessionRef.current !== sessionId) return;

      const otp = generateDemoOtp();
      setGeneratedOtp(otp);
      setAttempts(0);
      setPhase("enter");
      startExpiryCountdown();
      startResendCooldown();

      if (autoFillTimerRef.current) clearTimeout(autoFillTimerRef.current);
      autoFillTimerRef.current = setTimeout(() => {
        if (sessionRef.current !== sessionId) return;
        setOtpInput((cur) => {
          if (userTypedRef.current || cur) return cur;
          return otp;
        });
      }, 2800);
    })();

    return () => {
      cancelled = true;
      sessionRef.current += 1;
      clearTimers();
    };
  }, [isOpen, phone, resetState, clearTimers, startExpiryCountdown, startResendCooldown]);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  };

  const handleVerify = () => {
    setVerifyError("");
    if (expiryLeft <= 0) {
      setVerifyError("OTP has expired. Tap Resend OTP.");
      triggerShake();
      return;
    }
    if (attempts >= DEMO_OTP_MAX_ATTEMPTS) {
      setVerifyError(`Maximum attempts (${DEMO_OTP_MAX_ATTEMPTS}) reached. Resend OTP to try again.`);
      triggerShake();
      return;
    }
    if (!validateOtpInput(generatedOtp, otpInput)) {
      setAttempts((a) => a + 1);
      setVerifyError("Invalid OTP. Please try again.");
      triggerShake();
      return;
    }
    clearTimers();
    setPhase("success");
    setTimeout(() => {
      onVerified?.();
      onClose?.();
    }, 1600);
  };

  const handleResend = async () => {
    if (resendLeft > 0) return;
    const sessionId = ++sessionRef.current;
    setVerifyError("");
    setOtpInput("");
    userTypedRef.current = false;
    setPhase("sending");
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 400));
    if (sessionRef.current !== sessionId) return;
    const otp = generateDemoOtp();
    setGeneratedOtp(otp);
    setAttempts(0);
    setPhase("enter");
    startExpiryCountdown();
    startResendCooldown();
    if (autoFillTimerRef.current) clearTimeout(autoFillTimerRef.current);
    autoFillTimerRef.current = setTimeout(() => {
      if (sessionRef.current !== sessionId) return;
      setOtpInput((cur) => {
        if (userTypedRef.current || cur) return cur;
        return otp;
      });
    }, 2800);
  };

  const handleUseDemoOtp = () => {
    setOtpInput(generatedOtp);
    setVerifyError("");
    userTypedRef.current = true;
  };

  if (!isOpen) return null;

  const masked = maskPhoneForDisplay(phone);
  const smsText = generatedOtp ? buildDemoSmsPreview(generatedOtp) : "";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="otp-demo-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && phase !== "sending") onClose?.();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl ring-1 ring-slate-200/80"
        onClick={(e) => e.stopPropagation()}
      >
        {phase !== "success" ? (
          <button
            type="button"
            onClick={() => onClose?.()}
            disabled={phase === "sending"}
            className="absolute right-3 top-3 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 pr-10">
          <div>
            <p id="otp-demo-title" className="text-lg font-bold text-slate-900">
              Phone verification
            </p>
            <p className="text-[11px] text-slate-600">Secure your customer registration.</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900">
            <Shield className="h-3 w-3" aria-hidden />
            Demo OTP verification
          </span>
        </div>

        <p className="mb-3 text-center text-sm font-medium text-slate-700">
          To: <span className="font-mono tracking-wide">{masked}</span>
        </p>

        {sendError ? <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs text-rose-800">{sendError}</div> : null}

        {phase === "sending" ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-blue-600 text-white shadow-lg">
                <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
              </div>
              <Phone className="absolute -right-1 -bottom-1 h-7 w-7 rounded-lg border border-white bg-white p-1 text-teal-600 shadow" />
            </div>
            <p className="text-sm font-semibold text-slate-800">Sending OTP…</p>
            <p className="text-center text-[11px] text-slate-500">Simulating SMS gateway (no real SMS sent).</p>
          </div>
        ) : null}

        {phase === "enter" ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 shadow-inner">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-800">OTP sent successfully</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-700">to customer mobile number</p>
                  <div className="sms-float mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-snug text-slate-800 shadow-sm">
                    {smsText}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
              <span>
                Expires in:{" "}
                <strong className={expiryLeft <= 15 ? "text-rose-600" : "text-slate-900"}>{expiryLeft}s</strong>
              </span>
              <span>
                Attempts left:{" "}
                <strong className="text-slate-900">{Math.max(0, DEMO_OTP_MAX_ATTEMPTS - attempts)}</strong>
              </span>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700">Enter OTP</span>
              <input
                value={otpInput}
                onChange={(e) => {
                  userTypedRef.current = true;
                  setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setVerifyError("");
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className={`app-input w-full py-2.5 text-center font-mono text-lg tracking-[0.35em] transition ${shake ? "animate-otp-shake border-rose-400" : ""}`}
                placeholder="••••••"
              />
            </label>

            {verifyError ? <p className="text-center text-xs font-medium text-rose-600">{verifyError}</p> : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="button" onClick={handleVerify} className="app-button-primary flex-1 px-4 py-2.5 text-xs font-semibold shadow-sm transition hover:shadow-md">
                Verify OTP
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendLeft > 0}
                className="app-button-secondary flex-1 px-4 py-2.5 text-xs font-semibold transition hover:shadow-md disabled:opacity-45"
              >
                {resendLeft > 0 ? `Resend OTP (${resendLeft}s)` : "Resend OTP"}
              </button>
            </div>
            <button
              type="button"
              onClick={handleUseDemoOtp}
              className="w-full rounded-xl border border-dashed border-teal-300 bg-teal-50/80 py-2 text-xs font-semibold text-teal-900 transition hover:bg-teal-50"
            >
              Use demo OTP (presentations)
            </button>
          </div>
        ) : null}

        {phase === "success" ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="animate-otp-success-pop flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg ring-4 ring-emerald-200/80">
              <CheckCircle2 className="h-9 w-9" strokeWidth={2.5} />
            </div>
            <p className="text-center text-base font-bold text-emerald-800">Phone number verified successfully</p>
            <p className="text-center text-xs text-slate-600">You can continue filling the registration form.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
