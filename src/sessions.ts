import { DOMAINS } from './tagging/tagging';
import { getProgress } from './storage/store';
import { isDue } from './srs';
import { weakestTags } from './stats';
import type { AppData, Domain, Question } from './types';

export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const isWeak = (data: AppData, id: number) => {
  const p = getProgress(data, id);
  return p.wrong > 0 || p.guessed > 0 || p.lastResult === 'wrong' || p.lastResult === 'guessed';
};

export type QuestionFilter = 'all' | 'due' | 'mistakes' | 'unseen' | 'starred' | 'weak';

export interface Criteria {
  filter?: QuestionFilter;
  tag?: string | null;
  domain?: Domain | null;
  ids?: number[] | null;
}

export function filterQuestions(questions: Question[], data: AppData, c: Criteria): Question[] {
  const now = Date.now();
  const idSet = c.ids ? new Set(c.ids) : null;
  return questions.filter((q) => {
    if (idSet && !idSet.has(q.id)) return false;
    if (c.tag && !q.tags.includes(c.tag)) return false;
    if (c.domain && q.domain !== c.domain) return false;
    const p = getProgress(data, q.id);
    switch (c.filter ?? 'all') {
      case 'due':
        return isDue(p.srs, now);
      case 'mistakes':
        return p.wrong > 0;
      case 'weak':
        return isWeak(data, q.id);
      case 'unseen':
        return p.seen === 0;
      case 'starred':
        return p.starred;
      default:
        return true;
    }
  });
}

/** ~50% due SRS cards, ~30% weakest tags, ~20% unseen; topped up randomly. */
export function smartSession(questions: Question[], data: AppData, size = 20): number[] {
  const picked = new Set<number>();
  const take = (pool: Question[], n: number) => {
    for (const q of shuffle(pool)) {
      if (n <= 0) break;
      if (!picked.has(q.id)) {
        picked.add(q.id);
        n--;
      }
    }
  };
  const due = filterQuestions(questions, data, { filter: 'due' }).sort(
    (a, b) => getProgress(data, a.id).srs.due - getProgress(data, b.id).srs.due,
  );
  for (const q of due.slice(0, Math.round(size * 0.5))) picked.add(q.id);

  const weakTags = new Set(weakestTags(questions, data).slice(0, 5).map((t) => t.tag));
  take(
    questions.filter((q) => q.tags.some((t) => weakTags.has(t))),
    Math.round(size * 0.8) - picked.size,
  );
  take(filterQuestions(questions, data, { filter: 'unseen' }), size - picked.size);
  take(questions, size - picked.size);
  return shuffle([...picked]);
}

/** Draws `count` questions weighted by the SAA-C03 domain percentages (renormalised to the chosen domains). */
export function drawExamQuestions(pool: Question[], count: number, domains: Domain[] = DOMAINS.map((d) => d.id)): number[] {
  const chosen = DOMAINS.filter((d) => domains.includes(d.id));
  const totalWeight = chosen.reduce((s, d) => s + d.weight, 0);
  const raw = chosen.map((d) => ({ id: d.id, exact: (count * d.weight) / totalWeight }));
  const quotas = raw.map((r) => ({ id: r.id, n: Math.floor(r.exact + 1e-9) }));
  // Largest-remainder rounding so quotas sum exactly to `count`.
  const order = raw.map((r, i) => ({ i, rem: r.exact - quotas[i].n })).sort((a, b) => b.rem - a.rem);
  for (let k = 0, left = count - quotas.reduce((s, q) => s + q.n, 0); left > 0; k++, left--) quotas[order[k % order.length].i].n++;
  const picked = new Set<number>();
  for (const { id, n } of quotas) {
    for (const q of shuffle(pool.filter((q) => q.domain === id)).slice(0, n)) picked.add(q.id);
  }
  // Top up if a domain doesn't have enough questions.
  for (const q of shuffle(pool)) {
    if (picked.size >= count) break;
    picked.add(q.id);
  }
  return shuffle([...picked]);
}
