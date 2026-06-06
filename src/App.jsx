import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthProvider";
import { LoanDataSyncProvider } from "./context/LoanDataSyncContext";
import AppRoutes from "./routes/AppRoutes";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LoanDataSyncProvider>
          <AppRoutes />
        </LoanDataSyncProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
