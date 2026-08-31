/**
 * Bug Condition Exploration Tests — Task 1
 * Spec: session-isolation-bugs
 *
 * These tests are written on UNFIXED code and are EXPECTED TO FAIL.
 * Failure confirms the bugs exist. Do NOT fix the code when these fail.
 *
 * Property 1: Bug Condition — Diagnostic Loop & Chat Leakage
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, renderHook } from '@testing-library/react';
import * as fc from 'fast-check';
import type { ReactNode } from 'react';

// ── Module mocks (must be at top level) ──────────────────────────────────────

// Mock Firebase so no real network calls are made
vi.mock('../services/firebase', () => ({
  escucharAutenticacion: vi.fn(),
  obtenerUsuario: vi.fn(),
  cerrarSesion: vi.fn(),
  auth: { currentUser: null },
  db: {},
}));

// Mock agentApi — the core of Bug 1 detection
vi.mock('../services/agentApi', () => ({
  agentApi: {
    startSession: vi.fn(),
    submitDiagnostic: vi.fn(),
    submitQuiz: vi.fn(),
    chat: vi.fn(),
    getSession: vi.fn(),
    health: vi.fn(),
  },
}));

// Mock persistenceService to avoid real Firestore calls
vi.mock('../services/persistenceService', () => ({
  leerEstadoSesion: vi.fn(),
  guardarEstadoSesion: vi.fn(),
  actualizarEstadoSesion: vi.fn(),
  leerHistorialChat: vi.fn(),
  guardarMensaje: vi.fn(),
  deserializarEstadoSesion: vi.fn(),
  serializarEstadoSesion: vi.fn(),
  sanitizarEstadoSesion: vi.fn(),
  clasificarErrorFirestore: vi.fn(),
  withRetry: vi.fn(),
  construirMensajeFirestore: vi.fn(),
}));

// Mock calendarService to avoid real Firestore calls
vi.mock('../services/calendarService', () => ({
  saveStudyCalendar: vi.fn(),
  subscribeToStudyCalendar: vi.fn(() => () => {}),
}));

// Mock hooks that make Firestore calls
vi.mock('../hooks/usePersistence', () => ({
  usePersistence: vi.fn(() => ({ persistError: null, clearPersistError: vi.fn() })),
}));

vi.mock('../hooks/useWeekProgress', () => ({
  useWeekProgress: vi.fn(() => ({ completedModules: new Set() })),
}));

vi.mock('../hooks/useDashboardStats', () => ({
  useDashboardStats: vi.fn(() => ({
    streakDays: 0,
    totalHoursThisWeek: 0,
    averageScore: 0,
    activeGoals: 0,
    loading: false,
  })),
}));

// Mock firebase/auth getAuth used inside components
vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>();
  return {
    ...actual,
    getAuth: vi.fn(() => ({ currentUser: null })),
  };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { agentApi } from '../services/agentApi';
import { escucharAutenticacion, obtenerUsuario } from '../services/firebase';
import { leerEstadoSesion, leerHistorialChat } from '../services/persistenceService';
import { AgentSessionProvider } from '../context/AgentSessionContext';
import { ChatHistoryProvider, useChatHistory } from '../context/ChatHistoryContext';
import App from '../App';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockedApi = vi.mocked(agentApi);
const mockedEscucharAutenticacion = vi.mocked(escucharAutenticacion);
const mockedObtenerUsuario = vi.mocked(obtenerUsuario);
const mockedLeerEstadoSesion = vi.mocked(leerEstadoSesion);
const mockedLeerHistorialChat = vi.mocked(leerHistorialChat);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wraps children in the same provider tree used by main.tsx */
function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AgentSessionProvider>
      <ChatHistoryProvider>
        {children}
      </ChatHistoryProvider>
    </AgentSessionProvider>
  );
}

/** Builds a minimal StartSessionResponse */
function makeStartSessionResponse(sessionId: string) {
  return {
    session_id: sessionId,
    message: 'Session started',
    diagnostic_questions: [
      {
        id: 'q1',
        category: 'React',
        question: 'What is JSX?',
        options: { A: 'JavaScript XML', B: 'Java', C: 'JSON', D: 'None' },
        correct_answer: 'A' as const,
        skill_tested: 'react-basics',
      },
    ],
  };
}

/** Builds a minimal DiagnosticSubmitResponse with diagnosticComplete = true */
function makeSubmitDiagnosticResponse(sessionId: string) {
  return {
    session_id: sessionId,
    diagnostic_complete: true,
    skill_scores: { react: 0.8 },
    strong_skills: ['react'],
    weak_skills: [],
    learning_roadmap: [],
    quiz_questions: [],
    current_week: 1,
    study_calendar: [], message: 'ok',
  };
}

/** Builds a mock Firebase user object */
function makeFirebaseUser(uid: string) {
  return {
    uid,
    email: `${uid}@test.com`,
    displayName: null,
  };
}

/** Builds a mock Firestore user document */
function makeUsuarioDoc(uid: string) {
  return {
    cuenta: `${uid}@test.com`,
    nombre: 'Test',
    apellido: 'User',
    edad: '1990-01-01',
    intereses: [],
    idsCursos: [],
    createdAt: null,
  };
}

// ── Bug 1: Diagnostic Loop Exploration Test ───────────────────────────────────

/**
 * Bug 1 — Diagnostic Loop Exploration Tests
 *
 * The bug is in App.tsx: `startSessionFiredRef.current = false` is set inside
 * the Firebase Auth observer's restore block (the page-reload path). This means
 * that on page reload, the ref is reset to false BEFORE startSession fires.
 * After startSession fires and sets startSessionFiredRef=true, if the Auth
 * observer fires again (e.g., due to React StrictMode effect cleanup+remount),
 * the ref is reset to false again. Since sesion is null during the cleanup phase
 * (StrictMode unmounts and remounts), the restore block runs again, resets the
 * ref, and startSession fires a second time.
 *
 * The concrete failing case: React StrictMode unmounts and remounts the App
 * component. During the remount, the Auth observer effect re-runs. The observer
 * fires with the authenticated user. sesion is null (state was reset on unmount).
 * The restore block runs, resets startSessionFiredRef=false, and startSession
 * fires again — even though it already fired during the first mount.
 *
 * Test approach: simulate two full mount cycles (StrictMode behavior) and assert
 * startSession is called exactly once total.
 */
describe('Bug 1 — Diagnostic Loop Exploration (EXPECTED TO FAIL on unfixed code)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockedLeerEstadoSesion.mockResolvedValue(null);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  /**
   * Property 1a — Bug Condition: startSession called at most once per account session.
   *
   * Scenario: page reload → Auth observer fires → startSession fires once →
   * Auth observer fires again (StrictMode remount, sesion reset to null) →
   * restore block resets startSessionFiredRef=false → startSession fires again.
   *
   * On UNFIXED code: startSession is called TWICE.
   * On FIXED code: startSession is called exactly ONCE.
   *
   * EXPECTED OUTCOME on unfixed code: FAIL
   * Counterexample: "startSession mock called 2 times instead of 1"
   *
   * Validates: Requirements 1.1, 1.2
   */
  it('Property 1a: startSession is called exactly once across two Auth observer invocations with sesion=null', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (sessionId) => {
          vi.clearAllMocks();
          sessionStorage.clear();
          mockedLeerEstadoSesion.mockResolvedValue(null);

          mockedApi.startSession.mockResolvedValue(makeStartSessionResponse(sessionId));

          const uid = `user-${sessionId.slice(0, 8)}`;
          const firebaseUser = makeFirebaseUser(uid);
          const usuarioDoc = makeUsuarioDoc(uid);

          // The Auth observer fires twice with sesion=null each time.
          // This simulates StrictMode: effect cleanup resets state, then remount
          // re-runs the effect. Both times sesion is null, so the restore block
          // runs both times, resetting startSessionFiredRef=false both times.
          const authCallbacks: Array<(user: any) => void> = [];
          mockedEscucharAutenticacion.mockImplementation((callback) => {
            authCallbacks.push(callback);
            setTimeout(() => callback(firebaseUser as any), 0);
            return vi.fn();
          });

          mockedObtenerUsuario.mockResolvedValue(usuarioDoc);

          // First mount
          const { unmount } = render(
            <AgentSessionProvider>
              <ChatHistoryProvider>
                <App />
              </ChatHistoryProvider>
            </AgentSessionProvider>
          );

          await act(async () => {
            await new Promise((r) => setTimeout(r, 80));
          });

          // Unmount (StrictMode cleanup) — React resets component state
          unmount();

          // Second mount (StrictMode remount) — fresh state, sesion=null again
          render(
            <AgentSessionProvider>
              <ChatHistoryProvider>
                <App />
              </ChatHistoryProvider>
            </AgentSessionProvider>
          );

          await act(async () => {
            await new Promise((r) => setTimeout(r, 80));
          });

          // ASSERTION: startSession must have been called exactly once total.
          // On UNFIXED code this FAILS: called twice (once per mount cycle).
          expect(mockedApi.startSession).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 3 }
    );
  });

  /**
   * Property 1b — Bug Condition: startSessionFiredRef stays true after the
   * Auth observer's restore block runs.
   *
   * Direct test: render App, let the Auth observer fire and startSession complete.
   * Then unmount and remount (simulating StrictMode). The second mount triggers
   * the Auth observer again with sesion=null, which runs the restore block and
   * resets startSessionFiredRef=false. Assert startSession is still called only once.
   *
   * On UNFIXED code: startSession is called a second time after remount.
   * On FIXED code: startSessionFiredRef stays true (or the diagnosticComplete guard
   *   prevents the second call).
   *
   * EXPECTED OUTCOME on unfixed code: FAIL
   * Counterexample: "startSessionFiredRef.current is false after Auth observer
   *   restore block — startSession was called 2 times across mount cycles"
   *
   * Validates: Requirements 1.1, 1.2
   */
  it('Property 1b: startSession call count does not increase after unmount+remount cycle', async () => {
    const sessionId = 'test-session-bug1b';
    const uid = 'user-bug1b';

    mockedApi.startSession.mockResolvedValue(makeStartSessionResponse(sessionId));

    mockedEscucharAutenticacion.mockImplementation((callback) => {
      setTimeout(() => callback(makeFirebaseUser(uid) as any), 0);
      return vi.fn();
    });

    mockedObtenerUsuario.mockResolvedValue(makeUsuarioDoc(uid));

    // First mount
    const { unmount } = render(
      <AgentSessionProvider>
        <ChatHistoryProvider>
          <App />
        </ChatHistoryProvider>
      </AgentSessionProvider>
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    const callCountAfterFirstMount = mockedApi.startSession.mock.calls.length;

    // Unmount (StrictMode cleanup)
    unmount();

    // Remount with fresh providers (StrictMode remount — state is reset)
    render(
      <AgentSessionProvider>
        <ChatHistoryProvider>
          <App />
        </ChatHistoryProvider>
      </AgentSessionProvider>
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    const callCountAfterRemount = mockedApi.startSession.mock.calls.length;

    // ASSERTION: call count must not increase after remount.
    // On UNFIXED code this FAILS: startSession is called again on remount because
    // the Auth observer's restore block resets startSessionFiredRef=false.
    expect(callCountAfterRemount).toBe(callCountAfterFirstMount);
    expect(callCountAfterRemount).toBe(1);
  });
});

// ── Bug 2: Chat History Leakage Exploration Test ──────────────────────────────

describe('Bug 2 — Chat History Leakage Exploration (EXPECTED TO FAIL on unfixed code)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 1c — Bug Condition: ChatHistoryProvider resets on logout.
   *
   * Scenario:
   * 1. User A loads 5 messages via cargarHistorial(uidA).
   * 2. Logout flow is simulated WITHOUT calling resetChatHistory (unfixed behavior).
   * 3. cargarHistorial(uidB) is called for User B.
   * 4. Assert messages.length === 0 before User B's history loads.
   *
   * On UNFIXED code: historyLoaded === true blocks the reload, User A's 5 messages remain.
   * On FIXED code: resetChatHistory() clears state, cargarHistorial(uidB) loads fresh.
   *
   * EXPECTED OUTCOME on unfixed code: FAIL
   * Counterexample: "messages still contains 5 User A messages after logout;
   *   historyLoaded stays true, cargarHistorial returns immediately for User B"
   *
   * Validates: Requirements 1.3, 1.4, 1.5
   */
  it('Property 1c: messages are empty before User B history loads after logout (no resetChatHistory)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // uidA
        fc.uuid(), // uidB
        fc.integer({ min: 1, max: 10 }), // number of User A messages
        async (uidA, uidB, messageCount) => {
          // Skip if uids happen to be equal (degenerate case)
          fc.pre(uidA !== uidB);

          vi.clearAllMocks();

          // Build User A's messages
          const userAMessages = Array.from({ length: messageCount }, (_, i) => ({
            id: `msg-a-${i}`,
            role: 'user' as const,
            content: `User A message ${i}`,
            timestamp: new Date(Date.now() + i * 1000).toISOString(),
          }));

          // leerHistorialChat returns User A's messages for uidA,
          // and an empty array for uidB (User B has no history yet)
          mockedLeerHistorialChat.mockImplementation(async (uid: string) => {
            if (uid === uidA) return userAMessages;
            return [];
          });

          // Render ChatHistoryProvider and get the context value
          let capturedContext: ReturnType<typeof useChatHistory> | null = null;

          function ContextCapture() {
            capturedContext = useChatHistory();
            return null;
          }

          await act(async () => {
            renderHook(() => useChatHistory(), {
              wrapper: ({ children }: { children: ReactNode }) => (
                <ChatHistoryProvider>
                  <ContextCapture />
                  {children}
                </ChatHistoryProvider>
              ),
            });
          });

          // Step 1: Load User A's history
          await act(async () => {
            await capturedContext!.cargarHistorial(uidA);
          });

          // Verify User A's messages are loaded
          expect(capturedContext!.messages).toHaveLength(messageCount);
          expect(capturedContext!.historyLoaded).toBe(true);

          // Step 2: Simulate logout WITHOUT calling resetChatHistory (unfixed behavior).
          // In the unfixed code, App.tsx's logout handler does NOT call resetChatHistory().
          // We do NOT call capturedContext!.resetChatHistory() here — it doesn't exist yet.
          // The state remains: messages = userAMessages, historyLoaded = true.

          // Step 3: Call cargarHistorial(uidB) for User B.
          // On unfixed code: historyLoaded === true → returns immediately, messages unchanged.
          await act(async () => {
            await capturedContext!.cargarHistorial(uidB);
          });

          // ASSERTION: messages must be empty before User B's history loads.
          // On UNFIXED code this FAILS: messages still contains User A's messages
          // because historyLoaded === true caused cargarHistorial to return immediately.
          expect(capturedContext!.messages).toHaveLength(0);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property 1d — Bug Condition: historyLoaded is false after logout.
   *
   * On UNFIXED code: historyLoaded stays true after logout (no reset).
   * On FIXED code: resetChatHistory() sets historyLoaded = false.
   *
   * EXPECTED OUTCOME on unfixed code: FAIL
   * Counterexample: "historyLoaded is true after logout, cargarHistorial
   *   returns immediately for User B without loading their data"
   *
   * Validates: Requirements 1.3, 1.5
   */
  it('Property 1d: historyLoaded is false after logout (no resetChatHistory called)', async () => {
    const uidA = 'user-a-bug2d';
    const uidB = 'user-b-bug2d';

    const userAMessages = Array.from({ length: 5 }, (_, i) => ({
      id: `msg-${i}`,
      role: 'user' as const,
      content: `Message ${i}`,
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
    }));

    mockedLeerHistorialChat.mockImplementation(async (uid: string) => {
      if (uid === uidA) return userAMessages;
      return [];
    });

    let capturedContext: ReturnType<typeof useChatHistory> | null = null;

    function ContextCapture() {
      capturedContext = useChatHistory();
      return null;
    }

    await act(async () => {
      renderHook(() => useChatHistory(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <ChatHistoryProvider>
            <ContextCapture />
            {children}
          </ChatHistoryProvider>
        ),
      });
    });

    // Load User A's history
    await act(async () => {
      await capturedContext!.cargarHistorial(uidA);
    });

    expect(capturedContext!.historyLoaded).toBe(true);
    expect(capturedContext!.messages).toHaveLength(5);

    // Simulate logout WITHOUT resetChatHistory (unfixed behavior).
    // historyLoaded remains true.

    // ASSERTION: historyLoaded must be false after logout so User B can load their data.
    // On UNFIXED code this FAILS: historyLoaded is still true.
    expect(capturedContext!.historyLoaded).toBe(false);
  });
});
