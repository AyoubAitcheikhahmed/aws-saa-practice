import { withChoices } from './choices';
import { DOMAINS } from './tagging/tagging';
import type { Domain, ExamAnswer, ExamResult, ExamSession, Question } from './types';

export const FULL_EXAM = { count: 65, minutes: 130, accommodationMinutes: 30 };
export const PASS_SCALED = 720;

const sameLetters = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** true/false, or null when a free-text answer still needs self-grading. */
export function gradeAnswer(q: Question, ans: ExamAnswer | undefined): boolean | null {
  if (!ans || (ans.letters.length === 0 && !ans.freeText?.trim())) return false;
  if (ans.freeText !== undefined || q.correct.length === 0) return ans.selfGrade ?? null;
  return sameLetters(ans.letters, q.correct);
}

export const isAnswered = (ans: ExamAnswer | undefined) => !!ans && (ans.letters.length > 0 || !!ans.freeText?.trim());

/** The question as it was shown in an exam (with that exam's options), or as-is for older exams. */
export function examQuestion(q: Question | undefined, result: Pick<ExamResult, 'choices'>, id: number): Question | undefined {
  const c = result.choices?.[id];
  return q && c ? withChoices(q, c) : q;
}

/** Rough piecewise-linear mapping with 72% ≈ 720. Not AWS's real scaling. */
export function scaledScore(pct: number): number {
  const s = pct <= 0.72 ? 100 + (pct / 0.72) * 620 : 720 + ((pct - 0.72) / 0.28) * 280;
  return Math.round(Math.min(1000, Math.max(100, s)));
}

export interface ExamScore {
  correct: number;
  pending: number;
  total: number;
  pct: number;
  scaled: number;
  passed: boolean;
  perDomain: Record<Domain, { correct: number; total: number }>;
}

export function scoreExam(result: Pick<ExamResult, 'questionIds' | 'answers' | 'choices'>, byId: Map<number, Question>): ExamScore {
  const perDomain = Object.fromEntries(DOMAINS.map((d) => [d.id, { correct: 0, total: 0 }])) as ExamScore['perDomain'];
  let correct = 0;
  let pending = 0;
  let total = 0;
  for (const id of result.questionIds) {
    const q = examQuestion(byId.get(id), result, id);
    if (!q) continue;
    total++;
    perDomain[q.domain].total++;
    const g = gradeAnswer(q, result.answers[id]);
    if (g === null) pending++;
    if (g) {
      correct++;
      perDomain[q.domain].correct++;
    }
  }
  const pct = total ? correct / total : 0;
  const scaled = scaledScore(pct);
  return { correct, pending, total, pct, scaled, passed: scaled >= PASS_SCALED, perDomain };
}

export function newExamSession(
  kind: ExamSession['kind'],
  questionIds: number[],
  minutes: number,
  choices?: ExamSession['choices'],
): ExamSession {
  return {
    id: `exam-${Date.now()}`,
    kind,
    questionIds,
    choices,
    answers: {},
    flagged: [],
    guessed: [],
    timePerQ: {},
    durationMs: minutes * 60_000,
    elapsedMs: 0,
    currentIndex: 0,
    startedAt: Date.now(),
    reviewing: false,
  };
}

export function finishSession(s: ExamSession): ExamResult {
  return {
    id: s.id,
    kind: s.kind,
    date: Date.now(),
    questionIds: s.questionIds,
    answers: s.answers,
    flagged: s.flagged,
    guessed: s.guessed,
    timePerQ: s.timePerQ,
    durationMs: s.durationMs,
    timeUsedMs: Math.min(s.elapsedMs, s.durationMs),
    choices: s.choices,
  };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
