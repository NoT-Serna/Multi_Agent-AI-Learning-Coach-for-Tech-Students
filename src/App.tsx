import { useState } from 'react';
import Sidebar, { type TabId } from './components/Sidebar';
import Header from './components/Header';
import StatsCards from './components/StatsCards';
import WeeklyPlan from './components/WeeklyPlan';
import GoalsProgress from './components/GoalsProgress';
import CalendarWidget from './components/CalendarWidget';
import CoachChat from './components/CoachChat';
import CalendarioPage from './pages/CalendarioPage';
import ObjetivosPage from './pages/ObjetivosPage';
import RecursosPage from './pages/RecursosPage';
import CoachIAPage from './pages/CoachIAPage';
import AjustesPage from './pages/AjustesPage';

const titles: Record<TabId, string> = {
  dashboard: 'Dashboard',
  calendario: 'Calendario',
  objetivos: 'Objetivos',
  recursos: 'Recursos',
  coach: 'Coach IA',
  ajustes: 'Ajustes',
};

function DashboardView() {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">
          ¡Buen día! Llevas 12 días de racha
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Hoy tienes 2 sesiones programadas. Tu siguiente meta es completar el módulo de Context API.
        </p>
      </div>

      <StatsCards />

      <div className="grid grid-cols-3 gap-6 mt-6">
        <div className="col-span-2 space-y-6">
          <WeeklyPlan />
        </div>
        <div className="space-y-6">
          <GoalsProgress />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mt-6">
        <div className="col-span-2">
          <CoachChat />
        </div>
        <div>
          <CalendarWidget />
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabId>('dashboard');

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar activeTab={tab} onChange={setTab} />

      <div className="flex-1 flex flex-col">
        <Header title={titles[tab]} />

        <main className="flex-1 p-6 overflow-y-auto">
          {tab === 'dashboard' && <DashboardView />}
          {tab === 'calendario' && <CalendarioPage />}
          {tab === 'objetivos' && <ObjetivosPage />}
          {tab === 'recursos' && <RecursosPage />}
          {tab === 'coach' && <CoachIAPage />}
          {tab === 'ajustes' && <AjustesPage />}
        </main>
      </div>
    </div>
  );
}
