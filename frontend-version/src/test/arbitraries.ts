import * as fc from 'fast-check';

// ── Shared arbitraries for property-based tests ───────────────────────────────

// Use minLength: 3 to avoid whitespace-only strings that break getByText queries
const nonEmptyStr = fc.string({ minLength: 3, maxLength: 20 }).filter((s) => s.trim().length > 0);

export const optionsArb = fc.record({
  A: nonEmptyStr,
  B: nonEmptyStr,
  C: nonEmptyStr,
  D: nonEmptyStr,
});

export const diagnosticQuestionArb = fc.record({
  id: fc.uuid(),
  category: nonEmptyStr,
  question: nonEmptyStr,
  options: optionsArb,
  correct_answer: fc.constantFrom('A', 'B', 'C', 'D') as fc.Arbitrary<'A' | 'B' | 'C' | 'D'>,
  skill_tested: nonEmptyStr,
});

export const roadmapModuleArb = fc.record({
  module_number: fc.integer({ min: 1, max: 100 }),
  name: nonEmptyStr,
  category: nonEmptyStr,
  objective: nonEmptyStr,
  resource: nonEmptyStr,
  difficulty: fc.constantFrom('básico', 'intermedio', 'avanzado') as fc.Arbitrary<'básico' | 'intermedio' | 'avanzado'>,
});

export const roadmapWeekArb = fc.record({
  week: fc.integer({ min: 1, max: 52 }),
  focus: nonEmptyStr,
  modules: fc.array(roadmapModuleArb, { minLength: 1, maxLength: 5 }),
});

export const quizQuestionArb = fc.record({
  id: fc.uuid(),
  week: fc.integer({ min: 1, max: 52 }),
  question: nonEmptyStr,
  module_reference: nonEmptyStr,
  options: optionsArb,
  correct_answer: fc.constantFrom('A', 'B', 'C', 'D') as fc.Arbitrary<'A' | 'B' | 'C' | 'D'>,
  skill_tested: nonEmptyStr,
});
