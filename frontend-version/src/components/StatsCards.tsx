import { Flame, Clock, Trophy, TrendingUp } from 'lucide-react';

interface StatsCardsProps {
  streakDays: number;
  totalHoursThisWeek: number;
  averageScore: number | null;
  activeGoals: number;
  loading: boolean;
}

export default function StatsCards(props: StatsCardsProps) {
  const { streakDays, totalHoursThisWeek, averageScore, activeGoals, loading } = props;

  const stats = [
    {
      label: 'Racha actual',
      value: loading ? '—' : `${streakDays} días`,
      icon: Flame,
      color: 'text-orange-500',
      bg: 'bg-orange-50',
    },
    {
      label: 'Horas esta semana',
      value: loading ? '—' : (totalHoursThisWeek === 0 ? '0h' : `${totalHoursThisWeek.toFixed(1)}h`),
      icon: Clock,
      color: 'text-blue-500',
      bg: 'bg-blue-50',
    },
    {
      label: 'Puntuación media',
      value: loading ? '—' : (averageScore === null ? '—' : `${averageScore}%`),
      icon: Trophy,
      color: 'text-yellow-500',
      bg: 'bg-yellow-50',
    },
    {
      label: 'Objetivos activos',
      value: loading ? '—' : `${activeGoals}`,
      icon: TrendingUp,
      color: 'text-green-500',
      bg: 'bg-green-50',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-white rounded-xl p-4 border border-slate-200 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              {stat.label}
            </span>
            <div className={`w-8 h-8 ${stat.bg} rounded-lg flex items-center justify-center`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
          <p className="text-xs text-slate-500 mt-1"></p>
        </div>
      ))}
    </div>
  );
}
