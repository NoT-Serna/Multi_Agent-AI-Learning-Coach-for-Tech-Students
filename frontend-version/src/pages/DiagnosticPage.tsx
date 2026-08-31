import { useState } from 'react';
import { Sparkles, Loader2, AlertCircle, RefreshCw, BookOpen } from 'lucide-react';
import { useAgentSession } from '../context/AgentSessionContext';

type Option = 'A' | 'B' | 'C' | 'D';
const OPTIONS: Option[] = ['A', 'B', 'C', 'D'];

export default function DiagnosticPage() {
  const { session, submitDiagnostic, clearError } = useAgentSession();
  const questions = session.diagnosticQuestions;

  // answers: { [questionId]: selectedOption }
  const [answers, setAnswers] = useState<Record<string, Option>>({});
  const [submitting, setSubmitting] = useState(false);

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length && questions.length > 0;
  const progress = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  const handleSelect = (questionId: string, option: Option) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    clearError();
    // Build answers array in question order
    const answersArray = questions.map((q) => answers[q.id]);
    await submitDiagnostic(answersArray);
    setSubmitting(false);
    // Navigation is handled automatically by App.tsx guard
  };

  const isLoading = submitting || session.loading;

  // Once submitted, show a dedicated loading screen instead of disabled questions
  if (submitting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-6 text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Creando tu plan personalizado</h2>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              Estamos analizando tus respuestas y generando tu roadmap de aprendizaje con el agente de IA.
            </p>
            <p className="text-xs text-slate-400 mt-3">Esto puede tardar varios minutos…</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-indigo-400 bg-indigo-50 rounded-lg px-4 py-2">
            <BookOpen className="w-4 h-4 flex-shrink-0" />
            <span>Evaluando respuestas · Generando roadmap · Creando calendario</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Diagnóstico inicial</h1>
            <p className="text-sm text-slate-500">
              Responde las preguntas para que podamos crear tu plan personalizado
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">
              Pregunta {answeredCount} de {questions.length}
            </span>
            <span className="text-sm font-medium text-indigo-600">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Error banner */}
        {session.error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-6">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-700">{session.error}</p>
            </div>
            <button
              onClick={handleSubmit}
              className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 flex-shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar
            </button>
          </div>
        )}

        {/* Questions */}
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              className="bg-white rounded-xl border border-slate-200 p-5"
            >
              <div className="flex items-start gap-3 mb-4">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                <p className="text-sm font-medium text-slate-800 leading-relaxed">
                  {q.question}
                </p>
              </div>

              <div className="space-y-2 pl-9">
                {OPTIONS.map((opt) => {
                  const selected = answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleSelect(q.id, opt)}
                      disabled={isLoading}
                      className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors disabled:cursor-not-allowed ${
                        selected
                          ? 'bg-indigo-500 text-white border-indigo-500'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                      }`}
                    >
                      <span className="font-semibold mr-2">{opt})</span>
                      {q.options[opt]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Submit */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={!allAnswered || isLoading}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generando tu roadmap personalizado…
              </>
            ) : (
              'Enviar diagnóstico'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
