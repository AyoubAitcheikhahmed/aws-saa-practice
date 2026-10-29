import { useEffect, useMemo, useState } from 'react';
import { useQuestionBank } from '../data/questionBank';
import { filterQuestions, shuffle, type QuestionFilter } from '../sessions';
import { getData, recordAnswers, updateProgress, useAppData } from '../storage/store';
import { ALL_TAGS, DOMAINS } from '../tagging/tagging';
import type { Domain, Rating } from '../types';
import { CorrectAnswer, NoteEditor, QuestionHeader, QuestionText, TagList } from '../components/question';
import { Button, Card, PageHeader, ProgressBar, Select, cx } from '../components/ui';

const RATINGS: { rating: Rating; label: string; key: string; className: string }[] = [
  { rating: 'again', label: 'Again', key: '1', className: 'bg-rose-600 hover:bg-rose-500' },
  { rating: 'hard', label: 'Hard', key: '2', className: 'bg-amber-600 hover:bg-amber-500' },
  { rating: 'good', label: 'Good', key: '3', className: 'bg-emerald-600 hover:bg-emerald-500' },
  { rating: 'easy', label: 'Easy', key: '4', className: 'bg-sky-600 hover:bg-sky-500' },
];

const NEW_PER_SESSION = 20;
type DeckFilter = QuestionFilter | 'study';

export function FlashcardsPage() {
  const { questions, byId } = useQuestionBank();
  const { settings } = useAppData();
  const [filter, setFilter] = useState<DeckFilter>('study');
  const [tag, setTag] = useState('');
  const [domain, setDomain] = useState<Domain | ''>('');
  const [shuffled, setShuffled] = useState(settings.shuffleFlashcards);
  const [seed, setSeed] = useState(0);

  // Read progress once per deck build so rating a card doesn't reshuffle the deck under you.
  const deck = useMemo(() => {
    const pick = (f: QuestionFilter) =>
      filterQuestions(questions, getData(), { filter: f, tag: tag || null, domain: domain || null }).map((q) => q.id);
    const order = (ids: number[]) => (shuffled ? shuffle(ids) : ids);
    if (filter === 'study') return [...order(pick('due')), ...order(pick('unseen')).slice(0, NEW_PER_SESSION)];
    return order(pick(filter));
  }, [questions, filter, tag, domain, shuffled, seed]);

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  useEffect(() => {
    setIndex(0);
    setFlipped(false);
    setReviewed(0);
  }, [deck]);

  const q = byId.get(deck[index]);

  const go = (delta: number) => {
    setIndex((i) => Math.max(0, Math.min(deck.length, i + delta)));
    setFlipped(false);
  };

  const rate = (rating: Rating) => {
    if (!q || !flipped) return;
    recordAnswers([{ id: q.id, correct: rating !== 'again', guessed: rating === 'hard', rating }]);
    setReviewed((n) => n + 1);
    go(1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tagName = (e.target as HTMLElement).tagName;
      if (tagName === 'TEXTAREA' || tagName === 'INPUT' || tagName === 'SELECT') return;
      if (e.key === ' ') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key.toLowerCase() === 's' && q) updateProgress(q.id, (p) => ({ ...p, starred: !p.starred }));
      else {
        const r = RATINGS.find((x) => x.key === e.key);
        if (r) rate(r.rating);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Flashcards"
        subtitle="Space = flip · 1–4 = rate · ←/→ = navigate · S = star"
        actions={
          <>
            <Select
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'study', label: `Study (due + ${NEW_PER_SESSION} new)` },
                { value: 'due', label: 'Due today' },
                { value: 'all', label: 'All' },
                { value: 'weak', label: 'Weak' },
                { value: 'mistakes', label: 'Mistakes only' },
                { value: 'unseen', label: 'Never seen' },
                { value: 'starred', label: 'Starred' },
              ]}
            />
            <Select value={tag} onChange={setTag} options={[{ value: '', label: 'Any topic' }, ...ALL_TAGS.map((t) => ({ value: t, label: t }))]} />
            <Select<Domain | ''>
              value={domain}
              onChange={setDomain}
              options={[{ value: '', label: 'Any domain' }, ...DOMAINS.map((d) => ({ value: d.id, label: d.short }))]}
            />
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={shuffled} onChange={(e) => setShuffled(e.target.checked)} />
              Shuffle
            </label>
          </>
        }
      />

      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>
          Card {Math.min(index + 1, deck.length)} / {deck.length}
        </span>
        <span>· {reviewed} reviewed this session</span>
      </div>
      <ProgressBar value={deck.length ? index / deck.length : 0} tone="indigo" />

      {!q ? (
        <Card>
          <p className="mb-3">{deck.length === 0 ? 'No cards match these filters.' : 'Deck finished — nice work.'}</p>
          <div className="flex gap-2">
            {deck.length > 0 && <Button onClick={() => setSeed((s) => s + 1)}>{filter === 'study' ? 'Next batch' : 'Restart deck'}</Button>}
            {filter === 'due' && (
              <Button variant="secondary" onClick={() => setFilter('unseen')}>
                Learn new cards
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <>
          {/* Keyed by card so moving to the next card never animates the old answer into view. */}
          <div key={q.id} className="flip-scene mx-auto w-full max-w-2xl">
            <div
              className={cx('flip-card h-[26rem] cursor-pointer', flipped && 'is-flipped')}
              onClick={() => !window.getSelection()?.toString() && setFlipped((f) => !f)}
            >
              <section
                aria-hidden={flipped}
                className={cx(
                  'flip-face flex flex-col overflow-y-auto rounded-xl bg-white p-6 shadow-md ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800',
                  flipped && 'pointer-events-none',
                )}
              >
                <QuestionHeader q={q} />
                <QuestionText q={q} className="text-lg md:text-xl" />
                {q.options && (
                  <ul className="mt-4 space-y-2 text-base md:text-lg">
                    {q.options.map((o) => (
                      <li key={o.letter}>
                        <span className="font-semibold">{o.letter}.</span> {o.text}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-auto pt-6 text-center text-sm text-slate-400">↻ Click or press Space to flip</p>
              </section>
              <section
                aria-hidden={!flipped}
                className={cx(
                  'flip-face flip-back flex flex-col overflow-y-auto rounded-xl bg-indigo-50/60 p-6 shadow-md ring-1 ring-indigo-200 dark:bg-slate-900 dark:ring-indigo-900',
                  !flipped && 'pointer-events-none',
                )}
              >
                <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                  <span>Answer · #{q.id}</span>
                </div>
                <p className="mb-4 line-clamp-2 text-sm text-slate-500">{q.text}</p>
                <div className="rounded-lg bg-emerald-50 p-4 text-lg font-medium ring-1 ring-emerald-200 md:text-xl dark:bg-emerald-950/30 dark:ring-emerald-900">
                  <CorrectAnswer q={q} />
                </div>
                {q.explanation && (
                  <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-slate-700 dark:text-slate-300">{q.explanation}</p>
                )}
                <div className="mt-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                  <TagList tags={q.tags} />
                  <NoteEditor id={q.id} />
                </div>
                <p className="mt-auto pt-6 text-center text-sm text-slate-400">↻ Click to flip back</p>
              </section>
            </div>
          </div>
          <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => go(-1)} disabled={index === 0}>
              ← Prev
            </Button>
            {flipped ? (
              <div className="flex flex-wrap gap-2">
                {RATINGS.map((r) => (
                  <button
                    key={r.rating}
                    type="button"
                    onClick={() => rate(r.rating)}
                    className={cx('rounded-md px-4 py-2 text-sm font-medium text-white', r.className)}
                  >
                    {r.label} <span className="opacity-70">{r.key}</span>
                  </button>
                ))}
              </div>
            ) : (
              <Button onClick={() => setFlipped(true)}>Show answer (Space)</Button>
            )}
            <Button variant="ghost" onClick={() => go(1)}>
              Next →
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
