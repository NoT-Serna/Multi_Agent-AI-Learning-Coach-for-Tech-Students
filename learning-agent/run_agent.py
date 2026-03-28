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
    "student_name":         "Carlos",
    "student_id":           str(uuid.uuid4()),
    "user_background":      "sé un poco de Python, nunca he trabajado profesionalmente",
    "user_preferences":     "desarrollo web, automatización",
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
}

# ─── Config ────────────────────────────────────────────────────────────────────

langfuse_handler = CallbackHandler()

config = {
    "configurable": {"thread_id": "test-session-1"},
    "callbacks":    [langfuse_handler],
}

langfuse = get_client()

# ─── Helpers ───────────────────────────────────────────────────────────────────

def print_section(title: str):
    print("\n" + "=" * 60)
    print(title)
    print("=" * 60)

def print_roadmap(roadmap: list):
    for week in roadmap:
        print(f"\n  Semana {week['week']} — {week['focus']}")
        for mod in week["modules"]:
            print(f"    Módulo {mod['module_number']}: {mod['name']} ({mod['difficulty']})")
            print(f"      Objetivo: {mod['objective']}")
            print(f"      Recurso:  {mod['resource']}")

def print_quiz(questions: list):
    for i, q in enumerate(questions, 1):
        print(f"\n  {i}. [{q.get('module_reference', '')}] {q['question']}")
        for letter, option in q["options"].items():
            print(f"     {letter}) {option}")

# ─── Phase 1: generate diagnostic exam ────────────────────────────────────────

print_section("FASE 1 — Generando diagnóstico...")

state = app.invoke(initial_state, config=config)

print(state["messages"][-1].content)
print("\n--- Preguntas del diagnóstico ---")
for i, q in enumerate(state["diagnostic_questions"], 1):
    print(f"\n{i}. [{q['category']}] {q['question']}")
    for letter, option in q["options"].items():
        print(f"   {letter}) {option}")

# ─── Phase 2: evaluate diagnostic + generate roadmap + generate quiz ──────────

print_section("FASE 2 — Evaluando diagnóstico, generando roadmap y quiz...")

diagnostic_answers = [random.choice(["A", "B", "C", "D"]) for _ in state["diagnostic_questions"]]

app.update_state(config, {"diagnostic_answers": diagnostic_answers})
state = app.invoke(None, config=config)
# Runs: evaluate_answers → generate_roadmap → generate_quiz → PAUSE

print("\n--- Resultados del diagnóstico ---")
print(f"  skill_scores:  {state['skill_scores']}")
print(f"  strong_skills: {state['strong_skills']}")
print(f"  weak_skills:   {state['weak_skills']}")

print("\n--- Roadmap generado ---")
print_roadmap(state["learning_roadmap"])

print("\n--- Preguntas del quiz semana 1 ---")
print_quiz(state["quiz_questions"])

# ─── Phase 3: evaluate quiz answers ───────────────────────────────────────────

print_section("FASE 3 — Evaluando quiz semana 1...")

quiz_answers = [random.choice(["A", "B", "C", "D"]) for _ in state["quiz_questions"]]
print(f"Respuestas simuladas: {quiz_answers}")

app.update_state(config, {"quiz_answers": quiz_answers})
state = app.invoke(None, config=config)
# Runs: evaluate_quiz_answers → routes to next_step

print(state["messages"][-1].content)
print(f"\n  quiz_passed:   {state['quiz_passed']}")
print(f"  quiz_scores:   {state['quiz_scores']}")
print(f"  quiz_attempts: {state['quiz_attempts']}")
print(f"  next_step:     {state['next_step']}")

# ─── Phase 4: handle quiz result ──────────────────────────────────────────────

if state["next_step"] == "adjust_roadmap":
    print_section("FASE 4 — Ajustando roadmap por quiz fallido...")
    state = app.invoke(None, config=config)
    print(state["messages"][-1].content)
    print("\n--- Roadmap ajustado ---")
    print_roadmap(state["learning_roadmap"])
    print(f"\n  roadmap_adjusted: {state['roadmap_adjusted']}")

elif state["next_step"] == "retry_quiz":
    print_section("FASE 4 — Quiz no aprobado, puede reintentar")
    print(f"  Intentos usados: {state['quiz_attempts']}")
    print(f"  Máximo intentos: {state['max_attempts']}")

elif state["next_step"] == "next_week":
    print_section("FASE 4 — ¡Semana 1 aprobada!")
    print(f"  Avanza a la semana {state['current_week']}")
    print(f"  Semanas completadas: {state['completed_weeks']}")

elif state["next_step"] == "completed":
    print_section("FASE 4 — ¡Plan de estudio completado! 🏆")

# ─── Flush Langfuse ────────────────────────────────────────────────────────────

langfuse.flush()
