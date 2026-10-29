import pairs from './confusedPairs.json';
import type { Question } from '../types';

export interface ConfusedPair {
  title: string;
  terms: string[];
  hint: string;
}

/** Pairs where at least two of the pair's terms appear in the question, answer or explanation. */
export function confusedPairsFor(q: Question): ConfusedPair[] {
  const haystack = `${q.text}\n${q.correctText}\n${q.explanation}\n${(q.options ?? []).map((o) => o.text).join('\n')}`.toLowerCase();
  return (pairs as ConfusedPair[])
    .map((p) => ({ p, hits: p.terms.filter((t) => haystack.includes(t.toLowerCase())).length }))
    .filter(({ hits }) => hits >= 2)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 2)
    .map(({ p }) => p);
}
