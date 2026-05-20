// ── Types that mirror the FastAPI response models ────────────────────────────

// Calendar event as returned by the backend (no `id` — Firestore assigns it)
export type CalendarEventPayload = {
  date: string;
  title: string;
  time: string;
  type: 'study' | 'review' | 'deadline';
  moduleNumber: number;
  week: number;
  completed: boolean;
  description?: string;
  duration_minutes?: number;
  resource_url?: string;
  resource_label?: string;
  tips?: string[];
  objective?: string;
  difficulty?: string;
  category?: string;
};

export interface DiagnosticQuestion {
  id: string;
  category: string;
  question: string;
  options: Record<'A' | 'B' | 'C' | 'D', string>;
  correct_answer: string;
  skill_tested: string;
}

export interface RoadmapModule {
  module_number: number;
  name: string;
  category: string;
  objective: string;
  resource: string;
  difficulty: 'básico' | 'intermedio' | 'avanzado';
}

export interface RoadmapWeek {
  week: number;
  focus: string;
  modules: RoadmapModule[];
}

export interface QuizQuestion {
  id: string;
  week: number;
  question: string;
  module_reference: string;
  options: Record<'A' | 'B' | 'C' | 'D', string>;
  correct_answer: string;
  skill_tested: string;
  justification?: string;
}

// ── API response shapes ───────────────────────────────────────────────────────

export interface StartSessionResponse {
  session_id: string;
  diagnostic_questions: DiagnosticQuestion[];
  message: string;
}

export interface DiagnosticSubmitResponse {
  skill_scores: Record<string, number>;
  strong_skills: string[];
  weak_skills: string[];
  learning_roadmap: RoadmapWeek[];
  study_calendar: CalendarEventPayload[];
  quiz_questions: QuizQuestion[];
  current_week: number;
  message: string;
}

export interface QuizSubmitResponse {
  quiz_passed: boolean | null;
  score: number;
  next_step: string;
  current_week: number;
  completed_weeks: number[];
  quiz_scores: Record<string, number>;
  learning_roadmap: RoadmapWeek[];
  study_calendar: CalendarEventPayload[];
  quiz_questions: QuizQuestion[];
  message: string;
}

export interface ChatResponse {
  response: string;
}

export interface SessionState {
  session_id: string;
  student_name: string | null;
  current_step: string | null;
  next_step: string | null;
  current_week: number | null;
  completed_weeks: number[];
  skill_scores: Record<string, number>;
  strong_skills: string[];
  weak_skills: string[];
  learning_roadmap: RoadmapWeek[];
  quiz_questions: QuizQuestion[];
  quiz_scores: Record<string, number>;
  quiz_passed: boolean | null;
  diagnostic_complete: boolean;
  roadmap_complete: boolean;
}
