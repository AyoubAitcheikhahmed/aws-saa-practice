import { useState } from 'react';
import { confusedPairsFor } from '../data/confusedPairs';
import { getProgress, updateProgress, useAppData } from '../storage/store';
import { domainName } from '../tagging/tagging';
import { navigate } from '../router';
import type { ExamAnswer, Question } from '../types';
import { Badge, cx } from './ui';

export const emptyAnswer = (): ExamAnswer => ({ letters: [] });

export function StarButton({ id }: { id: number }) {
  const data = useAppData();
  const starred = getProgress(data, id).starred;
  return (
    <button
      type="button"
      title={starred ? 'Unstar (S)' : 'Star (S)'}
      onClick={(e) => {
        e.stopPropagation();
        updateProgress(id, (p) => ({ ...p, starred: !p.starred }));
      }}
      className={cx('text-xl leading-none', starred ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300 dark:text-slate-600')}
    >
      ★
    </button>
  );
}

export function QuestionHeader({ q, index, total }: { q: Question; index?: number; total?: number }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      {index !== undefined && total !== undefined && (
        <span className="font-medium text-slate-700 dark:text-slate-200">
          Question {index + 1} of {total}
        </span>
      )}
      <span>#{q.id}</span>
      <Badge tone="indigo">{domainName(q.domain)}</Badge>
      {q.requiredCount > 1 && <Badge tone="amber">Choose {q.requiredCount}</Badge>}
      <span className="ml-auto">
        <StarButton id={q.id} />
      </span>
    </div>
  );
}

export function QuestionText({ q, className }: { q: Question; className?: string }) {
  return <p className={cx('whitespace-pre-wrap leading-relaxed', className ?? 'text-[15px]')}>{q.text}</p>;
}

export function TagList({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <Badge key={t} onClick={() => navigate(`/practice?tag=${encodeURIComponent(t)}`)}>
          {t}
        </Badge>
      ))}
    </div>
  );
}

function toggle(letters: string[], l: string, required: number): string[] {
  if (required === 1) return [l];
  if (letters.includes(l)) return letters.filter((x) => x !== l);
  return letters.length < required ? [...letters, l].sort() : letters;
}

/** Multiple-choice input; pass a question built with `withChoices` so it always has options. */
export function AnswerInput({
  q,
  value,
  onChange,
  disabled,
  reveal,
}: {
  q: Question;
  value: ExamAnswer;
  onChange: (v: ExamAnswer) => void;
  disabled?: boolean;
  reveal?: boolean;
}) {
  const optionClass = (l: string) => {
    const chosen = value.letters.includes(l);
    if (reveal && q.correct.includes(l)) return 'ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-950/40';
    if (reveal && chosen) return 'ring-2 ring-rose-500 bg-rose-50 dark:bg-rose-950/40';
    return chosen ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'ring-1 ring-slate-300 dark:ring-slate-700';
  };
  const multi = q.requiredCount > 1;

  return (
    <div className="space-y-2">
      {(q.options ?? []).map((o) => {
        const chosen = value.letters.includes(o.letter);
        return (
          <button
            key={o.letter}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...value, letters: toggle(value.letters, o.letter, q.requiredCount) })}
            className={cx('flex w-full items-start gap-3 rounded-md p-3 text-left text-sm transition', optionClass(o.letter))}
          >
            <span
              className={cx(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-slate-400 text-[10px]',
                multi ? 'rounded-sm' : 'rounded-full',
                chosen && 'border-indigo-600 bg-indigo-600 text-white',
              )}
            >
              {chosen && (multi ? '✓' : '●')}
            </span>
            <span className="font-semibold">{o.letter}.</span>
            <span>{o.text}</span>
          </button>
        );
      })}
      {multi && (
        <p className="text-xs text-slate-500">
          Select {q.requiredCount} ({value.letters.length}/{q.requiredCount} selected)
        </p>
      )}
    </div>
  );
}

export function GuessedToggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      I guessed
    </label>
  );
}

export function CorrectAnswer({ q }: { q: Question }) {
  if (q.options) {
    return (
      <ul className="space-y-1">
        {q.options
          .filter((o) => q.correct.includes(o.letter))
          .map((o) => (
            <li key={o.letter}>
              <span className="font-semibold">{o.letter}.</span> {o.text}
            </li>
          ))}
      </ul>
    );
  }
  if (q.correct.length === 1) {
    return (
      <p>
        <span className="font-semibold">{q.correct[0]}.</span> {q.correctText}
      </p>
    );
  }
  return <p className="whitespace-pre-wrap">{q.correctText}</p>;
}

export function AnswerReveal({ q, showConfused }: { q: Question; showConfused?: boolean }) {
  const confused = showConfused ? confusedPairsFor(q) : [];
  return (
    <div className="space-y-3">
      <div className="rounded-md bg-emerald-50 p-3 text-sm ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:ring-emerald-900">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Correct answer</div>
        <CorrectAnswer q={q} />
      </div>
      {q.explanation && (
        <div className="text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Explanation</div>
          <p className="whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300">{q.explanation}</p>
        </div>
      )}
      {(!q.options || q.optionsGenerated) && q.optionHints.length > 0 && (
        <div className="text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Original wrong options mentioned in the explanation</div>
          <ul className="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-400">
            {q.optionHints
              .filter((h) => !q.correct.includes(h.letter))
              .map((h) => (
                <li key={h.letter}>
                  <span className="font-semibold">{h.letter}:</span> {h.text}
                </li>
              ))}
          </ul>
        </div>
      )}
      {q.optionsGenerated && (
        <p className="text-xs text-slate-500">
          The wrong options here were taken from answers to other questions in your bank. If the explanation mentions other letters, they refer to
          the original exam options.
        </p>
      )}
      {confused.map((c) => (
        <div key={c.title} className="rounded-md bg-amber-50 p-3 text-sm ring-1 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900">
          <div className="mb-1 font-semibold text-amber-800 dark:text-amber-300">Commonly confused: {c.title}</div>
          <p className="text-amber-900 dark:text-amber-200">{c.hint}</p>
        </div>
      ))}
    </div>
  );
}

export function NoteEditor({ id }: { id: number }) {
  const data = useAppData();
  const saved = getProgress(data, id).note;
  const [draft, setDraft] = useState(saved);
  const [open, setOpen] = useState(saved !== '');
  if (!open) {
    return (
      <button type="button" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setOpen(true)}>
        + Add a note
      </button>
    );
  }
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">My note</label>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== saved && updateProgress(id, (p) => ({ ...p, note: draft }))}
        rows={2}
        placeholder="e.g. remember: Object Lock = WORM, not lifecycle"
        className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800"
      />
    </div>
  );
}

export function SelfGradeButtons({ onGrade, value }: { onGrade: (correct: boolean) => void; value?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">Did you get it right?</span>
      <button
        type="button"
        onClick={() => onGrade(true)}
        className={cx('rounded-md px-3 py-1 ring-1', value === true ? 'bg-emerald-600 text-white ring-emerald-600' : 'ring-emerald-500 text-emerald-700 dark:text-emerald-400')}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onGrade(false)}
        className={cx('rounded-md px-3 py-1 ring-1', value === false ? 'bg-rose-600 text-white ring-rose-600' : 'ring-rose-500 text-rose-700 dark:text-rose-400')}
      >
        No
      </button>
    </div>
  );
}
