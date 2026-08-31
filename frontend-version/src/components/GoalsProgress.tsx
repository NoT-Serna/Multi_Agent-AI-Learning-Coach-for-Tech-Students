import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  BookOpen,
  RotateCcw,
  Minus,
  GraduationCap,
  Target,
} from 'lucide-react';
import { useStudyCalendar } from '../hooks/useStudyCalendar';
import { useAgentSession } from '../context/AgentSessionContext';
import { toggleEventCompleted } from '../services/calendarService';
import type { RoadmapWeek } from '../types/agent';
import type { CalendarEvent } from '../types/calendar';
import type { TabId } from './Sidebar';

// ── Props ─────────────────────────────────────────────────────────────────────

interface GoalsProgressProps {
  roadmap: RoadmapWeek[];
  completedWeeks: number[];
  onNavigate: (tab: TabId) => void;
  // kept for API compat with App.tsx — unused internally
  completedModulesByWeek?: Record<number, Set<number>>;
  createdAt?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 50) return 'bg-indigo-500';
  if (pct >= 30) return 'bg-yellow-400';
  return 'bg-slate-300';
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GoalsProgress({ roadmap, completedWeeks, onNavigate }: GoalsProgressProps) {
  const { session } = useAgentSession();
  const { currentWeek } = session;

  const diagnosticComplete = roadmap.length > 0;
  const { events, loading } = useStudyCalendar(diagnosticComplete);

  const firstPending = roadmap.find((w) => !completedWeeks.includes(w.week))?.week ?? 1;
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(
    () => new Set([firstPending]),
  );
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

  const toggleWeek = (week: number) =>
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      next.has(week) ? next.delete(week) : next.add(week);
      return next;
    });

  const handleToggle = async (event: CalendarEvent) => {
    if (!uid || toggling.has(event.id)) return;
    setToggling((prev) => new Set(prev).add(event.id));
    try {
      await toggleEventCompleted(uid, event.id, !event.completed);
    } catch (err) {
      console.error('[GoalsProgress] toggle failed:', err);
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
    } catch (err) {
      console.error('[GoalsProgress] toggleModule failed:', err);
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  // ── No roadmap yet ────────────────────────────────────────────────────────
  if (!diagnosticComplete) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-3">Objetivos de Aprendizaje</h3>
        <p className="text-sm text-slate-400">
          Completa el diagnóstico para ver tus objetivos semanales.
        </p>
      </div>
    );
  }

  // ── Skeleton while Firestore loads ────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-3">Objetivos de Aprendizaje</h3>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-slate-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-800 mb-3">Objetivos de Aprendizaje</h3>

      <div className="space-y-2">
        {roadmap.map((week) => {
          const weekModMap = byWeekModule[week.week] ?? {};
          const allWeekEvents = Object.values(weekModMap).flat();
          const completedCount = allWeekEvents.filter((e) => e.completed).length;
          const total = allWeekEvents.length;
          const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
          const isWeekDone = completedWeeks.includes(week.week);
          const isCurrent = week.week === currentWeek;
          const canEdit = isCurrent;
          const isExpanded = expandedWeeks.has(week.week);
          const allWeekTasksDone =
            allWeekEvents.length > 0 && allWeekEvents.every((e) => e.completed);

          return (
            <div
              key={week.week}
              className={`rounded-lg border overflow-hidden transition-colors ${
                isWeekDone ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'
              }`}
            >
              {/* ── Week header (accordion) ──────────────────────────────── */}
              <button
                onClick={() => toggleWeek(week.week)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      isWeekDone
                        ? 'bg-green-200 text-green-800'
                        : isCurrent
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    S{week.week}
                  </span>
                  <span className="text-sm font-medium text-slate-700 truncate">
                    {week.focus}
                  </span>
                  {isCurrent && !isWeekDone && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-500 shrink-0">
                      En curso
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span
                    className={`text-xs font-medium ${
                      isWeekDone ? 'text-green-600' : 'text-slate-500'
                    }`}
                  >
                    {completedCount}/{total}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>
              </button>

              {/* ── Progress bar ─────────────────────────────────────────── */}
              <div className="px-3 pb-1">
                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${pctColor(pct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* ── Expanded: modules + daily events ─────────────────────── */}
              {isExpanded && (
                <div className="pt-1 pb-2">
                  {week.modules.map((mod) => {
                    const modEvents = weekModMap[mod.module_number] ?? [];
                    const modDone = modEvents.filter((e) => e.completed).length;
                    const modTotal = modEvents.length;
                    const allDone = modTotal > 0 && modDone === modTotal;
                    const someDone = modDone > 0 && !allDone;
                    const isModPending = modEvents.some((e) => toggling.has(e.id));

                    return (
                      <div key={mod.module_number}>
                        {/* Module row */}
                        <div
                          className={`flex items-center gap-2 px-2 py-2 ${
                            allDone ? 'bg-green-50' : ''
                          }`}
                        >
                          <button
                            disabled={!canEdit || isModPending || modTotal === 0}
                            onClick={() => handleToggleModule(modEvents, !allDone)}
                            className={`shrink-0 transition-opacity ${
                              canEdit && modTotal > 0
                                ? 'cursor-pointer hover:opacity-75'
                                : 'cursor-default'
                            } ${isModPending ? 'opacity-50' : ''}`}
                          >
                            {allDone ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : someDone ? (
                              <Minus className="w-4 h-4 text-indigo-400" />
                            ) : (
                              <Circle className="w-4 h-4 text-slate-300" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p
                                className={`text-xs font-bold truncate ${
                                  allDone ? 'text-green-700 line-through' : 'text-slate-800'
                                }`}
                              >
                                {mod.name}
                              </p>
                              <span
                                className={`text-xs shrink-0 ${
                                  allDone ? 'text-green-500' : 'text-slate-400'
                                }`}
                              >
                                {modDone}/{modTotal}
                              </span>
                            </div>
                            {mod.objective && (
                              <div className="flex items-start gap-1 mt-0.5">
                                <Target
                                  className={`w-2.5 h-2.5 shrink-0 mt-0.5 ${
                                    allDone ? 'text-green-400' : 'text-indigo-400'
                                  }`}
                                />
                                <p
                                  className={`text-xs leading-tight ${
                                    allDone
                                      ? 'text-green-500 line-through'
                                      : 'text-indigo-500 font-medium'
                                  }`}
                                >
                                  {mod.objective}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Daily events (indented) */}
                        {modEvents.map((event) => {
                          const isPending = toggling.has(event.id);
                          const isStudy = event.type === 'study';
                          const Icon = isStudy ? BookOpen : RotateCcw;
                          const label = event.objective || event.title;

                          return (
                            <button
                              key={event.id}
                              disabled={!canEdit || isPending}
                              onClick={() => handleToggle(event)}
                              className={`w-full flex items-start gap-2 pl-8 pr-2 py-1.5 text-left transition-colors rounded-md ${
                                event.completed ? 'bg-green-50' : 'hover:bg-slate-50'
                              } ${
                                isPending
                                  ? 'opacity-50 cursor-wait'
                                  : !canEdit
                                  ? 'cursor-default'
                                  : 'cursor-pointer'
                              }`}
                            >
                              {event.completed ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                              ) : (
                                <Circle className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`text-xs leading-tight truncate ${
                                    event.completed
                                      ? 'text-green-700 line-through'
                                      : 'text-slate-600'
                                  }`}
                                >
                                  {label}
                                </p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <Icon
                                    className={`w-2.5 h-2.5 ${
                                      event.completed ? 'text-green-400' : 'text-slate-400'
                                    }`}
                                  />
                                  <span className="text-xs text-slate-400">
                                    {formatDate(event.date)}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Review events (moduleNumber 0) */}
                  {(weekModMap[0] ?? []).map((event) => {
                    const isPending = toggling.has(event.id);
                    const label = event.objective || event.title;
                    return (
                      <button
                        key={event.id}
                        disabled={!canEdit || isPending}
                        onClick={() => handleToggle(event)}
                        className={`w-full flex items-start gap-2 px-2 py-1.5 text-left transition-colors rounded-md ${
                          event.completed ? 'bg-green-50' : 'hover:bg-slate-50'
                        } ${
                          isPending
                            ? 'opacity-50 cursor-wait'
                            : !canEdit
                            ? 'cursor-default'
                            : 'cursor-pointer'
                        }`}
                      >
                        {event.completed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-xs leading-tight ${
                              event.completed ? 'text-green-700 line-through' : 'text-slate-600'
                            }`}
                          >
                            {label}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <RotateCcw className="w-2.5 h-2.5 text-amber-400" />
                            <span className="text-xs text-slate-400">{formatDate(event.date)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {/* ── Quiz row (non-toggleable) ──────────────────────── */}
                  <div
                    className={`flex items-center gap-2 mx-1 mt-2 px-2 py-2 rounded-md border ${
                      isWeekDone
                        ? 'border-green-200 bg-green-50'
                        : isCurrent && allWeekTasksDone
                        ? 'border-indigo-200 bg-indigo-50'
                        : 'border-slate-100 bg-slate-50'
                    }`}
                  >
                    <GraduationCap
                      className={`w-4 h-4 shrink-0 ${
                        isWeekDone
                          ? 'text-green-500'
                          : isCurrent && allWeekTasksDone
                          ? 'text-indigo-500'
                          : 'text-slate-300'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs font-semibold ${
                          isWeekDone
                            ? 'text-green-700'
                            : isCurrent && allWeekTasksDone
                            ? 'text-indigo-700'
                            : 'text-slate-400'
                        }`}
                      >
                        Quiz Semanal
                      </p>
                      {isWeekDone && (
                        <p className="text-xs text-green-500">✓ Aprobado</p>
                      )}
                      {!isWeekDone && isCurrent && !allWeekTasksDone && (
                        <p className="text-xs text-slate-400">Completa las tareas primero</p>
                      )}
                    </div>
                    {isCurrent && !isWeekDone && allWeekTasksDone && (
                      <button
                        onClick={() => onNavigate('quiz')}
                        className="text-xs font-semibold px-2 py-1 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 transition-colors shrink-0"
                      >
                        Ir al Quiz
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
