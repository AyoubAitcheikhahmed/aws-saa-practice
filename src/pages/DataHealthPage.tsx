import { useMemo, useState } from 'react';
import { useQuestionBank } from '../data/questionBank';
import { findIdGaps } from '../parser/parseQuestions';
import { DOMAINS } from '../tagging/tagging';
import { Badge, Card, PageHeader, Select, Stat } from '../components/ui';

type Filter = 'warnings' | 'textonly' | 'multi' | 'options';

export function DataHealthPage() {
  const { parsed, questions, isImported } = useQuestionBank();
  const [filter, setFilter] = useState<Filter>('warnings');
  const gaps = useMemo(() => findIdGaps(parsed), [parsed]);

  const withOptions = questions.filter((q) => q.options).length;
  const multi = questions.filter((q) => q.requiredCount > 1).length;
  const textOnly = questions.filter((q) => q.correct.length === 0).length;
  const withWarnings = questions.filter((q) => q.warnings.length > 0);
  const noExplanation = questions.filter((q) => !q.explanation).length;
  const untagged = questions.filter((q) => q.tags.length === 0).length;

  const listed = questions.filter((q) =>
    filter === 'warnings' ? q.warnings.length > 0 : filter === 'textonly' ? q.correct.length === 0 : filter === 'multi' ? q.requiredCount > 1 : q.options,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data health"
        subtitle={`Source: ${isImported ? 'imported .txt (Settings → reset to use the bundled file)' : 'bundled data-source/questions.txt'}`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Questions parsed" value={questions.length} tone="good" />
        <Stat label="Failed to parse" value={parsed.failures.length} tone={parsed.failures.length ? 'bad' : 'good'} hint="excluded from the bank" />
        <Stat label="With A–F options" value={withOptions} hint={`${questions.length - withOptions} answer-only`} />
        <Stat label="Multi-select" value={multi} />
        <Stat label="Answer letter unknown" value={textOnly} tone={textOnly ? 'warn' : undefined} hint="self-graded" />
        <Stat label="No explanation" value={noExplanation} tone={noExplanation ? 'warn' : undefined} />
        <Stat label="With parser warnings" value={withWarnings.length} tone={withWarnings.length ? 'warn' : undefined} />
        <Stat label="No auto-tags" value={untagged} hint="edit in Question Bank" />
      </div>

      <Card title="Questions per domain (auto-detected)">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {DOMAINS.map((d) => {
            const n = questions.filter((q) => q.domain === d.id).length;
            return (
              <div key={d.id}>
                <div className="text-sm font-medium">{d.short}</div>
                <div className="text-xs text-slate-500">
                  {n} questions ({questions.length ? Math.round((n / questions.length) * 100) : 0}%) · exam weight {d.weight * 100}%
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {gaps.length > 0 && (
        <Card title={`Missing IDs (${gaps.length})`}>
          <p className="text-sm text-slate-600 dark:text-slate-400">{gaps.join(', ')}</p>
        </Card>
      )}

      <Card title={`Failed to parse (${parsed.failures.length})`}>
        {parsed.failures.length === 0 ? (
          <p className="text-sm text-slate-500">None 🎉</p>
        ) : (
          <div className="space-y-2">
            {parsed.failures.map((f, i) => (
              <details key={`${f.id}-${i}`} className="rounded-md bg-slate-50 p-2 text-sm dark:bg-slate-800/50">
                <summary className="cursor-pointer">
                  <span className="font-semibold">#{f.id ?? '?'}</span> <span className="text-slate-500">line {f.line}</span> — {f.reason}
                </summary>
                <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-400">{f.raw || '(empty)'}</pre>
              </details>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Inspect parsed questions"
        actions={
          <Select<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'warnings', label: `With warnings (${withWarnings.length})` },
              { value: 'textonly', label: `Answer letter unknown (${textOnly})` },
              { value: 'multi', label: `Multi-select (${multi})` },
              { value: 'options', label: `With options (${withOptions})` },
            ]}
          />
        }
      >
        <div className="space-y-2">
          {listed.map((q) => (
            <details key={q.id} className="rounded-md bg-slate-50 p-2 text-sm dark:bg-slate-800/50">
              <summary className="cursor-pointer">
                <span className="font-semibold">#{q.id}</span> {q.text.slice(0, 110)}…{' '}
                <Badge tone="green">{q.correct.join(', ') || 'text'}</Badge>{' '}
                {q.warnings.map((w) => (
                  <Badge key={w} tone="amber">
                    {w}
                  </Badge>
                ))}
              </summary>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-slate-500">Parsed</div>
                  <pre className="whitespace-pre-wrap text-xs">
                    {JSON.stringify({ correct: q.correct, requiredCount: q.requiredCount, correctText: q.correctText, options: q.options, tags: q.tags }, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Raw source (line {q.line})</div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-400">{q.raw}</pre>
                </div>
              </div>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
