import { goals } from '../data/mockData';

const progressColor = (progress: number) => {
  if (progress >= 80) return 'bg-green-500';
  if (progress >= 50) return 'bg-indigo-500';
  if (progress >= 30) return 'bg-yellow-500';
  return 'bg-red-400';
};

export default function GoalsProgress() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-800 mb-4">Objetivos de Aprendizaje</h3>

      <div className="space-y-4">
        {goals.map((goal) => (
          <div key={goal.id}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-slate-700">{goal.title}</span>
              <span className="text-xs text-slate-500">
                {goal.completedTasks}/{goal.totalTasks} tareas
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${progressColor(goal.progress)}`}
                style={{ width: `${goal.progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs font-medium text-slate-600">{goal.progress}%</span>
              <span className="text-xs text-slate-400">
                Fecha límite: {new Date(goal.deadline).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
