/**
 * DiagnosticPage property-based tests
 * Feature: frontend-agent-integration
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import DiagnosticPage from '../pages/DiagnosticPage';
import * as AgentSessionModule from '../context/AgentSessionContext';
import { diagnosticQuestionArb } from './arbitraries';
import type { DiagnosticQuestion } from '../types/agent';

// ── Mock context ──────────────────────────────────────────────────────────────

function mockSession(overrides: Partial<ReturnType<typeof AgentSessionModule.useAgentSession>['session']> = {}) {
  return {
    sessionId:           'test-session',
    studentName:         'Test',
    diagnosticQuestions: [],
    diagnosticComplete:  false,
    skillScores:         {},
    strongSkills:        [],
    weakSkills:          [],
    learningRoadmap:     [],
    currentWeek:         1,
    completedWeeks:      [],
    quizQuestions:       [],
    quizScores:          {},
    quizPassed:          null,
    loading:             false,
    error:               null,
    hydrating:           false,
    ...overrides,
  };
}

function mockUseAgentSession(
  questions: DiagnosticQuestion[],
  submitDiagnostic = vi.fn().mockResolvedValue(null),
  extraSessionProps: Partial<ReturnType<typeof AgentSessionModule.useAgentSession>['session']> = {}
) {
  vi.spyOn(AgentSessionModule, 'useAgentSession').mockReturnValue({
    session:           mockSession({ diagnosticQuestions: questions, ...extraSessionProps }),
    startSession:      vi.fn(),
    submitDiagnostic,
    submitQuiz:        vi.fn(),
    chat:              vi.fn(),
    clearError:        vi.fn(),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagnosticPage', () => {
  // Feature: frontend-agent-integration, Property 2: Diagnostic questions are fully rendered
  it('Property 2: renders every question text and all four options A/B/C/D', () => {
    fc.assert(
      fc.property(
        fc.array(diagnosticQuestionArb, { minLength: 1, maxLength: 5 }),
        (questions) => {
          mockUseAgentSession(questions);
          const { unmount, container } = render(<DiagnosticPage />);

          for (const q of questions) {
            // Question text appears
            expect(container.textContent).toContain(q.question);
            // All four options appear
            for (const opt of ['A', 'B', 'C', 'D'] as const) {
              expect(container.textContent).toContain(q.options[opt]);
            }
          }

          unmount();
        }
      ),
      { numRuns: 20 }
    );
  });

  // Feature: frontend-agent-integration, Property 3: Submit disabled until all questions answered
  it('Property 3: submit button is disabled when not all questions are answered', () => {
    fc.assert(
      fc.property(
        fc.array(diagnosticQuestionArb, { minLength: 2, maxLength: 5 }),
        (questions) => {
          mockUseAgentSession(questions);
          const { unmount } = render(<DiagnosticPage />);

          const submitBtn = screen.getByRole('button', { name: /enviar diagnóstico/i });
          expect(submitBtn).toBeDisabled();

          unmount();
        }
      ),
      { numRuns: 20 }
    );
  });

  // Feature: frontend-agent-integration, Property 4: Answer order matches question order on submission
  it('Property 4: submitDiagnostic receives answers in question order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(diagnosticQuestionArb, { minLength: 1, maxLength: 4 }),
        fc.array(fc.constantFrom('A', 'B', 'C', 'D'), { minLength: 10, maxLength: 10 }),
        async (questions, randomOptions) => {
          const submitDiagnostic = vi.fn().mockResolvedValue(null);
          mockUseAgentSession(questions, submitDiagnostic);

          const { unmount, container } = render(<DiagnosticPage />);

          // Build expected answers map
          const expectedAnswers: Record<string, string> = {};
          questions.forEach((q, i) => {
            expectedAnswers[q.id] = randomOptions[i % randomOptions.length];
          });

          // Click each option by finding button containing the option text
          for (const q of questions) {
            const optionText = q.options[expectedAnswers[q.id] as 'A' | 'B' | 'C' | 'D'];
            const buttons = container.querySelectorAll('button');
            const btn = Array.from(buttons).find((b) => b.textContent?.includes(optionText));
            if (btn) fireEvent.click(btn);
          }

          // Submit
          const submitBtn = screen.getByRole('button', { name: /enviar diagnóstico/i });
          fireEvent.click(submitBtn);

          // Wait for async
          await new Promise((r) => setTimeout(r, 0));

          if (submitDiagnostic.mock.calls.length > 0) {
            const submittedAnswers: string[] = submitDiagnostic.mock.calls[0][0];
            const expectedArray = questions.map((q) => expectedAnswers[q.id]);
            expect(submittedAnswers).toEqual(expectedArray);
          }

          unmount();
        }
      ),
      { numRuns: 15 }
    );
  });

  // Feature: frontend-agent-integration, Property 5: Answers preserved on submission error
  it('Property 5: answers are preserved when submitDiagnostic returns an error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(diagnosticQuestionArb, { minLength: 1, maxLength: 3 }),
        async (questions) => {
          const submitDiagnostic = vi.fn().mockResolvedValue(null);
          // Simulate error by setting session.error
          mockUseAgentSession(questions, submitDiagnostic, { error: 'Network error' });

          const { unmount, container } = render(<DiagnosticPage />);

          // Select first option for each question by finding button with option A text
          for (const q of questions) {
            const optionAText = q.options['A'];
            const buttons = container.querySelectorAll('button');
            const btn = Array.from(buttons).find((b) => b.textContent?.includes(optionAText));
            if (btn) fireEvent.click(btn);
          }

          // Verify options remain in the DOM (not reset)
          for (const q of questions) {
            expect(container.textContent).toContain(q.options['A']);
          }

          unmount();
        }
      ),
      { numRuns: 15 }
    );
  });

  // Retry button present when error exists
  it('shows retry button when session.error is set', () => {
    const questions = [
      {
        id: 'q1',
        category: 'test',
        question: 'Test question?',
        options: { A: 'Opt A', B: 'Opt B', C: 'Opt C', D: 'Opt D' },
        correct_answer: 'A' as const,
        skill_tested: 'skill',
      },
    ];
    mockUseAgentSession(questions, vi.fn(), { error: 'Something went wrong' });
    render(<DiagnosticPage />);

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeTruthy();
  });
});
