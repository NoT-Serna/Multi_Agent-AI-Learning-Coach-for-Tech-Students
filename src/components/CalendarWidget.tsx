import { useState } from 'react';
import { ChevronLeft, ChevronRight, BookOpen, AlertCircle, RotateCcw } from 'lucide-react';
import { calendarEvents, type CalendarEvent } from '../data/mockData';

const eventTypeStyles: Record<CalendarEvent['type'], { dot: string; bg: string; icon: typeof BookOpen }> = {
  study: { dot: 'bg-indigo-500', bg: 'bg-indigo-50 border-indigo-100 text-indigo-700', icon: BookOpen },
  deadline: { dot: 'bg-red-500', bg: 'bg-red-50 border-red-100 text-red-700', icon: AlertCircle },
  review: { dot: 'bg-amber-500', bg: 'bg-amber-50 border-amber-100 text-amber-700', icon: RotateCcw },
};

const daysOfWeek = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

export default function CalendarWidget() {
  const [currentDate] = useState(new Date(2026, 3, 10));
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const today = 10;

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return calendarEvents.filter((e) => e.date === dateStr);
  };

  const todayEvents = calendarEvents
    .filter((e) => e.date === `${year}-${String(month + 1).padStart(2, '0')}-${String(today).padStart(2, '0')}`)
    .concat(
      calendarEvents.filter(
        (e) => e.date > `${year}-${String(month + 1).padStart(2, '0')}-${String(today).padStart(2, '0')}`
      )
    )
    .slice(0, 4);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800">Calendario</h3>
        <div className="flex items-center gap-2">
          <button className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-slate-600">Abril 2026</span>
          <button className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

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
          const events = getEventsForDay(day);
          const isToday = day === today;
          return (
            <div
              key={day}
              className={`relative text-center py-1.5 text-sm rounded-lg cursor-pointer transition-colors ${
                isToday
                  ? 'bg-indigo-500 text-white font-bold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {day}
              {events.length > 0 && (
                <div className="flex justify-center gap-0.5 mt-0.5">
                  {events.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className={`w-1 h-1 rounded-full ${isToday ? 'bg-white' : eventTypeStyles[e.type].dot}`}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100">
        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
          Próximos eventos
        </h4>
        <div className="space-y-2">
          {todayEvents.map((event) => {
            const style = eventTypeStyles[event.type];
            const EventIcon = style.icon;
            return (
              <div
                key={event.id}
                className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${style.bg}`}
              >
                <EventIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1 font-medium text-xs">{event.title}</span>
                <span className="text-xs opacity-75">{event.time}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
