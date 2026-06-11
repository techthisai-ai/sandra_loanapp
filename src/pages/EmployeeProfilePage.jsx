import { Navigate, useLocation } from "react-router-dom";
import EmployeeCustomerEntryPage from "./EmployeeCustomerEntryPage";

export default function EmployeeProfilePage() {
  const location = useLocation();
  if (location.hash === "#notifications") {
    return <Navigate to="/employee/notifications" replace />;
  }
  return <EmployeeCustomerEntryPage />;
}
