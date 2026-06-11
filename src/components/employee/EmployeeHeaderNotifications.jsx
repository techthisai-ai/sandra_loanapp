import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, CheckCircle2, XCircle } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase/config";
import { markNotificationRead } from "../../services/userAuth";

function isEmployeeNotification(item) {
  const role = String(item?.audienceRole || "").toLowerCase();
  return !role || role === "employee" || role === "all";
}

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const today = new Date();
  const sameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
  if (sameDay) {
    return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function resolveEmployeeNavPath(notification) {
  const title = String(notification?.title || "").toLowerCase();
  const message = String(notification?.message || "").toLowerCase();
  const combined = `${title} ${message}`;

  if (combined.includes("loan request") || combined.includes("loan approved") || combined.includes("loan rejected")) {
    return "/employee/notifications";
  }
  if (
    combined.includes("customer approved") ||
    combined.includes("customer rejected") ||
    combined.includes("customer submitted") ||
    combined.includes("customer saved")
  ) {
    return "/employee/profile";
  }
  if (combined.includes("collection")) {
    return "/employee/customers";
  }
  return "/employee";
}

function notificationTone(notification) {
  const title = String(notification?.title || "").toLowerCase();
  if (title.includes("reject")) {
    return { icon: XCircle, className: "text-rose-600 bg-rose-50" };
  }
  return { icon: CheckCircle2, className: "text-emerald-600 bg-emerald-50" };
}

export default function EmployeeHeaderNotifications() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "notifications"),
      (snapshot) => {
        const items = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
            notificationId: docSnap.data()?.notificationId || docSnap.id,
          }))
          .filter(isEmployeeNotification)
          .sort((left, right) => String(right.submittedAt || "").localeCompare(String(left.submittedAt || "")));
        setNotifications(items);
        setLoading(false);
      },
      () => {
        setNotifications([]);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => String(item.status || "").toLowerCase() !== "read").length,
    [notifications]
  );

  const recentItems = useMemo(() => notifications.slice(0, 12), [notifications]);

  const handleOpenItem = useCallback(
    async (notification) => {
      const notificationId = notification.notificationId || notification.id;
      if (notificationId && String(notification.status || "").toLowerCase() !== "read") {
        try {
          await markNotificationRead(notificationId);
        } catch {
          // Best-effort; snapshot will refresh.
        }
      }
      setOpen(false);
      navigate(resolveEmployeeNavPath(notification));
    },
    [navigate]
  );

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--app-border)] bg-white/80 text-slate-700 transition hover:bg-white active:scale-[0.97]"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Admin approvals and updates</p>
          </div>

          <div className="max-h-[min(22rem,60vh)] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Loading…</p>
            ) : recentItems.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentItems.map((item) => {
                  const tone = notificationTone(item);
                  const Icon = tone.icon;
                  const isUnread = String(item.status || "").toLowerCase() !== "read";
                  return (
                    <li key={item.notificationId || item.id}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleOpenItem(item)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                          isUnread ? "bg-blue-50/40" : ""
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tone.className}`}
                        >
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-950">{item.title || "Notification"}</span>
                            {isUnread ? (
                              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden />
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                            {item.message || "—"}
                          </span>
                          <span className="mt-1 block text-[10px] text-slate-400">{formatWhen(item.submittedAt)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2.5">
            <Link
              to="/employee/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs font-semibold text-blue-700 hover:text-blue-800"
            >
              View notification history
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
