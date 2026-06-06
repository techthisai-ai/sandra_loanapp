import { ClipboardPen, Home, IndianRupee, UsersRound } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

function tabLabelClass() {
  return "max-w-full truncate text-[8px] font-semibold uppercase tracking-[0.08em] sm:text-[9px] sm:tracking-[0.12em]";
}

function iconClass() {
  return "h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5";
}

function navClass(isActive) {
  return `flex min-h-[44px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1 transition active:scale-[0.97] ${
    isActive ? "bg-[color-mix(in_srgb,var(--app-accent)_16%,transparent)] text-[var(--app-accent-strong)]" : "text-slate-600 hover:bg-slate-100"
  }`;
}

export default function EmployeeMobileNav() {
  const location = useLocation();

  const customersActive =
    location.pathname === "/employee/customers" ||
    /^\/employee\/customers\/[^/]+\/[^/]+/.test(location.pathname);

  return (
    <nav
      className="employee-tabbar fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 items-stretch gap-0 border-t border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-surface)_94%,transparent)] px-0.5 pt-1 backdrop-blur-xl supports-[padding:max(0px)]:pb-[max(8px,env(safe-area-inset-bottom))] pb-[max(8px,env(safe-area-inset-bottom))]"
      aria-label="Main navigation"
    >
      <NavLink to="/employee" end className={({ isActive }) => navClass(isActive)}>
        <Home className={iconClass()} />
        <span className={tabLabelClass()}>Dashboard</span>
      </NavLink>

      <NavLink to="/employee/customers" className={() => navClass(customersActive)}>
        <UsersRound className={iconClass()} />
        <span className={tabLabelClass()}>My Customers</span>
      </NavLink>

      <NavLink to="/employee/collection" className={({ isActive }) => navClass(isActive)}>
        <IndianRupee className={iconClass()} />
        <span className={tabLabelClass()}>My Collections</span>
      </NavLink>

      <NavLink to="/employee/profile" className={({ isActive }) => navClass(isActive)}>
        <ClipboardPen className={iconClass()} />
        <span className={tabLabelClass()}>Customer Entry</span>
      </NavLink>
    </nav>
  );
}
