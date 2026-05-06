# CoachApp — Plataforma de Aprendizaje con IA

CoachApp es una plataforma educativa personalizada que combina un frontend web moderno con un agente de aprendizaje basado en LLM. El agente guía a estudiantes de programación a través de un plan de estudio adaptativo generado según su perfil y nivel de conocimiento.

---

## Estructura del repositorio

```
/
├── frontend-version/   # Aplicación web (React + TypeScript + Firebase)
└── learning-agent/     # Agente de aprendizaje (LangGraph + Ollama)
```

---

## Requisitos previos

### Para el frontend

- **Node.js** v18 o superior
- **npm** v9 o superior

### Para el agente

- **Python** 3.10 o superior
- **Ollama** instalado y corriendo localmente
  - Descarga: https://ollama.com/download
  - Modelo requerido: `llama3.1:8b`

```bash
# Descargar el modelo después de instalar Ollama
ollama pull llama3.1:8b
```

---

## Módulo 1: Frontend (`frontend-version/`)

### Instalación

```bash
cd frontend-version
npm install
```

### Ejecución

```bash
npm run dev       # Servidor de desarrollo en http://localhost:5173
npm run build     # Build de producción
npm run preview   # Vista previa del build
npm run lint      # Linting
```

### Variables de entorno

El frontend usa Firebase. La configuración ya está incluida en `src/services/firebase.ts` para el proyecto de desarrollo. Si necesitas apuntar a otro proyecto Firebase, actualiza los valores en ese archivo.

---

## Módulo 2: Agente de aprendizaje (`learning-agent/`)

### Instalación

```bash
# Desde la raíz del repositorio
pip install -r requirements.txt
```

> Se recomienda usar un entorno virtual:
> ```bash
> python -m venv .venv
> source .venv/bin/activate      # Linux / macOS
> .venv\Scripts\activate         # Windows
> pip install -r requirements.txt
> ```

### Variables de entorno

Crea un archivo `.env` dentro de `learning-agent/` con el siguiente contenido:

```env
# URL del servidor Ollama (por defecto local)
OLLAMA_BASE_URL=http://localhost:11434

# Modelo a usar
OLLAMA_MODEL=llama3.1:8b

# Observabilidad con Langfuse (opcional)
LANGFUSE_PUBLIC_KEY=tu_clave_publica
LANGFUSE_SECRET_KEY=tu_clave_secreta
```

Si no configuras las claves de Langfuse, la observabilidad simplemente se omite.

### Ejecución

Todos los comandos se ejecutan desde dentro de `learning-agent/`:

```bash
cd learning-agent
```

#### Flujo completo del agente (diagnóstico → roadmap → quiz)

Ejecuta todas las fases con respuestas simuladas. Útil para verificar que el grafo funciona de extremo a extremo.

```bash
python run_agent.py
```

#### Chatbot interactivo

Prueba el chatbot de forma interactiva. Tiene tres modos:

```bash
# Modo completo: genera diagnóstico y roadmap reales con Ollama (puede tardar)
python run_chatbot.py

# Modo rápido: usa un roadmap hardcodeado, sin llamar al LLM para el diagnóstico
python run_chatbot.py --quick

# Modo quiz: simula un quiz activo para verificar que el chatbot se bloquea correctamente
python run_chatbot.py --quiz-mode
```

---

## Flujo de usuario completo

```
1. El estudiante se registra en la app web (Firebase Auth)
2. Completa su perfil (nombre, intereses, experiencia)
3. El agente genera un examen de diagnóstico (20 preguntas MCQ)
4. El estudiante responde el diagnóstico
5. El agente evalúa y genera un roadmap personalizado de 4 semanas
6. Cada semana: el estudiante estudia los módulos y responde un quiz (5 preguntas)
7. Si aprueba (≥ 70%): avanza a la siguiente semana
8. Si falla y agota los 3 intentos: el roadmap se reajusta automáticamente
9. El chatbot está disponible en todo momento para consultas sobre el plan
   (excepto durante un quiz activo)
10. Al completar las 4 semanas: plan de estudio finalizado 🏆
```

---

## Estado actual del proyecto

| Módulo | Estado |
|---|---|
| Frontend (páginas y componentes) | ✅ Funcional |
| Autenticación y persistencia con Firebase | ✅ Funcional |
| Agente: diagnóstico → roadmap → quiz → ajuste | ✅ Funcional |
| Chatbot con contexto de aprendizaje | ✅ Funcional |
| Observabilidad con Langfuse | ✅ Opcional |
| Integración frontend ↔ agente | 🔄 Pendiente |
| Tests de propiedad con Hypothesis | 🔄 En progreso |

> El frontend actualmente usa datos mock. La integración con el agente está pendiente.
