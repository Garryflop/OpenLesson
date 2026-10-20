import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import NotFoundPage from "./pages/NotFoundPage";
import type { Role } from "./api/types";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import SchedulePage from "./pages/SchedulePage";
import LessonPage from "./pages/LessonPage";
import MyLessonsPage from "./pages/MyLessonsPage";
import FeedbackListPage from "./pages/FeedbackListPage";
import FeedbackFormPage from "./pages/FeedbackFormPage";
import CheckinPage from "./pages/CheckinPage";
import NotificationsPage from "./pages/NotificationsPage";
import AdminSchedulePage from "./pages/admin/AdminSchedulePage";
import ControlPage from "./pages/admin/ControlPage";
import UsersPage from "./pages/admin/UsersPage";
import EmailsPage from "./pages/admin/EmailsPage";
import SettingsPage from "./pages/admin/SettingsPage";

// heavy chunks: SVG campus plans and charts
const MapPage = lazy(() => import("./pages/MapPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <img src="/aitu-emblem.png" alt="" className="size-12 animate-shimmer" />
      </div>
    );
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { has } = useAuth();
  return has(...roles) ? <>{children}</> : <Navigate to="/" replace />;
}

const MANAGERS: Role[] = ["admin", "methodist"];

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="lessons/:id" element={<LessonPage />} />
          <Route path="my-lessons" element={<MyLessonsPage />} />
          <Route path="feedback" element={<FeedbackListPage />} />
          <Route path="feedback/:id" element={<FeedbackFormPage />} />
          <Route path="checkin/:token" element={<CheckinPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="analytics" element={<RequireRole roles={["admin", "methodist", "dean", "leadership"]}><AnalyticsPage /></RequireRole>} />
          <Route path="admin/schedule" element={<RequireRole roles={MANAGERS}><AdminSchedulePage /></RequireRole>} />
          <Route path="admin/control" element={<RequireRole roles={MANAGERS}><ControlPage /></RequireRole>} />
          <Route path="admin/users" element={<RequireRole roles={["admin"]}><UsersPage /></RequireRole>} />
          <Route path="admin/emails" element={<RequireRole roles={MANAGERS}><EmailsPage /></RequireRole>} />
          <Route path="admin/settings" element={<RequireRole roles={MANAGERS}><SettingsPage /></RequireRole>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
