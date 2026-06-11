import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { LogOut, Moon, Sun } from "lucide-react";
import { auth } from "../../firebase/config";
import { clearAuthSession } from "../../utils/authSession";
import { applyAdminTheme, getAdminTheme, toggleAdminTheme } from "../../utils/adminTheme";

const TOOLBAR_BTN_CLASS =
  "admin-toolbar-btn inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 p-0 text-slate-600 shadow-sm backdrop-blur-sm transition hover:border-blue-200 hover:bg-white hover:text-slate-900 hover:shadow-md";

export default function AdminDashboardToolbar({ children }) {
  const [theme, setTheme] = useState(() => getAdminTheme());

  useEffect(() => {
    applyAdminTheme(theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme(toggleAdminTheme());
  };

  const handleLogout = async () => {
    clearAuthSession();
    await signOut(auth);
    window.location.href = "/login";
  };

  const isDark = theme === "dark";

  return (
    <div className="flex items-center gap-2">
      {children}
      <button
        type="button"
        onClick={handleToggleTheme}
        className={TOOLBAR_BTN_CLASS}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        title={isDark ? "Light mode" : "Dark mode"}
      >
        {isDark ? <Sun className="h-5 w-5" strokeWidth={1.75} /> : <Moon className="h-5 w-5" strokeWidth={1.75} />}
      </button>
      <button
        type="button"
        onClick={handleLogout}
        className={TOOLBAR_BTN_CLASS}
        aria-label="Logout"
        title="Logout"
      >
        <LogOut className="h-5 w-5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
