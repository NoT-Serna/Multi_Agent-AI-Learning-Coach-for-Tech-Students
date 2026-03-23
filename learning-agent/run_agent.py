
# run_agent.py
import uuid
from dotenv import load_dotenv
from graph.learning_graph import app

load_dotenv()

# ─── Initial state ────────────────────────────────────────────────────────────

initial_state = {
    # Estudiante
    "student_name":     "Carlos",
    "student_id":       str(uuid.uuid4()),
    "user_background":  "sé un poco de Python, nunca he trabajado profesionalmente",
    "user_preferences": "desarrollo web, automatización",

    # Diagnóstico
    "diagnostic_questions": [],
    "diagnostic_answers":   [],
    "diagnostic_complete":  False,

    # Resultados
    "skill_scores":  {},
    "strong_skills": [],
    "weak_skills":   [],

    # Roadmap
    "learning_roadmap": [],
    "roadmap_adjusted": False,
    "roadmap_complete": False,

    # Progress
    "current_week":      None,
    "current_quiz_week": None,
    "completed_weeks":   [],
    "current_module":    None,
    "completed_modules": [],

    # Quiz
    "quiz_questions": [],
    "quiz_answers":   [],
    "quiz_scores":    {},
    "quiz_passed":    None,
    "quiz_attempts":  {},
    "max_attempts":   None,

    # Orquestador
    "current_step":  None,
    "next_step":     None,
    "error_message": None,
    "messages":      [],
}

# ─── Thread config (required for interrupt to work) ───────────────────────────

config = {"configurable": {"thread_id": "test-session-1"}}

# ─── Phase 1: run until interrupt (generate_exam delivers questions) ──────────

print("=" * 60)
print("FASE 1 — Generando diagnóstico...")
print("=" * 60)

state = app.invoke(initial_state, config=config)

# Print the last AI message (the exam)
last_message = state["messages"][-1]
print(last_message.content)

# Print the generated questions
print("\n--- Preguntas generadas ---")
for i, q in enumerate(state["diagnostic_questions"], 1):
    print(f"\n{i}. [{q['category']}] {q['question']}")
    for letter, option in q["options"].items():
        print(f"   {letter}) {option}")

# ─── Phase 2: simulate student answers and resume ─────────────────────────────

print("\n" + "=" * 60)
print("FASE 2 — Evaluando respuestas...")
print("=" * 60)

# Simulate 20 answers — replace with real input logic later
student_answers = ["A"] * 20

state = app.invoke(
    {**state, "diagnostic_answers": student_answers},
    config=config,
)

# Print the evaluation result
last_message = state["messages"][-1]
print(last_message.content)

print("\n--- Estado final del diagnóstico ---")
print(f"skill_scores:  {state['skill_scores']}")
print(f"strong_skills: {state['strong_skills']}")
print(f"weak_skills:   {state['weak_skills']}")
print(f"diagnostic_complete: {state['diagnostic_complete']}")
