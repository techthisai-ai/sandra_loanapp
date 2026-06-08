import { ClipboardPen, Home, IndianRupee, UsersRound } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

function navClass(isActive) {
  return `employee-tab-link flex min-h-[44px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1 transition active:scale-[0.97] md:min-h-[48px] ${
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
      className="employee-tabbar fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 items-stretch gap-0 border-t border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-surface)_94%,transparent)] px-1 pt-1 backdrop-blur-xl supports-[padding:max(0px)]:pb-[max(8px,env(safe-area-inset-bottom))] pb-[max(8px,env(safe-area-inset-bottom))]"
      aria-label="Main navigation"
    >
      <NavLink to="/employee" end className={({ isActive }) => navClass(isActive)}>
        <Home className="employee-tab-icon h-5 w-5 shrink-0 sm:h-[22px] sm:w-[22px]" />
        <span className="employee-tab-label max-w-full truncate text-[10px] font-semibold uppercase tracking-[0.08em] sm:text-[11px] md:text-xs">
          Dashboard
        </span>
      </NavLink>

      <NavLink to="/employee/customers" className={() => navClass(customersActive)}>
        <UsersRound className="employee-tab-icon h-5 w-5 shrink-0 sm:h-[22px] sm:w-[22px]" />
        <span className="employee-tab-label max-w-full truncate text-[10px] font-semibold uppercase tracking-[0.08em] sm:text-[11px] md:text-xs">
          My Customers
        </span>
      </NavLink>

      <NavLink to="/employee/collection" className={({ isActive }) => navClass(isActive)}>
        <IndianRupee className="employee-tab-icon h-5 w-5 shrink-0 sm:h-[22px] sm:w-[22px]" />
        <span className="employee-tab-label max-w-full truncate text-[10px] font-semibold uppercase tracking-[0.08em] sm:text-[11px] md:text-xs">
          My Collections
        </span>
      </NavLink>

      <NavLink to="/employee/profile" className={({ isActive }) => navClass(isActive)}>
        <ClipboardPen className="employee-tab-icon h-5 w-5 shrink-0 sm:h-[22px] sm:w-[22px]" />
        <span className="employee-tab-label max-w-full truncate text-[10px] font-semibold uppercase tracking-[0.08em] sm:text-[11px] md:text-xs">
          Customer Entry
        </span>
      </NavLink>
    </nav>
  );
}
