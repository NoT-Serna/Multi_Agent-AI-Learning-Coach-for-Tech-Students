import { WifiOff } from 'lucide-react';

interface SlowConnectionBannerProps {
  visible: boolean;
  onWait: () => void;
  onContinueWithoutRestore: () => void;
}

export default function SlowConnectionBanner({
  visible,
  onWait,
  onContinueWithoutRestore,
}: SlowConnectionBannerProps) {
  if (!visible) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-label="Conexión lenta"
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4"
    >
      <div className="w-full max-w-lg bg-amber-50 border border-amber-200 rounded-xl shadow-lg px-5 py-4 flex items-start gap-4">
        <div className="shrink-0 w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
          <WifiOff className="w-5 h-5 text-amber-600" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900 leading-snug">
            La conexión es lenta. ¿Deseas continuar sin restaurar tu sesión anterior?
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={onWait}
              className="px-4 py-1.5 text-sm font-medium text-amber-800 bg-white border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              Esperar
            </button>
            <button
              onClick={onContinueWithoutRestore}
              className="px-4 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              Continuar sin restaurar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
