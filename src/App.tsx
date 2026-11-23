import { lazy, Suspense, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useGroupSubscription } from "@/lib/groupSubscription";
import BookingBlockedOverlay from "@/components/BookingBlockedOverlay";
import { readStartIntent, stashPendingIntent } from "@/lib/startParam";
import Index from "./pages/Index.tsx";

// Главная грузится сразу, остальные страницы — отдельными чанками по требованию
const BookingFlow = lazy(() => import("./pages/booking/BookingFlow.tsx"));
const Schedule = lazy(() => import("./pages/Schedule.tsx"));
const Emergency = lazy(() => import("./pages/Emergency.tsx"));
const Account = lazy(() => import("./pages/Account.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const AdminStats = lazy(() => import("./pages/AdminStats.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

/** Сохраняет deep-link intent (startapp) до завершения аутентификации. */
function StartParamBridge() {
  useEffect(() => {
    const intent = readStartIntent();
    if (intent) stashPendingIntent(intent);
  }, []);
  return null;
}

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

// Кураторы (админы) не проверяются — иначе случайная отписка от группы
// закрыла бы им доступ к управлению Теремом.
function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { status, refresh } = useGroupSubscription(user?.isAdmin ? undefined : user?.id);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  return (
    <>
      {children}
      {status === "blocked" && (
        <BookingBlockedOverlay onRefresh={handleRefresh} isRefreshing={isRefreshing} />
      )}
    </>
  );
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
      <Route path="/emergency" element={<Emergency />} />
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
          <StartParamBridge />
          <SubscriptionGuard>
            <AppRoutes />
          </SubscriptionGuard>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
