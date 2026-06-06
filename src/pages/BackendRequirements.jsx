import { Database, FileUp, Bell, FileText, KeyRound, UsersRound, Wallet } from "lucide-react";
import AdminLayout from "../components/dashboard/AdminLayout";

const endpointGroups = [
  {
    title: "Authentication",
    icon: KeyRound,
    endpoints: ["POST /auth/login", "POST /auth/logout", "GET /auth/profile"],
  },
  {
    title: "Customer CRUD",
    icon: UsersRound,
    endpoints: ["GET /customers", "POST /customers", "PUT /customers/:id", "DELETE /customers/:id"],
  },
  {
    title: "Loan CRUD",
    icon: Wallet,
    endpoints: ["GET /loans", "POST /loans", "PUT /loans/:id", "PATCH /loans/:id/status"],
  },
  {
    title: "Collection entries",
    icon: Database,
    endpoints: ["GET /collections", "POST /collections", "PATCH /collections/:id/approve"],
  },
  {
    title: "Reports generation",
    icon: FileText,
    endpoints: ["GET /reports/daily", "GET /reports/monthly", "GET /reports/export"],
  },
  {
    title: "Notifications",
    icon: Bell,
    endpoints: ["GET /notifications", "POST /notifications", "PATCH /notifications/:id/read"],
  },
  {
    title: "File uploads",
    icon: FileUp,
    endpoints: ["POST /files/upload", "GET /files/:id", "DELETE /files/:id"],
  },
];

export default function BackendRequirements() {
  return (
    <AdminLayout
      title="API / Backend Requirements"
      description="Reference screen for the backend endpoints this project needs across authentication, customers, loans, collections, reports, notifications, and file uploads."
    >
      <div className="app-grid-page grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {endpointGroups.map((group) => {
          const Icon = group.icon;
          return (
            <section key={group.title} className="app-panel rounded-[30px] p-6">
              <div className="flex items-center gap-3">
                <div className="app-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Backend module</p>
                  <h3 className="text-xl font-semibold text-slate-950">{group.title}</h3>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {group.endpoints.map((endpoint) => (
                  <div key={endpoint} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {endpoint}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </AdminLayout>
  );
}
