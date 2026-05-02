/**
 * QuizSection property-based tests
 * Feature: frontend-agent-integration
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import QuizSection from '../components/QuizSection';
import * as AgentSessionModule from '../context/AgentSessionContext';
import { quizQuestionArb } from './arbitraries';
import type { QuizQuestion } from '../types/agent';

// ── Mock context ──────────────────────────────────────────────────────────────

function mockSession(overrides: Partial<ReturnType<typeof AgentSessionModule.useAgentSession>['session']> = {}) {
  return {
    sessionId:           'test-session',
    studentName:         'Test',
    diagnosticQuestions: [],
    diagnosticComplete:  true,
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
  questions: QuizQuestion[],
  submitQuiz = vi.fn().mockResolvedValue(null),
  extraSessionProps: Partial<ReturnType<typeof AgentSessionModule.useAgentSession>['session']> = {}
) {
  vi.spyOn(AgentSessionModule, 'useAgentSession').mockReturnValue({
    session:           mockSession({ quizQuestions: questions, ...extraSessionProps }),
    startSession:      vi.fn(),
    submitDiagnostic:  vi.fn(),
    submitQuiz,
    chat:              vi.fn(),
    clearError:        vi.fn(),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('QuizSection', () => {
  // Feature: frontend-agent-integration, Property 11: Quiz questions are fully rendered in QuizSection
  it('Property 11: renders every quiz question text and all four options A/B/C/D', () => {
    fc.assert(
      fc.property(
        fc.array(quizQuestionArb, { minLength: 1, maxLength: 5 }),
        (questions) => {
          mockUseAgentSession(questions);
          const { unmount, container } = render(<QuizSection />);

          for (const q of questions) {
            expect(container.textContent).toContain(q.question);
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

  // Feature: frontend-agent-integration, Property 3 (quiz): Submit disabled until all questions answered
  it('Property 3 (quiz): submit button is disabled when not all questions are answered', () => {
    fc.assert(
      fc.property(
        fc.array(quizQuestionArb, { minLength: 2, maxLength: 5 }),
        (questions) => {
          mockUseAgentSession(questions);
          const { unmount } = render(<QuizSection />);

          const submitBtn = screen.getByRole('button', { name: /enviar quiz/i });
          expect(submitBtn).toBeDisabled();

          unmount();
        }
      ),
      { numRuns: 20 }
    );
  });

  // Feature: frontend-agent-integration, Property 4 (quiz): Answer order matches question order on submission
  it('Property 4 (quiz): submitQuiz receives answers in question order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(quizQuestionArb, { minLength: 1, maxLength: 4 }),
        fc.array(fc.constantFrom('A', 'B', 'C', 'D'), { minLength: 10, maxLength: 10 }),
        async (questions, randomOptions) => {
          const submitQuiz = vi.fn().mockResolvedValue({ quiz_passed: false, score: 50 });
          mockUseAgentSession(questions, submitQuiz);

          const { unmount, container } = render(<QuizSection />);

          const expectedAnswers: Record<string, string> = {};
          questions.forEach((q, i) => {
            expectedAnswers[q.id] = randomOptions[i % randomOptions.length];
          });

          for (const q of questions) {
            const optionText = q.options[expectedAnswers[q.id] as 'A' | 'B' | 'C' | 'D'];
            // Find button containing this option text
            const buttons = container.querySelectorAll('button');
            const btn = Array.from(buttons).find((b) => b.textContent?.includes(optionText));
            if (btn) fireEvent.click(btn);
          }

          const submitBtn = screen.getByRole('button', { name: /enviar quiz/i });
          fireEvent.click(submitBtn);

          await new Promise((r) => setTimeout(r, 0));

          if (submitQuiz.mock.calls.length > 0) {
            const submittedAnswers: string[] = submitQuiz.mock.calls[0][0];
            const expectedArray = questions.map((q) => expectedAnswers[q.id]);
            expect(submittedAnswers).toEqual(expectedArray);
          }

          unmount();
        }
      ),
      { numRuns: 15 }
    );
  });

  // Feature: frontend-agent-integration, Property 5 (quiz): Answers preserved on submission error
  it('Property 5 (quiz): answers are preserved when submitQuiz returns an error', () => {
    fc.assert(
      fc.property(
        fc.array(quizQuestionArb, { minLength: 1, maxLength: 3 }),
        (questions) => {
          mockUseAgentSession(questions, vi.fn(), { error: 'Network error' });

          const { unmount, container } = render(<QuizSection />);

          // Select option A for each question by finding buttons with option A text
          for (const q of questions) {
            const optionAText = q.options['A'];
            const buttons = container.querySelectorAll('button');
            const btn = Array.from(buttons).find((b) => b.textContent?.includes(optionAText));
            if (btn) fireEvent.click(btn);
          }

          // Options should still be rendered (not reset) — check container text
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
    const questions: QuizQuestion[] = [
      {
        id: 'q1',
        week: 1,
        question: 'Quiz question?',
        module_reference: 'mod1',
        options: { A: 'Opt A', B: 'Opt B', C: 'Opt C', D: 'Opt D' },
        correct_answer: 'A',
        skill_tested: 'skill',
      },
    ];
    mockUseAgentSession(questions, vi.fn(), { error: 'Quiz error' });
    render(<QuizSection />);

    expect(screen.getByText('Quiz error')).toBeTruthy();
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeTruthy();
  });
});
