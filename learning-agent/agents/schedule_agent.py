"""
schedule_agent.py
Nodo LangGraph que transforma el learning_roadmap en un Study_Calendar
con fechas ISO 8601, recomendaciones diarias de estudio y lo persiste en Firestore.
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

# Distribución fija de días por módulo dentro de la semana
# Módulo 1 → lunes (+0), Módulo 2 → miércoles (+2), Módulo 3 → viernes (+4)
MODULE_DAY_OFFSETS = {1: 0, 2: 2, 3: 4}
REVIEW_DAY_OFFSET = 5   # sábado
STUDY_TIME = "09:00"
REVIEW_TIME = "10:00"


# ─── Modelos Pydantic ─────────────────────────────────────────────────────────

class DailyRecommendation(BaseModel):
    """Recomendación de estudio para un día específico."""
    description: str          # Qué estudiar y por qué
    duration_minutes: int     # Duración estimada en minutos
    resource_url: str         # URL del recurso principal
    resource_label: str       # Etiqueta legible del recurso
    tips: List[str]           # 2-3 consejos concretos para esa sesión


class CalendarEventModel(BaseModel):
    date: str
    title: str
    type: Literal["study", "review", "deadline"]
    time: str
    moduleNumber: int
    week: int
    completed: bool = False
    # Campos enriquecidos de recomendación (opcionales para eventos de review)
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
    Retorna el lunes de la semana `week_number` (1-indexed)
    a partir de `start_date` (que debe ser un lunes).
    """
    return start_date + timedelta(weeks=week_number - 1)


def _assign_study_days(week_start: date) -> List[date]:
    """
    Retorna las fechas de lunes, miércoles y viernes de la semana dada.
    """
    return [
        week_start + timedelta(days=MODULE_DAY_OFFSETS[1]),
        week_start + timedelta(days=MODULE_DAY_OFFSETS[2]),
        week_start + timedelta(days=MODULE_DAY_OFFSETS[3]),
    ]


def _get_saturday(week_start: date) -> date:
    """Retorna el sábado de la semana dada."""
    return week_start + timedelta(days=REVIEW_DAY_OFFSET)


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
    Llama al LLM para generar recomendaciones diarias detalladas por módulo.
    Retorna un dict con clave "{week}_{module_number}" → DailyRecommendation.
    """
    # Construir resumen del roadmap para el prompt
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
        SystemMessage(content="""Eres un coach de aprendizaje experto en tecnología.
Tu tarea es generar recomendaciones de estudio detalladas para cada módulo del plan de un estudiante.

Para cada módulo debes proporcionar:
- Una descripción clara de qué estudiar ese día y por qué es importante
- La duración estimada en minutos (entre 60 y 180)
- La URL del recurso principal (usa el recurso del módulo si tiene URL, si no genera una URL real de un recurso conocido como MDN, freeCodeCamp, docs oficiales, etc.)
- Una etiqueta legible para el recurso (ej: "MDN Web Docs", "freeCodeCamp", "Documentación oficial de React")
- 2 o 3 consejos concretos y accionables para esa sesión de estudio

Responde ÚNICAMENTE con JSON válido:
{
  "recommendations": [
    {
      "week": 1,
      "module_number": 1,
      "description": "descripción de qué estudiar y por qué",
      "duration_minutes": 90,
      "resource_url": "https://...",
      "resource_label": "nombre del recurso",
      "tips": ["consejo 1", "consejo 2", "consejo 3"]
    }
  ]
}"""),
        HumanMessage(content=f"""Estudiante: {student_name}
Habilidades débiles a reforzar: {', '.join(weak_skills) if weak_skills else 'ninguna específica'}
Intereses: {user_preferences}

Módulos del plan:
{json.dumps(roadmap_summary, ensure_ascii=False, indent=2)}

Genera recomendaciones detalladas para cada módulo."""),
    ])

    data = _parse_json(response.content)
    recommendations: Dict[str, DailyRecommendation] = {}

    for rec in data.get("recommendations", []):
        key = f"{rec.get('week')}_{rec.get('module_number')}"
        try:
            recommendations[key] = DailyRecommendation(
                description=rec.get("description", ""),
                duration_minutes=int(rec.get("duration_minutes", 90)),
                resource_url=rec.get("resource_url", ""),
                resource_label=rec.get("resource_label", "Recurso"),
                tips=rec.get("tips", []),
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
    Función pura. Transforma el roadmap en una lista plana de CalendarEventModel
    enriquecidos con recomendaciones diarias.

    - Para semanas en `completed_weeks`, preserva los eventos de `existing_events`.
    - Para las demás semanas, genera nuevos eventos con fechas y recomendaciones.
    - Asigna moduleNumber=0 y type="review" al evento del sábado.
    """
    # Indexar eventos existentes por semana para preservación rápida
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
        study_days = _assign_study_days(week_start)

        # Generar eventos de estudio (3 módulos → lun, mié, vie)
        for idx, module in enumerate(modules[:3]):
            module_number = module.get("module_number", idx + 1)
            event_date = study_days[idx]
            rec_key = f"{week_num}_{module_number}"
            rec = recommendations.get(rec_key)

            try:
                events.append(CalendarEventModel(
                    date=event_date.isoformat(),
                    title=module.get("name", f"Módulo {module_number}"),
                    type="study",
                    time=STUDY_TIME,
                    moduleNumber=module_number,
                    week=week_num,
                    completed=False,
                    # Campos enriquecidos
                    description=rec.description if rec else module.get("objective", ""),
                    duration_minutes=rec.duration_minutes if rec else 90,
                    resource_url=rec.resource_url if rec else "",
                    resource_label=rec.resource_label if rec else module.get("resource", ""),
                    tips=rec.tips if rec else [],
                    objective=module.get("objective", ""),
                    difficulty=module.get("difficulty", "básico"),
                    category=module.get("category", ""),
                ))
            except (ValidationError, TypeError) as exc:
                logger.error("Error al crear evento de estudio semana %d módulo %d: %s",
                             week_num, module_number, exc)

        # Generar evento de revisión (quiz) el sábado
        saturday = _get_saturday(week_start)
        try:
            events.append(CalendarEventModel(
                date=saturday.isoformat(),
                title=f"Quiz Semana {week_num}",
                type="review",
                time=REVIEW_TIME,
                moduleNumber=0,
                week=week_num,
                completed=False,
                description=f"Revisión y quiz de la semana {week_num}: {week_focus}",
                duration_minutes=45,
                tips=["Repasa los apuntes de los 3 módulos", "Intenta el quiz sin consultar recursos", "Anota las dudas para el coach"],
            ))
        except (ValidationError, TypeError) as exc:
            logger.error("Error al crear evento de revisión semana %d: %s", week_num, exc)

    return events


# ─── Escritura en Firestore ───────────────────────────────────────────────────

def _get_firestore_client():
    """
    Retorna el cliente de Firestore de Firebase Admin SDK.
    Inicializa la app si aún no está inicializada.
    """
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
    Escribe la lista de eventos en Firestore bajo
    `usuarios/{uid}/study_calendar` usando un batch para atomicidad.
    Reintenta hasta 3 veces con 2 segundos de intervalo ante fallos.
    """
    db = _get_firestore_client()
    batch = db.batch()
    calendar_ref = db.collection("usuarios").document(uid).collection("study_calendar")

    for event in events:
        doc_ref = calendar_ref.document()  # auto-ID
        batch.set(doc_ref, event.model_dump())

    batch.commit()
    logger.info("Study_Calendar escrito en Firestore para uid=%s (%d eventos)", uid, len(events))


# ─── Nodo LangGraph ───────────────────────────────────────────────────────────

def generate_schedule(state: AgentState) -> AgentState:
    """
    Nodo LangGraph. Lee learning_roadmap, student_id y roadmap_start_date
    del estado, genera el Study_Calendar con recomendaciones diarias y lo
    persiste en Firestore.

    Invariantes:
    - No modifica: learning_roadmap, current_week, quiz_questions, quiz_answers
    - Si learning_roadmap está vacío o student_id es None, retorna el estado sin modificar
    - Siempre añade exactamente un AIMessage a messages
    """
    roadmap: List[Dict] = state.get("learning_roadmap") or []
    student_id: Optional[str] = state.get("student_id")
    student_name: str = state.get("student_name") or "Estudiante"
    weak_skills: List[str] = state.get("weak_skills") or []
    user_preferences: str = state.get("user_preferences") or "programación en general"
    completed_weeks: List[int] = state.get("completed_weeks") or []
    existing_calendar: List[Dict] = state.get("study_calendar") or []

    # Guardia: roadmap vacío
    if not roadmap:
        logger.warning("generate_schedule: learning_roadmap vacío, omitiendo generación.")
        return {**state}

    # Guardia: sin student_id no podemos escribir en Firestore
    if not student_id:
        logger.error("generate_schedule: student_id ausente, omitiendo escritura en Firestore.")
        return {**state}

    # Calcular fecha de inicio
    raw_start = state.get("roadmap_start_date")
    if raw_start:
        try:
            start_date = date.fromisoformat(raw_start)
        except ValueError:
            logger.warning("roadmap_start_date inválido (%s), usando hoy.", raw_start)
            start_date = _nearest_monday(date.today())
    else:
        start_date = _nearest_monday(date.today())

    # Generar recomendaciones diarias con el LLM
    # Solo para semanas que no están completadas (evitar llamadas innecesarias)
    pending_weeks = [w for w in roadmap if w.get("week", 0) not in completed_weeks]
    recommendations: Dict[str, DailyRecommendation] = {}
    if pending_weeks:
        try:
            recommendations = _generate_daily_recommendations(
                pending_weeks, student_name, weak_skills, user_preferences
            )
            logger.info("Recomendaciones generadas: %d módulos", len(recommendations))
        except Exception as exc:
            logger.warning("No se pudieron generar recomendaciones con LLM: %s. "
                           "Se usarán los datos del roadmap como fallback.", exc)

    # Generar eventos del calendario
    events = _build_calendar_events(
        roadmap, start_date, completed_weeks, existing_calendar, recommendations
    )

    # Persistir en Firestore
    try:
        _write_calendar_to_firestore(student_id, events)
    except Exception as exc:
        logger.error("generate_schedule: fallo al escribir en Firestore tras reintentos: %s", exc)
        # Continuamos el flujo aunque Firestore falle — el calendario se puede regenerar

    # Serializar para el estado
    calendar_dicts = [e.model_dump() for e in events]

    msg = AIMessage(content=(
        f"Tu calendario de estudio ha sido generado con {len(events)} eventos "
        f"distribuidos en {len(roadmap)} semanas. "
        "Cada sesión incluye una descripción detallada, duración estimada y recursos recomendados. "
        "Puedes verlo en la sección Calendario de la app."
    ))

    return {
        **state,
        "messages":            [msg],
        "study_calendar":      calendar_dicts,
        "roadmap_start_date":  start_date.isoformat(),
        "current_step":        "generate_schedule",
        "next_step":           "quiz",
    }
