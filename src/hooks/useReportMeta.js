import { useMemo } from "react";
import useAuth from "./useAuth";
import { BRAND_SUPPORT_EMAIL } from "../constants/brand";
import { buildReportId } from "../utils/reportFilenames";

/**
 * Shared report metadata for previews and PDF exports.
 * @param {string} [typeSegment] — e.g. RPT-COL, APR
 */
export default function useReportMeta(typeSegment = "RPT") {
  const { user, profile } = useAuth();

  return useMemo(() => {
    return {
      reportId: buildReportId(typeSegment),
      preparedBy: profile?.displayName || profile?.name || user?.email || "Administrator",
      branch: profile?.center || profile?.branch || "",
      contact: BRAND_SUPPORT_EMAIL,
      generatedLabel: new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
    };
  }, [typeSegment, profile?.branch, profile?.center, profile?.displayName, profile?.name, user?.email]);
}
