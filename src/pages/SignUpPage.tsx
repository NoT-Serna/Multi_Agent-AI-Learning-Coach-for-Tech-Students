import { useState, type FormEvent } from 'react';
import { Lock, User, Mail, BookOpen, Sparkles, Calendar, X } from 'lucide-react';
import { cursosDisponibles, interesesSugeridos } from '../data/cursos';
import type { SignUpResult } from '../types/auth';

interface Props {
  onSignUp: (result: SignUpResult) => void;
  onSwitchToLogin?: () => void;
}

async function hashContrasena(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generarIdUsuario(): number {
  return Math.floor(Math.random() * 9_000_000) + 1_000_000;
}

export default function SignUpPage({ onSignUp, onSwitchToLogin }: Props) {
  const [cuenta, setCuenta] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [edad, setEdad] = useState('');
  const [intereses, setIntereses] = useState<string[]>([]);
  const [interesInput, setInteresInput] = useState('');
  const [idsCursos, setIdsCursos] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const toggleCurso = (id: number) => {
    setIdsCursos((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const agregarInteres = (valor: string) => {
    const limpio = valor.trim();
    if (!limpio || intereses.includes(limpio)) return;
    setIntereses((prev) => [...prev, limpio]);
  };

  const quitarInteres = (valor: string) => {
    setIntereses((prev) => prev.filter((x) => x !== valor));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!cuenta.trim()) return setError('La cuenta es obligatoria.');
    if (contrasena.length < 6)
      return setError('La contraseña debe tener al menos 6 caracteres.');
    if (contrasena !== confirmar)
      return setError('Las contraseñas no coinciden.');
    if (!nombre.trim() || !apellido.trim())
      return setError('Nombre y apellido son obligatorios.');
    if (!edad) return setError('La fecha de nacimiento es obligatoria.');
    if (idsCursos.length === 0)
      return setError('Selecciona al menos un curso.');

    setEnviando(true);
    try {
      const contrasenaHash = await hashContrasena(contrasena);
      const result: SignUpResult = {
        auth: {
          cuenta: cuenta.trim(),
          contrasenaHash,
        },
        usuario: {
          id: generarIdUsuario(),
          cuenta: cuenta.trim(),
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          edad,
          intereses: [...intereses],
          idsCursos: [...idsCursos],
        },
      };
      onSignUp(result);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">CoachApp</h1>
          </div>
          <h2 className="text-lg font-semibold text-slate-800">Crear cuenta</h2>
          <p className="text-sm text-slate-500 mt-1">
            Completa tus datos para empezar a aprender con tu coach personal.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4 text-slate-600" />
              <h3 className="font-semibold text-slate-800 text-sm">
                Autenticación
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Cuenta
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={cuenta}
                    onChange={(e) => setCuenta(e.target.value)}
                    placeholder="usuario@correo.com"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={contrasena}
                    onChange={(e) => setContrasena(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">
                    Confirmar contraseña
                  </label>
                  <input
                    type="password"
                    value={confirmar}
                    onChange={(e) => setConfirmar(e.target.value)}
                    placeholder="Repite la contraseña"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-slate-600" />
              <h3 className="font-semibold text-slate-800 text-sm">
                Datos de usuario
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Nombre
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Apellido
                </label>
                <input
                  type="text"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Fecha de nacimiento
                </label>
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

            <div className="mt-4">
              <label className="text-xs font-medium text-slate-500 mb-1 block">
                Intereses
              </label>
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

          <section>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-slate-600" />
              <h3 className="font-semibold text-slate-800 text-sm">
                Cursos en los que te quieres inscribir
              </h3>
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

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              ¿Ya tienes cuenta? Inicia sesión
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="px-5 py-2 text-sm font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
