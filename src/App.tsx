import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Layout } from "./components/Layout";
import Index from "./pages/Index";
import Rippling from "./pages/Rippling";
import MichaelCard from "./pages/MichaelCard";
import UberPage from "./pages/UberPage";
import ExpensesYTD from "./pages/ExpensesYTD";
import RipplingExpensesPage from "./pages/RipplingExpensesPage";
import TravelDashboard from "./pages/TravelDashboard";
import ITSubscriptionsDashboard from "./pages/ITSubscriptionsDashboard";
import NotFound from "./pages/NotFound";
import { LoginPage } from "./pages/LoginPage";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthorized } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAuthorized) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Main app routes
function AppRoutes() {
  const { user, loading, isAuthorized } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Routes>
      <Route 
        path="/login" 
        element={user && isAuthorized ? <Navigate to="/credit-card" replace /> : <LoginPage />} 
      />
      <Route path="/" element={<Navigate to="/credit-card" replace />} />
      <Route path="/credit-card" element={<ProtectedRoute><Layout><Index /></Layout></ProtectedRoute>} />
      <Route path="/rippling" element={<ProtectedRoute><Layout><Rippling /></Layout></ProtectedRoute>} />
      <Route path="/rippling-expenses" element={<ProtectedRoute><Layout><RipplingExpensesPage /></Layout></ProtectedRoute>} />
      <Route path="/michael-card" element={<ProtectedRoute><Layout><MichaelCard /></Layout></ProtectedRoute>} />
      <Route path="/uber" element={<ProtectedRoute><Layout><UberPage /></Layout></ProtectedRoute>} />
      <Route path="/expenses-ytd" element={<ProtectedRoute><ExpensesYTD /></ProtectedRoute>} />
      <Route path="/travel" element={<ProtectedRoute><TravelDashboard /></ProtectedRoute>} />
      <Route path="/it-subscriptions" element={<ProtectedRoute><ITSubscriptionsDashboard /></ProtectedRoute>} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
