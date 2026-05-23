import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  AlertCircle,
  RotateCcw,
  Plus,
  CheckCircle,
  Loader2,
  CalendarX,
  RefreshCw,
  Clock,
  ExternalLink,
  Lightbulb,
  Target,
} from 'lucide-react';
import type { CalendarEvent } from '../types/calendar';
import { useStudyCalendar } from '../hooks/useStudyCalendar';
import { markEventCompleted } from '../services/calendarService';
import { auth } from '../services/firebase';
import { useAgentSession } from '../context/AgentSessionContext';

const eventTypeStyles: Record<
  CalendarEvent['type'],
  { dot: string; bg: string; border: string; icon: typeof BookOpen; label: string }
> = {
  study:    { dot: 'bg-indigo-500', bg: 'bg-indigo-50',  border: 'border-indigo-200', icon: BookOpen,     label: 'Estudio'  },
  deadline: { dot: 'bg-red-500',    bg: 'bg-red-50',     border: 'border-red-200',    icon: AlertCircle,  label: 'Entrega'  },
  review:   { dot: 'bg-amber-500',  bg: 'bg-amber-50',   border: 'border-amber-200',  icon: RotateCcw,    label: 'Revisión' },
};

const daysOfWeek = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function CalendarioPage() {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [markError, setMarkError] = useState<string | null>(null);

  const { session } = useAgentSession();
  const { events, loading, error, retry } = useStudyCalendar(session.diagnosticComplete);
  const completedWeeks = session.completedWeeks;

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dateStr = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const eventsForDay = (d: number) => events.filter((e) => e.date === dateStr(d));

  const isDayFromCompletedWeek = (d: number) => {
    const dayEvts = eventsForDay(d);
    return dayEvts.length > 0 && dayEvts.every((e) => completedWeeks.includes(e.week));
  };
  const selectedEvents = eventsForDay(selectedDay);

  const legend: CalendarEvent['type'][] = ['study', 'deadline', 'review'];

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  // ── Marcar evento como completado (actualización optimista) ────────────────
  const [localEvents, setLocalEvents] = useState<CalendarEvent[] | null>(null);
  const displayEvents = localEvents ?? events;

  const handleMarkCompleted = async (eventId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    // Actualización optimista
    setLocalEvents((prev) =>
      (prev ?? events).map((e) => (e.id === eventId ? { ...e, completed: true } : e)),
    );
    setMarkError(null);

    try {
      await markEventCompleted(uid, eventId);
      // Firestore onSnapshot actualizará `events` — limpiar estado local
      setLocalEvents(null);
    } catch {
      // Rollback
      setLocalEvents(null);
      setMarkError('No se pudo guardar el cambio. Intenta de nuevo.');
    }
  };

  // ── Estados de carga / error / vacío ──────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Cargando tu calendario...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-500">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm font-medium">No se pudo cargar el calendario.</p>
        <button
          onClick={retry}
          className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
      </div>
    );
  }

  if (displayEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <CalendarX className="w-10 h-10" />
        <p className="text-sm font-medium text-slate-600">
          Completa el diagnóstico para generar tu calendario
        </p>
        <p className="text-xs text-slate-400">
          Una vez que el agente genere tu plan de estudio, verás aquí tus sesiones diarias.
        </p>
      </div>
    );
  }

  // ── Vista principal del calendario ────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Calendario</h2>
          <p className="text-sm text-slate-500 mt-1">Planifica tus sesiones de estudio y entregas</p>
        </div>
        <button className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Nuevo evento
        </button>
      </div>

      {markError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {markError}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Calendario mensual */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-base font-semibold text-slate-800">
                {MONTH_NAMES[month]} {year}
              </span>
              <button
                onClick={nextMonth}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-4">
              {legend.map((t) => (
                <div key={t} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={`w-2 h-2 rounded-full ${eventTypeStyles[t].dot}`} />
                  {eventTypeStyles[t].label}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {daysOfWeek.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-slate-400 py-2">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayEvents = eventsForDay(day);
              const isSelected = day === selectedDay;
              const isPast = isDayFromCompletedWeek(day);
              const isToday =
                day === today.getDate() &&
                month === today.getMonth() &&
                year === today.getFullYear();

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`min-h-[72px] text-left p-2 rounded-lg border transition-colors ${
                    isSelected
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : isPast
                      ? 'border-slate-100 bg-slate-50 text-slate-400'
                      : isToday
                      ? 'border-indigo-300 bg-indigo-50 text-slate-700'
                      : 'border-slate-100 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className={`text-sm font-semibold ${isToday && !isSelected && !isPast ? 'text-indigo-600' : ''}`}>
                    {day}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map((e) => {
                      const isEventPast = completedWeeks.includes(e.week);
                      return (
                        <div
                          key={e.id}
                          className={`text-[10px] truncate px-1 py-0.5 rounded ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : isEventPast
                              ? 'bg-slate-100 border-slate-200 border text-slate-400 line-through'
                              : e.completed
                              ? 'bg-green-100 border-green-300 border text-green-700 line-through'
                              : `${eventTypeStyles[e.type].bg} ${eventTypeStyles[e.type].border} border`
                          }`}
                        >
                          {e.title}
                        </div>
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <div className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                        +{dayEvents.length - 2}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel de eventos del día seleccionado */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 overflow-y-auto">
          <h3 className="font-semibold text-slate-800 mb-1">Día seleccionado</h3>
          <p className="text-sm text-slate-500 mb-4">
            {selectedDay} de {MONTH_NAMES[month]} {year}
          </p>

          <div className="space-y-3">
            {selectedEvents.length === 0 && (
              <p className="text-sm text-slate-400 py-8 text-center">Sin eventos programados</p>
            )}
            {selectedEvents.map((e) => {
              const style = eventTypeStyles[e.type];
              const Icon = style.icon;
              const isPastWeek = completedWeeks.includes(e.week);
              return (
                <div
                  key={e.id}
                  className={`rounded-lg border ${
                    isPastWeek
                      ? 'border-slate-200 bg-slate-50'
                      : e.completed
                      ? 'border-green-300 bg-green-50'
                      : `${style.border} ${style.bg}`
                  }`}
                >
                  {/* Cabecera del evento */}
                  <div className="flex items-start gap-2 p-3">
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isPastWeek ? 'text-slate-400' : e.completed ? 'text-green-600' : 'text-slate-700'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${isPastWeek ? 'text-slate-400 line-through' : e.completed ? 'text-green-700 line-through' : 'text-slate-800'}`}>
                        {e.title}
                      </p>
                      {isPastWeek && (
                        <p className="text-xs text-slate-400 font-medium mt-0.5">Semana completada</p>
                      )}
                      {!isPastWeek && e.completed && (
                        <p className="text-xs text-green-600 font-semibold mt-0.5">✓ Completado</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-400">{e.time} · {style.label}</span>
                        {e.difficulty && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/60 border border-current text-slate-400">
                            {e.difficulty}
                          </span>
                        )}
                        {e.duration_minutes && (
                          <span className="flex items-center gap-0.5 text-xs text-slate-400">
                            <Clock className="w-3 h-3" />
                            {e.duration_minutes} min
                          </span>
                        )}
                      </div>
                    </div>
                    {!isPastWeek && e.type === 'study' && !e.completed && (
                      <button
                        onClick={() => handleMarkCompleted(e.id)}
                        className="flex-shrink-0 text-slate-400 hover:text-indigo-500 transition-colors"
                        aria-label="Marcar como completado"
                        title="Marcar como completado"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                    {!isPastWeek && e.completed && (
                      <CheckCircle className="w-4 h-4 flex-shrink-0 text-green-500" />
                    )}
                  </div>

                  {/* Descripción / recomendación */}
                  {e.description && (
                    <div className="px-3 pb-2">
                      <p className="text-xs text-slate-600 leading-relaxed">{e.description}</p>
                    </div>
                  )}

                  {/* Objetivo */}
                  {e.objective && e.type === 'study' && (
                    <div className="px-3 pb-2 flex items-start gap-1.5">
                      <Target className="w-3 h-3 mt-0.5 text-slate-400 flex-shrink-0" />
                      <p className="text-xs text-slate-500 italic">{e.objective}</p>
                    </div>
                  )}

                  {/* Recurso */}
                  {e.resource_url && e.resource_label && (
                    <div className="px-3 pb-2">
                      <a
                        href={e.resource_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {e.resource_label}
                      </a>
                    </div>
                  )}

                  {/* Consejos */}
                  {e.tips && e.tips.length > 0 && (
                    <div className="px-3 pb-3 border-t border-white/50 pt-2 mt-1">
                      <div className="flex items-center gap-1 mb-1.5">
                        <Lightbulb className="w-3 h-3 text-amber-500" />
                        <span className="text-xs font-medium text-slate-600">Consejos</span>
                      </div>
                      <ul className="space-y-1">
                        {e.tips.map((tip, i) => (
                          <li key={i} className="text-xs text-slate-500 flex items-start gap-1">
                            <span className="text-slate-300 mt-0.5">•</span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
