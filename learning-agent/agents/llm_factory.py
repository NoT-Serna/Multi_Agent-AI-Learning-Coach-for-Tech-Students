import os

from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from langfuse.langchain import CallbackHandler


load_dotenv()


def build_llm():
    callbacks = []
    if os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"):
        callbacks.append(CallbackHandler())

    llm = ChatOllama(
        base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        model=os.getenv("OLLAMA_MODEL", "llama3.1:8b"),
        temperature=0,
        callbacks=callbacks,
    )
    return llm, llm.bind(format="json")
