/**
 * persistenceService.ts
 *
 * Pure functions for serialization, deserialization, sanitization,
 * error classification, and retry logic for the Firestore persistence layer.
 * Also exports async Firestore CRUD functions for session state and chat history.
 *
 * Validates: Requirements 1.1, 1.2, 1.6, 1.8, 1.10, 2.1, 2.5, 3.2, 3.5, 3.6, 4.1, 4.3
 */

import type { AgentSession } from '../context/AgentSessionContext';
import type {
  EstadoSesionFirestore,
  MensajeFirestore,
  MensajeChat,
} from '../types/persistence';
import { db } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  addDoc,
} from 'firebase/firestore';

// ── Serialization ─────────────────────────────────────────────────────────────

/**
 * Maps an `AgentSession` in memory to the `EstadoSesionFirestore` shape
 * that gets written to Firestore.
 *
 * - `updatedAt` is always set to the current ISO 8601 timestamp.
 * - `createdAt` is set to the current ISO 8601 timestamp here; when writing
 *   with merge, Firestore will preserve the original value on subsequent
 *   writes (the caller is responsible for using `setDoc` with `{merge: true}`
 *   and only setting `createdAt` on the first write).
 * - `sessionId` is coerced to a string (null → '').
 * - `studentName` may be null.
 *
 * UI-only fields (`loading`, `error`, `hydrating`, `diagnosticQuestions`)
 * are intentionally excluded.
 *
 * Validates: Requirements 1.1, 1.6, 4.1, 4.3
 */
export function serializarEstadoSesion(
  session: AgentSession,
  uid: string,
): EstadoSesionFirestore {
  const now = new Date().toISOString();

  return {
    // Session identity
    sessionId:          session.sessionId ?? '',
    studentName:        session.studentName,

    // Diagnostic
    diagnosticComplete: session.diagnosticComplete,

    // Diagnostic results
    skillScores:        session.skillScores,
    strongSkills:       session.strongSkills,
    weakSkills:         session.weakSkills,

    // Roadmap
    learningRoadmap:    session.learningRoadmap,
    currentWeek:        session.currentWeek,
    completedWeeks:     session.completedWeeks,

    // Quiz
    quizPassed:         session.quizPassed,
    quizScores:         session.quizScores,
    quizQuestions:      session.quizQuestions,

    // Metadata — uid is accepted as a parameter for future use (e.g. logging)
    // but is not stored in the document itself (it is the document path key).
    updatedAt:          now,
    createdAt:          now,
  };

  // Suppress "uid declared but never used" without removing the parameter,
  // since it is part of the public API and may be used by callers for logging.
  void uid;
}

// ── Deserialization ───────────────────────────────────────────────────────────

/**
 * Maps a sanitized `EstadoSesionFirestore` document back to a
 * `Partial<AgentSession>` suitable for restoring the in-memory context.
 *
 * - Calls `sanitizarEstadoSesion` internally before mapping.
 * - Does NOT include UI-only fields (`loading`, `error`, `hydrating`,
 *   `diagnosticQuestions`).
 *
 * Validates: Requirements 1.3, 1.6, 4.3
 */
export function deserializarEstadoSesion(
  doc: EstadoSesionFirestore,
): Partial<AgentSession> {
  const sanitized = sanitizarEstadoSesion(doc);

  return {
    sessionId:          sanitized.sessionId,
    studentName:        sanitized.studentName,
    diagnosticComplete: sanitized.diagnosticComplete,
    skillScores:        sanitized.skillScores,
    strongSkills:       sanitized.strongSkills,
    weakSkills:         sanitized.weakSkills,
    learningRoadmap:    sanitized.learningRoadmap,
    currentWeek:        sanitized.currentWeek,
    completedWeeks:     sanitized.completedWeeks,
    quizPassed:         sanitized.quizPassed,
    quizScores:         sanitized.quizScores,
    quizQuestions:      sanitized.quizQuestions,
  };
}

// ── Sanitization ──────────────────────────────────────────────────────────────

/**
 * Validates and fixes fields of an `EstadoSesionFirestore` document read
 * from Firestore. Returns a new object with all fields guaranteed to be
 * within valid ranges.
 *
 * Rules applied:
 * - `currentWeek`: if < 1, not a positive integer, NaN, null, or undefined → 1
 * - `diagnosticComplete`: if absent/undefined → false
 * - Arrays (strongSkills, weakSkills, completedWeeks, learningRoadmap,
 *   quizQuestions): if absent → []
 * - `skillScores`, `quizScores`: if absent → {}
 * - `quizPassed`: if absent → null
 * - `sessionId`: if absent → ''
 * - `studentName`: if absent → null
 *
 * Validates: Requirements 1.8
 */
export function sanitizarEstadoSesion(
  doc: EstadoSesionFirestore,
): EstadoSesionFirestore {
  // Cast to a looser type so we can safely access potentially-absent fields
  // that may arrive from Firestore even if the TypeScript type says they exist.
  const raw = doc as Record<string, unknown>;

  // currentWeek: must be a positive integer >= 1
  const rawWeek = raw['currentWeek'];
  const isValidWeek =
    typeof rawWeek === 'number' &&
    !Number.isNaN(rawWeek) &&
    Number.isInteger(rawWeek) &&
    rawWeek >= 1;
  const currentWeek: number = isValidWeek ? (rawWeek as number) : 1;

  // diagnosticComplete: default false
  const diagnosticComplete: boolean =
    typeof raw['diagnosticComplete'] === 'boolean'
      ? (raw['diagnosticComplete'] as boolean)
      : false;

  // Arrays: default []
  const strongSkills: string[] = Array.isArray(raw['strongSkills'])
    ? (raw['strongSkills'] as string[])
    : [];
  const weakSkills: string[] = Array.isArray(raw['weakSkills'])
    ? (raw['weakSkills'] as string[])
    : [];
  const completedWeeks: number[] = Array.isArray(raw['completedWeeks'])
    ? (raw['completedWeeks'] as number[])
    : [];
  const learningRoadmap = Array.isArray(raw['learningRoadmap'])
    ? (raw['learningRoadmap'] as EstadoSesionFirestore['learningRoadmap'])
    : [];
  const quizQuestions = Array.isArray(raw['quizQuestions'])
    ? (raw['quizQuestions'] as EstadoSesionFirestore['quizQuestions'])
    : [];

  // Objects: default {}
  const skillScores: Record<string, number> =
    raw['skillScores'] !== null &&
    raw['skillScores'] !== undefined &&
    typeof raw['skillScores'] === 'object' &&
    !Array.isArray(raw['skillScores'])
      ? (raw['skillScores'] as Record<string, number>)
      : {};
  const quizScores: Record<string, number> =
    raw['quizScores'] !== null &&
    raw['quizScores'] !== undefined &&
    typeof raw['quizScores'] === 'object' &&
    !Array.isArray(raw['quizScores'])
      ? (raw['quizScores'] as Record<string, number>)
      : {};

  // quizPassed: default null
  const quizPassed: boolean | null =
    typeof raw['quizPassed'] === 'boolean'
      ? (raw['quizPassed'] as boolean)
      : null;

  // sessionId: default ''
  const sessionId: string =
    typeof raw['sessionId'] === 'string' ? (raw['sessionId'] as string) : '';

  // studentName: default null
  const studentName: string | null =
    typeof raw['studentName'] === 'string'
      ? (raw['studentName'] as string)
      : null;

  return {
    sessionId,
    studentName,
    diagnosticComplete,
    skillScores,
    strongSkills,
    weakSkills,
    learningRoadmap,
    currentWeek,
    completedWeeks,
    quizPassed,
    quizScores,
    quizQuestions,
    updatedAt: typeof raw['updatedAt'] === 'string' ? (raw['updatedAt'] as string) : '',
    createdAt: typeof raw['createdAt'] === 'string' ? (raw['createdAt'] as string) : '',
  };
}

// ── Error classification ──────────────────────────────────────────────────────

/**
 * Classifies a Firestore (or generic) error into one of three categories.
 *
 * - Checks for a `code` property on the error object (FirebaseError shape).
 * - `'not-found'`  → code is `'not-found'`
 * - `'network'`    → code is `'unavailable'`, `'deadline-exceeded'`, or
 *                    `'resource-exhausted'`
 * - `'unknown'`    → any other code, including `'permission-denied'`,
 *                    `'unauthenticated'`, or non-FirebaseError values
 *
 * Validates: Requirements 3.5, 3.6
 */
export function clasificarErrorFirestore(
  error: unknown,
): 'not-found' | 'network' | 'unknown' {
  if (
    error !== null &&
    error !== undefined &&
    typeof error === 'object' &&
    'code' in error
  ) {
    const code = (error as { code: unknown }).code;

    if (code === 'not-found') {
      return 'not-found';
    }

    if (
      code === 'unavailable' ||
      code === 'deadline-exceeded' ||
      code === 'resource-exhausted'
    ) {
      return 'network';
    }
  }

  return 'unknown';
}

// ── Retry logic ───────────────────────────────────────────────────────────────

/**
 * Retries an async function up to `maxAttempts` times with a fixed delay
 * between attempts.
 *
 * - Only retries when `clasificarErrorFirestore` returns `'network'`.
 * - Does NOT retry on `'not-found'` or `'unknown'` errors.
 * - Propagates the last error after exhausting all attempts.
 *
 * Validates: Requirements 1.10, 3.2, 4.2
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 2000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const classification = clasificarErrorFirestore(error);

      // Only retry on transient network errors
      if (classification !== 'network') {
        throw error;
      }

      // If this was the last attempt, stop retrying
      if (attempt === maxAttempts) {
        break;
      }

      // Wait before the next attempt
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

// ── Chat message helper ───────────────────────────────────────────────────────

/**
 * Constructs a `MensajeFirestore` object (without the `id` field, which
 * Firestore assigns on write).
 *
 * Sets `timestamp` to the current ISO 8601 timestamp.
 *
 * Validates: Requirements 2.1
 */
export function construirMensajeFirestore(
  role: 'user' | 'coach',
  content: string,
): Omit<MensajeFirestore, 'id'> {
  return {
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

// ── Re-export MensajeChat for convenience ─────────────────────────────────────
// (consumers can import both the functions and the type from this module)
export type { MensajeChat };

// ── Firestore CRUD — Session state ───────────────────────────────────────────

/**
 * Reads the `/usuarios/{uid}/sesionAgente` document from Firestore.
 * Returns `null` if the document does not exist.
 * Uses `withRetry` internally for resilience against transient network errors.
 *
 * Validates: Requirements 1.1, 1.10, 3.2, 4.1
 */
export async function leerEstadoSesion(
  uid: string,
): Promise<EstadoSesionFirestore | null> {
  return withRetry(async () => {
    const ref = doc(db, 'usuarios', uid, 'sesionAgente', 'data');
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      return null;
    }

    return snap.data() as EstadoSesionFirestore;
  });
}

/**
 * Writes the full session state to `/usuarios/{uid}/sesionAgente` using
 * `setDoc` with `{ merge: true }`.
 *
 * - On first write, `createdAt` from the `estado` object is preserved.
 * - On subsequent writes, merge ensures only the provided fields are updated;
 *   `createdAt` already stored in Firestore is not overwritten because the
 *   caller is responsible for omitting it from the patch on updates (use
 *   `actualizarEstadoSesion` for partial updates).
 *
 * Validates: Requirements 1.1, 1.2, 4.1
 */
export async function guardarEstadoSesion(
  uid: string,
  estado: EstadoSesionFirestore,
): Promise<void> {
  const ref = doc(db, 'usuarios', uid, 'sesionAgente', 'data');
  await setDoc(ref, estado, { merge: true });
}

/**
 * Updates specific fields of `/usuarios/{uid}/sesionAgente` using `updateDoc`.
 * Always sets `updatedAt` to the current ISO 8601 timestamp in the patch.
 *
 * Validates: Requirements 1.2, 4.1
 */
export async function actualizarEstadoSesion(
  uid: string,
  patch: Partial<EstadoSesionFirestore>,
): Promise<void> {
  const ref = doc(db, 'usuarios', uid, 'sesionAgente', 'data');
  await updateDoc(ref, {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Deletes the `/usuarios/{uid}/sesionAgente` document from Firestore.
 * Used when the backend returns a 404 for the stored `sessionId`, requiring
 * a full session reset.
 *
 * Validates: Requirements 4.5
 */
export async function eliminarEstadoSesion(uid: string): Promise<void> {
  const ref = doc(db, 'usuarios', uid, 'sesionAgente', 'data');
  await deleteDoc(ref);
}

// ── Firestore CRUD — Chat history ─────────────────────────────────────────────

/**
 * Reads all documents from `/usuarios/{uid}/chatHistory` and returns them
 * as an array of `MensajeFirestore`, sorted by `timestamp` ascending
 * (ISO 8601 lexicographic order).
 *
 * - Each returned message has its `id` set to the Firestore document ID.
 * - Messages with an unparseable `timestamp` are placed at the end.
 *
 * Validates: Requirements 2.1, 2.5
 */
export async function leerHistorialChat(uid: string): Promise<MensajeFirestore[]> {
  const colRef = collection(db, 'usuarios', uid, 'chatHistory');
  const snap = await getDocs(colRef);

  const mensajes: MensajeFirestore[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<MensajeFirestore, 'id'>),
  }));

  // Sort by timestamp ascending; unparseable timestamps go to the end.
  mensajes.sort((a, b) => {
    const ta = Date.parse(a.timestamp);
    const tb = Date.parse(b.timestamp);

    const aValid = !Number.isNaN(ta);
    const bValid = !Number.isNaN(tb);

    if (aValid && bValid) return ta - tb;
    if (aValid) return -1;   // b is invalid → b goes to end
    if (bValid) return 1;    // a is invalid → a goes to end
    return 0;                // both invalid → preserve relative order
  });

  return mensajes;
}

/**
 * Adds a new message document to `/usuarios/{uid}/chatHistory` using `addDoc`.
 * The document ID is assigned automatically by Firestore.
 *
 * Validates: Requirements 2.1
 */
export async function guardarMensaje(
  uid: string,
  mensaje: Omit<MensajeFirestore, 'id'>,
): Promise<void> {
  const colRef = collection(db, 'usuarios', uid, 'chatHistory');
  await addDoc(colRef, mensaje);
}
