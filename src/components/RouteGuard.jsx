import { Navigate, Outlet } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { ensureAuthSessionForUser, isAuthSessionActive } from "../utils/authSession";

export default function RouteGuard({ allowedRoles }) {
  const { loading, user, profile } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-slate-900">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600 shadow-sm">
          Loading...
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  ensureAuthSessionForUser(user, profile);

  if (!isAuthSessionActive()) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    return <Navigate to={profile.role === "admin" ? "/dashboard" : "/employee"} replace />;
  }

  return <Outlet />;
}
