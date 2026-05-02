import { useState } from 'react';
import {
  CheckCircle2, Circle, Play, BookOpen, Code, FileText, Video, RotateCcw,
} from 'lucide-react';
import { weeklyTasks, type WeeklyTask } from '../data/mockData';
import { useAgentSession } from '../context/AgentSessionContext';
import type { RoadmapModule } from '../types/agent';

// ── Mock-data display helpers ─────────────────────────────────────────────────

const typeIcons: Record<WeeklyTask['type'], typeof Video> = {
  video:    Video,
  reading:  FileText,
  practice: Code,
  project:  BookOpen,
  review:   RotateCcw,
};

const typeColors: Record<WeeklyTask['type'], string> = {
  video:    'bg-purple-100 text-purple-600',
  reading:  'bg-blue-100 text-blue-600',
  practice: 'bg-green-100 text-green-600',
  project:  'bg-orange-100 text-orange-600',
  review:   'bg-yellow-100 text-yellow-600',
};

const typeLabels: Record<WeeklyTask['type'], string> = {
  video:    'Video',
  reading:  'Lectura',
  practice: 'Práctica',
  project:  'Proyecto',
  review:   'Repaso',
};

// ── Roadmap display helpers ───────────────────────────────────────────────────

const difficultyColors: Record<RoadmapModule['difficulty'], string> = {
  'básico':     'bg-green-100 text-green-700',
  'intermedio': 'bg-yellow-100 text-yellow-700',
  'avanzado':   'bg-red-100 text-red-700',
};

const difficultyLabels: Record<RoadmapModule['difficulty'], string> = {
  'básico':     'Básico',
  'intermedio': 'Intermedio',
  'avanzado':   'Avanzado',
};

function categoryToIcon(category: string): typeof Code {
  const lower = category.toLowerCase();
  if (lower.includes('proyecto') || lower.includes('project')) return BookOpen;
  if (lower.includes('video')) return Video;
  if (lower.includes('repaso') || lower.includes('review')) return RotateCcw;
  if (lower.includes('lectura') || lower.includes('reading') || lower.includes('fundamentos')) return FileText;
  return Code; // default: practice
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WeeklyPlan() {
  const { session } = useAgentSession();

  const hasRoadmap = session.learningRoadmap.length > 0;
  const currentWeekData = hasRoadmap
    ? session.learningRoadmap[session.currentWeek - 1] ?? session.learningRoadmap[0]
    : null;

  // ── Roadmap mode ───────────────────────────────────────────────────────────
  const [completedModules, setCompletedModules] = useState<Set<number>>(new Set());

  const toggleModule = (moduleNumber: number) => {
    setCompletedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleNumber)) {
        next.delete(moduleNumber);
      } else {
        next.add(moduleNumber);
      }
      return next;
    });
  };

  if (hasRoadmap && currentWeekData) {
    const modules = currentWeekData.modules;
    const completedCount = modules.filter((m) => completedModules.has(m.module_number)).length;
    const progress = modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;

    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-800">Plan Semanal</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Semana {currentWeekData.week} · {currentWeekData.focus}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">
              {completedCount}/{modules.length}
            </span>
            <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {modules.map((mod) => {
            const done = completedModules.has(mod.module_number);
            const Icon = categoryToIcon(mod.category);
            return (
              <div
                key={mod.module_number}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  done
                    ? 'bg-slate-50 border-slate-100'
                    : 'bg-white border-slate-200 hover:border-indigo-200'
                }`}
              >
                <button
                  onClick={() => toggleModule(mod.module_number)}
                  className="flex-shrink-0"
                  aria-label={done ? 'Marcar como pendiente' : 'Marcar como completado'}
                >
                  {done ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-300 hover:text-indigo-400" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className={`text-sm font-medium ${
                        done ? 'text-slate-400 line-through' : 'text-slate-700'
                      }`}
                    >
                      {mod.name}
                    </p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${difficultyColors[mod.difficulty]}`}>
                      {difficultyLabels[mod.difficulty]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{mod.objective}</p>
                  {mod.resource && (
                    <p className="text-xs text-indigo-500 mt-0.5 truncate">{mod.resource}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium bg-slate-100 text-slate-500`}>
                    <Icon className="w-3 h-3 inline mr-0.5" />
                    {mod.category}
                  </span>
                  {!done && (
                    <button
                      onClick={() => toggleModule(mod.module_number)}
                      className="w-7 h-7 bg-indigo-500 hover:bg-indigo-600 rounded-lg flex items-center justify-center transition-colors"
                      aria-label="Iniciar módulo"
                    >
                      <Play className="w-3.5 h-3.5 text-white ml-0.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Mock-data fallback ─────────────────────────────────────────────────────
  return <MockWeeklyPlan />;
}

// ── Mock fallback component (original implementation) ─────────────────────────

function MockWeeklyPlan() {
  const [tasks, setTasks] = useState(weeklyTasks);

  const toggleTask = (id: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const progress = Math.round((completedCount / tasks.length) * 100);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-800">Plan Semanal</h3>
          <p className="text-xs text-slate-500 mt-0.5">Semana del 7 - 13 de Abril</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600">
            {completedCount}/{tasks.length}
          </span>
          <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {tasks.map((task) => {
          const Icon = typeIcons[task.type];
          return (
            <div
              key={task.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                task.completed
                  ? 'bg-slate-50 border-slate-100'
                  : 'bg-white border-slate-200 hover:border-indigo-200'
              }`}
            >
              <button onClick={() => toggleTask(task.id)} className="flex-shrink-0">
                {task.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300 hover:text-indigo-400" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className={`text-sm font-medium ${
                      task.completed ? 'text-slate-400 line-through' : 'text-slate-700'
                    }`}
                  >
                    {task.title}
                  </p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${typeColors[task.type]}`}>
                    <Icon className="w-3 h-3 inline mr-0.5" />
                    {typeLabels[task.type]}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{task.description}</p>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-slate-400">{task.day}</span>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  {task.duration}
                </span>
                {!task.completed && (
                  <button className="w-7 h-7 bg-indigo-500 hover:bg-indigo-600 rounded-lg flex items-center justify-center transition-colors">
                    <Play className="w-3.5 h-3.5 text-white ml-0.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
