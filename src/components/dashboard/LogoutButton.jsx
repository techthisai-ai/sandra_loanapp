import { signOut } from "firebase/auth";
import { LogOut } from "lucide-react";
import { auth } from "../../firebase/config";
import { clearAuthSession } from "../../utils/authSession";

export default function LogoutButton() {
  const handleLogout = async () => {
    clearAuthSession();
    await signOut(auth);
    window.location.href = "/login";
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="app-button-secondary inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium"
    >
      <LogOut className="h-4 w-4" />
      Logout
    </button>
  );
}
