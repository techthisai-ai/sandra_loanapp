/** Live production Firebase project — deployed hosting must use this. */
export const PRODUCTION_FIREBASE_PROJECT_ID = "sandraloanapp-85985";

export function getFirebaseProjectId() {
  return import.meta.env.VITE_FIREBASE_PROJECT_ID || PRODUCTION_FIREBASE_PROJECT_ID;
}

export function isUsingFirebaseEmulators() {
  // Production builds must always use live Firebase, never localhost emulators.
  if (import.meta.env.PROD) {
    return false;
  }
  return import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";
}

export function isProductionFirebaseProject() {
  return getFirebaseProjectId() === PRODUCTION_FIREBASE_PROJECT_ID;
}

/** Auto-create demo admin/employee only on local emulators (never on live production). */
export function canRunDemoBootstrap() {
  if (isUsingFirebaseEmulators()) {
    return true;
  }
  return import.meta.env.VITE_ALLOW_DEMO_SEED === "true";
}

/** Seed / reset finance data — emulators only so localhost cannot wipe deployed data. */
export function canMutateFinanceTestData() {
  return isUsingFirebaseEmulators();
}

export function getFirebaseEnvironmentLabel() {
  if (isUsingFirebaseEmulators()) {
    return `Local emulator · ${getFirebaseProjectId()}`;
  }
  if (import.meta.env.PROD) {
    return `Production · ${getFirebaseProjectId()}`;
  }
  return `Development · ${getFirebaseProjectId()} (live Firebase — use emulators to isolate local testing)`;
}

export function assertLocalFirebaseEnvironment(actionLabel = "This action") {
  if (canMutateFinanceTestData()) {
    return;
  }
  throw new Error(
    `${actionLabel} is blocked on the live Firebase project (${getFirebaseProjectId()}). ` +
      "Local testing must use the Firebase Emulator: run `npm run emulators` in one terminal, then `npm run dev` in another. " +
      "Deployed data is stored in Firebase and is separate from emulator data."
  );
}
