import { AlertTriangle } from "lucide-react";
import { firebaseConfig } from "../firebase/config";
import { getFirebaseProjectId } from "../firebase/environment";

export default function FirebaseSyncAlert({ error, customerCount, loading, className = "" }) {
  if (loading) {
    return null;
  }

  const projectId = getFirebaseProjectId() || firebaseConfig.projectId;

  if (error) {
    return (
      <div
        className={`flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 ${className}`}
        role="alert"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Could not load data from Firebase</p>
          <p className="mt-1 text-xs leading-relaxed">{error}</p>
          <p className="mt-2 text-xs leading-relaxed text-rose-800">
            Project: <span className="font-mono">{projectId}</span>. Sign in as admin, then confirm this URL is listed
            under Firebase Console → Authentication → Settings → Authorized domains.
          </p>
        </div>
      </div>
    );
  }

  if (customerCount === 0) {
    return (
      <div
        className={`flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 ${className}`}
        role="status"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">No active customers loaded from Firebase</p>
          <p className="mt-1 text-xs leading-relaxed">
            Firestore project <span className="font-mono">{projectId}</span> returned 0 active customers. Records may be
            soft-deleted — open Customer → <span className="font-semibold">Deleted</span> tab to restore them. Use{" "}
            <a
              href={`https://${projectId}.web.app`}
              className="font-semibold underline"
              target="_blank"
              rel="noreferrer"
            >
              {projectId}.web.app
            </a>{" "}
            after deploy.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
