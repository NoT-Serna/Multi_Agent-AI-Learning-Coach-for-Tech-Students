import { useState, type FormEvent } from 'react';
import { Mail, Lock, Sparkles, Loader2 } from 'lucide-react';
import { iniciarSesion, obtenerUsuario } from '../services/firebase';
import type { SignUpResult } from '../types/auth';

interface Props {
  onLogin: (result: SignUpResult) => void;
  onSwitchToSignUp?: () => void;
}

function generarIdUsuario(): number {
  return Math.floor(Math.random() * 9_000_000) + 1_000_000;
}

export default function LoginPage({ onLogin, onSwitchToSignUp }: Props) {
  const [cuenta, setCuenta]       = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError]         = useState<string | null>(null);
  const [enviando, setEnviando]   = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!cuenta.trim())     return setError('El correo es obligatorio.');
    if (!contrasena.trim()) return setError('La contraseña es obligatoria.');

    setEnviando(true);
    try {
      // 1. Authenticate with Firebase Auth
      const firebaseUser = await iniciarSesion(cuenta.trim(), contrasena);

      // 2. Load profile from Firestore
      const datos = await obtenerUsuario(firebaseUser.uid);

      // 3. Build the SignUpResult the app expects
      const result: SignUpResult = {
        auth: {
          cuenta: cuenta.trim(),
          contrasenaHash: '', // not needed after login
        },
        usuario: {
          id:        datos?.id ?? generarIdUsuario(),
          cuenta:    cuenta.trim(),
          nombre:    datos?.nombre    ?? '',
          apellido:  datos?.apellido  ?? '',
          edad:      datos?.edad      ?? '',
          intereses: datos?.intereses ?? [],
          idsCursos: datos?.idsCursos ?? [],
        },
      };

      onLogin(result);
    } catch (err: any) {
      // Translate common Firebase error codes to Spanish
      const code: string = err?.code ?? '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Correo o contraseña incorrectos.');
      } else if (code === 'auth/too-many-requests') {
        setError('Demasiados intentos fallidos. Intenta más tarde.');
      } else if (code === 'auth/invalid-email') {
        setError('El formato del correo no es válido.');
      } else {
        setError(err?.message ?? 'No se pudo iniciar sesión.');
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">CoachApp</h1>
          </div>
          <h2 className="text-lg font-semibold text-slate-800">Iniciar sesión</h2>
          <p className="text-sm text-slate-500 mt-1">
            Bienvenido de vuelta. Ingresa tus credenciales para continuar.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Email */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={cuenta}
                onChange={(e) => setCuenta(e.target.value)}
                placeholder="usuario@correo.com"
                autoComplete="email"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="Tu contraseña"
                autoComplete="current-password"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={enviando}
            className="w-full py-2.5 text-sm font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          >
            {enviando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Iniciando sesión…
              </>
            ) : (
              'Iniciar sesión'
            )}
          </button>
        </form>

        {/* Switch to sign up */}
        <p className="text-center text-sm text-slate-500 mt-6">
          ¿No tienes cuenta?{' '}
          <button
            type="button"
            onClick={onSwitchToSignUp}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Regístrate
          </button>
        </p>
      </div>
    </div>
  );
}
