import { useState } from 'react';
import { User, Bell, Clock, Shield, Palette } from 'lucide-react';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full transition-colors relative ${checked ? 'bg-indigo-500' : 'bg-slate-200'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function AjustesPage() {
  const [notifyDaily, setNotifyDaily] = useState(true);
  const [notifyDeadlines, setNotifyDeadlines] = useState(true);
  const [notifyCoach, setNotifyCoach] = useState(false);
  const [dailyGoal, setDailyGoal] = useState(2);
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('light');

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Ajustes</h2>
        <p className="text-sm text-slate-500 mt-1">Personaliza tu experiencia en CoachApp</p>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <User className="w-4 h-4 text-slate-600" />
          <h3 className="font-semibold text-slate-800">Perfil</h3>
        </div>
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xl font-bold">SC</div>
          <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">Cambiar foto</button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Nombre</label>
            <input defaultValue="Estudiante" className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Email</label>
            <input defaultValue="estudiante@coachapp.io" className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Clock className="w-4 h-4 text-slate-600" />
          <h3 className="font-semibold text-slate-800">Plan de estudio</h3>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 mb-2 block">
            Meta diaria: {dailyGoal}h
          </label>
          <input
            type="range"
            min={1}
            max={8}
            value={dailyGoal}
            onChange={(e) => setDailyGoal(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>1h</span><span>8h</span>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Bell className="w-4 h-4 text-slate-600" />
          <h3 className="font-semibold text-slate-800">Notificaciones</h3>
        </div>
        <div className="space-y-4">
          {[
            { label: 'Recordatorio diario de estudio', desc: 'Aviso para iniciar tu sesión planificada', value: notifyDaily, set: setNotifyDaily },
            { label: 'Entregas próximas', desc: 'Alertas 48h antes de cada deadline', value: notifyDeadlines, set: setNotifyDeadlines },
            { label: 'Mensajes del Coach IA', desc: 'Sugerencias y ajustes automáticos al plan', value: notifyCoach, set: setNotifyCoach },
          ].map((n) => (
            <div key={n.label} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">{n.label}</p>
                <p className="text-xs text-slate-500">{n.desc}</p>
              </div>
              <Toggle checked={n.value} onChange={n.set} />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Palette className="w-4 h-4 text-slate-600" />
          <h3 className="font-semibold text-slate-800">Apariencia</h3>
        </div>
        <div className="flex gap-2">
          {(['light', 'dark', 'auto'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border capitalize transition-colors ${
                theme === t ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t === 'light' ? 'Claro' : t === 'dark' ? 'Oscuro' : 'Automático'}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-slate-600" />
          <h3 className="font-semibold text-slate-800">Privacidad</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">Gestiona tus datos y sesiones activas.</p>
        <div className="flex gap-2">
          <button className="text-sm px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">Exportar datos</button>
          <button className="text-sm px-4 py-2 border border-red-200 rounded-lg text-red-600 hover:bg-red-50">Eliminar cuenta</button>
        </div>
      </section>
    </div>
  );
}
