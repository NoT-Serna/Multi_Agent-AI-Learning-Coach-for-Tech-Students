from langgraph.graph import StateGraph, END, START
from langgraph.checkpoint.memory import MemorySaver
from schemas.state import AgentState
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

# ─── Router ───────────────────────────────────────────────────────────────────

def route_entry(state: AgentState) -> str:
    if state.get("diagnostic_complete") and not state.get("roadmap_complete"):
        return "generate_roadmap"
    if state.get("roadmap_complete"):
        return "quiz"
    return "collect_profile"

# ─── Graph ────────────────────────────────────────────────────────────────────

graph = StateGraph(AgentState)

# Nodes — no "router" node
graph.add_node("collect_profile",  collect_profile)
graph.add_node("generate_skills",  generate_skills)
graph.add_node("generate_exam",    generate_exam)
graph.add_node("evaluate_answers", evaluate_answers)
graph.add_node("generate_roadmap", generate_roadmap)
graph.add_node("adjust_roadmap",   adjust_roadmap)

# Entry point via conditional edge from START
graph.add_conditional_edges(
    START,
    route_entry,
    {
        "collect_profile":  "collect_profile",
        "generate_roadmap": "generate_roadmap",
        "quiz":             END,
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
graph.add_edge("generate_roadmap", END)
graph.add_edge("adjust_roadmap",   END)

app = graph.compile(
    interrupt_before=["evaluate_answers"],
    checkpointer=MemorySaver()
)