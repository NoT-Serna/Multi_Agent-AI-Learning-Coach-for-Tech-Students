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
import logging

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import HumanMessage
from pydantic import BaseModel
import firebase_admin
from firebase_admin import credentials, firestore

# ── Make sure local modules are importable ────────────────────────────────────
sys.path.insert(0, os.path.dirname(__file__))

from graph.learning_graph import app as langgraph_app
from agents.chatbot_agent import chatbot_agent
from agents.quiz_agent import generate_quiz as _generate_quiz_node

load_dotenv()

# ── Configure logging ─────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Initialize Firebase Admin SDK ────────────────────────────────────────────
db = None  # Firestore client instance

try:
    # Load service account key path from environment variable
    service_account_path = os.getenv(
        "FIREBASE_SERVICE_ACCOUNT_KEY",
        os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
    )
    
    if not os.path.exists(service_account_path):
        logger.error(f"Firebase service account key not found at: {service_account_path}")
        raise FileNotFoundError(f"Service account key file not found: {service_account_path}")
    
    # Initialize Firebase Admin SDK with service account credentials
    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred)
    
    # Create Firestore client instance
    db = firestore.client()
    
    logger.info("Firebase Admin SDK initialized successfully")
    logger.info("Firestore client created successfully")
    
except Exception as e:
    logger.error(f"Failed to initialize Firebase Admin SDK: {str(e)}")
    raise HTTPException(
        status_code=500,
        detail=f"Firebase initialization failed: {str(e)}"
    )

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

# Firestore collection that maps session_id → Firebase UID.
# Written on every new session; queried when restoring after a server restart.
_SESSION_MAP_COLLECTION = "sesiones_map"


# ── Session-to-UID mapping helpers ───────────────────────────────────────────

def _save_session_uid_mapping(session_id: str, uid: str) -> None:
    """Persist session_id → uid so we can restore after a server restart."""
    if not db or not uid:
        return
    try:
        db.collection(_SESSION_MAP_COLLECTION).document(session_id).set({"uid": uid})
    except Exception as exc:
        logger.warning(f"Could not save session-uid mapping: {exc}")


def _get_uid_for_session(session_id: str) -> str | None:
    """Look up the Firebase UID that owns this session_id."""
    if not db:
        return None
    try:
        snap = db.collection(_SESSION_MAP_COLLECTION).document(session_id).get()
        if snap.exists:
            return snap.get("uid")
    except Exception as exc:
        logger.warning(f"Could not look up uid for session {session_id}: {exc}")
    return None


def _get_firestore_session_state(uid: str) -> dict | None:
    """Read the user's session state document from Firestore."""
    if not db:
        return None
    try:
        snap = (
            db.collection("usuarios")
            .document(uid)
            .collection("sesionAgente")
            .document("data")
            .get()
        )
        if snap.exists:
            return snap.to_dict()
    except Exception as exc:
        logger.warning(f"Could not read Firestore session state for uid {uid}: {exc}")
    return None


def _reconstruct_agent_state(fs: dict, session_id: str) -> dict:
    """
    Build an AgentState-compatible dict from a Firestore EstadoSesion document.
    Fields not stored in Firestore get safe defaults.
    """
    current_week = fs.get("currentWeek") or 1
    return {
        "student_name":         fs.get("studentName", ""),
        "student_id":           session_id,
        "user_background":      "",
        "user_preferences":     "",
        "diagnostic_questions": [],
        "diagnostic_answers":   [],
        "diagnostic_complete":  fs.get("diagnosticComplete", False),
        "skill_scores":         fs.get("skillScores", {}),
        "skills_by_category":   {},
        "strong_skills":        fs.get("strongSkills", []),
        "weak_skills":          fs.get("weakSkills", []),
        "learning_roadmap":     fs.get("learningRoadmap", []),
        "roadmap_adjusted":     False,
        "roadmap_complete":     len(fs.get("completedWeeks", [])) >= 4,
        "current_week":         current_week,
        "current_quiz_week":    current_week,
        "completed_weeks":      fs.get("completedWeeks", []),
        "current_module":       None,
        "completed_modules":    [],
        "quiz_questions":       fs.get("quizQuestions", []),
        "quiz_answers":         [],
        "quiz_scores":          fs.get("quizScores", {}),
        "quiz_passed":          fs.get("quizPassed"),
        "quiz_attempts":        {},
        "max_attempts":         3,
        "current_step":         None,
        "next_step":            None,
        "error_message":        None,
        "messages":             [],
        "study_calendar":       [],
        "roadmap_start_date":   None,
    }


def _try_restore_session(session_id: str, uid: str | None = None) -> dict | None:
    """
    Attempt to reconstruct a session from Firestore after a server restart.

    Steps:
      1. Use the provided uid (from the request) or fall back to sesiones_map.
      2. Read the user's sesionAgente document from Firestore.
      3. Rebuild an AgentState dict.
      4. If a quiz is in progress, recreate the LangGraph checkpoint so that
         submit_quiz can continue (fast path: hits interrupt_before immediately,
         no LLM calls).
      5. Store the reconstructed state in _sessions.
    """
    if not uid:
        uid = _get_uid_for_session(session_id)
    if not uid:
        logger.info(f"No uid mapping found for session {session_id}; cannot restore.")
        return None

    fs_state = _get_firestore_session_state(uid)
    if not fs_state:
        logger.info(f"No Firestore state found for uid {uid}; cannot restore.")
        return None

    state = _reconstruct_agent_state(fs_state, session_id)
    _sessions[session_id] = state

    # If a quiz is in progress, rebuild the LangGraph checkpoint so that
    # a subsequent submit_quiz call can invoke evaluate_quiz_answers.
    # update_state(as_node="generate_quiz") positions the checkpoint as if
    # generate_quiz just ran — the graph is already paused at the
    # interrupt_before evaluate_quiz_answers boundary.  No invoke() needed.
    if state.get("diagnostic_complete") and state.get("quiz_questions"):
        config = _langgraph_config(session_id)
        try:
            langgraph_app.update_state(config, state, as_node="generate_quiz")
            logger.info(f"LangGraph checkpoint rebuilt for session {session_id}")
        except Exception as exc:
            logger.warning(
                f"Could not rebuild LangGraph checkpoint for {session_id}: {exc}. "
                "Quiz submission may fall back to rebuild path."
            )

    logger.info(f"Session {session_id} restored from Firestore (uid={uid})")
    return state


def _get_session(session_id: str, uid: str | None = None) -> dict:
    """Return session state, restoring from Firestore if needed, or raise 404."""
    state = _sessions.get(session_id)
    if state is None:
        state = _try_restore_session(session_id, uid)
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
    user_id: str | None = None  # Firebase UID — used to restore session after a restart


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
    user_id: str | None = None  # Firebase UID — used to restore session after a restart


class QuizSubmitResponse(BaseModel):
    quiz_passed: bool | None
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
    # Firebase UID — required for chatbot to write calendar/roadmap changes to Firestore.
    uid: str | None = None
    # Optional learning context — used when the session is not in the in-memory
    # store (e.g. after a server restart). The chatbot only needs these fields
    # to generate a contextualised response; it does not need the full LangGraph
    # state.
    student_name: str | None = None
    user_preferences: str | None = None
    user_background: str | None = None
    learning_roadmap: list[dict] | None = None
    skill_scores: dict[str, float] | None = None
    strong_skills: list[str] | None = None
    weak_skills: list[str] | None = None
    current_week: int | None = None
    completed_weeks: list[int] | None = None
    quiz_scores: dict[str, float] | None = None
    study_calendar: list[dict] | None = None


class ChatResponse(BaseModel):
    response: str
    updated_calendar: list[dict] | None = None
    updated_roadmap: list[dict] | None = None


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
    """Quick liveness check with Firestore connection verification."""
    try:
        # Verify Firestore connection by attempting a simple operation
        if db is None:
            return {
                "status": "degraded",
                "api": "ok",
                "firestore": "not_initialized"
            }
        
        # Test Firestore connection with a lightweight operation
        # This will raise an exception if Firestore is not accessible
        _ = db.collection("_health_check").limit(1).get()
        
        return {
            "status": "ok",
            "api": "ok",
            "firestore": "connected"
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "degraded",
            "api": "ok",
            "firestore": "error",
            "error": str(e)
        }


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

    # Persist session_id → student_id mapping so we can restore after a restart.
    _save_session_uid_mapping(session_id, req.student_id or "")

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
    state  = _get_session(req.session_id, req.user_id)
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
    state  = _get_session(req.session_id, req.user_id)
    config = _langgraph_config(req.session_id)

    # Always reposition the checkpoint as if generate_quiz just ran and inject the
    # submitted answers in a single update_state call.  Using as_node="generate_quiz"
    # guarantees that (a) the graph pauses at interrupt_before evaluate_quiz_answers
    # and (b) quiz_answers is present in the state the node receives.
    # A plain update_state without as_node does not reliably deliver the answers to
    # the next node, so we use this single-call pattern in all cases.
    logger.info(
        f"[submit_quiz] Positioning checkpoint for session {req.session_id} "
        f"with {len(req.answers)} answers: {req.answers}"
    )
    langgraph_app.update_state(
        config,
        {**state, "quiz_answers": req.answers},
        as_node="generate_quiz",
    )

    state = langgraph_app.invoke(None, config=config)
    _sessions[req.session_id] = state

    next_step    = state.get("next_step", "")
    quiz_scores  = state.get("quiz_scores", {})
    current_week = state.get("current_week") or 1

    # Score is stored under the quiz week that was just evaluated.
    # current_quiz_week is set by generate_quiz to the week BEFORE current_week advances.
    week_key = f"week_{state.get('current_quiz_week', current_week)}"
    score    = quiz_scores.get(week_key, 0.0)

    # Pre-generate quiz questions eagerly so the frontend gets fresh questions
    # without a second round-trip, and reposition the checkpoint for the next submit.
    quiz_questions      = state.get("quiz_questions", [])
    response_quiz_passed  = state.get("quiz_passed")
    response_quiz_scores  = quiz_scores
    response_quiz_questions = quiz_questions

    if next_step == "next_week" and current_week <= 4:
        # Passed → pre-generate questions for the upcoming week.
        try:
            next_quiz_state     = _generate_quiz_node(state)
            response_quiz_questions = next_quiz_state.get("quiz_questions", quiz_questions)
            pre_state = {
                **state,
                "quiz_questions":    response_quiz_questions,
                "quiz_answers":      [],
                "quiz_passed":       None,
                "next_step":         "await_quiz_answers",
                "current_quiz_week": current_week,   # now the next week
            }
            _sessions[req.session_id] = pre_state
            langgraph_app.update_state(config, pre_state, as_node="generate_quiz")
            logger.info(f"[submit_quiz] Pre-generated week {current_week} quiz questions.")
        except Exception as e:
            logger.warning(f"[submit_quiz] Pre-generating week {current_week} quiz failed: {e}")

    elif next_step == "retry_quiz":
        # Failed but attempts remain → generate fresh questions for the same week
        # and wipe the failed attempt's score so the next attempt starts clean.
        try:
            retry_quiz_state    = _generate_quiz_node(state)
            response_quiz_questions = retry_quiz_state.get("quiz_questions", quiz_questions)
            response_quiz_scores  = {k: v for k, v in quiz_scores.items() if k != week_key}
            response_quiz_passed  = None  # reset so the frontend treats it as a fresh start
            pre_state = {
                **state,
                "quiz_questions":    response_quiz_questions,
                "quiz_answers":      [],
                "quiz_passed":       None,
                "quiz_scores":       response_quiz_scores,
                "next_step":         "await_quiz_answers",
            }
            _sessions[req.session_id] = pre_state
            langgraph_app.update_state(config, pre_state, as_node="generate_quiz")
            logger.info(
                f"[submit_quiz] Generated fresh retry quiz for week "
                f"{state.get('current_quiz_week', current_week)}."
            )
        except Exception as e:
            logger.warning(f"[submit_quiz] Generating retry quiz failed: {e}")

    return QuizSubmitResponse(
        quiz_passed     = response_quiz_passed,
        score           = score,
        next_step       = next_step,
        current_week    = current_week,
        completed_weeks = state.get("completed_weeks",  []),
        quiz_scores     = response_quiz_scores,
        learning_roadmap= state.get("learning_roadmap", []),
        study_calendar  = state.get("study_calendar",   []),
        quiz_questions  = response_quiz_questions,
        message         = _last_ai_message(state),
    )


@api.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """
    Send a message to the chatbot agent.
    The chatbot uses the session's learning context to answer.

    If the session is not found in the in-memory store (e.g. after a server
    restart), the endpoint falls back to the learning context fields supplied
    directly in the request body so the chatbot can still respond correctly.
    """
    # Try to get the full LangGraph state; fall back to a lightweight context
    # built from the fields the caller sent when the session is missing.
    state = _sessions.get(req.session_id)

    if state is None:
        # Build a minimal state from the context the frontend already has.
        # The chatbot agent only reads the fields below — it does not need the
        # full LangGraph graph state to generate a response.
        state = {
            "student_name":     req.student_name or "",
            "user_preferences": req.user_preferences or "",
            "user_background":  req.user_background or "",
            "learning_roadmap": req.learning_roadmap or [],
            "skill_scores":     req.skill_scores or {},
            "strong_skills":    req.strong_skills or [],
            "weak_skills":      req.weak_skills or [],
            "current_week":     req.current_week,
            "completed_weeks":  req.completed_weeks or [],
            "quiz_scores":      req.quiz_scores or {},
            "study_calendar":   req.study_calendar or [],
            "quiz_questions":   [],
            "quiz_passed":      None,
            "next_step":        None,
            "messages":         [],
        }

    # Inject the Firebase UID so the chatbot can write calendar changes to Firestore.
    if req.uid:
        state = {**state, "_chat_uid": req.uid}

    # Add the user message to the state's message history
    current_messages = list(state.get("messages", []))
    current_messages.append(HumanMessage(content=req.message))
    state = {**state, "messages": current_messages}

    # Invoke chatbot directly (not through the main graph)
    result = chatbot_agent(state)

    # Extract any modification results so the frontend can update its local state.
    updated_calendar = result.get("study_calendar") if result.get("_chat_modified_calendar") else None
    updated_roadmap  = result.get("learning_roadmap") if result.get("_chat_modified_roadmap") else None

    # Persist updated state back into the in-memory store
    updated_state = {
        **state,
        "messages": result["messages"],
        **({"study_calendar": updated_calendar} if updated_calendar is not None else {}),
        **({"learning_roadmap": updated_roadmap} if updated_roadmap is not None else {}),
    }
    _sessions[req.session_id] = updated_state

    return ChatResponse(
        response=result["messages"][-1].content,
        updated_calendar=updated_calendar,
        updated_roadmap=updated_roadmap,
    )


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
