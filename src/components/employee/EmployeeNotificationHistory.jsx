import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { listNotifications } from "../../services/userAuth";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function isEmployeeNotification(item) {
  const role = String(item?.audienceRole || "").toLowerCase();
  return !role || role === "employee" || role === "all";
}

/**
 * Employee notification list (used on the dedicated notifications page).
 * @param {{ limit?: number; className?: string; showHeader?: boolean }} props
 */
export default function EmployeeNotificationHistory({ limit, className = "", showHeader = true }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listNotifications();
      setNotifications(items.filter(isEmployeeNotification));
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const items = useMemo(() => {
    const sorted = [...notifications].sort((left, right) =>
      String(right.submittedAt || "").localeCompare(String(left.submittedAt || ""))
    );
    if (typeof limit === "number" && limit > 0) return sorted.slice(0, limit);
    return sorted;
  }, [limit, notifications]);

  return (
    <section
      id="notifications"
      className={`app-panel rounded-2xl p-4 sm:rounded-[22px] sm:p-5 ${className}`.trim()}
    >
      {showHeader ? (
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Notification history</h2>
            <p className="text-xs text-slate-500">Updates on customers and loan requests.</p>
          </div>
        </div>
      ) : (
        <p className="mb-3 text-xs text-slate-500">Updates on customers and loan requests.</p>
      )}

      {loading ? (
        <p className="py-4 text-center text-sm text-slate-500">Loading notifications…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-4 text-center text-sm text-slate-600">
          No notifications yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200/70">
          {items.map((item) => {
            const isUnread = String(item.status || "").toLowerCase() !== "read";
            return (
              <li key={item.notificationId || item.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-2">
                  {isUnread ? (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="Unread" />
                  ) : (
                    <span className="mt-1.5 h-2 w-2 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-950">{item.title || "Notification"}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{item.message || "—"}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{formatDate(item.submittedAt)}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
