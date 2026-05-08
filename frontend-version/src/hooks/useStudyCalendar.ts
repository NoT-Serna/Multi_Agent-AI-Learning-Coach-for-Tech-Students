import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
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
 * Usa onAuthStateChanged para esperar a que Firebase resuelva el estado de
 * autenticación antes de intentar leer Firestore. Esto evita el error de
 * "No se pudo cargar" cuando auth.currentUser aún es null al montar.
 *
 * - Mientras Firebase resuelve auth o Firestore carga: loading=true
 * - Al recibir datos: loading=false, events=[...], error=null
 * - Si Firestore falla: loading=false, events=[], error=<Error>
 * - Si no hay usuario autenticado: loading=false, events=[], error=null
 * - retry() cancela la suscripción actual y crea una nueva
 */
export function useStudyCalendar(): UseStudyCalendarResult {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true); // true hasta que auth resuelva
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const calendarUnsubRef = useRef<Unsubscribe | null>(null);

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    // Cancelar suscripción al calendario anterior si existe
    if (calendarUnsubRef.current) {
      calendarUnsubRef.current();
      calendarUnsubRef.current = null;
    }

    setLoading(true);
    setError(null);

    // Esperar a que Firebase Auth resuelva el estado del usuario
    const authUnsub = onAuthStateChanged(auth, (user) => {
      // Cancelar suscripción anterior al calendario si el usuario cambió
      if (calendarUnsubRef.current) {
        calendarUnsubRef.current();
        calendarUnsubRef.current = null;
      }

      if (!user) {
        // No autenticado: limpiar y no intentar leer Firestore
        setEvents([]);
        setLoading(false);
        setError(null);
        return;
      }

      // Usuario autenticado: suscribir al calendario
      const calendarUnsub = subscribeToStudyCalendar(
        user.uid,
        (newEvents) => {
          setEvents(newEvents);
          setLoading(false);
          setError(null);
        },
        (err) => {
          // Si Firestore rechaza por permisos o la subcolección no existe aún,
          // tratarlo como calendario vacío en lugar de mostrar error al usuario.
          const code = (err as any)?.code as string | undefined;
          if (code === 'permission-denied' || code === 'not-found') {
            setEvents([]);
            setLoading(false);
            setError(null);
          } else {
            setError(err);
            setLoading(false);
          }
        },
      );

      calendarUnsubRef.current = calendarUnsub;
    });

    return () => {
      authUnsub();
      if (calendarUnsubRef.current) {
        calendarUnsubRef.current();
        calendarUnsubRef.current = null;
      }
    };
  }, [retryCount]);

  return { events, loading, error, retry };
}
