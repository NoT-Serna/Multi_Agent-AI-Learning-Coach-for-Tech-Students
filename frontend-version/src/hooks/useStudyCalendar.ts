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
 * @param diagnosticComplete - Pass `true` once the diagnostic is done so the
 *   hook knows the study_calendar subcollection exists. When `false` (default),
 *   the Firestore listener is skipped entirely, preventing the HTTP 400 /
 *   WebChannelConnection errors that Firestore emits when trying to listen on
 *   a subcollection that has never been written to.
 *
 * - Mientras Firebase resuelve auth o Firestore carga: loading=true
 * - Al recibir datos: loading=false, events=[...], error=null
 * - Si Firestore falla: loading=false, events=[], error=<Error>
 * - Si no hay usuario autenticado: loading=false, events=[], error=null
 * - retry() cancela la suscripción actual y crea una nueva
 */
export function useStudyCalendar(diagnosticComplete = false): UseStudyCalendarResult {
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

    // Skip the Firestore listener entirely if the diagnostic hasn't been
    // completed yet. The study_calendar subcollection doesn't exist for new
    // accounts, and opening a listener on a non-existent subcollection causes
    // HTTP 400 / WebChannelConnection errors in the browser console.
    if (!diagnosticComplete) {
      setEvents([]);
      setLoading(false);
      setError(null);
      return;
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
          // Treat any Firestore error on this subcollection as an empty calendar
          // rather than a hard error. Common cases for new accounts:
          //   - 'permission-denied': security rules not yet covering the subcollection
          //   - 'not-found': parent document or subcollection doesn't exist yet
          //   - 'invalid-argument' (HTTP 400): Firestore rejects the Listen stream
          //     when the subcollection has never been written to
          // In all these cases the user simply has no calendar yet, which is expected
          // before the diagnostic is completed.
          const code = (err as any)?.code as string | undefined;
          const silentCodes = ['permission-denied', 'not-found', 'invalid-argument', 'unavailable'];
          if (!code || silentCodes.includes(code)) {
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
  }, [retryCount, diagnosticComplete]);

  return { events, loading, error, retry };
}
