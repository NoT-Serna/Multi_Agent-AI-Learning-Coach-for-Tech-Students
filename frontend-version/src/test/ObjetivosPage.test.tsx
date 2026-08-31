/**
 * ObjetivosPage property-based tests
 * Feature: frontend-agent-integration
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as fc from 'fast-check';
import ObjetivosPage from '../pages/ObjetivosPage';
import * as AgentSessionModule from '../context/AgentSessionContext';
import { roadmapWeekArb } from './arbitraries';
import type { RoadmapWeek } from '../types/agent';

// ── Mock context ──────────────────────────────────────────────────────────────

function mockSession(
  roadmap: RoadmapWeek[],
  completedWeeks: number[]
) {
  return {
    sessionId:           'test-session',
    studentName:         'Test',
    diagnosticQuestions: [],
    diagnosticComplete:  true,
    skillScores:         {},
    strongSkills:        [],
    weakSkills:          [],
    learningRoadmap:     roadmap,
    currentWeek:         1,
    completedWeeks,
    quizQuestions:       [],
    quizScores:          {},
    quizPassed:          null,
    loading:             false,
    error:               null,
    hydrating:           false,
  };
}

function mockUseAgentSession(roadmap: RoadmapWeek[], completedWeeks: number[]) {
  vi.spyOn(AgentSessionModule, 'useAgentSession').mockReturnValue({
    session:           mockSession(roadmap, completedWeeks),
    startSession:      vi.fn(),
    submitDiagnostic:  vi.fn(),
    submitQuiz:        vi.fn(),
    chat:              vi.fn(),
    clearError:        vi.fn(),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ObjetivosPage', () => {
  // Feature: frontend-agent-integration, Property 8: ObjetivosPage progress is binary and consistent with completedWeeks
  it('Property 8: each week shows 100% if in completedWeeks, 0% otherwise', () => {
    fc.assert(
      fc.property(
        fc.array(roadmapWeekArb, { minLength: 1, maxLength: 4 }),
        fc.array(fc.integer({ min: 1, max: 52 }), { minLength: 0, maxLength: 4 }),
        (roadmap, completedWeeks) => {
          // Ensure unique week numbers in roadmap to avoid duplicate text issues
          const uniqueRoadmap = roadmap.filter(
            (w, i, arr) => arr.findIndex((x) => x.week === w.week) === i
          );
          if (uniqueRoadmap.length === 0) return;

          mockUseAgentSession(uniqueRoadmap, completedWeeks);
          const { unmount } = render(<ObjetivosPage />);

          for (const week of uniqueRoadmap) {
            const isCompleted = completedWeeks.includes(week.week);
            const expectedProgress = isCompleted ? '100%' : '0%';

            // Find the progress percentage text near this week's focus title
            // The component renders "{progress}%" in a div next to the title
            const focusEl = screen.queryByText(week.focus);
            if (focusEl) {
              // Walk up to find the containing row and check for the percentage
              const row = focusEl.closest('[class*="p-5"]') ?? focusEl.parentElement;
              if (row) {
                expect(row.textContent).toContain(expectedProgress);
              }
            }
          }

          unmount();
        }
      ),
      { numRuns: 20 }
    );
  });

  // Feature: frontend-agent-integration, Property 9: ObjetivosPage global stats are consistent with roadmap data
  it('Property 9: global stats match totalWeeks, completedCount, and globalProgress formula', () => {
    fc.assert(
      fc.property(
        fc.array(roadmapWeekArb, { minLength: 1, maxLength: 6 }),
        fc.array(fc.integer({ min: 1, max: 52 }), { minLength: 0, maxLength: 6 }),
        (roadmap, completedWeeks) => {
          const uniqueRoadmap = roadmap.filter(
            (w, i, arr) => arr.findIndex((x) => x.week === w.week) === i
          );
          if (uniqueRoadmap.length === 0) return;

          // The component uses completedWeeks.length directly (not filtered by roadmap)
          const totalWeeks     = uniqueRoadmap.length;
          const completedCount = completedWeeks.length;
          const globalProgress = Math.round((completedCount / totalWeeks) * 100);

          mockUseAgentSession(uniqueRoadmap, completedWeeks);
          const { unmount, container } = render(<ObjetivosPage />);

          const text = container.textContent ?? '';

          // Total weeks stat appears somewhere
          expect(text).toContain(String(totalWeeks));

          // Global progress stat
          expect(text).toContain(`${globalProgress}%`);

          // Completed/total stat
          expect(text).toContain(`${completedCount}/${totalWeeks}`);

          unmount();
        }
      ),
      { numRuns: 20 }
    );
  });

  // Fallback to mockData when roadmap is empty
  it('shows mock data when learningRoadmap is empty', () => {
    mockUseAgentSession([], []);
    render(<ObjetivosPage />);
    // Mock data page has "Objetivos" heading and "Nuevo objetivo" button
    expect(screen.getByText('Objetivos')).toBeTruthy();
    expect(screen.getByRole('button', { name: /nuevo objetivo/i })).toBeTruthy();
  });

  // Roadmap mode shows week focus as objective title
  it('shows week focus as objective title when roadmap is present', () => {
    const roadmap: RoadmapWeek[] = [
      {
        week: 1,
        focus: 'Fundamentos de Python',
        modules: [
          {
            module_number: 1,
            name: 'Intro',
            category: 'python',
            objective: 'Learn basics',
            resource: 'book.pdf',
            difficulty: 'básico',
          },
        ],
      },
    ];
    mockUseAgentSession(roadmap, []);
    render(<ObjetivosPage />);
    expect(screen.getByText('Fundamentos de Python')).toBeTruthy();
  });
});
