import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CustomerCreateStreamlinedForm from "../components/CustomerCreateStreamlinedForm";
import AdminLayout from "../components/dashboard/AdminLayout";
import { listCustomers, mergeCustomerProfileFields, renameCustomerId, upsertLoanApplication } from "../services/userAuth";
import { normalizeCustomerId } from "../utils/customerValidation";
import { loadLoanCenters } from "../constants/dayCenters";
import { NO_CENTER_LABEL, NO_SUB_CENTER_LABEL, resolveCustomerCenterDisplay } from "../utils/centerDisplay";

export default function CustomerDetail() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const centerTree = useMemo(() => loadLoanCenters(), []);

  useEffect(() => {
    let active = true;
    const loadCustomer = async () => {
      setLoading(true);
      setError("");
      try {
        const customers = await listCustomers();
        if (!active) return;
        const found = customers.find((item) => item.customerId === customerId) || null;
        setCustomer(found);
        if (!found) {
          setError("Customer record not found");
        }
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "Unable to load customer");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadCustomer();
    return () => {
      active = false;
    };
  }, [customerId]);

  const handleUpdateCustomer = async (payload) => {
    if (!customer) return;
    let activeCustomerId = customer.customerId;
    const requestedId = normalizeCustomerId(payload.customerId);
    if (requestedId && requestedId !== customer.customerId) {
      activeCustomerId = await renameCustomerId(customer.customerId, requestedId);
    }
    await upsertLoanApplication({
      customerId: activeCustomerId,
      applicationId: customer.applicationId || activeCustomerId,
      customerName: payload.customerName,
      mobileNumber: payload.mobileNumber,
      alternateNumber: payload.alternateNumber ?? customer.alternateNumber ?? "",
      identityType: payload.identityType,
      identityNumber: payload.identityNumber,
      address: payload.address,
      country: customer.country || "",
      selectedDay: payload.selectedDay,
      parentCenterLabel: payload.parentCenterLabel ?? customer.parentCenterLabel ?? "",
      subCenterLabel: payload.subCenterLabel ?? customer.subCenterLabel ?? "",
      loanAmount: customer.loanAmount ?? "",
      loanWeeks: customer.loanWeeks || "",
      disbursementDate: customer.disbursementDate || "",
      dueDate: customer.dueDate || "",
      collectionFrequency: customer.collectionFrequency || "Weekly",
      nomineeName: customer.nomineeName || "",
      nomineeContact: customer.nomineeContact || "",
      additionalContact: customer.additionalContact || "",
      idDocumentName: payload.idDocumentName || customer.idDocumentName || "",
      idDocumentDataUrl: payload.idDocumentDataUrl || customer.idDocumentDataUrl || "",
      addressProofName: payload.addressProofName || customer.addressProofName || "",
      addressProofDataUrl: payload.addressProofDataUrl || customer.addressProofDataUrl || "",
      loanAgreementName: payload.loanAgreementName ?? customer.loanAgreementName ?? "",
      loanAgreementDataUrl: payload.loanAgreementDataUrl || customer.loanAgreementDataUrl || "",
      supportingDocumentNames: customer.supportingDocumentNames || [],
      coApplicantName: payload.coApplicantName || customer.coApplicantName || "",
      coApplicantContact: payload.coApplicantContact || customer.coApplicantContact || "",
      coApplicantRelation: payload.coApplicantRelation || customer.coApplicantRelation || "",
      coApplicantAddress: payload.coApplicantAddress || customer.coApplicantAddress || "",
      coApplicantIdentityType: payload.coApplicantIdentityType || customer.coApplicantIdentityType || "",
      coApplicantIdentityNumber: payload.coApplicantIdentityNumber || customer.coApplicantIdentityNumber || "",
      coApplicantIdProofName: payload.coApplicantIdProofName || customer.coApplicantIdProofName || "",
      coApplicantIdProofDataUrl: payload.coApplicantIdProofDataUrl || customer.coApplicantIdProofDataUrl || "",
      coApplicantPhotoName: payload.coApplicantPhotoName || customer.coApplicantPhotoName || "",
      customerPhotoDataUrl: payload.customerPhotoDataUrl || customer.customerPhotoDataUrl || "",
      coApplicantPhotoDataUrl: payload.coApplicantPhotoDataUrl || customer.coApplicantPhotoDataUrl || "",
      customerPhotoName: payload.customerPhotoName || customer.customerPhotoName || "",
      isArchived: customer.isArchived || false,
      archivedAt: customer.archivedAt || null,
      loanStatus: customer.loanStatus || "open",
      closedAt: customer.closedAt || null,
      rescheduledAt: customer.rescheduledAt || null,
      rescheduleReason: customer.rescheduleReason || "",
    });
    await mergeCustomerProfileFields(activeCustomerId, {
      ...(payload.crifDemoEligibility !== undefined || payload.lastEligibilityCheckedAt !== undefined
        ? {
            crifDemoEligibility: payload.crifDemoEligibility ?? customer.crifDemoEligibility,
            lastEligibilityCheckedAt: payload.lastEligibilityCheckedAt ?? customer.lastEligibilityCheckedAt,
          }
        : {}),
    });
    setStatusMessage("Customer updated successfully");
    setCustomer((current) => (current ? { ...current, ...payload, selectedDay: payload.selectedDay } : current));
  };

  const resolvedCenterDisplay = customer ? resolveCustomerCenterDisplay(customer, centerTree) : null;
  const initialSelectedDay =
    resolvedCenterDisplay && resolvedCenterDisplay.dayCenter !== NO_CENTER_LABEL ? resolvedCenterDisplay.dayCenter : "";
  const initialSelectedCenter =
    resolvedCenterDisplay && resolvedCenterDisplay.subCenter !== NO_SUB_CENTER_LABEL ? resolvedCenterDisplay.subCenter : "";

  return (
    <AdminLayout
      title="Customer"
      description="Update profile and KYC. Nominee and loan details are managed from Apply loan."
    >
      <div className="app-grid-page customer-module-panel w-full">
        {loading ? <div className="app-empty-state py-10">Loading customer...</div> : null}
        {error ? <div className="app-alert-error mb-2 text-sm">{error}</div> : null}
        {statusMessage ? <div className="app-alert-success mb-2 text-sm">{statusMessage}</div> : null}
        {customer ? (
          <CustomerCreateStreamlinedForm
            isEdit
            initialData={customer}
            initialSelectedDay={initialSelectedDay}
            initialSelectedCenter={initialSelectedCenter}
            onSubmitForm={handleUpdateCustomer}
            onSuccess={() => {}}
            onCancel={() => navigate("/dashboard/customer")}
            submitLabel="Save customer"
          />
        ) : null}
      </div>
    </AdminLayout>
  );
}
