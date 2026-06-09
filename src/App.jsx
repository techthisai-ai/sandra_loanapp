import { BrowserRouter } from "react-router-dom";
import DevEnvironmentBanner from "./components/DevEnvironmentBanner";
import { AuthProvider } from "./context/AuthProvider";
import { LoanDataSyncProvider } from "./context/LoanDataSyncContext";
import AppRoutes from "./routes/AppRoutes";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LoanDataSyncProvider>
          <DevEnvironmentBanner />
          <AppRoutes />
        </LoanDataSyncProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
