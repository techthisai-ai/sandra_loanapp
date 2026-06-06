import { notifyLoanCentersChanged } from "./loanCenterStorage";

export const LOAN_CENTERS_STORAGE_KEY = "loanCenters";

/** Weekday names used in filters (excludes Sunday — no Sunday Centre in this product). */
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Root day-centre labels (Mon–Sat). */
export const DAY_CENTER_LABELS = WEEKDAY_NAMES.map((day) => `${day} Centre`);

/** Customer list / image filters: All weekdays + unassigned. */
export const CUSTOMER_DAY_FILTER_OPTIONS = ["All", ...WEEKDAY_NAMES, "No Centre"];

/** Root centres for employee mobile UI and coloured cards. */
export const EMPLOYEE_ROOT_DAY_CENTERS = [
  { label: "Monday Centre", short: "Mon", color: "border-blue-200 bg-blue-50 text-blue-600" },
  { label: "Tuesday Centre", short: "Tue", color: "border-violet-200 bg-violet-50 text-violet-600" },
  { label: "Wednesday Centre", short: "Wed", color: "border-emerald-200 bg-emerald-50 text-emerald-600" },
  { label: "Thursday Centre", short: "Thu", color: "border-amber-200 bg-amber-50 text-amber-600" },
  { label: "Friday Centre", short: "Fri", color: "border-rose-200 bg-rose-50 text-rose-600" },
  { label: "Saturday Centre", short: "Sat", color: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-600" },
];

/** @deprecated Use EMPLOYEE_ROOT_DAY_CENTERS — kept for existing imports. */
export const EMPLOYEE_ROOT_DAYS = EMPLOYEE_ROOT_DAY_CENTERS;

/** Default root centres with colour + empty parent (Center, Loan apply, etc.). */
export const DEFAULT_DAY_CENTERS = EMPLOYEE_ROOT_DAY_CENTERS.map(({ label, color }) => ({
  label,
  color,
  parent: "",
}));

/** Centres with explicit `day` field (Customer module). */
export const DEFAULT_CENTERS_WITH_DAY = WEEKDAY_NAMES.map((day) => ({
  label: `${day} Centre`,
  parent: "",
  day,
}));

/** Palette for dynamically added sub-centres. */
export const ADDITIONAL_CENTER_COLORS = [
  "border-cyan-200 bg-cyan-50 text-cyan-600",
  "border-indigo-200 bg-indigo-50 text-indigo-600",
  "border-lime-200 bg-lime-50 text-lime-600",
  "border-orange-200 bg-orange-50 text-orange-600",
  "border-pink-200 bg-pink-50 text-pink-600",
];

export function isDefaultDayCenterLabel(label) {
  return DAY_CENTER_LABELS.includes(String(label ?? "").trim());
}

/** Root day centres plus sub-centres from localStorage extras. */
export function loadLoanCenters() {
  if (typeof window === "undefined") return DEFAULT_DAY_CENTERS;
  const stored = window.localStorage.getItem(LOAN_CENTERS_STORAGE_KEY);
  if (!stored) return DEFAULT_DAY_CENTERS;
  try {
    const extra = JSON.parse(stored);
    if (!Array.isArray(extra)) return DEFAULT_DAY_CENTERS;
    return [...DEFAULT_DAY_CENTERS, ...extra.map((c) => ({ parent: c.parent ?? "", ...c }))];
  } catch {
    return DEFAULT_DAY_CENTERS;
  }
}

/** Persist only non-default centres (sub-centres) to localStorage. */
export function saveLoanCentersExtras(centers) {
  if (typeof window === "undefined") return;
  const extra = (centers || []).filter((c) => !isDefaultDayCenterLabel(c.label));
  window.localStorage.setItem(LOAN_CENTERS_STORAGE_KEY, JSON.stringify(extra));
  notifyLoanCentersChanged();
}

/** All centres including `day` on roots — for Customer / ImageDetails. */
export function loadCentersWithDay() {
  if (typeof window === "undefined") return DEFAULT_CENTERS_WITH_DAY;
  const stored = window.localStorage.getItem(LOAN_CENTERS_STORAGE_KEY);
  if (!stored) return DEFAULT_CENTERS_WITH_DAY;
  try {
    const extra = JSON.parse(stored);
    if (!Array.isArray(extra)) return DEFAULT_CENTERS_WITH_DAY;
    return [...DEFAULT_CENTERS_WITH_DAY, ...extra];
  } catch {
    return DEFAULT_CENTERS_WITH_DAY;
  }
}
