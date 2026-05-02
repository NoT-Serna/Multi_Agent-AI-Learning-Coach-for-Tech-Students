import {
  LayoutDashboard,
  Calendar,
  Target,
  MessageSquare,
  BookOpen,
  Settings,
  LogOut,
  GraduationCap,
} from 'lucide-react';

export type TabId = 'dashboard' | 'calendario' | 'objetivos' | 'recursos' | 'coach' | 'ajustes';

const navItems: { id: TabId; icon: typeof LayoutDashboard; label: string }[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'calendario', icon: Calendar, label: 'Calendario' },
  { id: 'objetivos', icon: Target, label: 'Objetivos' },
  { id: 'recursos', icon: BookOpen, label: 'Recursos' },
  { id: 'coach', icon: MessageSquare, label: 'Coach IA' },
  { id: 'ajustes', icon: Settings, label: 'Ajustes' },
];

interface Props {
  activeTab: TabId;
  onChange: (t: TabId) => void;
}

export default function Sidebar({ activeTab, onChange }: Props) {
  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col min-h-screen">
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
          <GraduationCap className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight">CoachApp</h1>
          <p className="text-xs text-slate-400">Tu coach de aprendizaje</p>
        </div>
      </div>

      <nav className="flex-1 px-3 mt-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = item.id === activeTab;
            return (
              <li key={item.id}>
                <button
                  onClick={() => onChange(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-indigo-500/20 text-indigo-400'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 mx-3 mb-3 bg-slate-800 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500 rounded-full flex items-center justify-center text-sm font-bold">
            SC
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Estudiante</p>
            <p className="text-xs text-slate-400 truncate">Plan Semanal Activo</p>
          </div>
          <button className="text-slate-400 hover:text-white transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
