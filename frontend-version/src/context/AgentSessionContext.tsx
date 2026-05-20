/**
 * AgentSessionContext.tsx
 *
 * Provides the agent session state to the entire app.
 * Components consume this context to read/update the learning session
 * without prop-drilling.
 *
 * Usage:
 *   const { session, startSession, submitDiagnostic, ... } = useAgentSession();
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { agentApi } from '../services/agentApi';
import type {
  DiagnosticQuestion,
  DiagnosticSubmitResponse,
  QuizQuestion,
  QuizSubmitResponse,
  RoadmapWeek,
} from '../types/agent';

// ── Shape of the context value ────────────────────────────────────────────────

export interface AgentSession {
  // Session identity
  sessionId: string | null;
  studentName: string | null;

  // Diagnostic
  diagnosticQuestions: DiagnosticQuestion[];
  diagnosticComplete: boolean;

  // Results
  skillScores: Record<string, number>;
  strongSkills: string[];
  weakSkills: string[];

  // Roadmap
  learningRoadmap: RoadmapWeek[];
  currentWeek: number;
  completedWeeks: number[];

  // Quiz
  quizQuestions: QuizQuestion[];
  quizScores: Record<string, number>;
  quizPassed: boolean | null;

  // UI state
  loading: boolean;
  error: string | null;
  /** true while the user is actively answering the current quiz (Start Quiz clicked, not yet submitted) */
  inQuizMode: boolean;

  // Rehydration state
  hydrating: boolean;
}

interface AgentSessionContextValue {
  session: AgentSession;

  /** Create a new session and load the diagnostic questions. */
  startSession(params: {
    student_name: string;
    user_background: string;
    user_preferences: string;
    student_id?: string;
  }): Promise<void>;

  /** Submit diagnostic answers and receive roadmap + first quiz. */
  submitDiagnostic(answers: string[]): Promise<DiagnosticSubmitResponse | null>;

  /** Submit quiz answers and receive the result. */
  submitQuiz(answers: string[]): Promise<QuizSubmitResponse | null>;

  /** Send a chat message and receive the AI response. */
  chat(message: string): Promise<string>;

  /** Clear any error message. */
  clearError(): void;

  /** Set whether the user is actively taking the quiz (blocks chatbot). */
  setInQuizMode(value: boolean): void;

  /** Reset the entire session back to the empty state. */
  resetSession(): void;

  /**
   * Restore the session from a Firestore-read EstadoSesion.
   * loading/hydrating flags. Does NOT call the backend.
   */
  restoreSession(estado: Partial<AgentSession>): void;

  /**
   * Set the hydrating flag. Used by App.tsx + usePersistence to signal
   * that a Firestore restore is in progress or has completed.
   */
  setHydrating(value: boolean): void;
}

// ── Default / empty session ───────────────────────────────────────────────────

const emptySession: AgentSession = {
  sessionId:            null,
  studentName:          null,
  diagnosticQuestions:  [],
  diagnosticComplete:   false,
  skillScores:          {},
  strongSkills:         [],
  weakSkills:           [],
  learningRoadmap:      [],
  currentWeek:          1,
  completedWeeks:       [],
  quizQuestions:        [],
  quizScores:           {},
  quizPassed:           null,
  loading:              false,
  error:                null,
  inQuizMode:           false,
  hydrating:            false,
};

// ── Context ───────────────────────────────────────────────────────────────────

const AgentSessionContext = createContext<AgentSessionContextValue | null>(null);

export function AgentSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AgentSession>(emptySession);

  const setLoading = (loading: boolean) =>
    setSession((s) => ({ ...s, loading, error: loading ? null : s.error }));

  const setError = (error: string) =>
    setSession((s) => ({ ...s, loading: false, error }));

  // ── Rehydration on mount ────────────────────────────────────────────────────
  // NOTE: The sessionStorage-based rehydration that called agentApi.getSession
  // has been removed. Rehydration is now handled by App.tsx + usePersistence
  // using Firestore as the source of truth (see state-persistence spec).

  // ── startSession ────────────────────────────────────────────────────────────
  const startSession = useCallback(async (params: {
    student_name: string;
    user_background: string;
    user_preferences: string;
    student_id?: string;
  }) => {
    setLoading(true);
    try {
      const res = await agentApi.startSession(params);
      // Persist session ID for rehydration on page reload
      sessionStorage.setItem('agentSessionId', res.session_id);
      setSession((s) => ({
        ...s,
        sessionId:           res.session_id,
        studentName:         params.student_name,
        diagnosticQuestions: res.diagnostic_questions,
        loading:             false,
        error:               null,
      }));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  // ── submitDiagnostic ────────────────────────────────────────────────────────
  const submitDiagnostic = useCallback(async (
    answers: string[],
  ): Promise<DiagnosticSubmitResponse | null> => {
    if (!session.sessionId) {
      setError('No hay sesión activa.');
      return null;
    }
    setLoading(true);
    try {
      const { auth } = await import('../services/firebase');
      const res = await agentApi.submitDiagnostic({
        session_id: session.sessionId,
        answers,
        user_id: auth.currentUser?.uid,
      });
      setSession((s) => ({
        ...s,
        diagnosticComplete:  true,
        diagnosticQuestions: [],   // clear so the diagnostic screen never re-appears
        skillScores:         res.skill_scores,
        strongSkills:        res.strong_skills,
        weakSkills:          res.weak_skills,
        learningRoadmap:     res.learning_roadmap,
        quizQuestions:       res.quiz_questions,
        currentWeek:         res.current_week,
        loading:             false,
        error:               null,
      }));

      // Persist the study calendar to Firestore so CalendarioPage can read it.
      // Import is deferred to avoid a circular dependency at module load time.
      if (res.study_calendar && res.study_calendar.length > 0) {
        const { auth } = await import('../services/firebase');
        const { saveStudyCalendar } = await import('../services/calendarService');
        const uid = auth.currentUser?.uid;
        if (uid) {
          // Fire-and-forget — don't block the UI on this write.
          saveStudyCalendar(uid, res.study_calendar, []).catch((err) => {
            console.error('[submitDiagnostic] saveStudyCalendar failed:', err);
          });
        }
      }

      return res;
    } catch (err) {
      const message = (err as Error).message ?? '';
      setError(message);
      return null;
    }
  }, [session.sessionId]);

  // ── submitQuiz ──────────────────────────────────────────────────────────────
  const submitQuiz = useCallback(async (
    answers: string[],
  ): Promise<QuizSubmitResponse | null> => {
    if (!session.sessionId) {
      setError('No hay sesión activa.');
      return null;
    }
    setLoading(true);
    try {
      const { auth } = await import('../services/firebase');
      const res = await agentApi.submitQuiz({
        session_id: session.sessionId,
        answers,
        user_id: auth.currentUser?.uid,
      });
      // next_step is the reliable pass signal: after passing, generate_quiz runs
      // for the next week and resets quiz_passed to null in the state snapshot.
      const actuallyPassed =
        res.next_step === 'next_week' || res.next_step === 'completed';
      setSession((s) => ({
        ...s,
        quizPassed:      actuallyPassed ? true : (res.quiz_passed ?? false),
        quizScores:      res.quiz_scores,
        currentWeek:     res.current_week,
        completedWeeks:  res.completed_weeks,
        learningRoadmap: res.learning_roadmap,
        quizQuestions:   res.quiz_questions,
        loading:         false,
        error:           null,
      }));

      // Persist the updated study calendar to Firestore after each quiz.
      if (res.study_calendar && res.study_calendar.length > 0) {
        const { auth } = await import('../services/firebase');
        const { saveStudyCalendar } = await import('../services/calendarService');
        const uid = auth.currentUser?.uid;
        if (uid) {
          saveStudyCalendar(uid, res.study_calendar, res.completed_weeks).catch((err) => {
            console.error('[submitQuiz] saveStudyCalendar failed:', err);
          });
        }
      }

      return res;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, [session.sessionId]);

  // ── chat ────────────────────────────────────────────────────────────────────
  const chat = useCallback(async (message: string): Promise<string> => {
    if (!session.sessionId) return 'No hay sesión activa. Completa el registro primero.';
    try {
      const res = await agentApi.chat({
        session_id:      session.sessionId,
        message,
        // Pass the learning context so the backend can respond even after a
        // server restart (when the in-memory session is gone).
        student_name:    session.studentName ?? undefined,
        learning_roadmap: session.learningRoadmap,
        skill_scores:    session.skillScores,
        strong_skills:   session.strongSkills,
        weak_skills:     session.weakSkills,
        current_week:    session.currentWeek,
        completed_weeks: session.completedWeeks,
      });
      return res.response;
    } catch (err) {
      return `Error al contactar al coach: ${(err as Error).message}`;
    }
  }, [session.sessionId, session.studentName, session.learningRoadmap, session.skillScores, session.strongSkills, session.weakSkills, session.currentWeek, session.completedWeeks]);

  // ── clearError ──────────────────────────────────────────────────────────────
  const clearError = useCallback(() => {
    setSession((s) => ({ ...s, error: null }));
  }, []);

  // ── setInQuizMode ────────────────────────────────────────────────────────────
  const setInQuizMode = useCallback((value: boolean) => {
    setSession((s) => ({ ...s, inQuizMode: value }));
  }, []);

  // ── resetSession ─────────────────────────────────────────────────────────────
  const resetSession = useCallback(() => {
    sessionStorage.removeItem('agentSessionId');
    setSession(emptySession);
  }, []);

  // ── restoreSession ──────────────────────────────────────────────────────────
  const restoreSession = useCallback((estado: Partial<AgentSession>) => {
    setSession((s) => ({ ...s, ...estado, loading: false, hydrating: false }));
  }, []);

  // ── setHydrating ────────────────────────────────────────────────────────────
  const setHydrating = useCallback((value: boolean) => {
    setSession((s) => ({ ...s, hydrating: value }));
  }, []);

  return (
    <AgentSessionContext.Provider
      value={{ session, startSession, submitDiagnostic, submitQuiz, chat, clearError, setInQuizMode, resetSession, restoreSession, setHydrating }}
    >
      {children}
    </AgentSessionContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAgentSession(): AgentSessionContextValue {
  const ctx = useContext(AgentSessionContext);
  if (!ctx) {
    throw new Error('useAgentSession must be used inside <AgentSessionProvider>');
  }
  return ctx;
}
