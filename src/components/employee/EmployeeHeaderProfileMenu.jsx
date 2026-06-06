import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { LogOut, UserRound } from "lucide-react";
import { auth } from "../../firebase/config";
import useAuth from "../../hooks/useAuth";

export default function EmployeeHeaderProfileMenu() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const username =
    profile?.username || profile?.displayName || profile?.employeeId || profile?.email || "Employee";

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleSignOut = async () => {
    setOpen(false);
    await signOut(auth);
    window.location.href = "/login";
  };

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--app-border)] bg-white/80 text-slate-700 transition hover:bg-white active:scale-[0.97]"
        aria-label="Open profile menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <UserRound className="h-5 w-5" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Signed in as</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900">{username}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-rose-700 transition hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
