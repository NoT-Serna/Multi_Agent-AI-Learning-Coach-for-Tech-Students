/**
 * Fix Verification Tests — Tasks 7.1 & 7.2
 * Spec: session-isolation-bugs
 *
 * These tests verify that the fixes work correctly on FIXED code.
 * They are the "expected behavior" counterpart to the exploration tests in task 1.
 *
 * Task 7.1 — Bug 1 fix: startSession called exactly once, diagnosticComplete guard works
 * Task 7.2 — Bug 2 fix: ChatHistoryProvider resets on logout via resetChatHistory()
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as fc from 'fast-check';
import type { ReactNode } from 'react';

// ── Module mocks ──────────────────────────────────────────────────────────────

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

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { agentApi } from '../services/agentApi';
import { leerHistorialChat } from '../services/persistenceService';
import { AgentSessionProvider, useAgentSession } from '../context/AgentSessionContext';
import { ChatHistoryProvider, useChatHistory } from '../context/ChatHistoryContext';
import type { MensajeChat } from '../types/persistence';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockedApi = vi.mocked(agentApi);
const mockedLeerHistorialChat = vi.mocked(leerHistorialChat);

// ── Helpers ───────────────────────────────────────────────────────────────────

function AgentSessionWrapper({ children }: { children: ReactNode }) {
  return <AgentSessionProvider>{children}</AgentSessionProvider>;
}

function ChatHistoryWrapper({ children }: { children: ReactNode }) {
  return <ChatHistoryProvider>{children}</ChatHistoryProvider>;
}

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
    study_calendar: [],
  };
}

function makeMessage(id: string, content: string): MensajeChat {
  return {
    id,
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
  };
}

// ── Task 7.1: Bug 1 Fix Verification ─────────────────────────────────────────

describe('Task 7.1 — Bug 1 Fix: startSession called exactly once per account session (Req 2.1, 2.2, 2.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  /**
   * Test 7.1-a: After submitDiagnostic sets diagnosticComplete=true,
   * startSession is NOT called again.
   *
   * This is the core fix for Bug 1: the diagnosticComplete guard prevents
   * the second startSession call that caused the diagnostic loop.
   *
   * On FIXED code: startSession called exactly once. ✓
   * On UNFIXED code: startSession called twice (diagnostic loop).
   *
   * Validates: Requirements 2.1, 2.2, 2.3
   */
  it('startSession is called exactly once — diagnosticComplete guard prevents second call', async () => {
    const sessionId = 'fix-verify-session-1';

    mockedApi.startSession.mockResolvedValue(makeStartSessionResponse(sessionId));
    mockedApi.submitDiagnostic.mockResolvedValue(makeSubmitDiagnosticResponse(sessionId));

    const { result } = renderHook(() => useAgentSession(), { wrapper: AgentSessionWrapper });

    // Step 1: startSession fires (new user, no sessionId, not hydrating)
    await act(async () => {
      await result.current.startSession({
        student_name: 'Test User',
        user_background: 'React developer',
        user_preferences: 'TypeScript',
        student_id: 'student-fix-1',
      });
    });

    expect(mockedApi.startSession).toHaveBeenCalledTimes(1);
    expect(result.current.session.sessionId).toBe(sessionId);
    expect(result.current.session.diagnosticComplete).toBe(false);

    // Step 2: User submits diagnostic — sets diagnosticComplete = true
    await act(async () => {
      await result.current.submitDiagnostic(['A']);
    });

    expect(result.current.session.diagnosticComplete).toBe(true);

    // Step 3: Verify startSession was NOT called again
    // The guard `if (session.diagnosticComplete) return;` prevents it.
    expect(mockedApi.startSession).toHaveBeenCalledTimes(1);
  });

  /**
   * Test 7.1-b: Property-based — for any session with diagnosticComplete=true,
   * startSession is never called again.
   *
   * Validates: Requirements 2.1, 2.2
   */
  it('Property: startSession never fires when diagnosticComplete=true (fix verified)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (sessionId) => {
          vi.clearAllMocks();
          sessionStorage.clear();

          mockedApi.startSession.mockResolvedValue(makeStartSessionResponse(sessionId));
          mockedApi.submitDiagnostic.mockResolvedValue(makeSubmitDiagnosticResponse(sessionId));

          const { result } = renderHook(() => useAgentSession(), { wrapper: AgentSessionWrapper });

          await act(async () => {
            await result.current.startSession({
              student_name: 'User',
              user_background: 'bg',
              user_preferences: 'pref',
              student_id: sessionId,
            });
          });

          await act(async () => {
            await result.current.submitDiagnostic(['A']);
          });

          // diagnosticComplete must be true
          expect(result.current.session.diagnosticComplete).toBe(true);

          // startSession must have been called exactly once
          expect(mockedApi.startSession).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Test 7.1-c: Page-reload scenario — restoreSession with diagnosticComplete=true
   * does NOT trigger startSession.
   *
   * This verifies the page-reload preservation: a returning user with a completed
   * diagnostic goes directly to the dashboard without re-triggering startSession.
   *
   * Validates: Requirements 2.2, 3.2
   */
  it('Page-reload: restoreSession with diagnosticComplete=true does not call startSession', async () => {
    const sessionId = 'restored-complete-session';

    const { result } = renderHook(() => useAgentSession(), { wrapper: AgentSessionWrapper });

    // Simulate page-reload: restoreSession called with completed session from Firestore
    await act(async () => {
      result.current.restoreSession({
        sessionId,
        diagnosticComplete: true,
        hydrating: false,
        loading: false,
      });
    });

    expect(result.current.session.sessionId).toBe(sessionId);
    expect(result.current.session.diagnosticComplete).toBe(true);

    // startSession must NOT have been called
    expect(mockedApi.startSession).not.toHaveBeenCalled();
  });

  /**
   * Test 7.1-d: After logout (resetSession), startSession can fire again for
   * the next user — the fix does not over-block legitimate calls.
   *
   * Validates: Requirements 2.3, 3.1
   */
  it('After logout (resetSession), startSession fires correctly for the next user', async () => {
    const sessionIdA = 'session-user-a';
    const sessionIdB = 'session-user-b';

    mockedApi.startSession
      .mockResolvedValueOnce(makeStartSessionResponse(sessionIdA))
      .mockResolvedValueOnce(makeStartSessionResponse(sessionIdB));
    mockedApi.submitDiagnostic.mockResolvedValue(makeSubmitDiagnosticResponse(sessionIdA));

    const { result } = renderHook(() => useAgentSession(), { wrapper: AgentSessionWrapper });

    // User A: start session and complete diagnostic
    await act(async () => {
      await result.current.startSession({
        student_name: 'User A',
        user_background: 'bg',
        user_preferences: 'pref',
      });
    });

    await act(async () => {
      await result.current.submitDiagnostic(['A']);
    });

    expect(result.current.session.diagnosticComplete).toBe(true);
    expect(mockedApi.startSession).toHaveBeenCalledTimes(1);

    // Logout: resetSession clears all state
    act(() => {
      result.current.resetSession();
    });

    expect(result.current.session.sessionId).toBeNull();
    expect(result.current.session.diagnosticComplete).toBe(false);

    // User B: start session (should work correctly)
    await act(async () => {
      await result.current.startSession({
        student_name: 'User B',
        user_background: 'bg',
        user_preferences: 'pref',
      });
    });

    expect(mockedApi.startSession).toHaveBeenCalledTimes(2);
    expect(result.current.session.sessionId).toBe(sessionIdB);
    expect(result.current.session.diagnosticComplete).toBe(false);
  });
});

// ── Task 7.2: Bug 2 Fix Verification ─────────────────────────────────────────

describe('Task 7.2 — Bug 2 Fix: ChatHistoryProvider resets on logout (Req 2.4, 2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test 7.2-a: After resetChatHistory(), messages is empty and cargarHistorial
   * performs a fresh Firestore load for the next user.
   *
   * This is the core fix for Bug 2: resetChatHistory() clears the idempotency
   * guard so the next user's history loads correctly.
   *
   * On FIXED code: messages=[], historyLoaded=false after logout. ✓
   * On UNFIXED code: messages still contains previous user's data.
   *
   * Validates: Requirements 2.4, 2.5
   */
  it('resetChatHistory() clears state — next user gets fresh history load', async () => {
    const uidA = 'user-a-fix-verify';
    const uidB = 'user-b-fix-verify';

    const userAMessages = [
      makeMessage('a-1', 'User A message 1'),
      makeMessage('a-2', 'User A message 2'),
      makeMessage('a-3', 'User A message 3'),
      makeMessage('a-4', 'User A message 4'),
      makeMessage('a-5', 'User A message 5'),
    ];
    const userBMessages = [
      makeMessage('b-1', 'User B message 1'),
    ];

    mockedLeerHistorialChat.mockImplementation(async (uid: string) => {
      if (uid === uidA) return userAMessages;
      if (uid === uidB) return userBMessages;
      return [];
    });

    const { result } = renderHook(() => useChatHistory(), { wrapper: ChatHistoryWrapper });

    // Step 1: User A loads history
    await act(async () => {
      await result.current.cargarHistorial(uidA);
    });

    expect(result.current.messages).toHaveLength(5);
    expect(result.current.historyLoaded).toBe(true);
    expect(mockedLeerHistorialChat).toHaveBeenCalledTimes(1);

    // Step 2: Logout — call resetChatHistory() (the fix)
    act(() => {
      result.current.resetChatHistory();
    });

    // Verify state is cleared
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.historyLoaded).toBe(false);
    expect(result.current.loadingHistory).toBe(false);

    // Step 3: User B logs in and loads history
    await act(async () => {
      await result.current.cargarHistorial(uidB);
    });

    // Verify User B gets their own history (not User A's)
    expect(mockedLeerHistorialChat).toHaveBeenCalledTimes(2);
    expect(mockedLeerHistorialChat).toHaveBeenLastCalledWith(uidB);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('User B message 1');
    expect(result.current.historyLoaded).toBe(true);
  });

  /**
   * Test 7.2-b: Property-based — for any number of User A messages,
   * after resetChatHistory() + cargarHistorial(uidB), messages contains
   * only User B's messages.
   *
   * Validates: Requirements 2.4, 2.5
   */
  it('Property: after resetChatHistory() + cargarHistorial(uidB), only User B messages visible', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // uidA
        fc.uuid(), // uidB
        fc.integer({ min: 1, max: 10 }), // User A message count
        fc.integer({ min: 0, max: 5 }),  // User B message count
        async (uidA, uidB, countA, countB) => {
          fc.pre(uidA !== uidB);
          vi.clearAllMocks();

          const userAMessages = Array.from({ length: countA }, (_, i) =>
            makeMessage(`a-${i}`, `User A message ${i}`)
          );
          const userBMessages = Array.from({ length: countB }, (_, i) =>
            makeMessage(`b-${i}`, `User B message ${i}`)
          );

          mockedLeerHistorialChat.mockImplementation(async (uid: string) => {
            if (uid === uidA) return userAMessages;
            if (uid === uidB) return userBMessages;
            return [];
          });

          const { result } = renderHook(() => useChatHistory(), { wrapper: ChatHistoryWrapper });

          // Load User A's history
          await act(async () => {
            await result.current.cargarHistorial(uidA);
          });

          expect(result.current.messages).toHaveLength(countA);

          // Logout: reset chat history (the fix)
          act(() => {
            result.current.resetChatHistory();
          });

          expect(result.current.messages).toHaveLength(0);
          expect(result.current.historyLoaded).toBe(false);

          // User B loads history
          await act(async () => {
            await result.current.cargarHistorial(uidB);
          });

          // Only User B's messages must be visible
          expect(result.current.messages).toHaveLength(countB);

          // No User A messages must be present
          const userAContents = new Set(userAMessages.map((m) => m.content));
          for (const msg of result.current.messages) {
            expect(userAContents.has(msg.content)).toBe(false);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Test 7.2-c: historyLoaded is false immediately after resetChatHistory().
   *
   * This is the key state that was broken in Bug 2: historyLoaded stayed true
   * after logout, blocking cargarHistorial for the next user.
   *
   * Validates: Requirements 2.4
   */
  it('historyLoaded is false immediately after resetChatHistory() (fix verified)', async () => {
    const uid = 'user-fix-verify-c';

    mockedLeerHistorialChat.mockResolvedValue([
      makeMessage('m-1', 'Message 1'),
      makeMessage('m-2', 'Message 2'),
    ]);

    const { result } = renderHook(() => useChatHistory(), { wrapper: ChatHistoryWrapper });

    await act(async () => {
      await result.current.cargarHistorial(uid);
    });

    expect(result.current.historyLoaded).toBe(true);

    // Call resetChatHistory (the fix — called in logout handler)
    act(() => {
      result.current.resetChatHistory();
    });

    // historyLoaded must be false so the next user can load their history
    expect(result.current.historyLoaded).toBe(false);
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.loadingHistory).toBe(false);
  });

  /**
   * Test 7.2-d: Full account-switch scenario — User A (5 messages) → logout →
   * User B (1 message) → only User B's message visible.
   *
   * This is the exact scenario described in Bug 2.
   *
   * Validates: Requirements 2.4, 2.5
   */
  it('Full account-switch: User A (5 msgs) → logout → User B (1 msg) → only User B visible', async () => {
    const uidA = 'account-switch-user-a';
    const uidB = 'account-switch-user-b';

    const userAMessages = Array.from({ length: 5 }, (_, i) =>
      makeMessage(`a-${i}`, `User A message ${i}`)
    );
    const userBMessages = [makeMessage('b-0', 'User B only message')];

    mockedLeerHistorialChat.mockImplementation(async (uid: string) => {
      if (uid === uidA) return userAMessages;
      if (uid === uidB) return userBMessages;
      return [];
    });

    const { result } = renderHook(() => useChatHistory(), { wrapper: ChatHistoryWrapper });

    // User A session
    await act(async () => {
      await result.current.cargarHistorial(uidA);
    });

    expect(result.current.messages).toHaveLength(5);

    // Logout with fix: resetChatHistory() called before cerrarSesion()
    act(() => {
      result.current.resetChatHistory();
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.historyLoaded).toBe(false);

    // User B session
    await act(async () => {
      await result.current.cargarHistorial(uidB);
    });

    // Only User B's message must be visible
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('User B only message');

    // Verify leerHistorialChat was called twice (once per user)
    expect(mockedLeerHistorialChat).toHaveBeenCalledTimes(2);
    expect(mockedLeerHistorialChat).toHaveBeenNthCalledWith(1, uidA);
    expect(mockedLeerHistorialChat).toHaveBeenNthCalledWith(2, uidB);
  });
});
