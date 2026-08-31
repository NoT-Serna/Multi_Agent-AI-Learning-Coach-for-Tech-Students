import { BookOpen, Video, FileText, Code, ExternalLink, Star, Clock } from 'lucide-react';

type ResourceType = 'video' | 'article' | 'course' | 'practice';

interface Resource {
  id: number;
  title: string;
  description: string;
  type: ResourceType;
  duration: string;
  topic: string;
  rating: number;
  completed: boolean;
}

const resources: Resource[] = [
  { id: 1, title: 'React Hooks en profundidad', description: 'Guía completa de useState, useEffect y hooks personalizados', type: 'video', duration: '2h 30min', topic: 'React', rating: 4.9, completed: true },
  { id: 2, title: 'Patrones avanzados de React', description: 'Compound components, render props y HOCs', type: 'article', duration: '20 min', topic: 'React', rating: 4.7, completed: false },
  { id: 3, title: 'TypeScript para desarrolladores JS', description: 'Tipos, generics y utilidades del lenguaje', type: 'course', duration: '6h', topic: 'TypeScript', rating: 4.8, completed: false },
  { id: 4, title: 'Desafíos de React Router', description: 'Ejercicios prácticos de navegación', type: 'practice', duration: '1h 30min', topic: 'React', rating: 4.6, completed: false },
  { id: 5, title: 'Consultas SQL avanzadas', description: 'Joins, subqueries y optimización', type: 'video', duration: '3h', topic: 'SQL', rating: 4.9, completed: true },
  { id: 6, title: 'Introducción a Node.js', description: 'Runtime, módulos y ecosistema npm', type: 'course', duration: '4h', topic: 'Node.js', rating: 4.5, completed: false },
];

const typeConfig: Record<ResourceType, { icon: typeof Video; color: string; bg: string; label: string }> = {
  video: { icon: Video, color: 'text-rose-600', bg: 'bg-rose-50', label: 'Video' },
  article: { icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'Artículo' },
  course: { icon: BookOpen, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Curso' },
  practice: { icon: Code, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Práctica' },
};

const topics = ['Todos', 'React', 'TypeScript', 'Node.js', 'SQL'];

export default function RecursosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Recursos</h2>
        <p className="text-sm text-slate-500 mt-1">Biblioteca de contenido curado para tu plan</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {topics.map((t, i) => (
          <button
            key={t}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
              i === 0 ? 'bg-indigo-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {resources.map((r) => {
          const cfg = typeConfig[r.type];
          const Icon = cfg.icon;
          return (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-200 hover:shadow-sm transition-all">
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-[10px] text-slate-400">·</span>
                    <span className="text-[10px] text-slate-500 font-medium">{r.topic}</span>
                    {r.completed && (
                      <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-medium">Completado</span>
                    )}
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm leading-tight">{r.title}</h3>
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-4 line-clamp-2">{r.description}</p>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />{r.duration}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{r.rating}
                  </span>
                </div>
                <button className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium">
                  Abrir <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
