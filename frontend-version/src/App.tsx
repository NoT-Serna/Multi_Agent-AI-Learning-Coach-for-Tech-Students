import { useState, useEffect, useRef } from 'react';
import { getAuth } from 'firebase/auth';
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
import { useWeekProgress } from './hooks/useWeekProgress';
import { useDashboardStats } from './hooks/useDashboardStats';
import { usePersistence } from './hooks/usePersistence';
import ToastNotification from './components/ToastNotification';
import SlowConnectionBanner from './components/SlowConnectionBanner';
import { cursosDisponibles } from './data/cursos';
import type { SignUpResult, Usuario } from './types/auth';
import { escucharAutenticacion, obtenerUsuario, cerrarSesion } from './services/firebase';
import {
  leerEstadoSesion,
  deserializarEstadoSesion,
  clasificarErrorFirestore,
} from './services/persistenceService';

type AuthScreen = 'login' | 'signup';

const titles: Record<TabId, string> = {
  dashboard: 'Dashboard',
  calendario: 'Calendario',
  objetivos: 'Objetivos',
  recursos: 'Recursos',
  coach: 'Coach IA',
  ajustes: 'Ajustes',
};

interface DashboardViewProps {
  createdAt: string | null;
}

function DashboardView({ createdAt }: DashboardViewProps) {
  const { session } = useAgentSession();
  const uid = getAuth().currentUser?.uid ?? null;

  const { completedModules: completedModulesCurrentWeek } = useWeekProgress(uid, session.currentWeek);

  const { streakDays, totalHoursThisWeek, averageScore, activeGoals, loading: statsLoading } =
    useDashboardStats(uid, session, completedModulesCurrentWeek);

  const completedModulesByWeek: Record<number, Set<number>> = {
    [session.currentWeek]: completedModulesCurrentWeek,
  };

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">
          ¡Buen día! Llevas {streakDays} días de racha
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Hoy tienes 2 sesiones programadas. Tu siguiente meta es completar el módulo de Context API.
        </p>
      </div>

      <StatsCards
        streakDays={streakDays}
        totalHoursThisWeek={totalHoursThisWeek}
        averageScore={averageScore}
        activeGoals={activeGoals}
        loading={statsLoading}
      />

      <div className="grid grid-cols-3 gap-6 mt-6">
        <div className="col-span-2 space-y-6">
          <WeeklyPlan />
        </div>
        <div className="space-y-6">
          <GoalsProgress
            roadmap={session.learningRoadmap}
            completedWeeks={session.completedWeeks}
            completedModulesByWeek={completedModulesByWeek}
            createdAt={createdAt}
          />
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
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  // true mientras Firebase resuelve si hay sesión persistida
  const [authChecking, setAuthChecking] = useState(true);
  // true when the 5-second slow-connection timeout fires during restoration
  const [showSlowBanner, setShowSlowBanner] = useState(false);
  // Firestore read error during restoration (network / unknown)
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const { session, startSession, clearError, restoreSession, setHydrating } = useAgentSession();

  // Ref to track whether the restore was cancelled ("Continuar sin restaurar")
  const restoreCancelledRef = useRef(false);
  // Ref to the 5-second slow-connection timeout so we can clear it
  const slowBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to track whether the session was set by a fresh sign-up (not a page reload).
  // When true, the Firebase Auth observer should skip the Firestore restore flow
  // because startSession will be triggered directly by the startSession useEffect.
  const freshSignUpRef = useRef(false);

  // ── usePersistence: fire-and-forget writes to Firestore ───────────────────
  const uid = getAuth().currentUser?.uid ?? null;
  const { persistError, clearPersistError } = usePersistence({ uid, session });

  // ── Persistencia de sesión: escuchar Firebase Auth al arrancar ─────────────
  useEffect(() => {
    const unsub = escucharAutenticacion(async (firebaseUser) => {
      if (firebaseUser) {
        // Usuario autenticado (sesión persistida o recién logueado)
        // Si ya tenemos sesion en estado, no sobreescribir
        if (!sesion) {
          // If this auth event was triggered by a fresh sign-up (not a page reload),
          // skip the Firestore restore flow entirely. The startSession useEffect will
          // fire once sesion is set and hydrating is false.
          if (freshSignUpRef.current) {
            setAuthChecking(false);
            return;
          }

          try {
            const datos = await obtenerUsuario(firebaseUser.uid);
            if (datos) {
              const usuario: Usuario = {
                id: firebaseUser.uid as unknown as number,
                cuenta: datos.cuenta ?? firebaseUser.email ?? '',
                nombre: datos.nombre ?? '',
                apellido: datos.apellido ?? '',
                edad: datos.edad ?? '',
                intereses: datos.intereses ?? [],
                idsCursos: datos.idsCursos ?? [],
              };
              setSesion({
                auth: { cuenta: usuario.cuenta, contrasenaHash: '' },
                usuario,
              });
              // Extract createdAt from Firestore document (may be a Firestore Timestamp)
              const rawCreatedAt = datos.createdAt;
              const createdAtStr: string | null =
                rawCreatedAt?.toDate?.()?.toISOString?.() ??
                (typeof rawCreatedAt === 'string' ? rawCreatedAt : null);
              setCreatedAt(createdAtStr);

              // ── Task 8.1: Firestore session restoration ──────────────────
              restoreCancelledRef.current = false;
              setHydrating(true);

              // Start the 5-second slow-connection banner timer
              slowBannerTimerRef.current = setTimeout(() => {
                setShowSlowBanner(true);
              }, 5000);

              try {
                const estadoSesion = await leerEstadoSesion(firebaseUser.uid);

                // If the restore was cancelled by the user, do nothing
                if (restoreCancelledRef.current) return;

                // Clear the slow-connection timer
                if (slowBannerTimerRef.current) {
                  clearTimeout(slowBannerTimerRef.current);
                  slowBannerTimerRef.current = null;
                }
                setShowSlowBanner(false);

                if (estadoSesion !== null && estadoSesion.diagnosticComplete === true) {
                  // Restore the session from Firestore
                  restoreSession(deserializarEstadoSesion(estadoSesion));
                  setHydrating(false);
                } else {
                  // No session or diagnostic not complete — let startSession useEffect handle it
                  setHydrating(false);
                }
              } catch (err) {
                if (restoreCancelledRef.current) return;

                // Clear the slow-connection timer
                if (slowBannerTimerRef.current) {
                  clearTimeout(slowBannerTimerRef.current);
                  slowBannerTimerRef.current = null;
                }
                setShowSlowBanner(false);

                const classification = clasificarErrorFirestore(err);
                if (classification === 'not-found') {
                  // Treat as no session — let startSession handle it
                  setHydrating(false);
                } else {
                  // network or unknown — show recoverable error state
                  const message =
                    err instanceof Error
                      ? err.message
                      : 'Error al restaurar la sesión desde Firestore.';
                  setRestoreError(message);
                  setHydrating(false);
                }
              }
            }
          } catch (err) {
            console.error('Error al restaurar sesión desde Firestore:', err);
            setHydrating(false);
          }
        }
      } else {
        // No autenticado
        setSesion(null);
      }
      setAuthChecking(false);
    });

    return () => {
      unsub();
      // Clean up the slow-connection timer on unmount
      if (slowBannerTimerRef.current) {
        clearTimeout(slowBannerTimerRef.current);
      }
    };
    // Solo al montar — sesion intencionalmente excluida para no re-ejecutar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Trigger startSession when Firebase auth completes ──────────────────────
  useEffect(() => {
    // Wait until hydration is done before deciding whether to start a new session.
    // This covers the new-account case: Firebase Auth fires escucharAutenticacion,
    // which sets hydrating=true, reads Firestore (finds nothing for a brand-new user),
    // then sets hydrating=false — at that point this effect re-runs and starts the session.
    if (!sesion || session.sessionId || session.loading || session.error || session.hydrating) return;

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
  // session.hydrating is intentionally included so the effect re-runs when
  // hydration finishes (hydrating: true → false) for brand-new accounts.
  }, [sesion, session.sessionId, session.loading, session.error, session.hydrating, startSession]);

  // ── Esperar a que Firebase resuelva el estado de auth ─────────────────────
  if (authChecking) {
    return <FullScreenLoader message="Verificando sesión…" />;
  }

  // ── Rehydration / loading guard ────────────────────────────────────────────
  if (session.hydrating) {
    return <FullScreenLoader message="Restaurando tu sesión de aprendizaje…" />;
  }

  // ── Firestore restore error (network / unknown) ────────────────────────────
  if (restoreError) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-6">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-red-100 shadow-sm p-8 text-center">
          <p className="text-sm font-medium text-red-600 mb-2">
            No se pudo restaurar tu sesión. Puedes recargar la página o continuar sin restaurar.
          </p>
          <div className="flex flex-col gap-2 mt-4">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 text-sm font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
            >
              Recargar
            </button>
            <button
              onClick={() => {
                setRestoreError(null);
                // startSession useEffect will fire since session.sessionId is null
              }}
              className="px-5 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
            >
              Continuar sin restaurar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!sesion) {
    if (authScreen === 'signup') {
      return (
        <SignUpPage
          onSignUp={(result) => {
            freshSignUpRef.current = true;
            setSesion(result);
          }}
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
    return <FullScreenLoader message="Iniciando tu sesión de aprendizaje… (esto puede tardar hasta 5 minutos)" />;
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
    return (
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar
          activeTab={tab}
          onChange={setTab}
          userName={`${sesion.usuario.nombre} ${sesion.usuario.apellido}`.trim()}
          userEmail={sesion.usuario.cuenta}
          onLogout={async () => {
            await cerrarSesion();
            setSesion(null);
          }}
        />
        <div className="flex-1 flex flex-col overflow-y-auto">
          <DiagnosticPage />
        </div>
      </div>
    );
  }

  // ── Main dashboard ─────────────────────────────────────────────────────────
  const actualizarUsuario = (u: Usuario) => {
    setSesion({ ...sesion, usuario: u });
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Task 8.2: Slow connection banner — shown when 5s timeout fires */}
      <SlowConnectionBanner
        visible={showSlowBanner}
        onWait={() => {
          // Hide the banner, keep waiting for the restore to complete
          setShowSlowBanner(false);
        }}
        onContinueWithoutRestore={() => {
          // Cancel the restore, hide the banner, let startSession run
          restoreCancelledRef.current = true;
          if (slowBannerTimerRef.current) {
            clearTimeout(slowBannerTimerRef.current);
            slowBannerTimerRef.current = null;
          }
          setShowSlowBanner(false);
          setHydrating(false);
          // startSession useEffect will fire because session.sessionId is still null
        }}
      />

      <Sidebar
        activeTab={tab}
        onChange={setTab}
        userName={`${sesion.usuario.nombre} ${sesion.usuario.apellido}`.trim()}
        userEmail={sesion.usuario.cuenta}
        onLogout={async () => {
          await cerrarSesion();
          setSesion(null);
        }}
      />

      <div className="flex-1 flex flex-col">
        <Header title={titles[tab]} />

        <main className="flex-1 p-6 overflow-y-auto">
          {tab === 'dashboard' && <DashboardView createdAt={createdAt} />}
          {tab === 'calendario' && <CalendarioPage />}
          {tab === 'objetivos' && <ObjetivosPage />}
          {tab === 'recursos' && <RecursosPage />}
          {tab === 'coach' && <CoachIAPage />}
          {tab === 'ajustes' && (
            <AjustesPage usuario={sesion.usuario} onUpdateUsuario={actualizarUsuario} />
          )}
        </main>
      </div>

      {/* Task 8.2: Toast notification for Firestore write errors */}
      <ToastNotification
        message={persistError ?? ''}
        type="error"
        visible={persistError !== null}
        onDismiss={clearPersistError}
      />
    </div>
  );
}
