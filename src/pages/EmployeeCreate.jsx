import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Mail, Phone, RefreshCw, UserPlus, UsersRound } from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";
import { createEmployeeAccount, listEmployees } from "../services/userAuth";

function EmployeeAvatar({ name }) {
  const initials = useMemo(() => {
    if (!name) return "EM";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("")
      .slice(0, 2);
  }, [name]);

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-sm font-semibold text-blue-700">
      {initials}
    </div>
  );
}

export default function EmployeeCreate() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    username: "",
    phone: "",
    password: "",
  });
  const [created, setCreated] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const loadEmployeeList = async () => {
    setListLoading(true);
    setListError("");

    try {
      const items = await listEmployees();
      setEmployees(items);
    } catch (loadError) {
      setListError(loadError.message || "Unable to load employee list");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        const items = await listEmployees();
        if (!active) return;
        setEmployees(items);
      } catch (loadError) {
        if (!active) return;
        setListError(loadError.message || "Unable to load employee list");
      } finally {
        if (active) setListLoading(false);
      }
    };

    init();

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setCreated(null);

    try {
      const result = await createEmployeeAccount({
        name: form.name,
        username: form.username,
        phone: form.phone,
        password: form.password,
        role: "employee",
      });

      setCreated(result);
      setForm({
        name: "",
        username: "",
        phone: "",
        password: "",
      });
      await loadEmployeeList();
      setShowCreateModal(false);
    } catch (submitError) {
      setError(submitError.message || "Unable to create employee account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout
      title="Employee create"
      description="Create employee accounts, generate employee IDs, and keep the employee list visible."
    >
      <div className="grid w-full max-w-6xl gap-4 lg:grid-cols-[1fr_0.95fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Employee create</p>
              <h3 className="text-xl font-semibold tracking-tight text-slate-900">Create account</h3>
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-600">
            Click the create button to open the employee form in a popup.
          </p>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <UserPlus className="h-4 w-4" />
            Open employee form
          </button>
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Employee list</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
                All employee accounts
              </h3>
            </div>

            <button
              type="button"
              onClick={loadEmployeeList}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>

          <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <UsersRound className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {listLoading ? "Loading employees..." : `${employees.length} employee accounts`}
                </p>
                <p className="text-sm text-slate-600">
                  Created accounts are stored in Firestore with generated IDs.
                </p>
              </div>
            </div>
          </div>

          {listError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {listError}
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {employees.map((employee) => (
              <div
                key={employee.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <EmployeeAvatar name={employee.displayName} />
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {employee.displayName || employee.email}
                    </p>
                    <p className="text-xs text-slate-500">{employee.employeeId}</p>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>{employee.phone || "No phone"}</p>
                  <p>{employee.email}</p>
                </div>
              </div>
            ))}

            {!listLoading && employees.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No employee accounts yet.
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {showCreateModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-blue-600">Employee create</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
                  Create employee account
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium text-slate-700">Employee name</span>
                  <input
                    value={form.name}
                    onChange={updateField("name")}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                    placeholder="Enter full name"
                  />
                </label>

                <label className="space-y-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Mail className="h-4 w-4 text-blue-600" />
                    Username
                  </span>
                  <input
                    value={form.username}
                    onChange={updateField("username")}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                    placeholder="e.g. rajesh"
                    autoComplete="off"
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

                <label className="space-y-2 md:col-span-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <BadgeCheck className="h-4 w-4 text-blue-600" />
                    Password
                  </span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={updateField("password")}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                    placeholder="Create temporary password"
                  />
                </label>
              </div>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              {created ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  Employee created successfully. ID: {created.employeeId}
                  {created.loginUsername ? (
                    <span className="mt-1 block">Login username: {created.loginUsername}</span>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <UserPlus className="h-4 w-4" />
                  {loading ? "Creating..." : "Create employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}
