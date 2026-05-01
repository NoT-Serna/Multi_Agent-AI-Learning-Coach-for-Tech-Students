from langgraph.graph import StateGraph, END, START
from langgraph.checkpoint.memory import MemorySaver
from schemas.state import AgentState
from agents.chatbot_agent import chatbot_agent
from agents.diagnostic_agent import (
    collect_profile,
    generate_skills,
    generate_exam,
    evaluate_answers,
)
from agents.roadmap_agent import (
    generate_roadmap,
    adjust_roadmap,
)
from agents.quiz_agent import (
    generate_quiz,
    evaluate_quiz_answers,
)

# ─── Entry router ─────────────────────────────────────────────────────────────

def route_entry(state: AgentState) -> str:
    if state.get("roadmap_complete"):
        return "generate_quiz"
    if state.get("diagnostic_complete") and not state.get("roadmap_complete"):
        return "generate_roadmap"
    return "collect_profile"

# ─── Quiz router ──────────────────────────────────────────────────────────────

def route_after_quiz(state: AgentState) -> str:
    next_step = state.get("next_step")
    if next_step == "adjust_roadmap":
        return "adjust_roadmap"
    return END  # next_week, retry_quiz, completed — all handled by run_agent.py

# ─── Graph ────────────────────────────────────────────────────────────────────

graph = StateGraph(AgentState)

# Nodes
graph.add_node("collect_profile",       collect_profile)
graph.add_node("generate_skills",       generate_skills)
graph.add_node("generate_exam",         generate_exam)
graph.add_node("evaluate_answers",      evaluate_answers)
graph.add_node("generate_roadmap",      generate_roadmap)
graph.add_node("adjust_roadmap",        adjust_roadmap)
graph.add_node("generate_quiz",         generate_quiz)
graph.add_node("evaluate_quiz_answers", evaluate_quiz_answers)
graph.add_node("chatbot_agent",         chatbot_agent)
# chatbot_agent es un nodo lateral — sin aristas al flujo principal.
# Se invoca directamente por el cliente con app.update_state + app.invoke.

# Entry point
graph.add_conditional_edges(
    START,
    route_entry,
    {
        "collect_profile":  "collect_profile",
        "generate_roadmap": "generate_roadmap",
        "generate_quiz":    "generate_quiz",
    }
)

# Diagnostic flow
graph.add_edge("collect_profile", "generate_skills")
graph.add_edge("generate_skills", "generate_exam")
graph.add_edge("generate_exam",   "evaluate_answers")

graph.add_conditional_edges(
    "evaluate_answers",
    lambda state: "generate_roadmap" if state["diagnostic_complete"] else END
)

# Roadmap flow
graph.add_edge("generate_roadmap", "generate_quiz")
graph.add_edge("adjust_roadmap",   "generate_quiz")

# Quiz flow
graph.add_edge("generate_quiz", "evaluate_quiz_answers")

graph.add_conditional_edges(
    "evaluate_quiz_answers",
    route_after_quiz,
    {
        "adjust_roadmap": "adjust_roadmap",
        END:              END,
    }
)

app = graph.compile(
    interrupt_before=["evaluate_answers", "evaluate_quiz_answers"],
    checkpointer=MemorySaver()
)