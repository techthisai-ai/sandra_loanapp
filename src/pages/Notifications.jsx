import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock3,
  History,
  LoaderCircle,
  MessageSquare,
  RotateCw,
} from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import useAuth from "../hooks/useAuth";
import {
  listAllCustomerAmountEntries,
  listCustomers,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/userAuth";

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function resolveNavigationPath(notification) {
  const { type, customerId, relatedId } = notification;
  if (type === "approval_notification") return "/dashboard/collection?tab=approvals";
  if (type === "payment_received_confirmation") return "/dashboard/collection?tab=approvals";
  if (type === "emi_due_reminder" && customerId) return `/dashboard/customer/${customerId}`;
  if (type === "overdue_alert" && customerId) return `/dashboard/customer/${customerId}`;
  if (type === "reject_notification") return "/dashboard/collection?tab=approvals";
  if (customerId) return `/dashboard/customer/${customerId}`;
  if (relatedId) return "/dashboard/collection?tab=approvals";
  return "/dashboard";
}

function computeReminderNotifications(customers, entries) {
  const today = startOfDay(new Date());
  const approvedEntries = entries.filter(
    (e) => String(e?.approvalStatus || "").toLowerCase() === "approved"
  );
  const paidByCustomer = approvedEntries.reduce((map, e) => {
    map[e.customerId] = (map[e.customerId] || 0) + Number(e.amount || 0);
    return map;
  }, {});

  const reminders = [];
  customers
    .filter((c) => Number(c.loanAmount || 0) > 0 && !c.isArchived)
    .forEach((customer) => {
      const dueDate = customer.dueDate ? startOfDay(new Date(customer.dueDate)) : null;
      if (!dueDate || Number.isNaN(dueDate.getTime())) return;
      const outstanding = Math.max(Number(customer.totalPayable || 0) - Number(paidByCustomer[customer.customerId] || 0), 0);
      if (outstanding <= 0) return;
      const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
      if (daysUntilDue >= 0 && daysUntilDue <= 2) {
        reminders.push({
          notificationId: `emi-${customer.customerId}-${customer.dueDate}`,
          type: "emi_due_reminder",
          title: "EMI due reminder",
          message: `${customer.customerName || "Customer"} EMI is due on ${customer.dueDate}.`,
          customerId: customer.customerId,
          customerName: customer.customerName,
          status: "unread",
          submittedAt: dueDate.toISOString(),
          isComputed: true,
        });
      }
      if (daysUntilDue < 0) {
        reminders.push({
          notificationId: `overdue-${customer.customerId}-${customer.dueDate}`,
          type: "overdue_alert",
          title: "Overdue alert",
          message: `${customer.customerName || "Customer"} is overdue with pending balance.`,
          customerId: customer.customerId,
          customerName: customer.customerName,
          status: "unread",
          submittedAt: dueDate.toISOString(),
          isComputed: true,
        });
      }
    });
  return reminders.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
}

const TYPE_STYLES = {
  approval_notification: { bg: "bg-emerald-50", border: "border-emerald-200", icon: CheckCircle2, iconColor: "text-emerald-600", badge: "bg-emerald-100 text-emerald-700" },
  payment_received_confirmation: { bg: "bg-blue-50", border: "border-blue-200", icon: CheckCircle2, iconColor: "text-blue-600", badge: "bg-blue-100 text-blue-700" },
  emi_due_reminder: { bg: "bg-amber-50", border: "border-amber-200", icon: Clock3, iconColor: "text-amber-600", badge: "bg-amber-100 text-amber-700" },
  overdue_alert: { bg: "bg-rose-50", border: "border-rose-200", icon: AlertTriangle, iconColor: "text-rose-600", badge: "bg-rose-100 text-rose-700" },
  reject_notification: { bg: "bg-slate-50", border: "border-slate-200", icon: MessageSquare, iconColor: "text-slate-600", badge: "bg-slate-100 text-slate-600" },
};

function NotificationCard({ notification, onMarkRead, onClick }) {
  const style = TYPE_STYLES[notification.type] || { bg: "bg-white", border: "border-slate-200", icon: Bell, iconColor: "text-slate-600", badge: "bg-slate-100 text-slate-600" };
  const Icon = style.icon;
  const isUnread = notification.status !== "read";
  const navPath = resolveNavigationPath(notification);

  return (
    <div
      className={`relative rounded-[24px] border ${style.border} ${style.bg} p-5 transition cursor-pointer hover:shadow-md hover:-translate-y-0.5`}
      onClick={() => onClick(notification, navPath)}
    >
      {isUnread && (
        <span className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-blue-500" />
      )}
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${style.border} bg-white`}>
          <Icon className={`h-4 w-4 ${style.iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-950">{notification.title}</p>
            <span className={`app-chip ${style.badge}`}>
              {notification.type?.replace(/_/g, " ")}
            </span>
            {notification.isComputed ? (
              <span className="app-chip bg-amber-50 text-amber-700">Reminder</span>
            ) : null}
          </div>
          <p className="app-truncate-2 mt-1.5 text-sm text-slate-600">{notification.message}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-400">{formatDateTime(notification.submittedAt)}</p>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
              View details <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </div>

      {!notification.isComputed && isUnread ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMarkRead(notification.notificationId); }}
          className="app-button-secondary mt-3 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Mark read
        </button>
      ) : null}
    </div>
  );
}

export function NotificationsPanel() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("current"); // "current" | "history"

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [notificationList, customerList, entryList] = await Promise.all([
        listNotifications(),
        listCustomers(),
        listAllCustomerAmountEntries(),
      ]);
      setNotifications(notificationList);
      setCustomers(customerList);
      setEntries(entryList);
    } catch (loadError) {
      setError(loadError.message || "Unable to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const persistentNotifications = useMemo(() => {
    const role = profile?.role || "admin";
    return notifications.filter((n) => !n.audienceRole || n.audienceRole === role || n.audienceRole === "all");
  }, [notifications, profile?.role]);

  const reminderNotifications = useMemo(() => computeReminderNotifications(customers, entries), [customers, entries]);

  const mergedNotifications = useMemo(
    () => [...persistentNotifications, ...reminderNotifications].sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || ""))),
    [persistentNotifications, reminderNotifications]
  );

  // History = read persistent notifications
  const historyNotifications = useMemo(
    () => persistentNotifications.filter((n) => n.status === "read").sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || ""))),
    [persistentNotifications]
  );

  const currentNotifications = useMemo(
    () => mergedNotifications.filter((n) => n.status !== "read" || n.isComputed === false),
    [mergedNotifications]
  );

  const filteredNotifications = useMemo(() => {
    const base = view === "history" ? historyNotifications : mergedNotifications;
    if (filter === "all") return base;
    if (filter === "unread") return base.filter((n) => n.status !== "read");
    return base.filter((n) => n.type === filter);
  }, [mergedNotifications, historyNotifications, filter, view]);

  const unreadCount = persistentNotifications.filter((n) => n.status !== "read").length + reminderNotifications.length;

  const filterTabs = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread" },
    { key: "approval_notification", label: "Appr" },
    { key: "payment_received_confirmation", label: "Paid" },
    { key: "emi_due_reminder", label: "EMI" },
    { key: "overdue_alert", label: "Late" },
  ];

  const handleMarkRead = async (notificationId) => {
    await markNotificationRead(notificationId);
    await loadData();
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    await loadData();
  };

  const handleCardClick = async (notification, navPath) => {
    if (!notification.isComputed && notification.status !== "read") {
      await markNotificationRead(notification.notificationId);
      await loadData();
    }
    navigate(navPath);
  };

  const pillBase =
    "flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-lg border px-1 py-1 text-[10px] font-medium leading-none transition";
  const pillCount = "text-[9px] font-bold tabular-nums";

  const statBox =
    "flex flex-col rounded-2xl app-panel-muted px-3 py-2";

  return (
    <div className="app-grid-page grid w-full gap-3">
        <div className="grid grid-cols-3 gap-2">
          <div className={statBox}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total</p>
            <p className="mt-0.5 text-lg font-semibold leading-none text-slate-950">{mergedNotifications.length}</p>
          </div>
          <div className={statBox}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Unread</p>
            <p className="mt-0.5 text-lg font-semibold leading-none text-blue-700">{unreadCount}</p>
          </div>
          <div className={statBox}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">History</p>
            <p className="mt-0.5 text-lg font-semibold leading-none text-slate-500">{historyNotifications.length}</p>
          </div>
        </div>

        <div className="flex w-full min-w-0 items-stretch gap-0.5">
          <button
            type="button"
            onClick={() => setView("current")}
            aria-label="Current notifications"
            title="Current"
            className={`${pillBase} ${
              view === "current" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Bell className="h-3 w-3 shrink-0" />
            <span className="hidden sm:inline">Now</span>
          </button>
          <button
            type="button"
            onClick={() => setView("history")}
            aria-label="Notification history"
            title="History"
            className={`${pillBase} ${
              view === "history" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <History className="h-3 w-3 shrink-0" />
            <span className="hidden sm:inline">Hist</span>
            <span className={`${pillCount} ${view === "history" ? "text-white/80" : "text-slate-400"}`}>
              {historyNotifications.length}
            </span>
          </button>

          {filterTabs.map((tab) => {
            const base = view === "history" ? historyNotifications : mergedNotifications;
            const count = tab.key === "all" ? base.length : tab.key === "unread" ? base.filter((n) => n.status !== "read").length : base.filter((n) => n.type === tab.key).length;
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                title={tab.label}
                className={`${pillBase} ${
                  active
                    ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                }`}
              >
                <span className="truncate">{tab.label}</span>
                <span className={`${pillCount} ${active ? "text-white/80" : "text-slate-400"}`}>
                  {count}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={loadData}
            aria-label="Refresh notifications"
            title="Refresh"
            className={`${pillBase} app-button-secondary text-slate-600 hover:bg-slate-50`}
          >
            <RotateCw className="h-3 w-3 shrink-0" />
          </button>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              aria-label="Mark all read"
              title="Mark all read"
              className={`${pillBase} app-button-primary text-white`}
            >
              <CheckCheck className="h-3 w-3 shrink-0" />
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="app-panel flex items-center gap-3 rounded-[28px] px-5 py-4 text-sm text-slate-600">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading notifications...
          </div>
        ) : null}

        {error ? (
          <div className="app-alert-error">{error}</div>
        ) : null}

        {!loading && !error ? (
          <>
            <div className="grid gap-3">
              {filteredNotifications.length > 0 ? filteredNotifications.map((notification) => (
                <NotificationCard
                  key={notification.notificationId}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                  onClick={handleCardClick}
                />
              )) : (
                <div className="app-empty-state">
                  {view === "history" ? "No notification history yet." : "No notifications for this filter."}
                </div>
              )}
            </div>
          </>
        ) : null}
    </div>
  );
}

export default function Notifications() {
  return (
    <AdminLayout title="Notifications" description="Track and open notifications.">
      <NotificationsPanel />
    </AdminLayout>
  );
}
