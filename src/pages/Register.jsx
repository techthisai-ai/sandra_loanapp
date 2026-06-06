import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BadgeCheck, Eye, EyeOff, IdCard, Mail, Phone, UserPlus } from "lucide-react";
import { createEmployeeAccount } from "../services/userAuth";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [created, setCreated] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setCreated(null);

    try {
      const result = await createEmployeeAccount({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        role: "employee",
      });

      setCreated(result);
      setForm({
        name: "",
        email: "",
        phone: "",
        password: "",
      });
      navigate("/login", { replace: true });
    } catch (submitError) {
      setError(submitError.message || "Unable to create employee account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center lg:grid-cols-[1fr_0.95fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Register</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                Create employee account
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Register new users as employee accounts by default. The account gets a generated employee ID.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                <IdCard className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Default role</p>
                <p className="text-sm text-slate-600">Every registration is created as employee.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Employee register</p>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Create account</h2>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Employee name</span>
              <input
                value={form.name}
                onChange={updateField("name")}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                placeholder="Enter full name"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Mail className="h-4 w-4 text-blue-600" />
                  Email
                </span>
                <input
                  value={form.email}
                  onChange={updateField("email")}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                  placeholder="employee@example.com"
                />
              </label>

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Phone className="h-4 w-4 text-blue-600" />
                  Phone
                </span>
                <input
                  value={form.phone}
                  onChange={updateField("phone")}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                  placeholder="+1 555 010 2026"
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <BadgeCheck className="h-4 w-4 text-blue-600" />
                Password
              </span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={updateField("password")}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-12 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                  placeholder="Create password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 transition hover:text-slate-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {created ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Employee ID created: {created.employeeId}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <UserPlus className="h-4 w-4" />
              {loading ? "Creating..." : "Register employee"}
            </button>

            <p className="text-sm text-slate-600">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-blue-600 hover:text-blue-700">
                Back to login
              </Link>
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
