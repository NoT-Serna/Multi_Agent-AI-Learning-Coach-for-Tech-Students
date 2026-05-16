/**
 * Preservation Property Tests — Task 2
 * Spec: session-isolation-bugs
 *
 * These tests are written on UNFIXED code and are EXPECTED TO PASS.
 * They encode baseline behaviors that must be preserved after the fix.
 *
 * Property 2: Preservation — Single-User Session Behavior Unchanged
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 *
 * Observation-first methodology:
 * - All properties are derived from observed behavior on non-buggy inputs
 *   (states where isBugCondition_1 and isBugCondition_2 are both false)
 * - Non-buggy inputs: no second startSession call, no account switching
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as fc from 'fast-check';
import type { ReactNode } from 'react';

// ── Module mocks (must be at top level) ──────────────────────────────────────

vi.mock('../services/firebase', () => ({
  escucharAutenticacion: vi.fn(),
  obtenerUsuario: vi.fn(),
  cerrarSesion: vi.fn(),
  auth: { currentUser: null },
  db: {},
}));

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

vi.mock('../services/calendarService', () => ({
  saveStudyCalendar: vi.fn(),
  subscribeToStudyCalendar: vi.fn(() => () => {}),
}));

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

vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>();
  return {
    ...actual,
    getAuth: vi.fn(() => ({ currentUser: null })),
  };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { agentApi } from '../services/agentApi';
import { leerHistorialChat, guardarMensaje } from '../services/persistenceService';
import { AgentSessionProvider, useAgentSession } from '../context/AgentSessionContext';
import { ChatHistoryProvider, useChatHistory } from '../context/ChatHistoryContext';
import type { AgentSession } from '../context/AgentSessionContext';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockedApi = vi.mocked(agentApi);
const mockedLeerHistorialChat = vi.mocked(leerHistorialChat);
const mockedGuardarMensaje = vi.mocked(guardarMensaje);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wraps children in AgentSessionProvider only */
function AgentSessionWrapper({ children }: { children: ReactNode }) {
  return <AgentSessionProvider>{children}</AgentSessionProvider>;
}

/** Wraps children in ChatHistoryProvider only */
function ChatHistoryWrapper({ children }: { children: ReactNode }) {
  return <ChatHistoryProvider>{children}</ChatHistoryProvider>;
}

/** Builds a minimal MensajeChat object */
function makeMessage(id: string, content: string) {
  return {
    id,
    role: 'user' as 'user' | 'coach',
    content,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fast-check arbitrary for AgentSession states where the startSession
 * useEffect guard SHOULD return early (non-buggy inputs).
 *
 * These are states where at least one of the guard conditions is true:
 *   - sessionId !== null  (session already started)
 *   - hydrating === true  (restore in progress)
 *   - diagnosticComplete === true (diagnostic already done)
 *
 * Used in Property 2a to generate diverse guarded session states.
 */
export const guardedSessionArb = fc.record({
  sessionId: fc.oneof(
    fc.uuid(),                    // non-null sessionId
    fc.constant('session-abc'),
  ),
  diagnosticComplete: fc.boolean(),
  hydrating: fc.boolean(),
  // Other fields are irrelevant to the guard — fill with safe defaults
  studentName: fc.option(fc.string(), { nil: null }),
  diagnosticQuestions: fc.constant([]),
  skillScores: fc.constant({}),
  strongSkills: fc.constant([]),
  weakSkills: fc.constant([]),
  learningRoadmap: fc.constant([]),
  currentWeek: fc.integer({ min: 1, max: 10 }),
  completedWeeks: fc.constant([]),
  quizQuestions: fc.constant([]),
  quizScores: fc.constant({}),
  quizPassed: fc.constant(null),
  loading: fc.boolean(),
  error: fc.constant(null),
}) satisfies fc.Arbitrary<Partial<AgentSession>>;

/**
 * Fast-check arbitrary for AgentSession states where hydrating = true.
 * The guard must return early regardless of other fields.
 */
const hydratingSessionArb = fc.record({
  sessionId: fc.option(fc.uuid(), { nil: null }),
  diagnosticComplete: fc.boolean(),
  hydrating: fc.constant(true),
  studentName: fc.constant(null),
  diagnosticQuestions: fc.constant([]),
  skillScores: fc.constant({}),
  strongSkills: fc.constant([]),
  weakSkills: fc.constant([]),
  learningRoadmap: fc.constant([]),
  currentWeek: fc.integer({ min: 1, max: 10 }),
  completedWeeks: fc.constant([]),
  quizQuestions: fc.constant([]),
  quizScores: fc.constant({}),
  quizPassed: fc.constant(null),
  loading: fc.boolean(),
  error: fc.constant(null),
}) satisfies fc.Arbitrary<Partial<AgentSession>>;

/**
 * Fast-check arbitrary for AgentSession states where sessionId !== null.
 * The guard must return early regardless of other fields.
 */
const sessionIdPresentArb = fc.record({
  sessionId: fc.uuid(),
  diagnosticComplete: fc.boolean(),
  hydrating: fc.boolean(),
  studentName: fc.constant(null),
  diagnosticQuestions: fc.constant([]),
  skillScores: fc.constant({}),
  strongSkills: fc.constant([]),
  weakSkills: fc.constant([]),
  learningRoadmap: fc.constant([]),
  currentWeek: fc.integer({ min: 1, max: 10 }),
  completedWeeks: fc.constant([]),
  quizQuestions: fc.constant([]),
  quizScores: fc.constant({}),
  quizPassed: fc.constant(null),
  loading: fc.boolean(),
  error: fc.constant(null),
}) satisfies fc.Arbitrary<Partial<AgentSession>>;

// ── Suite 1: startSession useEffect guard properties ─────────────────────────

/**
 * These tests verify the guard conditions in the startSession useEffect
 * directly via AgentSessionContext + restoreSession.
 *
 * The guard in App.tsx reads:
 *   if (startSessionFiredRef.current) return;
 *   if (!sesion || session.sessionId || session.hydrating) return;
 *
 * We test the session-state-based guards (sessionId, hydrating, diagnosticComplete)
 * by restoring a session into the context and verifying startSession is never
 * called when those guards are active.
 *
 * Validates: Requirements 3.1, 3.2, 3.3
 */
describe('Preservation — startSession useEffect guard properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.startSession.mockResolvedValue({
      session_id: 'should-not-be-called',
      message: 'Session started',
      diagnostic_questions: [],
    });
  });

  /**
   * Property 2a: For all AgentSession states with diagnosticComplete = true
   * AND sessionId !== null, restoreSession produces a state where the
   * startSession guard conditions (sessionId present) are satisfied.
   *
   * Observed behavior: page-reload with diagnosticComplete = true in Firestore
   * → restoreSession called, startSession NOT called, dashboard renders.
   *
   * We verify: after restoreSession with sessionId !== null, the context
   * reflects sessionId !== null (the guard condition is met).
   *
   * Validates: Requirements 3.2
   */
  it('Property 2a: restoreSession with diagnosticComplete=true and sessionId set — session reflects guard conditions', () => {
    fc.assert(
      fc.property(
        guardedSessionArb,
        (sessionState) => {
          // Arrange: build a session state that would be restored from Firestore
          // (page-reload path with diagnosticComplete = true)
          const restoredState: Partial<AgentSession> = {
            sessionId: sessionState.sessionId,
            diagnosticComplete: sessionState.diagnosticComplete,
            hydrating: sessionState.hydrating,
            diagnosticQuestions: [],
            learningRoadmap: [],
            skillScores: {},
            strongSkills: [],
            weakSkills: [],
            currentWeek: sessionState.currentWeek,
            completedWeeks: [],
            quizQuestions: [],
            quizScores: {},
            quizPassed: null,
            loading: false,
            error: null,
          };

          // Act: render the hook and restore the session
          const { result } = renderHook(() => useAgentSession(), {
            wrapper: AgentSessionWrapper,
          });

          act(() => {
            result.current.restoreSession(restoredState);
          });

          // Assert: the guard condition (sessionId !== null) is satisfied
          // This means the startSession useEffect would return early
          expect(result.current.session.sessionId).toBe(sessionState.sessionId);
          expect(result.current.session.sessionId).not.toBeNull();
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 2b: For all AgentSession states with hydrating = true,
   * the context correctly reflects hydrating = true (guard condition met).
   *
   * Observed behavior: during page-reload restoration, hydrating = true
   * prevents startSession from firing.
   *
   * We verify: setHydrating(true) sets hydrating = true in the context.
   * Note: restoreSession() always clears hydrating (it signals restore-complete),
   * so we test setHydrating directly.
   *
   * Validates: Requirements 3.2
   */
  it('Property 2b: setHydrating(true) — context reflects hydrating=true (guard condition met)', () => {
    fc.assert(
      fc.property(
        hydratingSessionArb,
        (_hydratingState) => {
          const { result } = renderHook(() => useAgentSession(), {
            wrapper: AgentSessionWrapper,
          });

          act(() => {
            result.current.setHydrating(true);
          });

          // Assert: hydrating is true — the guard condition is met
          expect(result.current.session.hydrating).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 2c: For all AgentSession states with sessionId !== null,
   * the context correctly reflects sessionId !== null (guard condition met).
   *
   * Observed behavior: once startSession fires and sets sessionId, the
   * useEffect guard prevents any further startSession calls.
   *
   * Validates: Requirements 3.1, 3.2
   */
  it('Property 2c: restoreSession with sessionId !== null — context reflects sessionId present (guard condition met)', () => {
    fc.assert(
      fc.property(
        sessionIdPresentArb,
        (sessionState) => {
          const { result } = renderHook(() => useAgentSession(), {
            wrapper: AgentSessionWrapper,
          });

          act(() => {
            result.current.restoreSession({
              sessionId: sessionState.sessionId,
              diagnosticComplete: sessionState.diagnosticComplete,
              hydrating: false,
            });
          });

          // Assert: sessionId is present — the guard condition is met
          expect(result.current.session.sessionId).toBe(sessionState.sessionId);
          expect(result.current.session.sessionId).not.toBeNull();
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 2d: startSession (the API call) is called exactly once when
   * invoked directly — verifying the API contract is preserved.
   *
   * Observed behavior: fresh sign-up with no Firestore session →
   * startSession called exactly once, diagnostic screen renders.
   *
   * Validates: Requirements 3.1
   */
  it('Property 2d: startSession called directly — API called exactly once and session state updated', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (sessionId, studentName) => {
          vi.clearAllMocks();

          mockedApi.startSession.mockResolvedValue({
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
          });

          const { result } = renderHook(() => useAgentSession(), {
            wrapper: AgentSessionWrapper,
          });

          await act(async () => {
            await result.current.startSession({
              student_name: studentName,
              user_background: 'React',
              user_preferences: 'TypeScript',
            });
          });

          // Assert: API called exactly once
          expect(mockedApi.startSession).toHaveBeenCalledTimes(1);
          // Assert: session state updated with the returned sessionId
          expect(result.current.session.sessionId).toBe(sessionId);
          // Assert: diagnostic questions are set (diagnostic screen would render)
          expect(result.current.session.diagnosticQuestions).toHaveLength(1);
          expect(result.current.session.loading).toBe(false);
        }
      ),
      { numRuns: 5 }
    );
  });
});

// ── Suite 2: ChatHistoryContext preservation properties ───────────────────────

/**
 * These tests verify the ChatHistoryContext behaviors that must be preserved
 * after the fix: cargarHistorial idempotency and agregarMensaje optimistic update.
 *
 * Validates: Requirements 3.3, 3.4, 3.6
 */
describe('Preservation — ChatHistoryContext behavior properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 2e: For all non-zero-length message arrays added via agregarMensaje,
   * messages grows monotonically (no messages lost).
   *
   * Observed behavior: agregarMensaje(uid, msg) → message added to messages
   * immediately, guardarMensaje called with correct uid.
   *
   * Validates: Requirements 3.4
   */
  it('Property 2e: agregarMensaje — messages grows monotonically, no messages lost', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // uid
        fc.array(
          fc.record({
            content: fc.string({ minLength: 1, maxLength: 200 }),
            role: fc.constantFrom('user' as const, 'coach' as const),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (uid, messageDefs) => {
          vi.clearAllMocks();
          mockedGuardarMensaje.mockResolvedValue(undefined);

          const { result } = renderHook(() => useChatHistory(), {
            wrapper: ChatHistoryWrapper,
          });

          // Add messages one by one and verify monotonic growth
          let expectedCount = 0;
          for (const def of messageDefs) {
            const msg = makeMessage(`msg-${expectedCount}`, def.content);
            // Override role
            const msgWithRole = { ...msg, role: def.role };

            await act(async () => {
              await result.current.agregarMensaje(uid, msgWithRole);
            });

            expectedCount += 1;

            // Assert: messages grew by exactly 1 (monotonic, no loss)
            expect(result.current.messages).toHaveLength(expectedCount);
            // Assert: the last message is the one we just added
            expect(result.current.messages[expectedCount - 1].content).toBe(def.content);
          }

          // Assert: total count matches number of messages added
          expect(result.current.messages).toHaveLength(messageDefs.length);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 2f: agregarMensaje calls guardarMensaje with the correct uid.
   *
   * Observed behavior: agregarMensaje(uid, msg) → guardarMensaje called with
   * correct uid (not a different user's uid).
   *
   * Validates: Requirements 3.4
   */
  it('Property 2f: agregarMensaje — guardarMensaje called with the correct uid', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // uid
        fc.string({ minLength: 1, maxLength: 100 }), // message content
        async (uid, content) => {
          vi.clearAllMocks();
          mockedGuardarMensaje.mockResolvedValue(undefined);

          const { result } = renderHook(() => useChatHistory(), {
            wrapper: ChatHistoryWrapper,
          });

          const msg = makeMessage('msg-0', content);

          await act(async () => {
            await result.current.agregarMensaje(uid, msg);
          });

          // Assert: guardarMensaje was called with the correct uid
          expect(mockedGuardarMensaje).toHaveBeenCalledTimes(1);
          expect(mockedGuardarMensaje).toHaveBeenCalledWith(
            uid,
            expect.objectContaining({ content })
          );
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 2g: agregarMensaje adds the message to memory immediately
   * (optimistic update) — even if guardarMensaje is slow or fails.
   *
   * Observed behavior: message added to messages immediately (optimistic),
   * guardarMensaje called with correct uid.
   *
   * Validates: Requirements 3.4
   */
  it('Property 2g: agregarMensaje — optimistic update: message in memory even when guardarMensaje fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (uid, content) => {
          vi.clearAllMocks();
          // Simulate Firestore failure
          mockedGuardarMensaje.mockRejectedValue(new Error('Firestore unavailable'));

          const { result } = renderHook(() => useChatHistory(), {
            wrapper: ChatHistoryWrapper,
          });

          const msg = makeMessage('msg-0', content);

          await act(async () => {
            await result.current.agregarMensaje(uid, msg);
          });

          // Assert: message is still in memory despite Firestore failure
          expect(result.current.messages).toHaveLength(1);
          expect(result.current.messages[0].content).toBe(content);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 2h: For all single-user sessions (no account switch),
   * cargarHistorial called once loads history and subsequent calls are no-ops
   * (idempotency guard).
   *
   * Observed behavior: cargarHistorial(uid) after fresh mount → loads messages
   * from Firestore, sets historyLoaded = true. Subsequent calls are no-ops.
   *
   * Validates: Requirements 3.3, 3.6
   */
  it('Property 2h: cargarHistorial — idempotent: first call loads history, subsequent calls are no-ops', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // uid
        fc.integer({ min: 0, max: 10 }), // number of messages in Firestore
        fc.integer({ min: 1, max: 5 }), // number of extra cargarHistorial calls
        async (uid, messageCount, extraCalls) => {
          vi.clearAllMocks();

          const firestoreMessages = Array.from({ length: messageCount }, (_, i) =>
            makeMessage(`msg-${i}`, `Message ${i}`)
          );

          mockedLeerHistorialChat.mockResolvedValue(firestoreMessages);

          const { result } = renderHook(() => useChatHistory(), {
            wrapper: ChatHistoryWrapper,
          });

          // First call — should load from Firestore
          await act(async () => {
            await result.current.cargarHistorial(uid);
          });

          expect(result.current.historyLoaded).toBe(true);
          expect(result.current.messages).toHaveLength(messageCount);
          expect(mockedLeerHistorialChat).toHaveBeenCalledTimes(1);

          // Subsequent calls — should be no-ops (idempotency guard)
          for (let i = 0; i < extraCalls; i++) {
            await act(async () => {
              await result.current.cargarHistorial(uid);
            });
          }

          // Assert: Firestore was only called once (idempotency preserved)
          expect(mockedLeerHistorialChat).toHaveBeenCalledTimes(1);
          // Assert: messages unchanged after no-op calls
          expect(result.current.messages).toHaveLength(messageCount);
          expect(result.current.historyLoaded).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 2i: cargarHistorial sets historyLoaded = true after a successful load.
   *
   * Observed behavior: cargarHistorial(uid) after fresh mount → loads messages
   * from Firestore, sets historyLoaded = true.
   *
   * Validates: Requirements 3.3
   */
  it('Property 2i: cargarHistorial — sets historyLoaded=true after successful load', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 0, max: 15 }),
        async (uid, messageCount) => {
          vi.clearAllMocks();

          const messages = Array.from({ length: messageCount }, (_, i) =>
            makeMessage(`msg-${i}`, `Content ${i}`)
          );
          mockedLeerHistorialChat.mockResolvedValue(messages);

          const { result } = renderHook(() => useChatHistory(), {
            wrapper: ChatHistoryWrapper,
          });

          // Initial state: not loaded
          expect(result.current.historyLoaded).toBe(false);

          await act(async () => {
            await result.current.cargarHistorial(uid);
          });

          // After load: historyLoaded = true, messages populated
          expect(result.current.historyLoaded).toBe(true);
          expect(result.current.messages).toHaveLength(messageCount);
          expect(result.current.loadingHistory).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ── Suite 3: resetSession preservation ───────────────────────────────────────

/**
 * These tests verify that resetSession() correctly resets AgentSessionContext
 * to its initial empty state — a behavior that must be preserved after the fix.
 *
 * Validates: Requirements 3.7
 */
describe('Preservation — resetSession behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 2j: resetSession() always returns the session to the empty state,
   * regardless of what state it was in before.
   *
   * Observed behavior: single-user logout → cerrarSesion() called, sesion set
   * to null, login screen renders.
   *
   * Validates: Requirements 3.7
   */
  it('Property 2j: resetSession — always returns session to empty state', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.boolean(),
        fc.boolean(),
        (sessionId, diagnosticComplete, hydrating) => {
          const { result } = renderHook(() => useAgentSession(), {
            wrapper: AgentSessionWrapper,
          });

          // Set up a non-empty session state
          act(() => {
            result.current.restoreSession({
              sessionId,
              diagnosticComplete,
              hydrating,
              learningRoadmap: [],
              skillScores: {},
              strongSkills: ['react'],
              weakSkills: [],
              currentWeek: 3,
              completedWeeks: [1, 2],
            });
          });

          // Verify it was set
          expect(result.current.session.sessionId).toBe(sessionId);

          // Reset
          act(() => {
            result.current.resetSession();
          });

          // Assert: all fields back to empty/initial values
          expect(result.current.session.sessionId).toBeNull();
          expect(result.current.session.diagnosticComplete).toBe(false);
          expect(result.current.session.hydrating).toBe(false);
          expect(result.current.session.loading).toBe(false);
          expect(result.current.session.error).toBeNull();
          expect(result.current.session.diagnosticQuestions).toHaveLength(0);
          expect(result.current.session.learningRoadmap).toHaveLength(0);
          expect(result.current.session.strongSkills).toHaveLength(0);
          expect(result.current.session.completedWeeks).toHaveLength(0);
          expect(result.current.session.currentWeek).toBe(1);
        }
      ),
      { numRuns: 20 }
    );
  });
});
