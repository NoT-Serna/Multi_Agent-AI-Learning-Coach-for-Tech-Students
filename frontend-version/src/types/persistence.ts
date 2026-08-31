/**
 * persistence.ts
 *
 * Shared types for Firestore persistence layer.
 *
 * - EstadoSesionFirestore: shape of the /usuarios/{uid}/sesionAgente document.
 * - MensajeFirestore: shape of each document in /usuarios/{uid}/chatHistory.
 * - MensajeChat: in-memory equivalent of MensajeFirestore (same fields).
 * - ErrorFirestore: classification of Firestore errors.
 */

import type { RoadmapWeek, QuizQuestion } from './agent';

// ── Error classification ──────────────────────────────────────────────────────

/**
 * Classifies a Firestore error into one of three categories:
 * - 'not-found': document does not exist (treat as initial state, no retry).
 * - 'network': transient connectivity issue (retry up to 3 times).
 * - 'unknown': any other error (log and surface to user).
 *
 * Validates: Requirements 3.5, 3.6
 */
export type ErrorFirestore = 'not-found' | 'network' | 'unknown';

// ── Firestore document: /usuarios/{uid}/sesionAgente ─────────────────────────

/**
 * Represents the Firestore document that persists the student's learning
 * session state. Written on diagnostic completion and updated (merge) on
 * every relevant state change.
 *
 * Validation rules applied when reading:
 * - currentWeek: if < 1, not a positive integer, or NaN → set to 1.
 * - diagnosticComplete: if absent → treated as false.
 * - Arrays (strongSkills, weakSkills, completedWeeks, learningRoadmap,
 *   quizQuestions): if absent → treated as [].
 * - skillScores, quizScores: if absent → treated as {}.
 *
 * Validates: Requirements 1.1, 1.6, 4.1
 */
export interface EstadoSesionFirestore {
  // Session identity
  sessionId: string;
  studentName: string | null;

  // Diagnostic
  diagnosticComplete: boolean;

  // Diagnostic results
  skillScores: Record<string, number>;
  strongSkills: string[];
  weakSkills: string[];

  // Roadmap
  learningRoadmap: RoadmapWeek[];  // serialized array of week objects
  currentWeek: number;             // always >= 1 after sanitization
  completedWeeks: number[];

  // Quiz
  quizPassed: boolean | null;
  quizScores: Record<string, number>;
  quizQuestions: QuizQuestion[];   // serialized array of question objects

  // Metadata
  updatedAt: string;  // ISO 8601 — updated on every write
  createdAt: string;  // ISO 8601 — set only on first write
}

// ── Firestore document: /usuarios/{uid}/chatHistory/{docId} ──────────────────

/**
 * Represents a single chat message as stored in Firestore.
 * The `id` field holds the Firestore-assigned document ID and is populated
 * when reading the collection.
 *
 * Ordering rule: messages are sorted by `timestamp` ascending (ISO 8601
 * lexicographic order). Messages with an unparseable timestamp are placed
 * at the end.
 *
 * Validates: Requirements 2.1, 2.4
 */
export interface MensajeFirestore {
  id: string;               // Firestore document ID (assigned on read)
  role: 'user' | 'coach';
  content: string;
  timestamp: string;        // ISO 8601 — e.g. "2025-01-15T14:32:00.000Z"
}

// ── In-memory chat message ────────────────────────────────────────────────────

/**
 * In-memory equivalent of MensajeFirestore. Kept in ChatHistoryContext and
 * rendered by CoachIAPage / CoachChat. Structurally identical to
 * MensajeFirestore so that serialization is a no-op identity mapping.
 *
 * Validates: Requirements 2.1, 2.4
 */
export interface MensajeChat {
  id: string;
  role: 'user' | 'coach';
  content: string;
  timestamp: string;        // ISO 8601
}
