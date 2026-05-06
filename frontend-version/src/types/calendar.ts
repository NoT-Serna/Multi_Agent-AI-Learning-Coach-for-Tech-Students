/**
 * Representa un evento del calendario de estudio generado por el agente.
 * El campo `id` corresponde al ID del documento en Firestore (string).
 */
export interface CalendarEvent {
  id: string;
  date: string;         // YYYY-MM-DD
  title: string;
  time: string;         // HH:MM
  type: 'study' | 'review' | 'deadline';
  moduleNumber: number; // 0 para eventos de tipo review
  week: number;         // 1–4
  completed: boolean;
}
