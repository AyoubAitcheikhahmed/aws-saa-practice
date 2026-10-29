import { useEffect, useMemo, useState } from 'react';
import { buildChoices } from '../choices';
import { useQuestionBank } from '../data/questionBank';
import {
  FULL_EXAM,
  PASS_SCALED,
  examQuestion,
  finishSession,
  formatDuration,
  gradeAnswer,
  isAnswered,
  newExamSession,
  scoreExam,
} from '../exam';
import { navigate, type Route } from '../router';
import { drawExamQuestions, filterQuestions } from '../sessions';
import { getData, recordAnswers, setData, useAppData, type AnswerRecord } from '../storage/store';
import { ALL_TAGS, DOMAINS, domainName } from '../tagging/tagging';
import type { Domain, ExamAnswer, ExamResult, ExamSession, Question } from '../types';
import { AnswerInput, AnswerReveal, emptyAnswer, GuessedToggle, NoteEditor, QuestionText, SelfGradeButtons } from '../components/question';
import { Badge, Button, Card, PageHeader, ProgressBar, Select, Stat, cx, pct } from '../components/ui';

function startExam(session: ExamSession) {
  setData((s) => ({ ...s, activeExam: session }));
  navigate('/exam');
}

function makeChoices(ids: number[], byId: Map<number, Question>, all: Question[]): NonNullable<ExamSession['choices']> {
  const choices: NonNullable<ExamSession['choices']> = {};
  for (const id of ids) {
    const q = byId.get(id);
    if (q) choices[id] = buildChoices(q, all);
  }
  return choices;
}

function updateSession(fn: (s: ExamSession) => ExamSession) {
  setData((d) => (d.activeExam ? { ...d, activeExam: fn(d.activeExam) } : d));
}

function submitExam(byId: Map<number, Question>) {
  const session = getData().activeExam;
  if (!session) return;
  const result = finishSession(session);
  const records: AnswerRecord[] = [];
  for (const id of result.questionIds) {
    const q = examQuestion(byId.get(id), result, id);
    if (!q) continue;
    const g = gradeAnswer(q, result.answers[id]);
    if (g !== null) records.push({ id, correct: g, guessed: result.guessed.includes(id) });
  }
  setData((s) => ({ ...s, activeExam: null, exams: [...s.exams, result] }));
  recordAnswers(records);
  navigate(`/exam/results/${result.id}`);
}

const answerLabel = (a: ExamAnswer | undefined) => (!a ? '—' : a.freeText !== undefined ? a.freeText || '—' : a.letters.join(', ') || '—');

/* ---------------------------------------------------------------- runner */

function ExamRunner({ session }: { session: ExamSession }) {
  const { byId, questions } = useQuestionBank();
  const [showNav, setShowNav] = useState(false);
  const qid = session.questionIds[session.currentIndex];
  const q = examQuestion(byId.get(qid), session, qid);
  const remaining = session.durationMs - session.elapsedMs;

  // Exams started before options existed get them on resume.
  useEffect(() => {
    const missing = session.questionIds.filter((id) => !session.choices?.[id]);
    if (missing.length) updateSession((s) => ({ ...s, choices: { ...s.choices, ...makeChoices(missing, byId, questions) } }));
  }, [session.questionIds, session.choices, byId, questions]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      const s = getData().activeExam;
      if (!s) return;
      if (s.elapsedMs + 1000 >= s.durationMs) {
        updateSession((x) => ({ ...x, elapsedMs: x.durationMs }));
        submitExam(byId);
        return;
      }
      const current = s.questionIds[s.currentIndex];
      updateSession((x) => ({
        ...x,
        elapsedMs: x.elapsedMs + 1000,
        timePerQ: x.reviewing ? x.timePerQ : { ...x.timePerQ, [current]: (x.timePerQ[current] ?? 0) + 1000 },
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [byId]);

  const goTo = (i: number) => updateSession((s) => ({ ...s, currentIndex: Math.max(0, Math.min(s.questionIds.length - 1, i)), reviewing: false }));
  const setAnswer = (a: ExamAnswer) => updateSession((s) => ({ ...s, answers: { ...s.answers, [qid]: a } }));
  const toggleIn = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const flagged = session.flagged.includes(qid);
  const answered = (id: number) => isAnswered(session.answers[id]);
  const unanswered = session.questionIds.filter((id) => !answered(id));

  const submit = () => {
    const msg = unanswered.length
      ? `You have ${unanswered.length} unanswered question(s). Unanswered questions are scored as incorrect — there is no penalty for guessing. Submit anyway?`
      : 'Submit the exam?';
    if (confirm(msg)) submitExam(byId);
  };

  const timer = (
    <span className={cx('font-mono text-lg font-semibold tabular-nums', remaining < 10 * 60_000 && 'text-rose-600 dark:text-rose-400')}>
      ⏱ {formatDuration(remaining)}
    </span>
  );

  const navGrid = (
    <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-13">
      {session.questionIds.map((id, i) => (
        <button
          key={id}
          type="button"
          onClick={() => goTo(i)}
          className={cx(
            'relative h-9 rounded text-xs font-medium ring-1',
            i === session.currentIndex && !session.reviewing && 'ring-2 ring-indigo-500',
            answered(id) ? 'bg-slate-700 text-white ring-slate-700 dark:bg-slate-300 dark:text-slate-900' : 'bg-white ring-slate-300 dark:bg-slate-900 dark:ring-slate-700',
          )}
        >
          {i + 1}
          {session.flagged.includes(id) && <span className="absolute -right-1 -top-1 text-amber-500">⚑</span>}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8 dark:border-slate-800 dark:bg-slate-950/95">
        <div className="text-sm font-semibold">
          AWS Certified Solutions Architect – Associate {session.kind !== 'full' && <Badge tone="indigo">{session.kind}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {timer}
          <Button variant="secondary" size="sm" onClick={() => setShowNav((v) => !v)}>
            Navigator
          </Button>
          <Button variant="secondary" size="sm" onClick={() => updateSession((s) => ({ ...s, reviewing: true }))}>
            Review
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (confirm('Discard this exam? Your answers will not be saved or scored.')) {
                setData((d) => ({ ...d, activeExam: null }));
                navigate('/exam');
              }
            }}
          >
            Discard
          </Button>
        </div>
      </div>

      {showNav && <Card>{navGrid}</Card>}

      {session.reviewing ? (
        <Card title="Review before submitting">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Answered" value={`${session.questionIds.length - unanswered.length}/${session.questionIds.length}`} />
            <Stat label="Unanswered" value={unanswered.length} tone={unanswered.length ? 'bad' : 'good'} />
            <Stat label="Flagged" value={session.flagged.length} tone={session.flagged.length ? 'warn' : undefined} />
          </div>
          {[
            { title: 'Unanswered', ids: unanswered },
            { title: 'Flagged for review', ids: session.flagged },
          ].map(
            (group) =>
              group.ids.length > 0 && (
                <div key={group.title} className="mb-4">
                  <div className="mb-2 text-sm font-semibold">{group.title}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.ids.map((id) => (
                      <Button key={id} size="sm" variant="secondary" onClick={() => goTo(session.questionIds.indexOf(id))}>
                        Q{session.questionIds.indexOf(id) + 1}
                      </Button>
                    ))}
                  </div>
                </div>
              ),
          )}
          <div className="mb-4">{navGrid}</div>
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => goTo(session.currentIndex)}>
              Back to questions
            </Button>
            <Button onClick={submit}>Submit exam</Button>
          </div>
        </Card>
      ) : (
        q && (
          <Card>
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="font-semibold">
                Question {session.currentIndex + 1} of {session.questionIds.length}
                {q.requiredCount > 1 && <span className="ml-2 font-normal text-slate-500">(Choose {q.requiredCount}.)</span>}
              </span>
              <button
                type="button"
                onClick={() => updateSession((s) => ({ ...s, flagged: toggleIn(s.flagged, qid) }))}
                className={cx('rounded px-2 py-1 text-sm ring-1', flagged ? 'bg-amber-100 text-amber-800 ring-amber-400 dark:bg-amber-950 dark:text-amber-300' : 'ring-slate-300 dark:ring-slate-700')}
              >
                ⚑ {flagged ? 'Flagged' : 'Flag for review'}
              </button>
            </div>
            <QuestionText q={q} />
            <div className="mt-5">
              <AnswerInput key={qid} q={q} value={session.answers[qid] ?? emptyAnswer()} onChange={setAnswer} />
            </div>
            <div className="mt-4">
              <GuessedToggle checked={session.guessed.includes(qid)} onChange={() => updateSession((s) => ({ ...s, guessed: toggleIn(s.guessed, qid) }))} />
            </div>
            <div className="mt-6 flex justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
              <Button variant="secondary" onClick={() => goTo(session.currentIndex - 1)} disabled={session.currentIndex === 0}>
                ← Previous
              </Button>
              {session.currentIndex + 1 < session.questionIds.length ? (
                <Button onClick={() => goTo(session.currentIndex + 1)}>Next →</Button>
              ) : (
                <Button onClick={() => updateSession((s) => ({ ...s, reviewing: true }))}>Review →</Button>
              )}
            </div>
          </Card>
        )
      )}
    </div>
  );
}

/* --------------------------------------------------------------- results */

type ResultFilter = 'all' | 'wrong' | 'flagged' | 'guessed' | 'pending';

function ExamResults({ result }: { result: ExamResult }) {
  const { byId, questions } = useQuestionBank();
  const [filter, setFilter] = useState<ResultFilter>('all');
  const score = scoreExam(result, byId);

  const gradeSelf = (id: number, correct: boolean) => {
    const prev = result.answers[id]?.selfGrade;
    setData((s) => ({
      ...s,
      exams: s.exams.map((e) => (e.id === result.id ? { ...e, answers: { ...e.answers, [id]: { ...e.answers[id], selfGrade: correct } } } : e)),
    }));
    if (prev === undefined) recordAnswers([{ id, correct, guessed: result.guessed.includes(id) }]);
  };

  const rows = result.questionIds
    .map((id, i) => ({ id, i, q: examQuestion(byId.get(id), result, id), a: result.answers[id] }))
    .filter((r): r is typeof r & { q: Question } => !!r.q)
    .map((r) => ({ ...r, grade: gradeAnswer(r.q, r.a) }));
  const visible = rows.filter((r) =>
    filter === 'wrong'
      ? r.grade === false
      : filter === 'flagged'
        ? result.flagged.includes(r.id)
        : filter === 'guessed'
          ? result.guessed.includes(r.id)
          : filter === 'pending'
            ? r.grade === null
            : true,
  );
  const retryIds = rows.filter((r) => r.grade === false || result.guessed.includes(r.id)).map((r) => r.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam results"
        subtitle={new Date(result.date).toLocaleString()}
        actions={
          <>
            {retryIds.length > 0 && (
              <Button
                onClick={() =>
                  startExam(newExamSession('retry', retryIds, Math.max(5, Math.ceil(retryIds.length * 2)), makeChoices(retryIds, byId, questions)))
                }
              >
                Retry my mistakes ({retryIds.length})
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/exam')}>
              Exam home
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Estimated result" value={score.passed ? 'PASS' : 'FAIL'} tone={score.passed ? 'good' : 'bad'} hint={`pass = ${PASS_SCALED}`} />
        <Stat label="Scaled score (approx.)" value={score.scaled} hint="rough estimate — not AWS's real scaling" />
        <Stat label="Raw score" value={pct(score.pct)} hint={`${score.correct} / ${score.total} correct`} />
        <Stat
          label="Time used"
          value={formatDuration(result.timeUsedMs)}
          hint={`of ${formatDuration(result.durationMs)} · ${formatDuration(result.timeUsedMs / Math.max(1, result.questionIds.length))}/question`}
        />
      </div>
      {score.pending > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
          {score.pending} free-text answer(s) still need self-grading — the score updates as you grade them.{' '}
          <button type="button" className="font-semibold underline" onClick={() => setFilter('pending')}>
            Show them
          </button>
        </div>
      )}

      <Card title="Score by domain">
        <div className="space-y-3">
          {DOMAINS.map((d) => {
            const s = score.perDomain[d.id];
            const v = s.total ? s.correct / s.total : null;
            return (
              <div key={d.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{d.name}</span>
                  <span className="text-slate-500">
                    {s.correct}/{s.total} · {pct(v)}
                  </span>
                </div>
                <ProgressBar value={v} />
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title="Questions"
        actions={
          <Select<ResultFilter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All (${rows.length})` },
              { value: 'wrong', label: `Wrong only (${rows.filter((r) => r.grade === false).length})` },
              { value: 'flagged', label: `Flagged (${result.flagged.length})` },
              { value: 'guessed', label: `Guessed (${result.guessed.length})` },
              { value: 'pending', label: `Needs self-grade (${score.pending})` },
            ]}
          />
        }
      >
        <div className="space-y-2">
          {visible.map(({ id, i, q, a, grade }) => (
            <details key={id} className="rounded-md ring-1 ring-slate-200 dark:ring-slate-800" open={grade === null}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3 text-sm">
                <span className={cx('font-bold', grade === true ? 'text-emerald-600' : grade === false ? 'text-rose-600' : 'text-amber-600')}>
                  {grade === true ? '✓' : grade === false ? '✗' : '?'}
                </span>
                <span className="font-medium">Q{i + 1}</span>
                <span className="text-slate-500">#{id}</span>
                <Badge tone="indigo">{domainName(q.domain)}</Badge>
                {result.flagged.includes(id) && <Badge tone="amber">flagged</Badge>}
                {result.guessed.includes(id) && <Badge tone="amber">guessed</Badge>}
                <span className="ml-auto text-xs text-slate-500">
                  you: {answerLabel(a)} · correct: {q.correct.join(', ') || 'text'} · {formatDuration(result.timePerQ[id] ?? 0)}
                </span>
              </summary>
              <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-800">
                <QuestionText q={q} />
                {a?.freeText !== undefined && (
                  <div className="text-sm">
                    <span className="font-semibold">Your answer:</span> {a.freeText || '—'}
                  </div>
                )}
                {(a?.freeText !== undefined || q.correct.length === 0) && isAnswered(a) && (
                  <SelfGradeButtons value={a?.selfGrade} onGrade={(c) => gradeSelf(id, c)} />
                )}
                <AnswerReveal q={q} showConfused={grade === false} />
                <NoteEditor id={id} />
              </div>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ home */

function TrendChart({ points }: { points: { pct: number; date: number }[] }) {
  if (points.length < 2) return <p className="text-sm text-slate-500">Take at least two exams to see a trend.</p>;
  const w = 600;
  const h = 160;
  const pad = 24;
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - v * (h - 2 * pad);
  const passY = y(0.72);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <line x1={pad} x2={w - pad} y1={passY} y2={passY} className="stroke-emerald-500" strokeDasharray="4 4" />
      <text x={w - pad} y={passY - 4} textAnchor="end" className="fill-emerald-600 text-[10px]">
        ~pass (720)
      </text>
      <polyline fill="none" className="stroke-indigo-500" strokeWidth={2} points={points.map((p, i) => `${x(i)},${y(p.pct)}`).join(' ')} />
      {points.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={y(p.pct)} r={3.5} className="fill-indigo-500">
          <title>
            {new Date(p.date).toLocaleDateString()}: {Math.round(p.pct * 100)}%
          </title>
        </circle>
      ))}
    </svg>
  );
}

function ExamHome() {
  const { questions, byId } = useQuestionBank();
  const data = useAppData();
  const [accommodation, setAccommodation] = useState(data.settings.accommodation);
  const [count, setCount] = useState(30);
  const [minutes, setMinutes] = useState(60);
  const [domains, setDomains] = useState<Domain[]>(DOMAINS.map((d) => d.id));
  const [tag, setTag] = useState('');
  const [weakOnly, setWeakOnly] = useState(false);

  const customPool = filterQuestions(questions, data, { filter: weakOnly ? 'weak' : 'all', tag: tag || null }).filter((q) => domains.includes(q.domain));
  const history = useMemo(
    () => [...data.exams].sort((a, b) => a.date - b.date).map((e) => ({ e, s: scoreExam(e, byId) })),
    [data.exams, byId],
  );

  const startFull = () => {
    const minutesTotal = FULL_EXAM.minutes + (accommodation ? FULL_EXAM.accommodationMinutes : 0);
    const ids = drawExamQuestions(questions, FULL_EXAM.count);
    startExam(newExamSession('full', ids, minutesTotal, makeChoices(ids, byId, questions)));
  };
  const startCustom = () => {
    const ids = drawExamQuestions(customPool, Math.min(count, customPool.length), domains);
    startExam(newExamSession('custom', ids, minutes, makeChoices(ids, byId, questions)));
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Exam" subtitle="Simulates SAA-C03: no feedback until you submit, flag & review, auto-submit at time-out." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Full practice exam">
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
            <li>65 questions drawn by domain weight (30 / 26 / 24 / 20%)</li>
            <li>{FULL_EXAM.minutes} minutes, visible countdown, survives page refresh</li>
            <li>No penalty for wrong answers — answer everything</li>
            <li>Approximate scaled score (100–1000, pass 720)</li>
          </ul>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={accommodation} onChange={(e) => setAccommodation(e.target.checked)} />
            Exam with accommodation (+30 min)
          </label>
          <Button onClick={startFull}>Start full exam</Button>
        </Card>

        <Card title="Custom exam">
          <div className="grid gap-3 text-sm">
            <div className="flex gap-3">
              <label className="flex-1">
                Questions
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
              <label className="flex-1">
                Minutes
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              {DOMAINS.map((d) => (
                <label key={d.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={domains.includes(d.id)}
                    onChange={(e) => setDomains((ds) => (e.target.checked ? [...ds, d.id] : ds.filter((x) => x !== d.id)))}
                  />
                  {d.short}
                </label>
              ))}
            </div>
            <Select value={tag} onChange={setTag} options={[{ value: '', label: 'Any service / topic' }, ...ALL_TAGS.map((t) => ({ value: t, label: t }))]} />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={weakOnly} onChange={(e) => setWeakOnly(e.target.checked)} />
              Only weak areas (wrong or guessed before)
            </label>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{customPool.length} questions available</span>
              <Button onClick={startCustom} disabled={customPool.length === 0 || domains.length === 0 || count < 1 || minutes < 1}>
                Start custom exam
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Score trend">
        <TrendChart points={history.map(({ e, s }) => ({ pct: s.pct, date: e.date }))} />
      </Card>

      <Card title={`History (${history.length})`}>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No exams yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1">Date</th>
                <th>Type</th>
                <th>Questions</th>
                <th>Raw</th>
                <th>Scaled</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map(({ e, s }) => (
                <tr key={e.id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="py-2">{new Date(e.date).toLocaleDateString()}</td>
                  <td>{e.kind}</td>
                  <td>{e.questionIds.length}</td>
                  <td>{pct(s.pct)}</td>
                  <td className={s.passed ? 'text-emerald-600' : 'text-rose-600'}>
                    {s.scaled}
                    {s.pending > 0 && <span className="text-amber-600"> *</span>}
                  </td>
                  <td className="text-right">
                    <a href={`#/exam/results/${e.id}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                      Details
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

export function ExamPage({ route }: { route: Route }) {
  const { activeExam, exams } = useAppData();
  if (route.path[1] === 'results') {
    const result = exams.find((e) => e.id === route.path[2]);
    return result ? <ExamResults result={result} /> : <ExamHome />;
  }
  if (activeExam) return <ExamRunner session={activeExam} />;
  return <ExamHome />;
}
