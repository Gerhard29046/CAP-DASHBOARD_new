import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';

// Auth pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

// App pages
import AppLayout from '@/components/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Clients from '@/pages/Clients';
import ClientDetail from '@/pages/ClientDetail';
import AddClient from '@/pages/AddClient';
import MachineDetail from '@/pages/MachineDetail';
import UpcomingServices from '@/pages/UpcomingServices';
import ServiceRecords from "@/pages/ServiceRecords";
import BookIn from '@/pages/BookIn';
import JobCardDetail from '@/pages/JobCardDetail';
import UserAdmin from '@/pages/UserAdmin';
import InvoiceQueue from '@/pages/InvoiceQueue';
import RoleGuard from '@/components/RoleGuard';
import Jobs from '@/pages/Jobs';
import KnowledgeBase from '@/pages/KnowledgeBase';
import KnowledgeMachineForm from '@/pages/KnowledgeMachineForm';
import KnowledgeMachineDetail from '@/pages/KnowledgeMachineDetail';
import CalendarPage from '@/pages/CalendarPage';
import SystemSettings from '@/pages/SystemSettings';


const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<RoleGuard requiredPermission="dashboard.view"><Dashboard /></RoleGuard>} />
          <Route path="/clients" element={<RoleGuard requiredPermission="clients.view"><Clients /></RoleGuard>} />
          <Route path="/clients/new" element={<AddClient />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/machines/:id" element={<MachineDetail />} />
          <Route path="/upcoming-services" element={<RoleGuard requiredPermission="upcoming_services.view"><UpcomingServices /></RoleGuard>} />
          <Route path="/calendar" element={<RoleGuard requiredPermission="calendar.view"><CalendarPage /></RoleGuard>} />
          <Route path="/settings" element={<RoleGuard requiredPermission="calendar.google.view"><SystemSettings /></RoleGuard>} />
          <Route path="/service-records" element={<RoleGuard requiredPermission="services.view"><ServiceRecords /></RoleGuard>} />
          <Route path="/book-in" element={<RoleGuard requiredPermission="job_cards.create"><BookIn /></RoleGuard>} />
          <Route path="/jobs" element={<RoleGuard requiredPermission="job_cards.view"><Jobs /></RoleGuard>} />
          <Route path="/job-cards/:id" element={<JobCardDetail />} />
          <Route path="/invoice-queue" element={<RoleGuard requiredPermission="invoices.queue.view"><InvoiceQueue /></RoleGuard>} />
          <Route path="/admin/users" element={<RoleGuard requiredPermission="users.view"><UserAdmin /></RoleGuard>} />
          <Route path="/knowledge-base" element={<RoleGuard requiredPermission="knowledge_base.view"><KnowledgeBase /></RoleGuard>} />
          <Route path="/knowledge-base/new" element={<RoleGuard allowedRoles={["admin"]}><KnowledgeMachineForm /></RoleGuard>} />
          <Route path="/knowledge-base/:id" element={<KnowledgeMachineDetail />} />
          <Route path="/knowledge-base/:id/edit" element={<RoleGuard allowedRoles={["admin"]}><KnowledgeMachineForm /></RoleGuard>} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
