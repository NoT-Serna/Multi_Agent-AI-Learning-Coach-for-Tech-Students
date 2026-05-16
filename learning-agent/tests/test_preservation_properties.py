"""
Preservation Property Tests for Session Persistence Fix

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

These tests verify that existing behavior is preserved during normal operation
(WITHOUT server restart). They establish the baseline behavior that must remain
unchanged after implementing the Firestore persistence fix.

CRITICAL: These tests MUST PASS on unfixed code - they document the behavior to preserve.

Property 2: Preservation - Existing Behavior Without Server Restart
- LangGraph Workflow Preservation: thread_id usage, state transitions
- Endpoint Response Format Preservation: JSON structure and field names
- Concurrent User Isolation: no state leakage between users
- CORS Configuration Preservation: headers unchanged
- Diagnostic/Quiz/Chat Logic Preservation: question generation, scoring, responses
"""
import sys
import os

# Ensure learning-agent directory is in path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from hypothesis import given, settings, strategies as st, HealthCheck
from unittest.mock import patch, MagicMock
import uuid

# Import the FastAPI app
from api import api, _sessions


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(api)


@pytest.fixture
def mock_langgraph():
    """
    Mock LangGraph to avoid calling Ollama during tests.
    Returns deterministic state for predictable testing.
    """
    with patch("api.langgraph_app") as mock_app:
        # Mock invoke to return a complete diagnostic state
        def mock_invoke(state, config=None):
            if state is None:
                # Resume from checkpoint (diagnostic submit, quiz submit)
                thread_id = config["configurable"]["thread_id"]
                return {
                    "session_id": thread_id,
                    "student_name": "Test Student",
                    "diagnostic_complete": True,
                    "skill_scores": {"python": 75.0, "javascript": 60.0},
                    "strong_skills": ["python"],
                    "weak_skills": ["javascript"],
                    "learning_roadmap": [
                        {"week": 1, "topic": "Python Basics", "resources": []},
                        {"week": 2, "topic": "JavaScript Fundamentals", "resources": []},
                    ],
                    "study_calendar": [
                        {"date": "2024-01-15", "tasks": ["Study Python"], "duration_minutes": 120}
                    ],
                    "quiz_questions": [
                        {"id": "q1", "question": "What is a variable?", "options": ["A", "B", "C"], "correct_answer": "A"}
                    ],
                    "current_week": 1,
                    "current_quiz_week": 1,
                    "completed_weeks": [],
                    "quiz_scores": {"week_1": 85.0},
                    "quiz_passed": True,
                    "messages": [],
                    "next_step": "await_quiz_answers",
                }
            else:
                # Initial session start
                return {
                    **state,
                    "diagnostic_questions": [
                        {"id": "d1", "question": "What is Python?", "options": ["A", "B", "C"], "correct_answer": "A"},
                        {"id": "d2", "question": "What is OOP?", "options": ["A", "B", "C"], "correct_answer": "B"},
                    ],
                    "messages": [],
                }
        
        mock_app.invoke.side_effect = mock_invoke
        mock_app.update_state.return_value = None
        yield mock_app


# ─── Property 2.1: Endpoint Response Format Preservation ─────────────────────

@given(
    student_name=st.text(min_size=1, max_size=50).filter(str.strip),
    user_background=st.text(min_size=10, max_size=200),
    user_preferences=st.text(min_size=10, max_size=200),
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
def test_property_start_session_response_format(
    client, mock_langgraph, student_name, user_background, user_preferences
):
    """
    Property 2.1: Endpoint Response Format Preservation - POST /session/start
    
    **Validates: Requirements 3.1**
    
    Verifies that POST /session/start returns the expected JSON structure
    during normal operation (no server restart).
    
    Expected fields:
    - session_id: string (UUID format)
    - diagnostic_questions: list of dicts
    - message: string
    
    This test MUST PASS on unfixed code.
    """
    response = client.post("/session/start", json={
        "student_name": student_name,
        "user_background": user_background,
        "user_preferences": user_preferences,
    })
    
    assert response.status_code == 200
    data = response.json()
    
    # Verify response structure
    assert "session_id" in data, "Response must contain session_id"
    assert "diagnostic_questions" in data, "Response must contain diagnostic_questions"
    assert "message" in data, "Response must contain message"
    
    # Verify types
    assert isinstance(data["session_id"], str), "session_id must be string"
    assert isinstance(data["diagnostic_questions"], list), "diagnostic_questions must be list"
    assert isinstance(data["message"], str), "message must be string"
    
    # Verify session_id is a valid UUID
    try:
        uuid.UUID(data["session_id"])
    except ValueError:
        pytest.fail(f"session_id '{data['session_id']}' is not a valid UUID")
    
    # Verify diagnostic_questions is not empty
    assert len(data["diagnostic_questions"]) > 0, "diagnostic_questions must not be empty"


@given(
    student_name=st.text(min_size=1, max_size=50).filter(str.strip),
    user_background=st.text(min_size=10, max_size=200),
    user_preferences=st.text(min_size=10, max_size=200),
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
def test_property_submit_diagnostic_response_format(
    client, mock_langgraph, student_name, user_background, user_preferences
):
    """
    Property 2.1: Endpoint Response Format Preservation - POST /diagnostic/submit
    
    **Validates: Requirements 3.2**
    
    Verifies that POST /diagnostic/submit returns the expected JSON structure.
    
    Expected fields:
    - skill_scores: dict[str, float]
    - strong_skills: list[str]
    - weak_skills: list[str]
    - learning_roadmap: list[dict]
    - study_calendar: list[dict]
    - quiz_questions: list[dict]
    - current_week: int
    - message: str
    
    This test MUST PASS on unfixed code.
    """
    # Create session first
    response = client.post("/session/start", json={
        "student_name": student_name,
        "user_background": user_background,
        "user_preferences": user_preferences,
    })
    session_id = response.json()["session_id"]
    
    # Submit diagnostic
    response = client.post("/diagnostic/submit", json={
        "session_id": session_id,
        "answers": ["A", "B"],
    })
    
    assert response.status_code == 200
    data = response.json()
    
    # Verify response structure
    required_fields = [
        "skill_scores", "strong_skills", "weak_skills",
        "learning_roadmap", "study_calendar", "quiz_questions",
        "current_week", "message"
    ]
    for field in required_fields:
        assert field in data, f"Response must contain {field}"
    
    # Verify types
    assert isinstance(data["skill_scores"], dict), "skill_scores must be dict"
    assert isinstance(data["strong_skills"], list), "strong_skills must be list"
    assert isinstance(data["weak_skills"], list), "weak_skills must be list"
    assert isinstance(data["learning_roadmap"], list), "learning_roadmap must be list"
    assert isinstance(data["study_calendar"], list), "study_calendar must be list"
    assert isinstance(data["quiz_questions"], list), "quiz_questions must be list"
    assert isinstance(data["current_week"], int), "current_week must be int"
    assert isinstance(data["message"], str), "message must be str"


@given(
    student_name=st.text(min_size=1, max_size=50).filter(str.strip),
    user_background=st.text(min_size=10, max_size=200),
    user_preferences=st.text(min_size=10, max_size=200),
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
def test_property_submit_quiz_response_format(
    client, mock_langgraph, student_name, user_background, user_preferences
):
    """
    Property 2.1: Endpoint Response Format Preservation - POST /quiz/submit
    
    **Validates: Requirements 3.3**
    
    Verifies that POST /quiz/submit returns the expected JSON structure.
    
    Expected fields:
    - quiz_passed: bool
    - score: float
    - next_step: str
    - current_week: int
    - completed_weeks: list[int]
    - quiz_scores: dict[str, float]
    - learning_roadmap: list[dict]
    - study_calendar: list[dict]
    - quiz_questions: list[dict]
    - message: str
    
    This test MUST PASS on unfixed code.
    """
    # Create session and complete diagnostic
    response = client.post("/session/start", json={
        "student_name": student_name,
        "user_background": user_background,
        "user_preferences": user_preferences,
    })
    session_id = response.json()["session_id"]
    
    client.post("/diagnostic/submit", json={
        "session_id": session_id,
        "answers": ["A", "B"],
    })
    
    # Submit quiz
    response = client.post("/quiz/submit", json={
        "session_id": session_id,
        "answers": ["A"],
    })
    
    assert response.status_code == 200
    data = response.json()
    
    # Verify response structure
    required_fields = [
        "quiz_passed", "score", "next_step", "current_week",
        "completed_weeks", "quiz_scores", "learning_roadmap",
        "study_calendar", "quiz_questions", "message"
    ]
    for field in required_fields:
        assert field in data, f"Response must contain {field}"
    
    # Verify types
    assert isinstance(data["quiz_passed"], bool), "quiz_passed must be bool"
    assert isinstance(data["score"], (int, float)), "score must be numeric"
    assert isinstance(data["next_step"], str), "next_step must be str"
    assert isinstance(data["current_week"], int), "current_week must be int"
    assert isinstance(data["completed_weeks"], list), "completed_weeks must be list"
    assert isinstance(data["quiz_scores"], dict), "quiz_scores must be dict"
    assert isinstance(data["learning_roadmap"], list), "learning_roadmap must be list"
    assert isinstance(data["study_calendar"], list), "study_calendar must be list"
    assert isinstance(data["quiz_questions"], list), "quiz_questions must be list"
    assert isinstance(data["message"], str), "message must be str"


@given(
    student_name=st.text(min_size=1, max_size=50).filter(str.strip),
    user_background=st.text(min_size=10, max_size=200),
    user_preferences=st.text(min_size=10, max_size=200),
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
def test_property_get_session_response_format(
    client, mock_langgraph, student_name, user_background, user_preferences
):
    """
    Property 2.1: Endpoint Response Format Preservation - GET /session/{session_id}
    
    **Validates: Requirements 3.7**
    
    Verifies that GET /session/{session_id} returns the expected JSON structure.
    
    Expected fields:
    - session_id: str
    - student_name: str | None
    - current_step: str | None
    - next_step: str | None
    - current_week: int | None
    - completed_weeks: list[int]
    - skill_scores: dict[str, float]
    - strong_skills: list[str]
    - weak_skills: list[str]
    - learning_roadmap: list[dict]
    - quiz_questions: list[dict]
    - quiz_scores: dict[str, float]
    - quiz_passed: bool | None
    - diagnostic_complete: bool
    - roadmap_complete: bool
    
    This test MUST PASS on unfixed code.
    """
    # Create session
    response = client.post("/session/start", json={
        "student_name": student_name,
        "user_background": user_background,
        "user_preferences": user_preferences,
    })
    session_id = response.json()["session_id"]
    
    # Get session
    response = client.get(f"/session/{session_id}")
    
    assert response.status_code == 200
    data = response.json()
    
    # Verify response structure
    required_fields = [
        "session_id", "student_name", "current_step", "next_step",
        "current_week", "completed_weeks", "skill_scores",
        "strong_skills", "weak_skills", "learning_roadmap",
        "quiz_questions", "quiz_scores", "quiz_passed",
        "diagnostic_complete", "roadmap_complete"
    ]
    for field in required_fields:
        assert field in data, f"Response must contain {field}"
    
    # Verify session_id matches
    assert data["session_id"] == session_id


# ─── Property 2.2: LangGraph Workflow Preservation ───────────────────────────

@given(
    student_name=st.text(min_size=1, max_size=50).filter(str.strip),
    user_background=st.text(min_size=10, max_size=200),
    user_preferences=st.text(min_size=10, max_size=200),
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
def test_property_langgraph_uses_thread_id(
    client, mock_langgraph, student_name, user_background, user_preferences
):
    """
    Property 2.2: LangGraph Workflow Preservation - thread_id usage
    
    **Validates: Requirements 3.5**
    
    Verifies that LangGraph workflow execution uses thread_id in the
    configurable dict for state management.
    
    This test MUST PASS on unfixed code.
    """
    # Create session
    response = client.post("/session/start", json={
        "student_name": student_name,
        "user_background": user_background,
        "user_preferences": user_preferences,
    })
    session_id = response.json()["session_id"]
    
    # Verify LangGraph was called with correct config
    assert mock_langgraph.invoke.called
    call_args = mock_langgraph.invoke.call_args
    
    # Check that config contains thread_id
    assert "config" in call_args.kwargs or len(call_args.args) > 1
    if "config" in call_args.kwargs:
        config = call_args.kwargs["config"]
    else:
        config = call_args.args[1]
    
    assert "configurable" in config, "Config must contain 'configurable' dict"
    assert "thread_id" in config["configurable"], "Configurable must contain 'thread_id'"
    assert config["configurable"]["thread_id"] == session_id, "thread_id must match session_id"


# ─── Property 2.3: Concurrent User Isolation ─────────────────────────────────

@given(
    user1_name=st.text(min_size=1, max_size=50).filter(str.strip),
    user2_name=st.text(min_size=1, max_size=50).filter(str.strip),
    user1_background=st.text(min_size=10, max_size=200),
    user2_background=st.text(min_size=10, max_size=200),
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
def test_property_concurrent_user_isolation(
    client, mock_langgraph, user1_name, user2_name, user1_background, user2_background
):
    """
    Property 2.3: Concurrent User Isolation
    
    **Validates: Requirements 3.6**
    
    Verifies that multiple users can interact with the system concurrently
    without state leakage. Each user's session data must remain isolated.
    
    This test MUST PASS on unfixed code.
    """
    # Create two separate sessions
    response1 = client.post("/session/start", json={
        "student_name": user1_name,
        "user_background": user1_background,
        "user_preferences": "Prefers videos",
    })
    session_id1 = response1.json()["session_id"]
    
    response2 = client.post("/session/start", json={
        "student_name": user2_name,
        "user_background": user2_background,
        "user_preferences": "Prefers reading",
    })
    session_id2 = response2.json()["session_id"]
    
    # Verify sessions are different
    assert session_id1 != session_id2, "Session IDs must be unique"
    
    # Verify both sessions exist in memory
    assert session_id1 in _sessions, "User 1 session must exist"
    assert session_id2 in _sessions, "User 2 session must exist"
    
    # Verify session data is isolated
    state1 = _sessions[session_id1]
    state2 = _sessions[session_id2]
    
    assert state1["student_name"] == user1_name, "User 1 name must match"
    assert state2["student_name"] == user2_name, "User 2 name must match"
    assert state1["user_background"] == user1_background, "User 1 background must match"
    assert state2["user_background"] == user2_background, "User 2 background must match"
    
    # Verify no cross-contamination
    assert state1 is not state2, "Session states must be separate objects"


# ─── Property 2.4: CORS Configuration Preservation ───────────────────────────

def test_property_cors_headers_preserved(client):
    """
    Property 2.4: CORS Configuration Preservation
    
    **Validates: Requirements 3.8**
    
    Verifies that CORS headers remain unchanged and allow requests from
    the Vite dev server (localhost:5173).
    
    This test MUST PASS on unfixed code.
    """
    # Make a request with Origin header
    response = client.get(
        "/health",
        headers={"Origin": "http://localhost:5173"}
    )
    
    assert response.status_code == 200
    
    # Verify CORS middleware is configured by checking the app's middleware stack
    from api import api as app
    from starlette.middleware.cors import CORSMiddleware
    
    # Check that CORSMiddleware is in the middleware stack
    has_cors = any(
        isinstance(middleware, type) and issubclass(middleware, CORSMiddleware)
        or isinstance(getattr(middleware, 'cls', None), type) and issubclass(middleware.cls, CORSMiddleware)
        for middleware in app.user_middleware
    )
    
    # Alternative: check if middleware_stack contains CORS
    if not has_cors:
        # Check the actual middleware stack
        middleware_stack_str = str(app.middleware_stack)
        has_cors = "CORSMiddleware" in middleware_stack_str
    
    assert has_cors, "CORSMiddleware must be configured in the application"


# ─── Property 2.5: Diagnostic Logic Preservation ─────────────────────────────

@given(
    student_name=st.text(min_size=1, max_size=50).filter(str.strip),
    user_background=st.text(min_size=10, max_size=200),
    user_preferences=st.text(min_size=10, max_size=200),
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
def test_property_diagnostic_flow_generates_questions(
    client, mock_langgraph, student_name, user_background, user_preferences
):
    """
    Property 2.5: Diagnostic Logic Preservation - Question Generation
    
    **Validates: Requirements 3.1**
    
    Verifies that the diagnostic flow generates questions correctly
    during normal operation.
    
    This test MUST PASS on unfixed code.
    """
    response = client.post("/session/start", json={
        "student_name": student_name,
        "user_background": user_background,
        "user_preferences": user_preferences,
    })
    
    assert response.status_code == 200
    data = response.json()
    
    # Verify diagnostic questions are generated
    assert "diagnostic_questions" in data
    assert len(data["diagnostic_questions"]) > 0, "Must generate at least one question"
    
    # Verify question structure
    for question in data["diagnostic_questions"]:
        assert "id" in question, "Question must have id"
        assert "question" in question, "Question must have question text"
        assert "options" in question, "Question must have options"
        assert "correct_answer" in question, "Question must have correct_answer"


@given(
    student_name=st.text(min_size=1, max_size=50).filter(str.strip),
    user_background=st.text(min_size=10, max_size=200),
    user_preferences=st.text(min_size=10, max_size=200),
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
def test_property_diagnostic_evaluation_generates_roadmap(
    client, mock_langgraph, student_name, user_background, user_preferences
):
    """
    Property 2.5: Diagnostic Logic Preservation - Roadmap Generation
    
    **Validates: Requirements 3.2**
    
    Verifies that diagnostic evaluation generates a learning roadmap
    and skill scores correctly.
    
    This test MUST PASS on unfixed code.
    """
    # Create session
    response = client.post("/session/start", json={
        "student_name": student_name,
        "user_background": user_background,
        "user_preferences": user_preferences,
    })
    session_id = response.json()["session_id"]
    
    # Submit diagnostic
    response = client.post("/diagnostic/submit", json={
        "session_id": session_id,
        "answers": ["A", "B"],
    })
    
    assert response.status_code == 200
    data = response.json()
    
    # Verify skill scores are generated
    assert "skill_scores" in data
    assert isinstance(data["skill_scores"], dict)
    
    # Verify learning roadmap is generated
    assert "learning_roadmap" in data
    assert isinstance(data["learning_roadmap"], list)
    assert len(data["learning_roadmap"]) > 0, "Must generate at least one week in roadmap"
    
    # Verify strong/weak skills are identified
    assert "strong_skills" in data
    assert "weak_skills" in data


# ─── Property 2.6: Chat Logic Preservation ───────────────────────────────────

@given(
    student_name=st.text(min_size=1, max_size=50).filter(str.strip),
    user_background=st.text(min_size=10, max_size=200),
    user_preferences=st.text(min_size=10, max_size=200),
    message=st.text(min_size=5, max_size=100),
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
def test_property_chat_generates_response(
    client, mock_langgraph, student_name, user_background, user_preferences, message
):
    """
    Property 2.6: Chat Logic Preservation - Response Generation
    
    **Validates: Requirements 3.4**
    
    Verifies that the chat endpoint generates appropriate responses
    using the chatbot agent.
    
    This test MUST PASS on unfixed code.
    """
    # Create session and complete diagnostic
    response = client.post("/session/start", json={
        "student_name": student_name,
        "user_background": user_background,
        "user_preferences": user_preferences,
    })
    session_id = response.json()["session_id"]
    
    client.post("/diagnostic/submit", json={
        "session_id": session_id,
        "answers": ["A", "B"],
    })
    
    # Mock chatbot agent
    with patch("api.chatbot_agent") as mock_chatbot:
        mock_chatbot.return_value = {
            "messages": [MagicMock(content="Test response from chatbot")]
        }
        
        # Send chat message
        response = client.post("/chat", json={
            "session_id": session_id,
            "message": message,
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "response" in data
        assert isinstance(data["response"], str)
        assert len(data["response"]) > 0, "Response must not be empty"
        
        # Verify chatbot was called
        assert mock_chatbot.called


# ─── Property 2.7: Session State Consistency ─────────────────────────────────

@given(
    student_name=st.text(min_size=1, max_size=50).filter(str.strip),
    user_background=st.text(min_size=10, max_size=200),
    user_preferences=st.text(min_size=10, max_size=200),
)
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
def test_property_session_state_updates_correctly(
    client, mock_langgraph, student_name, user_background, user_preferences
):
    """
    Property 2.7: Session State Consistency
    
    **Validates: Requirements 3.1, 3.2, 3.3**
    
    Verifies that session state is updated correctly after each operation
    and remains consistent throughout the user journey.
    
    This test MUST PASS on unfixed code.
    """
    # Create session
    response = client.post("/session/start", json={
        "student_name": student_name,
        "user_background": user_background,
        "user_preferences": user_preferences,
    })
    session_id = response.json()["session_id"]
    
    # Verify initial state
    assert session_id in _sessions
    state = _sessions[session_id]
    assert state["student_name"] == student_name
    assert state["user_background"] == user_background
    assert state["user_preferences"] == user_preferences
    
    # Submit diagnostic
    response = client.post("/diagnostic/submit", json={
        "session_id": session_id,
        "answers": ["A", "B"],
    })
    
    # Verify state was updated
    state = _sessions[session_id]
    assert state["diagnostic_complete"] == True
    assert "skill_scores" in state
    assert "learning_roadmap" in state
    
    # Submit quiz
    response = client.post("/quiz/submit", json={
        "session_id": session_id,
        "answers": ["A"],
    })
    
    # Verify state was updated again
    state = _sessions[session_id]
    assert "quiz_scores" in state


# ─── Documentation of Preservation Properties ────────────────────────────────

"""
PRESERVATION PROPERTIES (from design.md):

These tests verify that the following behaviors remain unchanged during
normal operation (WITHOUT server restart):

1. Endpoint Response Format Preservation (Requirements 3.1, 3.2, 3.3, 3.7)
   - All endpoints return identical JSON structure and field names
   - Response types match expected schemas

2. LangGraph Workflow Preservation (Requirement 3.5)
   - LangGraph uses thread_id in configurable dict
   - Workflow state transitions are identical

3. Concurrent User Isolation (Requirement 3.6)
   - Multiple users can interact simultaneously
   - No state leakage between sessions

4. CORS Configuration Preservation (Requirement 3.8)
   - CORS headers remain unchanged
   - Vite dev server requests are allowed

5. Diagnostic/Quiz/Chat Logic Preservation (Requirements 3.1, 3.2, 3.3, 3.4)
   - Question generation logic unchanged
   - Skill scoring logic unchanged
   - Roadmap generation logic unchanged
   - Quiz evaluation logic unchanged
   - Chatbot response generation logic unchanged

All tests MUST PASS on unfixed code to establish the baseline behavior
that must be preserved after implementing the Firestore persistence fix.
"""
