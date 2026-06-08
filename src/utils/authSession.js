export const APP_AUTH_SESSION_KEY = "appAuthSessionActive";

/** localStorage survives Capacitor WebView navigation better than sessionStorage. */
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
