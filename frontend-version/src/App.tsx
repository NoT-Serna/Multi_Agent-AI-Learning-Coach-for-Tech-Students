import { useState, useEffect } from 'react';
import Sidebar, { type TabId } from './components/Sidebar';
import Header from './components/Header';
import StatsCards from './components/StatsCards';
import WeeklyPlan from './components/WeeklyPlan';
import GoalsProgress from './components/GoalsProgress';
import CalendarWidget from './components/CalendarWidget';
import CoachChat from './components/CoachChat';
import FullScreenLoader from './components/FullScreenLoader';
import CalendarioPage from './pages/CalendarioPage';
import ObjetivosPage from './pages/ObjetivosPage';
import RecursosPage from './pages/RecursosPage';
import CoachIAPage from './pages/CoachIAPage';
import DiagnosticPage from './pages/DiagnosticPage';
import AjustesPage from './pages/AjustesPage';
import SignUpPage from './pages/SignUpPage';
import LoginPage from './pages/LoginPage';
import { useAgentSession } from './context/AgentSessionContext';
import { cursosDisponibles } from './data/cursos';
import type { SignUpResult, Usuario } from './types/auth';

type AuthScreen = 'login' | 'signup';

const titles: Record<TabId, string> = {
  dashboard: 'Dashboard',
  calendario: 'Calendario',
  objetivos: 'Objetivos',
  recursos: 'Recursos',
  coach: 'Coach IA',
  ajustes: 'Ajustes',
};

function DashboardView() {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">
          ¡Buen día! Llevas 12 días de racha
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Hoy tienes 2 sesiones programadas. Tu siguiente meta es completar el módulo de Context API.
        </p>
      </div>

      <StatsCards />

      <div className="grid grid-cols-3 gap-6 mt-6">
        <div className="col-span-2 space-y-6">
          <WeeklyPlan />
        </div>
        <div className="space-y-6">
          <GoalsProgress />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mt-6">
        <div className="col-span-2">
          <CoachChat />
        </div>
        <div>
          <CalendarWidget />
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [sesion, setSesion] = useState<SignUpResult | null>(null);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');

  const { session, startSession, clearError } = useAgentSession();

  // ── Trigger startSession when Firebase auth completes ──────────────────────
  useEffect(() => {
    if (!sesion || session.sessionId || session.loading || session.error) return;

    const userBackground = cursosDisponibles
      .filter((c) => (sesion.usuario.idsCursos as readonly number[]).includes(c.idCurso))
      .map((c) => c.titulo)
      .join(', ') || 'Sin cursos seleccionados';

    const userPreferences =
      (sesion.usuario.intereses as readonly string[]).join(', ') || 'Sin preferencias';

    startSession({
      student_name:    `${sesion.usuario.nombre} ${sesion.usuario.apellido}`,
      user_background: userBackground,
      user_preferences: userPreferences,
      student_id:      String(sesion.usuario.id),
    });
  }, [sesion, session.sessionId, session.loading, session.error, startSession]);

  // ── Rehydration / loading guard ────────────────────────────────────────────
  if (session.hydrating) {
    return <FullScreenLoader message="Restaurando tu sesión de aprendizaje…" />;
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!sesion) {
    if (authScreen === 'signup') {
      return (
        <SignUpPage
          onSignUp={setSesion}
          onSwitchToLogin={() => setAuthScreen('login')}
        />
      );
    }
    return (
      <LoginPage
        onLogin={setSesion}
        onSwitchToSignUp={() => setAuthScreen('signup')}
      />
    );
  }

  // ── Agent session starting ─────────────────────────────────────────────────
  if (session.loading) {
    return <FullScreenLoader message="Iniciando tu sesión de aprendizaje… (esto puede tardar hasta 2 minutos)" />;
  }

  // ── startSession error ─────────────────────────────────────────────────────
  if (session.error && !session.sessionId) {
    const isNetworkError =
      session.error === 'Failed to fetch' ||
      session.error.includes('NetworkError') ||
      session.error.includes('backend') ||
      session.error.includes('servidor') ||
      session.error.includes('tiempo');

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-6">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-red-100 shadow-sm p-8 text-center">
          <p className="text-sm font-medium text-red-600 mb-2">
            {isNetworkError
              ? 'No se pudo conectar con el servidor. Verifica que el backend esté activo.'
              : session.error}
          </p>
          <button
            onClick={() => {
              clearError();
              // Re-trigger the useEffect by resetting the session error
              // The effect will fire again because session.sessionId is still null
              const userBackground = cursosDisponibles
                .filter((c) => (sesion.usuario.idsCursos as readonly number[]).includes(c.idCurso))
                .map((c) => c.titulo)
                .join(', ') || 'Sin cursos seleccionados';
              startSession({
                student_name:    `${sesion.usuario.nombre} ${sesion.usuario.apellido}`,
                user_background: userBackground,
                user_preferences: (sesion.usuario.intereses as readonly string[]).join(', ') || 'Sin preferencias',
                student_id:      String(sesion.usuario.id),
              });
            }}
            className="mt-4 px-5 py-2 text-sm font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ── Diagnostic flow ────────────────────────────────────────────────────────
  if (session.diagnosticQuestions.length > 0 && !session.diagnosticComplete) {
    return <DiagnosticPage />;
  }

  // ── Main dashboard ─────────────────────────────────────────────────────────
  const actualizarUsuario = (u: Usuario) => {
    setSesion({ ...sesion, usuario: u });
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar activeTab={tab} onChange={setTab} />

      <div className="flex-1 flex flex-col">
        <Header title={titles[tab]} />

        <main className="flex-1 p-6 overflow-y-auto">
          {tab === 'dashboard' && <DashboardView />}
          {tab === 'calendario' && <CalendarioPage />}
          {tab === 'objetivos' && <ObjetivosPage />}
          {tab === 'recursos' && <RecursosPage />}
          {tab === 'coach' && <CoachIAPage />}
          {tab === 'ajustes' && (
            <AjustesPage usuario={sesion.usuario} onUpdateUsuario={actualizarUsuario} />
          )}
        </main>
      </div>
    </div>
  );
}
