/**
 * usePersistence.ts
 *
 * Custom hook that connects `AgentSessionContext` with `PersistenceService`.
 * Mounted in `App.tsx`, it reacts to session changes and triggers async
 * Firestore writes (fire-and-forget, non-blocking).
 *
 * Behavior:
 * - When `session.diagnosticComplete` becomes `true` AND `uid` is not null:
 *   calls `guardarEstadoSesion` with the full serialized session (Req 1.1).
 * - When `session.quizScores`, `session.completedWeeks`, or `session.currentWeek`
 *   change AND `session.diagnosticComplete === true` AND `uid` is not null:
 *   calls `actualizarEstadoSesion` with the changed fields (Req 1.2).
 * - When `session.sessionId` changes to a non-null, non-empty value AND `uid`
 *   is not null: calls `actualizarEstadoSesion` with `{ sessionId }` (Req 4.4, 4.6).
 * - All writes are fire-and-forget: errors are caught, stored in `persistError`,
 *   and logged with `console.error` (Req 1.9, 3.1).
 * - When `uid` is null, all writes are skipped (no-op).
 *
 * Validates: Requirements 1.1, 1.2, 1.9, 3.1, 4.6
 */

import { useState, useEffect, useRef } from 'react';
import type { AgentSession } from '../context/AgentSessionContext';
import {
  guardarEstadoSesion,
  actualizarEstadoSesion,
  serializarEstadoSesion,
} from '../services/persistenceService';

// ── Public interface ──────────────────────────────────────────────────────────

export interface UsePersistenceOptions {
  uid: string | null;
  session: AgentSession;
}

export interface UsePersistenceResult {
  persistError: string | null;
  clearPersistError: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePersistence({
  uid,
  session,
}: UsePersistenceOptions): UsePersistenceResult {
  const [persistError, setPersistError] = useState<string | null>(null);

  const clearPersistError = () => setPersistError(null);

  // ── Refs to track previous values (avoid writes on initial mount) ──────────

  /**
   * `isFirstRender` starts as `true` and is set to `false` after the first
   * render cycle. All effects check this flag so they skip the initial mount.
   */
  const isFirstRender = useRef(true);

  // Previous values for change detection
  const prevDiagnosticComplete = useRef<boolean>(session.diagnosticComplete);
  const prevQuizScores = useRef<Record<string, number>>(session.quizScores);
  const prevCompletedWeeks = useRef<number[]>(session.completedWeeks);
  const prevCurrentWeek = useRef<number>(session.currentWeek);
  const prevSessionId = useRef<string | null>(session.sessionId);

  // ── Effect: mark first render as done ─────────────────────────────────────

  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  // ── Effect 1: Watch `diagnosticComplete` (Req 1.1) ────────────────────────
  //
  // When `diagnosticComplete` transitions to `true` AND `uid` is not null,
  // save the full session to Firestore.

  useEffect(() => {
    // Skip initial mount
    if (isFirstRender.current) {
      prevDiagnosticComplete.current = session.diagnosticComplete;
      return;
    }

    const didChange =
      session.diagnosticComplete !== prevDiagnosticComplete.current;
    prevDiagnosticComplete.current = session.diagnosticComplete;

    if (!didChange) return;
    if (!session.diagnosticComplete) return;
    if (!uid) return;

    const estado = serializarEstadoSesion(session, uid);

    guardarEstadoSesion(uid, estado).catch((err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : 'Error al guardar el estado de la sesión.';
      console.error('[usePersistence] guardarEstadoSesion failed:', err);
      setPersistError(message);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.diagnosticComplete, uid]);

  // ── Effect 2: Watch quiz/progress fields (Req 1.2) ────────────────────────
  //
  // When `quizScores`, `completedWeeks`, or `currentWeek` change AND
  // `diagnosticComplete === true` AND `uid` is not null, write a partial
  // update to Firestore.

  useEffect(() => {
    // Skip initial mount
    if (isFirstRender.current) {
      prevQuizScores.current = session.quizScores;
      prevCompletedWeeks.current = session.completedWeeks;
      prevCurrentWeek.current = session.currentWeek;
      return;
    }

    const quizScoresChanged =
      session.quizScores !== prevQuizScores.current;
    const completedWeeksChanged =
      session.completedWeeks !== prevCompletedWeeks.current;
    const currentWeekChanged =
      session.currentWeek !== prevCurrentWeek.current;

    prevQuizScores.current = session.quizScores;
    prevCompletedWeeks.current = session.completedWeeks;
    prevCurrentWeek.current = session.currentWeek;

    const anyChanged =
      quizScoresChanged || completedWeeksChanged || currentWeekChanged;

    if (!anyChanged) return;
    if (!session.diagnosticComplete) return;
    if (!uid) return;

    // Build a patch with only the fields that changed
    const patch: Parameters<typeof actualizarEstadoSesion>[1] = {};

    if (quizScoresChanged) {
      patch.quizScores = session.quizScores;
      // Also persist quizPassed and quizQuestions when quiz scores change,
      // since they are updated together after a quiz submission (Req 1.2).
      patch.quizPassed = session.quizPassed ?? null;
      patch.quizQuestions = session.quizQuestions;
    }
    if (completedWeeksChanged) {
      patch.completedWeeks = session.completedWeeks;
    }
    if (currentWeekChanged) {
      patch.currentWeek = session.currentWeek;
      // learningRoadmap may also change when currentWeek advances (Req 1.2).
      patch.learningRoadmap = session.learningRoadmap;
    }

    actualizarEstadoSesion(uid, patch).catch((err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : 'Error al actualizar el progreso.';
      console.error('[usePersistence] actualizarEstadoSesion (progress) failed:', err);
      setPersistError(message);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    session.quizScores,
    session.completedWeeks,
    session.currentWeek,
    session.diagnosticComplete,
    uid,
  ]);

  // ── Effect 3: Watch `sessionId` (Req 4.4, 4.6) ───────────────────────────
  //
  // When `sessionId` changes to a non-null, non-empty value AND `uid` is not
  // null, persist the new sessionId via a partial update.

  useEffect(() => {
    // Skip initial mount
    if (isFirstRender.current) {
      prevSessionId.current = session.sessionId;
      return;
    }

    const didChange = session.sessionId !== prevSessionId.current;
    prevSessionId.current = session.sessionId;

    if (!didChange) return;
    if (!session.sessionId) return;   // null or empty string → skip
    if (!uid) return;

    actualizarEstadoSesion(uid, { sessionId: session.sessionId }).catch(
      (err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : 'Error al guardar el ID de sesión.';
        console.error('[usePersistence] actualizarEstadoSesion (sessionId) failed:', err);
        setPersistError(message);
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionId, uid]);

  return { persistError, clearPersistError };
}
