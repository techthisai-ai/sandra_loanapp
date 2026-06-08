import { useLocation, useNavigate } from "react-router-dom";

export default function CenterEmployeeTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname.includes("/employees") ? "employee" : "center";

  const buttonClass = (tab) =>
    `rounded-xl px-4 py-2 text-sm font-medium transition ${
      active === tab ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <div className="mb-4 flex w-full shrink-0 justify-end">
      <div className="app-segmented w-full sm:w-auto">
        <button type="button" onClick={() => navigate("/dashboard/center")} className={buttonClass("center")}>
          Center
        </button>
        <button type="button" onClick={() => navigate("/dashboard/employees")} className={buttonClass("employee")}>
          Employee
        </button>
      </div>
    </div>
  );
}
