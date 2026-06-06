/**
 * Dev / QA helpers. Reset controls are hidden in production builds unless
 * VITE_ENABLE_DEMO_RESET=true is set explicitly.
 */
export function isDevTestingMode() {
  if (import.meta.env?.PROD && import.meta.env?.VITE_ENABLE_DEMO_RESET !== "true") {
    return false;
  }
  if (import.meta.env?.VITE_ENABLE_DEMO_RESET === "false") {
    return false;
  }
  return import.meta.env?.DEV === true || import.meta.env?.VITE_ENABLE_DEMO_RESET === "true";
}
