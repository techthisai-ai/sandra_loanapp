import { Component } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AdminLayout from "../components/dashboard/AdminLayout";
import CustomerCreateStreamlinedForm from "../components/CustomerCreateStreamlinedForm";

class CustomerCreateErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Customer creation page crashed", error);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="dash-glass-panel rounded-3xl border border-rose-200 bg-white p-5 text-slate-900 shadow-lg shadow-slate-200/40">
          <h2 className="text-lg font-semibold text-slate-900">Could not load customer form</h2>
          <p className="mt-2 text-sm text-slate-600">
            Something interrupted the page while it was loading. You can retry without leaving the dashboard.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={this.handleRetry} className="app-button-primary px-4 py-2 text-sm font-semibold">
              Retry
            </button>
            {this.props.onCancel ? (
              <button type="button" onClick={this.props.onCancel} className="app-button-secondary px-4 py-2 text-sm font-semibold">
                Back to customers
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function CustomerCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialDay = location.state?.selectedDay || "";
  const initialCenter = location.state?.selectedCenter || "";
  const goBack = () => navigate("/dashboard/customer");
  const handleSuccess = () => navigate("/dashboard/customer", { replace: true });

  return (
    <AdminLayout
      title="Customer"
      description="Applicant KYC, eligibility, centres, and documents. Nominee is added when you apply a loan."
    >
      <div className="app-grid-page customer-module-panel w-full">
        <CustomerCreateErrorBoundary onCancel={goBack}>
          <CustomerCreateStreamlinedForm
            initialSelectedDay={initialDay}
            initialSelectedCenter={initialCenter}
            onSuccess={handleSuccess}
            onCancel={goBack}
          />
        </CustomerCreateErrorBoundary>
      </div>
    </AdminLayout>
  );
}
