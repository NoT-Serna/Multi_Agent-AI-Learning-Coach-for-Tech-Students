import { useState, useMemo } from 'react';
import { BookOpen, Video, FileText, Code, ExternalLink, Link } from 'lucide-react';
import { useAgentSession } from '../context/AgentSessionContext';
import { useStudyCalendar } from '../hooks/useStudyCalendar';

type ResourceType = 'video' | 'article' | 'course' | 'practice';

interface DerivedResource {
  id: string;
  title: string;
  description: string;
  resourceText: string;
  type: ResourceType;
  url: string | null;
  urlLabel: string | null;
  week: number;
  category: string;
  difficulty: string;
  moduleNumber: number;
}

const typeConfig: Record<ResourceType, { icon: typeof Video; color: string; bg: string; label: string }> = {
  video:    { icon: Video,    color: 'text-rose-600',    bg: 'bg-rose-50',    label: 'Video'    },
  article:  { icon: FileText, color: 'text-indigo-600',  bg: 'bg-indigo-50',  label: 'Recurso'  },
  course:   { icon: BookOpen, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Curso'    },
  practice: { icon: Code,     color: 'text-amber-600',   bg: 'bg-amber-50',   label: 'Práctica' },
};

const difficultyColor: Record<string, string> = {
  básico:     'bg-emerald-50 text-emerald-700',
  intermedio: 'bg-amber-50 text-amber-700',
  avanzado:   'bg-rose-50 text-rose-700',
};

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0].replace(/[.,;)\]]+$/, '') : null;
}

function inferType(resource: string, url: string | null): ResourceType {
  const text = (resource + ' ' + (url ?? '')).toLowerCase();
  if (text.includes('youtube') || text.includes('youtu.be') || text.includes('vimeo') || text.includes('video')) return 'video';
  if (text.includes('udemy') || text.includes('coursera') || text.includes('platzi') || text.includes('edx') || text.includes('linkedin learning')) return 'course';
  if (text.includes('github') || text.includes('codepen') || text.includes('codesandbox') || text.includes('ejercicio') || text.includes('práctica') || text.includes('challenge')) return 'practice';
  return 'article';
}

export default function RecursosPage() {
  const { session } = useAgentSession();
  const { events } = useStudyCalendar(session.diagnosticComplete);
  const [selectedWeek, setSelectedWeek] = useState<'all' | number>('all');

  const resources = useMemo<DerivedResource[]>(() => {
    const result: DerivedResource[] = [];
    for (const week of session.learningRoadmap) {
      for (const mod of week.modules) {
        const calEvent = events.find(
          (e) => e.week === week.week && e.moduleNumber === mod.module_number && e.resource_url,
        );
        const url = calEvent?.resource_url ?? extractUrl(mod.resource);
        const urlLabel = calEvent?.resource_label ?? null;
        const type = inferType(mod.resource, url);
        result.push({
          id: `${week.week}-${mod.module_number}`,
          title: mod.name,
          description: mod.objective,
          resourceText: mod.resource,
          type,
          url,
          urlLabel,
          week: week.week,
          category: mod.category,
          difficulty: mod.difficulty,
          moduleNumber: mod.module_number,
        });
      }
    }
    return result;
  }, [session.learningRoadmap, events]);

  const weeks = useMemo(
    () => [...new Set(session.learningRoadmap.map((w) => w.week))].sort((a, b) => a - b),
    [session.learningRoadmap],
  );

  const filtered = useMemo(
    () => (selectedWeek === 'all' ? resources : resources.filter((r) => r.week === selectedWeek)),
    [resources, selectedWeek],
  );

  if (!session.diagnosticComplete || session.learningRoadmap.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Recursos</h2>
          <p className="text-sm text-slate-500 mt-1">Biblioteca de recursos de tu plan de aprendizaje</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
            <BookOpen className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-slate-700 font-medium">Aún no tienes un plan de estudio</p>
          <p className="text-sm text-slate-400 mt-1">Completa el diagnóstico para ver los recursos de tu plan</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Recursos</h2>
        <p className="text-sm text-slate-500 mt-1">Recursos recomendados por tu coach para cada módulo</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setSelectedWeek('all')}
          className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
            selectedWeek === 'all'
              ? 'bg-indigo-500 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Todos
        </button>
        {weeks.map((w) => (
          <button
            key={w}
            onClick={() => setSelectedWeek(w)}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
              selectedWeek === w
                ? 'bg-indigo-500 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Semana {w}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {filtered.map((r) => {
          const cfg = typeConfig[r.type];
          const Icon = cfg.icon;
          return (
            <div
              key={r.id}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-200 hover:shadow-sm transition-all flex flex-col"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-[10px] text-slate-400">·</span>
                    <span className="text-[10px] text-slate-500 font-medium">{r.category}</span>
                    <span className="text-[10px] text-slate-400">·</span>
                    <span className="text-[10px] text-slate-400">Sem. {r.week}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${difficultyColor[r.difficulty] ?? 'bg-slate-50 text-slate-600'}`}>
                      {r.difficulty}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm leading-tight">{r.title}</h3>
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-3 line-clamp-2 flex-1">{r.description}</p>

              <p className="text-xs text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 mb-3 line-clamp-2">
                {r.urlLabel ?? r.resourceText}
              </p>

              <div className="flex items-center justify-end mt-auto">
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Abrir recurso <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Link className="w-3.5 h-3.5" /> Sin enlace directo
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center py-10 text-slate-400 text-sm">No hay recursos para esta semana.</p>
      )}
    </div>
  );
}
