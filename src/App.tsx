import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import Index from "./pages/Index.tsx";

// Главная грузится сразу, остальные страницы — отдельными чанками по требованию
const BookingFlow = lazy(() => import("./pages/booking/BookingFlow.tsx"));
const Schedule = lazy(() => import("./pages/Schedule.tsx"));
const Account = lazy(() => import("./pages/Account.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const AdminStats = lazy(() => import("./pages/AdminStats.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="min-h-screen warm-glow flex items-center justify-center">
    <p className="text-muted-foreground animate-pulse">Загрузка...</p>
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen warm-glow flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

const AppRoutes = () => {
  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route
        path="/book"
        element={
          <ProtectedRoute>
            <BookingFlow />
          </ProtectedRoute>
        }
      />
      {/* Раздел «Мои брони» объединён с кабинетом; старый адрес ведёт туда же */}
      <Route path="/bookings" element={<Navigate to="/account" replace />} />
      <Route path="/schedule" element={<Schedule />} />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <Account />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/stats"
        element={
          <ProtectedRoute>
            <AdminStats />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
};

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
