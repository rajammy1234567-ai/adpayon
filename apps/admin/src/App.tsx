import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminLayout } from './components/layout/AdminLayout';
import { AdminLogin } from './pages/AdminLogin';
import { Dashboard } from './pages/Dashboard';
import { Campaigns } from './pages/Campaigns';
import { CreateEditCampaign } from './pages/CreateEditCampaign';
import { Tasks } from './pages/Tasks';
import { CreateEditTask } from './pages/CreateEditTask';
import { TaskCompletions } from './pages/TaskCompletions';
import { FraudReviewQueue } from './pages/FraudReviewQueue';
import { AuditLogs } from './pages/AuditLogs';
import { AdminProfile } from './pages/AdminProfile';
import { NewsManagement } from './pages/NewsManagement';
import { Loader2 } from 'lucide-react';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-obsidian-950 text-emerald-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<AdminLogin />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="campaigns" element={<Campaigns />} />
            <Route path="campaigns/new" element={<CreateEditCampaign />} />
            <Route path="campaigns/:id/edit" element={<CreateEditCampaign />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="tasks/new" element={<CreateEditTask />} />
            <Route path="tasks/:id/edit" element={<CreateEditTask />} />
            <Route path="completions" element={<TaskCompletions />} />
            <Route path="fraud-queue" element={<FraudReviewQueue />} />
            <Route path="news" element={<NewsManagement />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="profile" element={<AdminProfile />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};
export default App;
