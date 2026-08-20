import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { I18nProvider } from "@/context/I18nContext";
import Layout from "@/components/Layout";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import Khata from "@/pages/Khata";
import CustomerDetail from "@/pages/CustomerDetail";
import Inventory from "@/pages/Inventory";
import Suppliers from "@/pages/Suppliers";
import Analytics from "@/pages/Analytics";
import CustomerPortal from "@/pages/CustomerPortal";

const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background" />;
  if (!user) return <Navigate to="/auth" replace />;
  return <Layout>{children}</Layout>;
};

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/customer" element={<CustomerPortal />} />
              <Route path="/" element={<Protected><Dashboard /></Protected>} />
              <Route path="/khata" element={<Protected><Khata /></Protected>} />
              <Route path="/khata/:id" element={<Protected><CustomerDetail /></Protected>} />
              <Route path="/inventory" element={<Protected><Inventory /></Protected>} />
              <Route path="/suppliers" element={<Protected><Suppliers /></Protected>} />
              <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
            </Routes>
          </BrowserRouter>
          <Toaster position="bottom-center" richColors />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;
