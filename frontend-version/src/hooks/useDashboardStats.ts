// src/hooks/useDashboardStats.ts
// Hook that connects dashboardStatsService with dashboard components.
// Requirements: 1.3, 1.4, 2.3, 2.4, 2.5, 3.2, 3.3, 4.2, 4.3, 8.2, 8.4, 9.1, 9.3

import { useState, useEffect, useMemo } from 'react';
import type { AgentSession } from '../context/AgentSessionContext';
import {
  leerDashboardStats,
  leerActivityLog,
  calcularTotalHoras,
  calcularAverageScore,
  calcularActiveGoals,
} from '../services/dashboardStatsService';

// ── Public interface ──────────────────────────────────────────────────────────

export interface DashboardStatsResult {
  streakDays: number;
  totalHoursThisWeek: number;
  averageScore: number | null; // null when completedWeeks is empty
  activeGoals: number;
  loading: boolean;
}

// Re-export AgentSession so callers can import it from this module if needed
export type { AgentSession };

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Calculates and exposes dashboard metrics.
 *
 * - On mount: reads dashboardStats and activityLog from Firestore in parallel.
 *   If either fails, falls back to values derived from session context and logs
 *   the error with console.error.
 * - loading = true while Firestore hasn't responded; false after response or error.
 * - Reactively recalculates totalHoursThisWeek, averageScore, and activeGoals
 *   whenever session (roadmap, completedWeeks, quizScores) or
 *   completedModulesCurrentWeek change.
 *
 * @param uid                        - Authenticated user UID (null if not authenticated)
 * @param session                    - AgentSessionContext session object
 * @param completedModulesCurrentWeek - Set of completed module numbers for the current week
 */
export function useDashboardStats(
  uid: string | null,
  session: AgentSession,
  completedModulesCurrentWeek: Set<number>,
): DashboardStatsResult {
  // streakDays comes from Firestore; 0 is the fallback
  const [streakDays, setStreakDays] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // ── Firestore fetch on mount (or when uid changes) ────────────────────────
  useEffect(() => {
    // If there is no authenticated user, skip Firestore and use fallback values
    if (!uid) {
      setStreakDays(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      leerDashboardStats(uid),
      leerActivityLog(uid),
    ])
      .then(([dashboardStats]) => {
        if (cancelled) return;
        // streakDays comes from the persisted dashboardStats document
        setStreakDays(dashboardStats?.streakDays ?? 0);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('useDashboardStats: error loading Firestore data, using fallback values', error);
        // Fallback: streakDays = 0 (no ActivityLog available locally)
        setStreakDays(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  // ── Reactive calculations from session + completedModulesCurrentWeek ──────

  // Modules of the current week (currentWeek is 1-based, roadmap index is 0-based)
  const currentWeekModules = useMemo(() => {
    const weekIndex = session.currentWeek - 1;
    return session.learningRoadmap[weekIndex]?.modules ?? [];
  }, [session.learningRoadmap, session.currentWeek]);

  const totalHoursThisWeek = useMemo(
    () => calcularTotalHoras(currentWeekModules, completedModulesCurrentWeek),
    [currentWeekModules, completedModulesCurrentWeek],
  );

  const averageScore = useMemo(
    () => calcularAverageScore(session.quizScores, session.completedWeeks),
    [session.quizScores, session.completedWeeks],
  );

  const activeGoals = useMemo(
    () => calcularActiveGoals(session.learningRoadmap.length, session.completedWeeks.length),
    [session.learningRoadmap, session.completedWeeks],
  );

  return {
    streakDays,
    totalHoursThisWeek,
    averageScore,
    activeGoals,
    loading,
  };
}
