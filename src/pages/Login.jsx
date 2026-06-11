import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import AppLoadingScreen from "../components/AppLoadingScreen";
import BrandLogo from "../components/BrandLogo";
import { auth } from "../firebase/config";
import { isUsingFirebaseEmulators } from "../firebase/environment";
import { loginWithRoleTimed } from "../services/userAuth";
import useAuth from "../hooks/useAuth";
import {
  clearAuthSession,
  ensureAuthSessionForUser,
  markAuthSessionActive,
} from "../utils/authSession";

export default function Login() {
  const navigate = useNavigate();
  const { profile, user, loading, refreshProfile, setProfileFromLogin } = useAuth();
  const identifierRef = useRef(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [retryingProfile, setRetryingProfile] = useState(false);

  const brokenSession = Boolean(!loading && user && !profile);

  useEffect(() => {
    if (loading || !user || !profile) return;
    if (!ensureAuthSessionForUser(user, profile)) return;
    navigate(profile.role === "admin" ? "/dashboard" : "/employee", { replace: true });
  }, [loading, navigate, profile, user]);

  const handleRetryProfile = async () => {
    if (!user) return;
    setRetryingProfile(true);
    setError("");
    try {
      const restoredProfile = await refreshProfile(user);
      if (restoredProfile && ensureAuthSessionForUser(user, restoredProfile)) {
        navigate(restoredProfile.role === "admin" ? "/dashboard" : "/employee", { replace: true });
      } else if (!restoredProfile) {
        setError("Profile still could not be loaded. Check your connection and try again.");
      }
    } catch (retryError) {
      setError(retryError.message || "Could not reload your profile.");
    } finally {
      setRetryingProfile(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setError("");
    try {
      clearAuthSession();
      await signOut(auth);
      setIdentifier("");
      setPassword("");
    } catch (signOutError) {
      setError(signOutError.message || "Could not sign out");
    } finally {
      setSigningOut(false);
    }
  };

  const finishLogin = (signedInProfile, credential) => {
    markAuthSessionActive();
    setProfileFromLogin(signedInProfile, credential.user.uid);
    navigate(signedInProfile.role === "admin" ? "/dashboard" : "/employee", { replace: true });
  };

  const performLogin = async () => {
    const trimmedIdentifier = String(identifier ?? "").trim();
    const trimmedPassword = String(password ?? "").trim();

    if (!trimmedIdentifier) {
      setError("Enter your email or username.");
      return;
    }

    if (!trimmedPassword) {
      setError("Enter your password.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const { credential, profile: signedInProfile } = await loginWithRoleTimed({
        email: trimmedIdentifier,
        password: trimmedPassword,
      });
      finishLogin(signedInProfile, credential);
    } catch (loginError) {
      const code = loginError?.code || "";
      if (code === "auth/network-request-failed" && isUsingFirebaseEmulators()) {
        setError(
          'Cannot reach the Firebase Emulator. Start it with "npm run emulators" in another terminal, or use "npm run dev" to sign in against live Firebase.'
        );
      } else {
        setError(loginError.message || "Login failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await performLogin();
  };

  if (loading) {
    return <AppLoadingScreen message="Preparing sign in…" />;
  }

  return (
    <main className="app-shell flex min-h-[100dvh] items-center justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] text-slate-900 sm:px-6 sm:py-10">
      <section className="app-panel w-full max-w-md rounded-[24px] p-6 sm:rounded-[28px] sm:p-8 md:max-w-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <BrandLogo variant="md" className="shrink-0" />
          <div className="min-w-0">
            <p className="app-eyebrow text-[11px] font-semibold uppercase tracking-[0.24em]">Sign in</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Ruthra Financial Solutions</h1>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {brokenSession ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
            <p className="mb-2">
              Your session could not load a profile. Sign out and try again with your admin email or employee username.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRetryProfile}
                disabled={retryingProfile || signingOut}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-950 hover:bg-amber-50 disabled:opacity-60"
              >
                {retryingProfile ? "Retrying…" : "Retry"}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut || retryingProfile}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-950 hover:bg-amber-50 disabled:opacity-60"
              >
                <LogOut className="h-3.5 w-3.5" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        ) : null}

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="login-identifier">
              Email / Username
            </label>
            <input
              ref={identifierRef}
              id="login-identifier"
              type="text"
              value={identifier}
              disabled={busy}
              onChange={(event) => setIdentifier(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white disabled:opacity-60"
              placeholder="Enter email or username"
              autoComplete="username"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-12 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white disabled:opacity-60"
                placeholder="Enter password"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 transition hover:text-slate-700"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="app-button-primary inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
          >
            <ArrowRight className="h-4 w-4" />
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
