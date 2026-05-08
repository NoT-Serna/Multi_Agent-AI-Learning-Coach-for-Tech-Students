/**
 * Representa un evento del calendario de estudio generado por el agente.
 * El campo `id` corresponde al ID del documento en Firestore (string).
 */
export interface CalendarEvent {
  id: string;
  date: string;              // YYYY-MM-DD
  title: string;
  time: string;              // HH:MM
  type: 'study' | 'review' | 'deadline';
  moduleNumber: number;      // 0 para eventos de tipo review
  week: number;              // 1–4
  completed: boolean;

  // Campos de recomendación diaria (generados por el LLM)
  description?: string;      // Qué estudiar ese día y por qué
  duration_minutes?: number; // Duración estimada en minutos
  resource_url?: string;     // URL del recurso principal
  resource_label?: string;   // Etiqueta legible del recurso
  tips?: string[];           // Consejos concretos para la sesión
  objective?: string;        // Objetivo del módulo
  difficulty?: string;       // básico | intermedio | avanzado
  category?: string;         // Categoría del diagnóstico que refuerza
}
