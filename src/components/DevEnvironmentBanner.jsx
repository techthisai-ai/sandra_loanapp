import { isUsingFirebaseEmulators } from "../firebase/environment";

/** Shown only when running against the local Firebase Emulator (npm run dev:emulator). */
export default function DevEnvironmentBanner() {
  if (!isUsingFirebaseEmulators()) {
    return null;
  }

  return (
    <div
      className="shrink-0 border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-medium text-emerald-900"
      role="status"
    >
      Local Firebase Emulator — changes here do <span className="font-semibold">not</span> affect your deployed
      website.
    </div>
  );
}
