/**
 * Unit Tests — Task 6.1
 * Spec: session-isolation-bugs
 *
 * Tests for `resetChatHistory()` in `ChatHistoryContext.tsx`.
 *
 * Validates: Requirements 2.4, 2.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/persistenceService', () => ({
  leerHistorialChat: vi.fn(),
  guardarMensaje: vi.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { leerHistorialChat, guardarMensaje } from '../services/persistenceService';
import { ChatHistoryProvider, useChatHistory } from '../context/ChatHistoryContext';
import type { MensajeChat } from '../types/persistence';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockedLeerHistorialChat = vi.mocked(leerHistorialChat);
const mockedGuardarMensaje = vi.mocked(guardarMensaje);

// ── Helpers ───────────────────────────────────────────────────────────────────

function ChatHistoryWrapper({ children }: { children: ReactNode }) {
  return <ChatHistoryProvider>{children}</ChatHistoryProvider>;
}

function makeMessage(id: string, content: string): MensajeChat {
  return {
    id,
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resetChatHistory() — resets all three state fields (Req 2.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test 6.1-a: resetChatHistory() sets messages = [] after messages were loaded.
   *
   * Validates: Requirement 2.4
   */
  it('sets messages to [] after history was loaded', async () => {
    const uid = 'user-a';
    const loadedMessages = [
      makeMessage('msg-1', 'Hello'),
      makeMessage('msg-2', 'World'),
      makeMessage('msg-3', 'Foo'),
    ];

    mockedLeerHistorialChat.mockResolvedValue(loadedMessages);

    const { result } = renderHook(() => useChatHistory(), {
      wrapper: ChatHistoryWrapper,
    });

    // Load history so messages is non-empty
    await act(async () => {
      await result.current.cargarHistorial(uid);
    });

    expect(result.current.messages).toHaveLength(3);

    // Reset
    act(() => {
      result.current.resetChatHistory();
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.messages).toEqual([]);
  });

  /**
   * Test 6.1-b: resetChatHistory() sets historyLoaded = false.
   *
   * Validates: Requirement 2.4
   */
  it('sets historyLoaded to false after history was loaded', async () => {
    const uid = 'user-b';
    mockedLeerHistorialChat.mockResolvedValue([makeMessage('msg-1', 'Hi')]);

    const { result } = renderHook(() => useChatHistory(), {
      wrapper: ChatHistoryWrapper,
    });

    await act(async () => {
      await result.current.cargarHistorial(uid);
    });

    expect(result.current.historyLoaded).toBe(true);

    act(() => {
      result.current.resetChatHistory();
    });

    expect(result.current.historyLoaded).toBe(false);
  });

  /**
   * Test 6.1-c: resetChatHistory() sets loadingHistory = false.
   *
   * Validates: Requirement 2.4
   */
  it('sets loadingHistory to false', async () => {
    const uid = 'user-c';
    mockedLeerHistorialChat.mockResolvedValue([]);

    const { result } = renderHook(() => useChatHistory(), {
      wrapper: ChatHistoryWrapper,
    });

    await act(async () => {
      await result.current.cargarHistorial(uid);
    });

    // loadingHistory should already be false after load completes,
    // but reset must also guarantee it is false.
    act(() => {
      result.current.resetChatHistory();
    });

    expect(result.current.loadingHistory).toBe(false);
  });

  /**
   * Test 6.1-d: resetChatHistory() resets all three fields simultaneously
   * to their initial empty values.
   *
   * Validates: Requirement 2.4
   */
  it('resets all three fields to initial empty values in one call', async () => {
    const uid = 'user-d';
    const messages = Array.from({ length: 5 }, (_, i) =>
      makeMessage(`msg-${i}`, `Content ${i}`)
    );

    mockedLeerHistorialChat.mockResolvedValue(messages);
    mockedGuardarMensaje.mockResolvedValue(undefined);

    const { result } = renderHook(() => useChatHistory(), {
      wrapper: ChatHistoryWrapper,
    });

    // Load history and add an extra message via agregarMensaje
    await act(async () => {
      await result.current.cargarHistorial(uid);
    });

    await act(async () => {
      await result.current.agregarMensaje(uid, makeMessage('msg-extra', 'Extra'));
    });

    // Verify non-empty state before reset
    expect(result.current.messages.length).toBeGreaterThan(0);
    expect(result.current.historyLoaded).toBe(true);
    expect(result.current.loadingHistory).toBe(false);

    // Reset
    act(() => {
      result.current.resetChatHistory();
    });

    // All three fields must be at initial empty values
    expect(result.current.messages).toEqual([]);
    expect(result.current.historyLoaded).toBe(false);
    expect(result.current.loadingHistory).toBe(false);
  });

  /**
   * Test 6.1-e: resetChatHistory() on a fresh (never-loaded) provider
   * is a no-op — all fields stay at their initial values.
   *
   * Validates: Requirement 2.4
   */
  it('is safe to call on a fresh provider (no-op on already-empty state)', () => {
    const { result } = renderHook(() => useChatHistory(), {
      wrapper: ChatHistoryWrapper,
    });

    // Initial state
    expect(result.current.messages).toEqual([]);
    expect(result.current.historyLoaded).toBe(false);
    expect(result.current.loadingHistory).toBe(false);

    // Reset on already-empty state
    act(() => {
      result.current.resetChatHistory();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.historyLoaded).toBe(false);
    expect(result.current.loadingHistory).toBe(false);
  });
});

describe('resetChatHistory() — clears idempotency guard so cargarHistorial performs a fresh load (Req 2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test 6.1-f: After resetChatHistory(), cargarHistorial(uid) performs a
   * fresh Firestore load instead of returning immediately.
   *
   * This is the core of Requirement 2.5: the next user's cargarHistorial call
   * must not be blocked by the previous user's historyLoaded = true guard.
   *
   * Validates: Requirement 2.5
   */
  it('cargarHistorial performs a fresh Firestore load after resetChatHistory()', async () => {
    const uidA = 'user-a-fresh';
    const uidB = 'user-b-fresh';

    const userAMessages = [
      makeMessage('a-1', 'User A message 1'),
      makeMessage('a-2', 'User A message 2'),
    ];
    const userBMessages = [
      makeMessage('b-1', 'User B message 1'),
    ];

    mockedLeerHistorialChat.mockImplementation(async (uid: string) => {
      if (uid === uidA) return userAMessages;
      if (uid === uidB) return userBMessages;
      return [];
    });

    const { result } = renderHook(() => useChatHistory(), {
      wrapper: ChatHistoryWrapper,
    });

    // Step 1: Load User A's history
    await act(async () => {
      await result.current.cargarHistorial(uidA);
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.historyLoaded).toBe(true);
    // leerHistorialChat called once for User A
    expect(mockedLeerHistorialChat).toHaveBeenCalledTimes(1);

    // Step 2: Reset (simulates logout)
    act(() => {
      result.current.resetChatHistory();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.historyLoaded).toBe(false);

    // Step 3: Load User B's history — must NOT be blocked by idempotency guard
    await act(async () => {
      await result.current.cargarHistorial(uidB);
    });

    // leerHistorialChat must have been called a second time (for User B)
    expect(mockedLeerHistorialChat).toHaveBeenCalledTimes(2);
    expect(mockedLeerHistorialChat).toHaveBeenLastCalledWith(uidB);

    // User B's messages must be loaded (not User A's)
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('User B message 1');
    expect(result.current.historyLoaded).toBe(true);
  });

  /**
   * Test 6.1-g: Without resetChatHistory(), cargarHistorial(uidB) is blocked
   * by the idempotency guard and User A's messages remain visible.
   *
   * This test documents the bug condition (isBugCondition_2) and confirms
   * that resetChatHistory() is the correct fix.
   *
   * Validates: Requirement 2.5
   */
  it('without resetChatHistory(), cargarHistorial is blocked and previous messages remain (bug condition)', async () => {
    const uidA = 'user-a-bug';
    const uidB = 'user-b-bug';

    const userAMessages = [
      makeMessage('a-1', 'User A message 1'),
      makeMessage('a-2', 'User A message 2'),
      makeMessage('a-3', 'User A message 3'),
    ];

    mockedLeerHistorialChat.mockImplementation(async (uid: string) => {
      if (uid === uidA) return userAMessages;
      return [];
    });

    const { result } = renderHook(() => useChatHistory(), {
      wrapper: ChatHistoryWrapper,
    });

    // Load User A's history
    await act(async () => {
      await result.current.cargarHistorial(uidA);
    });

    expect(result.current.messages).toHaveLength(3);
    expect(result.current.historyLoaded).toBe(true);

    // Simulate logout WITHOUT calling resetChatHistory (bug condition)
    // historyLoaded stays true — cargarHistorial(uidB) will be a no-op

    await act(async () => {
      await result.current.cargarHistorial(uidB);
    });

    // leerHistorialChat was NOT called again (idempotency guard blocked it)
    expect(mockedLeerHistorialChat).toHaveBeenCalledTimes(1);

    // User A's messages are still visible — this is the bug
    expect(result.current.messages).toHaveLength(3);
    expect(result.current.historyLoaded).toBe(true);
  });

  /**
   * Test 6.1-h: resetChatHistory() can be called multiple times safely
   * (idempotent reset).
   *
   * Validates: Requirement 2.4
   */
  it('can be called multiple times without side effects (idempotent reset)', async () => {
    const uid = 'user-multi-reset';
    mockedLeerHistorialChat.mockResolvedValue([
      makeMessage('m-1', 'Message 1'),
    ]);

    const { result } = renderHook(() => useChatHistory(), {
      wrapper: ChatHistoryWrapper,
    });

    await act(async () => {
      await result.current.cargarHistorial(uid);
    });

    expect(result.current.messages).toHaveLength(1);

    // Call reset three times in a row
    act(() => {
      result.current.resetChatHistory();
      result.current.resetChatHistory();
      result.current.resetChatHistory();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.historyLoaded).toBe(false);
    expect(result.current.loadingHistory).toBe(false);
  });

  /**
   * Test 6.1-i: After resetChatHistory(), cargarHistorial loads the correct
   * messages for the same uid (not just a different uid).
   *
   * Validates: Requirement 2.5
   */
  it('cargarHistorial reloads from Firestore for the same uid after reset', async () => {
    const uid = 'user-same-uid';

    const firstLoad = [makeMessage('v1-msg', 'First load message')];
    const secondLoad = [
      makeMessage('v2-msg-1', 'Second load message 1'),
      makeMessage('v2-msg-2', 'Second load message 2'),
    ];

    // First call returns firstLoad, second call returns secondLoad
    mockedLeerHistorialChat
      .mockResolvedValueOnce(firstLoad)
      .mockResolvedValueOnce(secondLoad);

    const { result } = renderHook(() => useChatHistory(), {
      wrapper: ChatHistoryWrapper,
    });

    // First load
    await act(async () => {
      await result.current.cargarHistorial(uid);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(mockedLeerHistorialChat).toHaveBeenCalledTimes(1);

    // Reset
    act(() => {
      result.current.resetChatHistory();
    });

    // Second load (same uid, but fresh after reset)
    await act(async () => {
      await result.current.cargarHistorial(uid);
    });

    expect(mockedLeerHistorialChat).toHaveBeenCalledTimes(2);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].content).toBe('Second load message 1');
  });
});
