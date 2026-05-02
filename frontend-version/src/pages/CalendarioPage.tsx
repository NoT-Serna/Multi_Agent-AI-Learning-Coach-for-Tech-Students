import { useState } from 'react';
import { ChevronLeft, ChevronRight, BookOpen, AlertCircle, RotateCcw, Plus } from 'lucide-react';
import { calendarEvents, type CalendarEvent } from '../data/mockData';

const eventTypeStyles: Record<CalendarEvent['type'], { dot: string; bg: string; border: string; icon: typeof BookOpen; label: string }> = {
  study: { dot: 'bg-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200', icon: BookOpen, label: 'Estudio' },
  deadline: { dot: 'bg-red-500', bg: 'bg-red-50', border: 'border-red-200', icon: AlertCircle, label: 'Entrega' },
  review: { dot: 'bg-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', icon: RotateCcw, label: 'Revisión' },
};

const daysOfWeek = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default function CalendarioPage() {
  const [selectedDay, setSelectedDay] = useState(10);
  const year = 2026;
  const month = 3;
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dateStr = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const eventsForDay = (d: number) => calendarEvents.filter((e) => e.date === dateStr(d));
  const selectedEvents = eventsForDay(selectedDay);

  const legend: CalendarEvent['type'][] = ['study', 'deadline', 'review'];

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

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-base font-semibold text-slate-800">Abril 2026</span>
              <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
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
              <div key={d} className="text-center text-xs font-medium text-slate-400 py-2">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const events = eventsForDay(day);
              const isSelected = day === selectedDay;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`min-h-[72px] text-left p-2 rounded-lg border transition-colors ${
                    isSelected ? 'bg-indigo-500 text-white border-indigo-500' : 'border-slate-100 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="text-sm font-semibold">{day}</div>
                  <div className="mt-1 space-y-0.5">
                    {events.slice(0, 2).map((e) => (
                      <div
                        key={e.id}
                        className={`text-[10px] truncate px-1 py-0.5 rounded ${
                          isSelected ? 'bg-white/20 text-white' : `${eventTypeStyles[e.type].bg} ${eventTypeStyles[e.type].border} border`
                        }`}
                      >
                        {e.title}
                      </div>
                    ))}
                    {events.length > 2 && (
                      <div className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>+{events.length - 2}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-1">Día seleccionado</h3>
          <p className="text-sm text-slate-500 mb-4">{selectedDay} de Abril 2026</p>

          <div className="space-y-2">
            {selectedEvents.length === 0 && (
              <p className="text-sm text-slate-400 py-8 text-center">Sin eventos programados</p>
            )}
            {selectedEvents.map((e) => {
              const style = eventTypeStyles[e.type];
              const Icon = style.icon;
              return (
                <div key={e.id} className={`p-3 rounded-lg border ${style.border} ${style.bg}`}>
                  <div className="flex items-start gap-2">
                    <Icon className="w-4 h-4 mt-0.5 text-slate-700" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{e.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{e.time} · {style.label}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
