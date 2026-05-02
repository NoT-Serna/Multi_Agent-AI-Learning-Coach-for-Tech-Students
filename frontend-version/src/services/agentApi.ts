/**
 * agentApi.ts
 * All calls to the FastAPI backend (learning-agent/api.py).
 *
 * Base URL is read from the VITE_API_URL env variable so it works
 * both in development (localhost:8006) and in any future deployment.
 *
 * Usage:
 *   import { agentApi } from './services/agentApi';
 *   const { session_id, diagnostic_questions } = await agentApi.startSession({...});
 */

import type {
  StartSessionResponse,
  DiagnosticSubmitResponse,
  QuizSubmitResponse,
  ChatResponse,
  SessionState,
} from '../types/agent';

// ── Base URL ──────────────────────────────────────────────────────────────────
// Set VITE_API_URL in frontend-version/.env.local to override.
// Default: http://localhost:8006
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8006';

// ── Timeouts ──────────────────────────────────────────────────────────────────
// AI-heavy endpoints (session start, diagnostic, quiz) can take 60-120s with Ollama.
// Quick endpoints (health, getSession) use a short timeout.
const DEFAULT_TIMEOUT_MS = 15_000;
const AI_TIMEOUT_MS      = 180_000; // 3 minutes for LLM-backed endpoints

// ── Generic fetch helper ──────────────────────────────────────────────────────

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('El servidor tardó demasiado en responder. El modelo de IA puede estar ocupado, intenta de nuevo.');
    }
    throw new Error('No se pudo conectar con el servidor. Verifica que el backend esté activo.');
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    // Try to extract the FastAPI error detail
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err.detail ?? detail;
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }

  return res.json() as Promise<T>;
}

// ── API surface ───────────────────────────────────────────────────────────────

export const agentApi = {
  /**
   * Check that the backend is reachable.
   */
  health(): Promise<{ status: string }> {
    return request('GET', '/health');
  },

  /**
   * Create a new learning session.
   * Triggers: collect_profile → generate_skills → generate_exam
   * Returns the diagnostic questions.
   * Uses a long timeout because Ollama can take 60-120s to generate questions.
   */
  startSession(params: {
    student_name: string;
    user_background: string;
    user_preferences: string;
    student_id?: string;
  }): Promise<StartSessionResponse> {
    return request('POST', '/session/start', params, AI_TIMEOUT_MS);
  },

  /**
   * Submit the student's answers to the diagnostic exam.
   * Triggers: evaluate_answers → generate_roadmap → generate_quiz
   * Returns skill scores, roadmap, and the first quiz.
   */
  submitDiagnostic(params: {
    session_id: string;
    answers: string[];
  }): Promise<DiagnosticSubmitResponse> {
    return request('POST', '/diagnostic/submit', params, AI_TIMEOUT_MS);
  },

  /**
   * Submit the student's answers to the current week's quiz.
   * Returns the result and the next state.
   */
  submitQuiz(params: {
    session_id: string;
    answers: string[];
  }): Promise<QuizSubmitResponse> {
    return request('POST', '/quiz/submit', params, AI_TIMEOUT_MS);
  },

  /**
   * Send a chat message to the Coach IA.
   * Returns the AI response.
   */
  chat(params: {
    session_id: string;
    message: string;
  }): Promise<ChatResponse> {
    return request('POST', '/chat', params, AI_TIMEOUT_MS);
  },

  /**
   * Get the full current state for a session.
   * Useful for rehydrating the UI after a page reload.
   */
  getSession(session_id: string): Promise<SessionState> {
    return request('GET', `/session/${session_id}`);
  },
};
