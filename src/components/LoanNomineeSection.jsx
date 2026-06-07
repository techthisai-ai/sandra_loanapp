import { useMemo } from "react";

import {

  CheckCircle2,
  AlertTriangle,

  ChevronDown,

  IdCard,

  Users,

} from "lucide-react";

import {

  IDENTITY_TYPE_OPTIONS,

} from "../utils/customerValidation";

import { NOMINEE_RELATIONSHIP_OPTIONS } from "../utils/nomineeRelationship";

import { DocumentCompactAttach, DocumentPhotoTile } from "./DocumentUploadControls";



function StatusPill({ ok, label }) {

  return (

    <span

      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${

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

    <section className="overflow-hidden rounded-3xl border border-blue-200/60 bg-gradient-to-br from-blue-50/40 via-white to-indigo-50/25 p-3 shadow-lg shadow-blue-900/5 ring-1 ring-blue-100/50 backdrop-blur-sm sm:p-4">

      <div className="flex flex-wrap items-start justify-between gap-3">

        <div className="flex items-start gap-3">

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25">

            <Users className="h-5 w-5" />

          </div>

          <div>

            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-700">Nominee details</p>

            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">

              Emergency contact for collections and loan servicing.

            </p>

          </div>

        </div>

        <span

          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${

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
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Basic details</p>
            <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <input
                  id="nominee-name"
                  value={nomineeName}
                  onChange={(e) => onFieldChange("nomineeName", e.target.value)}
                  className={`app-input w-full py-2.5 text-sm ${
                    nameError ? "border-rose-400 bg-rose-50/40 shadow-[0_0_0_3px_rgba(244,63,94,0.10)]" : ""
                  }`}
                  placeholder="Nominee name *"
                />
                {nameError ? <p className="mt-1 text-[11px] text-rose-600">{nameError}</p> : null}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="nominee-phone"
                    value={nomineeContact}
                    onChange={(e) => onNomineePhoneChange(e.target.value)}
                    inputMode="numeric"
                    maxLength={10}
                    className={`app-input w-full py-2.5 text-sm ${
                      contactRequiredError || phoneError
                        ? "border-rose-400 bg-rose-50/40 shadow-[0_0_0_3px_rgba(244,63,94,0.10)]"
                        : ""
                    }`}
                    placeholder="Nominee phone *"
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
                {contactRequiredError ? <p className="mt-1 text-[11px] text-rose-600">{contactRequiredError}</p> : null}
                {phoneError ? <p className="mt-1 text-[11px] text-rose-600">{phoneError}</p> : null}
              </div>

              <input
                value={additionalContact}
                onChange={(e) => onFieldChange("additionalContact", e.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="numeric"
                maxLength={10}
                className="app-input w-full py-2 text-sm"
                placeholder="Additional contact (optional)"
              />

              <textarea
                value={nomineeAddress}
                onChange={(e) => onFieldChange("nomineeAddress", e.target.value)}
                rows={2}
                className="app-textarea w-full text-sm sm:col-span-2"
                placeholder="Nominee address"
              />
            </div>
          </div>

          <div>
            <div className="grid gap-3 sm:grid-cols-[minmax(7.25rem,0.38fr)_minmax(10.5rem,0.82fr)_minmax(11rem,1.4fr)] sm:items-end">
              <div className="min-w-0">
                <label
                  htmlFor="nominee-relationship"
                  className={`mb-1 block whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] ${
                    relationshipError ? "text-rose-700" : "text-slate-500"
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
                    className={`app-select w-full min-w-0 appearance-none py-2.5 pl-2.5 pr-8 text-sm transition hover:border-blue-300/90 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25 ${
                      relationshipError
                        ? "animate-otp-shake border-rose-400 bg-rose-50/40 shadow-[0_0_0_3px_rgba(244,63,94,0.10)] focus:border-rose-500 focus:ring-rose-500/20"
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
                  className="mb-1 block whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"
                >
                  Identity details
                </label>
                <select
                  id="nominee-identity-type"
                  value={nomineeIdentityType}
                  onChange={(e) => onFieldChange("nomineeIdentityType", e.target.value)}
                  className="app-select w-full min-w-0 py-2.5 pl-3 pr-9 text-sm"
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
                  className="mb-1 block whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"
                >
                  Nominee ID
                </label>
                <input
                  id="nominee-id-number"
                  value={nomineeIdentityNumber}
                  onChange={(e) => onFieldChange("nomineeIdentityNumber", e.target.value)}
                  className={`app-input w-full min-w-0 px-3 py-2.5 text-sm ${
                    identityError ? "border-rose-400 bg-rose-50/40 shadow-[0_0_0_3px_rgba(244,63,94,0.10)]" : ""
                  }`}
                  placeholder="ID number *"
                />
              </div>
            </div>

            {relationshipError ? <p className="mt-1 text-[11px] text-rose-600">{relationshipError}</p> : null}
            {identityError ? <p className="mt-1.5 text-[11px] text-rose-600">{identityError}</p> : null}
            {idFormatOk ? (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-emerald-700">
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Documents</p>
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



      <div className="mt-5 rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-white p-4 shadow-sm ring-1 ring-slate-100">

        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">

          <IdCard className="h-3.5 w-3.5" />

          Verification summary

        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">

          <StatusPill ok={Boolean(nomineeName?.trim())} label="Nominee" />

          {!disableOtp ? <StatusPill ok={phoneVerified} label="Mobile OTP" /> : null}

          <StatusPill ok={idFormatOk} label="ID format" />

          <StatusPill ok={docsAttached >= 1} label={`Docs ${docsAttached}/2`} />

          <StatusPill ok={Boolean(nomineeAddress?.trim())} label="Address" />

          <StatusPill ok={Boolean(nomineeRelation)} label="Relationship" />

        </div>

        <p className="mt-2 text-[10px] leading-snug text-slate-500">

          One nominee record is saved with this loan and used as the emergency contact for collections.

        </p>

      </div>

    </section>

  );

}

