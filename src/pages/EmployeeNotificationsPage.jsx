import { Link } from "react-router-dom";
import { ArrowLeft, Bell } from "lucide-react";
import EmployeeNotificationHistory from "../components/employee/EmployeeNotificationHistory";

export default function EmployeeNotificationsPage() {
  return (
    <div className="employee-page">
      <header className="employee-page-header mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/employee"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <p className="app-eyebrow employee-page-eyebrow">Profile</p>
            <h1 className="employee-page-title truncate">Notification history</h1>
          </div>
        </div>
        <div className="app-icon-shell flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/70">
          <Bell className="h-4 w-4" />
        </div>
      </header>

      <EmployeeNotificationHistory showHeader={false} className="mt-0" />
    </div>
  );
}
