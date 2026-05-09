// src/services/dashboardStatsService.ts
// Pure calculation functions + Firestore CRUD for the real-dashboard-data feature.

import type { RoadmapModule } from '../types/agent';
import type { DashboardStats, WeekProgressData } from '../types/dashboard';
import { db } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
} from 'firebase/firestore';

// ── Duration mapping ──────────────────────────────────────────────────────────

export const DURATION_BY_DIFFICULTY: Record<string, number> = {
  'básico':     1.5,
  'intermedio': 2.0,
  'avanzado':   2.5,
};

// ── Pure calculation functions ────────────────────────────────────────────────

/**
 * Calculates the streak of consecutive study days counting backwards from the
 * most recent ActivityLog entry with completedCount >= 1.
 *
 * - Anchor date = most recent entry with completedCount >= 1.
 * - If anchor < yesterday (i.e. not today and not yesterday) → return 0.
 * - Otherwise count consecutive days backwards from anchor.
 * - Empty log → return 0.
 *
 * @param activityLog - Map of date (YYYY-MM-DD) → completedCount
 * @param today       - Current device date (YYYY-MM-DD). Injectable for tests.
 */
export function calcularStreakDays(
  activityLog: Record<string, number>,
  today: string,
): number {
  // Collect dates with at least one completed module
  const activeDates = Object.entries(activityLog)
    .filter(([, count]) => count >= 1)
    .map(([date]) => date)
    .sort(); // ascending lexicographic order (works for YYYY-MM-DD)

  if (activeDates.length === 0) return 0;

  // Anchor = most recent active date
  const anchor = activeDates[activeDates.length - 1];

  // Compute yesterday relative to today
  const todayDate = new Date(today + 'T00:00:00');
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);

  // If anchor is before yesterday, streak is broken
  if (anchor < yesterday) return 0;

  // Build a Set for O(1) lookups
  const activeDateSet = new Set(activeDates);

  // Count consecutive days backwards from anchor
  let streak = 0;
  const current = new Date(anchor + 'T00:00:00');

  while (activeDateSet.has(current.toISOString().slice(0, 10))) {
    streak++;
    current.setDate(current.getDate() - 1);
  }

  return streak;
}

/**
 * Calculates total estimated hours for completed modules in the current week.
 * Modules with unknown difficulty are excluded and a console.warn is emitted.
 *
 * @param modules      - Modules of the current roadmap week
 * @param completedSet - Set of completed module_numbers
 */
export function calcularTotalHoras(
  modules: RoadmapModule[],
  completedSet: Set<number>,
): number {
  if (completedSet.size === 0) return 0;

  let total = 0;

  for (const mod of modules) {
    if (!completedSet.has(mod.module_number)) continue;

    const duration = DURATION_BY_DIFFICULTY[mod.difficulty];
    if (duration === undefined) {
      console.warn(
        `calcularTotalHoras: unknown difficulty "${mod.difficulty}" for module ${mod.module_number}. Excluding from total.`,
      );
      continue;
    }

    total += duration;
  }

  return total;
}

/**
 * Calculates the arithmetic average of quiz scores filtered by completedWeeks.
 * Returns null if completedWeeks is empty.
 * Keys in quizScores that are not in completedWeeks are excluded.
 *
 * @param quizScores     - Map of weekNumber (string) → score (number)
 * @param completedWeeks - Array of completed week numbers
 */
export function calcularAverageScore(
  quizScores: Record<string, number>,
  completedWeeks: number[],
): number | null {
  if (completedWeeks.length === 0) return null;

  const relevantScores = completedWeeks
    .map((week) => quizScores[String(week)])
    .filter((score): score is number => score !== undefined);

  if (relevantScores.length === 0) return null;

  const sum = relevantScores.reduce((acc, score) => acc + score, 0);
  return Math.round(sum / relevantScores.length);
}

/**
 * Calculates the number of active goals (pending roadmap weeks).
 * Never returns a negative value.
 *
 * @param roadmapLength       - Total number of weeks in the roadmap
 * @param completedWeeksLength - Number of completed weeks
 */
export function calcularActiveGoals(
  roadmapLength: number,
  completedWeeksLength: number,
): number {
  return Math.max(0, roadmapLength - completedWeeksLength);
}

/**
 * Calculates the completion percentage for a week.
 * Returns 0 if totalModules === 0.
 *
 * @param completedCount - Number of completed modules
 * @param totalModules   - Total number of modules in the week
 */
export function calcularProgreso(
  completedCount: number,
  totalModules: number,
): number {
  if (totalModules === 0) return 0;
  return Math.round((completedCount / totalModules) * 100);
}

/**
 * Calculates the deadline date for a roadmap week.
 * Returns createdAt + weekNumber * 7 days in YYYY-MM-DD format.
 * If createdAt is null, undefined, or unparseable, uses today as reference.
 *
 * @param createdAt  - User creation date (ISO 8601 or similar parseable string)
 * @param weekNumber - Roadmap week number (1-based)
 * @param today      - Current device date (YYYY-MM-DD). Injectable for tests.
 */
export function calcularFechaLimite(
  createdAt: string | null | undefined,
  weekNumber: number,
  today: string,
): string {
  let baseDate: Date | null = null;

  if (createdAt != null && createdAt.trim() !== '') {
    const parsed = new Date(createdAt);
    if (!isNaN(parsed.getTime())) {
      baseDate = parsed;
    }
  }

  if (baseDate === null) {
    baseDate = new Date(today + 'T00:00:00');
  }

  const result = new Date(baseDate);
  result.setDate(result.getDate() + weekNumber * 7);

  return result.toISOString().slice(0, 10);
}

// ── CRUD Firestore ────────────────────────────────────────────────────────────
// Requirements: 1.1, 1.2, 1.6, 5.1, 5.2, 5.3, 5.4, 8.1

/**
 * Reads the dashboardStats document for the given user.
 * Returns null if the document does not exist.
 *
 * @param uid - Firebase Auth UID
 */
export async function leerDashboardStats(uid: string): Promise<DashboardStats | null> {
  const ref = doc(db, 'usuarios', uid, 'dashboardStats', 'dashboardStats');
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as DashboardStats;
}

/**
 * Writes (merge) the dashboardStats document for the given user.
 *
 * @param uid   - Firebase Auth UID
 * @param stats - DashboardStats object to persist
 */
export async function guardarDashboardStats(uid: string, stats: DashboardStats): Promise<void> {
  const ref = doc(db, 'usuarios', uid, 'dashboardStats', 'dashboardStats');
  await setDoc(ref, stats, { merge: true });
}

/**
 * Reads all documents from the activityLog subcollection.
 * Returns a map of date (YYYY-MM-DD) → completedCount.
 *
 * @param uid - Firebase Auth UID
 */
export async function leerActivityLog(uid: string): Promise<Record<string, number>> {
  const colRef = collection(db, 'usuarios', uid, 'activityLog');
  const snap = await getDocs(colRef);
  const result: Record<string, number> = {};
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    result[docSnap.id] = typeof data.completedCount === 'number' ? data.completedCount : 0;
  });
  return result;
}

/**
 * Registers activity for a given date by incrementing completedCount.
 * Uses setDoc with merge:true so the document is created if it doesn't exist.
 * Throws if the Firestore operation fails.
 *
 * @param uid  - Firebase Auth UID
 * @param date - Date string in YYYY-MM-DD format
 */
export async function registrarActividad(uid: string, date: string): Promise<void> {
  const ref = doc(db, 'usuarios', uid, 'activityLog', date);
  try {
    await setDoc(ref, { date, completedCount: increment(1) }, { merge: true });
  } catch (error) {
    throw error;
  }
}

/**
 * Reads the weekProgress document for the given week.
 * Returns a Set of completed module numbers.
 * Returns an empty Set if the document does not exist.
 *
 * @param uid        - Firebase Auth UID
 * @param weekNumber - Roadmap week number (1-based)
 */
export async function leerWeekProgress(uid: string, weekNumber: number): Promise<Set<number>> {
  const ref = doc(db, 'usuarios', uid, 'weekProgress', String(weekNumber));
  const snap = await getDoc(ref);
  if (!snap.exists()) return new Set<number>();
  const data = snap.data() as WeekProgressData;
  return new Set<number>(Array.isArray(data.completedModules) ? data.completedModules : []);
}

/**
 * Adds a module number to the completedModules array for the given week.
 * Uses setDoc with merge:true so the document is created if it doesn't exist.
 *
 * @param uid          - Firebase Auth UID
 * @param weekNumber   - Roadmap week number (1-based)
 * @param moduleNumber - module_number to mark as completed
 */
export async function guardarModuloCompletado(
  uid: string,
  weekNumber: number,
  moduleNumber: number,
): Promise<void> {
  const ref = doc(db, 'usuarios', uid, 'weekProgress', String(weekNumber));
  await setDoc(ref, { completedModules: arrayUnion(moduleNumber) }, { merge: true });
}

/**
 * Removes a module number from the completedModules array for the given week.
 * Uses updateDoc with arrayRemove.
 *
 * @param uid          - Firebase Auth UID
 * @param weekNumber   - Roadmap week number (1-based)
 * @param moduleNumber - module_number to unmark as completed
 */
export async function eliminarModuloCompletado(
  uid: string,
  weekNumber: number,
  moduleNumber: number,
): Promise<void> {
  const ref = doc(db, 'usuarios', uid, 'weekProgress', String(weekNumber));
  await updateDoc(ref, { completedModules: arrayRemove(moduleNumber) });
}
