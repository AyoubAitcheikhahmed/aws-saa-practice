import { useMemo } from 'react';
import { useQuestionBank } from '../data/questionBank';
import { scoreExam } from '../exam';
import { navigate } from '../router';
import { dayKey, useAppData } from '../storage/store';
import { coverage, daysUntilExam, domainStats, dueCount, readiness, streak, weakestTags, EXAM_DATE } from '../stats';
import { DOMAINS } from '../tagging/tagging';
import { Button, Card, PageHeader, ProgressBar, Stat, cx, pct } from '../components/ui';

const DAY = 86_400_000;

function Heatmap({ activity }: { activity: Record<string, number> }) {
  const weeks = 15;
  const today = new Date();
  const start = new Date(today.getTime() - (weeks * 7 - 1) * DAY - today.getDay() * DAY);
  const cells = Array.from({ length: weeks * 7 + today.getDay() + 1 }, (_, i) => {
    const t = start.getTime() + i * DAY;
    return { key: dayKey(t), n: activity[dayKey(t)] ?? 0, t };
  });
  const shade = (n: number) =>
    n === 0 ? 'bg-slate-200 dark:bg-slate-800' : n < 10 ? 'bg-emerald-200 dark:bg-emerald-900' : n < 25 ? 'bg-emerald-400 dark:bg-emerald-700' : 'bg-emerald-600 dark:bg-emerald-500';
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1">
      {cells.map((c) => (
        <div key={c.key} title={`${new Date(c.t).toLocaleDateString()}: ${c.n} answered`} className={cx('h-3 w-3 rounded-sm', shade(c.n))} />
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { questions, byId } = useQuestionBank();
  const data = useAppData();

  const examPcts = useMemo(() => [...data.exams].sort((a, b) => a.date - b.date).map((e) => scoreExam(e, byId).pct), [data.exams, byId]);
  const ready = readiness(questions, data, examPcts);
  const cov = coverage(questions, data);
  const due = dueCount(questions, data);
  const days = daysUntilExam();
  const ds = domainStats(questions, data);
  const weak = weakestTags(questions, data).slice(0, 10);
  const unseen = cov.total - cov.seen;
  const studyDays = Math.max(1, days - 3);
  const newPerDay = Math.ceil(unseen / studyDays);
  const today = data.activity[dayKey(Date.now())] ?? 0;
  const currentStreak = streak(data.activity);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Exam on ${EXAM_DATE.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          <>
            <Button onClick={() => navigate('/practice?smart=1')}>Smart practice session</Button>
            <Button variant="secondary" onClick={() => navigate('/exam')}>
              Practice exam
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Days to exam" value={days} hint="30 Nov 2026" tone={days < 7 ? 'warn' : undefined} />
        <Stat
          label="Readiness"
          value={`${ready.score}%`}
          tone={ready.score >= 75 ? 'good' : ready.score >= 55 ? 'warn' : 'bad'}
          hint={ready.hasExams ? 'accuracy · exams · coverage' : 'take an exam to refine'}
        />
        <Stat label="Coverage" value={pct(cov.ratio)} hint={`${cov.seen} / ${cov.total} seen`} />
        <Stat label="Due today" value={due} hint="spaced-repetition reviews" />
        <Stat label="Streak" value={`${currentStreak} day${currentStreak === 1 ? '' : 's'}`} hint={`${today} answered today`} />
      </div>

      <Card title="Today's plan">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          To see the whole bank before the exam (keeping the last 3 days for review): <strong>{newPerDay} new questions/day</strong> + <strong>{due} due reviews</strong> today
          {weak.length > 0 && (
            <>
              {' '}
              + a few from your weakest topic (<strong>{weak[0].tag}</strong>)
            </>
          )}
          .
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigate(`/practice?filter=unseen&count=${Math.max(5, newPerDay)}&title=New questions`)} disabled={unseen === 0}>
            {Math.max(5, newPerDay)} new questions
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/flashcards')} disabled={due === 0}>
            Review {due} due cards
          </Button>
          {weak[0] && (
            <Button size="sm" variant="secondary" onClick={() => navigate(`/practice?tag=${encodeURIComponent(weak[0].tag)}&filter=all&count=10`)}>
              10 × {weak[0].tag}
            </Button>
          )}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Accuracy by domain">
          <div className="space-y-3">
            {[...DOMAINS]
              .sort((a, b) => (ds[a.id].accuracy ?? -1) - (ds[b.id].accuracy ?? -1))
              .map((d) => (
                <div key={d.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>
                      {d.short} <span className="text-slate-400">({d.weight * 100}%)</span>
                    </span>
                    <span className="text-slate-500">
                      {pct(ds[d.id].accuracy)} · {ds[d.id].seenQuestions}/{ds[d.id].questions} seen
                    </span>
                  </div>
                  <ProgressBar value={ds[d.id].accuracy} />
                </div>
              ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Accuracy counts correct guesses as misses.</p>
        </Card>

        <Card title="Top 10 weakest topics" actions={<a href="#/weak" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">All →</a>}>
          {weak.length === 0 ? (
            <p className="text-sm text-slate-500">Answer a few questions to find your weak spots.</p>
          ) : (
            <ul className="space-y-2">
              {weak.map((t) => (
                <li key={t.tag} className="flex items-center gap-3 text-sm">
                  <span className="w-36 truncate">{t.tag}</span>
                  <div className="flex-1">
                    <ProgressBar value={t.accuracy} />
                  </div>
                  <span className="w-12 text-right text-slate-500">{pct(t.accuracy)}</span>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/practice?tag=${encodeURIComponent(t.tag)}&filter=all&count=10`)}>
                    Practice
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Activity">
        <div className="overflow-x-auto">
          <Heatmap activity={data.activity} />
        </div>
      </Card>
    </div>
  );
}
