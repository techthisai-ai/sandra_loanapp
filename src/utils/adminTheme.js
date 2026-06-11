const STORAGE_KEY = "loanweb.adminTheme";

export function getAdminTheme() {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function applyAdminTheme(theme) {
  if (typeof document === "undefined") return;
  const value = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-admin-theme", value);
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Ignore storage errors.
  }
}

export function initAdminTheme() {
  applyAdminTheme(getAdminTheme());
}

export function toggleAdminTheme() {
  const next = getAdminTheme() === "dark" ? "light" : "dark";
  applyAdminTheme(next);
  return next;
}
