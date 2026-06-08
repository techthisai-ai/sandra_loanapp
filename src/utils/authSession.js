import { Capacitor } from "@capacitor/core";

export const APP_AUTH_SESSION_KEY = "appAuthSessionActive";

export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** localStorage survives Capacitor WebView restarts better than sessionStorage. */
function authSessionStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
}

export function markAuthSessionActive() {
  const storage = authSessionStorage();
  storage?.setItem(APP_AUTH_SESSION_KEY, "1");
}

export function clearAuthSession() {
  const storage = authSessionStorage();
  storage?.removeItem(APP_AUTH_SESSION_KEY);
}

export function isAuthSessionActive() {
  const storage = authSessionStorage();
  return storage?.getItem(APP_AUTH_SESSION_KEY) === "1";
}

/**
 * Web browsers: clear the in-tab session on each full reload so /login is always shown first.
 * Native APK: keep the session flag so Firebase auth + profile can restore the signed-in state.
 */
export function resetAuthSessionOnAppLaunch() {
  if (isNativeApp()) return;
  clearAuthSession();
}

/**
 * Native apps restore the session flag when Firebase already has a valid user + profile.
 * Web requires an explicit sign-in during the current browser session.
 */
export function ensureAuthSessionForUser(user, profile) {
  if (!user || !profile) return false;
  if (isAuthSessionActive()) return true;
  if (!isNativeApp()) return false;
  markAuthSessionActive();
  return true;
}
