import { useState } from 'react';
import { Send, Bot, Sparkles, Lightbulb, Calendar, Target } from 'lucide-react';
import { chatMessages, type ChatMessage } from '../data/mockData';

const suggestions = [
  { icon: Calendar, label: 'Reorganizar mi semana' },
  { icon: Target, label: 'Revisar mis objetivos' },
  { icon: Lightbulb, label: 'Sugerir recursos' },
];

export default function CoachIAPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(chatMessages);
  const [input, setInput] = useState('');

  const send = (text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [
      ...prev,
      { id: prev.length + 1, role: 'user', content: text, timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) },
    ]);
    setInput('');
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: prev.length + 1,
          role: 'coach',
          content: 'Entendido. Déjame analizar tu progreso y ajustar el plan. Te enviaré una propuesta actualizada en un momento.',
          timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }, 900);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Coach IA</h2>
        <p className="text-sm text-slate-500 mt-1">Conversa con tu asistente personal de aprendizaje</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 flex flex-col" style={{ height: 'calc(100vh - 260px)' }}>
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-800">Coach IA</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              <span className="text-xs text-slate-500">En línea · Adapta tu plan en tiempo real</span>
            </div>
          </div>
          <Sparkles className="w-5 h-5 text-indigo-400" />
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] p-3 rounded-xl text-sm ${
                msg.role === 'user' ? 'bg-indigo-500 text-white rounded-br-sm' : 'bg-slate-100 text-slate-700 rounded-bl-sm'
              }`}>
                <p>{msg.content}</p>
                <span className={`text-xs mt-1 block ${msg.role === 'user' ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {msg.timestamp}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 pb-3 flex items-center gap-2 flex-wrap">
          {suggestions.map((s) => (
            <button
              key={s.label}
              onClick={() => send(s.label)}
              className="flex items-center gap-1.5 text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full border border-slate-200 transition-colors"
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-slate-100">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send(input)}
              placeholder="Escribe al coach..."
              className="flex-1 px-4 py-2.5 text-sm bg-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => send(input)}
              className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
