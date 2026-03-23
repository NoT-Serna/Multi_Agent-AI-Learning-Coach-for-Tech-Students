from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from schemas.state import AgentState
from agents.diagnostic_agent import (
    collect_profile,
    generate_skills,
    generate_exam,
    evaluate_answers,
)

from agents.roadmap_agent import roadmap_template

graph = StateGraph(AgentState)

#-------------------------------------------------------------
#DIAGNOSTIC AGENT

#Nodes
graph.add_node("collect_profile", collect_profile)
graph.add_node("generate_skills", generate_skills)
graph.add_node("generate_exam", generate_exam)
graph.add_node("evaluate_answers", evaluate_answers)
graph.add_node("roadmap", roadmap_template)



#Entry Point
graph.set_entry_point("collect_profile")

#Edges
graph.add_edge("collect_profile", "generate_skills")
graph.add_edge("generate_skills", "generate_exam")
graph.add_edge("generate_exam", "evaluate_answers")

graph.add_conditional_edges("evaluate_answers", lambda state: "roadmap" if state["diagnostic_complete"] else END)

app = graph.compile(
    interrupt_before=["evaluate_answers"],
    checkpointer=MemorySaver())
