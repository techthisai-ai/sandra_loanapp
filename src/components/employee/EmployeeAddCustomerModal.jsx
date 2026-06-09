import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Save, UserPlus, X } from "lucide-react";
import { DocumentCompactAttach, DocumentPhotoTile } from "../DocumentUploadControls";
import useAuth from "../../hooks/useAuth";
import { createCustomer } from "../../services/userAuth";
import { getDocumentDataUrlField } from "../../utils/customerDocumentAttachments";
import { fileToStorableDataUrl } from "../../utils/fileToStorableDataUrl";
import { persistableCenterFieldsFromSelectedDay } from "../../utils/centerDisplay";
import {
  IDENTITY_TYPE_OPTIONS,
  validateIdentityNumber,
  validatePhoneNumber,
} from "../../utils/customerValidation";

const EMPTY_FORM = {
  customerName: "",
  mobileNumber: "",
  address: "",
  identityType: "Aadhaar Card",
  identityNumber: "",
  selectedCenter: "",
  customerPhotoName: "",
  customerPhotoDataUrl: "",
  idDocumentName: "",
  idDocumentDataUrl: "",
  addressProofName: "",
  addressProofDataUrl: "",
};

function pickFile(setForm, setPreview, nameField, previewSetter) {
  return async (file) => {
    if (!file) return;
    const dataField = getDocumentDataUrlField(nameField);
    setForm((current) => ({ ...current, [nameField]: file.name || "" }));
    try {
      const dataUrl = await fileToStorableDataUrl(file);
      if (previewSetter) previewSetter(dataUrl);
      if (dataField) {
        setForm((current) => ({ ...current, [dataField]: dataUrl }));
      }
    } catch {
      setForm((current) => ({ ...current, [nameField]: "" }));
    }
  };
}

function clearFile(setForm, setPreview, nameField, previewSetter) {
  const dataField = getDocumentDataUrlField(nameField);
  setForm((current) => ({
    ...current,
    [nameField]: "",
    ...(dataField ? { [dataField]: "" } : {}),
  }));
  if (previewSetter) previewSetter("");
}

export default function EmployeeAddCustomerModal({
  assignedCenters = [],
  allCenters = [],
  hasAssignedCenter = false,
  onClose,
  onSaved,
}) {
  const { profile, user } = useAuth();
  const defaultCenter = assignedCenters[0] || "";
  const [form, setForm] = useState({ ...EMPTY_FORM, selectedCenter: defaultCenter });
  const [photoPreview, setPhotoPreview] = useState("");
  const [idDocPreview, setIdDocPreview] = useState("");
  const [extraProofPreview, setExtraProofPreview] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const centerOptions = useMemo(() => {
    const labels = (Array.isArray(assignedCenters) ? assignedCenters : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    return [...new Set(labels)].sort((left, right) => left.localeCompare(right));
  }, [assignedCenters]);

  useEffect(() => {
    if (!centerOptions.includes(form.selectedCenter)) {
      setForm((current) => ({ ...current, selectedCenter: centerOptions[0] || "" }));
    }
  }, [centerOptions, form.selectedCenter]);

  const update = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    if (field === "mobileNumber") setPhoneError(validatePhoneNumber(value, "Mobile number"));
    if (field === "identityType" || field === "identityNumber") {
      const nextType = field === "identityType" ? value : form.identityType;
      const nextNumber = field === "identityNumber" ? value : form.identityNumber;
      setIdentityError(validateIdentityNumber(nextType, nextNumber));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextPhoneError = validatePhoneNumber(form.mobileNumber, "Mobile number");
    const nextIdentityError = validateIdentityNumber(form.identityType, form.identityNumber);
    setPhoneError(nextPhoneError);
    setIdentityError(nextIdentityError);

    if (!form.customerName.trim()) {
      setError("Enter customer name.");
      return;
    }
    if (!form.address.trim()) {
      setError("Enter address.");
      return;
    }
    if (nextPhoneError) {
      setError(nextPhoneError);
      return;
    }
    if (nextIdentityError) {
      setError(nextIdentityError);
      return;
    }
    if (!form.customerPhotoName.trim()) {
      setError("Add a customer photo.");
      return;
    }
    if (!form.idDocumentName.trim()) {
      setError("Upload ID proof (Aadhaar, PAN, etc.).");
      return;
    }
    if (hasAssignedCenter && !form.selectedCenter.trim()) {
      setError("Select an assigned centre.");
      return;
    }

    const centerFields = persistableCenterFieldsFromSelectedDay(form.selectedCenter, allCenters);

    setError("");
    setSaving(true);
    try {
      const result = await createCustomer({
        customerName: form.customerName.trim(),
        mobileNumber: form.mobileNumber,
        alternateNumber: "",
        identityType: form.identityType,
        identityNumber: form.identityNumber,
        address: form.address.trim(),
        country: "India",
        selectedDay: form.selectedCenter,
        parentCenterLabel: centerFields.parentCenterLabel,
        subCenterLabel: centerFields.subCenterLabel,
        customerPhotoName: form.customerPhotoName,
        customerPhotoDataUrl: form.customerPhotoDataUrl,
        idDocumentName: form.idDocumentName,
        idDocumentDataUrl: form.idDocumentDataUrl,
        addressProofName: form.addressProofName,
        addressProofDataUrl: form.addressProofDataUrl,
        createdByUid: user?.uid || "",
        createdByEmployeeId: profile?.employeeId || "",
        createdByEmployeeName: profile?.displayName || profile?.username || profile?.email || "Employee",
        customerSource: "employee",
      });
      onSaved?.(result);
      onClose();
    } catch (submitError) {
      setError(submitError.message || "Unable to save customer.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[min(92dvh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-customer-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#3B82F6]/10 text-[#3B82F6]">
              <UserPlus className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 id="add-customer-modal-title" className="text-base font-semibold text-slate-900 sm:text-lg">
                Add Customer
              </h3>
              <p className="text-xs text-slate-500">Name, contact, photo, and ID proof</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Close add customer form"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5"
          onSubmit={handleSubmit}
        >
          <div className="grid gap-3">
            <label className="space-y-1.5">
              <span className="employee-field-label">Customer name *</span>
              <input
                value={form.customerName}
                onChange={update("customerName")}
                className="app-input w-full"
                placeholder="Full name"
                autoComplete="name"
              />
            </label>

            <label className="space-y-1.5">
              <span className="employee-field-label">Mobile number *</span>
              <input
                value={form.mobileNumber}
                onChange={update("mobileNumber")}
                inputMode="numeric"
                maxLength={10}
                className="app-input w-full tabular-nums"
                placeholder="10-digit mobile number"
              />
              {phoneError ? <p className="text-xs text-rose-600">{phoneError}</p> : null}
            </label>

            <label className="space-y-1.5">
              <span className="employee-field-label">Address *</span>
              <textarea
                value={form.address}
                onChange={update("address")}
                rows={3}
                className="app-textarea w-full"
                placeholder="House no., street, area, city"
              />
            </label>

            {hasAssignedCenter ? (
              <label className="space-y-1.5">
                <span className="employee-field-label">Assigned centre *</span>
                <select
                  value={form.selectedCenter}
                  onChange={update("selectedCenter")}
                  className="app-select w-full"
                >
                  {centerOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                No centre assigned yet. Customer will be saved without a centre until your admin assigns one.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="employee-field-label">ID type *</span>
                <select value={form.identityType} onChange={update("identityType")} className="app-select w-full">
                  {IDENTITY_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="employee-field-label">
                  {form.identityType === "Aadhaar Card" ? "Aadhaar number *" : "ID number *"}
                </span>
                <input
                  value={form.identityNumber}
                  onChange={update("identityNumber")}
                  className="app-input w-full"
                  placeholder={form.identityType === "PAN Card" ? "ABCDE1234F" : "Enter ID number"}
                />
                {identityError ? <p className="text-xs text-rose-600">{identityError}</p> : null}
              </label>
            </div>

            <div className="employee-add-docs-row grid grid-cols-2 items-start justify-items-center gap-3">
              <DocumentPhotoTile
                label="Customer photo"
                preview={photoPreview}
                fileName={form.customerPhotoName}
                onPick={pickFile(setForm, setPhotoPreview, "customerPhotoName", setPhotoPreview)}
                onClear={() => clearFile(setForm, setPhotoPreview, "customerPhotoName", setPhotoPreview)}
                required
                dense
                size="sm"
                previewAspect="portrait"
              />

              <DocumentPhotoTile
                label="ID proof"
                preview={idDocPreview}
                fileName={form.idDocumentName}
                onPick={pickFile(setForm, setIdDocPreview, "idDocumentName", setIdDocPreview)}
                onClear={() => clearFile(setForm, setIdDocPreview, "idDocumentName", setIdDocPreview)}
                capture="environment"
                accept="image/*,application/pdf"
                required
                dense
                size="sm"
                previewAspect="square"
              />
            </div>

            <DocumentCompactAttach
              label="Additional proof (optional)"
              value={form.addressProofName}
              url={extraProofPreview}
              accept="image/*,application/pdf"
              onPick={pickFile(setForm, setExtraProofPreview, "addressProofName", setExtraProofPreview)}
              onClear={() => clearFile(setForm, setExtraProofPreview, "addressProofName", setExtraProofPreview)}
              dense
              emptyHint="Address proof, smart card, or other document"
            />

            {error ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="app-button-primary inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
