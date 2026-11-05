import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { ChaptersPage } from './pages/Chapters';
import { ChapterPage } from './pages/Chapter';
import { ReviewPage } from './pages/Review';
import { PracticePage } from './pages/Practice';
import { DrillsPage } from './pages/Drills';
import { ExamPage } from './pages/Exam';
import { ProgressPage } from './pages/Progress';
import { SnippetsPage } from './pages/Snippets';
import { CustomCardsPage } from './pages/CustomCards';
import { SettingsPage } from './pages/Settings';
import { SearchPage } from './pages/Search';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function App() {
  const { user, ready } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={ready && user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="temario" element={<ChaptersPage />} />
        <Route path="capitulo/:id" element={<ChapterPage />} />
        <Route path="capitulo/:id/:tab" element={<ChapterPage />} />
        <Route path="repaso" element={<ReviewPage />} />
        <Route path="practica" element={<PracticePage />} />
        <Route path="drills" element={<DrillsPage />} />
        <Route path="examen" element={<ExamPage />} />
        <Route path="progreso" element={<ProgressPage />} />
        <Route path="snippets" element={<SnippetsPage />} />
        <Route path="mis-tarjetas" element={<CustomCardsPage />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="buscar" element={<SearchPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
