import { useMemo } from "react";
import useAuth from "./useAuth";
import { reportDateStamp } from "../utils/reportFilenames";

/**
 * Shared report metadata for previews and PDF exports.
 * @param {string} [prefix] — e.g. RFS-CR, RFS-APR
 */
export default function useReportMeta(prefix = "RFS-RPT") {
  const { user, profile } = useAuth();

  return useMemo(() => {
    const suffix = Math.random().toString(36).slice(-4).toUpperCase();
    return {
      reportId: `${prefix}-${reportDateStamp()}-${suffix}`,
      preparedBy: profile?.displayName || profile?.name || user?.email || "Administrator",
      branch: profile?.center || profile?.branch || "",
      contact: "support@ruthra.financial",
      generatedLabel: new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
    };
  }, [prefix, profile?.branch, profile?.center, profile?.displayName, profile?.name, user?.email]);
}
