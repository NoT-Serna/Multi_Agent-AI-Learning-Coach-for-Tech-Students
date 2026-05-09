import { goals } from '../data/mockData';
import type { RoadmapWeek } from '../types/agent';
import { calcularProgreso, calcularFechaLimite } from '../services/dashboardStatsService';

// ── Props ─────────────────────────────────────────────────────────────────────

interface GoalsProgressProps {
  roadmap: RoadmapWeek[];
  completedWeeks: number[];
  completedModulesByWeek: Record<number, Set<number>>;
  createdAt: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const progressColor = (progress: number) => {
  if (progress >= 80) return 'bg-green-500';
  if (progress >= 50) return 'bg-indigo-500';
  if (progress >= 30) return 'bg-yellow-500';
  return 'bg-red-400';
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function GoalsProgress(props: GoalsProgressProps): JSX.Element {
  const { roadmap, completedWeeks, completedModulesByWeek, createdAt } = props;

  const today = new Date().toISOString().slice(0, 10);

  // When roadmap is available, derive goals from it; otherwise fall back to mock data.
  if (roadmap.length > 0) {
    const derivedGoals = roadmap.map((week) => {
      const completedModulesForWeek: Set<number> = completedModulesByWeek[week.week] ?? new Set();
      const isCompleted = completedWeeks.includes(week.week);

      const progress = isCompleted
        ? 100
        : calcularProgreso(completedModulesForWeek.size, week.modules.length);

      const deadline = calcularFechaLimite(createdAt, week.week, today);

      return {
        weekNumber: week.week,
        title: week.focus,
        progress,
        deadline,
        completedModules: completedModulesForWeek.size,
        totalModules: week.modules.length,
      };
    });

    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-4">Objetivos de Aprendizaje</h3>

        <div className="space-y-4">
          {derivedGoals.map((goal) => (
            <div key={goal.weekNumber}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-slate-700">{goal.title}</span>
                <span className="text-xs text-slate-500">
                  {goal.completedModules}/{goal.totalModules} módulos
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${progressColor(goal.progress)}`}
                  style={{ width: `${goal.progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs font-medium text-slate-600">{goal.progress}%</span>
                <span className="text-xs text-slate-400">
                  Fecha límite:{' '}
                  {new Date(goal.deadline + 'T00:00:00').toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fallback: roadmap not available — show mock goals
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-800 mb-4">Objetivos de Aprendizaje</h3>

      <div className="space-y-4">
        {goals.map((goal) => (
          <div key={goal.id}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-slate-700">{goal.title}</span>
              <span className="text-xs text-slate-500">
                {goal.completedTasks}/{goal.totalTasks} tareas
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${progressColor(goal.progress)}`}
                style={{ width: `${goal.progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs font-medium text-slate-600">{goal.progress}%</span>
              <span className="text-xs text-slate-400">
                Fecha límite:{' '}
                {new Date(goal.deadline).toLocaleDateString('es-ES', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
