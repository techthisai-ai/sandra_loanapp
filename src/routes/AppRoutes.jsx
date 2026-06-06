import { Component, Suspense, lazy } from "react";
import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import EmployeeCreate from "../pages/EmployeeCreate";
import Dashboard from "../pages/Dashboard";
import EmployeeHome from "../pages/EmployeeHome";
import EmployeeCenters from "../pages/EmployeeCenters";
import EmployeeCustomersList from "../pages/EmployeeCustomersList";
import EmployeeCollectionSummary from "../pages/EmployeeCollectionSummary";
import EmployeeDayCustomers from "../pages/EmployeeDayCustomers";
import EmployeeCustomerDetail from "../pages/EmployeeCustomerDetail";
import EmployeeLoanRequest from "../pages/EmployeeLoanRequest";
import LoanApplications from "../pages/LoanApplications";
import LoanApplicationDate from "../pages/LoanApplicationDate";
import LoanApplicationReview from "../pages/LoanApplicationReview";
import LoanApply from "../pages/LoanApply";
import LoanApplyDay from "../pages/LoanApplyDay";
import LoanApplyHome from "../pages/LoanApplyHome";
import Home from "../pages/Home";
import Login from "../pages/Login";
import Accounts from "../pages/Accounts";
import Customer from "../pages/Customer";
import CustomerDetail from "../pages/CustomerDetail";
import CustomerProfile from "../pages/CustomerProfile";
import Collection from "../pages/Collection";
import EmployeePage from "../pages/Employee";
import EmployeeProfilePage from "../pages/EmployeeProfilePage";
import Center from "../pages/Center";
import ImageDetails from "../pages/ImageDetails";
import Reports from "../pages/Reports";
import Settings from "../pages/Settings";
import AdminControls from "../pages/AdminControls";
import BackendRequirements from "../pages/BackendRequirements";
import RouteGuard from "../components/RouteGuard";
import EmployeeAppLayout from "../components/dashboard/EmployeeAppLayout";
import { importCustomerCreatePageWithRetry } from "../utils/customerCreateRouteLoader";

const CustomerCreatePage = lazy(importCustomerCreatePageWithRetry);

function RedirectLegacyCustomerDetail() {
  const { customerId } = useParams();
  return <Navigate to={`/dashboard/customer/${customerId}`} replace />;
}

function PublicLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

function RouteLoadingScreen({ label = "Loading page..." }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f5fbfc_0%,#eef6f9_100%)] px-4 text-slate-900">
      <div className="rounded-3xl border border-slate-200 bg-white/95 px-5 py-4 shadow-lg shadow-slate-200/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          <span className="text-sm font-medium text-slate-700">{label}</span>
        </div>
      </div>
    </div>
  );
}

class RouteLoadErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Route failed to load", error);
  }

  handleRetry = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  handleBack = () => {
    if (typeof window !== "undefined") {
      window.location.assign("/dashboard/customer");
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f5fbfc_0%,#eef6f9_100%)] px-4 text-slate-900">
          <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white/95 px-5 py-5 shadow-lg shadow-slate-200/60 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-slate-900">Could not open customer creation</h2>
            <p className="mt-2 text-sm text-slate-600">
              The page failed while loading. Retry once, or return to the customer list.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={this.handleRetry} className="app-button-primary px-4 py-2 text-sm font-semibold">
                Retry
              </button>
              <button type="button" onClick={this.handleBack} className="app-button-secondary px-4 py-2 text-sm font-semibold">
                Back to customers
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route element={<PublicLayout />}>
        <Route path="/home" element={<Home />} />
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/login/admin" element={<Navigate to="/login" replace />} />
      <Route path="/login/employee" element={<Navigate to="/login" replace />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />

      <Route element={<RouteGuard allowedRoles={["admin"]} />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/loan-applications" element={<LoanApplications />} />
        <Route path="/dashboard/loan-applications/date" element={<LoanApplicationDate />} />
        <Route path="/dashboard/loan-applications/review" element={<LoanApplicationReview />} />
        <Route path="/dashboard/customer-create" element={<Navigate to="/dashboard/customer/new" replace />} />
        <Route path="/dashboard/collection" element={<Collection />} />
        <Route path="/dashboard/approval" element={<Navigate to="/dashboard/collection?tab=approvals" replace />} />
        <Route path="/dashboard/employee-create" element={<EmployeeCreate />} />
        <Route path="/dashboard/employees" element={<EmployeePage />} />
        <Route path="/dashboard/customer" element={<Customer />} />
        <Route
          path="/dashboard/customer/new"
          element={(
            <RouteLoadErrorBoundary>
              <Suspense fallback={<RouteLoadingScreen label="Opening customer creation..." />}>
                <CustomerCreatePage />
              </Suspense>
            </RouteLoadErrorBoundary>
          )}
        />
        <Route path="/dashboard/customer/:customerId/profile" element={<CustomerProfile />} />
        <Route path="/dashboard/customer/:customerId" element={<CustomerDetail />} />
        <Route path="/dashboard/customer-view" element={<Navigate to="/dashboard/customer" replace />} />
        <Route path="/dashboard/customer-view/:customerId" element={<RedirectLegacyCustomerDetail />} />
        <Route path="/dashboard/center" element={<Center />} />
        <Route path="/dashboard/center-manage" element={<Navigate to="/dashboard/center?tab=manage" replace />} />
        <Route path="/dashboard/image-details" element={<Navigate to="/dashboard/center?tab=sheet" replace />} />
        <Route path="/dashboard/notifications" element={<Navigate to="/settings?tab=notifications" replace />} />
        <Route path="/dashboard/reports" element={<Reports />} />
        <Route path="/dashboard/accounts" element={<Accounts />} />
        <Route path="/dashboard/wallet" element={<Navigate to="/dashboard/collection" replace />} />
        <Route path="/dashboard/admin-controls" element={<AdminControls />} />
        <Route path="/dashboard/backend-requirements" element={<BackendRequirements />} />
        <Route path="/dashboard/loan-apply" element={<LoanApplyHome />} />
        <Route path="/dashboard/loan-apply/:customerId" element={<LoanApply />} />
        <Route path="/dashboard/loan-apply-day/:day" element={<LoanApplyDay />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Navigate to="/settings?tab=profile" replace />} />
      </Route>

      <Route element={<RouteGuard allowedRoles={["employee"]} />}>
        <Route element={<EmployeeAppLayout />}>
          <Route path="/employee" element={<EmployeeHome />} />
          <Route path="/employee/loan-request" element={<EmployeeLoanRequest />} />
          <Route path="/employee/centers" element={<EmployeeCenters />} />
          <Route path="/employee/customers" element={<EmployeeCustomersList />} />
          <Route path="/employee/collection" element={<EmployeeCollectionSummary />} />
          <Route path="/employee/profile" element={<EmployeeProfilePage />} />
          <Route path="/employee/customers/:day" element={<EmployeeDayCustomers />} />
          <Route path="/employee/customers/:day/sheet" element={<ImageDetails />} />
          <Route path="/employee/customers/:day/:customerId" element={<EmployeeCustomerDetail />} />
          <Route path="/employee/customers/:day/:customerId/sheet" element={<ImageDetails />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
