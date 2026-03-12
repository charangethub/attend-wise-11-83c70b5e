import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { SidebarLayout } from "@/components/SidebarLayout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import PendingApproval from "./pages/PendingApproval";
import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import AttendanceDashboard from "./pages/AttendanceDashboard";
import AbsenteeDashboard from "./pages/AbsenteeDashboard";
import AttendanceRecords from "./pages/AttendanceRecords";
import DailyAttendanceReport from "./pages/DailyAttendanceReport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
