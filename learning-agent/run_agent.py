# run_agent.py
import uuid
import random
from dotenv import load_dotenv
from graph.learning_graph import app
from langfuse.langchain import CallbackHandler
from langfuse import get_client

load_dotenv()

# ─── Initial state ─────────────────────────────────────────────────────────────

initial_state = {
    "student_name":     "Carlos",
    "student_id":       str(uuid.uuid4()),
    "user_background":  "sé un poco de Python, nunca he trabajado profesionalmente",
    "user_preferences": "desarrollo web, automatización",
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
    "max_attempts":         None,
    "current_step":         None,
    "next_step":            None,
    "error_message":        None,
    "messages":             [],
}

# ─── Config ────────────────────────────────────────────────────────────────────

langfuse_handler = CallbackHandler()

config = {
    "configurable": {"thread_id": "test-session-1"},
    "callbacks":    [langfuse_handler],
}

langfuse = get_client()

# ─── Phase 1: generate exam ────────────────────────────────────────────────────

print("=" * 60)
print("FASE 1 — Generando diagnóstico...")
print("=" * 60)

state = app.invoke(initial_state, config=config)

print(state["messages"][-1].content)

print("\n--- Preguntas generadas ---")
for i, q in enumerate(state["diagnostic_questions"], 1):
    print(f"\n{i}. [{q['category']}] {q['question']}")
    for letter, option in q["options"].items():
        print(f"   {letter}) {option}")

# ─── Phase 2: evaluate answers + generate roadmap ──────────────────────────────

print("\n" + "=" * 60)
print("FASE 2 — Evaluando respuestas y generando roadmap...")
print("=" * 60)

student_answers = [random.choice(["A", "B", "C", "D"]) for _ in state["diagnostic_questions"]]

app.update_state(
    config,
    {"diagnostic_answers": student_answers},
)

state = app.invoke(None, config=config)

# Evaluation result
print("\n--- Resultados del diagnóstico ---")
print(f"skill_scores:        {state['skill_scores']}")
print(f"strong_skills:       {state['strong_skills']}")
print(f"weak_skills:         {state['weak_skills']}")
print(f"diagnostic_complete: {state['diagnostic_complete']}")

# Roadmap result
print("\n--- Roadmap generado ---")
print(state["messages"][-1].content)

for week in state["learning_roadmap"]:
    print(f"\nSemana {week['week']} — {week['focus']}")
    for mod in week["modules"]:
        print(f"  Módulo {mod['module_number']}: {mod['name']} ({mod['difficulty']})")
        print(f"    Objetivo:  {mod['objective']}")
        print(f"    Recurso:   {mod['resource']}")

print(f"\nroadmap_complete: {state['roadmap_complete']}")
print(f"current_week:     {state['current_week']}")

langfuse.flush()
