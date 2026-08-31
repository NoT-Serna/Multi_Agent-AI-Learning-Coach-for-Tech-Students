// src/hooks/useWeekProgress.ts
// Hook that manages the state of completed modules for a specific roadmap week.
// Reads from Firestore on mount and persists changes optimistically.
//
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 9.2, 9.4

import { useState, useEffect, useCallback } from 'react';
import {
  leerWeekProgress,
  guardarModuloCompletado,
  eliminarModuloCompletado,
} from '../services/dashboardStatsService';

export interface WeekProgressResult {
  completedModules: Set<number>;
  loading: boolean;
  toggleModule: (moduleNumber: number) => Promise<void>;
}

/**
 * Hook that manages the state of completed modules for a specific roadmap week.
 *
 * - On mount (or when uid/weekNumber change): reads weekProgress from Firestore.
 *   If it fails, initializes completedModules as empty Set and logs console.error.
 * - toggleModule: updates local state optimistically (add or remove from Set),
 *   then persists to Firestore. If Firestore fails, keeps the local change and
 *   logs console.error (does NOT revert).
 * - When uid is null: completedModules is empty Set, loading is false,
 *   toggleModule is a no-op.
 *
 * @param uid        - Firebase Auth UID (null if not authenticated)
 * @param weekNumber - Roadmap week number (currentWeek, 1-based)
 */
export function useWeekProgress(
  uid: string | null,
  weekNumber: number,
): WeekProgressResult {
  const [completedModules, setCompletedModules] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState<boolean>(false);

  // Load week progress from Firestore on mount or when uid/weekNumber change
  useEffect(() => {
    // When uid is null, return empty set immediately without loading
    if (uid === null) {
      setCompletedModules(new Set());
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);

    leerWeekProgress(uid, weekNumber)
      .then((modules) => {
        if (!cancelled) {
          setCompletedModules(modules);
          setLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(
            `useWeekProgress: failed to load week ${weekNumber} progress for uid ${uid}:`,
            error,
          );
          setCompletedModules(new Set());
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [uid, weekNumber]);

  // Toggle a module's completed state with optimistic update
  const toggleModule = useCallback(
    async (moduleNumber: number): Promise<void> => {
      // No-op when uid is null (unauthenticated)
      if (uid === null) return;

      // Determine whether we're adding or removing
      const isCurrentlyCompleted = completedModules.has(moduleNumber);

      // Optimistic update: apply the change to local state immediately
      setCompletedModules((prev) => {
        const next = new Set(prev);
        if (isCurrentlyCompleted) {
          next.delete(moduleNumber);
        } else {
          next.add(moduleNumber);
        }
        return next;
      });

      // Persist to Firestore (do NOT revert on failure — Req 5.6)
      try {
        if (isCurrentlyCompleted) {
          await eliminarModuloCompletado(uid, weekNumber, moduleNumber);
        } else {
          await guardarModuloCompletado(uid, weekNumber, moduleNumber);
        }
      } catch (error) {
        console.error(
          `useWeekProgress: failed to persist module ${moduleNumber} toggle for week ${weekNumber}:`,
          error,
        );
        // Intentionally NOT reverting the optimistic update (Requirement 5.6)
      }
    },
    [uid, weekNumber, completedModules],
  );

  return { completedModules, loading, toggleModule };
}
