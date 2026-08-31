import { useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface ToastNotificationProps {
  message: string;
  type: 'error' | 'warning' | 'success';
  visible: boolean;
  onDismiss: () => void;
}

const config = {
  error: {
    icon: AlertCircle,
    containerClass: 'bg-red-50 border-red-200 text-red-800',
    iconClass: 'text-red-500',
    buttonClass: 'text-red-400 hover:text-red-600 hover:bg-red-100',
  },
  warning: {
    icon: AlertTriangle,
    containerClass: 'bg-amber-50 border-amber-200 text-amber-800',
    iconClass: 'text-amber-500',
    buttonClass: 'text-amber-400 hover:text-amber-600 hover:bg-amber-100',
  },
  success: {
    icon: CheckCircle2,
    containerClass: 'bg-green-50 border-green-200 text-green-800',
    iconClass: 'text-green-500',
    buttonClass: 'text-green-400 hover:text-green-600 hover:bg-green-100',
  },
} as const;

export default function ToastNotification({
  message,
  type,
  visible,
  onDismiss,
}: ToastNotificationProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (visible) {
      timerRef.current = setTimeout(() => {
        onDismiss();
      }, 4000);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [visible, onDismiss]);

  const { icon: Icon, containerClass, iconClass, buttonClass } = config[type];

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={[
        'fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-sm w-full',
        'transition-all duration-300 ease-in-out',
        visible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-4 pointer-events-none',
        containerClass,
      ].join(' ')}
    >
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${iconClass}`} />
      <p className="flex-1 text-sm leading-snug">{message}</p>
      <button
        onClick={onDismiss}
        aria-label="Cerrar notificación"
        className={`shrink-0 p-0.5 rounded-md transition-colors ${buttonClass}`}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
