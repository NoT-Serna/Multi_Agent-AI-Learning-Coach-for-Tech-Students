import { useState, useRef, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { Send, Bot, Sparkles, Lightbulb, Calendar, Target, AlertCircle, Loader2, Lock, CheckCircle2 } from 'lucide-react';
import { useAgentSession } from '../context/AgentSessionContext';
import { useChatHistory } from '../context/ChatHistoryContext';
import QuizSection from '../components/QuizSection';
import type { MensajeChat } from '../types/persistence';

// ── Suggestions ───────────────────────────────────────────────────────────────

const suggestions = [
  { icon: Calendar, label: 'Reorganizar mi semana' },
  { icon: Target,   label: 'Revisar mis objetivos' },
  { icon: Lightbulb, label: 'Sugerir recursos' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formats an ISO 8601 timestamp for display in the chat UI.
 * Falls back to the raw string if parsing fails.
 */
function formatTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (isNaN(date.getTime())) return isoTimestamp;
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CoachIAPage() {
  const { session, chat } = useAgentSession();
  const { messages, loadingHistory, historyLoaded, cargarHistorial, agregarMensaje } = useChatHistory();

  // Get the current user's UID from Firebase Auth
  const uid = getAuth().currentUser?.uid ?? null;

  // Derive rendering mode
  const showDemoBanner = !session.diagnosticComplete;
  const showQuiz       = session.diagnosticComplete && session.quizPassed !== true;
  const showChat       = session.quizPassed === true;

  // Header status
  const statusLabel = showDemoBanner
    ? 'Modo demo'
    : showQuiz
    ? 'Quiz pendiente'
    : 'Chat desbloqueado';

  const statusColor = showDemoBanner
    ? 'bg-amber-400'
    : showQuiz
    ? 'bg-orange-400'
    : 'bg-green-500';

  const [input, setInput]     = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef             = useRef<HTMLDivElement>(null);

  // ── Load history on mount (Req 2.2, 2.3) ───────────────────────────────────
  useEffect(() => {
    if (uid !== null && !historyLoaded) {
      cargarHistorial(uid);
    }
  }, [uid, historyLoaded, cargarHistorial]);

  // ── Add welcome message once history is loaded and chat is empty (Req 2.2) ─
  useEffect(() => {
    if (!historyLoaded || messages.length > 0 || uid === null) return;

    const welcomeContent = showChat
      ? `¡Hola${session.studentName ? ` ${session.studentName}` : ''}! Soy tu Coach IA. Puedes preguntarme sobre tu plan de aprendizaje, tus objetivos o cualquier duda que tengas.`
      : showDemoBanner
      ? '¡Hola! Soy tu Coach IA. Para poder ayudarte con tu plan personalizado, primero necesitas completar el diagnóstico inicial desde el registro.'
      : `¡Hola${session.studentName ? ` ${session.studentName}` : ''}! Has completado el diagnóstico. Aprueba el quiz de la semana para desbloquear el chat personalizado.`;

    const welcomeMsg: MensajeChat = {
      id: String(Date.now()),
      role: 'coach',
      content: welcomeContent,
      timestamp: new Date().toISOString(),
    };

    agregarMensaje(uid, welcomeMsg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoaded]);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add congratulations message when quiz is passed
  const prevQuizPassed = useRef(session.quizPassed);
  useEffect(() => {
    if (session.quizPassed === true && prevQuizPassed.current !== true && uid !== null) {
      const congratsMsg: MensajeChat = {
        id: String(Date.now()),
        role: 'coach',
        content: `🎉 ¡Felicidades${session.studentName ? ` ${session.studentName}` : ''}! Has aprobado el quiz. Ahora puedes chatear conmigo sobre tu plan de aprendizaje personalizado. ¿En qué puedo ayudarte?`,
        timestamp: new Date().toISOString(),
      };
      agregarMensaje(uid, congratsMsg);
    }
    prevQuizPassed.current = session.quizPassed;
  }, [session.quizPassed, session.studentName, uid, agregarMensaje]);

  // ── Send message ────────────────────────────────────────────────────────────

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending || !historyLoaded || uid === null) return;

    const userMsg: MensajeChat = {
      id: String(Date.now()),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    await agregarMensaje(uid, userMsg);
    setInput('');
    setSending(true);

    let responseText: string;

    if (showChat) {
      responseText = await chat(trimmed);
    } else {
      await new Promise((r) => setTimeout(r, 800));
      responseText =
        'Para recibir respuestas personalizadas necesitas completar el diagnóstico inicial. ' +
        'Una vez que lo hagas, podré ayudarte con tu plan de aprendizaje específico.';
    }

    const coachMsg: MensajeChat = {
      id: String(Date.now() + 1),
      role: 'coach',
      content: responseText,
      timestamp: new Date().toISOString(),
    };
    await agregarMensaje(uid, coachMsg);
    setSending(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Coach IA</h2>
        <p className="text-sm text-slate-500 mt-1">
          Conversa con tu asistente personal de aprendizaje
        </p>
      </div>

      {/* No-session banner */}
      {showDemoBanner && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            Estás en modo demo. Completa el diagnóstico inicial para activar el Coach IA personalizado.
          </span>
        </div>
      )}

      {/* Quiz pending banner */}
      {showQuiz && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700">
          <Lock className="w-4 h-4 flex-shrink-0" />
          <span>
            Aprueba el quiz de la semana para desbloquear el chat personalizado con el Coach IA.
          </span>
        </div>
      )}

      {/* Chat unlocked banner */}
      {showChat && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>
            ¡Chat desbloqueado! Puedes preguntarme sobre tu plan de aprendizaje personalizado.
          </span>
        </div>
      )}

      {/* Chat container */}
      <div
        className="bg-white rounded-xl border border-slate-200 flex flex-col"
        style={{ height: 'calc(100vh - 300px)' }}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-800">Coach IA</h3>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
              <span className="text-xs text-slate-500">{statusLabel}</span>
            </div>
          </div>
          <Sparkles className="w-5 h-5 text-indigo-400" />
        </div>

        {/* Quiz mode — replace messages area with QuizSection */}
        {showQuiz ? (
          <QuizSection />
        ) : (
          <>
            {/* Messages area — spinner while loading, list when loaded */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {loadingHistory ? (
                /* Loading skeleton / spinner (Req 2.6) */
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-sm">Cargando historial…</span>
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] p-3 rounded-xl text-sm ${
                          msg.role === 'user'
                            ? 'bg-indigo-500 text-white rounded-br-sm'
                            : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        <span
                          className={`text-xs mt-1 block ${
                            msg.role === 'user' ? 'text-indigo-200' : 'text-slate-400'
                          }`}
                        >
                          {formatTimestamp(msg.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {sending && (
                    <div className="flex justify-start">
                      <div className="bg-slate-100 text-slate-500 p-3 rounded-xl rounded-bl-sm text-sm flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>El coach está escribiendo…</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Quick suggestions — only in demo or chat mode */}
            {(showDemoBanner || showChat) && (
              <div className="px-5 pb-3 flex items-center gap-2 flex-wrap">
                {suggestions.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => send(s.label)}
                    disabled={sending || !historyLoaded}
                    className="flex items-center gap-1.5 text-xs bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-600 px-3 py-1.5 rounded-full border border-slate-200 transition-colors"
                  >
                    <s.icon className="w-3.5 h-3.5" />
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input — disabled until history is loaded (Req 2.2, 2.6) */}
            <div className="p-4 border-t border-slate-100">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send(input)}
                  placeholder={
                    loadingHistory
                      ? 'Cargando historial…'
                      : showChat
                      ? 'Escribe al coach...'
                      : 'Completa el quiz para chatear…'
                  }
                  disabled={sending || loadingHistory || (!showChat && !showDemoBanner)}
                  className="flex-1 px-4 py-2.5 text-sm bg-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                />
                <button
                  onClick={() => send(input)}
                  disabled={sending || loadingHistory || !input.trim() || (!showChat && !showDemoBanner)}
                  className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
