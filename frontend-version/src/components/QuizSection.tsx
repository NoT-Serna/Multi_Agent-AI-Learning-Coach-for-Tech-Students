import { useState } from 'react';
import { Loader2, AlertCircle, RefreshCw, Trophy, XCircle } from 'lucide-react';
import { useAgentSession } from '../context/AgentSessionContext';

type Option = 'A' | 'B' | 'C' | 'D';
const OPTIONS: Option[] = ['A', 'B', 'C', 'D'];

interface QuizResult {
  passed: boolean;
  score: number;
}

export default function QuizSection() {
  const { session, submitQuiz, clearError } = useAgentSession();
  const questions = session.quizQuestions;

  const [answers, setAnswers] = useState<Record<string, Option>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length && questions.length > 0;
  const progress = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const isLoading = submitting || session.loading;

  const handleSelect = (questionId: string, option: Option) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  const handleSubmit = async () => {
    if (!allAnswered || isLoading) return;
    setSubmitting(true);
    clearError();
    const answersArray = questions.map((q) => answers[q.id]);
    const res = await submitQuiz(answersArray);
    if (res) {
      setResult({ passed: res.quiz_passed ?? false, score: res.score });
    }
    setSubmitting(false);
  };

  const handleRetry = () => {
    setAnswers({});
    setResult(null);
    clearError();
  };

  // ── Result screen (failed) ─────────────────────────────────────────────────
  if (result && !result.passed) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
          <XCircle className="w-8 h-8 text-red-500" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">Quiz no aprobado</h3>
          <p className="text-sm text-slate-500">
            Obtuviste{' '}
            <span className="font-semibold text-slate-700">
              {Math.round(result.score)}
            </span>{' '}
            puntos. Necesitas al menos 60 para aprobar.
          </p>
          <p className="text-sm text-slate-500 mt-1">Puedes reintentar el quiz.</p>
        </div>
        <button
          onClick={handleRetry}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar quiz
        </button>
      </div>
    );
  }

  // ── No questions yet ───────────────────────────────────────────────────────
  if (questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-center">
        <p className="text-sm text-slate-500">Cargando preguntas del quiz…</p>
      </div>
    );
  }

  // ── Quiz form ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Quiz header */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="w-4 h-4 text-indigo-500" />
          <h3 className="font-semibold text-slate-800 text-sm">
            Quiz — Semana {session.currentWeek}
          </h3>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500">
            Pregunta {answeredCount} de {questions.length}
          </span>
          <span className="text-xs font-medium text-indigo-600">{progress}%</span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Error banner */}
      {session.error && (
        <div className="mx-5 mt-4 flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-red-700">{session.error}</p>
          </div>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 flex-shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            Reintentar
          </button>
        </div>
      )}

      {/* Questions */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {questions.map((q, idx) => (
          <div
            key={q.id}
            className="bg-slate-50 rounded-xl border border-slate-200 p-4"
          >
            <div className="flex items-start gap-2 mb-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">
                {idx + 1}
              </span>
              <p className="text-sm font-medium text-slate-800 leading-relaxed">
                {q.question}
              </p>
            </div>

            <div className="space-y-1.5 pl-7">
              {OPTIONS.map((opt) => {
                const selected = answers[q.id] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleSelect(q.id, opt)}
                    disabled={isLoading}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors disabled:cursor-not-allowed ${
                      selected
                        ? 'bg-indigo-500 text-white border-indigo-500'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                    }`}
                  >
                    <span className="font-semibold mr-1.5">{opt})</span>
                    {q.options[opt]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Submit */}
      <div className="p-4 border-t border-slate-100">
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Evaluando tus respuestas…
            </>
          ) : (
            'Enviar quiz'
          )}
        </button>
      </div>
    </div>
  );
}
