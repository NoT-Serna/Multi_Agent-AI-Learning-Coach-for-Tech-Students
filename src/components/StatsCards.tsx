import { Flame, Clock, Trophy, TrendingUp } from 'lucide-react';
import { streakDays, totalHoursThisWeek, averageScore } from '../data/mockData';

const stats = [
  {
    label: 'Racha actual',
    value: `${streakDays} días`,
    icon: Flame,
    color: 'text-orange-500',
    bg: 'bg-orange-50',
    change: '+2 vs semana pasada',
  },
  {
    label: 'Horas esta semana',
    value: `${totalHoursThisWeek}h`,
    icon: Clock,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    change: '85% de tu meta (10h)',
  },
  {
    label: 'Puntuación media',
    value: `${averageScore}%`,
    icon: Trophy,
    color: 'text-yellow-500',
    bg: 'bg-yellow-50',
    change: '+5% vs semana pasada',
  },
  {
    label: 'Objetivos activos',
    value: '4',
    icon: TrendingUp,
    color: 'text-green-500',
    bg: 'bg-green-50',
    change: '1 próximo a completarse',
  },
];

export default function StatsCards() {
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
          <p className="text-xs text-slate-500 mt-1">{stat.change}</p>
        </div>
      ))}
    </div>
  );
}
