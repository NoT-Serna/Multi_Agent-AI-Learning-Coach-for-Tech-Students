import { Target, Calendar, CheckCircle2, Plus, TrendingUp } from 'lucide-react';
import { goals } from '../data/mockData';
import { useAgentSession } from '../context/AgentSessionContext';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function daysUntil(iso: string) {
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return diff;
}

export default function ObjetivosPage() {
  const { session } = useAgentSession();
  const hasRoadmap = session.learningRoadmap.length > 0;

  // ── Roadmap mode ───────────────────────────────────────────────────────────
  if (hasRoadmap) {
    const roadmap = session.learningRoadmap;
    const completedWeeks = session.completedWeeks;

    const objectives = roadmap.map((week) => ({
      id:               week.week,
      title:            week.focus,
      progress:         completedWeeks.includes(week.week) ? 100 : 0,
      totalModules:     week.modules.length,
      completedModules: completedWeeks.includes(week.week) ? week.modules.length : 0,
    }));

    const totalWeeks     = roadmap.length;
    const completedCount = completedWeeks.length;
    const globalProgress = totalWeeks > 0
      ? Math.round((completedCount / totalWeeks) * 100)
      : 0;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Objetivos</h2>
            <p className="text-sm text-slate-500 mt-1">
              Tu plan de aprendizaje personalizado semana a semana
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-wide">
              <Target className="w-4 h-4" /> Semanas totales
            </div>
            <p className="text-2xl font-bold text-slate-800 mt-2">{totalWeeks}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-wide">
              <TrendingUp className="w-4 h-4" /> Progreso global
            </div>
            <p className="text-2xl font-bold text-slate-800 mt-2">{globalProgress}%</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-wide">
              <CheckCircle2 className="w-4 h-4" /> Semanas completadas
            </div>
            <p className="text-2xl font-bold text-slate-800 mt-2">
              {completedCount}/{totalWeeks}
            </p>
          </div>
        </div>

        {/* Objectives list */}
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {objectives.map((obj) => {
            const isCompleted = obj.progress === 100;
            const isCurrent   = obj.id === session.currentWeek;
            return (
              <div key={obj.id} className="p-5 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-slate-800">{obj.title}</h3>
                      {isCurrent && !isCompleted && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-600">
                          Semana actual
                        </span>
                      )}
                      {isCompleted && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-600">
                          Completada
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                      <span>Semana {obj.id}</span>
                      <span>{obj.completedModules} de {obj.totalModules} módulos</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isCompleted ? 'bg-green-500' : 'bg-indigo-500'
                        }`}
                        style={{ width: `${obj.progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-slate-800">{obj.progress}%</p>
                    <p className="text-xs text-slate-500">completado</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Mock-data fallback ─────────────────────────────────────────────────────
  const totalProgress  = Math.round(goals.reduce((a, g) => a + g.progress, 0) / goals.length);
  const completedTasks = goals.reduce((a, g) => a + g.completedTasks, 0);
  const totalTasks     = goals.reduce((a, g) => a + g.totalTasks, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Objetivos</h2>
          <p className="text-sm text-slate-500 mt-1">Gestiona tus metas de aprendizaje a largo plazo</p>
        </div>
        <button className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Nuevo objetivo
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-wide">
            <Target className="w-4 h-4" /> Objetivos activos
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">{goals.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-wide">
            <TrendingUp className="w-4 h-4" /> Progreso promedio
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">{totalProgress}%</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-wide">
            <CheckCircle2 className="w-4 h-4" /> Tareas completadas
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">{completedTasks}/{totalTasks}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {goals.map((g) => {
          const days   = daysUntil(g.deadline);
          const urgent = days <= 14;
          return (
            <div key={g.id} className="p-5 hover:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-slate-800">{g.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${urgent ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                      {days > 0 ? `${days} días restantes` : 'Vencido'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> {formatDate(g.deadline)}
                    </span>
                    <span>{g.completedTasks} de {g.totalTasks} tareas</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${g.progress}%` }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-800">{g.progress}%</p>
                  <p className="text-xs text-slate-500">completado</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
