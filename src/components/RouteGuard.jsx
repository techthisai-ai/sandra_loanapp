import { Navigate, Outlet } from "react-router-dom";
import AppLoadingScreen from "./AppLoadingScreen";
import useAuth from "../hooks/useAuth";
import { ensureAuthSessionForUser, isAuthSessionActive } from "../utils/authSession";

export default function RouteGuard({ allowedRoles }) {
  const { loading, user, profile } = useAuth();

  if (loading) {
    return <AppLoadingScreen message="Loading application…" />;
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
