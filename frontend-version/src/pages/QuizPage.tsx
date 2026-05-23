import { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import {
  Lock, CheckCircle2, Circle, Trophy, XCircle,
  ClipboardCheck, RefreshCw, Loader2, AlertCircle, ArrowRight, Play,
  CheckCircle, XCircle as XCircleSmall,
} from 'lucide-react';
import { useAgentSession } from '../context/AgentSessionContext';
import { useWeekProgress } from '../hooks/useWeekProgress';
import { agentApi } from '../services/agentApi';
import type { QuizQuestion } from '../types/agent';
import type { TabId } from '../components/Sidebar';

type Option = 'A' | 'B' | 'C' | 'D';
const OPTIONS: Option[] = ['A', 'B', 'C', 'D'];

interface QuizResult {
  passed: boolean;
  score: number;
  weekCompleted: number;
  nextWeek: number;
  submittedAnswers: Record<string, Option>;
  submittedQuestions: QuizQuestion[];
}

interface Props {
  onNavigate?: (tab: TabId) => void;
}

export default function QuizPage({ onNavigate }: Props) {
  const { session, submitQuiz, clearError, setInQuizMode, restoreSession } = useAgentSession();
  const uid = getAuth().currentUser?.uid ?? null;

  const hasRoadmap = session.diagnosticComplete && session.learningRoadmap.length > 0;
  const currentWeekData = hasRoadmap
    ? (session.learningRoadmap[session.currentWeek - 1] ?? null)
    : null;
  const modules = currentWeekData?.modules ?? [];

  const { completedModules, loading: progressLoading } = useWeekProgress(
    hasRoadmap ? uid : null,
    session.currentWeek,
  );

  const completedCount = modules.filter((m) => completedModules.has(m.module_number)).length;
  const allModulesDone = modules.length > 0 && completedCount === modules.length;

  const questions = session.quizQuestions;
  const [quizStarted, setQuizStarted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Option>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryFailed, setRecoveryFailed] = useState(false);

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length && questions.length > 0;
  const isLoading = submitting || session.loading;

  // When all modules are done but quiz questions are missing in session (e.g. after
  // restoring from an old Firestore document that lacked the field), try to recover
  // them from the backend before showing the start screen.
  useEffect(() => {
    if (
      progressLoading ||
      !allModulesDone ||
      questions.length > 0 ||
      !session.sessionId ||
      session.hydrating ||
      recovering ||
      recoveryFailed
    ) return;

    let cancelled = false;
    setRecovering(true);

    agentApi.getSession(session.sessionId)
      .then((state) => {
        if (cancelled) return;
        if (state.quiz_questions && state.quiz_questions.length > 0) {
          restoreSession({ quizQuestions: state.quiz_questions });
        } else {
          setRecoveryFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setRecoveryFailed(true);
      })
      .finally(() => {
        if (!cancelled) setRecovering(false);
      });

    return () => { cancelled = true; };
  }, [progressLoading, allModulesDone, questions.length, session.sessionId, session.hydrating, recovering, recoveryFailed, restoreSession]);

  const handleStartQuiz = () => {
    setQuizStarted(true);
    setInQuizMode(true);
  };

  const handleSelect = (questionId: string, option: Option) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  const handleSubmit = async () => {
    if (!allAnswered || isLoading) return;
    setSubmitting(true);
    clearError();
    const weekBefore = session.currentWeek;
    const snapshotQuestions = [...questions];
    const snapshotAnswers = { ...answers };
    const answersArray = snapshotQuestions.map((q) => snapshotAnswers[q.id]);
    const res = await submitQuiz(answersArray);
    if (res) {
      const passed = res.next_step === 'next_week' || res.next_step === 'completed';
      setResult({
        passed,
        score: res.score,
        weekCompleted: weekBefore,
        nextWeek: res.current_week,
        submittedAnswers: snapshotAnswers,
        submittedQuestions: snapshotQuestions,
      });
      setInQuizMode(false);
    }
    setSubmitting(false);
  };

  // ── No diagnostic yet ──────────────────────────────────────────────────────
  if (!session.diagnosticComplete) {
    return (
      <div className="space-y-6">
        <PageHeader week={null} focus={null} />
        <div className="bg-white rounded-xl border border-slate-200 p-12 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
            <ClipboardCheck className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-700">Completa el diagnóstico primero</p>
            <p className="text-sm text-slate-500 mt-1">
              El quiz estará disponible una vez que hayas completado el diagnóstico inicial.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Results view (pass or fail) ────────────────────────────────────────────
  if (result) {
    const percentage = Math.round(result.score);
    const correctCount = result.submittedQuestions.filter(
      (q) => result.submittedAnswers[q.id] === q.correct_answer,
    ).length;
    const advancedWeek = result.passed && result.nextWeek > result.weekCompleted;

    return (
      <div className="space-y-6">
        <PageHeader week={result.weekCompleted} focus={currentWeekData?.focus ?? null} />

        {/* Pass / Fail banner */}
        <div
          className={`flex items-center gap-3 rounded-xl px-5 py-4 ${
            result.passed
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              result.passed ? 'bg-green-100' : 'bg-red-100'
            }`}
          >
            {result.passed
              ? <Trophy className="w-6 h-6 text-green-600" />
              : <XCircle className="w-6 h-6 text-red-500" />}
          </div>
          <div className="flex-1">
            <h3 className={`text-lg font-bold ${result.passed ? 'text-green-800' : 'text-red-800'}`}>
              {result.passed ? '¡Aprobaste!' : 'Quiz no aprobado'}
            </h3>
            <p className={`text-sm mt-0.5 ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
              {result.passed
                ? `${correctCount} de ${result.submittedQuestions.length} correctas · ${percentage}%${advancedWeek ? ` · Avanzas a la Semana ${result.nextWeek}` : ''}`
                : `${correctCount} de ${result.submittedQuestions.length} correctas · ${percentage}% · Necesitas al menos 70%`}
            </p>
          </div>
          <div
            className={`text-3xl font-bold flex-shrink-0 ${
              result.passed ? 'text-green-600' : 'text-red-500'
            }`}
          >
            {percentage}%
          </div>
        </div>

        {/* Per-question breakdown */}
        <div className="space-y-4">
          {result.submittedQuestions.map((q, idx) => {
            const studentAnswer = result.submittedAnswers[q.id];
            const isCorrect = studentAnswer === q.correct_answer;

            return (
              <div
                key={q.id}
                className={`bg-white rounded-xl border p-5 ${
                  isCorrect ? 'border-green-200' : 'border-red-200'
                }`}
              >
                {/* Question header */}
                <div className="flex items-start gap-3 mb-4">
                  <span
                    className={`flex-shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                      isCorrect
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <p className="text-sm font-medium text-slate-800 leading-relaxed flex-1">
                    {q.question}
                  </p>
                  {isCorrect
                    ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    : <XCircleSmall className="w-5 h-5 text-red-400 flex-shrink-0" />}
                </div>

                {/* Answer options */}
                <div className="space-y-2 pl-9">
                  {OPTIONS.map((opt) => {
                    const isStudentChoice = studentAnswer === opt;
                    const isCorrectOption = q.correct_answer === opt;

                    let cls = 'bg-slate-50 text-slate-500 border-slate-200';
                    if (isCorrectOption) {
                      cls = 'bg-green-50 text-green-800 border-green-300 font-medium';
                    } else if (isStudentChoice && !isCorrectOption) {
                      cls = 'bg-red-50 text-red-700 border-red-300';
                    }

                    return (
                      <div
                        key={opt}
                        className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm flex items-center gap-2 ${cls}`}
                      >
                        <span className="font-semibold">{opt})</span>
                        <span className="flex-1">{q.options[opt]}</span>
                        {isCorrectOption && (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        )}
                        {isStudentChoice && !isCorrectOption && (
                          <XCircleSmall className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Justification — always shown */}
                <div className="mt-4 pl-9">
                  <div className={`border rounded-lg px-4 py-3 ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                    <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isCorrect ? 'text-green-700' : 'text-amber-700'}`}>
                      Por qué es correcta la opción {q.correct_answer}
                    </p>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {q.justification || `La opción ${q.correct_answer} es la respuesta correcta para esta pregunta.`}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          {result.passed ? (
            onNavigate && (
              <button
                onClick={() => onNavigate('coach')}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
                Ir al Coach IA
              </button>
            )
          ) : (
            onNavigate && (
              <button
                onClick={() => onNavigate('dashboard')}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
                Volver al Dashboard
              </button>
            )
          )}
        </div>
      </div>
    );
  }

  // ── Loading progress ───────────────────────────────────────────────────────
  if (progressLoading) {
    return (
      <div className="space-y-6">
        <PageHeader week={session.currentWeek} focus={currentWeekData?.focus ?? null} />
        <div className="bg-white rounded-xl border border-slate-200 p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      </div>
    );
  }

  // ── Lock screen — objectives incomplete ────────────────────────────────────
  if (!allModulesDone) {
    const remaining = modules.length - completedCount;
    const pct = modules.length > 0 ? (completedCount / modules.length) * 100 : 0;

    return (
      <div className="space-y-6">
        <PageHeader week={session.currentWeek} focus={currentWeekData?.focus ?? null} />
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex flex-col items-center text-center gap-3 py-4 mb-6 border-b border-slate-100">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
              <Lock className="w-7 h-7 text-slate-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-700">Quiz bloqueado</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {remaining === 1
                  ? 'Falta 1 objetivo por completar'
                  : `Faltan ${remaining} objetivos por completar`}
              </p>
            </div>
            <div className="flex items-center gap-3 w-full max-w-xs">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-slate-600 flex-shrink-0">
                {completedCount}/{modules.length}
              </span>
            </div>
          </div>

          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Objetivos de la semana
          </p>
          <div className="space-y-2">
            {modules.map((mod) => {
              const done = completedModules.has(mod.module_number);
              return (
                <div
                  key={mod.module_number}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    done ? 'bg-green-50 border-green-100' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  {done
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : <Circle className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {mod.name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{mod.objective}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 text-center">
            <p className="text-xs text-slate-400">
              Marca los objetivos completados desde el Dashboard
            </p>
            {onNavigate && (
              <button
                onClick={() => onNavigate('dashboard')}
                className="mt-1.5 text-xs font-medium text-indigo-500 hover:text-indigo-600"
              >
                Ir al Dashboard →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── All modules done but quiz not started yet ──────────────────────────────
  if (!quizStarted) {
    // Still fetching questions from backend
    if (recovering) {
      return (
        <div className="space-y-6">
          <PageHeader week={session.currentWeek} focus={currentWeekData?.focus ?? null} />
          <div className="bg-white rounded-xl border border-slate-200 p-12 flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
            <p className="text-sm text-slate-500">Cargando preguntas del quiz…</p>
          </div>
        </div>
      );
    }

    // Backend couldn't provide questions
    if (recoveryFailed) {
      return (
        <div className="space-y-6">
          <PageHeader week={session.currentWeek} focus={currentWeekData?.focus ?? null} />
          <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-700">No se pudieron cargar las preguntas</p>
              <p className="text-sm text-slate-500 mt-1">
                El backend no tiene las preguntas del quiz en memoria. Asegúrate de que el servidor
                esté activo y recarga la página.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Recargar página
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <PageHeader week={session.currentWeek} focus={currentWeekData?.focus ?? null} />
        <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center text-center gap-6">
          <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center">
            <Trophy className="w-10 h-10 text-indigo-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-slate-800">¡Objetivos completados!</h3>
            <p className="text-sm text-slate-500">
              Has terminado todos los módulos de la Semana {session.currentWeek}.
              Ya puedes realizar el quiz de evaluación.
            </p>
          </div>

          <div className="w-full max-w-sm space-y-2">
            {modules.map((mod) => (
              <div
                key={mod.module_number}
                className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-100"
              >
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                <p className="text-sm font-medium text-slate-600">{mod.name}</p>
              </div>
            ))}
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-700 text-left w-full max-w-sm">
            <p className="font-medium mb-1">Antes de comenzar:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>5 preguntas de opción múltiple</li>
              <li>Necesitas 70% o más para aprobar</li>
              <li>El chat quedará bloqueado durante el quiz</li>
            </ul>
          </div>

          <button
            onClick={handleStartQuiz}
            className="flex items-center gap-2 px-6 py-3 text-sm font-semibold bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors shadow-sm"
          >
            <Play className="w-4 h-4" />
            Iniciar quiz
          </button>
        </div>
      </div>
    );
  }

  // ── Quiz started but questions disappeared (shouldn't normally happen) ─────
  if (questions.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader week={session.currentWeek} focus={currentWeekData?.focus ?? null} />
        <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center text-center gap-4">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-sm text-slate-500">
            Las preguntas no están disponibles. Recarga la página e inténtalo de nuevo.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Recargar página
          </button>
        </div>
      </div>
    );
  }

  // ── Quiz form ──────────────────────────────────────────────────────────────
  const quizProgress = Math.round((answeredCount / questions.length) * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <PageHeader week={session.currentWeek} focus={currentWeekData?.focus ?? null} />
        <div className="text-right pt-1">
          <p className="text-xs text-slate-500">Respondidas</p>
          <p className="text-sm font-semibold text-indigo-600">{answeredCount}/{questions.length}</p>
        </div>
      </div>

      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-300"
          style={{ width: `${quizProgress}%` }}
        />
      </div>

      {session.error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 flex-1">{session.error}</p>
          <button onClick={clearError} className="text-xs font-medium text-red-600 hover:text-red-700">
            Cerrar
          </button>
        </div>
      )}

      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start gap-3 mb-4">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">
                {idx + 1}
              </span>
              <p className="text-sm font-medium text-slate-800 leading-relaxed">{q.question}</p>
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
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
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

      <div className="sticky bottom-0 bg-slate-50 pt-3 pb-2">
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Evaluando tus respuestas…
            </>
          ) : !allAnswered ? (
            `Responde todas las preguntas (${answeredCount}/${questions.length})`
          ) : (
            'Enviar quiz'
          )}
        </button>
      </div>
    </div>
  );
}

// ── Small shared sub-components ───────────────────────────────────────────────

function PageHeader({ week, focus }: { week: number | null; focus: string | null }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800">Quiz Semanal</h2>
      <p className="text-sm text-slate-500 mt-1">
        {week !== null ? `Semana ${week}` : 'Evaluación semanal'}
        {focus ? ` · ${focus}` : ''}
      </p>
    </div>
  );
}
