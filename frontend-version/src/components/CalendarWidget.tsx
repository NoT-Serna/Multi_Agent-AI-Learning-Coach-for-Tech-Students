import { useState } from 'react';
import { ChevronLeft, ChevronRight, BookOpen, AlertCircle, RotateCcw, Loader2, CalendarX, Clock } from 'lucide-react';
import type { CalendarEvent } from '../types/calendar';
import { useStudyCalendar } from '../hooks/useStudyCalendar';
import { useAgentSession } from '../context/AgentSessionContext';

const eventTypeStyles: Record<CalendarEvent['type'], { dot: string; bg: string; icon: typeof BookOpen }> = {
  study:    { dot: 'bg-indigo-500', bg: 'bg-indigo-50 border-indigo-100 text-indigo-700',  icon: BookOpen    },
  deadline: { dot: 'bg-red-500',    bg: 'bg-red-50 border-red-100 text-red-700',           icon: AlertCircle },
  review:   { dot: 'bg-amber-500',  bg: 'bg-amber-50 border-amber-100 text-amber-700',     icon: RotateCcw   },
};

const daysOfWeek = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

export default function CalendarWidget() {
  const realToday = new Date();
  const [currentDate, setCurrentDate] = useState(
    new Date(realToday.getFullYear(), realToday.getMonth(), 1),
  );

  const { session } = useAgentSession();
  const { events, loading } = useStudyCalendar(session.diagnosticComplete);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const todayDay = realToday.getDate();
  const todayMonth = realToday.getMonth();
  const todayYear = realToday.getFullYear();

  const todayDateStr = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`;

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter((e) => e.date === dateStr);
  };

  // Próximos 4 eventos a partir de hoy (inclusive)
  const upcomingEvents = events
    .filter((e) => e.date >= todayDateStr)
    .slice(0, 4);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800">Calendario</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1 rounded hover:bg-slate-100 text-slate-400"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-slate-600">
            {MONTH_NAMES[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="p-1 rounded hover:bg-slate-100 text-slate-400"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Estado de carga — skeleton que no rompe el layout */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-300">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-xs">Cargando...</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {daysOfWeek.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayEvents = getEventsForDay(day);
              const isToday =
                day === todayDay && month === todayMonth && year === todayYear;
              const hasEvents = dayEvents.length > 0;

              return (
                <div
                  key={day}
                  className={`relative text-center py-1.5 text-sm rounded-lg cursor-pointer transition-colors ${
                    isToday
                      ? 'bg-indigo-500 text-white font-bold'
                      : hasEvents
                      ? 'text-slate-700 hover:bg-slate-100 font-medium'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {day}
                  {hasEvents && (
                    <div className="flex justify-center gap-0.5 mt-0.5">
                      {dayEvents.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          className={`w-1 h-1 rounded-full ${
                            isToday ? 'bg-white' : eventTypeStyles[e.type].dot
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-4 pt-4 border-t border-slate-100">
        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
          Próximos eventos
        </h4>

        {/* Sin calendario generado */}
        {!loading && events.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-4 text-slate-400">
            <CalendarX className="w-5 h-5" />
            <p className="text-xs text-center">
              Completa el diagnóstico para ver tu calendario
            </p>
          </div>
        )}

        {/* Lista de próximos eventos */}
        {!loading && upcomingEvents.length > 0 && (
          <div className="space-y-2">
            {upcomingEvents.map((event) => {
              const style = eventTypeStyles[event.type];
              const EventIcon = style.icon;
              return (
                <div
                  key={event.id}
                  className={`flex items-start gap-2 p-2 rounded-lg border text-sm ${style.bg} ${event.completed ? 'opacity-50' : ''}`}
                >
                  <EventIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className={`block font-medium text-xs ${event.completed ? 'line-through' : ''}`}>
                      {event.title}
                    </span>
                    {event.description && (
                      <span className="block text-xs opacity-70 truncate mt-0.5">
                        {event.description}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs opacity-75">{event.time}</span>
                      {event.duration_minutes && (
                        <span className="flex items-center gap-0.5 text-xs opacity-60">
                          <Clock className="w-2.5 h-2.5" />
                          {event.duration_minutes} min
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
