import { useQuestionBank } from '../data/questionBank';
import { navigate } from '../router';
import { useAppData } from '../storage/store';
import { domainStats, mostFailed, tagStats } from '../stats';
import { DOMAINS, domainName } from '../tagging/tagging';
import { Badge, Button, Card, PageHeader, ProgressBar, pct } from '../components/ui';

export function WeakAreasPage() {
  const { questions } = useQuestionBank();
  const data = useAppData();
  const ds = domainStats(questions, data);
  const tags = tagStats(questions, data).sort((a, b) => {
    if (a.accuracy === null) return b.accuracy === null ? b.questions - a.questions : 1;
    if (b.accuracy === null) return -1;
    return a.accuracy - b.accuracy;
  });
  const failed = mostFailed(questions, data);

  return (
    <div className="space-y-6">
      <PageHeader title="Weak areas" subtitle="Accuracy = correct answers that were not guesses ÷ attempts. Weakest first." />

      <Card title="Domains">
        <div className="grid gap-4 md:grid-cols-2">
          {DOMAINS.map((d) => (
            <div key={d.id}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{d.name}</span>
                <span className="text-slate-500">{pct(ds[d.id].accuracy)}</span>
              </div>
              <ProgressBar value={ds[d.id].accuracy} />
              <div className="mt-1 flex justify-between text-xs text-slate-500">
                <span>
                  {ds[d.id].attempts} attempts · {ds[d.id].seenQuestions}/{ds[d.id].questions} seen
                </span>
                <a href={`#/practice?domain=${d.id}&filter=weak&count=20`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                  Practice weak
                </a>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="AWS services & concepts">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1">Topic</th>
                <th className="w-1/3">Accuracy</th>
                <th>Attempts</th>
                <th>Seen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.tag} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="py-2 font-medium">{t.tag}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <ProgressBar value={t.accuracy} />
                      <span className="w-10 text-right text-slate-500">{pct(t.accuracy)}</span>
                    </div>
                  </td>
                  <td>{t.attempts}</td>
                  <td>
                    {t.seenQuestions}/{t.questions}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/practice?tag=${encodeURIComponent(t.tag)}&filter=all&count=10`)}>
                      Practice this now
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Most-failed questions"
        actions={
          failed.length > 0 && (
            <Button size="sm" onClick={() => navigate(`/practice?ids=${failed.map((f) => f.q.id).join(',')}&title=Most-failed questions`)}>
              Practice all
            </Button>
          )
        }
      >
        {failed.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing failed yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {failed.map(({ q, p }) => (
              <li key={q.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="text-slate-500">#{q.id}</span>
                <span className="flex-1 truncate">{q.text}</span>
                <Badge tone="indigo">{domainName(q.domain)}</Badge>
                <Badge tone="red">{p.wrong} wrong</Badge>
                {p.guessed > 0 && <Badge tone="amber">{p.guessed} guessed</Badge>}
                <Button size="sm" variant="ghost" onClick={() => navigate(`/practice?ids=${q.id}&title=Question ${q.id}`)}>
                  Retry
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
