# run_chatbot.py
# Script para probar el chatbot de forma interactiva.
#
# Modos de uso:
#   1. Con roadmap ya generado (flujo completo):
#      python run_chatbot.py
#
#   2. Con estado mínimo hardcodeado (prueba rápida sin Ollama para el diagnóstico):
#      python run_chatbot.py --quick
#
#   3. Simular bloqueo durante quiz:
#      python run_chatbot.py --quiz-mode

import os
import sys
import uuid
import argparse
import random
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from graph.learning_graph import app
from agents.chatbot_agent import chatbot_agent

load_dotenv()

# ─── Config ───────────────────────────────────────────────────────────────────

THREAD_ID = f"chatbot-test-{uuid.uuid4()}"

config = {
    "configurable": {"thread_id": THREAD_ID},
}

# ─── Helpers ──────────────────────────────────────────────────────────────────

def print_section(title: str):
    print("\n" + "=" * 60)
    print(title)
    print("=" * 60)

# Estado en memoria para el chatbot (independiente del grafo principal)
_chat_state: dict = {}

def ask_chatbot(question: str) -> str:
    """
    Invoca chatbot_agent directamente sobre el estado en memoria,
    sin pasar por el grafo principal ni su checkpoint.
    """
    global _chat_state
    # Agregar la pregunta al historial de mensajes
    current_messages = list(_chat_state.get("messages", []))
    current_messages.append(HumanMessage(content=question))
    _chat_state = {**_chat_state, "messages": current_messages}

    # Invocar el nodo directamente (no app.invoke)
    result = chatbot_agent(_chat_state)

    # Actualizar el historial con la respuesta del agente
    _chat_state = {**_chat_state, "messages": result["messages"]}
    return result["messages"][-1].content

def chat_loop(state):
    """Bucle interactivo de chat."""
    global _chat_state
    _chat_state = state  # cargar el estado inicial en memoria

    student_name = state.get("student_name", "Estudiante")
    roadmap = state.get("learning_roadmap", [])
    quiz_active = bool(state.get("quiz_questions")) and state.get("quiz_passed") is None

    print_section(f"CHATBOT — Hola {student_name}!")

    if roadmap:
        print(f"  Tu roadmap tiene {len(roadmap)} semana(s).")
        print(f"  Semana actual: {state.get('current_week')}")
    else:
        print("  Aún no tienes roadmap generado.")

    if quiz_active:
        print("\n  ⚠️  QUIZ ACTIVO — el chatbot estará bloqueado para preguntas de contenido.")

    print("\n  Escribe tu pregunta o 'salir' para terminar.\n")

    while True:
        try:
            question = input("  Tú: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n  Hasta luego!")
            break

        if question.lower() in ("salir", "exit", "quit", "q"):
            print("  Hasta luego!")
            break

        if not question:
            continue

        print("\n  Chatbot: ", end="", flush=True)
        response = ask_chatbot(question)
        print(response)
        print()


# ─── Modo 1: Flujo completo (genera diagnóstico + roadmap con Ollama) ─────────

def run_full_flow():
    """Genera diagnóstico y roadmap reales antes de abrir el chat."""
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

    print_section("Generando diagnóstico y roadmap (esto puede tardar)...")
    state = app.invoke(initial_state, config=config)

    # Responder diagnóstico con respuestas aleatorias
    diagnostic_answers = [random.choice(["A", "B", "C", "D"]) for _ in state["diagnostic_questions"]]
    app.update_state(config, {"diagnostic_answers": diagnostic_answers})
    state = app.invoke(None, config=config)

    print(f"  ✅ Roadmap generado con {len(state['learning_roadmap'])} semanas.")
    print(f"  Fortalezas: {state['strong_skills']}")
    print(f"  Áreas a reforzar: {state['weak_skills']}")

    # Pasar el estado directamente al chat (sin volver a invocar el grafo)
    chat_loop(dict(state))


# ─── Modo 2: Estado mínimo hardcodeado (prueba rápida) ────────────────────────

def run_quick():
    """Inyecta un estado con roadmap hardcodeado para probar el chatbot sin generar diagnóstico."""
    quick_state = {
        "student_name":     "Carlos",
        "student_id":       str(uuid.uuid4()),
        "user_background":  "sé un poco de Python",
        "user_preferences": "desarrollo web",
        "diagnostic_questions": [],
        "diagnostic_answers":   [],
        "diagnostic_complete":  True,
        "skill_scores": {
            "Fundamentos de Programación": 80.0,
            "Lógica y Análisis":           55.0,
            "Datos y Sistemas":            40.0,
            "Razonamiento Computacional":  70.0,
        },
        "skills_by_category": {},
        "strong_skills": ["Fundamentos de Programación", "Razonamiento Computacional"],
        "weak_skills":   ["Lógica y Análisis", "Datos y Sistemas"],
        "learning_roadmap": [
            {
                "week": 1,
                "focus": "Fundamentos de Python",
                "modules": [
                    {
                        "module_number": 1,
                        "name": "Variables y tipos de datos",
                        "difficulty": "básico",
                        "objective": "Entender los tipos de datos en Python",
                        "resource": "https://docs.python.org/3/tutorial/introduction.html",
                    },
                    {
                        "module_number": 2,
                        "name": "Funciones y módulos",
                        "difficulty": "intermedio",
                        "objective": "Crear y usar funciones reutilizables",
                        "resource": "https://docs.python.org/3/tutorial/controlflow.html",
                    },
                ],
            },
            {
                "week": 2,
                "focus": "Estructuras de datos",
                "modules": [
                    {
                        "module_number": 3,
                        "name": "Listas y diccionarios",
                        "difficulty": "intermedio",
                        "objective": "Manipular colecciones de datos",
                        "resource": "https://docs.python.org/3/tutorial/datastructures.html",
                    },
                ],
            },
        ],
        "roadmap_adjusted":  False,
        "roadmap_complete":  False,
        "current_week":      1,
        "current_quiz_week": None,
        "completed_weeks":   [],
        "current_module":    None,
        "completed_modules": [],
        "quiz_questions":    [],
        "quiz_answers":      [],
        "quiz_scores":       {},
        "quiz_passed":       None,
        "quiz_attempts":     {},
        "max_attempts":      3,
        "current_step":      "generate_roadmap",
        "next_step":         "generate_quiz",
        "error_message":     None,
        "messages":          [],
    }

    # Pasar el estado directamente al chat (sin usar el grafo)
    print_section("Modo rápido — roadmap hardcodeado cargado ✅")
    chat_loop(quick_state)


# ─── Modo 3: Simular bloqueo durante quiz ─────────────────────────────────────

def run_quiz_mode():
    """Inyecta un estado con quiz activo para verificar el bloqueo del chatbot."""
    quiz_state = {
        "student_name":     "Carlos",
        "student_id":       str(uuid.uuid4()),
        "user_background":  "sé un poco de Python",
        "user_preferences": "desarrollo web",
        "diagnostic_questions": [],
        "diagnostic_answers":   [],
        "diagnostic_complete":  True,
        "skill_scores":         {"Fundamentos de Programación": 75.0},
        "skills_by_category":   {},
        "strong_skills":        ["Fundamentos de Programación"],
        "weak_skills":          [],
        "learning_roadmap": [
            {"week": 1, "focus": "Python básico", "modules": []},
        ],
        "roadmap_adjusted":  False,
        "roadmap_complete":  False,
        "current_week":      1,
        "current_quiz_week": 1,
        "completed_weeks":   [],
        "current_module":    None,
        "completed_modules": [],
        "quiz_questions": [
            {
                "id": "q1",
                "question": "¿Qué es una variable en Python?",
                "options": {"A": "Un tipo de dato", "B": "Un espacio de memoria", "C": "Una función", "D": "Un módulo"},
                "correct_answer": "B",
                "module_reference": "Módulo 1",
            }
        ],
        "quiz_answers":  [],
        "quiz_scores":   {},
        "quiz_passed":   None,          # ← quiz activo, sin resultado aún
        "quiz_attempts": {},
        "max_attempts":  3,
        "current_step":  "generate_quiz",
        "next_step":     "await_quiz_answers",  # ← Quiz_Mode activo
        "error_message": None,
        "messages":      [],
    }

    app.update_state(config, quiz_state)

    print_section("Modo quiz — el chatbot debe estar BLOQUEADO ⛔")
    print("  Cualquier pregunta debe recibir el mensaje de bloqueo.\n")
    chat_loop(quiz_state)


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prueba interactiva del chatbot de aprendizaje")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--quick",     action="store_true", help="Usar roadmap hardcodeado (sin generar diagnóstico)")
    group.add_argument("--quiz-mode", action="store_true", help="Simular estado con quiz activo (chatbot bloqueado)")
    args = parser.parse_args()

    if args.quick:
        run_quick()
    elif args.quiz_mode:
        run_quiz_mode()
    else:
        run_full_flow()
