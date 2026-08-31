// src/types/dashboard.ts
// Types for the real dashboard data feature (real-dashboard-data spec)

export interface DashboardStats {
  streakDays: number;
  updatedAt: string; // ISO 8601
}

export interface WeekProgressData {
  completedModules: number[];
}

export interface ActivityLogEntry {
  date: string;        // YYYY-MM-DD
  completedCount: number;
}

export interface GoalItem {
  weekNumber: number;
  title: string;       // week.focus
  progress: number;    // 0–100
  deadline: string;    // YYYY-MM-DD
  completedModules: number;
  totalModules: number;
}
