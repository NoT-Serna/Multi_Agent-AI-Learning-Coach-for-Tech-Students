import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  writeBatch,
  getDocs,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { CalendarEvent } from '../types/calendar';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calendarRef(uid: string) {
  return collection(db, 'usuarios', uid, 'study_calendar');
}

// ─── subscribeToStudyCalendar ─────────────────────────────────────────────────

/**
 * Suscribe a la subcolección `usuarios/{uid}/study_calendar` con onSnapshot.
 * Llama a `onData` con la lista actualizada cada vez que Firestore cambia.
 * Retorna la función de unsubscribe.
 */
export function subscribeToStudyCalendar(
  uid: string,
  onData: (events: CalendarEvent[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    calendarRef(uid),
    (snapshot) => {
      const events: CalendarEvent[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<CalendarEvent, 'id'>),
      }));
      // Ordenar por fecha para facilitar el consumo en los componentes
      events.sort((a, b) => a.date.localeCompare(b.date));
      onData(events);
    },
    (error) => onError(error as Error),
  );
}

// ─── markEventCompleted ───────────────────────────────────────────────────────

/**
 * Marca un evento como completado en Firestore.
 * Lanza el error si la escritura falla para que el caller pueda hacer rollback visual.
 */
export async function markEventCompleted(uid: string, eventId: string): Promise<void> {
  const eventRef = doc(db, 'usuarios', uid, 'study_calendar', eventId);
  await updateDoc(eventRef, { completed: true });
}

// ─── toggleEventCompleted ─────────────────────────────────────────────────────

/**
 * Alterna el estado completed de un evento en Firestore.
 * Permite marcar y desmarcar desde la sección de Objetivos.
 */
export async function toggleEventCompleted(uid: string, eventId: string, completed: boolean): Promise<void> {
  const eventRef = doc(db, 'usuarios', uid, 'study_calendar', eventId);
  await updateDoc(eventRef, { completed });
}

// ─── saveStudyCalendar ────────────────────────────────────────────────────────

/**
 * Escribe (o sobreescribe) el Study_Calendar completo en Firestore usando writeBatch.
 * Preserva `completed=true` de eventos existentes en semanas completadas.
 * Reintenta hasta 3 veces con 2 segundos de intervalo ante fallos.
 */
export async function saveStudyCalendar(
  uid: string,
  events: Omit<CalendarEvent, 'id'>[],
  completedWeeks: number[],
): Promise<void> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const ref = calendarRef(uid);

      // Leer eventos existentes para preservar completed=true en semanas completadas
      const existingSnap = await getDocs(ref);
      const existingCompleted = new Map<string, boolean>();
      existingSnap.docs.forEach((d) => {
        const data = d.data() as Omit<CalendarEvent, 'id'>;
        if (completedWeeks.includes(data.week) && data.completed) {
          // Clave compuesta para identificar el evento: date + moduleNumber
          existingCompleted.set(`${data.date}__${data.moduleNumber}`, true);
        }
      });

      // Eliminar todos los documentos existentes y reescribir
      // Firestore batch tiene límite de 500 ops — para 4 semanas × 4 eventos = 16, es suficiente
      const batch = writeBatch(db);

      // Borrar existentes
      existingSnap.docs.forEach((d) => batch.delete(d.ref));

      // Escribir nuevos
      events.forEach((event) => {
        const newRef = doc(ref);
        const key = `${event.date}__${event.moduleNumber}`;
        const completed = existingCompleted.get(key) ?? event.completed ?? false;
        batch.set(newRef, { ...event, completed });
      });

      await batch.commit();
      return; // éxito
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        throw error;
      }
      await sleep(RETRY_DELAY_MS);
    }
  }
}
