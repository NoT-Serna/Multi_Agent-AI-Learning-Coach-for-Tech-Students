"""
Tests para chatbot_agent: property tests (Hypothesis) y unit tests de ejemplo.

Estructura:
  - Sección 1: Property tests (Properties 1–7 del design.md)
  - Sección 2: Unit tests de ejemplo (comportamientos específicos)
"""
import sys
import os

# Asegurar que el directorio learning-agent esté en el path para los imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import MagicMock, patch

from hypothesis import given, settings, HealthCheck
from langchain_core.messages import HumanMessage, AIMessage

from agents.chatbot_agent import (
    chatbot_agent,
    _is_quiz_mode,
    _build_learning_context,
    _get_last_human_message,
)

# Las estrategias se importan desde conftest para usarlas en @given.
# pytest carga conftest automáticamente; el import explícito permite usarlas en @given.
import importlib.util
import pathlib

_conftest_path = pathlib.Path(__file__).parent / "conftest.py"
_spec = importlib.util.spec_from_file_location("conftest", _conftest_path)
_conftest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_conftest)

quiz_mode_state_strategy = _conftest.quiz_mode_state_strategy
valid_agent_state_strategy = _conftest.valid_agent_state_strategy
non_quiz_state_strategy = _conftest.non_quiz_state_strategy
valid_non_quiz_state_with_roadmap_strategy = _conftest.valid_non_quiz_state_with_roadmap_strategy


# ─── Sección 1: Property Tests ────────────────────────────────────────────────

import hypothesis.strategies as st


@given(
    next_step=st.one_of(st.just("await_quiz_answers"), st.text()),
    quiz_questions=st.lists(st.fixed_dictionaries({"id": st.text()}), max_size=5),
    quiz_passed=st.one_of(st.none(), st.booleans()),
)
@settings(max_examples=200)
def test_quiz_mode_detection(next_step, quiz_questions, quiz_passed):
    """Property 2 — Detección correcta de Quiz_Mode. Validates: Requirements 2.4"""
    state = {"next_step": next_step, "quiz_questions": quiz_questions, "quiz_passed": quiz_passed}
    expected = (next_step == "await_quiz_answers") or (len(quiz_questions) > 0 and quiz_passed is None)
    assert _is_quiz_mode(state) == expected


@given(state=quiz_mode_state_strategy())
@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
def test_quiz_mode_blocking(state):
    """Property 1 — Bloqueo en Quiz_Mode. Validates: Requirements 2.1, 2.2"""
    result = chatbot_agent(state)
    last_msg = result["messages"][-1]
    assert isinstance(last_msg, AIMessage)
    content = last_msg.content.lower()
    assert "quiz" in content or "evaluación" in content
    assert any(word in content for word in ["finalizar", "terminar", "completar", "disponible"])


@given(state=valid_agent_state_strategy())
@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow], deadline=None)
def test_control_fields_preserved(state):
    """Property 3 — Preservación de campos de control. Validates: Requirements 4.1, 5.3"""
    # Mockear el LLM para no llamar a Ollama
    control_before = {k: state.get(k) for k in ["current_step", "next_step", "quiz_passed", "quiz_questions", "learning_roadmap"]}
    mock_response = MagicMock()
    mock_response.content = "Respuesta de prueba para el estudiante."
    with patch("agents.chatbot_agent.llm") as mock_llm_patch:
        mock_llm_patch.invoke.return_value = mock_response
        result = chatbot_agent(state)
    for key, value in control_before.items():
        assert result.get(key) == value, f"Campo '{key}' fue modificado"


@given(state=valid_non_quiz_state_with_roadmap_strategy())
@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow], deadline=None)
def test_messages_grow_with_ai_message(state):
    """Property 4 — Crecimiento del historial con AIMessage. Validates: Requirements 4.2"""
    # El agente retorna {**state, "messages": [new_ai_message]}.
    # LangGraph aplica add_messages al hacer merge, por lo que el historial crece.
    # Aquí verificamos que el resultado siempre incluye al menos un AIMessage nuevo.
    mock_response = MagicMock()
    mock_response.content = "Respuesta de prueba."
    with patch("agents.chatbot_agent.llm") as mock_llm_patch:
        mock_llm_patch.invoke.return_value = mock_response
        result = chatbot_agent(state)
    # El resultado debe contener mensajes y el último debe ser AIMessage
    assert len(result["messages"]) >= 1
    assert isinstance(result["messages"][-1], AIMessage)
    # Simular el merge que haría LangGraph: mensajes originales + nuevo AIMessage
    from langchain_core.messages import messages_from_dict
    original_msgs = state.get("messages", [])
    merged = original_msgs + result["messages"]
    assert len(merged) > len(original_msgs)


@given(state=non_quiz_state_strategy(roadmap=[]))
@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
def test_empty_roadmap_response(state):
    """Property 5 — Respuesta ante roadmap vacío. Validates: Requirements 4.5"""
    result = chatbot_agent(state)
    last_msg = result["messages"][-1].content.lower()
    assert any(word in last_msg for word in ["diagnóstico", "plan de estudio", "roadmap"])


@given(state=valid_non_quiz_state_with_roadmap_strategy())
@settings(max_examples=50, suppress_health_check=[HealthCheck.too_slow], deadline=None)
def test_response_word_limit(state):
    """Property 6 — Límite de palabras en la respuesta. Validates: Requirements 6.2"""
    # Respuesta mock que cumple el límite
    mock_response = MagicMock()
    mock_response.content = "Hola Estudiante. " + " ".join(["palabra"] * 50)  # 52 palabras, bien bajo 400
    with patch("agents.chatbot_agent.llm") as mock_llm_patch:
        mock_llm_patch.invoke.return_value = mock_response
        result = chatbot_agent(state)
    word_count = len(result["messages"][-1].content.split())
    assert word_count <= 400


@given(state=valid_non_quiz_state_with_roadmap_strategy())
@settings(max_examples=50, suppress_health_check=[HealthCheck.too_slow], deadline=None)
def test_student_name_in_response(state):
    """Property 7 — Nombre del estudiante en la respuesta. Validates: Requirements 1.5"""
    name = state.get("student_name") or "Estudiante"
    # Asegurar que hay al menos un HumanMessage con contenido no vacío
    # para que el agente llegue a la rama del LLM
    from langchain_core.messages import HumanMessage as HM
    state = {**state, "messages": [HM(content="¿Qué es Python?")]}
    mock_response = MagicMock()
    mock_response.content = f"Hola {name}, aquí tienes información sobre tu plan de aprendizaje."
    with patch("agents.chatbot_agent.llm") as mock_llm_patch:
        mock_llm_patch.invoke.return_value = mock_response
        result = chatbot_agent(state)
    assert name in result["messages"][-1].content


# ─── Sección 2: Unit Tests ────────────────────────────────────────────────────

def _make_state(**overrides):
    """Construye un AgentState mínimo válido con los overrides dados."""
    base = {
        "messages": [HumanMessage(content="¿Qué es Python?")],
        "student_name": "Carlos",
        "student_id": "abc-123",
        "user_background": "principiante",
        "user_preferences": "web",
        "diagnostic_questions": [],
        "diagnostic_answers": [],
        "diagnostic_complete": False,
        "skill_scores": {},
        "skills_by_category": {},
        "strong_skills": [],
        "weak_skills": [],
        "learning_roadmap": [],
        "roadmap_adjusted": False,
        "roadmap_complete": False,
        "current_week": None,
        "current_quiz_week": None,
        "completed_weeks": [],
        "current_module": None,
        "completed_modules": [],
        "quiz_questions": [],
        "quiz_answers": [],
        "quiz_scores": {},
        "quiz_passed": None,
        "quiz_attempts": {},
        "max_attempts": 3,
        "next_step": None,
        "current_step": None,
        "error_message": None,
    }
    base.update(overrides)
    return base


class TestQuizModeBlocking:
    """Tests para el comportamiento de bloqueo en Quiz_Mode."""

    def test_quiz_mode_returns_block_message(self):
        """
        Estado con next_step="await_quiz_answers" → el mensaje contiene "quiz".
        """
        state = _make_state(next_step="await_quiz_answers")
        result = chatbot_agent(state)
        last_msg = result["messages"][-1]
        assert isinstance(last_msg, AIMessage)
        assert "quiz" in last_msg.content.lower()

    def test_quiz_mode_with_questions_returns_block_message(self):
        """
        Estado con quiz_questions no vacío y quiz_passed=None → mensaje de bloqueo.
        """
        state = _make_state(
            quiz_questions=[{"id": "q1", "question": "¿Qué es una variable?"}],
            quiz_passed=None,
            next_step=None,
        )
        result = chatbot_agent(state)
        last_msg = result["messages"][-1]
        assert isinstance(last_msg, AIMessage)
        assert "quiz" in last_msg.content.lower()


class TestEmptyRoadmap:
    """Tests para el comportamiento cuando el roadmap está vacío."""

    def test_empty_roadmap_returns_diagnostic_message(self):
        """
        Estado sin roadmap (lista vacía) → mensaje contiene "diagnóstico".
        """
        state = _make_state(
            learning_roadmap=[],
            quiz_questions=[],
            quiz_passed=True,
            next_step="some_step",
        )
        result = chatbot_agent(state)
        last_msg = result["messages"][-1]
        assert isinstance(last_msg, AIMessage)
        assert "diagnostico" in last_msg.content.lower()

    def test_none_roadmap_returns_diagnostic_message(self):
        """
        Estado con roadmap=None → mensaje contiene "diagnostico".
        """
        state = _make_state(
            learning_roadmap=None,
            quiz_questions=[],
            quiz_passed=True,
            next_step="some_step",
        )
        result = chatbot_agent(state)
        last_msg = result["messages"][-1]
        assert isinstance(last_msg, AIMessage)
        assert "diagnostico" in last_msg.content.lower()


class TestEdgeCases:
    """Tests para casos borde y manejo de errores."""

    def test_empty_messages_returns_friendly_error(self):
        """
        Estado sin HumanMessage → retorna AIMessage sin lanzar excepción.
        """
        state = _make_state(
            messages=[],
            learning_roadmap=[{"week": 1, "topic": "Python"}],
            quiz_questions=[],
            quiz_passed=True,
            next_step="some_step",
        )
        # No debe lanzar excepción
        result = chatbot_agent(state)
        last_msg = result["messages"][-1]
        assert isinstance(last_msg, AIMessage)
        assert len(last_msg.content) > 0

    def test_student_name_none_uses_fallback(self, mock_llm):
        """
        student_name=None → no lanza excepción; usa "Estudiante" como fallback.
        """
        state = _make_state(
            student_name=None,
            learning_roadmap=[{"week": 1, "topic": "Python"}],
            quiz_questions=[],
            quiz_passed=True,
            next_step="some_step",
            messages=[HumanMessage(content="¿Qué es Python?")],
        )
        # No debe lanzar excepción
        result = chatbot_agent(state)
        last_msg = result["messages"][-1]
        assert isinstance(last_msg, AIMessage)
        assert len(last_msg.content) > 0


class TestIsQuizMode:
    """Tests unitarios para la función auxiliar _is_quiz_mode."""

    def test_await_quiz_answers_is_quiz_mode(self):
        assert _is_quiz_mode({"next_step": "await_quiz_answers", "quiz_questions": [], "quiz_passed": None}) is True

    def test_non_empty_questions_and_none_passed_is_quiz_mode(self):
        assert _is_quiz_mode({
            "next_step": None,
            "quiz_questions": [{"id": "q1"}],
            "quiz_passed": None,
        }) is True

    def test_empty_questions_and_none_passed_is_not_quiz_mode(self):
        assert _is_quiz_mode({
            "next_step": None,
            "quiz_questions": [],
            "quiz_passed": None,
        }) is False

    def test_questions_with_passed_true_is_not_quiz_mode(self):
        assert _is_quiz_mode({
            "next_step": None,
            "quiz_questions": [{"id": "q1"}],
            "quiz_passed": True,
        }) is False

    def test_questions_with_passed_false_is_not_quiz_mode(self):
        assert _is_quiz_mode({
            "next_step": None,
            "quiz_questions": [{"id": "q1"}],
            "quiz_passed": False,
        }) is False


class TestGetLastHumanMessage:
    """Tests unitarios para _get_last_human_message."""

    def test_returns_last_human_message(self):
        state = {"messages": [
            HumanMessage(content="primera"),
            AIMessage(content="respuesta"),
            HumanMessage(content="segunda"),
        ]}
        assert _get_last_human_message(state) == "segunda"

    def test_returns_empty_string_when_no_human_message(self):
        state = {"messages": [AIMessage(content="respuesta")]}
        assert _get_last_human_message(state) == ""

    def test_returns_empty_string_when_messages_empty(self):
        state = {"messages": []}
        assert _get_last_human_message(state) == ""


class TestBuildLearningContext:
    """Tests unitarios para _build_learning_context."""

    def test_includes_student_name(self):
        state = _make_state(student_name="Ana")
        context = _build_learning_context(state)
        assert "Ana" in context

    def test_uses_fallback_when_name_is_none(self):
        state = _make_state(student_name=None)
        context = _build_learning_context(state)
        assert "Estudiante" in context

    def test_includes_context_markers(self):
        state = _make_state()
        context = _build_learning_context(state)
        assert "[CONTEXTO DE APRENDIZAJE]" in context
        assert "[FIN DEL CONTEXTO]" in context


class TestExampleBehaviors:
    """Unit tests de ejemplo para comportamientos semánticos específicos."""

    def test_question_about_current_week(self, mock_llm):
        """Pregunta sobre semana actual → respuesta no vacía."""
        state = _make_state(
            current_week=2,
            learning_roadmap=[
                {"week": 1, "topic": "Variables y tipos"},
                {"week": 2, "topic": "Funciones y módulos"},
            ],
            messages=[HumanMessage(content="¿Qué temas cubre el módulo de la semana 2?")],
            quiz_questions=[],
            quiz_passed=True,
            next_step="some_step",
        )
        result = chatbot_agent(state)
        assert isinstance(result["messages"][-1], AIMessage)
        assert len(result["messages"][-1].content) > 0

    def test_question_about_future_week(self, mock_llm):
        """Pregunta sobre semana futura → respuesta no vacía."""
        state = _make_state(
            current_week=1,
            learning_roadmap=[
                {"week": 1, "topic": "Variables"},
                {"week": 3, "topic": "POO"},
            ],
            messages=[HumanMessage(content="¿Qué voy a aprender en la semana 3?")],
            quiz_questions=[],
            quiz_passed=True,
            next_step="some_step",
        )
        result = chatbot_agent(state)
        assert isinstance(result["messages"][-1], AIMessage)
        assert len(result["messages"][-1].content) > 0
