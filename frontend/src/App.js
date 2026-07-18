import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { applyPrimaryColor } from "@/lib/theme";
import CheckInPage from "@/pages/CheckInPage";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";

function ThemeLoader() {
  useEffect(() => {
    api.get("/settings").then((r) => {
      const s = r.data || {};
      if (s.primary_color) applyPrimaryColor(s.primary_color);
      const title = s.browser_tab_title || [s.site_title, s.tagline].filter(Boolean).join(" — ");
      if (title) document.title = title;
    }).catch(() => {});
  }, []);
  return null;
}

function ProtectedRoute({ children }) {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/admin/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <ThemeLoader />
          <Routes>
            <Route path="/" element={<CheckInPage />} />
            <Route path="/checkin/:jobId" element={<CheckInPage />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
