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

El proyecto tiene dos procesos que deben correr en paralelo: el **agente (backend)** y el **frontend**. Abre dos terminales.

### Terminal 1 — Agente (FastAPI)

```bash
# 1. Crear y activar entorno virtual (solo la primera vez)
python -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows

# 2. Instalar dependencias (solo la primera vez)
pip install -r requirements.txt

# 3. Configurar variables de entorno del agente
#    Edita learning-agent/.env con los valores correctos (ver sección más abajo)

# 4. Arrancar la API
cd learning-agent
uvicorn api:api --host 0.0.0.0 --port 8006 --reload
```

La API queda disponible en `http://localhost:8006`.  
Puedes verificar que está activa en `http://localhost:8006/health`.

### Terminal 2 — Frontend (Vite)

```bash
# 1. Instalar dependencias (solo la primera vez)
cd frontend-version
npm install

# 2. Arrancar el servidor de desarrollo
npm run dev
```

La app queda disponible en `http://localhost:5173`.

---

## Variables de entorno

### Agente — `learning-agent/.env`

```env
# URL del servidor Ollama (por defecto local)
OLLAMA_BASE_URL=http://localhost:11434

# Modelo a usar
OLLAMA_MODEL=llama3.2:3b

# Ruta al archivo de credenciales de Firebase Admin SDK
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json

# Observabilidad con Langfuse (opcional — omitir si no se usa)
LANGFUSE_PUBLIC_KEY=tu_clave_publica
LANGFUSE_SECRET_KEY=tu_clave_secreta
```

> El archivo `serviceAccountKey.json` debe colocarse dentro de `learning-agent/`. Se obtiene desde la consola de Firebase → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.

### Frontend — `frontend-version/.env.local` (opcional)

Por defecto el frontend apunta al agente en `http://localhost:8006`. Si necesitas cambiar la URL:

```env
VITE_API_URL=http://localhost:8006
```

La configuración de Firebase ya está incluida en `src/services/firebase.ts`.

---

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
