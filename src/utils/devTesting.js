import { canMutateFinanceTestData } from "../firebase/environment";

/**
 * Dev / QA helpers (seed + reset). Only available on Firebase Emulator so localhost
 * cannot delete or pollute the live deployed database.
 */
export function isDevTestingMode() {
  if (!canMutateFinanceTestData()) {
    return false;
  }
  if (import.meta.env?.PROD && import.meta.env?.VITE_ENABLE_DEMO_RESET !== "true") {
    return false;
  }
  if (import.meta.env?.VITE_ENABLE_DEMO_RESET === "false") {
    return false;
  }
  return import.meta.env?.DEV === true || import.meta.env?.VITE_ENABLE_DEMO_RESET === "true";
}
