import { useMemo } from "react";

import {

  CheckCircle2,
  AlertTriangle,

  ChevronDown,

} from "lucide-react";

import {

  IDENTITY_TYPE_OPTIONS,

} from "../utils/customerValidation";

import { NOMINEE_RELATIONSHIP_OPTIONS } from "../utils/nomineeRelationship";

import { DocumentCompactAttach, DocumentPhotoTile } from "./DocumentUploadControls";

const invalidFieldClass = "loan-apply-field-invalid";
const invalidLabelClass = "loan-apply-label-invalid";

function nomineeFieldClass(invalid) {
  return invalid ? `loan-apply-field ${invalidFieldClass}` : "loan-apply-field";
}

function StatusPill({ ok, label }) {

  return (

    <span

      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${

        ok ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-slate-200 bg-slate-50 text-slate-600"

      }`}

    >

      {ok ? <CheckCircle2 className="h-3 w-3" /> : null}

      {label}

    </span>

  );

}



export default function LoanNomineeSection({

  nominee,

  onFieldChange,

  onNomineePhoneChange,

  nameError,

  contactRequiredError,

  phoneError,

  relationshipError,

  identityError,

  phoneVerified,

  canOpenOtp,

  onOpenOtp,

  disableOtp = false,

  validationPulse,

  photoPreview,

  onPhotoPick,

  onPhotoClear,

  onIdProofPick,

  onIdProofClear,

  attachmentUrls,

}) {

  const {

    nomineeName,

    nomineeContact,

    additionalContact,

    nomineeAddress,

    nomineeRelation,

    nomineeIdentityType,

    nomineeIdentityNumber,

    nomineePhotoName,

    nomineeIdProofName,

  } = nominee;



  const idFormatOk = Boolean(nomineeIdentityNumber?.trim()) && !identityError;
  const relationshipOk = Boolean(nomineeRelation) && !relationshipError;
  const shakeKey = `${validationPulse || 0}-${relationshipError ? "invalid" : "ok"}`;



  const basicsReady = Boolean(

    nomineeName?.trim() &&

      nomineeContact?.length === 10 &&

      !phoneError &&

      Boolean(nomineeRelation) &&

      !relationshipError

  );

  const identityReady = idFormatOk;

  const docsAttached = [nomineeIdProofName, nomineePhotoName].filter(Boolean).length;



  const sectionReady = useMemo(

    () => basicsReady && (disableOtp || phoneVerified) && identityReady,

    [basicsReady, disableOtp, phoneVerified, identityReady]

  );



  return (

    <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-sm sm:p-3">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="loan-apply-section-title">Nominee details</p>

        <span

          className={`loan-apply-label inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${

            sectionReady

              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"

              : "border border-amber-200 bg-amber-50 text-amber-900"

          }`}

        >

          {sectionReady ? (

            <>

              <CheckCircle2 className="h-3.5 w-3.5" />

              Ready

            </>

          ) : (

            "Incomplete"

          )}

        </span>

      </div>



      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0 space-y-3 lg:pr-5">
          <div>
            <p className="loan-apply-label">Basic details</p>
            <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="nominee-name"
                  className={`loan-apply-label mb-1 block${nameError ? ` ${invalidLabelClass}` : ""}`}
                >
                  Nominee name *
                </label>
                <input
                  id="nominee-name"
                  value={nomineeName}
                  onChange={(e) => onFieldChange("nomineeName", e.target.value)}
                  className={nomineeFieldClass(Boolean(nameError))}
                  placeholder="Enter name"
                  aria-invalid={nameError ? "true" : undefined}
                />
                {nameError ? <p className="loan-apply-hint mt-1 text-rose-600">{nameError}</p> : null}
              </div>

              <div>
                <label
                  htmlFor="nominee-phone"
                  className={`loan-apply-label mb-1 block${contactRequiredError || phoneError ? ` ${invalidLabelClass}` : ""}`}
                >
                  Nominee phone *
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="nominee-phone"
                    value={nomineeContact}
                    onChange={(e) => onNomineePhoneChange(e.target.value)}
                    inputMode="numeric"
                    maxLength={10}
                    className={nomineeFieldClass(Boolean(contactRequiredError || phoneError))}
                    placeholder="10-digit mobile"
                    aria-invalid={contactRequiredError || phoneError ? "true" : undefined}
                  />
                  {!disableOtp && canOpenOtp ? (
                    <button
                      type="button"
                      onClick={onOpenOtp}
                      className="inline-flex h-[42px] shrink-0 items-center rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-4 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm transition hover:brightness-105"
                    >
                      Verify OTP
                    </button>
                  ) : null}
                  {!disableOtp && phoneVerified ? (
                    <span className="inline-flex h-[42px] shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-semibold text-emerald-800">
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      Mobile verified
                    </span>
                  ) : null}
                </div>
                {contactRequiredError ? <p className="loan-apply-hint mt-1 text-rose-600">{contactRequiredError}</p> : null}
                {phoneError ? <p className="loan-apply-hint mt-1 text-rose-600">{phoneError}</p> : null}
              </div>

              <div>
                <label htmlFor="nominee-additional-contact" className="loan-apply-label mb-1 block">
                  Additional contact
                </label>
                <input
                  id="nominee-additional-contact"
                  value={additionalContact}
                  onChange={(e) => onFieldChange("additionalContact", e.target.value.replace(/\D/g, "").slice(0, 10))}
                  inputMode="numeric"
                  maxLength={10}
                  className="loan-apply-field"
                  placeholder="Optional"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="nominee-address" className="loan-apply-label mb-1 block">
                  Nominee address
                </label>
                <textarea
                  id="nominee-address"
                  value={nomineeAddress}
                  onChange={(e) => onFieldChange("nomineeAddress", e.target.value)}
                  rows={2}
                  className="loan-apply-field"
                  placeholder="Enter address"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="grid gap-3 sm:grid-cols-[minmax(7.25rem,0.38fr)_minmax(10.5rem,0.82fr)_minmax(11rem,1.4fr)] sm:items-end">
              <div className="min-w-0">
                <label
                  htmlFor="nominee-relationship"
                  className={`loan-apply-label mb-1 block whitespace-nowrap${
                    relationshipError ? ` ${invalidLabelClass}` : ""
                  }`}
                >
                  Relationship
                  <span className={relationshipError ? "text-rose-700" : "text-slate-400"}> *</span>
                </label>
                <div className="relative">
                  <select
                    id="nominee-relationship"
                    value={nomineeRelation}
                    onChange={(e) => onFieldChange("nomineeRelation", e.target.value)}
                    key={shakeKey}
                    className={`loan-apply-field appearance-none pr-8 ${
                      relationshipError
                        ? `${invalidFieldClass} animate-otp-shake`
                        : relationshipOk
                          ? "border-emerald-200 bg-emerald-50/30"
                          : ""
                    }`}
                    aria-required="true"
                    aria-invalid={relationshipError ? "true" : undefined}
                  >
                    <option value="">Select</option>
                    {NOMINEE_RELATIONSHIP_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
                    aria-hidden
                  />
                  {relationshipError ? (
                    <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-rose-600">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  ) : relationshipOk ? (
                    <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0">
                <label
                  htmlFor="nominee-identity-type"
                  className={`loan-apply-label mb-1 block whitespace-nowrap${identityError ? ` ${invalidLabelClass}` : ""}`}
                >
                  Identity details
                </label>
                <select
                  id="nominee-identity-type"
                  value={nomineeIdentityType}
                  onChange={(e) => onFieldChange("nomineeIdentityType", e.target.value)}
                  className={`loan-apply-field pr-9${identityError ? ` ${invalidFieldClass}` : ""}`}
                  aria-invalid={identityError ? "true" : undefined}
                >
                  {IDENTITY_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-0">
                <label
                  htmlFor="nominee-id-number"
                  className={`loan-apply-label mb-1 block whitespace-nowrap${identityError ? ` ${invalidLabelClass}` : ""}`}
                >
                  Nominee ID
                </label>
                <input
                  id="nominee-id-number"
                  value={nomineeIdentityNumber}
                  onChange={(e) => onFieldChange("nomineeIdentityNumber", e.target.value)}
                  className={nomineeFieldClass(Boolean(identityError))}
                  placeholder="Enter ID number"
                  aria-invalid={identityError ? "true" : undefined}
                />
              </div>
            </div>

            {relationshipError ? <p className="loan-apply-hint mt-1 text-rose-600">{relationshipError}</p> : null}
            {identityError ? <p className="loan-apply-hint mt-1.5 text-rose-600">{identityError}</p> : null}
            {idFormatOk ? (
              <p className="loan-apply-hint mt-1.5 flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Nominee ID format verified
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center lg:items-end lg:justify-start">
          <DocumentPhotoTile
            dense
            label="Nominee photo"
            preview={photoPreview}
            fileName={nomineePhotoName}
            onPick={onPhotoPick}
            onClear={onPhotoClear}
            capture="user"
            className="w-[112px]"
          />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <p className="loan-apply-label">Documents</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <DocumentCompactAttach
            dense
            label="Nominee ID proof"
            value={nomineeIdProofName}
            url={attachmentUrls.nomineeIdProofName}
            accept=".pdf,.jpg,.jpeg,.png,image/*"
            capture="environment"
            onPick={onIdProofPick}
            onClear={onIdProofClear}
          />
          <DocumentCompactAttach
            dense
            label="Nominee photo doc"
            value={nomineePhotoName}
            url={attachmentUrls.nomineePhotoName}
            accept=".jpg,.jpeg,.png,.webp,image/*"
            capture="user"
            onPick={onPhotoPick}
            onClear={onPhotoClear}
          />
        </div>
      </div>



      <div className="mt-3 rounded-lg border border-slate-200/90 bg-slate-50/50 p-2.5">
        <div className="flex flex-wrap gap-1.5">

          <StatusPill ok={Boolean(nomineeName?.trim())} label="Nominee" />

          {!disableOtp ? <StatusPill ok={phoneVerified} label="Mobile OTP" /> : null}

          <StatusPill ok={idFormatOk} label="ID format" />

          <StatusPill ok={docsAttached >= 1} label={`Docs ${docsAttached}/2`} />

          <StatusPill ok={Boolean(nomineeAddress?.trim())} label="Address" />

          <StatusPill ok={Boolean(nomineeRelation)} label="Relationship" />

        </div>

      </div>

    </section>

  );

}

