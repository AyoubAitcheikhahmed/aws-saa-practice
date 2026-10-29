import type { Option, Question } from './types';

export interface Choices {
  options: Option[];
  correct: string[];
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
// Real SAA-C03 layout: 4 options for single answer, 5 for "choose two", 6 for "choose three".
const OPTION_COUNT: Record<number, number> = { 1: 4, 2: 5, 3: 6 };

export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The correct answer split per letter; letter is null when the source only has answer text. */
export function answerPieces(q: Question): { letter: string | null; text: string }[] {
  if (q.options) return q.correct.map((l) => ({ letter: l, text: q.options!.find((o) => o.letter === l)?.text ?? '' }));
  if (q.correct.length === 0) return [{ letter: null, text: q.correctText }];
  if (q.correct.length === 1) return [{ letter: q.correct[0], text: q.correctText }];
  const byLetter = new Map(
    q.correctText
      .split('\n')
      .map((l) => /^([A-F])\)\s*(.*)$/.exec(l))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => [m[1], m[2]] as const),
  );
  return q.correct.map((l) => ({ letter: l, text: byLetter.get(l) ?? '' }));
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));

function similarity(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / Math.max(1, a.size + b.size - inter);
}

interface PoolEntry {
  qid: number;
  text: string;
  words: Set<string>;
  tags: string[];
  domain: Question['domain'];
}

const poolCache = new WeakMap<Question[], PoolEntry[]>();

function getPool(all: Question[]): PoolEntry[] {
  let pool = poolCache.get(all);
  if (!pool) {
    pool = all.flatMap((q) =>
      answerPieces(q)
        .filter((p) => p.text.length >= 8)
        .map((p) => ({ qid: q.id, text: p.text, words: words(p.text), tags: q.tags, domain: q.domain })),
    );
    poolCache.set(all, pool);
  }
  return pool;
}

/**
 * Multiple-choice options for a question. Real options are used when the source has them; otherwise the
 * correct answer keeps its original letter and the other slots get correct answers from other questions
 * that share AWS services and have a similar length.
 */
export function buildChoices(q: Question, all: Question[], random: () => number = Math.random): Choices {
  if (q.options) return { options: q.options, correct: q.correct };

  const pieces = answerPieces(q);
  const highest = Math.max(-1, ...pieces.map((p) => (p.letter ? LETTERS.indexOf(p.letter) : -1)));
  const count = Math.min(6, Math.max(OPTION_COUNT[q.requiredCount] ?? 6, highest + 1, pieces.length + 2));

  const slots = new Map<string, string>();
  for (const p of pieces) {
    let letter = p.letter;
    if (!letter) {
      const free = LETTERS.slice(0, count).filter((l) => !slots.has(l));
      letter = free[Math.floor(random() * free.length)];
    }
    slots.set(letter, p.text);
  }
  const correct = [...slots.keys()].sort();

  const taken = pieces.map((p) => words(p.text));
  const avgLen = pieces.reduce((n, p) => n + p.text.length, 0) / pieces.length;
  const tagSet = new Set(q.tags);
  const ranked = getPool(all)
    .filter((e) => e.qid !== q.id)
    .map((e) => {
      const overlap = e.tags.filter((t) => tagSet.has(t)).length;
      const lengthPenalty = Math.abs(Math.log(e.text.length / avgLen));
      return { e, score: overlap * 3 + (e.domain === q.domain ? 1 : 0) - lengthPenalty * 2 + random() * 2.5 };
    })
    .sort((a, b) => b.score - a.score);

  const distractors: string[] = [];
  const needed = count - slots.size;
  for (const { e } of ranked) {
    if (distractors.length >= needed) break;
    if (taken.some((w) => similarity(w, e.words) > 0.55)) continue;
    distractors.push(e.text);
    taken.push(e.words);
  }

  const options: Option[] = LETTERS.slice(0, count).map((letter) => ({
    letter,
    text: slots.get(letter) ?? distractors.shift() ?? '—',
  }));
  return { options, correct };
}

export function withChoices(q: Question, c: Choices): Question {
  return { ...q, options: c.options, correct: c.correct, optionsGenerated: q.options === null };
}
