import { signOut } from "firebase/auth";
import { LogOut } from "lucide-react";
import { auth } from "../../firebase/config";

export default function LogoutButton() {
  const handleLogout = async () => {
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
