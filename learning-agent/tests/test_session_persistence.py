"""
Bug Condition Exploration Test for Session Persistence

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5**

This test encodes the EXPECTED behavior (session data persists after server restart).
It MUST FAIL on unfixed code to confirm the bug exists.

CRITICAL: This test is EXPECTED TO FAIL on unfixed code - failure confirms the bug exists.
DO NOT attempt to fix the test or the code when it fails.

The test will PASS after the fix is implemented (Firestore persistence).
"""
import sys
import os

# Asegurar que el directorio learning-agent esté en el path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from hypothesis import given, settings, strategies as st, HealthCheck
from unittest.mock import patch, MagicMock

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
                return {
                    "session_id": config["configurable"]["thread_id"],
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
                    "completed_weeks": [],
                    "quiz_scores": {},
                    "quiz_passed": None,
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


# ─── Property 1: Bug Condition - Session Data Loss After Server Restart ──────

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
def test_property_session_persists_after_restart_diagnostic_submit(
    client, mock_langgraph, student_name, user_background, user_preferences
):
    """
    Property 1: Bug Condition - Session Data Loss After Server Restart
    
    **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
    
    CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
    
    Test Scenario:
    1. Create a session via POST /session/start
    2. Capture the session_id
    3. Simulate server restart by clearing _sessions dictionary
    4. Attempt to submit diagnostic answers via POST /diagnostic/submit
    
    Expected Behavior (from design):
    - Session state SHALL be loaded from persistent storage
    - API request SHALL return 200 status code (not 404)
    - Response SHALL contain complete session data
    
    Actual Behavior on Unfixed Code:
    - Returns 404 error "Session '{session_id}' not found"
    - This FAILURE confirms the bug exists
    """
    # Step 1: Create a session
    response = client.post("/session/start", json={
        "student_name": student_name,
        "user_background": user_background,
        "user_preferences": user_preferences,
    })
    assert response.status_code == 200
    data = response.json()
    session_id = data["session_id"]
    assert "diagnostic_questions" in data
    
    # Step 2: Verify session exists in memory (before restart)
    assert session_id in _sessions
    
    # Step 3: SIMULATE SERVER RESTART - Clear in-memory sessions
    _sessions.clear()
    
    # Step 4: Attempt to submit diagnostic answers (EXPECTED TO FAIL on unfixed code)
    response = client.post("/diagnostic/submit", json={
        "session_id": session_id,
        "answers": ["A", "B"],
    })
    
    # EXPECTED BEHAVIOR (will fail on unfixed code):
    # - Status code should be 200 (session loaded from Firestore)
    # - Response should contain skill_scores, learning_roadmap, etc.
    assert response.status_code == 200, (
        f"Expected 200 (session persisted), got {response.status_code}. "
        f"This FAILURE confirms the bug: session data is lost after restart."
    )
    
    result = response.json()
    assert "skill_scores" in result
    assert "learning_roadmap" in result
    assert "quiz_questions" in result


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
def test_property_session_persists_after_restart_quiz_submit(
    client, mock_langgraph, student_name, user_background, user_preferences
):
    """
    Property 1: Bug Condition - Session Data Loss After Server Restart (Quiz Submit)
    
    **Validates: Requirements 1.2, 2.2**
    
    CRITICAL: This test MUST FAIL on unfixed code.
    
    Test Scenario:
    1. Create session and complete diagnostic
    2. Simulate server restart
    3. Attempt to submit quiz answers via POST /quiz/submit
    
    Expected: 200 with quiz results
    Actual on unfixed code: 404 "Session not found"
    """
    # Step 1: Create session
    response = client.post("/session/start", json={
        "student_name": student_name,
        "user_background": user_background,
        "user_preferences": user_preferences,
    })
    assert response.status_code == 200
    session_id = response.json()["session_id"]
    
    # Step 2: Complete diagnostic
    response = client.post("/diagnostic/submit", json={
        "session_id": session_id,
        "answers": ["A", "B"],
    })
    assert response.status_code == 200
    
    # Step 3: SIMULATE SERVER RESTART
    _sessions.clear()
    
    # Step 4: Attempt to submit quiz (EXPECTED TO FAIL on unfixed code)
    response = client.post("/quiz/submit", json={
        "session_id": session_id,
        "answers": ["A"],
    })
    
    assert response.status_code == 200, (
        f"Expected 200 (session persisted), got {response.status_code}. "
        f"Bug confirmed: POST /quiz/submit returns 404 after restart."
    )
    
    result = response.json()
    assert "quiz_passed" in result
    assert "score" in result


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
def test_property_session_persists_after_restart_get_session(
    client, mock_langgraph, student_name, user_background, user_preferences
):
    """
    Property 1: Bug Condition - Session Data Loss After Server Restart (Get Session)
    
    **Validates: Requirements 1.4, 2.4**
    
    CRITICAL: This test MUST FAIL on unfixed code.
    
    Test Scenario:
    1. Create session
    2. Simulate server restart
    3. Attempt to retrieve session via GET /session/{session_id}
    
    Expected: 200 with full session state
    Actual on unfixed code: 404 "Session not found"
    """
    # Step 1: Create session
    response = client.post("/session/start", json={
        "student_name": student_name,
        "user_background": user_background,
        "user_preferences": user_preferences,
    })
    assert response.status_code == 200
    session_id = response.json()["session_id"]
    
    # Step 2: SIMULATE SERVER RESTART
    _sessions.clear()
    
    # Step 3: Attempt to get session (EXPECTED TO FAIL on unfixed code)
    response = client.get(f"/session/{session_id}")
    
    assert response.status_code == 200, (
        f"Expected 200 (session persisted), got {response.status_code}. "
        f"Bug confirmed: GET /session/{session_id} returns 404 after restart."
    )
    
    result = response.json()
    assert result["session_id"] == session_id
    assert "student_name" in result


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
def test_property_session_persists_after_restart_chat(
    client, mock_langgraph, student_name, user_background, user_preferences, message
):
    """
    Property 1: Bug Condition - Session Data Loss After Server Restart (Chat)
    
    **Validates: Requirements 1.3, 2.3**
    
    CRITICAL: This test MUST FAIL on unfixed code.
    
    Test Scenario:
    1. Create session and complete diagnostic
    2. Simulate server restart
    3. Attempt to chat via POST /chat
    
    Expected: 200 with AI response using full context from Firestore
    Actual on unfixed code: Falls back to minimal context from request body
    
    Note: The chat endpoint has fallback logic, so it won't return 404,
    but it will lose the full LangGraph state (messages history, etc.)
    """
    # Step 1: Create session
    response = client.post("/session/start", json={
        "student_name": student_name,
        "user_background": user_background,
        "user_preferences": user_preferences,
    })
    assert response.status_code == 200
    session_id = response.json()["session_id"]
    
    # Step 2: Complete diagnostic to populate state
    response = client.post("/diagnostic/submit", json={
        "session_id": session_id,
        "answers": ["A", "B"],
    })
    assert response.status_code == 200
    
    # Verify session has full state before restart
    assert session_id in _sessions
    state_before = _sessions[session_id]
    assert "learning_roadmap" in state_before
    assert len(state_before["learning_roadmap"]) > 0
    
    # Step 3: SIMULATE SERVER RESTART
    _sessions.clear()
    
    # Step 4: Mock chatbot agent to verify it receives full context
    with patch("api.chatbot_agent") as mock_chatbot:
        mock_chatbot.return_value = {
            "messages": [MagicMock(content="Test response")]
        }
        
        # Attempt to chat WITHOUT providing context in request body
        # (to verify the system loads it from Firestore)
        response = client.post("/chat", json={
            "session_id": session_id,
            "message": message,
        })
        
        assert response.status_code == 200
        
        # EXPECTED BEHAVIOR: chatbot_agent should receive full state from Firestore
        # On unfixed code, it will receive minimal state from fallback logic
        assert mock_chatbot.called
        state_passed_to_chatbot = mock_chatbot.call_args[0][0]
        
        # Verify the state has the full learning_roadmap (not empty fallback)
        assert "learning_roadmap" in state_passed_to_chatbot, (
            "Bug confirmed: Chat endpoint lost full context after restart. "
            "Expected learning_roadmap to be loaded from Firestore."
        )
        assert len(state_passed_to_chatbot["learning_roadmap"]) > 0, (
            "Bug confirmed: learning_roadmap is empty after restart. "
            "Expected full roadmap to be loaded from Firestore."
        )


# ─── Unit Tests: Specific Counterexamples ────────────────────────────────────

def test_counterexample_diagnostic_submit_404_after_restart(client, mock_langgraph):
    """
    Concrete counterexample: POST /diagnostic/submit returns 404 after restart.
    
    **Validates: Requirements 1.2, 2.2**
    
    This test documents a specific failing case from the bug description.
    EXPECTED TO FAIL on unfixed code.
    """
    # Create session
    response = client.post("/session/start", json={
        "student_name": "Alice",
        "user_background": "Computer Science student",
        "user_preferences": "Prefers video tutorials",
    })
    assert response.status_code == 200
    session_id = response.json()["session_id"]
    
    # Simulate server restart
    _sessions.clear()
    
    # Attempt diagnostic submit - WILL FAIL with 404 on unfixed code
    response = client.post("/diagnostic/submit", json={
        "session_id": session_id,
        "answers": ["A", "B", "C"],
    })
    
    # Expected behavior: 200 with results
    # Actual on unfixed code: 404
    assert response.status_code == 200, (
        f"Counterexample confirmed: POST /diagnostic/submit returned {response.status_code} "
        f"after server restart. Expected 200 (session loaded from Firestore)."
    )


def test_counterexample_quiz_submit_404_after_restart(client, mock_langgraph):
    """
    Concrete counterexample: POST /quiz/submit returns 404 after restart.
    
    **Validates: Requirements 1.2, 2.2**
    
    EXPECTED TO FAIL on unfixed code.
    """
    # Create session and complete diagnostic
    response = client.post("/session/start", json={
        "student_name": "Bob",
        "user_background": "Web developer",
        "user_preferences": "Hands-on practice",
    })
    session_id = response.json()["session_id"]
    
    client.post("/diagnostic/submit", json={
        "session_id": session_id,
        "answers": ["A", "B"],
    })
    
    # Simulate server restart
    _sessions.clear()
    
    # Attempt quiz submit - WILL FAIL with 404 on unfixed code
    response = client.post("/quiz/submit", json={
        "session_id": session_id,
        "answers": ["A", "B", "C"],
    })
    
    assert response.status_code == 200, (
        f"Counterexample confirmed: POST /quiz/submit returned {response.status_code} "
        f"after server restart. Expected 200."
    )


def test_counterexample_get_session_404_after_restart(client, mock_langgraph):
    """
    Concrete counterexample: GET /session/{session_id} returns 404 after restart.
    
    **Validates: Requirements 1.4, 2.4**
    
    EXPECTED TO FAIL on unfixed code.
    """
    # Create session
    response = client.post("/session/start", json={
        "student_name": "Charlie",
        "user_background": "Data science student",
        "user_preferences": "Theory and practice",
    })
    session_id = response.json()["session_id"]
    
    # Simulate server restart
    _sessions.clear()
    
    # Attempt to get session - WILL FAIL with 404 on unfixed code
    response = client.get(f"/session/{session_id}")
    
    assert response.status_code == 200, (
        f"Counterexample confirmed: GET /session/{session_id} returned {response.status_code} "
        f"after server restart. Expected 200."
    )


def test_counterexample_chat_loses_context_after_restart(client, mock_langgraph):
    """
    Concrete counterexample: POST /chat loses full context after restart.
    
    **Validates: Requirements 1.3, 2.3**
    
    The chat endpoint doesn't return 404 (it has fallback logic), but it loses
    the full LangGraph state (messages history, complete roadmap, etc.).
    
    EXPECTED TO FAIL on unfixed code.
    """
    # Create session and complete diagnostic
    response = client.post("/session/start", json={
        "student_name": "Diana",
        "user_background": "Software engineer",
        "user_preferences": "Project-based learning",
    })
    session_id = response.json()["session_id"]
    
    client.post("/diagnostic/submit", json={
        "session_id": session_id,
        "answers": ["A", "B"],
    })
    
    # Verify full state exists
    assert session_id in _sessions
    assert len(_sessions[session_id]["learning_roadmap"]) > 0
    
    # Simulate server restart
    _sessions.clear()
    
    # Mock chatbot to inspect what state it receives
    with patch("api.chatbot_agent") as mock_chatbot:
        mock_chatbot.return_value = {
            "messages": [MagicMock(content="Response")]
        }
        
        # Chat without providing context in request
        response = client.post("/chat", json={
            "session_id": session_id,
            "message": "What should I study this week?",
        })
        
        assert response.status_code == 200
        
        # Check what state was passed to chatbot
        state = mock_chatbot.call_args[0][0]
        
        # EXPECTED: Full roadmap loaded from Firestore
        # ACTUAL on unfixed code: Empty roadmap from fallback
        assert len(state.get("learning_roadmap", [])) > 0, (
            "Counterexample confirmed: Chat endpoint lost learning_roadmap after restart. "
            "Fallback logic provides empty context instead of loading from Firestore."
        )


# ─── Documentation of Expected Counterexamples ────────────────────────────────

"""
EXPECTED COUNTEREXAMPLES (from design.md):

When running these tests on UNFIXED code, we expect to observe:

1. POST /diagnostic/submit returns 404 after restart
   - Error: "Session '{session_id}' not found"
   - Root cause: _sessions dictionary is empty after restart

2. POST /quiz/submit returns 404 after restart
   - Error: "Session '{session_id}' not found"
   - Root cause: _sessions dictionary is empty after restart

3. POST /chat loses full context after restart
   - Endpoint returns 200 (has fallback logic)
   - But chatbot receives minimal context from request body
   - Full LangGraph state (messages history, complete roadmap) is lost
   - Root cause: _sessions dictionary is empty, fallback builds minimal state

4. GET /session/{session_id} returns 404 after restart
   - Error: "Session '{session_id}' not found"
   - Root cause: _sessions dictionary is empty after restart

These failures CONFIRM the bug exists and validate the root cause analysis.

After implementing the fix (Firestore persistence), all tests should PASS:
- Sessions will be loaded from Firestore when not found in _sessions cache
- All endpoints will return 200 with complete session data
- Chat will receive full LangGraph state from Firestore
"""
