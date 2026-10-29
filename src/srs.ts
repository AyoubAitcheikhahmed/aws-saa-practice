import type { Rating, SrsState } from './types';

const MINUTE = 60_000;
const DAY = 86_400_000;
const QUALITY: Record<Rating, number> = { again: 0, hard: 3, good: 4, easy: 5 };

export const newSrs = (): SrsState => ({ ease: 2.5, interval: 0, reps: 0, due: 0 });

/** SM-2 with a short relearning step for "again". */
export function review(s: SrsState, rating: Rating, now: number): SrsState {
  const q = QUALITY[rating];
  const ease = Math.max(1.3, s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  if (q < 3) return { ease, interval: 0, reps: 0, due: now + 10 * MINUTE };

  const reps = s.reps + 1;
  let interval: number;
  if (reps === 1) interval = rating === 'easy' ? 3 : 1;
  else if (reps === 2) interval = rating === 'easy' ? 6 : rating === 'hard' ? 2 : 4;
  else interval = Math.max(1, Math.round(s.interval * ease * (rating === 'hard' ? 0.7 : rating === 'easy' ? 1.3 : 1)));
  return { ease, interval, reps, due: now + interval * DAY };
}

export function endOfToday(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Reviewed at least once and due by the end of today. */
export const isDue = (s: SrsState, now = Date.now()) => s.due > 0 && s.due <= endOfToday(now);
