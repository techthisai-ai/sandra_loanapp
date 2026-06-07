export const APP_AUTH_SESSION_KEY = "appAuthSessionActive";

export function markAuthSessionActive() {
  sessionStorage.setItem(APP_AUTH_SESSION_KEY, "1");
}

export function clearAuthSession() {
  sessionStorage.removeItem(APP_AUTH_SESSION_KEY);
}

export function isAuthSessionActive() {
  return sessionStorage.getItem(APP_AUTH_SESSION_KEY) === "1";
}
