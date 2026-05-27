# CoachApp — Plataforma de Aprendizaje con IA

CoachApp es una plataforma educativa personalizada que combina un frontend web moderno con un agente de aprendizaje basado en LLM. El agente guía a estudiantes de programación a través de un plan de estudio adaptativo generado según su perfil y nivel de conocimiento.

---

## Estructura del repositorio

```
/
├── frontend-version/   # Aplicación web (React 19 + TypeScript + Vite + Firebase)
├── learning-agent/     # API del agente (FastAPI + LangGraph + Ollama)
└── requirements.txt    # Dependencias Python del agente
```

---

## Requisitos previos

### Frontend
- **Node.js** v18 o superior
- **npm** v9 o superior
- Docker

### Agente (backend)
- **Python** 3.10 o superior
- **Ollama** instalado y corriendo localmente
  - Descarga: https://ollama.com/download
  - Modelo requerido: `llama3.2:3b`

```bash
# Descargar el modelo después de instalar Ollama
ollama pull llama3.2:3b
```

---

## Ejecución completa del proyecto

El proyecto tiene dos procesos que deben correr en paralelo: el **agente (backend)** y el **frontend**. 
En la raíz del directorio realizar **docker-compose up --build** (para versiones diferentes el comando alterno es docker compose up --build)
Luego de ello se puede visualizar la app por medio de localhost:5173

-Para apagar los contenedores realizar **docker-compose down**
-Para encender sin reconstruir las imagenes realizar **docker-compose up**

## Flujo de usuario completo

```
1. El estudiante crea una cuenta en la app web (Firebase Auth)
2. Completa su perfil: nombre, intereses, cursos de interés
3. El agente genera un examen de diagnóstico (preguntas MCQ)
4. El estudiante responde el diagnóstico
5. El agente evalúa y genera un roadmap personalizado de 4 semanas
   + calendario de estudio + primer quiz
6. Cada semana: el estudiante estudia los módulos y responde un quiz
7. Si aprueba (≥ 70 %): avanza a la siguiente semana
8. Si falla y agota los 3 intentos: el roadmap se reajusta automáticamente
9. El chatbot está disponible en todo momento para consultas
10. Al completar las 4 semanas: plan de estudio finalizado 🏆
```

---

## Otros comandos útiles

### Frontend

```bash
cd frontend-version
npm run build          # Build de producción (tsc + vite build)
npm run preview        # Vista previa del build de producción
npm run lint           # ESLint
npm run test           # Tests unitarios (vitest --run)
npm run test:coverage  # Tests con cobertura
```

### Agente — scripts de prueba

Ejecutar desde dentro de `learning-agent/` con el entorno virtual activo:

```bash
# Flujo completo con respuestas simuladas (diagnóstico → roadmap → quiz)
python run_agent.py

# Chatbot interactivo — genera diagnóstico y roadmap reales con Ollama
python run_chatbot.py

# Chatbot rápido — usa roadmap hardcodeado, sin llamar al LLM para el diagnóstico
python run_chatbot.py --quick

# Chatbot en modo quiz — simula un quiz activo
python run_chatbot.py --quiz-mode
```

---

## Estado del proyecto

| Módulo | Estado |
|---|---|
| Frontend (páginas y componentes) | ✅ Funcional |
| Autenticación y persistencia con Firebase | ✅ Funcional |
| Agente: diagnóstico → roadmap → quiz → ajuste | ✅ Funcional |
| API FastAPI (integración frontend ↔ agente) | ✅ Funcional |
| Chatbot con contexto de aprendizaje | ✅ Funcional |
| Calendario de estudio generado por el agente | ✅ Funcional |
| Observabilidad con Langfuse | ✅ Opcional |
| Tests de propiedad con Hypothesis | 🔄 En progreso |
