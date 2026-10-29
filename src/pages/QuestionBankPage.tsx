import { useMemo, useState } from 'react';
import { useQuestionBank } from '../data/questionBank';
import { navigate } from '../router';
import { isWeak } from '../sessions';
import { getProgress, setData, useAppData } from '../storage/store';
import { ALL_TAGS, DOMAINS, detectDomain, detectTags, domainName } from '../tagging/tagging';
import type { Domain, Question } from '../types';
import { AnswerReveal, NoteEditor, QuestionText, StarButton } from '../components/question';
import { Badge, Button, Card, PageHeader, Select } from '../components/ui';

type BankFilter = 'all' | 'starred' | 'weak' | 'unseen' | 'notes' | 'edited';
const PAGE = 30;

function EditTags({ q }: { q: Question }) {
  const { edits } = useAppData();
  const [tags, setTags] = useState(q.tags.join(', '));
  const [domain, setDomain] = useState<Domain>(q.domain);
  const edited = !!edits[q.id];

  const save = () => {
    const list = [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean))];
    setData((s) => ({ ...s, edits: { ...s.edits, [q.id]: { tags: list, domain } } }));
  };
  const reset = () => {
    setData((s) => {
      const next = { ...s.edits };
      delete next[q.id];
      return { ...s, edits: next };
    });
    setTags(detectTags(`${q.text}\n${q.correctText}`).join(', '));
    setDomain(detectDomain(q.text));
  };

  return (
    <div className="grid gap-2 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tags & domain {edited && <Badge tone="amber">edited</Badge>}</div>
      <input
        list="all-tags"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="Comma-separated tags"
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
      />
      <datalist id="all-tags">
        {ALL_TAGS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center gap-2">
        <Select<Domain> value={domain} onChange={setDomain} options={DOMAINS.map((d) => ({ value: d.id, label: d.name }))} />
        <Button size="sm" onClick={save}>
          Save
        </Button>
        {edited && (
          <Button size="sm" variant="ghost" onClick={reset}>
            Reset to auto
          </Button>
        )}
      </div>
    </div>
  );
}

export function QuestionBankPage() {
  const { questions } = useQuestionBank();
  const data = useAppData();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<BankFilter>('all');
  const [domain, setDomain] = useState<Domain | ''>('');
  const [tag, setTag] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<number | null>(null);

  const results = useMemo(() => {
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    return questions.filter((q) => {
      const p = getProgress(data, q.id);
      if (domain && q.domain !== domain) return false;
      if (tag && !q.tags.includes(tag)) return false;
      if (filter === 'starred' && !p.starred) return false;
      if (filter === 'weak' && !isWeak(data, q.id)) return false;
      if (filter === 'unseen' && p.seen > 0) return false;
      if (filter === 'notes' && !p.note) return false;
      if (filter === 'edited' && !data.edits[q.id]) return false;
      if (terms.length === 0) return true;
      const hay = `#${q.id} ${q.text} ${q.correctText} ${q.explanation} ${(q.options ?? []).map((o) => o.text).join(' ')} ${p.note} ${q.tags.join(' ')}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [questions, data, search, filter, domain, tag]);

  return (
    <div className="space-y-4">
      <PageHeader title="Question bank" subtitle={`${results.length} of ${questions.length} questions`} />
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Search questions, answers, explanations, notes…"
          className="min-w-64 flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
        />
        <Select<BankFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'starred', label: 'Starred' },
            { value: 'weak', label: 'Weak' },
            { value: 'unseen', label: 'Never seen' },
            { value: 'notes', label: 'With notes' },
            { value: 'edited', label: 'Edited tags' },
          ]}
        />
        <Select<Domain | ''> value={domain} onChange={setDomain} options={[{ value: '', label: 'Any domain' }, ...DOMAINS.map((d) => ({ value: d.id, label: d.short }))]} />
        <Select value={tag} onChange={setTag} options={[{ value: '', label: 'Any topic' }, ...ALL_TAGS.map((t) => ({ value: t, label: t }))]} />
        {results.length > 0 && (
          <Button variant="secondary" onClick={() => navigate(`/practice?ids=${results.slice(0, 100).map((q) => q.id).join(',')}&title=Search results`)}>
            Practice these
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {results.slice(0, limit).map((q) => {
          const p = getProgress(data, q.id);
          const isOpen = open === q.id;
          return (
            <Card key={q.id} className="p-3">
              <div className="flex items-start gap-3">
                <StarButton id={q.id} />
                <button type="button" className="flex-1 text-left" onClick={() => setOpen(isOpen ? null : q.id)}>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span className="font-semibold">#{q.id}</span>
                    <Badge tone="indigo">{domainName(q.domain)}</Badge>
                    {q.requiredCount > 1 && <Badge tone="amber">choose {q.requiredCount}</Badge>}
                    {p.seen > 0 && (
                      <span>
                        {p.correct}/{p.seen} correct{p.guessed ? ` (${p.guessed} guessed)` : ''}
                      </span>
                    )}
                    {p.note && <Badge>note</Badge>}
                  </div>
                  <p className={`mt-1 text-sm ${isOpen ? '' : 'line-clamp-2'}`}>{q.text}</p>
                  {!isOpen && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {q.tags.slice(0, 6).map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  )}
                </button>
              </div>
              {isOpen && (
                <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <QuestionText q={q} />
                  <AnswerReveal q={q} />
                  <NoteEditor key={q.id} id={q.id} />
                  <EditTags key={`${q.id}-${q.tags.join()}-${q.domain}`} q={q} />
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/practice?ids=${q.id}&title=Question ${q.id}`)}>
                    Practice this question
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {results.length > limit && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
            Show more ({results.length - limit} left)
          </Button>
        </div>
      )}
    </div>
  );
}
