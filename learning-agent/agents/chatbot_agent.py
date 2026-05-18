import json
import logging
import os
from datetime import date as _date

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from agents.llm_factory import build_llm
from schemas.state import AgentState

logger = logging.getLogger(__name__)

# ─── LLM ──────────────────────────────────────────────────────────────────────────────
llm, llm_json = build_llm()

# ─── Modification keywords (fast pre-filter) ──────────────────────────────────────

_MODIFICATION_KEYWORDS = frozenset({
    "modifica", "cambia", "cambiar", "ajusta", "ajustar", "reorganiza",
    "reorganizar", "quita", "quitar", "elimina", "eliminar", "actualiza",
    "actualizar", "mueve", "mover", "filtra", "filtrar", "solo lunes",
    "lunes a viernes", "sin fin de semana", "sin sabado", "sin domingo",
    "entre semana", "reasigna", "reordena", "modifique", "cambie", "ajuste",
    "solo de lunes", "solo entre semana", "pon", "agrega", "agrega", "remueve",
})

_WEEKDAY_ONLY_PATTERNS = (
    "solo lunes a viernes", "lunes a viernes", "solo de lunes a viernes",
    "sin fin de semana", "sin fines de semana", "sin sabado", "sin domingo",
    "entre semana", "solo entre semana", "de lunes a viernes",
    "lunes-viernes", "solo dias de semana", "dias habiles",
)

_WEEKDAY_NAMES = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")


# ─── Calendar helpers (pure Python — no LLM needed) ───────────────────────────────────────

def _is_weekday_only_request(text: str) -> bool:
    lower = text.lower()
    return any(p in lower for p in _WEEKDAY_ONLY_PATTERNS)


def _annotate_weekdays(events: list) -> list:
    """Add a '_weekday' field to each event so the LLM doesn't have to calculate it."""
    result = []
    for event in events:
        e = dict(event)
        try:
            d = _date.fromisoformat(e.get("date", ""))
            e["_weekday"] = _WEEKDAY_NAMES[d.weekday()]
        except (ValueError, TypeError):
            pass
        result.append(e)
    return result


def _filter_to_weekdays(events: list) -> list:
    filtered = []
    for event in events:
        try:
            d = _date.fromisoformat(event.get("date", ""))
            if d.weekday() < 5:
                filtered.append(event)
        except (ValueError, TypeError):
            filtered.append(event)
    return filtered


# ─── Helpers ──────────────────────────────────────────────────────────────────────────────

def _is_quiz_mode(state: AgentState) -> bool:
    if state.get("next_step") == "await_quiz_answers":
        return True
    if len(state.get("quiz_questions", [])) > 0 and state.get("quiz_passed") is None:
        return True
    return False


def _get_last_human_message(state: AgentState) -> str:
    for message in reversed(state.get("messages", [])):
        if isinstance(message, HumanMessage):
            return message.content
    return ""


def _summarize_roadmap(learning_roadmap: list, completed_weeks: list, current_week: int | None) -> str:
    lines = []
    for week in learning_roadmap:
        week_num = week.get("week", "?")
        title    = week.get("title") or week.get("tema") or ""
        modules  = week.get("modules") or week.get("modulos") or []
        topic_names = []
        for m in modules:
            name = m.get("name") or m.get("nombre") or m.get("topic") or m.get("tema") or ""
            if name:
                topic_names.append(name)
        topics_str = ", ".join(topic_names) if topic_names else "(sin detalle)"
        if week_num in completed_weeks:
            status = "[COMPLETADA]"
        elif week_num == current_week:
            status = "[EN CURSO]"
        else:
            status = "[PENDIENTE]"
        lines.append(f"  Semana {week_num} {status}: {title} — {topics_str}")
    return "\n".join(lines)


def _summarize_current_week_tasks(study_calendar: list, current_week: int | None) -> str:
    if not study_calendar or current_week is None:
        return "  (sin tareas registradas para esta semana)"
    week_events = [e for e in study_calendar if e.get("week") == current_week]
    if not week_events:
        return "  (sin tareas registradas para esta semana)"
    completed = [e for e in week_events if e.get("completed")]
    pending   = [e for e in week_events if not e.get("completed")]

    lines = [f"  Total: {len(week_events)} tareas — {len(completed)} completadas, {len(pending)} pendientes"]
    if pending:
        lines.append("  Pendientes:")
        for e in pending[:5]:
            date  = e.get("date", "?")
            title = e.get("title", "Tarea")
            lines.append(f"    - [{date}] {title}")
        if len(pending) > 5:
            lines.append(f"    ... y {len(pending) - 5} más")
    if completed:
        lines.append(f"  Completadas: {', '.join(e.get('title', 'Tarea') for e in completed[:5])}")
    return "\n".join(lines)


def _summarize_quiz_history(quiz_scores: dict) -> str:
    if not quiz_scores:
        return "  (sin quizzes realizados)"
    lines = []
    for week_key in sorted(quiz_scores):
        score = quiz_scores[week_key]
        week_label = week_key.replace("week_", "Semana ").replace("_", " ")
        result = "Aprobado" if score >= 70 else "Reprobado"
        lines.append(f"  {week_label}: {score:.1f}% — {result}")
    return "\n".join(lines)


def _build_learning_context(state: AgentState) -> str:
    student_name      = state.get("student_name")      or "Estudiante"
    user_preferences  = state.get("user_preferences")  or ""
    user_background   = state.get("user_background")   or ""
    current_week      = state.get("current_week")
    completed_weeks   = state.get("completed_weeks")   or []
    skill_scores      = state.get("skill_scores")      or {}
    strong_skills     = state.get("strong_skills")     or []
    weak_skills       = state.get("weak_skills")       or []
    learning_roadmap  = state.get("learning_roadmap")  or []
    study_calendar    = state.get("study_calendar")    or []
    quiz_scores       = state.get("quiz_scores")       or {}

    total_weeks     = len(learning_roadmap)
    remaining_weeks = [w.get("week") for w in learning_roadmap if w.get("week") not in completed_weeks and w.get("week") != current_week]
    overall_pct     = int(len(completed_weeks) / total_weeks * 100) if total_weeks else 0

    roadmap_summary     = _summarize_roadmap(learning_roadmap, completed_weeks, current_week)
    week_tasks_summary  = _summarize_current_week_tasks(study_calendar, current_week)
    quiz_history        = _summarize_quiz_history(quiz_scores)

    profile_lines = []
    if user_background:
        profile_lines.append(f"Conocimientos previos: {user_background}")
    if user_preferences:
        profile_lines.append(f"Objetivos y preferencias: {user_preferences}")
    profile_section = "\n".join(profile_lines) if profile_lines else "  (sin datos de perfil)"

    skill_lines = []
    for skill, score in skill_scores.items():
        skill_lines.append(f"  {skill}: {score:.1f}%")
    skills_section = "\n".join(skill_lines) if skill_lines else "  (sin puntajes)"

    return (
        "[CONTEXTO DE APRENDIZAJE]\n"
        f"Nombre del estudiante: {student_name}\n\n"
        f"--- Perfil del estudiante ---\n"
        f"{profile_section}\n\n"
        f"--- Progreso general ---\n"
        f"Semana actual: {current_week} de {total_weeks}\n"
        f"Semanas completadas: {completed_weeks}\n"
        f"Semanas pendientes: {remaining_weeks}\n"
        f"Avance total: {overall_pct}%\n\n"
        f"--- Habilidades evaluadas ---\n"
        f"{skills_section}\n"
        f"Habilidades fuertes: {strong_skills}\n"
        f"Habilidades a reforzar: {weak_skills}\n\n"
        f"--- Tareas de la semana actual (Semana {current_week}) ---\n"
        f"{week_tasks_summary}\n\n"
        f"--- Historial de quizzes ---\n"
        f"{quiz_history}\n\n"
        f"--- Plan de aprendizaje completo ---\n"
        f"{roadmap_summary}\n"
        "[FIN DEL CONTEXTO]"
    )


def _parse_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end   = text.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError(f"No JSON found: {text}")
        return json.loads(text[start:end])


# ─── Firestore helpers ──────────────────────────────────────────────────────────────────

def _get_firestore_client():
    import firebase_admin
    from firebase_admin import credentials, firestore as admin_firestore
    if not firebase_admin._apps:
        path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
        if path and os.path.exists(path):
            cred = credentials.Certificate(path)
        else:
            cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)
    return admin_firestore.client()


def _write_calendar_to_firestore(uid: str, events: list) -> None:
    db  = _get_firestore_client()
    ref = db.collection("usuarios").document(uid).collection("study_calendar")

    delete_batch = db.batch()
    for doc in ref.stream():
        delete_batch.delete(doc.reference)
    delete_batch.commit()

    write_batch = db.batch()
    for event in events:
        doc_ref = ref.document()
        write_batch.set(doc_ref, {k: v for k, v in event.items() if k != "id"})
    write_batch.commit()
    logger.info("Calendar updated via chatbot for uid=%s (%d events)", uid, len(events))


def _read_calendar_from_firestore(uid: str) -> list:
    try:
        db  = _get_firestore_client()
        ref = db.collection("usuarios").document(uid).collection("study_calendar")
        events = [doc.to_dict() for doc in ref.stream()]
        return sorted(events, key=lambda e: e.get("date", ""))
    except Exception as exc:
        logger.warning("Could not read calendar from Firestore in chatbot: %s", exc)
        return []


# ─── Intent detection ───────────────────────────────────────────────────────────────────

def _might_be_modification(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in _MODIFICATION_KEYWORDS)


def _classify_modification_intent(question: str) -> str:
    """Returns 'modify_calendar', 'modify_roadmap', or 'none'."""
    try:
        response = llm_json.invoke([
            SystemMessage(content=(
                "Clasifica si el usuario quiere MODIFICAR algo en su plan de estudio.\n"
                "Responde UNICAMENTE con JSON valido sin texto adicional:\n"
                '{"intent": "<modify_calendar|modify_roadmap|none>"}\n\n'
                "- modify_calendar: quiere cambiar dias, horarios, fechas o estructura del calendario\n"
                "- modify_roadmap: quiere cambiar modulos, contenidos o materias del plan de estudio\n"
                "- none: es una pregunta informativa, no implica cambios"
            )),
            HumanMessage(content=question),
        ])
        data = _parse_json(response.content)
        return data.get("intent", "none")
    except Exception:
        return "none"


# ─── Modification handlers ─────────────────────────────────────────────────────────────────

def _handle_calendar_modification(state: AgentState, question: str) -> AgentState:
    uid          = state.get("_chat_uid") or state.get("student_id") or ""
    student_name = state.get("student_name") or "Estudiante"

    current_calendar = list(state.get("study_calendar") or [])
    if not current_calendar and uid:
        current_calendar = _read_calendar_from_firestore(uid)

    if not current_calendar:
        msg = AIMessage(content=(
            "No encontre un calendario de estudio activo para modificar. "
            "Completa el diagnostico inicial para generar tu plan."
        ))
        return {**state, "messages": [msg]}

    # ─ Handle weekday-only filter in Python (the LLM is unreliable for date arithmetic) ─
    if _is_weekday_only_request(question):
        modified_events = _filter_to_weekdays(current_calendar)
        removed = len(current_calendar) - len(modified_events)
        if uid:
            try:
                _write_calendar_to_firestore(uid, modified_events)
            except Exception as exc:
                logger.error("Failed to write modified calendar to Firestore: %s", exc)
        msg = AIMessage(content=(
            f"Listo, {student_name}. Se eliminaron {removed} actividades de fin de semana. "
            f"Tu calendario ahora tiene {len(modified_events)} eventos solo de lunes a viernes.\n\n"
            "Los cambios ya estan reflejados en tu seccion de Calendario."
        ))
        return {
            **state,
            "messages":                [msg],
            "study_calendar":          modified_events,
            "_chat_modified_calendar": True,
        }

    # ─ Other modifications: annotate weekdays so the LLM doesn't have to calculate them ─
    try:
        annotated_calendar = _annotate_weekdays(current_calendar)
        response = llm_json.invoke([
            SystemMessage(content=(
                "Eres un asistente que modifica calendarios de estudio en JSON.\n"
                "Aplica EXACTAMENTE lo que el usuario pide. Conserva todos los campos originales de cada evento "
                "(ignora el campo '_weekday', es solo informativo).\n\n"
                "Reglas:\n"
                "- cambiar hora: modifica el campo 'time' (formato HH:MM)\n"
                "- eliminar semana X: elimina eventos cuyo campo 'week' sea igual a X\n"
                "- El campo '_weekday' ya indica el dia de la semana de cada evento, usalo si lo necesitas\n\n"
                "Responde UNICAMENTE con JSON valido, sin texto adicional:\n"
                '{"events": [...lista completa de eventos modificados sin el campo _weekday...]}'
            )),
            HumanMessage(content=(
                f"Estudiante: {student_name}\n"
                f"Solicitud: {question}\n\n"
                f"Calendario actual:\n{json.dumps(annotated_calendar, ensure_ascii=False)}\n\n"
                "Devuelve el calendario completo con la modificacion aplicada."
            )),
        ])

        data            = _parse_json(response.content)
        modified_events = data.get("events", current_calendar)

        # Strip any _weekday annotation the LLM may have left
        modified_events = [{k: v for k, v in e.items() if k != "_weekday"} for e in modified_events]

        if uid:
            try:
                _write_calendar_to_firestore(uid, modified_events)
            except Exception as exc:
                logger.error("Failed to write modified calendar to Firestore: %s", exc)

        msg = AIMessage(content=(
            f"Listo, {student_name}. Tu calendario ha sido actualizado. "
            "Puedes verlo en la seccion de Calendario."
        ))
        return {
            **state,
            "messages":                [msg],
            "study_calendar":          modified_events,
            "_chat_modified_calendar": True,
        }

    except Exception as exc:
        logger.error("Calendar modification failed: %s", exc)
        msg = AIMessage(content=(
            "Lo siento, no pude aplicar ese cambio al calendario en este momento. "
            "Por favor, intenta describir el cambio de otra manera."
        ))
        return {**state, "messages": [msg]}


def _handle_roadmap_modification(state: AgentState, question: str) -> AgentState:
    student_name     = state.get("student_name")     or "Estudiante"
    learning_roadmap = list(state.get("learning_roadmap") or [])

    if not learning_roadmap:
        msg = AIMessage(content=(
            "No tienes un plan de estudio activo para modificar. "
            "Completa el diagnostico inicial primero."
        ))
        return {**state, "messages": [msg]}

    try:
        response = llm_json.invoke([
            SystemMessage(content=(
                "Eres un asistente que modifica planes de estudio en JSON.\n"
                "Aplica exactamente lo que el usuario pide. Conserva la estructura de semanas y modulos.\n\n"
                "Responde UNICAMENTE con JSON valido:\n"
                '{"roadmap": [...semanas modificadas...]}'
            )),
            HumanMessage(content=(
                f"Estudiante: {student_name}\n"
                f"Solicitud: {question}\n\n"
                f"Plan de estudio actual (JSON):\n{json.dumps(learning_roadmap, ensure_ascii=False, indent=2)}\n\n"
                "Aplica la modificacion y devuelve el plan completo modificado."
            )),
        ])

        data             = _parse_json(response.content)
        modified_roadmap = data.get("roadmap", learning_roadmap)

        msg = AIMessage(content=(
            f"Listo, {student_name}. Tu plan de estudio ha sido actualizado. "
            "Puedes verlo en la seccion de Roadmap."
        ))
        return {
            **state,
            "messages":               [msg],
            "learning_roadmap":       modified_roadmap,
            "_chat_modified_roadmap": True,
        }

    except Exception as exc:
        logger.error("Roadmap modification failed: %s", exc)
        msg = AIMessage(content=(
            "Lo siento, no pude aplicar ese cambio al plan de estudio. "
            "Por favor, intenta describir el cambio de otra manera."
        ))
        return {**state, "messages": [msg]}


# ─── Main node ──────────────────────────────────────────────────────────────────────────────

def chatbot_agent(state: AgentState) -> AgentState:
    """
    Responds to student questions about their learning plan and can modify
    the study calendar or roadmap based on natural-language requests.

    Invariants when NOT modifying:
    - Does not change: current_step, next_step, quiz_passed, quiz_questions
    - Appends exactly one AIMessage to messages
    """
    # ─ Quiz mode ─────────────────────────────────────────────────────────────────────
    if _is_quiz_mode(state):
        msg = AIMessage(content=(
            "En este momento estas en medio de un quiz de evaluacion. "
            "El chatbot no esta disponible durante el quiz. "
            "Una vez que finalices la evaluacion, podras hacerme todas las preguntas que necesites."
        ))
        return {**state, "messages": [msg]}

    # ─ No roadmap yet ───────────────────────────────────────────────────────────────
    if not state.get("learning_roadmap"):
        msg = AIMessage(content=(
            "Aun no tienes un plan de estudio personalizado. "
            "Primero necesitas completar el diagnostico inicial. "
            "Una vez que tengas tu plan, estare aqui para resolver tus dudas."
        ))
        return {**state, "messages": [msg]}

    question = _get_last_human_message(state)

    if not question.strip():
        msg = AIMessage(content=(
            "Parece que no recibi ninguna pregunta. "
            "Por favor, escribe tu consulta y con gusto te ayudo."
        ))
        return {**state, "messages": [msg]}

    # ─ Detect modification intent ────────────────────────────────────────────────────
    if _might_be_modification(question):
        # Short-circuit LLM classification for weekday-only patterns — pure Python is
        # more reliable than asking a small LLM to return JSON for a well-known request.
        if _is_weekday_only_request(question):
            return _handle_calendar_modification(state, question)
        intent = _classify_modification_intent(question)
        if intent == "modify_calendar":
            return _handle_calendar_modification(state, question)
        if intent == "modify_roadmap":
            return _handle_roadmap_modification(state, question)

    # ─ Ensure calendar is loaded for context (fallback to Firestore) ─────────────────
    uid = state.get("_chat_uid") or state.get("student_id") or ""
    if not state.get("study_calendar") and uid:
        calendar = _read_calendar_from_firestore(uid)
        if calendar:
            state = {**state, "study_calendar": calendar}

    # ─ Normal Q&A response ──────────────────────────────────────────────────────────
    context = _build_learning_context(state)

    # Prompt designed for small LLMs: short instructions, data first, question last.
    system_prompt = (
        "Eres un asistente de aprendizaje. "
        "Responde la pregunta del estudiante usando UNICAMENTE los datos proporcionados abajo. "
        "Si los datos no contienen la respuesta, di que no tienes esa informacion. "
        "Responde en el mismo idioma de la pregunta. Maximo 300 palabras. "
        "Tono motivador. Menciona el nombre del estudiante.\n\n"
        f"{context}"
    )

    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=question),
    ])

    return {**state, "messages": [AIMessage(content=response.content)]}
