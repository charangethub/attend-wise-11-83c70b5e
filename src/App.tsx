import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { SidebarLayout } from "@/components/SidebarLayout";

const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const AttendanceDashboard = lazy(() => import("./pages/AttendanceDashboard"));
const AbsenteeDashboard = lazy(() => import("./pages/AbsenteeDashboard"));
const AttendanceRecords = lazy(() => import("./pages/AttendanceRecords"));
const DailyAttendanceReport = lazy(() => import("./pages/DailyAttendanceReport"));
const NotFound = lazy(() => import("./pages/NotFound"));
const StudentCalendarReport = lazy(() => import("./pages/StudentCalendarReport"));
const PermissionEntry = lazy(() => import("./pages/PermissionEntry"));
const Inventory = lazy(() => import("./pages/Inventory"));
const DistributionStatus = lazy(() => import("./pages/DistributionStatus"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

const RouteLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteLoader />}>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/pending-approval" element={<ProtectedRoute><PendingApproval /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><SidebarLayout><Dashboard /></SidebarLayout></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute requiredRole={["owner"]}><SidebarLayout><AdminPanel /></SidebarLayout></ProtectedRoute>} />
              <Route path="/attendance" element={<ProtectedRoute requiredPage="Mark Attendance"><SidebarLayout><AttendanceDashboard /></SidebarLayout></ProtectedRoute>} />
              <Route path="/absentees" element={<ProtectedRoute requiredPage="Absentee Report"><SidebarLayout><AbsenteeDashboard /></SidebarLayout></ProtectedRoute>} />
              <Route path="/records" element={<ProtectedRoute requiredPage="Attendance Records"><SidebarLayout><AttendanceRecords /></SidebarLayout></ProtectedRoute>} />
              <Route path="/daily-report" element={<ProtectedRoute requiredPage="Daily Report"><SidebarLayout><DailyAttendanceReport /></SidebarLayout></ProtectedRoute>} />
              <Route path="/student-calendar" element={<ProtectedRoute requiredPage="Student Calendar"><SidebarLayout><StudentCalendarReport /></SidebarLayout></ProtectedRoute>} />
              <Route path="/permissions" element={<ProtectedRoute requiredPage="Permission Entry"><SidebarLayout><PermissionEntry /></SidebarLayout></ProtectedRoute>} />
              <Route path="/inventory" element={<ProtectedRoute requiredPage="Inventory"><SidebarLayout><Inventory /></SidebarLayout></ProtectedRoute>} />
              <Route path="/distribution-status" element={<ProtectedRoute requiredPage="Distribution Status"><SidebarLayout><DistributionStatus /></SidebarLayout></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
