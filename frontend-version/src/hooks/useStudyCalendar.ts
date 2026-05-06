import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../services/firebase';
import { subscribeToStudyCalendar } from '../services/calendarService';
import type { CalendarEvent } from '../types/calendar';
import type { Unsubscribe } from 'firebase/firestore';

interface UseStudyCalendarResult {
  events: CalendarEvent[];
  loading: boolean;
  error: Error | null;
  retry: () => void;
}

/**
 * Hook que suscribe al Study_Calendar del usuario autenticado desde Firestore.
 *
 * - Mientras carga: loading=true, events=[], error=null
 * - Al recibir datos: loading=false, events=[...], error=null
 * - Si Firestore falla: loading=false, events=[], error=<Error>
 * - Si no hay usuario autenticado: loading=false, events=[], error=null
 * - retry() cancela la suscripción actual y crea una nueva
 */
export function useStudyCalendar(): UseStudyCalendarResult {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  // Contador para forzar re-suscripción al llamar retry()
  const [retryCount, setRetryCount] = useState(0);
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;

    // Sin usuario autenticado: no intentar leer Firestore
    if (!uid) {
      setEvents([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = subscribeToStudyCalendar(
      uid,
      (newEvents) => {
        setEvents(newEvents);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );

    unsubscribeRef.current = unsub;

    return () => {
      unsub();
      unsubscribeRef.current = null;
    };
    // retryCount en las deps fuerza re-suscripción al llamar retry()
  }, [retryCount]);

  return { events, loading, error, retry };
}
