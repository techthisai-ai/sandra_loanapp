import { useState } from "react";
import { NavLink } from "react-router-dom";
import BrandLogo from "../BrandLogo";
import {
  LayoutDashboard,
  Landmark,
  ClipboardList,
  BarChart3,
  UsersRound,
  UserCog,
  FileText,
  Sparkles,
  SlidersHorizontal,
  Menu,
  X,
} from "lucide-react";

const navigationItems = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, end: true },
  { label: "Customer", to: "/dashboard/customer", icon: UsersRound, end: true },
  { label: "Employee", to: "/dashboard/employees", icon: UserCog, end: true },
  { label: "Center", to: "/dashboard/center", icon: Sparkles, end: true },
  { label: "Loan", to: "/dashboard/loan-apply", icon: FileText },
  { label: "Collection", to: "/dashboard/collection", icon: ClipboardList },
  { label: "Accounts", to: "/dashboard/accounts", icon: Landmark },
  { label: "Reports", to: "/dashboard/reports", icon: BarChart3 },
  { label: "Setting", to: "/settings", icon: SlidersHorizontal },
];

const NavItems = ({ onSelect }) => (
  <nav className="flex flex-col gap-2">
    {navigationItems.map((item) => {
      const Icon = item.icon;
      return (
        <NavLink
          key={item.label}
          to={item.to}
          end={item.end}
          onClick={onSelect}
          className={({ isActive }) =>
            `sidebar-nav-link group ${isActive ? "sidebar-nav-link--active" : ""}`
          }
        >
          <span className="sidebar-nav-icon">
            <Icon className="h-4 w-4 shrink-0 text-slate-700" />
          </span>
          <span className="truncate">{item.label}</span>
        </NavLink>
      );
    })}
  </nav>
);

export default function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle button */}
      <div className="md:hidden fixed right-0 top-0 z-50 p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          className="app-panel flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 shadow-sm"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <>
          <button
            type="button"
            aria-label="Close navigation menu overlay"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] md:hidden"
          />
          <div className="md:hidden fixed inset-y-0 right-0 z-50 w-[82vw] max-w-[320px] app-panel border-l border-slate-200 p-4 shadow-xl overflow-y-auto">
            <div className="mb-4 border-b border-slate-200 pb-4">
              <BrandLogo variant="sidebar" className="mx-auto max-w-full object-contain object-center" />
              <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                Ruthra Financial Solutions
              </p>
            </div>
            <NavItems onSelect={() => setOpen(false)} />
          </div>
        </>
      )}

      {/* Tablet / desktop sidebar — fixed position */}
      <aside className="z-40 hidden md:fixed md:left-0 md:top-0 md:flex md:h-screen md:w-[248px] md:flex-col md:px-3 md:py-2 lg:w-[286px] lg:px-4">
        <div className="app-panel sidebar-premium sidebar-glass-nav flex h-full flex-col overflow-hidden px-4 pb-5 pt-1.5 text-slate-100">
          <div className="mb-3 shrink-0 space-y-2">
            <div className="w-full rounded-2xl border border-white/10 px-2 py-2">
              <BrandLogo variant="sidebar" className="mx-auto max-w-full object-contain object-center" />
              <p className="mt-2 text-center text-[10px] font-semibold uppercase leading-snug tracking-[0.2em] text-white">
                Ruthra Financial Solutions
              </p>
            </div>
            <div className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/25 bg-white/[0.16] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.22em] text-teal-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              Admin Panel
            </div>
          </div>

          <div className="flex-1 overflow-y-visible pr-0">
            <NavItems onSelect={() => {}} />
          </div>
        </div>
      </aside>
    </>
  );
}
