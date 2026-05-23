import {
  LayoutDashboard,
  Calendar,
  Target,
  ClipboardCheck,
  MessageSquare,
  BookOpen,
  Settings,
  LogOut,
} from 'lucide-react';
import { useState } from 'react';
import logoSoftserve from '../assets/logo_softserve.jpeg';

export type TabId = 'dashboard' | 'calendario' | 'objetivos' | 'quiz' | 'recursos' | 'coach' | 'ajustes';

const navItems: { id: TabId; icon: typeof LayoutDashboard; label: string }[] = [
  { id: 'dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'calendario', icon: Calendar,         label: 'Calendario' },
  { id: 'objetivos',  icon: Target,           label: 'Objetivos' },
  { id: 'quiz',       icon: ClipboardCheck,   label: 'Quiz Semanal' },
  { id: 'recursos',   icon: BookOpen,         label: 'Recursos' },
  { id: 'coach',      icon: MessageSquare,    label: 'Coach IA' },
  { id: 'ajustes',    icon: Settings,         label: 'Ajustes' },
];

interface Props {
  activeTab: TabId;
  onChange: (t: TabId) => void;
  userName?: string;
  userEmail?: string;
  onLogout?: () => void;
}

export default function Sidebar({ activeTab, onChange, userName, userEmail, onLogout }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);

  const initials = userName
    ? userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'SC';

  const handleLogoutClick = () => setShowConfirm(true);
  const handleCancel = () => setShowConfirm(false);
  const handleConfirm = () => {
    setShowConfirm(false);
    onLogout?.();
  };

  return (
    <>
      <aside className="w-64 bg-slate-900 text-white flex flex-col min-h-screen">
        <div className="p-6 flex items-center gap-3">
          <img src={logoSoftserve} alt="SoftServe" className="w-10 h-10 rounded-xl object-cover" />
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

        <div className="px-4 pb-2">
          <a
            href="https://www.softserveinc.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <img src={logoSoftserve} alt="SoftServe" className="w-5 h-5 rounded object-cover" />
            softserveinc.com
          </a>
        </div>

        <div className="p-4 mx-3 mb-3 bg-slate-800 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-500 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userName ?? 'Estudiante'}</p>
              <p className="text-xs text-slate-400 truncate">{userEmail ?? 'Plan Semanal Activo'}</p>
            </div>
            <button
              onClick={handleLogoutClick}
              className="text-slate-400 hover:text-white transition-colors flex-shrink-0"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Modal de confirmación de cierre de sesión */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={handleCancel}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <LogOut className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-800">Cerrar sesión</h2>
                <p className="text-sm text-slate-500">¿Estás seguro de que quieres salir?</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Tu progreso está guardado. Podrás retomar desde donde lo dejaste la próxima vez que inicies sesión.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
