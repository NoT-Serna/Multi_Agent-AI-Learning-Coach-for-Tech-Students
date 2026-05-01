import json

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from agents.llm_factory import build_llm
from schemas.state import AgentState

# ─── LLM ──────────────────────────────────────────────────────────────────────
llm, _ = build_llm()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _is_quiz_mode(state: AgentState) -> bool:
    """
    Determina si el estado está en Quiz_Mode.

    Retorna True si:
      - next_step == "await_quiz_answers", O
      - quiz_questions es no vacío Y quiz_passed es None
    """
    if state.get("next_step") == "await_quiz_answers":
        return True
    if len(state.get("quiz_questions", [])) > 0 and state.get("quiz_passed") is None:
        return True
    return False


def _get_last_human_message(state: AgentState) -> str:
    """
    Extrae el contenido del último HumanMessage en state["messages"].

    Retorna string vacío si no hay ningún HumanMessage.
    """
    for message in reversed(state.get("messages", [])):
        if isinstance(message, HumanMessage):
            return message.content
    return ""


def _build_learning_context(state: AgentState) -> str:
    """
    Construye el bloque de contexto de aprendizaje para el prompt del LLM.

    Serializa: student_name, current_week, completed_weeks,
               skill_scores, strong_skills, weak_skills, learning_roadmap.
    """
    student_name    = state.get("student_name")    or "Estudiante"
    current_week    = state.get("current_week")
    completed_weeks = state.get("completed_weeks") or []
    skill_scores    = state.get("skill_scores")    or {}
    strong_skills   = state.get("strong_skills")   or []
    weak_skills     = state.get("weak_skills")     or []
    learning_roadmap = state.get("learning_roadmap") or []

    return (
        f"[CONTEXTO DE APRENDIZAJE]\n"
        f"Nombre del estudiante: {student_name}\n"
        f"Semana actual: {current_week}\n"
        f"Semanas completadas: {completed_weeks}\n"
        f"Puntajes por habilidad: {skill_scores}\n"
        f"Habilidades fuertes: {strong_skills}\n"
        f"Habilidades a reforzar: {weak_skills}\n"
        f"Roadmap de aprendizaje:\n"
        f"{json.dumps(learning_roadmap, ensure_ascii=False, indent=2)}\n"
        f"[FIN DEL CONTEXTO]"
    )


# ─── Main node ────────────────────────────────────────────────────────────────

def chatbot_agent(state: AgentState) -> AgentState:
    """
    Nodo LangGraph que responde preguntas del estudiante sobre su roadmap.

    Comportamiento:
    - Si el estado está en Quiz_Mode → retorna mensaje de bloqueo
    - Si learning_roadmap está vacío → retorna mensaje de "sin roadmap"
    - En caso contrario → genera respuesta contextualizada con el LLM

    Invariantes:
    - No modifica: current_step, next_step, quiz_passed, quiz_questions, learning_roadmap
    - Siempre agrega exactamente un AIMessage a messages
    """
    # ── Rama 1: Quiz_Mode ────────────────────────────────────────────────────
    if _is_quiz_mode(state):
        msg = AIMessage(content=(
            "En este momento estás en medio de un quiz de evaluación. "
            "El chatbot de consultas no está disponible durante el quiz. "
            "Una vez que finalices la evaluación, podrás hacerme todas las preguntas que necesites. "
            "¡Mucho ánimo!"
        ))
        return {**state, "messages": [msg]}

    # ── Rama 2: Roadmap vacío ────────────────────────────────────────────────
    if not state.get("learning_roadmap"):
        msg = AIMessage(content=(
            "Aún no tienes un plan de estudio personalizado. "
            "Para que pueda ayudarte con preguntas sobre tu ruta de aprendizaje, "
            "primero necesitas completar el diagnóstico inicial. "
            "Una vez que tengas tu plan de estudio, estaré aquí para resolver todas tus dudas."
        ))
        return {**state, "messages": [msg]}

    # ── Rama 3: Respuesta normal ─────────────────────────────────────────────
    question = _get_last_human_message(state)

    if not question.strip():
        msg = AIMessage(content=(
            "Parece que no recibí ninguna pregunta. "
            "Por favor, escribe tu consulta sobre tu plan de aprendizaje y con gusto te ayudo."
        ))
        return {**state, "messages": [msg]}

    student_name = state.get("student_name") or "Estudiante"
    context = _build_learning_context(state)

    system_prompt = (
        f"Eres un mentor de aprendizaje personalizado para {student_name}. "
        "Tu rol es ayudar al estudiante a entender y avanzar en su ruta de aprendizaje de programación y tecnología.\n\n"
        "Instrucciones:\n"
        "- Responde SIEMPRE en el mismo idioma en que el estudiante formuló su pregunta.\n"
        "- Usa un tono motivador y de apoyo; celebra el progreso y alienta ante las dificultades.\n"
        "- Limita tu respuesta a un máximo de 400 palabras.\n"
        "- Basa tus respuestas exclusivamente en la información del contexto de aprendizaje proporcionado; "
        "no inventes información que no esté en el contexto.\n"
        "- Si la pregunta no está relacionada con programación, tecnología o el plan de aprendizaje del estudiante, "
        "indícale amablemente que solo puedes responder sobre su plan de aprendizaje y ruta de estudio.\n"
        "- Incluye el nombre del estudiante en tu respuesta para personalizarla.\n\n"
        f"{context}"
    )

    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=question),
    ])

    return {**state, "messages": [AIMessage(content=response.content)]}
