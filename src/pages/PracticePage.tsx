import { useEffect, useMemo, useState } from 'react';
import { buildChoices, withChoices } from '../choices';
import { useQuestionBank } from '../data/questionBank';
import { gradeAnswer } from '../exam';
import { navigate, type Route } from '../router';
import { filterQuestions, shuffle, smartSession, type QuestionFilter } from '../sessions';
import { getData, recordAnswers, useAppData } from '../storage/store';
import { ALL_TAGS, DOMAINS } from '../tagging/tagging';
import type { Domain, ExamAnswer } from '../types';
import {
  AnswerInput,
  AnswerReveal,
  emptyAnswer,
  GuessedToggle,
  NoteEditor,
  QuestionHeader,
  QuestionText,
  SelfGradeButtons,
  TagList,
} from '../components/question';
import { Button, Card, PageHeader, ProgressBar, Select, pct } from '../components/ui';

/** 'choice' = multiple choice with instant feedback, 'recall' = type your own answer and self-grade. */
export type PracticeMode = 'choice' | 'recall';

const MODE_INFO: Record<PracticeMode, { base: string; title: string; subtitle: string }> = {
  choice: { base: '/practice', title: 'Practice', subtitle: 'Pick an option and get instant feedback with the explanation.' },
  recall: {
    base: '/recall',
    title: 'Open Recall',
    subtitle: 'No options shown: write the answer from memory, reveal it, then grade yourself. Harder than the exam, and better for memorizing.',
  },
};

const FILTERS: { value: QuestionFilter; label: string }[] = [
  { value: 'all', label: 'All questions' },
  { value: 'due', label: 'Due for review' },
  { value: 'weak', label: 'Weak (wrong or guessed)' },
  { value: 'mistakes', label: 'Mistakes only' },
  { value: 'unseen', label: 'Never seen' },
  { value: 'starred', label: 'Starred' },
];

function PracticeSetup({ mode }: { mode: PracticeMode }) {
  const { questions } = useQuestionBank();
  const data = useAppData();
  const { base, title, subtitle } = MODE_INFO[mode];
  const [filter, setFilter] = useState<QuestionFilter>('all');
  const [tag, setTag] = useState('');
  const [domain, setDomain] = useState<Domain | ''>('');
  const [count, setCount] = useState('20');
  const available = filterQuestions(questions, data, { filter, tag: tag || null, domain: domain || null }).length;

  const start = () => {
    const p = new URLSearchParams({ filter, count });
    if (tag) p.set('tag', tag);
    if (domain) p.set('domain', domain);
    navigate(`${base}?${p}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Smart session">
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            20 questions picked for you: ~50% due reviews, ~30% from your weakest topics, ~20% never seen.
          </p>
          <Button onClick={() => navigate(`${base}?smart=1`)}>Start smart session</Button>
        </Card>
        <Card title="Custom session">
          <div className="grid gap-3 text-sm">
            <Select value={filter} onChange={setFilter} options={FILTERS} />
            <Select
              value={tag}
              onChange={setTag}
              options={[{ value: '', label: 'Any service / topic' }, ...ALL_TAGS.map((t) => ({ value: t, label: t }))]}
            />
            <Select<Domain | ''>
              value={domain}
              onChange={setDomain}
              options={[{ value: '', label: 'Any domain' }, ...DOMAINS.map((d) => ({ value: d.id, label: d.name }))]}
            />
            <Select
              value={count}
              onChange={setCount}
              options={['10', '20', '40', 'all'].map((v) => ({ value: v, label: v === 'all' ? 'All matching' : `${v} questions` }))}
            />
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{available} matching questions</span>
              <Button onClick={start} disabled={available === 0}>
                Start
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

interface Outcome {
  id: number;
  correct: boolean;
  guessed: boolean;
}

function PracticeSession({ queue, title, mode }: { queue: number[]; title: string; mode: PracticeMode }) {
  const { byId, questions } = useQuestionBank();
  const { base } = MODE_INFO[mode];
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const rawQ = byId.get(queue[index]);
  // New wrong options every time a question comes up, so you learn the answer rather than its position.
  const q = useMemo(() => (rawQ && mode === 'choice' ? withChoices(rawQ, buildChoices(rawQ, questions)) : rawQ), [rawQ, mode, questions]);
  const [answer, setAnswer] = useState<ExamAnswer>(emptyAnswer);
  const [recallText, setRecallText] = useState('');
  const [guessed, setGuessed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);
  const done = index >= queue.length;

  const canSubmit = !!q && (mode === 'recall' || answer.letters.length === q.requiredCount);

  const finish = (correct: boolean) => {
    if (!q) return;
    setResult(correct);
    recordAnswers([{ id: q.id, correct, guessed }]);
    setOutcomes((o) => [...o, { id: q.id, correct, guessed }]);
  };

  const submit = () => {
    if (!q || !canSubmit) return;
    setRevealed(true);
    if (mode === 'choice') finish(gradeAnswer(q, answer) === true);
  };

  const next = () => {
    setIndex(index + 1);
    setAnswer(emptyAnswer());
    setRecallText('');
    setGuessed(false);
    setRevealed(false);
    setResult(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const inTextarea = (e.target as HTMLElement).tagName === 'TEXTAREA';
      if (inTextarea && !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      if (!revealed) submit();
      else if (result !== null) next();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  if (done || !q) {
    const correct = outcomes.filter((o) => o.correct && !o.guessed).length;
    const mistakes = outcomes.filter((o) => !o.correct || o.guessed).map((o) => o.id);
    return (
      <div className="space-y-6">
        <PageHeader title="Session complete" subtitle={title} />
        <Card>
          <div className="mb-2 text-3xl font-bold">
            {correct} / {outcomes.length} solid
          </div>
          <ProgressBar value={outcomes.length ? correct / outcomes.length : 0} />
          <p className="mt-2 text-sm text-slate-500">Correct guesses are counted as weak and will come back sooner.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {mistakes.length > 0 && <Button onClick={() => navigate(`${base}?ids=${mistakes.join(',')}&title=Retry mistakes`)}>Retry {mistakes.length} weak</Button>}
            <Button variant="secondary" onClick={() => navigate(`${base}?smart=1`)}>
              New smart session
            </Button>
            <Button variant="ghost" onClick={() => navigate(base)}>
              Back
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const solid = outcomes.filter((o) => o.correct && !o.guessed).length;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">
          {MODE_INFO[mode].title} · {title}
        </span>
        <span className="text-slate-500">
          {outcomes.length ? `${pct(solid / outcomes.length)} solid · ` : ''}
          <a href={`#${base}`} className="hover:underline">
            End
          </a>
        </span>
      </div>
      <ProgressBar value={index / queue.length} tone="indigo" />
      <Card>
        <QuestionHeader q={q} index={index} total={queue.length} />
        <QuestionText q={q} />
        <div className="mt-4">
          {mode === 'choice' ? (
            <AnswerInput key={`${q.id}-${index}`} q={q} value={answer} onChange={setAnswer} disabled={revealed} reveal={revealed} />
          ) : (
            <div className="space-y-1">
              <label className="text-sm font-medium">Your answer</label>
              <textarea
                autoFocus
                value={recallText}
                disabled={revealed}
                onChange={(e) => setRecallText(e.target.value)}
                rows={3}
                placeholder={q.requiredCount > 1 ? `Name ${q.requiredCount} things, e.g. "SQS queue + Lambda trigger"` : 'e.g. "Gateway VPC endpoint for S3"'}
                className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
              <p className="text-xs text-slate-500">Ctrl/⌘ + Enter to reveal. Leave it empty if you have no idea.</p>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <GuessedToggle checked={guessed} onChange={setGuessed} disabled={result !== null} />
          {!revealed ? (
            <Button onClick={submit} disabled={!canSubmit}>
              {mode === 'recall' ? 'Reveal answer' : 'Check answer'} ↵
            </Button>
          ) : result !== null ? (
            <Button onClick={next}>{index + 1 < queue.length ? 'Next question' : 'Finish'} ↵</Button>
          ) : null}
        </div>
      </Card>

      {revealed && (
        <Card>
          {result === null ? (
            <div className="mb-4 space-y-3">
              <div className="rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-800">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">You wrote</div>
                <p className="whitespace-pre-wrap">{recallText.trim() || '(nothing)'}</p>
              </div>
              <SelfGradeButtons onGrade={finish} />
            </div>
          ) : (
            <div className={`mb-4 text-lg font-semibold ${result ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {result ? (guessed ? '✓ Correct (guessed, will be reviewed again)' : '✓ Correct') : '✗ Incorrect'}
            </div>
          )}
          <AnswerReveal q={q} showConfused={result === false} />
          <div className="mt-4 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <TagList tags={q.tags} />
            <NoteEditor key={q.id} id={q.id} />
          </div>
        </Card>
      )}
    </div>
  );
}

export function PracticePage({ route, mode = 'choice' }: { route: Route; mode?: PracticeMode }) {
  const { questions } = useQuestionBank();
  const p = route.params;
  const hasSession = p.has('smart') || p.has('ids') || p.has('filter') || p.has('tag') || p.has('domain');

  const [session] = useState(() => {
    if (!hasSession) return null;
    const data = getData();
    if (p.has('smart')) return { queue: smartSession(questions, data), title: 'Smart session' };
    const ids = p.get('ids')?.split(',').map(Number).filter(Number.isFinite) ?? null;
    const tag = p.get('tag');
    const domain = (p.get('domain') as Domain | null) ?? null;
    const filter = (p.get('filter') as QuestionFilter | null) ?? 'all';
    const matched = filterQuestions(questions, data, { filter, tag, domain, ids }).map((q) => q.id);
    const count = p.get('count');
    const queue = ids ? matched : shuffle(matched).slice(0, count && count !== 'all' ? Number(count) : tag ? 20 : matched.length);
    const title = p.get('title') ?? [tag, domain && DOMAINS.find((d) => d.id === domain)?.short, FILTERS.find((f) => f.value === filter)?.label].filter(Boolean).join(' · ');
    return { queue, title };
  });

  if (!session) return <PracticeSetup mode={mode} />;
  if (session.queue.length === 0) {
    return (
      <Card>
        <p className="mb-3">No questions match this selection.</p>
        <Button onClick={() => navigate(MODE_INFO[mode].base)}>Back</Button>
      </Card>
    );
  }
  return <PracticeSession queue={session.queue} title={session.title} mode={mode} />;
}
