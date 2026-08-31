"""
schedule_agent.py
Nodo LangGraph que transforma el learning_roadmap en un Study_Calendar
con fechas ISO 8601, recomendaciones diarias de estudio y lo persiste en Firestore.

Distribución: 7 días por semana, ~120 min por día.
- Lunes:     Módulo 1 — estudio principal
- Martes:    Módulo 1 — repaso/práctica
- Miércoles: Módulo 2 — estudio principal
- Jueves:    Módulo 2 — repaso/práctica
- Viernes:   Módulo 3 — estudio principal
- Sábado:    Módulo 3 — repaso/práctica
- Domingo:   Quiz de revisión semanal
"""

import json
import logging
import os
import re
from datetime import date, timedelta
from typing import Dict, List, Literal, Optional

from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
from pydantic import BaseModel, ValidationError, field_validator
from tenacity import retry, stop_after_attempt, wait_fixed

from agents.llm_factory import build_llm
from schemas.state import AgentState

logger = logging.getLogger(__name__)

# ─── LLM ──────────────────────────────────────────────────────────────────────
_llm, _llm_json = build_llm()

# ─── Constantes ───────────────────────────────────────────────────────────────

# Distribución de 7 días por semana, relativos al día de inicio (start_date)
# Módulo 1: día 0 (estudio), día 1 (repaso)
# Módulo 2: día 2 (estudio), día 3 (repaso)
# Módulo 3: día 4 (estudio), día 5 (repaso)
# Quiz:     día 6
QUIZ_DAY_OFFSET = 6
STUDY_TIME  = "09:00"
REVIEW_TIME = "10:00"
QUIZ_TIME   = "10:00"

TARGET_DURATION_MINUTES = 120   # ~2 horas por sesión


# ─── Modelos Pydantic ─────────────────────────────────────────────────────────

class DailyRecommendation(BaseModel):
    """Recomendación de estudio para un día específico."""
    description: str
    duration_minutes: int
    resource_url: str
    resource_label: str
    tips: List[str]
    review_description: str   # descripción para el día de repaso del mismo módulo
    review_tips: List[str]    # consejos para el día de repaso


class CalendarEventModel(BaseModel):
    date: str
    title: str
    type: Literal["study", "review", "deadline"]
    time: str
    moduleNumber: int
    week: int
    completed: bool = False
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    resource_url: Optional[str] = None
    resource_label: Optional[str] = None
    tips: Optional[List[str]] = None
    objective: Optional[str] = None
    difficulty: Optional[str] = None
    category: Optional[str] = None

    @field_validator("date")
    @classmethod
    def validate_date_format(cls, v: str) -> str:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError(f"date must be YYYY-MM-DD, got: {v}")
        return v

    @field_validator("time")
    @classmethod
    def validate_time_format(cls, v: str) -> str:
        if not re.match(r"^\d{2}:\d{2}$", v):
            raise ValueError(f"time must be HH:MM, got: {v}")
        return v


# ─── Funciones puras ──────────────────────────────────────────────────────────

def _nearest_monday(d: date) -> date:
    """Retorna el lunes más próximo anterior o igual a `d`."""
    return d - timedelta(days=d.weekday())


def _get_week_start(start_date: date, week_number: int) -> date:
    """
    Retorna la fecha de inicio de la semana `week_number` (1-indexed).
    - Semana 1: empieza en start_date (el día del diagnóstico)
    - Semana 2+: empieza 7*(week_number-1) días después de start_date
    """
    return start_date + timedelta(weeks=week_number - 1)


def _parse_json(text: str) -> dict:
    """Extrae y parsea el primer bloque JSON de un texto."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError(f"No JSON found in LLM response:\n{text}")
        return json.loads(text[start:end])


def _generate_daily_recommendations(
    roadmap: List[Dict],
    student_name: str,
    weak_skills: List[str],
    user_preferences: str,
) -> Dict[str, DailyRecommendation]:
    """
    Llama al LLM para generar recomendaciones diarias por módulo.
    Incluye descripción para el día de estudio principal Y para el día de repaso.
    Retorna dict con clave "{week}_{module_number}" → DailyRecommendation.
    """
    roadmap_summary = []
    for week_data in roadmap:
        week_num = week_data.get("week", 0)
        for mod in week_data.get("modules", []):
            roadmap_summary.append({
                "week": week_num,
                "module_number": mod.get("module_number"),
                "name": mod.get("name"),
                "objective": mod.get("objective"),
                "resource": mod.get("resource", ""),
                "difficulty": mod.get("difficulty", "básico"),
                "category": mod.get("category", ""),
            })

    response = _llm_json.invoke([
        SystemMessage(content=f"""Eres un coach de aprendizaje experto en tecnología.
Tu tarea es generar recomendaciones de estudio para cada módulo del plan de un estudiante.
Cada módulo tiene DOS sesiones: una de estudio principal (~{TARGET_DURATION_MINUTES} min) y una de repaso al día siguiente (~{TARGET_DURATION_MINUTES} min).

Para cada módulo proporciona:
- description: qué estudiar el día principal y por qué es importante
- duration_minutes: duración del día principal (entre 100 y 130 minutos, objetivo {TARGET_DURATION_MINUTES})
- resource_url: URL real del recurso principal (MDN, freeCodeCamp, docs oficiales, etc.)
- resource_label: nombre legible del recurso
- tips: 2-3 consejos para el día de estudio principal
- review_description: qué hacer el día de repaso (práctica, ejercicios, mini-proyecto)
- review_tips: 2-3 consejos para el día de repaso

Responde ÚNICAMENTE con JSON válido:
{{
  "recommendations": [
    {{
      "week": 1,
      "module_number": 1,
      "description": "...",
      "duration_minutes": {TARGET_DURATION_MINUTES},
      "resource_url": "https://...",
      "resource_label": "...",
      "tips": ["...", "...", "..."],
      "review_description": "...",
      "review_tips": ["...", "...", "..."]
    }}
  ]
}}"""),
        HumanMessage(content=f"""Estudiante: {student_name}
Habilidades débiles a reforzar: {', '.join(weak_skills) if weak_skills else 'ninguna específica'}
Intereses: {user_preferences}

Módulos del plan:
{json.dumps(roadmap_summary, ensure_ascii=False, indent=2)}

Genera recomendaciones para cada módulo."""),
    ])

    data = _parse_json(response.content)
    recommendations: Dict[str, DailyRecommendation] = {}

    for rec in data.get("recommendations", []):
        key = f"{rec.get('week')}_{rec.get('module_number')}"
        try:
            recommendations[key] = DailyRecommendation(
                description=rec.get("description", ""),
                duration_minutes=int(rec.get("duration_minutes", TARGET_DURATION_MINUTES)),
                resource_url=rec.get("resource_url", ""),
                resource_label=rec.get("resource_label", "Recurso"),
                tips=rec.get("tips", []),
                review_description=rec.get("review_description", "Repasa y practica lo aprendido ayer."),
                review_tips=rec.get("review_tips", ["Haz ejercicios prácticos", "Repasa tus apuntes"]),
            )
        except (ValidationError, TypeError, ValueError) as exc:
            logger.warning("Recomendación inválida para clave %s: %s", key, exc)

    return recommendations


def _build_calendar_events(
    roadmap: List[Dict],
    start_date: date,
    completed_weeks: List[int],
    existing_events: List[Dict],
    recommendations: Dict[str, DailyRecommendation],
) -> List[CalendarEventModel]:
    """
    Genera 7 eventos por semana (lun–dom), ~120 min cada uno.

    Lunes:     Módulo 1 — estudio principal
    Martes:    Módulo 1 — repaso/práctica
    Miércoles: Módulo 2 — estudio principal
    Jueves:    Módulo 2 — repaso/práctica
    Viernes:   Módulo 3 — estudio principal
    Sábado:    Módulo 3 — repaso/práctica
    Domingo:   Quiz de revisión semanal
    """
    existing_by_week: Dict[int, List[Dict]] = {}
    for ev in existing_events:
        w = ev.get("week")
        if w is not None:
            existing_by_week.setdefault(w, []).append(ev)

    events: List[CalendarEventModel] = []

    for week_data in roadmap:
        week_num: int = week_data.get("week", 0)
        modules: List[Dict] = week_data.get("modules", [])
        week_focus: str = week_data.get("focus", "")

        # Preservar semanas completadas
        if week_num in completed_weeks:
            for ev in existing_by_week.get(week_num, []):
                try:
                    events.append(CalendarEventModel(**ev))
                except (ValidationError, TypeError) as exc:
                    logger.error("Evento existente inválido en semana %d: %s", week_num, exc)
            continue

        week_start = _get_week_start(start_date, week_num)

        # Generar eventos para cada módulo (hasta 3)
        # Los offsets son relativos al día de inicio de la semana (start_date para semana 1)
        # Módulo 1: día 0 (estudio) y día 1 (repaso)
        # Módulo 2: día 2 (estudio) y día 3 (repaso)
        # Módulo 3: día 4 (estudio) y día 5 (repaso)
        # Quiz:     día 6
        for idx, module in enumerate(modules[:3]):
            module_number = module.get("module_number", idx + 1)
            rec_key = f"{week_num}_{module_number}"
            rec = recommendations.get(rec_key)

            study_offset  = idx * 2        # 0, 2, 4
            review_offset = idx * 2 + 1   # 1, 3, 5

            study_date  = week_start + timedelta(days=study_offset)
            review_date = week_start + timedelta(days=review_offset)

            # Día de estudio principal
            try:
                events.append(CalendarEventModel(
                    date=study_date.isoformat(),
                    title=module.get("name", f"Módulo {module_number}"),
                    type="study",
                    time=STUDY_TIME,
                    moduleNumber=module_number,
                    week=week_num,
                    completed=False,
                    description=rec.description if rec else module.get("objective", "Estudia este módulo según el plan."),
                    duration_minutes=rec.duration_minutes if rec else TARGET_DURATION_MINUTES,
                    resource_url=rec.resource_url if rec else "",
                    resource_label=rec.resource_label if rec else module.get("resource", ""),
                    tips=rec.tips if rec else ["Lee la documentación oficial", "Toma notas mientras estudias"],
                    objective=module.get("objective", ""),
                    difficulty=module.get("difficulty", "básico"),
                    category=module.get("category", ""),
                ))
            except (ValidationError, TypeError) as exc:
                logger.error("Error al crear evento de estudio semana %d módulo %d: %s",
                             week_num, module_number, exc)

            # Día de repaso/práctica
            try:
                events.append(CalendarEventModel(
                    date=review_date.isoformat(),
                    title=f"Repaso: {module.get('name', f'Módulo {module_number}')}",
                    type="review",
                    time=REVIEW_TIME,
                    moduleNumber=module_number,
                    week=week_num,
                    completed=False,
                    description=rec.review_description if rec else f"Repasa y practica lo aprendido sobre {module.get('name', 'este módulo')}.",
                    duration_minutes=TARGET_DURATION_MINUTES,
                    resource_url=rec.resource_url if rec else "",
                    resource_label=rec.resource_label if rec else module.get("resource", ""),
                    tips=rec.review_tips if rec else ["Haz ejercicios prácticos", "Repasa tus apuntes del día anterior"],
                    objective=module.get("objective", ""),
                    difficulty=module.get("difficulty", "básico"),
                    category=module.get("category", ""),
                ))
            except (ValidationError, TypeError) as exc:
                logger.error("Error al crear evento de repaso semana %d módulo %d: %s",
                             week_num, module_number, exc)

        # Día 6 relativo al inicio de semana: quiz de revisión
        quiz_day = week_start + timedelta(days=QUIZ_DAY_OFFSET)
        try:
            events.append(CalendarEventModel(
                date=quiz_day.isoformat(),
                title=f"Quiz Semana {week_num}",
                type="review",
                time=QUIZ_TIME,
                moduleNumber=0,
                week=week_num,
                completed=False,
                description=f"Revisión y quiz de la semana {week_num}: {week_focus}. Pon a prueba todo lo que aprendiste.",
                duration_minutes=60,
                tips=[
                    "Repasa los apuntes de los 3 módulos antes de empezar",
                    "Intenta el quiz sin consultar recursos",
                    "Anota las dudas para preguntarle al coach",
                ],
            ))
        except (ValidationError, TypeError) as exc:
            logger.error("Error al crear evento de quiz semana %d: %s", week_num, exc)

    return events


# ─── Escritura en Firestore ───────────────────────────────────────────────────

def _get_firestore_client():
    """Retorna el cliente de Firestore de Firebase Admin SDK."""
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as admin_firestore

        if not firebase_admin._apps:
            service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
            if service_account_path and os.path.exists(service_account_path):
                cred = credentials.Certificate(service_account_path)
            else:
                cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)

        return admin_firestore.client()
    except Exception as exc:
        logger.error("No se pudo inicializar Firebase Admin SDK: %s", exc)
        raise


@retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
def _write_calendar_to_firestore(uid: str, events: List[CalendarEventModel]) -> None:
    """
    Sobreescribe el calendario completo en Firestore bajo
    `usuarios/{uid}/study_calendar`. Elimina los documentos existentes
    antes de escribir los nuevos para evitar duplicados.
    """
    db = _get_firestore_client()
    calendar_ref = db.collection("usuarios").document(uid).collection("study_calendar")

    # Eliminar documentos existentes
    delete_batch = db.batch()
    for doc in calendar_ref.stream():
        delete_batch.delete(doc.reference)
    delete_batch.commit()

    # Escribir nuevos eventos en lotes de 500 (límite de Firestore)
    BATCH_SIZE = 500
    for i in range(0, len(events), BATCH_SIZE):
        batch = db.batch()
        for event in events[i:i + BATCH_SIZE]:
            doc_ref = calendar_ref.document()
            batch.set(doc_ref, event.model_dump())
        batch.commit()

    logger.info("Study_Calendar escrito en Firestore para uid=%s (%d eventos)", uid, len(events))


# ─── Nodo LangGraph ───────────────────────────────────────────────────────────

def generate_schedule(state: AgentState) -> AgentState:
    """
    Nodo LangGraph. Genera el Study_Calendar con 7 eventos por semana (~120 min/día)
    y lo persiste en Firestore.
    """
    roadmap: List[Dict] = state.get("learning_roadmap") or []
    student_id: Optional[str] = state.get("student_id")
    student_name: str = state.get("student_name") or "Estudiante"
    weak_skills: List[str] = state.get("weak_skills") or []
    user_preferences: str = state.get("user_preferences") or "programación en general"
    completed_weeks: List[int] = state.get("completed_weeks") or []
    existing_calendar: List[Dict] = state.get("study_calendar") or []

    if not roadmap:
        logger.warning("generate_schedule: learning_roadmap vacío, omitiendo generación.")
        return {**state}

    if not student_id:
        logger.error("generate_schedule: student_id ausente, omitiendo escritura en Firestore.")
        return {**state}

    # Fecha de inicio: el día en que el usuario hace el diagnóstico (hoy)
    # Si ya existe roadmap_start_date en el estado, respetarlo (no mover el calendario)
    raw_start = state.get("roadmap_start_date")
    if raw_start:
        try:
            start_date = date.fromisoformat(raw_start)
        except ValueError:
            logger.warning("roadmap_start_date inválido (%s), usando hoy.", raw_start)
            start_date = date.today()
    else:
        # Primera vez: empezar desde hoy mismo
        start_date = date.today()

    # Generar recomendaciones con LLM solo para semanas pendientes.
    # Controlado por SCHEDULE_USE_LLM=true en .env — por defecto desactivado
    # para evitar timeouts en hardware lento (el fallback usa los datos del roadmap).
    pending_weeks = [w for w in roadmap if w.get("week", 0) not in completed_weeks]
    recommendations: Dict[str, DailyRecommendation] = {}
    use_llm = os.getenv("SCHEDULE_USE_LLM", "false").lower() == "true"
    if pending_weeks and use_llm:
        try:
            recommendations = _generate_daily_recommendations(
                pending_weeks, student_name, weak_skills, user_preferences
            )
            logger.info("Recomendaciones generadas: %d módulos", len(recommendations))
        except Exception as exc:
            logger.warning(
                "No se pudieron generar recomendaciones con LLM: %s. "
                "Se usarán los datos del roadmap como fallback.", exc
            )
    elif pending_weeks:
        logger.info("SCHEDULE_USE_LLM no activo — usando datos del roadmap como fallback.")

    # Construir eventos (7 por semana)
    events = _build_calendar_events(
        roadmap, start_date, completed_weeks, existing_calendar, recommendations
    )

    # Persistir en Firestore (sobreescribir)
    try:
        _write_calendar_to_firestore(student_id, events)
    except Exception as exc:
        logger.error("generate_schedule: fallo al escribir en Firestore: %s", exc)

    calendar_dicts = [e.model_dump() for e in events]

    msg = AIMessage(content=(
        f"Tu calendario de estudio ha sido generado con {len(events)} sesiones "
        f"distribuidas en {len(roadmap)} semanas (7 días por semana, ~2 horas por día). "
        "Cada día tiene una sesión recomendada: estudio principal, repaso práctico o quiz semanal. "
        "Puedes verlo en la sección Calendario de la app."
    ))

    return {
        **state,
        "messages":           [msg],
        "study_calendar":     calendar_dicts,
        "roadmap_start_date": start_date.isoformat(),
        "current_step":       "generate_schedule",
        "next_step":          "quiz",
    }
