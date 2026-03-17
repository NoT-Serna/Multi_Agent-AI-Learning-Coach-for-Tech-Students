from typing import Annotated, TypedDict, List, Dict, Optional
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    # Conversación
    messages: Annotated[List[BaseMessage], add_messages]
    
    # Estudiante
    student_name: Optional[str]
    student_id: Optional[str]

    # Diagnóstico
    user_preferences: Optional[str]
    user_background: Optional[str]
    diagnostic_questions: List[Dict]
    diagnostic_answers: List[str]      
    diagnostic_complete: bool

    # Resultados del diagnóstico
    skill_scores: Dict[str, float] # {"skill_1": 75.0, "skill_2": 60.0, ...}
    strong_skills: List[str]
    weak_skills: List[str]

    # Roadmap
    learning_roadmap: List[Dict]
    roadmap_adjusted: bool
    roadmap_complete: bool

    # Progress tracking
    current_quiz_week: Optional[int]
    current_week: Optional[int]        # 1–4
    completed_weeks: List[int]
    current_module: Optional[str]
    completed_modules: List[str]

    # Quiz
    quiz_questions: List[Dict]
    quiz_answers: List[str]
    quiz_scores: Dict[str, float]      # {"week_1": 82.5, ...}
    quiz_passed: Optional[bool]
    quiz_attempts: Dict[str, int]          # {"week_1": 1, "week_2": 2, ...}
    max_attempts: Optional[int]

    # Orquestador
    current_step: Optional[str]
    next_step: Optional[str]
    error_message: Optional[str]


     