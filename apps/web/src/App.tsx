import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Shell } from './components/Shell';
import { LandingPage } from './pages/LandingPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { TodayPage } from './pages/TodayPage';
import { WeekPage } from './pages/WeekPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { JoinPage } from './pages/JoinPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="app-shell"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/" replace state={{ from: location }} />;
  return children;
}

export function App() {
  const { ready, user, memberships } = useAuth();

  if (!ready) {
    return (
      <div className="app-shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/app" replace /> : <LandingPage />} />
      <Route path="/join/:token" element={<JoinPage />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/app/*"
        element={
          <RequireAuth>
            {memberships.length === 0 ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Shell>
                <Routes>
                  <Route path="today" element={<TodayPage />} />
                  <Route path="week" element={<WeekPage />} />
                  <Route path="history" element={<HistoryPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="today" replace />} />
                </Routes>
              </Shell>
            )}
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
