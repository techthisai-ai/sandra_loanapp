import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IdCard, MapPin, Phone, ArrowRight, UserRound, FileText } from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import { validateIdentityNumber } from "../utils/customerValidation";

const initialForm = {
  customerName: "",
  mobileNumber: "",
  identityType: "Aadhaar Card",
  identityNumber: "",
  address: "",
  country: "",
};

export default function LoanApplications() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [identityError, setIdentityError] = useState("");

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [field]: value }));

    if (field === "identityType" || field === "identityNumber") {
      const nextType = field === "identityType" ? value : form.identityType;
      const nextNumber = field === "identityNumber" ? value : form.identityNumber;
      setIdentityError(validateIdentityNumber(nextType, nextNumber));
    }
  };

  const handleNext = (event) => {
    event.preventDefault();
    const nextIdentityError = validateIdentityNumber(form.identityType, form.identityNumber);
    setIdentityError(nextIdentityError);

    if (!form.customerName || !form.mobileNumber || !form.identityNumber || !form.address || !form.country) {
      setError("Please fill in all customer details before continuing");
      return;
    }
    if (nextIdentityError) {
      setError("Enter a valid ID number before continuing");
      return;
    }

    setError("");

    sessionStorage.setItem("loanApplicationDraft", JSON.stringify(form));
    navigate("/dashboard/loan-applications/date", {
      state: { customerDraft: form },
    });
  };

  return (
    <AdminLayout
      title="Loan applications"
      description="Step 1 of 2. Enter the customer details first, then continue to date selection."
    >
      <div className="grid w-full max-w-6xl gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <UserRound className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Step 1</p>
              <h3 className="text-xl font-semibold tracking-tight text-slate-900">Customer details</h3>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Fill the details here</p>
                <p className="text-sm text-slate-600">Date selection happens on the next page.</p>
              </div>
            </div>
          </div>

          <form className="mt-6 grid gap-4" onSubmit={handleNext}>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Customer name</span>
              <input
                value={form.customerName}
                onChange={updateField("customerName")}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                placeholder="Enter customer name"
              />
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Phone className="h-4 w-4 text-blue-600" />
                Mobile number
              </span>
              <input
                value={form.mobileNumber}
                onChange={updateField("mobileNumber")}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                placeholder="Enter mobile number"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <IdCard className="h-4 w-4 text-blue-600" />
                  Identity type
                </span>
                <select
                  value={form.identityType}
                  onChange={updateField("identityType")}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                >
                  <option>Aadhaar Card</option>
                  <option>Voter ID</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <IdCard className="h-4 w-4 text-blue-600" />
                  Identity number
                </span>
                <input
                  value={form.identityNumber}
                  onChange={updateField("identityNumber")}
                  onBlur={() => setIdentityError(validateIdentityNumber(form.identityType, form.identityNumber))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                  placeholder="Enter card number"
                />
                {identityError ? <p className="text-xs text-rose-600">{identityError}</p> : null}
              </label>
            </div>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <MapPin className="h-4 w-4 text-blue-600" />
                Address
              </span>
              <textarea
                value={form.address}
                onChange={updateField("address")}
                rows={4}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                placeholder="Enter full address"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Country</span>
              <input
                value={form.country}
                onChange={updateField("country")}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                placeholder="Enter country"
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Flow</p>
          <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
            <div className="space-y-3 text-sm text-slate-600">
              <p>1. Enter customer details.</p>
              <p>2. Continue to the next page for date selection.</p>
              <p>3. Create the customer and generate the ID.</p>
            </div>
          </div>
          <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600">
            The customer ID and application ID are generated on the next page when the record is created.
          </div>
        </aside>
      </div>
    </AdminLayout>
  );
}
