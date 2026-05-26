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
    "solo de lunes", "solo entre semana", "pon", "agrega", "remueve",
    # crear tareas
    "crea", "crear", "crees",  # "crees" = subjunctive of "crear"
    "nueva tarea", "nuevo evento", "agrega tarea",
    "agregar tarea", "añade", "añadir",
    # mover fecha/día (formas imperativas y subjuntivas)
    "cambia el dia", "cambia de dia", "cambia la fecha", "mueve la tarea",
    "pasa la tarea", "pásala", "pasala", "pases", "muevas", "traslades",
    "pasalo", "pásalo", "muevela", "muévela", "muevelo", "muévelo",
    # extender semana
    "extiende", "extender", "amplía", "ampliar", "amplia", "duración",
    "duracion", "más tiempo", "mas tiempo", "más días", "mas dias",
    # restaurar calendario original
    "restaura", "restaurar", "restablece", "restablecer", "resetea", "resetear",
    "volver al original", "calendario original", "calendario por defecto",
    "deshacer cambios", "deshacer", "original",
    # una tarea por día
    "una tarea por dia", "una actividad por dia", "una por dia",
    "solo una tarea", "solo una actividad", "una tarea al dia",
    "una actividad al dia", "maximo una tarea", "un evento por dia",
    # mover días específicos
    "mueve las tareas", "mueve los eventos", "pasa las tareas",
    "pasa los eventos", "traslada las tareas", "traslada los eventos",
})

_WEEKDAY_ONLY_PATTERNS = (
    "solo lunes a viernes", "lunes a viernes", "solo de lunes a viernes",
    "sin fin de semana", "sin fines de semana", "sin sabado", "sin domingo",
    "entre semana", "solo entre semana", "de lunes a viernes",
    "lunes-viernes", "solo dias de semana", "dias habiles",
)

_RESET_CALENDAR_PATTERNS = (
    "restaura el calendario", "restaurar el calendario",
    "restablece el calendario", "restablecer el calendario",
    "resetea el calendario", "resetear el calendario",
    "volver al calendario original", "calendario original",
    "calendario por defecto", "calendario predeterminado",
    "deshacer cambios del calendario", "deshacer los cambios",
    "volver al original", "restaura mi calendario",
    "calendario inicial", "el calendario de antes",
    # Variantes conversacionales en español
    "vuelve el calendario a como estaba", "como estaba antes", "como al principio",
    "a como estaba en un principio", "como estaba en un principio",
    "vuelve al calendario de antes", "déjalo como estaba", "dejalo como estaba",
    "vuelve a dejarlo como estaba", "ponlo como estaba",
)

_EXTENSION_PATTERNS = (
    "extiende la semana", "extiende semana", "extender la semana",
    "extender semana", "ampliar la semana", "ampliar semana",
    "amplía la semana", "amplía semana", "amplia la semana",
    "más tiempo en la semana", "mas tiempo en la semana",
    "más días en la semana", "mas dias en la semana",
    "más días para la semana", "mas dias para la semana",
    "extender duración", "extender duracion", "extiende la duración",
    "extiende la duracion", "alargar la semana", "alargar semana",
    "más semanas", "mas semanas",
)

_WEEKDAY_NAMES = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")

_WEEKDAY_INDEX = {
    "lunes": 0, "martes": 1, "miércoles": 2, "miercoles": 2,
    "jueves": 3, "viernes": 4, "sábado": 5, "sabado": 5, "domingo": 6,
}

_ONE_TASK_PER_DAY_PATTERNS = (
    "solo una tarea por dia", "una tarea por dia", "una actividad por dia",
    "solo una actividad por dia", "maximo una tarea", "una sola tarea por dia",
    "un evento por dia", "una por dia", "una tarea al dia", "una actividad al dia",
    "no mas de una tarea", "no más de una tarea", "limitar a una tarea",
)

# Keywords that clearly indicate moving/swapping days (not just mentioning them)
# Includes subjunctive/command forms (pases, muevas, traslades) commonly used in Spanish requests.
_DAY_MOVE_KEYWORDS = (
    "mueve", "mover", "pasa", "pasar", "traslada", "trasladar",
    "cambia el dia", "cambia los dias", "mueve las tareas", "mueve los eventos",
    "pasa las tareas", "pasa los eventos",
    "pases", "muevas", "traslades", "pasalo", "pásalo", "muevelo", "muévelo",
)

# Patterns that indicate the operation should be scoped to the current week only
_CURRENT_WEEK_SCOPE_PATTERNS = (
    "solo en la semana actual", "solo esta semana", "en la semana actual",
    "esta semana solo", "solo de esta semana", "de la semana actual",
    "solo la semana actual", "de esta semana", "en esta semana",
    "solo para esta semana", "esta semana nada mas", "esta semana nomás",
)


# ─── Calendar helpers (pure Python — no LLM needed) ───────────────────────────────────────

def _is_weekday_only_request(text: str) -> bool:
    lower = text.lower()
    return any(p in lower for p in _WEEKDAY_ONLY_PATTERNS)


def _has_current_week_scope(text: str) -> bool:
    lower = text.lower()
    return any(p in lower for p in _CURRENT_WEEK_SCOPE_PATTERNS)


def _is_extension_request(text: str) -> bool:
    lower = text.lower()
    return any(p in lower for p in _EXTENSION_PATTERNS)


def _is_reset_calendar_request(text: str) -> bool:
    lower = text.lower()
    return any(p in lower for p in _RESET_CALENDAR_PATTERNS)


def _is_one_task_per_day_request(text: str) -> bool:
    lower = text.lower()
    return any(p in lower for p in _ONE_TASK_PER_DAY_PATTERNS)


def _parse_day_swap_request(text: str) -> tuple:
    """Detect 'move tasks from weekday X to weekday Y' requests.

    Returns (from_weekday_idx, to_weekday_idx) or (None, None).
    Only triggers when a clear move keyword is present AND exactly 2 unique
    weekday names are found (first = source, second = destination).
    """
    lower = text.lower()
    if not any(kw in lower for kw in _DAY_MOVE_KEYWORDS):
        return None, None

    found = []
    seen_idx = set()
    # Scan left-to-right to preserve source→destination order
    for pos in range(len(lower)):
        for name, idx in _WEEKDAY_INDEX.items():
            if lower[pos:pos + len(name)] == name and idx not in seen_idx:
                found.append(idx)
                seen_idx.add(idx)
                break

    if len(found) == 2:
        return found[0], found[1]
    return None, None


def _distribute_one_per_day(events: list) -> list:
    """Ensure at most one pending event per calendar day.

    Completed events stay untouched. Pending events that land on an already-
    occupied day are shifted forward one day at a time until a free slot is found.
    """
    from datetime import timedelta

    completed = [dict(e) for e in events if e.get("completed")]
    pending   = sorted(
        [dict(e) for e in events if not e.get("completed")],
        key=lambda e: e.get("date", ""),
    )

    occupied = {e.get("date", "") for e in completed}
    result   = list(completed)

    for event in pending:
        try:
            d = _date.fromisoformat(event.get("date", ""))
            while d.isoformat() in occupied:
                d = d + timedelta(days=1)
            event["date"] = d.isoformat()
            occupied.add(d.isoformat())
        except (ValueError, TypeError):
            pass
        result.append(event)

    result.sort(key=lambda e: e.get("date", ""))
    return result


def _swap_days_in_calendar(
    events: list, from_wd: int, to_wd: int, week_filter: int | None = None
) -> tuple:
    """Move pending events that fall on from_wd to the equivalent to_wd date.

    If week_filter is given, only events of that week number are moved.
    """
    from datetime import timedelta

    diff   = to_wd - from_wd
    result = []
    moved  = 0
    for event in events:
        e = dict(event)
        if not e.get("completed"):
            if week_filter is not None and e.get("week") != week_filter:
                result.append(e)
                continue
            try:
                d = _date.fromisoformat(e.get("date", ""))
                if d.weekday() == from_wd:
                    e["date"] = (d + timedelta(days=diff)).isoformat()
                    moved += 1
            except (ValueError, TypeError):
                pass
        result.append(e)

    result.sort(key=lambda e: e.get("date", ""))
    return result, moved


def _parse_extension_params(question: str) -> tuple:
    """Use LLM to extract (week_number, extra_days). Returns (None, None) on failure."""
    try:
        response = llm_json.invoke([
            SystemMessage(content=(
                "Extrae los parametros de esta solicitud de extension de semana.\n"
                "Ejemplos:\n"
                "  'extiende la semana 2 por 7 dias' -> {\"week\": 2, \"extra_days\": 7}\n"
                "  'dame 2 semanas mas para la semana 1' -> {\"week\": 1, \"extra_days\": 14}\n"
                "  'amplia la semana 3 una semana mas' -> {\"week\": 3, \"extra_days\": 7}\n"
                "  'extiende todas las semanas 5 dias' -> {\"week\": 0, \"extra_days\": 5}\n"
                "  'extiende cada semana' -> {\"week\": 0, \"extra_days\": 7}\n"
                "Responde UNICAMENTE con JSON: {\"week\": <numero o 0 si son todas>, \"extra_days\": <numero de dias>}\n"
                "Si no puedes determinar los valores exactos, infiere valores razonables."
            )),
            HumanMessage(content=question),
        ])
        data = _parse_json(response.content)
        week = data.get("week")
        extra = data.get("extra_days")
        if week is not None and extra is not None:
            return int(week), int(extra)
        return None, None
    except Exception:
        return None, None


def _extend_week(events: list, week_num: int, extra_days: int) -> list:
    """
    Spread events of week_num over extra_days more days and shift subsequent weeks.
    If week_num == 0, adds extra_days between every consecutive pair of weeks.
    """
    from datetime import date as _date_cls, timedelta

    if week_num == 0:
        # Extend all weeks: shift each week by an accumulated offset
        all_weeks = sorted(set(e.get("week", 0) for e in events))
        result = []
        shift = 0
        for w in all_weeks:
            for event in events:
                if event.get("week") != w:
                    continue
                e = dict(event)
                try:
                    d = _date_cls.fromisoformat(e.get("date", ""))
                    e["date"] = (d + timedelta(days=shift)).isoformat()
                except (ValueError, TypeError):
                    pass
                result.append(e)
            shift += extra_days
        result.sort(key=lambda e: e.get("date", ""))
        return result

    # Single-week extension
    target = [e for e in events if e.get("week") == week_num]
    others = [e for e in events if e.get("week") != week_num]

    if not target:
        return events

    dated = []
    undated = []
    for e in target:
        try:
            d = _date_cls.fromisoformat(e.get("date", ""))
            dated.append((d, dict(e)))
        except (ValueError, TypeError):
            undated.append(dict(e))

    if not dated:
        return events

    dated.sort(key=lambda x: x[0])
    min_date = dated[0][0]
    max_date = dated[-1][0]
    original_span = max((max_date - min_date).days, 1)
    new_span = original_span + extra_days

    new_target = []
    n = len(dated)
    for i, (orig_date, event) in enumerate(dated):
        orig_offset = (orig_date - min_date).days
        new_offset = round(orig_offset * new_span / original_span)
        e = dict(event)
        e["date"] = (min_date + timedelta(days=new_offset)).isoformat()
        new_target.append(e)

    # Shift all subsequent weeks forward by extra_days
    shifted_others = []
    for event in others:
        e = dict(event)
        if e.get("week", 0) > week_num:
            try:
                d = _date_cls.fromisoformat(e.get("date", ""))
                e["date"] = (d + timedelta(days=extra_days)).isoformat()
            except (ValueError, TypeError):
                pass
        shifted_others.append(e)

    all_events = new_target + undated + shifted_others
    all_events.sort(key=lambda e: e.get("date", ""))
    return all_events


# Fields shown to the LLM so it can identify and reference events
_LLM_CALENDAR_KEYS = frozenset({"date", "title", "type", "time", "moduleNumber", "week", "completed", "_weekday"})


def _slim_calendar_for_llm(events: list) -> list:
    """Strip heavy optional fields before sending to LLM. Reduces prompt by ~60-70%."""
    return [{k: v for k, v in e.items() if k in _LLM_CALENDAR_KEYS} for e in events]


def _apply_calendar_patch(patch: dict, original_events: list) -> list:
    """Apply a surgical patch to the calendar.

    The LLM returns a diff (modifications / new_events / delete_events) instead of
    the full calendar. Python applies each change to the original list so untouched
    events are NEVER modified — this prevents the disordering / hallucination problem
    that occurs when the LLM has to return the entire calendar.

    Matching logic for modifications/deletes:
      - Non-'_weekday' keys are matched exactly (e.g. week, moduleNumber, type)
      - '_weekday' is resolved dynamically from the event's 'date' field
    """
    result = [dict(e) for e in original_events]

    for mod in patch.get("modifications", []):
        identify_by = mod.get("identify_by", {})
        changes     = mod.get("changes", {})
        if not identify_by or not changes:
            continue
        weekday_filter = identify_by.get("_weekday")
        other_filters  = {k: v for k, v in identify_by.items() if k != "_weekday"}
        for event in result:
            if other_filters and not all(event.get(k) == v for k, v in other_filters.items()):
                continue
            if weekday_filter:
                try:
                    d = _date.fromisoformat(event.get("date", ""))
                    if _WEEKDAY_NAMES[d.weekday()] != weekday_filter:
                        continue
                except (ValueError, TypeError):
                    continue
            event.update({k: v for k, v in changes.items() if k != "_weekday"})

    # Deletions: remove events matching all supplied fields
    for del_spec in patch.get("delete_events", []):
        weekday_filter = del_spec.get("_weekday")
        other_filters  = {k: v for k, v in del_spec.items() if k != "_weekday"}
        def _matches_delete(e: dict) -> bool:
            if other_filters and not all(e.get(k) == v for k, v in other_filters.items()):
                return False
            if weekday_filter:
                try:
                    d = _date.fromisoformat(e.get("date", ""))
                    return _WEEKDAY_NAMES[d.weekday()] == weekday_filter
                except (ValueError, TypeError):
                    return False
            return True
        result = [e for e in result if not _matches_delete(e)]

    # New events: append after stripping the helper annotation field
    for new_event in patch.get("new_events", []):
        new_event.pop("_weekday", None)
        result.append(dict(new_event))

    result.sort(key=lambda e: e.get("date", ""))
    return result


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


def _reschedule_weekends_to_weekdays(events: list) -> list:
    """Move weekend events to adjacent weekdays instead of deleting them.

    Saturday → previous Friday (stays in same week period)
    Sunday   → next Monday   (moves to start of next week)
    """
    from datetime import timedelta
    result = []
    for event in events:
        e = dict(event)
        try:
            d = _date.fromisoformat(e.get("date", ""))
            if d.weekday() == 5:       # Saturday → Friday
                e["date"] = (d - timedelta(days=1)).isoformat()
            elif d.weekday() == 6:     # Sunday → Monday
                e["date"] = (d + timedelta(days=1)).isoformat()
        except (ValueError, TypeError):
            pass
        result.append(e)
    result.sort(key=lambda e: e.get("date", ""))
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
    # If the frontend explicitly sent its in_quiz_mode flag, trust it — the client
    # knows whether the user is actively answering the quiz better than the backend
    # state does (the backend is in "await_quiz_answers" even before the user starts).
    if "in_quiz_mode" in state:
        return bool(state["in_quiz_mode"])
    # Fallback: infer from backend state fields.
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
                "- modify_calendar: quiere cambiar dias, horarios, fechas, horas, crear nuevas tareas/eventos, "
                "mover tareas a otro dia, cambiar la fecha de una tarea, agregar actividades al calendario, "
                "extender semanas o modificar la estructura del calendario\n"
                "- modify_roadmap: quiere cambiar modulos, contenidos, temas o materias del plan de estudio\n"
                "- none: es una pregunta informativa, no implica ningun cambio"
            )),
            HumanMessage(content=question),
        ])
        data = _parse_json(response.content)
        return data.get("intent", "none")
    except Exception:
        return "none"


# ─── Modification handlers ─────────────────────────────────────────────────────────────────

def _handle_reset_calendar(state: AgentState) -> AgentState:
    """Regenerate the calendar from the current roadmap using pure-Python date math.

    Reuses schedule_agent._build_calendar_events so the output is identical to
    what was generated during the diagnostic flow. Completed weeks are preserved.
    """
    from datetime import date as _date_cls
    from agents.schedule_agent import _build_calendar_events

    uid          = state.get("_chat_uid") or state.get("student_id") or ""
    student_name = state.get("student_name") or "Estudiante"
    roadmap      = state.get("learning_roadmap") or []
    completed_weeks = state.get("completed_weeks") or []

    if not roadmap:
        msg = AIMessage(content=(
            "No encontré un plan de estudio activo para restaurar el calendario. "
            "Completa el diagnóstico inicial primero."
        ))
        return {**state, "messages": [msg]}

    raw_start = state.get("roadmap_start_date")
    try:
        start_date = _date_cls.fromisoformat(raw_start) if raw_start else _date_cls.today()
    except (ValueError, TypeError):
        start_date = _date_cls.today()

    # Preserve existing events for completed weeks; regenerate everything else.
    existing_calendar = list(state.get("study_calendar") or [])
    events = _build_calendar_events(roadmap, start_date, completed_weeks, existing_calendar, {})
    calendar_dicts = [e.model_dump() for e in events]

    if uid:
        try:
            _write_calendar_to_firestore(uid, calendar_dicts)
        except Exception as exc:
            logger.error("Failed to write reset calendar to Firestore: %s", exc)

    msg = AIMessage(content=(
        f"Listo, {student_name}. Tu calendario ha sido restaurado al plan original generado "
        f"por tu coach ({len(calendar_dicts)} eventos). "
        "Puedes verlo en la sección de Calendario."
    ))
    return {
        **state,
        "messages":                [msg],
        "study_calendar":          calendar_dicts,
        "_chat_modified_calendar": True,
    }


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

    # ─ Handle weekday-only filter in Python (LLM unreliable for date arithmetic) ─
    if _is_weekday_only_request(question):
        modified_events = _reschedule_weekends_to_weekdays(current_calendar)
        moved = sum(
            1 for orig, new in zip(current_calendar, modified_events)
            if orig.get("date") != new.get("date")
        )
        if uid:
            try:
                _write_calendar_to_firestore(uid, modified_events)
            except Exception as exc:
                logger.error("Failed to write modified calendar to Firestore: %s", exc)
        msg = AIMessage(content=(
            f"Listo, {student_name}. Las actividades de fin de semana han sido reagendadas "
            f"a dias habiles ({moved} eventos movidos: sabado → viernes, domingo → lunes). "
            f"Tu calendario mantiene todos los {len(modified_events)} eventos, ahora solo en dias de lunes a viernes.\n\n"
            "Los cambios ya estan reflejados en tu seccion de Calendario."
        ))
        return {
            **state,
            "messages":                [msg],
            "study_calendar":          modified_events,
            "_chat_modified_calendar": True,
        }

    # ─ One task per day redistribution ──────────────────────────────────────────
    if _is_one_task_per_day_request(question):
        modified_events = _distribute_one_per_day(current_calendar)
        days_with_overflow = sum(
            1 for e_orig, e_new in zip(current_calendar, modified_events)
            if e_orig.get("date") != e_new.get("date")
        )
        if uid:
            try:
                _write_calendar_to_firestore(uid, modified_events)
            except Exception as exc:
                logger.error("Failed to write one-per-day calendar to Firestore: %s", exc)
        if days_with_overflow == 0:
            detail = "Tu calendario ya tenia como maximo una tarea por dia, no fue necesario mover nada."
        else:
            detail = (
                f"{days_with_overflow} tareas fueron redistribuidas a dias siguientes "
                "para que cada dia tenga como maximo una actividad."
            )
        msg = AIMessage(content=(
            f"Listo, {student_name}. {detail}\n\n"
            "Los cambios ya estan reflejados en tu seccion de Calendario."
        ))
        return {
            **state,
            "messages":                [msg],
            "study_calendar":          modified_events,
            "_chat_modified_calendar": True,
        }

    # ─ Day-to-day swap in Python (LLM gets date arithmetic wrong) ──────────────
    from_wd, to_wd = _parse_day_swap_request(question)
    if from_wd is not None and to_wd is not None:
        week_filter = state.get("current_week") if _has_current_week_scope(question) else None
        modified_events, moved_count = _swap_days_in_calendar(
            current_calendar, from_wd, to_wd, week_filter=week_filter
        )
        if uid:
            try:
                _write_calendar_to_firestore(uid, modified_events)
            except Exception as exc:
                logger.error("Failed to write day-swapped calendar to Firestore: %s", exc)
        from_name = _WEEKDAY_NAMES[from_wd]
        to_name   = _WEEKDAY_NAMES[to_wd]
        scope_text = f" de la semana {week_filter}" if week_filter is not None else ""
        if moved_count == 0:
            msg = AIMessage(content=(
                f"{student_name}, no encontre tareas pendientes del {from_name}{scope_text} para mover. "
                "Es posible que ya esten completadas o que ese dia no tenga tareas."
            ))
            return {**state, "messages": [msg]}
        msg = AIMessage(content=(
            f"Listo, {student_name}. {moved_count} tarea(s) del {from_name}{scope_text} "
            f"fueron movidas al {to_name}.\n\n"
            "Los cambios ya estan reflejados en tu seccion de Calendario."
        ))
        return {
            **state,
            "messages":                [msg],
            "study_calendar":          modified_events,
            "_chat_modified_calendar": True,
        }

    # ─ Extend week duration in Python (reliable date arithmetic) ─
    if _is_extension_request(question):
        week_num, extra_days = _parse_extension_params(question)
        if week_num is not None and extra_days is not None and extra_days > 0:
            modified_events = _extend_week(current_calendar, week_num, extra_days)
            if uid:
                try:
                    _write_calendar_to_firestore(uid, modified_events)
                except Exception as exc:
                    logger.error("Failed to write extended calendar to Firestore: %s", exc)
            if week_num == 0:
                detail = f"Todas las semanas han sido extendidas {extra_days} dias adicionales entre cada una."
            else:
                detail = f"La semana {week_num} ha sido extendida {extra_days} dias y las semanas siguientes se han desplazado."
            msg = AIMessage(content=(
                f"Listo, {student_name}. {detail}\n\n"
                "Los cambios ya estan reflejados en tu seccion de Calendario."
            ))
            return {
                **state,
                "messages":                [msg],
                "study_calendar":          modified_events,
                "_chat_modified_calendar": True,
            }

    # ─ Other modifications via LLM (patch / diff approach) ─
    # The LLM returns ONLY what changes (a patch), not the full calendar.
    # Python applies the patch surgically so untouched events are never altered.
    try:
        annotated_calendar = _annotate_weekdays(current_calendar)
        slim_calendar      = _slim_calendar_for_llm(annotated_calendar)

        # Context for the LLM: week metadata and recent chat history.
        # Recent history lets the LLM resolve references like "esa tarea" from
        # something the coach described in the previous turn.
        current_week_n = state.get("current_week") or 1
        max_module_n   = max((e.get("moduleNumber", 0) for e in current_calendar), default=0)
        next_module_n  = max_module_n + 1

        all_msgs  = list(state.get("messages", []))
        ctx_lines = []
        for m in all_msgs[:-1][-6:]:          # last 3 pairs, excluding current question
            if isinstance(m, HumanMessage):
                ctx_lines.append(f"Estudiante: {m.content[:400]}")
            elif isinstance(m, AIMessage):
                ctx_lines.append(f"Coach: {m.content[:400]}")
        recent_ctx = "\n".join(ctx_lines)

        human_content = f"Solicitud: {question}\n\n"
        if recent_ctx:
            human_content += f"Contexto reciente de la conversacion:\n{recent_ctx}\n\n"
        human_content += (
            f"Calendario de referencia ({len(slim_calendar)} eventos):\n"
            f"{json.dumps(slim_calendar, ensure_ascii=False)}\n\n"
            "Devuelve SOLO el parche con los cambios necesarios."
        )

        response = llm_json.invoke([
            SystemMessage(content=(
                "Eres un asistente que modifica calendarios de estudio de forma QUIRURGICA.\n"
                "Devuelve UNICAMENTE un parche JSON con los cambios MINIMOS necesarios. "
                "NUNCA devuelvas el calendario completo. NO modifiques eventos que no se mencionan.\n\n"
                "Formato de respuesta:\n"
                '{"modifications": [{"identify_by": {campos que identifican el evento de forma UNICA}, '
                '"changes": {SOLO los campos que el usuario pidio cambiar}}], '
                '"new_events": [...nuevos eventos si el usuario pide crearlos...], '
                '"delete_events": [...solo si el usuario pide EXPLICITAMENTE eliminar eventos...]}\n\n'
                "REGLAS CRITICAS:\n"
                "1. identify_by debe ser lo mas especifico posible: usa title + week + moduleNumber + type\n"
                "2. changes debe contener SOLO el campo que el usuario pide modificar:\n"
                "   - Si pide cambiar HORA: solo {\"time\": \"HH:MM\"} — NO incluyas date ni otros campos\n"
                "   - Si pide mover a otro DIA: solo {\"date\": \"YYYY-MM-DD\"} — NO incluyas time ni otros campos\n"
                "3. NUNCA uses delete_events para reorganizar dias — usa modifications con la nueva fecha\n"
                "4. Si el usuario menciona UNA actividad especifica, afecta SOLO esa actividad\n"
                "5. NO modifiques eventos que el usuario no menciono\n"
                "6. Si ninguna operacion aplica, devuelve {}\n"
                "7. Para referencias como 'esa tarea', busca el detalle en el contexto reciente\n\n"
                "Para new_events incluye TODOS estos campos obligatorios:\n"
                '  {"date": "YYYY-MM-DD", "time": "HH:MM", "title": "titulo", '
                '"type": "study|review|deadline", '
                f'"week": <semana actual={current_week_n}>, '
                f'"moduleNumber": <siguiente libre={next_module_n}>, "completed": false' + '}\n\n'
                "Ejemplos:\n"
                "Crear tarea nueva: "
                '{"new_events": [{"date": "2025-05-25", "time": "10:00", "title": "Analizar roadmap", '
                f'"type": "study", "week": {current_week_n}, "moduleNumber": {next_module_n}, "completed": false' + '}]}\n'
                "Cambiar hora de tarea especifica: "
                '{"modifications": [{"identify_by": {"week": 1, "moduleNumber": 1, "type": "study"}, "changes": {"time": "09:00"}}]}\n'
                "Cambiar hora de todos los lunes (cuando se menciona explicitamente): "
                '{"modifications": [{"identify_by": {"_weekday": "lunes"}, "changes": {"time": "09:00"}}]}\n'
                "Mover tarea a otro dia (NO eliminar): "
                '{"modifications": [{"identify_by": {"week": 2, "moduleNumber": 1, "type": "study"}, "changes": {"date": "2024-01-20"}}]}\n'
                "Eliminar semana solo si el usuario lo pide explicitamente: "
                '{"delete_events": [{"week": 3}]}'
            )),
            HumanMessage(content=human_content),
        ])

        data  = _parse_json(response.content)
        patch = {
            "modifications":  data.get("modifications",  []),
            "new_events":     data.get("new_events",     []),
            "delete_events":  data.get("delete_events",  []),
        }

        # Guardia: si el parche tocaría más del 60% del calendario,
        # probablemente el LLM malinterpretó la solicitud — no aplicar.
        total     = len(current_calendar)
        affected  = len(patch["modifications"]) + len(patch["delete_events"])
        if total > 0 and affected / total > 0.6:
            logger.warning(
                "LLM patch rejected: would affect %d/%d events (>60%%). question=%r",
                affected, total, question,
            )
            msg = AIMessage(content=(
                f"Lo siento, {student_name}. No pude aplicar ese cambio con seguridad porque "
                "parecia afectar demasiados eventos del calendario. "
                "Por favor, describe el cambio de forma mas especifica, por ejemplo: "
                "'mueve las tareas del lunes al martes de la semana 2' o "
                "'cambia la hora del estudio del modulo 1 a las 9:00'."
            ))
            return {**state, "messages": [msg]}

        # Check if the patch is empty (LLM returned {} or lists are all empty)
        patch_is_empty = (
            not patch["modifications"]
            and not patch["new_events"]
            and not patch["delete_events"]
        )
        if patch_is_empty:
            msg = AIMessage(content=(
                f"Lo siento, {student_name}. No pude identificar con claridad que cambio hacer. "
                "Por favor describe el cambio de forma mas especifica, por ejemplo: "
                "'mueve las tareas del lunes de la semana 2 al martes' o "
                "'cambia la hora del modulo 1 a las 9:00'."
            ))
            return {**state, "messages": [msg]}

        modified_events = _apply_calendar_patch(patch, current_calendar)

        # Check if any event actually changed (patch identified wrong events)
        def _events_equal(a: list, b: list) -> bool:
            if len(a) != len(b):
                return False
            for ea, eb in zip(
                sorted(a, key=lambda e: (e.get("date", ""), e.get("moduleNumber", 0))),
                sorted(b, key=lambda e: (e.get("date", ""), e.get("moduleNumber", 0))),
            ):
                if ea.get("date") != eb.get("date") or ea.get("time") != eb.get("time"):
                    return False
            return True

        if _events_equal(current_calendar, modified_events):
            msg = AIMessage(content=(
                f"Lo siento, {student_name}. Entendi tu solicitud pero no encontre "
                "eventos que coincidan con los criterios indicados. "
                "Intenta ser mas especifico, por ejemplo indicando la semana o el modulo."
            ))
            return {**state, "messages": [msg]}

        if uid:
            try:
                _write_calendar_to_firestore(uid, modified_events)
            except Exception as exc:
                logger.error("Failed to write modified calendar to Firestore: %s", exc)

        msg = AIMessage(content=(
            f"Listo, {student_name}. Tu calendario ha sido actualizado con los cambios solicitados. "
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
    # Python-handled patterns are checked first — they are precise and don't need
    # the LLM keyword filter or the LLM classifier, so they run unconditionally.
    if _is_reset_calendar_request(question):
        return _handle_reset_calendar(state)
    if _is_weekday_only_request(question):
        return _handle_calendar_modification(state, question)
    if _is_one_task_per_day_request(question):
        return _handle_calendar_modification(state, question)
    _from_wd, _to_wd = _parse_day_swap_request(question)
    if _from_wd is not None:
        return _handle_calendar_modification(state, question)

    # For everything else, use the keyword pre-filter + LLM classifier.
    if _might_be_modification(question):
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
