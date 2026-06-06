import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import BrandLogo from "../components/BrandLogo";
import { auth } from "../firebase/config";
import {
  loginWithRoleTimed,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from "../services/userAuth";
import useAuth from "../hooks/useAuth";

export default function Login() {
  const navigate = useNavigate();
  const { profile, user, loading, refreshProfile, setProfile } = useAuth();
  const usernameRef = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loginMode, setLoginMode] = useState("employee");
  const [busyAction, setBusyAction] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  const isSignedIn = Boolean(!loading && user && profile);
  const isEmployee = profile?.role === "employee";
  const brokenSession = Boolean(!loading && user && !profile);
  const canShowLoginForm = !loading && !user;

  const goToApp = () => {
    if (!profile) return;
    navigate(profile.role === "admin" ? "/dashboard" : "/employee", { replace: true });
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setError("");
    try {
      await signOut(auth);
      setEmail("");
      setPassword("");
      setLoginMode("employee");
      setBusyAction(null);
    } catch (signOutError) {
      setError(signOutError.message || "Could not sign out");
    } finally {
      setSigningOut(false);
    }
  };

  const finishLogin = async (signedInProfile, credential) => {
    setProfile(signedInProfile);
    await refreshProfile(credential.user);
    navigate(signedInProfile.role === "admin" ? "/dashboard" : "/employee", { replace: true });
  };

  const performLogin = async (loginIdentifier, loginPassword, action) => {
    const trimmedIdentifier = String(loginIdentifier ?? "").trim();
    const trimmedPassword = String(loginPassword ?? "").trim();

    if (!trimmedIdentifier) {
      setError(loginMode === "employee" ? "Enter your username." : "Enter your username or admin email.");
      return;
    }
    if (!trimmedPassword) {
      setError("Enter your password.");
      return;
    }

    setBusyAction(action);
    setError("");

    try {
      const { credential, profile: signedInProfile } = await loginWithRoleTimed({
        email: trimmedIdentifier,
        password: trimmedPassword,
      });
      await finishLogin(signedInProfile, credential);
    } catch (loginError) {
      setError(loginError.message || "Login failed");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await performLogin(email, password, "employee");
  };

  const handleAdminLogin = async () => {
    setLoginMode("admin");
    setEmail(ADMIN_EMAIL);
    setPassword(ADMIN_PASSWORD);
    await performLogin(ADMIN_EMAIL, ADMIN_PASSWORD, "admin");
  };

  const handleEmployeeMode = () => {
    if (busyAction) return;
    setLoginMode("employee");
    setError("");
    setEmail("");
    setPassword("");
    usernameRef.current?.focus();
  };

  const isAdminBusy = busyAction === "admin";
  const isEmployeeBusy = busyAction === "employee";

  if (loading) {
    return (
      <main className="app-shell flex min-h-[100dvh] items-center justify-center px-6 py-10 text-slate-900">
        <section className="app-panel w-full max-w-md rounded-[28px] p-8 text-center">
          <p className="text-sm font-medium text-slate-700">Preparing sign in…</p>
          <p className="mt-2 text-xs text-slate-500">Setting up login accounts if needed.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell flex min-h-[100dvh] items-center justify-center px-6 py-10 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] text-slate-900">
      <section className="app-panel w-full max-w-md rounded-[28px] p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <BrandLogo variant="md" className="shrink-0" />
          <div className="min-w-0">
            <p className="app-eyebrow text-[11px] font-semibold uppercase tracking-[0.24em]">Sign in</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Ruthra Financial Solutions</h1>
          </div>
        </div>

        <p className="app-description mt-4 text-sm leading-6">
          {isSignedIn
            ? isEmployee
              ? "You’re signed in. Continue to the collection app or sign out to use a different account."
              : "You’re signed in. Continue to the admin dashboard or sign out to use a different account."
            : loginMode === "employee"
              ? "Employees: choose Employee login, enter the username and password set by your admin, then click Sign in."
              : "Admins: click Admin login for instant access, or enter admin email and password below."}
        </p>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {isSignedIn ? (
          <div className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
            <p className="text-sm text-slate-700">
              <span className="font-medium text-slate-900">{profile.displayName || "Signed-in user"}</span>
              {profile.email ? (
                <span className="mt-1 block text-xs text-slate-500">{profile.email}</span>
              ) : null}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                type="button"
                onClick={goToApp}
                className="app-button-primary inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium"
              >
                <ArrowRight className="h-4 w-4" />
                {isEmployee ? "Open collection app" : "Open dashboard"}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="app-button-secondary inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
              >
                <LogOut className="h-4 w-4" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        ) : null}

        {brokenSession ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
            <p className="mb-2">
              Your session could not load a profile. Sign out and try again with Admin login or your employee username.
            </p>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-950 hover:bg-amber-50 disabled:opacity-60"
            >
              <LogOut className="h-3.5 w-3.5" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        ) : null}

        {canShowLoginForm ? (
          <>
            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => void handleAdminLogin()}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    loginMode === "admin"
                      ? "border-teal-300 bg-teal-50 text-teal-900"
                      : "border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100"
                  }`}
                >
                  {isAdminBusy ? "Signing in…" : "Admin login"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={handleEmployeeMode}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    loginMode === "employee"
                      ? "border-slate-300 bg-slate-100 text-slate-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Employee login
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="email">
                  {loginMode === "employee" ? "Username" : "Username or admin email"}
                </label>
                <input
                  ref={usernameRef}
                  id="email"
                  type="text"
                  value={email}
                  disabled={Boolean(busyAction)}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (loginMode === "admin" && !event.target.value.includes("@")) {
                      setLoginMode("employee");
                    }
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white disabled:opacity-60"
                  placeholder={loginMode === "employee" ? "Enter username (e.g. mari)" : "Enter username or admin email"}
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
                    disabled={Boolean(busyAction)}
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
                disabled={Boolean(busyAction)}
                className="app-button-primary inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
              >
                <ArrowRight className="h-4 w-4" />
                {isEmployeeBusy ? "Signing in…" : loginMode === "employee" ? "Employee sign in" : "Sign in"}
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-[11px] leading-relaxed text-slate-600">
              <p className="font-semibold text-slate-800">How to sign in</p>
              <p className="mt-1.5">
                <span className="font-medium text-slate-700">Admin:</span> click{" "}
                <span className="font-medium text-slate-700">Admin login</span> (uses{" "}
                <span className="font-mono text-slate-800">{ADMIN_EMAIL}</span> /{" "}
                <span className="font-mono text-slate-800">{ADMIN_PASSWORD}</span>).
              </p>
              <p className="mt-1.5">
                <span className="font-medium text-slate-700">Employee:</span> click{" "}
                <span className="font-medium text-slate-700">Employee login</span>, enter the username and password
                created on the Employee page, then click <span className="font-medium text-slate-700">Employee sign in</span>.
              </p>
              <p className="mt-2 text-slate-500">
                If admin login fails, deploy Firestore rules:{" "}
                <span className="font-mono text-slate-700">firebase deploy --only firestore:rules</span>
              </p>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
