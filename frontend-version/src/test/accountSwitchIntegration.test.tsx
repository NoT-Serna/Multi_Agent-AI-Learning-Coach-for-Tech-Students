/**
 * Integration Tests — Task 9
 * Spec: session-isolation-bugs
 *
 * Full account-switch flow integration tests covering the complete end-to-end
 * scenario using AgentSessionContext + ChatHistoryContext together.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.6, 3.7
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
import { leerHistorialChat, guardarMensaje } from '../services/persistenceService';
import { AgentSessionProvider, useAgentSession } from '../context/AgentSessionContext';
import { ChatHistoryProvider, useChatHistory } from '../context/ChatHistoryContext';
import type { MensajeChat } from '../types/persistence';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockedApi = vi.mocked(agentApi);
const mockedLeerHistorialChat = vi.mocked(leerHistorialChat);
const mockedGuardarMensaje = vi.mocked(guardarMensaje);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Combined provider wrapper — mirrors the real app's provider tree */
function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AgentSessionProvider>
      <ChatHistoryProvider>
        {children}
      </ChatHistoryProvider>
    </AgentSessionProvider>
  );
}

/** Hook that exposes both contexts together for integration testing */
function useAppContexts() {
  const agentSession = useAgentSession();
  const chatHistory = useChatHistory();
  return { agentSession, chatHistory };
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
      {
        id: 'q2',
        category: 'TypeScript',
        question: 'What is a type alias?',
        options: { A: 'A class', B: 'A type name', C: 'An interface', D: 'None' },
        correct_answer: 'B' as const,
        skill_tested: 'ts-basics',
      },
    ],
  };
}

function makeSubmitDiagnosticResponse(sessionId: string) {
  return {
    session_id: sessionId,
    diagnostic_complete: true,
    skill_scores: { react: 0.8, typescript: 0.7 },
    strong_skills: ['react'],
    weak_skills: ['typescript'],
    learning_roadmap: [],
    quiz_questions: [],
    current_week: 1,
    study_calendar: [], message: 'ok',
    message: "ok",
  };
}

function makeMessage(id: string, content: string, role: 'user' | 'coach' = 'user'): MensajeChat {
  return {
    id,
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

// ── Integration Tests ─────────────────────────────────────────────────────────

describe('Integration — Full account-switch flow (Req 2.1–2.5, 3.1, 3.6, 3.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockedGuardarMensaje.mockResolvedValue(undefined);
  });

  /**
   * Test 9.1: Complete account-switch flow
   *
   * 1. User A: startSession → diagnostic questions appear
   * 2. User A: submitDiagnostic → diagnosticComplete=true, dashboard renders
   * 3. User A: sends 3 chat messages → messages visible
   * 4. User A: logout → resetChatHistory() + resetSession() called → state cleared
   * 5. User B: startSession → diagnostic questions appear (no second diagnostic for A)
   * 6. User B: submitDiagnostic → diagnosticComplete=true
   * 7. User B: sends 1 message → only User B's message visible (no User A messages)
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.7
   */
  it('Complete account-switch: User A (3 msgs) → logout → User B (1 msg) — no leakage', async () => {
    const sessionIdA = 'integration-session-a';
    const sessionIdB = 'integration-session-b';
    const uidA = 'uid-user-a';
    const uidB = 'uid-user-b';

    // User A's Firestore history (loaded when they open CoachIAPage)
    const userAFirestoreHistory: MensajeChat[] = [];

    // User B's Firestore history (empty — new user)
    const userBFirestoreHistory: MensajeChat[] = [];

    mockedLeerHistorialChat.mockImplementation(async (uid: string) => {
      if (uid === uidA) return userAFirestoreHistory;
      if (uid === uidB) return userBFirestoreHistory;
      return [];
    });

    mockedApi.startSession
      .mockResolvedValueOnce(makeStartSessionResponse(sessionIdA))
      .mockResolvedValueOnce(makeStartSessionResponse(sessionIdB));

    mockedApi.submitDiagnostic
      .mockResolvedValueOnce(makeSubmitDiagnosticResponse(sessionIdA))
      .mockResolvedValueOnce(makeSubmitDiagnosticResponse(sessionIdB));

    const { result } = renderHook(() => useAppContexts(), { wrapper: AppProviders });

    // ── Step 1: User A — startSession ──────────────────────────────────────
    await act(async () => {
      await result.current.agentSession.startSession({
        student_name: 'User A',
        user_background: 'React developer',
        user_preferences: 'TypeScript',
        student_id: uidA,
      });
    });

    // Verify: diagnostic questions loaded (diagnostic screen would render)
    expect(result.current.agentSession.session.sessionId).toBe(sessionIdA);
    expect(result.current.agentSession.session.diagnosticQuestions).toHaveLength(2);
    expect(result.current.agentSession.session.diagnosticComplete).toBe(false);
    expect(mockedApi.startSession).toHaveBeenCalledTimes(1);

    // ── Step 2: User A — submitDiagnostic ──────────────────────────────────
    await act(async () => {
      await result.current.agentSession.submitDiagnostic(['A', 'B']);
    });

    // Verify: diagnosticComplete=true, dashboard would render
    expect(result.current.agentSession.session.diagnosticComplete).toBe(true);
    expect(result.current.agentSession.session.diagnosticQuestions).toHaveLength(0);
    expect(result.current.agentSession.session.learningRoadmap).toHaveLength(1);

    // Verify: startSession was NOT called again after diagnosticComplete (Bug 1 fix)
    expect(mockedApi.startSession).toHaveBeenCalledTimes(1);

    // ── Step 3: User A — load chat history and send 3 messages ────────────
    await act(async () => {
      await result.current.chatHistory.cargarHistorial(uidA);
    });

    expect(result.current.chatHistory.historyLoaded).toBe(true);
    expect(result.current.chatHistory.messages).toHaveLength(0); // empty Firestore history

    // Send 3 messages
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.chatHistory.agregarMensaje(
          uidA,
          makeMessage(`a-msg-${i}`, `User A message ${i}`)
        );
      });
    }

    expect(result.current.chatHistory.messages).toHaveLength(3);
    expect(mockedGuardarMensaje).toHaveBeenCalledTimes(3);

    // Verify all 3 messages are User A's
    for (const msg of result.current.chatHistory.messages) {
      expect(msg.content).toMatch(/^User A message/);
    }

    // ── Step 4: User A — logout ────────────────────────────────────────────
    // Simulates the onLogout handler in App.tsx:
    //   resetChatHistory() → resetSession() → cerrarSesion() → setSesion(null)
    act(() => {
      result.current.chatHistory.resetChatHistory();  // Bug 2 fix
    });

    act(() => {
      result.current.agentSession.resetSession();     // clears agent session
    });

    // Verify: all state cleared after logout
    expect(result.current.chatHistory.messages).toHaveLength(0);
    expect(result.current.chatHistory.historyLoaded).toBe(false);
    expect(result.current.chatHistory.loadingHistory).toBe(false);
    expect(result.current.agentSession.session.sessionId).toBeNull();
    expect(result.current.agentSession.session.diagnosticComplete).toBe(false);
    expect(result.current.agentSession.session.diagnosticQuestions).toHaveLength(0);

    // ── Step 5: User B — startSession ──────────────────────────────────────
    await act(async () => {
      await result.current.agentSession.startSession({
        student_name: 'User B',
        user_background: 'Node.js developer',
        user_preferences: 'JavaScript',
        student_id: uidB,
      });
    });

    // Verify: User B gets their own diagnostic (not User A's completed session)
    expect(result.current.agentSession.session.sessionId).toBe(sessionIdB);
    expect(result.current.agentSession.session.diagnosticQuestions).toHaveLength(2);
    expect(result.current.agentSession.session.diagnosticComplete).toBe(false);
    expect(mockedApi.startSession).toHaveBeenCalledTimes(2);

    // ── Step 6: User B — submitDiagnostic ──────────────────────────────────
    await act(async () => {
      await result.current.agentSession.submitDiagnostic(['B', 'A']);
    });

    expect(result.current.agentSession.session.diagnosticComplete).toBe(true);

    // Verify: startSession was NOT called again after User B's diagnosticComplete
    expect(mockedApi.startSession).toHaveBeenCalledTimes(2);

    // ── Step 7: User B — load history and send 1 message ──────────────────
    await act(async () => {
      await result.current.chatHistory.cargarHistorial(uidB);
    });

    expect(result.current.chatHistory.historyLoaded).toBe(true);
    expect(result.current.chatHistory.messages).toHaveLength(0); // empty Firestore history for B

    await act(async () => {
      await result.current.chatHistory.agregarMensaje(
        uidB,
        makeMessage('b-msg-0', 'User B only message')
      );
    });

    // Verify: only User B's message is visible (no User A messages)
    expect(result.current.chatHistory.messages).toHaveLength(1);
    expect(result.current.chatHistory.messages[0].content).toBe('User B only message');

    // Final verification: leerHistorialChat called once per user
    expect(mockedLeerHistorialChat).toHaveBeenCalledTimes(2);
    expect(mockedLeerHistorialChat).toHaveBeenNthCalledWith(1, uidA);
    expect(mockedLeerHistorialChat).toHaveBeenNthCalledWith(2, uidB);
  });

  /**
   * Test 9.2: User A with existing Firestore history → logout → User B sees empty chat
   *
   * Validates: Requirements 2.4, 2.5
   */
  it('User A (5 Firestore msgs) → logout → User B sees empty chat before their history loads', async () => {
    const sessionIdA = 'integration-session-a2';
    const sessionIdB = 'integration-session-b2';
    const uidA = 'uid-user-a2';
    const uidB = 'uid-user-b2';

    const userAHistory = Array.from({ length: 5 }, (_, i) =>
      makeMessage(`a-${i}`, `User A Firestore message ${i}`)
    );

    mockedLeerHistorialChat.mockImplementation(async (uid: string) => {
      if (uid === uidA) return userAHistory;
      return [];
    });

    mockedApi.startSession
      .mockResolvedValueOnce(makeStartSessionResponse(sessionIdA))
      .mockResolvedValueOnce(makeStartSessionResponse(sessionIdB));

    mockedApi.submitDiagnostic
      .mockResolvedValueOnce(makeSubmitDiagnosticResponse(sessionIdA))
      .mockResolvedValueOnce(makeSubmitDiagnosticResponse(sessionIdB));

    const { result } = renderHook(() => useAppContexts(), { wrapper: AppProviders });

    // User A: full session
    await act(async () => {
      await result.current.agentSession.startSession({
        student_name: 'User A',
        user_background: 'bg',
        user_preferences: 'pref',
        student_id: uidA,
      });
    });

    await act(async () => {
      await result.current.agentSession.submitDiagnostic(['A', 'B']);
    });

    await act(async () => {
      await result.current.chatHistory.cargarHistorial(uidA);
    });

    expect(result.current.chatHistory.messages).toHaveLength(5);
    expect(result.current.chatHistory.historyLoaded).toBe(true);

    // Logout with fix
    act(() => {
      result.current.chatHistory.resetChatHistory();
      result.current.agentSession.resetSession();
    });

    // Verify state is clean
    expect(result.current.chatHistory.messages).toHaveLength(0);
    expect(result.current.chatHistory.historyLoaded).toBe(false);

    // User B: start session — messages must be empty before their history loads
    await act(async () => {
      await result.current.agentSession.startSession({
        student_name: 'User B',
        user_background: 'bg',
        user_preferences: 'pref',
        student_id: uidB,
      });
    });

    // CRITICAL: messages must be empty before User B's cargarHistorial is called
    // This is the exact bug condition that was fixed
    expect(result.current.chatHistory.messages).toHaveLength(0);
    expect(result.current.chatHistory.historyLoaded).toBe(false);

    // User B loads their history (empty)
    await act(async () => {
      await result.current.chatHistory.cargarHistorial(uidB);
    });

    expect(result.current.chatHistory.messages).toHaveLength(0);
    expect(result.current.chatHistory.historyLoaded).toBe(true);
  });

  /**
   * Test 9.3: Property-based — for any sequence of (N messages for User A,
   * logout, M messages for User B), User B always sees exactly M messages.
   *
   * Validates: Requirements 2.4, 2.5, 3.6
   */
  it('Property: account-switch always produces clean isolation between users', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // uidA
        fc.uuid(), // uidB
        fc.integer({ min: 1, max: 8 }), // User A message count
        fc.integer({ min: 0, max: 5 }), // User B message count
        async (uidA, uidB, countA, countB) => {
          fc.pre(uidA !== uidB);
          vi.clearAllMocks();
          sessionStorage.clear();
          mockedGuardarMensaje.mockResolvedValue(undefined);

          const sessionIdA = `session-a-${uidA.slice(0, 8)}`;
          const sessionIdB = `session-b-${uidB.slice(0, 8)}`;

          const userAHistory = Array.from({ length: countA }, (_, i) =>
            makeMessage(`a-${i}`, `User A message ${i}`)
          );
          const userBHistory = Array.from({ length: countB }, (_, i) =>
            makeMessage(`b-${i}`, `User B message ${i}`)
          );

          mockedLeerHistorialChat.mockImplementation(async (uid: string) => {
            if (uid === uidA) return userAHistory;
            if (uid === uidB) return userBHistory;
            return [];
          });

          mockedApi.startSession
            .mockResolvedValueOnce(makeStartSessionResponse(sessionIdA))
            .mockResolvedValueOnce(makeStartSessionResponse(sessionIdB));

          mockedApi.submitDiagnostic
            .mockResolvedValueOnce(makeSubmitDiagnosticResponse(sessionIdA))
            .mockResolvedValueOnce(makeSubmitDiagnosticResponse(sessionIdB));

          const { result } = renderHook(() => useAppContexts(), { wrapper: AppProviders });

          // User A session
          await act(async () => {
            await result.current.agentSession.startSession({
              student_name: 'User A',
              user_background: 'bg',
              user_preferences: 'pref',
              student_id: uidA,
            });
          });

          await act(async () => {
            await result.current.agentSession.submitDiagnostic(['A', 'B']);
          });

          await act(async () => {
            await result.current.chatHistory.cargarHistorial(uidA);
          });

          expect(result.current.chatHistory.messages).toHaveLength(countA);

          // Logout with fix
          act(() => {
            result.current.chatHistory.resetChatHistory();
            result.current.agentSession.resetSession();
          });

          // User B session
          await act(async () => {
            await result.current.agentSession.startSession({
              student_name: 'User B',
              user_background: 'bg',
              user_preferences: 'pref',
              student_id: uidB,
            });
          });

          await act(async () => {
            await result.current.agentSession.submitDiagnostic(['B', 'A']);
          });

          await act(async () => {
            await result.current.chatHistory.cargarHistorial(uidB);
          });

          // User B must see exactly their own messages
          expect(result.current.chatHistory.messages).toHaveLength(countB);

          // No User A messages must be present
          const userAContents = new Set(userAHistory.map((m) => m.content));
          for (const msg of result.current.chatHistory.messages) {
            expect(userAContents.has(msg.content)).toBe(false);
          }

          // startSession called exactly twice (once per user)
          expect(mockedApi.startSession).toHaveBeenCalledTimes(2);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Test 9.4: Single-user session — no account switching — behavior unchanged.
   *
   * Verifies that the fix does not break single-user flows (preservation).
   *
   * Validates: Requirements 3.1, 3.6, 3.7
   */
  it('Single-user session: full flow works correctly (no regressions)', async () => {
    const sessionId = 'single-user-session';
    const uid = 'single-user-uid';

    const firestoreHistory = [
      makeMessage('h-1', 'Previous message 1'),
      makeMessage('h-2', 'Previous message 2'),
    ];

    mockedLeerHistorialChat.mockResolvedValue(firestoreHistory);
    mockedApi.startSession.mockResolvedValue(makeStartSessionResponse(sessionId));
    mockedApi.submitDiagnostic.mockResolvedValue(makeSubmitDiagnosticResponse(sessionId));

    const { result } = renderHook(() => useAppContexts(), { wrapper: AppProviders });

    // Start session
    await act(async () => {
      await result.current.agentSession.startSession({
        student_name: 'Single User',
        user_background: 'Full-stack developer',
        user_preferences: 'React, Node.js',
        student_id: uid,
      });
    });

    expect(result.current.agentSession.session.sessionId).toBe(sessionId);
    expect(result.current.agentSession.session.diagnosticQuestions).toHaveLength(2);
    expect(mockedApi.startSession).toHaveBeenCalledTimes(1);

    // Submit diagnostic
    await act(async () => {
      await result.current.agentSession.submitDiagnostic(['A', 'B']);
    });

    expect(result.current.agentSession.session.diagnosticComplete).toBe(true);
    expect(mockedApi.startSession).toHaveBeenCalledTimes(1); // still 1

    // Load chat history
    await act(async () => {
      await result.current.chatHistory.cargarHistorial(uid);
    });

    expect(result.current.chatHistory.messages).toHaveLength(2);
    expect(result.current.chatHistory.historyLoaded).toBe(true);

    // Send a new message
    await act(async () => {
      await result.current.chatHistory.agregarMensaje(
        uid,
        makeMessage('new-1', 'New message from single user')
      );
    });

    expect(result.current.chatHistory.messages).toHaveLength(3);
    expect(mockedGuardarMensaje).toHaveBeenCalledTimes(1);
    expect(mockedGuardarMensaje).toHaveBeenCalledWith(uid, expect.objectContaining({
      content: 'New message from single user',
    }));

    // Subsequent cargarHistorial calls are no-ops (idempotency preserved)
    await act(async () => {
      await result.current.chatHistory.cargarHistorial(uid);
    });

    expect(mockedLeerHistorialChat).toHaveBeenCalledTimes(1); // still 1
    expect(result.current.chatHistory.messages).toHaveLength(3); // unchanged
  });
});
