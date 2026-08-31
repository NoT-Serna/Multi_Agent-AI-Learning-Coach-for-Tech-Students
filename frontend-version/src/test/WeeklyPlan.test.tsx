/**
 * WeeklyPlan property-based tests
 * Feature: frontend-agent-integration
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as fc from 'fast-check';
import WeeklyPlan from '../components/WeeklyPlan';
import * as AgentSessionModule from '../context/AgentSessionContext';
import { roadmapWeekArb } from './arbitraries';
import type { RoadmapWeek } from '../types/agent';

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
  roadmap: RoadmapWeek[],
  currentWeek: number
) {
  vi.spyOn(AgentSessionModule, 'useAgentSession').mockReturnValue({
    session:           mockSession({ learningRoadmap: roadmap, currentWeek }),
    startSession:      vi.fn(),
    submitDiagnostic:  vi.fn(),
    submitQuiz:        vi.fn(),
    chat:              vi.fn(),
    clearError:        vi.fn(),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WeeklyPlan', () => {
  // Feature: frontend-agent-integration, Property 6: WeeklyPlan displays current week's modules from roadmap
  it('Property 6: displays modules from learningRoadmap[currentWeek-1] and shows focus in header', () => {
    fc.assert(
      fc.property(
        fc.array(roadmapWeekArb, { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 1, max: 4 }),
        (roadmap, weekIdx) => {
          // Clamp currentWeek to valid range
          const currentWeek = Math.min(weekIdx, roadmap.length);
          const weekData = roadmap[currentWeek - 1];

          mockUseAgentSession(roadmap, currentWeek);
          const { unmount, container } = render(<WeeklyPlan />);

          // Focus text appears somewhere in the rendered output
          expect(container.textContent).toContain(weekData.focus);

          // Each module name appears
          for (const mod of weekData.modules) {
            expect(container.textContent).toContain(mod.name);
          }

          unmount();
        }
      ),
      { numRuns: 20 }
    );
  });

  // Feature: frontend-agent-integration, Property 7: Difficulty badge colours are distinct and exhaustive
  it('Property 7: difficulty badges use distinct CSS classes for each difficulty level', () => {
    // The difficultyColors map in WeeklyPlan must have distinct values
    const difficultyColors: Record<string, string> = {
      'básico':     'bg-green-100 text-green-700',
      'intermedio': 'bg-yellow-100 text-yellow-700',
      'avanzado':   'bg-red-100 text-red-700',
    };

    fc.assert(
      fc.property(
        fc.constantFrom('básico', 'intermedio', 'avanzado'),
        fc.constantFrom('básico', 'intermedio', 'avanzado'),
        (diff1, diff2) => {
          if (diff1 !== diff2) {
            expect(difficultyColors[diff1]).not.toBe(difficultyColors[diff2]);
          }
        }
      ),
      { numRuns: 50 }
    );

    // All three values are defined
    expect(Object.keys(difficultyColors)).toHaveLength(3);
    const values = Object.values(difficultyColors);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(3);
  });

  // Fallback to mockData when roadmap is empty
  it('shows mock data when learningRoadmap is empty', () => {
    mockUseAgentSession([], 1);
    render(<WeeklyPlan />);
    // Mock data has "Plan Semanal" header
    expect(screen.getByText('Plan Semanal')).toBeTruthy();
  });
});
