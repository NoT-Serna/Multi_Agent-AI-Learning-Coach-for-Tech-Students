import { useState } from 'react';
import { User, Bell, Clock, Shield, Palette, Mail, Calendar, BookOpen, X } from 'lucide-react';
import type { Usuario } from '../types/auth';
import { cursosDisponibles, interesesSugeridos } from '../data/cursos';

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

interface Props {
  usuario: Usuario;
  onUpdateUsuario?: (u: Usuario) => void;
}

export default function AjustesPage({ usuario, onUpdateUsuario }: Props) {
  const [cuenta, setCuenta] = useState(usuario.cuenta);
  const [nombre, setNombre] = useState(usuario.nombre);
  const [apellido, setApellido] = useState(usuario.apellido);
  const [edad, setEdad] = useState(usuario.edad);
  const [intereses, setIntereses] = useState<string[]>([...usuario.intereses]);
  const [interesInput, setInteresInput] = useState('');
  const [idsCursos, setIdsCursos] = useState<number[]>([...usuario.idsCursos]);

  const [notifyDaily, setNotifyDaily] = useState(true);
  const [notifyDeadlines, setNotifyDeadlines] = useState(true);
  const [notifyCoach, setNotifyCoach] = useState(false);
  const [dailyGoal, setDailyGoal] = useState(2);
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('light');
  const [guardado, setGuardado] = useState(false);

  const iniciales = `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase() || 'U';

  const agregarInteres = (valor: string) => {
    const limpio = valor.trim();
    if (!limpio || intereses.includes(limpio)) return;
    setIntereses((prev) => [...prev, limpio]);
  };

  const quitarInteres = (valor: string) => {
    setIntereses((prev) => prev.filter((x) => x !== valor));
  };

  const toggleCurso = (id: number) => {
    setIdsCursos((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const guardarCambios = () => {
    onUpdateUsuario?.({
      ...usuario,
      cuenta: cuenta.trim(),
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      edad,
      intereses: [...intereses],
      idsCursos: [...idsCursos],
    });
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  };

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
          <div className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
            {iniciales}
          </div>
          <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">Cambiar foto</button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Apellido</label>
            <input
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Cuenta</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={cuenta}
                onChange={(e) => setCuenta(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Fecha de nacimiento</label>
            <div className="relative">
              <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={edad}
                onChange={(e) => setEdad(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        <div className="mt-5">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Intereses</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {intereses.map((it) => (
              <span
                key={it}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-full border border-indigo-100"
              >
                {it}
                <button
                  type="button"
                  onClick={() => quitarInteres(it)}
                  className="hover:text-indigo-900"
                  aria-label={`Quitar ${it}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {intereses.length === 0 && (
              <p className="text-xs text-slate-400">Aún no has añadido intereses.</p>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={interesInput}
              onChange={(e) => setInteresInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  agregarInteres(interesInput);
                  setInteresInput('');
                }
              }}
              placeholder="Escribe un interés y presiona Enter"
              className="flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => {
                agregarInteres(interesInput);
                setInteresInput('');
              }}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
            >
              Añadir
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {interesesSugeridos
              .filter((s) => !intereses.includes(s))
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => agregarInteres(s)}
                  className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200"
                >
                  + {s}
                </button>
              ))}
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <BookOpen className="w-4 h-4 text-slate-600" />
          <h3 className="font-semibold text-slate-800">Cursos inscritos</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {cursosDisponibles.map((c) => {
            const seleccionado = idsCursos.includes(c.idCurso);
            return (
              <button
                type="button"
                key={c.idCurso}
                onClick={() => toggleCurso(c.idCurso)}
                className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                  seleccionado
                    ? 'bg-indigo-500 text-white border-indigo-500'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="font-medium">{c.titulo}</div>
                <div
                  className={`text-[11px] ${seleccionado ? 'text-indigo-100' : 'text-slate-400'}`}
                >
                  ID #{c.idCurso}
                </div>
              </button>
            );
          })}
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

      <div className="flex items-center justify-end gap-3 pt-2">
        {guardado && (
          <span className="text-sm text-emerald-600">Cambios guardados</span>
        )}
        <button
          type="button"
          onClick={guardarCambios}
          className="px-5 py-2 text-sm font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
        >
          Guardar cambios
        </button>
      </div>
    </div>
  );
}
