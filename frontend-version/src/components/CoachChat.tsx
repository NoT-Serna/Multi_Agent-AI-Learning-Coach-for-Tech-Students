import { Bot, Sparkles } from 'lucide-react';
import { useChatHistory } from '../context/ChatHistoryContext';
import type { MensajeChat } from '../types/persistence';

const WELCOME_MESSAGE: MensajeChat = {
  id: 'welcome',
  role: 'coach',
  content: '¡Hola! Soy tu Coach IA. Visita la sección Coach IA para chatear conmigo.',
  timestamp: new Date().toISOString(),
};

export default function CoachChat() {
  const { messages } = useChatHistory();

  const displayMessages: MensajeChat[] = messages.length > 0 ? messages : [WELCOME_MESSAGE];

  return (
    <div className="bg-white rounded-xl border border-slate-200 flex flex-col" style={{ height: '380px' }}>
      <div className="p-4 border-b border-slate-100 flex items-center gap-2">
        <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
          <Bot className="w-4 h-4 text-indigo-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800 text-sm">Coach IA</h3>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
            <span className="text-xs text-slate-500">En línea</span>
          </div>
        </div>
        <div className="ml-auto">
          <Sparkles className="w-4 h-4 text-indigo-400" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {displayMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] p-3 rounded-xl text-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-500 text-white rounded-br-sm'
                  : 'bg-slate-100 text-slate-700 rounded-bl-sm'
              }`}
            >
              <p>{msg.content}</p>
              <span
                className={`text-xs mt-1 block ${
                  msg.role === 'user' ? 'text-indigo-200' : 'text-slate-400'
                }`}
              >
                {new Date(msg.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
