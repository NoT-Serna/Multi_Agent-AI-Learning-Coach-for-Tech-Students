import json
from typing import Dict, List

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from agents.llm_factory import build_llm
from schemas.state import AgentState

# ─── LLM ──────────────────────────────────────────────────────────────────────
llm, llm_json = build_llm()

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


# ─── Node: generate_roadmap ───────────────────────────────────────────────────

def generate_roadmap(state: AgentState) -> AgentState:
    """
    Receives the diagnostic results from state and generates a
    personalized 4-week learning roadmap with 3 modules per week.
    Each week is progressively more challenging than the previous one.
    """
    # Student info
    name        = state.get("student_name",      "Estudiante")
    background  = state.get("user_background",   "sin experiencia previa")
    preferences = state.get("user_preferences",  "programación en general")

    # Diagnostic results
    skill_scores        = state.get("skill_scores",        {})
    skills_by_category  = state.get("skills_by_category",  {})
    strong_skills       = state.get("strong_skills",       [])
    weak_skills         = state.get("weak_skills",         [])

    response = llm_json.invoke([
        SystemMessage(content="""Eres un mentor experto en educación tecnológica.
Tu tarea es crear un plan de estudio personalizado de 4 semanas basado en el diagnóstico del estudiante.

Reglas del roadmap:
- 4 semanas en total, cada semana con exactamente 3 módulos
- Las semanas deben ser progresivamente más desafiantes
- Las primeras semanas refuerzan las habilidades débiles
- Las semanas posteriores integran y expanden las habilidades fuertes
- Los módulos deben alinearse con los intereses y preferencias del estudiante
- Cada módulo debe tener un objetivo claro y un recurso recomendado (curso, tutorial o proyecto)

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "learning_roadmap": [
    {
      "week": 1,
      "focus": "descripción del enfoque de la semana",
      "modules": [
        {
          "module_number": 1,
          "name": "nombre del módulo",
          "category": "categoría del diagnóstico que refuerza",
          "objective": "qué aprenderá el estudiante",
          "resource": "recurso recomendado con URL si es posible",
          "difficulty": "básico"
        },
        {
          "module_number": 2,
          "name": "nombre del módulo",
          "category": "categoría",
          "objective": "objetivo",
          "resource": "recurso",
          "difficulty": "básico"
        },
        {
          "module_number": 3,
          "name": "nombre del módulo",
          "category": "categoría",
          "objective": "objetivo",
          "resource": "recurso",
          "difficulty": "básico"
        }
      ]
    }
  ]
}

Los valores de difficulty deben ser: básico, intermedio, avanzado.
La semana 1 debe ser básico, semana 2 básico-intermedio, semana 3 intermedio, semana 4 avanzado."""),

        HumanMessage(content=f"""Perfil del estudiante:
- Nombre: {name}
- Experiencia previa: {background}
- Intereses: {preferences}

Resultados del diagnóstico:
- Puntajes por categoría: {json.dumps(skill_scores, ensure_ascii=False)}
- Habilidades fuertes: {', '.join(strong_skills) if strong_skills else 'ninguna aún'}
- Habilidades débiles: {', '.join(weak_skills) if weak_skills else 'ninguna'}
- Habilidades por categoría: {json.dumps(skills_by_category, ensure_ascii=False)}

Genera el roadmap personalizado de 4 semanas."""),
    ])

    roadmap_data = _parse_json(response.content)
    learning_roadmap: List[Dict] = roadmap_data.get("learning_roadmap", [])

    # Build a readable summary for the student
    summary_lines = []
    for week in learning_roadmap:
        summary_lines.append(f"\n**Semana {week['week']}** — {week['focus']}")
        for mod in week.get("modules", []):
            summary_lines.append(
                f"  • Módulo {mod['module_number']}: {mod['name']} "
                f"({mod['difficulty']}) → {mod['objective']}"
            )

    msg = AIMessage(content=(
        f"¡Hola {name}! Basándome en tu diagnóstico, aquí tienes tu plan de estudio personalizado:\n"
        + "\n".join(summary_lines) +
        "\n\nCada semana termina con un quiz. Debes obtener 70% o más para avanzar a la siguiente semana. ¡Mucho éxito!"
    ))

    return {
        **state,
        "messages":        [msg],
        "learning_roadmap": learning_roadmap,
        "current_week":     1,          # always starts at week 1
        "roadmap_complete": True,
        "roadmap_adjusted": False,
        "current_step":     "generate_roadmap",
        "next_step":        "quiz",
    }


# ─── Node: adjust_roadmap ─────────────────────────────────────────────────────

def adjust_roadmap(state: AgentState) -> AgentState:
    """
    Called when a student fails a quiz and exceeds max attempts.
    Rebuilds the roadmap from the current week forward based on
    the updated quiz scores.
    """
    current_week    = state.get("current_week",     1)
    quiz_scores     = state.get("quiz_scores",      {})
    learning_roadmap = state.get("learning_roadmap", [])
    name            = state.get("student_name",     "Estudiante")
    background      = state.get("user_background",  "sin experiencia")
    preferences     = state.get("user_preferences", "programación en general")
    weak_skills     = state.get("weak_skills",      [])

    # Keep completed weeks, rebuild from current week forward
    completed_weeks_data = [
        w for w in learning_roadmap
        if w.get("week", 0) < current_week
    ]
    weeks_remaining = 4 - current_week + 1

    response = llm_json.invoke([
        SystemMessage(content=f"""Eres un mentor experto en educación tecnológica.
Un estudiante no ha podido avanzar en su plan de estudio y necesitas ajustar
las semanas restantes para reforzar sus áreas débiles.

Debes generar exactamente {weeks_remaining} semanas (desde la semana {current_week} hasta la semana 4),
cada una con 3 módulos, progresivamente más desafiantes.

Responde ÚNICAMENTE con JSON válido:
{{
  "learning_roadmap": [
    {{
      "week": {current_week},
      "focus": "enfoque de la semana",
      "modules": [
        {{
          "module_number": 1,
          "name": "nombre",
          "category": "categoría",
          "objective": "objetivo",
          "resource": "recurso",
          "difficulty": "básico"
        }}
      ]
    }}
  ]
}}"""),

        HumanMessage(content=f"""Estudiante: {name}
Experiencia: {background}
Intereses: {preferences}
Habilidades débiles actuales: {', '.join(weak_skills)}
Puntajes del quiz por semana: {json.dumps(quiz_scores, ensure_ascii=False)}
Semana actual: {current_week}

Ajusta el plan desde la semana {current_week} hasta la semana 4."""),
    ])

    adjusted_data = _parse_json(response.content)
    adjusted_weeks: List[Dict] = adjusted_data.get("learning_roadmap", [])

    # Merge: keep completed weeks + replace remaining with adjusted
    updated_roadmap = completed_weeks_data + adjusted_weeks

    msg = AIMessage(content=(
        f"He ajustado tu plan de estudio a partir de la semana {current_week} "
        "para reforzar mejor las áreas donde necesitas más práctica. "
        "¡Sigue adelante, puedes lograrlo!"
    ))

    return {
        **state,
        "messages":         [msg],
        "learning_roadmap":  updated_roadmap,
        "roadmap_adjusted":  True,
        "current_step":      "adjust_roadmap",
        "next_step":         "quiz",
    }
