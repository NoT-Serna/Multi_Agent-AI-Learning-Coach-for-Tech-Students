import os
from dotenv import load_dotenv

import json
from typing import Dict, List

from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from schemas.state import AgentState

load_dotenv()

# ─── LLM ──────────────────────────────────────────────────────────────────────

llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0.3,
)

# ─── Constants ────────────────────────────────────────────────────────────────

CATEGORIES = [
    "Fundamentos de Programación",
    "Lógica y Análisis",
    "Datos y Sistemas",
    "Razonamiento Computacional",
]

QUESTIONS_PER_CATEGORY = 5


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


# ─── Node 1: collect_profile ──────────────────────────────────────────────────

def collect_profile(state: AgentState) -> AgentState:
    """
    Validates the structured form data already present in state.
    Caller must have populated: student_name, user_background, user_preferences.
    """
    name        = state.get("student_name")     or "Estudiante"
    background  = state.get("user_background")  or "sin experiencia previa"
    preferences = state.get("user_preferences") or "programación en general"

    msg = AIMessage(content=(
        f"¡Hola {name}! Recibí tu perfil.\n"
        f"• Experiencia: {background}\n"
        f"• Intereses: {preferences}\n\n"
        "Voy a identificar las habilidades esenciales para tu perfil "
        "y preparar tu examen de diagnóstico."
    ))

    return {
        **state,
        "student_name":     name,
        "user_background":  background,
        "user_preferences": preferences,
        "messages":         [msg],
        "current_step":     "collect_profile",
        "next_step":        "generate_skills",
    }


# ─── Node 2: generate_skills ──────────────────────────────────────────────────

def generate_skills(state: AgentState) -> AgentState:
    """
    Asks the LLM to identify essential skills per category
    based on the student profile.
    """
    name        = state.get("student_name",      "Estudiante")
    background  = state.get("user_background",   "sin experiencia")
    preferences = state.get("user_preferences",  "programación en general")

    response = llm.invoke([
        SystemMessage(content="""Eres un experto en educación tecnológica.
Identifica las habilidades esenciales que un estudiante debe dominar,
organizadas en exactamente estas 4 categorías:
  - Fundamentos de Programación
  - Lógica y Análisis
  - Datos y Sistemas
  - Razonamiento Computacional

Considera el perfil del estudiante para personalizar la relevancia,
pero siempre cubre los fundamentos de cada categoría.

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "Fundamentos de Programación": ["habilidad1", "habilidad2", "habilidad3"],
  "Lógica y Análisis":           ["habilidad1", "habilidad2", "habilidad3"],
  "Datos y Sistemas":            ["habilidad1", "habilidad2", "habilidad3"],
  "Razonamiento Computacional":  ["habilidad1", "habilidad2", "habilidad3"]
}
Incluye entre 3 y 5 habilidades por categoría."""),

        HumanMessage(content=f"""Perfil del estudiante:
- Nombre: {name}
- Experiencia previa: {background}
- Temas de interés: {preferences}

Genera las habilidades esenciales."""),
    ])

    skills_by_category: Dict[str, List[str]] = _parse_json(response.content)

    # Seed skill_scores with 0.0 — evaluate_answers fills the real values
    skill_scores = {
        skill: 0.0
        for skills in skills_by_category.values()
        for skill in skills
    }

    msg = AIMessage(content=(
        "Habilidades esenciales identificadas para tu perfil:\n" +
        "\n".join(
            f"\n**{cat}**\n" + "\n".join(f"  • {s}" for s in skills)
            for cat, skills in skills_by_category.items()
        ) +
        "\n\nGenerando tu examen de diagnóstico..."
    ))

    return {
        **state,
        "messages":            [msg],
        "skill_scores":        skill_scores,
        "skills_by_category":  skills_by_category,  # add this field to AgentState
        "current_step":        "generate_skills",
        "next_step":           "generate_exam",
    }


# ─── Node 3: generate_exam ────────────────────────────────────────────────────

def generate_exam(state: AgentState) -> AgentState:
    """
    Generates 5 MCQ questions per category (20 total).
    Sets next_step = 'await_answers' so the principal pauses
    and waits for the student to submit their answers.
    """
    background         = state.get("user_background",   "sin experiencia")
    preferences        = state.get("user_preferences",  "programación en general")
    skills_by_category = state.get("skills_by_category") or {
        cat: ["habilidades fundamentales"] for cat in CATEGORIES
    }

    total = QUESTIONS_PER_CATEGORY * len(CATEGORIES)

    response = llm.invoke([
        SystemMessage(content="""Eres un experto en evaluación educativa para tecnología.
Crea un examen de diagnóstico de opción múltiple.

Reglas:
- Cada pregunta tiene exactamente 4 opciones: A, B, C, D
- Solo una opción es correcta
- Adapta la dificultad al perfil del estudiante
- Las preguntas deben ser claras y sin ambigüedades

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "questions": [
    {
      "id": "fund_q1",
      "category": "Fundamentos de Programación",
      "question": "texto de la pregunta",
      "options": {
        "A": "opción A",
        "B": "opción B",
        "C": "opción C",
        "D": "opción D"
      },
      "correct_answer": "A",
      "skill_tested": "nombre de la habilidad evaluada"
    }
  ]
}"""),

        HumanMessage(content=f"""Perfil del estudiante:
- Experiencia: {background}
- Intereses: {preferences}

Habilidades esenciales por categoría:
{json.dumps(skills_by_category, ensure_ascii=False, indent=2)}

Genera exactamente {QUESTIONS_PER_CATEGORY} preguntas por cada una
de las 4 categorías ({total} preguntas en total)."""),
    ])

    exam_data = _parse_json(response.content)
    questions: List[Dict] = exam_data.get("questions", [])

    msg = AIMessage(content=(
        f"Tu examen de diagnóstico está listo — {len(questions)} preguntas "
        f"en {len(CATEGORIES)} categorías.\n\n"
        "Para cada pregunta responde con la letra de tu opción (A, B, C o D)."
    ))

    return {
        **state,
        "messages":             [msg],
        "diagnostic_questions": questions,
        "diagnostic_answers":   [],
        "current_step":         "generate_exam",
        "next_step":            "await_answers",
    }


# ─── Node 4: evaluate_answers ─────────────────────────────────────────────────

def evaluate_answers(state: AgentState) -> AgentState:
    """
    Scores the student's diagnostic answers by category,
    populates skill_scores, strong_skills, weak_skills,
    then signals the principal to trigger the roadmap agent.
    """
    questions: List[Dict] = state.get("diagnostic_questions", [])
    answers:   List[str]  = state.get("diagnostic_answers",   [])

    if not questions or not answers:
        return {
            **state,
            "error_message": "No hay preguntas o respuestas para evaluar.",
            "current_step":  "evaluate_answers",
            "next_step":     "error",
        }

    qa_pairs = [
        {
            "id":             q.get("id", f"q{i}"),
            "category":       q.get("category", ""),
            "question":       q.get("question", ""),
            "correct_answer": q.get("correct_answer", ""),
            "student_answer": answers[i] if i < len(answers) else "sin respuesta",
            "skill_tested":   q.get("skill_tested", ""),
        }
        for i, q in enumerate(questions)
    ]

    response = llm.invoke([
        SystemMessage(content="""Eres un evaluador educativo.
Se te dan las preguntas con sus respuestas correctas y las respuestas del estudiante.

Calcula el puntaje por categoría (0-100) según respuestas correctas.
Fortalezas = categorías con score >= 70.
Áreas a reforzar = categorías con score < 70.

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "skill_scores": {
    "Fundamentos de Programación":  80.0,
    "Lógica y Análisis":            60.0,
    "Datos y Sistemas":             40.0,
    "Razonamiento Computacional":   75.0
  },
  "strong_skills": ["Fundamentos de Programación", "Razonamiento Computacional"],
  "weak_skills":   ["Lógica y Análisis", "Datos y Sistemas"],
  "summary": "resumen breve del desempeño"
}"""),

        HumanMessage(content=f"""Preguntas y respuestas:
{json.dumps(qa_pairs, ensure_ascii=False, indent=2)}

Evalúa y retorna el JSON."""),
    ])

    evaluation = _parse_json(response.content)

    skill_scores:  Dict[str, float] = evaluation.get("skill_scores",  {})
    strong_skills: List[str]        = evaluation.get("strong_skills", [])
    weak_skills:   List[str]        = evaluation.get("weak_skills",   [])
    summary:       str              = evaluation.get("summary", "")

    msg = AIMessage(content=(
        f"**Resultados de tu diagnóstico**\n\n{summary}\n\n"
        "**Puntajes por categoría:**\n" +
        "\n".join(f"  • {cat}: {score:.0f}/100" for cat, score in skill_scores.items()) +
        "\n\n✅ **Fortalezas:** "      + (", ".join(strong_skills) or "por desarrollar") +
        "\n⚠️ **Áreas a reforzar:** " + (", ".join(weak_skills)   or "ninguna") +
        "\n\nCon base en esto crearé tu plan de estudio personalizado."
    ))

    return {
        **state,
        "messages":            [msg],
        "skill_scores":        skill_scores,
        "strong_skills":       strong_skills,
        "weak_skills":         weak_skills,
        "diagnostic_complete": True,
        "current_step":        "evaluate_answers",
        "next_step":           "roadmap",
    }