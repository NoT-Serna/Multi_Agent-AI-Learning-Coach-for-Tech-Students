import json
from typing import Dict, List

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from agents.llm_factory import build_llm
from schemas.state import AgentState

# ─── LLM ──────────────────────────────────────────────────────────────────────
llm, llm_json = build_llm()

# ─── Constants ────────────────────────────────────────────────────────────────

PASSING_SCORE  = 70.0   # minimum % to advance to next week
QUESTIONS_PER_QUIZ = 5


# ─── Helper ───────────────────────────────────────────────────────────────────

def _parse_json(text: str) -> dict:
    """Safely extract and parse a JSON block from LLM output."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end   = text.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError(f"No JSON found in LLM response:\n{text}")
        return json.loads(text[start:end])


# ─── Node 1: generate_quiz ────────────────────────────────────────────────────

def generate_quiz(state: AgentState) -> AgentState:
    """
    Generates 5 MCQ questions based on the current week's modules
    and the student's weak skills from the diagnostic.
    Sets next_step to 'await_quiz_answers' so the principal pauses
    for the student to submit answers.
    """
    # Student info
    name        = state.get("student_name",     "Estudiante")
    background  = state.get("user_background",  "sin experiencia previa")
    preferences = state.get("user_preferences", "programación en general")

    # Diagnostic results
    weak_skills  = state.get("weak_skills",  [])
    skill_scores = state.get("skill_scores", {})

    # Current week modules from roadmap
    current_week     = state.get("current_week", 1)
    learning_roadmap = state.get("learning_roadmap", [])

    week_data = next(
        (w for w in learning_roadmap if w.get("week") == current_week), {}
    )
    modules   = week_data.get("modules", [])
    week_focus = week_data.get("focus", "")

    response = llm_json.invoke([
        SystemMessage(content=f"""Eres un mentor experto en educación tecnológica.
Crea un quiz de {QUESTIONS_PER_QUIZ} preguntas de opción múltiple para evaluar
al estudiante al final de la semana {current_week} de su plan de estudio.

Reglas:
- Cada pregunta tiene exactamente 4 opciones: A, B, C, D
- Solo una opción es correcta
- Las preguntas deben cubrir los módulos de la semana actual
- Prioriza las habilidades débiles del estudiante
- Las preguntas deben ser claras y sin ambigüedades

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{{
  "questions": [
    {{
      "id": "week{current_week}_q1",
      "week": {current_week},
      "question": "texto de la pregunta",
      "module_reference": "nombre del módulo que evalúa",
      "options": {{
        "A": "opción A",
        "B": "opción B",
        "C": "opción C",
        "D": "opción D"
      }},
      "correct_answer": "A",
      "skill_tested": "habilidad que evalúa"
    }}
  ]
}}"""),

        HumanMessage(content=f"""Perfil del estudiante:
- Nombre: {name}
- Experiencia: {background}
- Intereses: {preferences}

Semana {current_week} — Enfoque: {week_focus}
Módulos de la semana:
{json.dumps(modules, ensure_ascii=False, indent=2)}

Habilidades débiles del diagnóstico:
{', '.join(weak_skills) if weak_skills else 'ninguna identificada'}

Puntajes del diagnóstico:
{json.dumps(skill_scores, ensure_ascii=False)}

Genera el quiz de {QUESTIONS_PER_QUIZ} preguntas para la semana {current_week}."""),
    ])

    quiz_data = _parse_json(response.content)
    questions: List[Dict] = quiz_data.get("questions", [])

    msg = AIMessage(content=(
        f"Quiz de la semana {current_week} listo — {len(questions)} preguntas.\n\n"
        f"Enfoque: {week_focus}\n\n"
        "Responde cada pregunta con la letra de tu opción (A, B, C o D). "
        f"Necesitas un {PASSING_SCORE:.0f}% o más para avanzar a la siguiente semana."
    ))

    return {
        **state,
        "messages":          [msg],
        "quiz_questions":    questions,
        "quiz_answers":      [],
        "quiz_passed":       None,
        "current_quiz_week": current_week,
        "current_step":      "generate_quiz",
        "next_step":         "await_quiz_answers",
    }


# ─── Node 2: evaluate_quiz_answers ────────────────────────────────────────────

def evaluate_quiz_answers(state: AgentState) -> AgentState:
    """
    Scores the student's quiz answers, determines pass/fail,
    updates quiz_attempts, and signals the principal to either
    advance to the next week or trigger adjust_roadmap.
    """
    name              = state.get("student_name",      "Estudiante")
    current_quiz_week = state.get("current_quiz_week", 1)
    quiz_questions    = state.get("quiz_questions",    [])
    quiz_answers      = state.get("quiz_answers",      [])
    quiz_scores       = state.get("quiz_scores",       {})
    quiz_attempts     = state.get("quiz_attempts",     {})
    max_attempts      = state.get("max_attempts",      3)
    completed_weeks   = state.get("completed_weeks",   [])

    if not quiz_questions or not quiz_answers:
        return {
            **state,
            "error_message": "No hay preguntas o respuestas para evaluar.",
            "current_step":  "evaluate_quiz_answers",
            "next_step":     "error",
        }

    # Pair questions with student answers for the LLM
    qa_pairs = [
        {
            "id":             q.get("id", f"q{i}"),
            "question":       q.get("question", ""),
            "correct_answer": q.get("correct_answer", ""),
            "student_answer": quiz_answers[i] if i < len(quiz_answers) else "sin respuesta",
            "skill_tested":   q.get("skill_tested", ""),
            "module_reference": q.get("module_reference", ""),
        }
        for i, q in enumerate(quiz_questions)
    ]

    response = llm_json.invoke([
        SystemMessage(content=f"""Eres un evaluador educativo.
Evalúa las respuestas del estudiante al quiz de la semana {current_quiz_week}.

Calcula:
1. El puntaje total (0-100)
2. Cuántas preguntas respondió correctamente
3. Si aprobó (score >= {PASSING_SCORE})
4. Un resumen motivador del desempeño

Responde ÚNICAMENTE con JSON válido:
{{
  "score": 80.0,
  "correct_count": 4,
  "total_questions": 5,
  "passed": true,
  "weak_areas": ["habilidad que falló"],
  "summary": "resumen del desempeño"
}}"""),

        HumanMessage(content=f"""Estudiante: {name}
Semana evaluada: {current_quiz_week}

Preguntas y respuestas:
{json.dumps(qa_pairs, ensure_ascii=False, indent=2)}

Evalúa y retorna el JSON."""),
    ])

    evaluation     = _parse_json(response.content)
    score: float   = evaluation.get("score",          0.0)
    passed: bool   = evaluation.get("passed",         False)
    summary: str   = evaluation.get("summary",        "")
    weak_areas     = evaluation.get("weak_areas",     [])

    # Update quiz scores and attempts
    week_key              = f"week_{current_quiz_week}"
    updated_scores        = {**quiz_scores,   week_key: score}
    current_attempts      = quiz_attempts.get(week_key, 0) + 1
    updated_attempts      = {**quiz_attempts, week_key: current_attempts}

    # Determine next step
    if passed:
        # Advance to next week
        updated_completed = completed_weeks + [current_quiz_week]
        next_week         = current_quiz_week + 1
        next_step         = "next_week" if next_week <= 4 else "completed"

        msg = AIMessage(content=(
            f"🎉 **¡Felicitaciones {name}!**\n\n{summary}\n\n"
            f"**Puntaje: {score:.0f}/100** — ✅ Aprobado\n\n"
            + (f"Avanzas a la semana {next_week}. ¡Sigue así!"
               if next_week <= 4
               else "¡Completaste el plan de estudio! 🏆")
        ))

        return {
            **state,
            "messages":        [msg],
            "quiz_scores":     updated_scores,
            "quiz_attempts":   updated_attempts,
            "quiz_passed":     True,
            "completed_weeks": updated_completed,
            "current_week":    next_week if next_week <= 4 else current_quiz_week,
            "weak_skills":     weak_areas if weak_areas else state.get("weak_skills", []),
            "current_step":    "evaluate_quiz_answers",
            "next_step":       next_step,
        }

    else:
        # Failed — check if max attempts reached
        if current_attempts >= max_attempts:
            next_step = "adjust_roadmap"
            feedback  = (
                f"Has alcanzado el máximo de intentos ({max_attempts}) para la semana {current_quiz_week}. "
                "Voy a ajustar tu plan de estudio para reforzar las áreas donde necesitas más práctica."
            )
        else:
            next_step = "retry_quiz"
            remaining = max_attempts - current_attempts
            feedback  = (
                f"Te quedan {remaining} intento(s) para esta semana. "
                "Revisa los módulos e inténtalo de nuevo."
            )

        msg = AIMessage(content=(
            f"**Resultado semana {current_quiz_week}**\n\n{summary}\n\n"
            f"**Puntaje: {score:.0f}/100** — ❌ No aprobado (mínimo {PASSING_SCORE:.0f})\n\n"
            f"Áreas a reforzar: {', '.join(weak_areas) if weak_areas else 'revisar todos los módulos'}\n\n"
            f"{feedback}"
        ))

        return {
            **state,
            "messages":      [msg],
            "quiz_scores":   updated_scores,
            "quiz_attempts": updated_attempts,
            "quiz_passed":   False,
            "weak_skills":   weak_areas if weak_areas else state.get("weak_skills", []),
            "current_step":  "evaluate_quiz_answers",
            "next_step":     next_step,
        }
