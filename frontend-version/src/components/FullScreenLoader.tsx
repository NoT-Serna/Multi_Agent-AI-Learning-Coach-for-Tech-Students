import { Loader2 } from 'lucide-react';

interface Props {
  message?: string;
}

export default function FullScreenLoader({ message }: Props) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-indigo-500 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white animate-spin" />
      </div>
      {message && (
        <p className="text-sm text-slate-500 text-center max-w-xs">{message}</p>
      )}
    </div>
  );
}
