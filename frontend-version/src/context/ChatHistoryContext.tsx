/**
 * ChatHistoryContext.tsx
 *
 * Manages the chat history in memory and its synchronization with Firestore.
 * Provides `ChatHistoryProvider` and the `useChatHistory` hook.
 *
 * Behavior:
 * - `cargarHistorial(uid)`: idempotent — if `historyLoaded === true`, does nothing.
 *   Otherwise loads from Firestore via `leerHistorialChat`, sets `messages`, and
 *   marks `historyLoaded = true`.
 * - `agregarMensaje(uid, mensaje)`: optimistically adds the message to memory
 *   immediately, then persists it via `guardarMensaje`. On error, keeps the
 *   message in memory and logs the error (Req 3.3).
 *
 * Validates: Requirements 2.2, 2.3, 2.6, 3.3, 3.4
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { leerHistorialChat, guardarMensaje } from '../services/persistenceService';
import type { MensajeChat } from '../types/persistence';

// ── Context value interface ───────────────────────────────────────────────────

interface ChatHistoryContextValue {
  /** In-memory array of chat messages, ordered by timestamp ascending. */
  messages: MensajeChat[];

  /** True while the initial Firestore load is in progress. */
  loadingHistory: boolean;

  /**
   * True once the history has been loaded from Firestore in this browser
   * session. Subsequent calls to `cargarHistorial` are no-ops (Req 2.3).
   */
  historyLoaded: boolean;

  /**
   * Loads the full chat history from Firestore for the given `uid`.
   * Idempotent: if `historyLoaded === true`, returns immediately without
   * making a Firestore call (Req 2.3).
   */
  cargarHistorial(uid: string): Promise<void>;

  /**
   * Adds `mensaje` to the in-memory `messages` array immediately (optimistic),
   * then persists it to Firestore. On Firestore error, the message stays in
   * memory and the error is logged (Req 3.3).
   */
  agregarMensaje(uid: string, mensaje: MensajeChat): Promise<void>;
}

// ── Context creation ──────────────────────────────────────────────────────────

const ChatHistoryContext = createContext<ChatHistoryContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

interface ChatHistoryProviderProps {
  children: ReactNode;
}

/**
 * Wraps the component tree with the `ChatHistoryContext` provider.
 * Mount this once near the root of the app (e.g. in `App.tsx`).
 */
export function ChatHistoryProvider({ children }: ChatHistoryProviderProps) {
  // Initial state: empty history, not loading, not yet loaded.
  const [messages, setMessages] = useState<MensajeChat[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  /**
   * Loads the chat history from Firestore.
   * - If `historyLoaded === true`, returns immediately (idempotent — Req 2.3).
   * - Sets `loadingHistory = true` while the request is in flight (Req 2.6).
   * - On success: stores the messages and marks `historyLoaded = true`.
   * - On error: resets `loadingHistory = false`, keeps `messages = []`, and
   *   logs the error. The UI should show an empty chat (Req 3.4).
   */
  const cargarHistorial = useCallback(async (uid: string): Promise<void> => {
    // Idempotency guard — Req 2.3
    if (historyLoaded) {
      return;
    }

    setLoadingHistory(true);

    try {
      const historial = await leerHistorialChat(uid);
      setMessages(historial);
      setHistoryLoaded(true);
    } catch (error) {
      console.error('[ChatHistoryContext] Error loading chat history:', error);
      setMessages([]);
      // historyLoaded stays false so the caller can retry if desired.
    } finally {
      setLoadingHistory(false);
    }
  }, [historyLoaded]);

  /**
   * Adds a message to the in-memory list immediately (optimistic update),
   * then persists it to Firestore. If Firestore fails, the message remains
   * visible in the UI — it is never removed (Req 3.3).
   */
  const agregarMensaje = useCallback(
    async (uid: string, mensaje: MensajeChat): Promise<void> => {
      // Optimistic update — add to memory first so the UI is responsive.
      setMessages((prev) => [...prev, mensaje]);

      try {
        await guardarMensaje(uid, {
          role: mensaje.role,
          content: mensaje.content,
          timestamp: mensaje.timestamp,
        });
      } catch (error) {
        // Log the error but keep the message in memory (Req 3.3).
        console.error('[ChatHistoryContext] Error saving message to Firestore:', error);
      }
    },
    [],
  );

  const value: ChatHistoryContextValue = {
    messages,
    loadingHistory,
    historyLoaded,
    cargarHistorial,
    agregarMensaje,
  };

  return (
    <ChatHistoryContext.Provider value={value}>
      {children}
    </ChatHistoryContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns the `ChatHistoryContextValue` for the nearest `ChatHistoryProvider`.
 * Throws if called outside of a `ChatHistoryProvider`.
 */
export function useChatHistory(): ChatHistoryContextValue {
  const ctx = useContext(ChatHistoryContext);

  if (ctx === null) {
    throw new Error(
      'useChatHistory must be used within a ChatHistoryProvider. ' +
        'Make sure <ChatHistoryProvider> wraps the component tree.',
    );
  }

  return ctx;
}
