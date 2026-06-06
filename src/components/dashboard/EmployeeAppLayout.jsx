import { NavLink, Outlet } from "react-router-dom";
import BrandLogo from "../BrandLogo";
import EmployeeHeaderProfileMenu from "../employee/EmployeeHeaderProfileMenu";
import EmployeeMobileNav from "./EmployeeMobileNav";

export default function EmployeeAppLayout() {
  return (
    <div className="app-shell flex min-h-[100dvh] flex-col overflow-x-hidden text-slate-900">
      <header className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-surface)_88%,transparent)] px-3 py-2.5 backdrop-blur-md supports-[padding:max(0px)]:pt-[max(10px,env(safe-area-inset-top))] sm:px-4 sm:py-3">
        <NavLink
          to="/employee"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl py-1 pr-2 transition active:bg-white/50 sm:gap-3 sm:hover:bg-white/60"
        >
          <BrandLogo variant="sm" className="shrink-0" />
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-[10px] sm:tracking-[0.22em]">
              Ruthra
            </p>
            <p className="truncate text-[11px] font-semibold text-slate-800 sm:text-xs">Collector</p>
          </div>
        </NavLink>
        <EmployeeHeaderProfileMenu />
      </header>

      <div className="employee-main-pad flex flex-1 flex-col overflow-x-hidden overflow-y-auto px-3 pt-3 sm:px-5 sm:pt-4 md:px-6">
        <Outlet />
      </div>

      <EmployeeMobileNav />
    </div>
  );
}
