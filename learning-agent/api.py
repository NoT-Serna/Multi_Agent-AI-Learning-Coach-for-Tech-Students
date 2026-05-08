"""
api.py — FastAPI bridge between the React frontend and the LangGraph agent system.

Endpoints:
  POST /session/start          → create session, run diagnostic flow, return questions
  POST /diagnostic/submit      → submit diagnostic answers, return scores + roadmap + quiz
  POST /quiz/submit            → submit quiz answers, return result + next state
  POST /chat                   → send message to chatbot, return AI response
  GET  /session/{session_id}   → return full current state for a session
"""

import os
import sys
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

# ── Make sure local modules are importable ────────────────────────────────────
sys.path.insert(0, os.path.dirname(__file__))

from graph.learning_graph import app as langgraph_app
from agents.chatbot_agent import chatbot_agent

load_dotenv()

# ── FastAPI app ───────────────────────────────────────────────────────────────

api = FastAPI(
    title="AI Learning Coach API",
    description="Bridge between the React frontend and the LangGraph multi-agent system.",
    version="1.0.0",
)

# Allow requests from the Vite dev server
api.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory session store (keyed by session_id) ─────────────────────────────
# Each value is the latest AgentState snapshot for that session.
_sessions: dict[str, dict] = {}


def _get_session(session_id: str) -> dict:
    """Return session state or raise 404."""
    state = _sessions.get(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return state


def _langgraph_config(session_id: str) -> dict:
    return {"configurable": {"thread_id": session_id}}


# ── Request / Response models ─────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    student_name: str
    user_background: str
    user_preferences: str
    student_id: str | None = None


class StartSessionResponse(BaseModel):
    session_id: str
    diagnostic_questions: list[dict]
    message: str


class DiagnosticSubmitRequest(BaseModel):
    session_id: str
    answers: list[str]


class DiagnosticSubmitResponse(BaseModel):
    skill_scores: dict[str, float]
    strong_skills: list[str]
    weak_skills: list[str]
    learning_roadmap: list[dict]
    study_calendar: list[dict]
    quiz_questions: list[dict]
    current_week: int
    message: str


class QuizSubmitRequest(BaseModel):
    session_id: str
    answers: list[str]


class QuizSubmitResponse(BaseModel):
    quiz_passed: bool
    score: float
    next_step: str
    current_week: int
    completed_weeks: list[int]
    quiz_scores: dict[str, float]
    learning_roadmap: list[dict]
    study_calendar: list[dict]
    quiz_questions: list[dict]
    message: str


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    response: str


class SessionStateResponse(BaseModel):
    session_id: str
    student_name: str | None
    current_step: str | None
    next_step: str | None
    current_week: int | None
    completed_weeks: list[int]
    skill_scores: dict[str, float]
    strong_skills: list[str]
    weak_skills: list[str]
    learning_roadmap: list[dict]
    quiz_questions: list[dict]
    quiz_scores: dict[str, float]
    quiz_passed: bool | None
    diagnostic_complete: bool
    roadmap_complete: bool


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_initial_state(req: StartSessionRequest, session_id: str) -> dict:
    return {
        "student_name":         req.student_name,
        "student_id":           req.student_id or str(uuid.uuid4()),
        "user_background":      req.user_background,
        "user_preferences":     req.user_preferences,
        "diagnostic_questions": [],
        "diagnostic_answers":   [],
        "diagnostic_complete":  False,
        "skill_scores":         {},
        "skills_by_category":   {},
        "strong_skills":        [],
        "weak_skills":          [],
        "learning_roadmap":     [],
        "roadmap_adjusted":     False,
        "roadmap_complete":     False,
        "current_week":         None,
        "current_quiz_week":    None,
        "completed_weeks":      [],
        "current_module":       None,
        "completed_modules":    [],
        "quiz_questions":       [],
        "quiz_answers":         [],
        "quiz_scores":          {},
        "quiz_passed":          None,
        "quiz_attempts":        {},
        "max_attempts":         3,
        "current_step":         None,
        "next_step":            None,
        "error_message":        None,
        "messages":             [],
        "study_calendar":       [],
        "roadmap_start_date":   None,
    }


def _last_ai_message(state: dict) -> str:
    """Extract the content of the last AIMessage in state['messages']."""
    from langchain_core.messages import AIMessage
    for msg in reversed(state.get("messages", [])):
        if isinstance(msg, AIMessage):
            return msg.content
    return ""


# ── Endpoints ─────────────────────────────────────────────────────────────────

@api.get("/health")
def health():
    """Quick liveness check."""
    return {"status": "ok"}


@api.post("/session/start", response_model=StartSessionResponse)
def start_session(req: StartSessionRequest):
    """
    Create a new learning session.
    Runs: collect_profile → generate_skills → generate_exam
    Returns the diagnostic questions so the frontend can display them.
    """
    session_id = str(uuid.uuid4())
    config     = _langgraph_config(session_id)
    initial    = _build_initial_state(req, session_id)

    # Run until the graph pauses at evaluate_answers (interrupt_before)
    state = langgraph_app.invoke(initial, config=config)
    _sessions[session_id] = state

    questions = state.get("diagnostic_questions", [])
    if not questions:
        raise HTTPException(
            status_code=500,
            detail="Agent failed to generate diagnostic questions. Is Ollama running?"
        )

    return StartSessionResponse(
        session_id=session_id,
        diagnostic_questions=questions,
        message=_last_ai_message(state),
    )


@api.post("/diagnostic/submit", response_model=DiagnosticSubmitResponse)
def submit_diagnostic(req: DiagnosticSubmitRequest):
    """
    Submit the student's answers to the diagnostic exam.
    Runs: evaluate_answers → generate_roadmap → generate_quiz
    Returns skill scores, roadmap, and the first quiz.
    """
    state  = _get_session(req.session_id)
    config = _langgraph_config(req.session_id)

    # Inject answers and resume the graph
    langgraph_app.update_state(config, {"diagnostic_answers": req.answers})
    state = langgraph_app.invoke(None, config=config)
    _sessions[req.session_id] = state

    return DiagnosticSubmitResponse(
        skill_scores    = state.get("skill_scores",     {}),
        strong_skills   = state.get("strong_skills",    []),
        weak_skills     = state.get("weak_skills",      []),
        learning_roadmap= state.get("learning_roadmap", []),
        study_calendar  = state.get("study_calendar",   []),
        quiz_questions  = state.get("quiz_questions",   []),
        current_week    = state.get("current_week",     1),
        message         = _last_ai_message(state),
    )


@api.post("/quiz/submit", response_model=QuizSubmitResponse)
def submit_quiz(req: QuizSubmitRequest):
    """
    Submit the student's answers to the current week's quiz.
    Runs: evaluate_quiz_answers → (adjust_roadmap | END)
    Returns the result and the next state (next quiz or completion).
    """
    state  = _get_session(req.session_id)
    config = _langgraph_config(req.session_id)

    # Inject answers and resume
    langgraph_app.update_state(config, {"quiz_answers": req.answers})
    state = langgraph_app.invoke(None, config=config)
    _sessions[req.session_id] = state

    next_step    = state.get("next_step", "")
    quiz_scores  = state.get("quiz_scores", {})
    current_week = state.get("current_week", 1)

    # Derive score for the week that was just evaluated
    week_key = f"week_{state.get('current_quiz_week', current_week)}"
    score    = quiz_scores.get(week_key, 0.0)

    return QuizSubmitResponse(
        quiz_passed     = state.get("quiz_passed",      False),
        score           = score,
        next_step       = next_step,
        current_week    = current_week,
        completed_weeks = state.get("completed_weeks",  []),
        quiz_scores     = quiz_scores,
        learning_roadmap= state.get("learning_roadmap", []),
        study_calendar  = state.get("study_calendar",   []),
        quiz_questions  = state.get("quiz_questions",   []),
        message         = _last_ai_message(state),
    )


@api.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """
    Send a message to the chatbot agent.
    The chatbot uses the session's learning context to answer.
    """
    state = _get_session(req.session_id)

    # Add the user message to the state's message history
    current_messages = list(state.get("messages", []))
    current_messages.append(HumanMessage(content=req.message))
    state = {**state, "messages": current_messages}

    # Invoke chatbot directly (not through the main graph)
    result = chatbot_agent(state)

    # Persist updated message history
    _sessions[req.session_id] = {**state, "messages": result["messages"]}

    return ChatResponse(response=result["messages"][-1].content)


@api.get("/session/{session_id}", response_model=SessionStateResponse)
def get_session(session_id: str):
    """Return the full current state for a session."""
    state = _get_session(session_id)

    return SessionStateResponse(
        session_id       = session_id,
        student_name     = state.get("student_name"),
        current_step     = state.get("current_step"),
        next_step        = state.get("next_step"),
        current_week     = state.get("current_week"),
        completed_weeks  = state.get("completed_weeks",  []),
        skill_scores     = state.get("skill_scores",     {}),
        strong_skills    = state.get("strong_skills",    []),
        weak_skills      = state.get("weak_skills",      []),
        learning_roadmap = state.get("learning_roadmap", []),
        quiz_questions   = state.get("quiz_questions",   []),
        quiz_scores      = state.get("quiz_scores",      {}),
        quiz_passed      = state.get("quiz_passed"),
        diagnostic_complete = state.get("diagnostic_complete", False),
        roadmap_complete    = state.get("roadmap_complete",    False),
    )


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:api", host="0.0.0.0", port=8006, reload=True)
