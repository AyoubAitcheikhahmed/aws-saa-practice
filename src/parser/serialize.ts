import type { ParsedQuestion, ParseFailure } from '../types';

export const SEPARATOR_LINE = '-'.repeat(70);

/** Per-letter answer texts, recovered from options or from the "X) text" lines of multi-answer correctText. */
function answerParts(q: ParsedQuestion): { letter: string; text: string }[] {
  if (q.options) return q.correct.map((l) => ({ letter: l, text: q.options!.find((o) => o.letter === l)?.text ?? '' }));
  if (q.correct.length === 1) return [{ letter: q.correct[0], text: q.correctText }];
  const byLetter = new Map<string, string>();
  for (const line of q.correctText.split('\n')) {
    const m = /^([A-F])\)\s*(.*)$/.exec(line);
    if (m) byLetter.set(m[1], m[2]);
  }
  return q.correct.map((l) => ({ letter: l, text: byLetter.get(l) ?? '' }));
}

/**
 * Canonical, consistently formatted question block:
 *   {id}] question text
 *   (blank)
 *   A) option ...            only when the source listed all options
 *   Answer: B) text          | Answers: B) x + C) y | Answer: B, C (with options) | Answer: text (letter unknown)
 *   explanation
 *   ------
 */
export function serializeQuestion(q: ParsedQuestion): string {
  const lines = [`${q.id}] ${q.text}`, ''];
  if (q.options) {
    for (const o of q.options) lines.push(`${o.letter}) ${o.text}`);
    lines.push('', `${q.correct.length > 1 ? 'Answers' : 'Answer'}: ${q.correct.join(', ')}`);
  } else if (q.correct.length === 0) {
    lines.push(`Answer: ${q.correctText}`);
  } else {
    const parts = answerParts(q).map((p) => `${p.letter}) ${p.text}`.trim());
    lines.push(`${parts.length > 1 ? 'Answers' : 'Answer'}: ${parts.join(' + ')}`);
  }
  if (q.explanation) lines.push('', q.explanation);
  lines.push(SEPARATOR_LINE);
  return lines.join('\n');
}

export function serializeQuestions(questions: ParsedQuestion[]): string {
  return [...questions].sort((a, b) => a.id - b.id).map(serializeQuestion).join('\n\n') + '\n';
}

export function serializeFailures(failures: ParseFailure[]): string {
  return (
    failures
      .map((f) => `# ID ${f.id ?? '?'} (source line ${f.line}): ${f.reason}\n${f.raw || '(empty)'}\n${SEPARATOR_LINE}`)
      .join('\n\n') + '\n'
  );
}
