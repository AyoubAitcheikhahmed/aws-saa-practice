import { DOMAINS } from './tagging/tagging';
import { getProgress } from './storage/store';
import { isDue } from './srs';
import type { AppData, Domain, Question } from './types';

export const EXAM_DATE = new Date('2026-11-30T09:00:00');
const DAY = 86_400_000;

export interface Accuracy {
  attempts: number;
  /** Correct and not guessed. */
  solid: number;
  accuracy: number | null;
  questions: number;
  seenQuestions: number;
}

function accumulate(qs: Question[], data: AppData): Accuracy {
  let attempts = 0;
  let solid = 0;
  let seenQuestions = 0;
  for (const q of qs) {
    const p = getProgress(data, q.id);
    attempts += p.seen;
    solid += p.correct - p.guessed;
    if (p.seen > 0) seenQuestions++;
  }
  return { attempts, solid, accuracy: attempts ? solid / attempts : null, questions: qs.length, seenQuestions };
}

export function domainStats(questions: Question[], data: AppData): Record<Domain, Accuracy> {
  return Object.fromEntries(DOMAINS.map((d) => [d.id, accumulate(questions.filter((q) => q.domain === d.id), data)])) as Record<
    Domain,
    Accuracy
  >;
}

export function tagStats(questions: Question[], data: AppData): ({ tag: string } & Accuracy)[] {
  const byTag = new Map<string, Question[]>();
  for (const q of questions) for (const t of q.tags) byTag.set(t, [...(byTag.get(t) ?? []), q]);
  return [...byTag].map(([tag, qs]) => ({ tag, ...accumulate(qs, data) }));
}

/** Weakest first; topics never attempted are excluded. */
export function weakestTags(questions: Question[], data: AppData, minAttempts = 2) {
  return tagStats(questions, data)
    .filter((t) => t.accuracy !== null && t.attempts >= minAttempts)
    .sort((a, b) => a.accuracy! - b.accuracy! || b.attempts - a.attempts);
}

export function mostFailed(questions: Question[], data: AppData, limit = 15) {
  return questions
    .map((q) => ({ q, p: getProgress(data, q.id) }))
    .filter(({ p }) => p.wrong + p.guessed > 0)
    .sort((a, b) => b.p.wrong + b.p.guessed * 0.5 - (a.p.wrong + a.p.guessed * 0.5) || b.p.wrong - a.p.wrong)
    .slice(0, limit);
}

export function coverage(questions: Question[], data: AppData) {
  const seen = questions.filter((q) => getProgress(data, q.id).seen > 0).length;
  return { seen, total: questions.length, ratio: questions.length ? seen / questions.length : 0 };
}

export function dueCount(questions: Question[], data: AppData, now = Date.now()) {
  return questions.filter((q) => isDue(getProgress(data, q.id).srs, now)).length;
}

export function daysUntilExam(now = Date.now()) {
  return Math.max(0, Math.ceil((EXAM_DATE.getTime() - now) / DAY));
}

export function streak(activity: Record<string, number>, now = Date.now()): number {
  const key = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  let t = now;
  if (!activity[key(t)]) t -= DAY; // today not started yet doesn't break the streak
  let n = 0;
  while (activity[key(t)]) {
    n++;
    t -= DAY;
  }
  return n;
}

export function readiness(questions: Question[], data: AppData, recentExamPcts: number[]) {
  const ds = domainStats(questions, data);
  const domainAcc = DOMAINS.reduce((sum, d) => sum + d.weight * (ds[d.id].accuracy ?? 0), 0);
  const recent = recentExamPcts.slice(-3);
  const examAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : domainAcc;
  const cov = coverage(questions, data).ratio;
  const score = Math.round(100 * (0.45 * domainAcc + 0.35 * examAvg + 0.2 * cov));
  return { score, domainAcc, examAvg, coverage: cov, hasExams: recent.length > 0 };
}
