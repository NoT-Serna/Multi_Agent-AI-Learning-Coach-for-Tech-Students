/**
 * AgentSessionContext property-based tests
 * Feature: frontend-agent-integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { AgentSessionProvider, useAgentSession } from '../context/AgentSessionContext';
import { agentApi } from '../services/agentApi';
import type { ReactNode } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

vi.mock('../services/agentApi');

const mockedApi = vi.mocked(agentApi);

function makeSessionState(sessionId: string) {
  return {
    session_id:          sessionId,
    student_name:        'Test User',
    current_step:        null,
    next_step:           null,
    current_week:        1,
    completed_weeks:     [],
    skill_scores:        {},
    strong_skills:       [],
    weak_skills:         [],
    learning_roadmap:    [],
    quiz_questions:      [],
    quiz_scores:         {},
    quiz_passed:         null,
    diagnostic_complete: false,
    roadmap_complete:    false,
  };
}

// Minimal consumer component to expose session state
function SessionReader({ onSession }: { onSession: (s: ReturnType<typeof useAgentSession>) => void }) {
  const ctx = useAgentSession();
  onSession(ctx);
  return null;
}

function renderProvider(children: ReactNode) {
  return render(<AgentSessionProvider>{children}</AgentSessionProvider>);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentSessionContext', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  // Feature: frontend-agent-integration, Property 1: Session ID persistence round-trip
  it('Property 1: startSession writes sessionId to sessionStorage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (sessionId, studentName) => {
          sessionStorage.clear();

          mockedApi.startSession.mockResolvedValueOnce({
            session_id:           sessionId,
            diagnostic_questions: [],
            message:              '',
          });

          let capturedCtx: ReturnType<typeof useAgentSession> | null = null;

          await act(async () => {
            renderProvider(
              <SessionReader onSession={(ctx) => { capturedCtx = ctx; }} />
            );
          });

          await act(async () => {
            await capturedCtx!.startSession({
              student_name:     studentName,
              user_background:  'bg',
              user_preferences: 'pref',
            });
          });

          expect(sessionStorage.getItem('agentSessionId')).toBe(sessionId);
        }
      ),
      { numRuns: 20 }
    );
  });

  // Feature: frontend-agent-integration, Property 13: Rehydration calls getSession with stored sessionId
  it('Property 13: rehydration calls getSession with the stored sessionId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (sessionId) => {
          sessionStorage.clear();
          sessionStorage.setItem('agentSessionId', sessionId);

          mockedApi.getSession.mockResolvedValueOnce(makeSessionState(sessionId));

          await act(async () => {
            renderProvider(<div />);
          });

          expect(mockedApi.getSession).toHaveBeenCalledWith(sessionId);
        }
      ),
      { numRuns: 20 }
    );
  });

  // Feature: frontend-agent-integration, Property 14: Expired session clears sessionStorage
  it('Property 14: 404 from getSession clears sessionStorage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (sessionId) => {
          sessionStorage.clear();
          sessionStorage.setItem('agentSessionId', sessionId);

          mockedApi.getSession.mockRejectedValueOnce(
            new Error(`Session '${sessionId}' not found.`)
          );

          await act(async () => {
            renderProvider(<div />);
          });

          // Wait for the async effect to settle
          await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
          });

          expect(sessionStorage.getItem('agentSessionId')).toBeNull();
        }
      ),
      { numRuns: 20 }
    );
  });

  // No sessionStorage → getSession NOT called
  it('does not call getSession when sessionStorage is empty', async () => {
    sessionStorage.clear();

    await act(async () => {
      renderProvider(<div />);
    });

    expect(mockedApi.getSession).not.toHaveBeenCalled();
  });
});
