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

interface AgentSession {
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
};

// ── Context ───────────────────────────────────────────────────────────────────

const AgentSessionContext = createContext<AgentSessionContextValue | null>(null);

export function AgentSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AgentSession>(emptySession);

  const setLoading = (loading: boolean) =>
    setSession((s) => ({ ...s, loading, error: loading ? null : s.error }));

  const setError = (error: string) =>
    setSession((s) => ({ ...s, loading: false, error }));

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
      const res = await agentApi.submitDiagnostic({
        session_id: session.sessionId,
        answers,
      });
      setSession((s) => ({
        ...s,
        diagnosticComplete: true,
        skillScores:        res.skill_scores,
        strongSkills:       res.strong_skills,
        weakSkills:         res.weak_skills,
        learningRoadmap:    res.learning_roadmap,
        quizQuestions:      res.quiz_questions,
        currentWeek:        res.current_week,
        loading:            false,
        error:              null,
      }));
      return res;
    } catch (err) {
      setError((err as Error).message);
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
      const res = await agentApi.submitQuiz({
        session_id: session.sessionId,
        answers,
      });
      setSession((s) => ({
        ...s,
        quizPassed:      res.quiz_passed,
        quizScores:      res.quiz_scores,
        currentWeek:     res.current_week,
        completedWeeks:  res.completed_weeks,
        learningRoadmap: res.learning_roadmap,
        quizQuestions:   res.quiz_questions,
        loading:         false,
        error:           null,
      }));
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
        session_id: session.sessionId,
        message,
      });
      return res.response;
    } catch (err) {
      return `Error al contactar al coach: ${(err as Error).message}`;
    }
  }, [session.sessionId]);

  // ── clearError ──────────────────────────────────────────────────────────────
  const clearError = useCallback(() => {
    setSession((s) => ({ ...s, error: null }));
  }, []);

  return (
    <AgentSessionContext.Provider
      value={{ session, startSession, submitDiagnostic, submitQuiz, chat, clearError }}
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
