import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import {
  Target,
  TrendingUp,
  CheckCircle2,
  Circle,
  BookOpen,
  RotateCcw,
  Loader2,
  Minus,
  GraduationCap,
} from 'lucide-react';
import { useAgentSession } from '../context/AgentSessionContext';
import { useStudyCalendar } from '../hooks/useStudyCalendar';
import { toggleEventCompleted } from '../services/calendarService';
import {
  guardarModuloCompletado,
  eliminarModuloCompletado,
} from '../services/dashboardStatsService';
import type { CalendarEvent } from '../types/calendar';
import type { TabId } from '../components/Sidebar';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function pctColor(pct: number) {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 50) return 'bg-indigo-500';
  if (pct >= 30) return 'bg-yellow-400';
  return 'bg-slate-300';
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ObjetivosPageProps {
  onNavigate: (tab: TabId) => void;
}

export default function ObjetivosPage({ onNavigate }: ObjetivosPageProps) {
  const { session } = useAgentSession();
  const { learningRoadmap: roadmap, completedWeeks, currentWeek } = session;

  const { events, loading } = useStudyCalendar(session.diagnosticComplete);

  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const uid = getAuth().currentUser?.uid;

  const actionableEvents = events.filter((e) => e.type !== 'deadline');

  // Double-keyed: week → moduleNumber → events[]
  const byWeekModule = actionableEvents.reduce<Record<number, Record<number, CalendarEvent[]>>>(
    (acc, e) => {
      (acc[e.week] ??= {})[e.moduleNumber] ??= [];
      acc[e.week][e.moduleNumber].push(e);
      return acc;
    },
    {},
  );

  const totalEvents = actionableEvents.length;
  const completedEvents = actionableEvents.filter((e) => e.completed).length;
  const globalPct = totalEvents > 0 ? Math.round((completedEvents / totalEvents) * 100) : 0;

  const handleToggle = async (event: CalendarEvent) => {
    if (!uid || toggling.has(event.id)) return;
    setToggling((prev) => new Set(prev).add(event.id));
    try {
      const newCompleted = !event.completed;
      await toggleEventCompleted(uid, event.id, newCompleted);

      // Sync week_progress so WeeklyPlan / QuizPage stay in sync
      if (event.week === currentWeek && event.moduleNumber > 0) {
        const modEvents = actionableEvents.filter(
          (e) => e.week === currentWeek && e.moduleNumber === event.moduleNumber,
        );
        const allDoneAfter = modEvents.every((e) =>
          e.id === event.id ? newCompleted : e.completed,
        );
        if (allDoneAfter) {
          await guardarModuloCompletado(uid, currentWeek, event.moduleNumber);
        } else {
          await eliminarModuloCompletado(uid, currentWeek, event.moduleNumber);
        }
      }
    } catch (err) {
      console.error('[ObjetivosPage] toggle failed:', err);
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(event.id);
        return next;
      });
    }
  };

  const handleToggleModule = async (modEvents: CalendarEvent[], targetCompleted: boolean) => {
    if (!uid || modEvents.length === 0) return;
    const ids = modEvents.map((e) => e.id);
    if (ids.some((id) => toggling.has(id))) return;
    setToggling((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    try {
      await Promise.all(ids.map((id) => toggleEventCompleted(uid, id, targetCompleted)));

      // Sync week_progress so WeeklyPlan / QuizPage stay in sync
      const weekNum = modEvents[0]?.week;
      const modNum = modEvents[0]?.moduleNumber;
      if (weekNum === currentWeek && modNum > 0) {
        if (targetCompleted) {
          await guardarModuloCompletado(uid, currentWeek, modNum);
        } else {
          await eliminarModuloCompletado(uid, currentWeek, modNum);
        }
      }
    } catch (err) {
      console.error('[ObjetivosPage] toggleModule failed:', err);
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  // ── No roadmap yet ────────────────────────────────────────────────────────
  if (roadmap.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Objetivos</h2>
          <p className="text-sm text-slate-500 mt-1">Tu plan de aprendizaje semana a semana</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <Target className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            Completa el diagnóstico inicial para ver tus objetivos personalizados.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">Objetivos</h2>
        <p className="text-sm text-slate-500 mt-1">
          Tu plan de aprendizaje personalizado semana a semana
        </p>
      </div>

      {/* ── Stats cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-wide">
            <Target className="w-4 h-4" /> Semanas totales
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">{roadmap.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-wide">
            <TrendingUp className="w-4 h-4" /> Progreso global
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">
            {loading ? '–' : `${globalPct}%`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-wide">
            <CheckCircle2 className="w-4 h-4" /> Tareas completadas
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">
            {loading ? '–' : `${completedEvents}/${totalEvents}`}
          </p>
        </div>
      </div>

      {/* ── Loading skeleton ────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Cargando objetivos...</span>
        </div>
      )}

      {/* ── Week cards ─────────────────────────────────────────────────── */}
      {!loading && (
        <div className="space-y-4">
          {roadmap.map((week) => {
            const weekModMap = byWeekModule[week.week] ?? {};
            const allWeekEvents = Object.values(weekModMap).flat();
            const done = allWeekEvents.filter((e) => e.completed).length;
            const total = allWeekEvents.length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const isWeekDone = completedWeeks.includes(week.week);
            const isCurrent = week.week === currentWeek;
            // Only the current week is editable
            const canEdit = isCurrent;
            const allWeekTasksDone = allWeekEvents.length > 0 && allWeekEvents.every((e) => e.completed);

            return (
              <div
                key={week.week}
                className={`rounded-xl border overflow-hidden ${
                  isWeekDone ? 'border-green-200' : 'border-slate-200'
                } bg-white`}
              >
                {/* ── Week header ──────────────────────────────────────── */}
                <div
                  className={`px-5 py-4 ${
                    isWeekDone ? 'bg-green-50' : isCurrent ? 'bg-indigo-50' : 'bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${
                          isWeekDone
                            ? 'bg-green-200 text-green-800'
                            : isCurrent
                            ? 'bg-indigo-200 text-indigo-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        Semana {week.week}
                      </span>
                      <h3 className="font-semibold text-slate-800">{week.focus}</h3>
                      {isCurrent && !isWeekDone && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-medium">
                          En curso
                        </span>
                      )}
                      {isWeekDone && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-600 font-medium">
                          ✓ Completada
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-sm font-semibold ${isWeekDone ? 'text-green-600' : 'text-slate-600'}`}
                    >
                      {done}/{total} tareas · {pct}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 w-full h-2 bg-white/60 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${pctColor(pct)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* ── Modules + daily events ───────────────────────────── */}
                <div className="divide-y divide-slate-100">
                  {week.modules.map((mod) => {
                    const modEvents = weekModMap[mod.module_number] ?? [];
                    const modDone = modEvents.filter((e) => e.completed).length;
                    const modTotal = modEvents.length;
                    const allDone = modTotal > 0 && modDone === modTotal;
                    const someDone = modDone > 0 && !allDone;
                    const isModPending = modEvents.some((e) => toggling.has(e.id));

                    return (
                      <div key={mod.module_number}>
                        {/* Module header row */}
                        <div className={`flex items-start gap-3 px-5 py-3.5 ${allDone ? 'bg-green-50' : ''}`}>
                          <button
                            disabled={!canEdit || isModPending || modTotal === 0}
                            onClick={() => handleToggleModule(modEvents, !allDone)}
                            className={`mt-0.5 shrink-0 transition-opacity ${
                              canEdit && modTotal > 0
                                ? 'cursor-pointer hover:opacity-75'
                                : 'cursor-default'
                            } ${isModPending ? 'opacity-50' : ''}`}
                          >
                            {allDone ? (
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                            ) : someDone ? (
                              <Minus className="w-5 h-5 text-indigo-400" />
                            ) : (
                              <Circle className="w-5 h-5 text-slate-300" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p
                                className={`text-sm font-bold ${
                                  allDone ? 'text-green-700 line-through' : 'text-slate-800'
                                }`}
                              >
                                {mod.name}
                              </p>
                              <span
                                className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                                  allDone
                                    ? 'bg-green-100 text-green-600'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {modDone}/{modTotal}
                              </span>
                              {mod.difficulty && (
                                <span
                                  className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                                    mod.difficulty === 'básico'
                                      ? 'bg-green-100 text-green-700'
                                      : mod.difficulty === 'intermedio'
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {mod.difficulty}
                                </span>
                              )}
                            </div>
                            {mod.objective && (
                              <div className="flex items-start gap-1 mt-1">
                                <Target
                                  className={`w-3 h-3 shrink-0 mt-0.5 ${
                                    allDone ? 'text-green-400' : 'text-indigo-400'
                                  }`}
                                />
                                <p
                                  className={`text-xs leading-snug ${
                                    allDone
                                      ? 'text-green-600 line-through'
                                      : 'text-indigo-600 font-medium'
                                  }`}
                                >
                                  {mod.objective}
                                </p>
                              </div>
                            )}
                            {allDone && (
                              <p className="text-xs text-green-600 font-semibold mt-0.5">
                                ✓ Completado
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Daily events for this module (indented) */}
                        {modEvents.map((event) => {
                          const isPending = toggling.has(event.id);
                          const Icon = event.type === 'review' ? RotateCcw : BookOpen;
                          const label = event.objective || event.title;

                          return (
                            <button
                              key={event.id}
                              disabled={!canEdit || isPending}
                              onClick={() => handleToggle(event)}
                              className={`w-full flex items-start gap-3 pl-14 pr-5 py-2.5 text-left transition-colors ${
                                event.completed
                                  ? 'bg-green-50 hover:bg-green-100'
                                  : 'hover:bg-slate-50'
                              } ${
                                isPending
                                  ? 'opacity-50 cursor-wait'
                                  : !canEdit
                                  ? 'cursor-default'
                                  : 'cursor-pointer'
                              }`}
                            >
                              <div className="mt-0.5 shrink-0">
                                {event.completed ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                ) : (
                                  <Circle className="w-4 h-4 text-slate-300" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 flex-wrap">
                                  <p
                                    className={`text-xs font-medium leading-snug ${
                                      event.completed
                                        ? 'text-green-700 line-through'
                                        : 'text-slate-700'
                                    }`}
                                  >
                                    {label}
                                  </p>
                                  <Icon
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      event.completed ? 'text-green-400' : 'text-slate-400'
                                    }`}
                                  />
                                </div>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <span className="text-xs text-slate-400">
                                    {formatDate(event.date)}
                                  </span>
                                  {event.duration_minutes && (
                                    <span className="text-xs text-slate-400">
                                      {event.duration_minutes} min
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Review events (moduleNumber 0 — not tied to a specific module) */}
                  {(weekModMap[0] ?? []).length > 0 && (
                    <div>
                      <div className="px-5 py-2 bg-amber-50/60 border-t border-amber-100">
                        <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
                          Repaso semanal
                        </span>
                      </div>
                      {(weekModMap[0] ?? []).map((event) => {
                        const isPending = toggling.has(event.id);
                        const label = event.objective || event.title;
                        return (
                          <button
                            key={event.id}
                            disabled={!canEdit || isPending}
                            onClick={() => handleToggle(event)}
                            className={`w-full flex items-start gap-3 px-5 py-2.5 text-left transition-colors ${
                              event.completed
                                ? 'bg-green-50 hover:bg-green-100'
                                : 'hover:bg-slate-50'
                            } ${
                              isPending
                                ? 'opacity-50 cursor-wait'
                                : !canEdit
                                ? 'cursor-default'
                                : 'cursor-pointer'
                            }`}
                          >
                            <div className="mt-0.5 shrink-0">
                              {event.completed ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                              ) : (
                                <Circle className="w-4 h-4 text-slate-300" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p
                                  className={`text-xs font-medium ${
                                    event.completed ? 'text-green-700 line-through' : 'text-slate-700'
                                  }`}
                                >
                                  {label}
                                </p>
                                <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              </div>
                              <span className="text-xs text-slate-400">
                                {formatDate(event.date)}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Quiz button — only when current week and all tasks done ── */}
                {isCurrent && !isWeekDone && allWeekTasksDone && (
                  <div className="flex items-center justify-end px-5 py-4 border-t-2 border-indigo-100 bg-indigo-50">
                    <button
                      onClick={() => onNavigate('quiz')}
                      className="flex items-center gap-2 text-sm font-semibold px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
                    >
                      <GraduationCap className="w-4 h-4" />
                      Ir al Quiz
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
