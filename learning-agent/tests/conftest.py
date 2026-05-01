"""
Estrategias Hypothesis y fixtures pytest compartidos para los tests del chatbot_agent.
"""
import pytest
from unittest.mock import MagicMock, patch

from hypothesis import strategies as st
from langchain_core.messages import HumanMessage, AIMessage


# ─── Estrategias Hypothesis ───────────────────────────────────────────────────

def _base_state_fields():
    """Campos base del AgentState con valores por defecto."""
    return st.fixed_dictionaries({
        "student_id": st.just("abc-123"),
        "user_background": st.just("principiante"),
        "user_preferences": st.just("web"),
        "diagnostic_questions": st.just([]),
        "diagnostic_answers": st.just([]),
        "diagnostic_complete": st.just(False),
        "skill_scores": st.just({}),
        "skills_by_category": st.just({}),
        "strong_skills": st.just([]),
        "weak_skills": st.just([]),
        "roadmap_adjusted": st.just(False),
        "roadmap_complete": st.just(False),
        "current_week": st.just(None),
        "current_quiz_week": st.just(None),
        "completed_weeks": st.just([]),
        "current_module": st.just(None),
        "completed_modules": st.just([]),
        "quiz_answers": st.just([]),
        "quiz_scores": st.just({}),
        "quiz_attempts": st.just({}),
        "max_attempts": st.just(3),
        "current_step": st.just(None),
        "error_message": st.just(None),
    })


def quiz_mode_state_strategy():
    """
    Genera estados en Quiz_Mode.

    Variante A: next_step="await_quiz_answers", quiz_questions=[], quiz_passed=None
    Variante B: next_step=None, quiz_questions=[{"id": "q1", "question": "test"}], quiz_passed=None
    """
    human_message = st.builds(
        HumanMessage,
        content=st.text(min_size=1, max_size=200),
    )
    messages_strategy = st.lists(human_message, min_size=1, max_size=5)

    variant_a = st.fixed_dictionaries({
        "next_step": st.just("await_quiz_answers"),
        "quiz_questions": st.just([]),
        "quiz_passed": st.just(None),
    })

    variant_b = st.fixed_dictionaries({
        "next_step": st.just(None),
        "quiz_questions": st.just([{"id": "q1", "question": "test"}]),
        "quiz_passed": st.just(None),
    })

    quiz_fields = st.one_of(variant_a, variant_b)

    @st.composite
    def build_state(draw):
        base = draw(_base_state_fields())
        quiz = draw(quiz_fields)
        msgs = draw(messages_strategy)
        name = draw(st.one_of(st.none(), st.text(min_size=1, max_size=50)))
        roadmap = draw(st.lists(st.just({"week": 1, "topic": "Python"}), min_size=0, max_size=3))
        return {
            **base,
            **quiz,
            "messages": msgs,
            "student_name": name,
            "learning_roadmap": roadmap,
        }

    return build_state()


def valid_agent_state_strategy():
    """
    Genera estados válidos con al menos un HumanMessage en messages.

    - next_step: cualquier string excepto "await_quiz_answers" o None
    - quiz_questions=[] y quiz_passed=True (asegura que NO es Quiz_Mode)
    - messages: al menos un HumanMessage con texto no vacío
    - learning_roadmap: puede ser lista vacía o no vacía
    - student_name: puede ser None o string
    """
    human_message = st.builds(
        HumanMessage,
        content=st.text(min_size=1, max_size=200),
    )
    messages_strategy = st.lists(human_message, min_size=1, max_size=5)

    # next_step que no sea "await_quiz_answers" ni None
    safe_next_step = st.text(min_size=1).filter(lambda s: s != "await_quiz_answers")

    @st.composite
    def build_state(draw):
        base = draw(_base_state_fields())
        msgs = draw(messages_strategy)
        name = draw(st.one_of(st.none(), st.text(min_size=1, max_size=50)))
        roadmap = draw(st.lists(
            st.just({"week": 1, "topic": "Python"}),
            min_size=0,
            max_size=3,
        ))
        next_step = draw(safe_next_step)
        return {
            **base,
            "messages": msgs,
            "student_name": name,
            "learning_roadmap": roadmap,
            "quiz_questions": [],
            "quiz_passed": True,
            "next_step": next_step,
        }

    return build_state()


def non_quiz_state_strategy(roadmap=None):
    """
    Genera estados fuera de Quiz_Mode con el roadmap dado.

    Si roadmap es None, usa [].
    """
    fixed_roadmap = roadmap if roadmap is not None else []

    human_message = st.builds(
        HumanMessage,
        content=st.text(min_size=1, max_size=200),
    )
    messages_strategy = st.lists(human_message, min_size=1, max_size=5)

    safe_next_step = st.text(min_size=1).filter(lambda s: s != "await_quiz_answers")

    @st.composite
    def build_state(draw):
        base = draw(_base_state_fields())
        msgs = draw(messages_strategy)
        name = draw(st.one_of(st.none(), st.text(min_size=1, max_size=50)))
        next_step = draw(safe_next_step)
        return {
            **base,
            "messages": msgs,
            "student_name": name,
            "learning_roadmap": fixed_roadmap,
            "quiz_questions": [],
            "quiz_passed": True,
            "next_step": next_step,
        }

    return build_state()


def valid_non_quiz_state_with_roadmap_strategy():
    """
    Genera estados fuera de Quiz_Mode con learning_roadmap no vacío y student_name no vacío.
    """
    human_message = st.builds(
        HumanMessage,
        content=st.text(min_size=1, max_size=200),
    )
    messages_strategy = st.lists(human_message, min_size=1, max_size=5)

    safe_next_step = st.text(min_size=1).filter(lambda s: s != "await_quiz_answers")

    roadmap_item = st.fixed_dictionaries({
        "week": st.integers(min_value=1, max_value=4),
        "topic": st.text(min_size=1, max_size=50),
    })

    @st.composite
    def build_state(draw):
        base = draw(_base_state_fields())
        msgs = draw(messages_strategy)
        # student_name siempre no vacío (al menos 1 char)
        name = draw(st.text(min_size=1, max_size=50).filter(str.strip))
        # learning_roadmap siempre no vacío (al menos un elemento)
        roadmap = draw(st.lists(roadmap_item, min_size=1, max_size=3))
        next_step = draw(safe_next_step)
        return {
            **base,
            "messages": msgs,
            "student_name": name,
            "learning_roadmap": roadmap,
            "quiz_questions": [],
            "quiz_passed": True,
            "next_step": next_step,
        }

    return build_state()


# ─── Fixture pytest: mock de build_llm ───────────────────────────────────────

@pytest.fixture
def mock_llm():
    """
    Mock de build_llm que retorna un LLM determinístico.

    El mock retorna respuestas que:
    - Incluyen el nombre del estudiante (usa "Estudiante" como fallback)
    - Tienen <= 400 palabras
    - Son texto plano (no JSON)
    """
    def _make_mock_llm(student_name=None):
        name = student_name or "Estudiante"
        response_content = (
            f"Hola {name}, aquí tienes información sobre tu plan de aprendizaje. "
            "Esta semana trabajarás en los fundamentos de Python. "
            "Recuerda practicar los ejercicios propuestos para reforzar los conceptos. "
            "¡Sigue adelante con tu aprendizaje!"
        )
        mock_response = MagicMock()
        mock_response.content = response_content

        mock_llm_instance = MagicMock()
        mock_llm_instance.invoke.return_value = mock_response
        return mock_llm_instance

    with patch("agents.chatbot_agent.llm") as patched_llm:
        # Por defecto, el mock usa "Estudiante" como nombre
        default_response = MagicMock()
        default_response.content = (
            "Hola Estudiante, aquí tienes información sobre tu plan de aprendizaje. "
            "Esta semana trabajarás en los fundamentos de Python. "
            "Recuerda practicar los ejercicios propuestos para reforzar los conceptos. "
            "¡Sigue adelante con tu aprendizaje!"
        )
        patched_llm.invoke.return_value = default_response
        patched_llm._make_mock_llm = _make_mock_llm
        yield patched_llm
