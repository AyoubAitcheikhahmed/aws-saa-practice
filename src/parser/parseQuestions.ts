import type { Option, OptionHint, ParsedQuestion, ParseFailure, ParseResult } from '../types';

/*
 * The source file mixes several hand-written formats. Supported:
 *   headers:  "12] text", "12]text", "51.A company", "IMP>>>>>98.text", "249] 249Topic 1"
 *   answers:  "A. text", "  B text", "C) text", "ans- text", "Answer: B) x",
 *             "Answers: B) x + C) y", "Correct answer is :" + next line,
 *             full A–F option list + "D and E" verdict or "-- Correct" notes,
 *             or an unlabeled paragraph right after the "?" line.
 *   separators: lines of dashes / equals (optional — some sections use blank lines only).
 */

const SEPARATOR = /^\s*[-=_*\u2013\u2014]{5,}\s*$/;
const HEADER = /^\s*(?:IMP\s*>*\s*)?(\d{1,4})\s*([\].])\s*(.*)$/i;
const ANSWER_LABEL = /^\s*(?:correct\s+answers?(?:\s+is)?|answers?|ans)\s*[:-]\s*\.?\s*(.*)$/i;
const LETTERED = /^\s*\(?([A-F])\s*[.)]\s*(\S.*)$/;
const BARE_LETTERED = /^\s*([A-F])\s+([A-Z].*)$/;
const VERDICT = /^\s*([A-F](?:\s*(?:,|&|\+|\/|and|AND)\s*[A-F])+)\s*\.?\s*$/;
const VERDICT_LABEL = /^\s*(?:[Cc]orrect\s+)?[Aa]nswers?\s*:\s*([A-F](?:\s*(?:,|&|\+|\/|and|AND)\s*[A-F])*)\s*\.?\s*$/;
const CHOOSE = /\(\s*choose\s+(two|three|four|five|[2-5])\s*\.?\s*\)/i;
const MIN_QUESTION_LENGTH = 25;

const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5 };

export function normalizeSource(source: string): string {
  return source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/\t/g, '    ');
}

interface Block {
  id: number;
  line: number;
  lines: string[];
  warnings: string[];
  rejectReason?: string;
}

function splitBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  const seen = new Set<number>();
  let lastId = 0;
  let current: Block | null = null;

  lines.forEach((line, index) => {
    const m = HEADER.exec(line);
    let accepted = false;
    if (m) {
      const num = Number(m[1]);
      const rest = m[3];
      if (m[2] === ']') {
        accepted = num > 0;
      } else {
        // Dot headers are ambiguous with numbered lists in explanations: require forward progress.
        accepted = (lastId === 0 || (num > lastId && num <= lastId + 30)) && /^[A-Za-z]/.test(rest);
      }
      if (accepted) {
        const warnings: string[] = [];
        let id = num;
        let rejectReason: string | undefined;
        if (seen.has(id)) {
          if (!seen.has(lastId + 1)) {
            warnings.push(`Duplicate ID ${num} in source; renumbered to ${lastId + 1}`);
            id = lastId + 1;
          } else {
            rejectReason = `Duplicate question ID ${num}`;
          }
        }
        current = {
          id,
          line: index + 1,
          lines: [rest.replace(/^\d+\s*Topic\s*\d+\s*/i, '')],
          warnings,
          rejectReason,
        };
        blocks.push(current);
        seen.add(id);
        lastId = Math.max(lastId, id);
        return;
      }
    }
    if (current && !SEPARATOR.test(line)) current.lines.push(line.replace(/\s+$/, ''));
  });

  return blocks;
}

interface Item {
  letter: string;
  text: string;
  note?: string;
}

function matchLettered(line: string, allowBareA: boolean): Item | null {
  const m = LETTERED.exec(line) ?? BARE_LETTERED.exec(line);
  if (!m) return null;
  if (m[1] === 'A' && !LETTERED.test(line) && !allowBareA) return null;
  return splitNote({ letter: m[1].toUpperCase(), text: m[2].trim() });
}

function splitNote(item: Item): Item {
  // "C. Configure x -- Not possible" / "D. ... -- Correct"
  const m = /^(.*?)\s*-{2,}\s*(.+)$/.exec(item.text);
  if (m && m[1].length > 0) return { ...item, text: m[1].trim(), note: m[2].trim() };
  return item;
}

function cleanAnswerText(text: string): string {
  return text
    .replace(/\s*Most Voted\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const isBlank = (s: string | undefined) => s === undefined || s.trim() === '';
const endsSentence = (s: string) => /[.!?:]\s*$/.test(s);

/** Parses "B) Enable versioning + C) Set retention + E) Expire objects". */
export function extractLetterParen(content: string): Item[] {
  const re = /(?:^|[:+,&]\s*|\band\s+)\(?([A-F])\)\s*/g;
  const marks: { letter: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) marks.push({ letter: m[1], start: m.index, end: re.lastIndex });
  return marks.map((mark, i) => ({
    letter: mark.letter,
    text: content
      .slice(mark.end, marks[i + 1]?.start ?? content.length)
      .replace(/\s*(?:\+|,|&|\band)\s*$/i, '')
      .trim(),
  }));
}

/** Collects consecutive lettered lines (allowing blank lines and wrapped continuation lines). */
function collectRun(lines: string[], start: number): { items: Item[]; end: number } {
  const items: Item[] = [];
  let i = start;
  while (i < lines.length) {
    // Only the first answer line may use the bare "B Text" form; later ones would collide with prose like "A VPC endpoint…".
    const match = (l: string) => (items.length === 0 ? matchLettered(l, true) : LETTERED.test(l) ? matchLettered(l, true) : null);
    const item = match(lines[i]);
    if (item && !items.some((it) => it.letter === item.letter)) {
      i++;
      while (i < lines.length && !isBlank(lines[i]) && !matchLettered(lines[i], true) && !endsSentence(item.text)) {
        item.text += ' ' + lines[i].trim();
        i++;
      }
      items.push(item);
      continue;
    }
    if (isBlank(lines[i])) {
      let j = i;
      while (j < lines.length && isBlank(lines[j])) j++;
      const next = j < lines.length ? match(lines[j]) : null;
      if (next && items.length > 0 && !items.some((it) => it.letter === next.letter)) {
        i = j;
        continue;
      }
    }
    break;
  }
  return { items, end: i };
}

/** Reads a paragraph (until blank line) starting at `start`. */
function readParagraph(lines: string[], start: number): { text: string; end: number } {
  let i = start;
  while (i < lines.length && isBlank(lines[i])) i++;
  const parts: string[] = [];
  while (i < lines.length && !isBlank(lines[i])) parts.push(lines[i++].trim());
  return { text: parts.join(' '), end: i };
}

function detectRequired(text: string): number {
  const m = CHOOSE.exec(text);
  if (!m) return 1;
  const v = m[1].toLowerCase();
  return NUMBER_WORDS[v] ?? Number(v);
}

function lettersFromVerdict(s: string): string[] {
  return [...new Set(s.match(/\b[A-F]\b/g) ?? [])];
}

function consecutiveFromA(items: Item[]): boolean {
  return items.every((it, i) => it.letter === String.fromCharCode(65 + i));
}

function extractHints(explanation: string): OptionHint[] {
  const hints = new Map<string, string>();
  const sentences = explanation.split(/(?<=[.!?])\s+|\n+/);
  for (const sentence of sentences) {
    const re = /\bOptions?\s+([A-F])\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sentence))) {
      if (!hints.has(m[1])) hints.set(m[1], sentence.trim());
    }
  }
  return [...hints.entries()].sort().map(([letter, text]) => ({ letter, text }));
}

function cleanExplanation(lines: string[]): string {
  return lines
    .join('\n')
    .replace(/^\s*Explanation\s*:\s*/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type BlockOutcome = { ok: ParsedQuestion } | { fail: string };

function parseBlock(block: Block): BlockOutcome {
  const { lines } = block;
  const raw = lines.join('\n').trim();
  if (raw === '') return { fail: 'Empty placeholder (no question text)' };

  const warnings = [...block.warnings];
  let seenQuestionMark = false;
  let markerIndex = -1;
  let labelContent: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const label = ANSWER_LABEL.exec(lines[i]);
    if (label) {
      markerIndex = i;
      labelContent = label[1].trim();
      break;
    }
    if (matchLettered(lines[i], seenQuestionMark)) {
      markerIndex = i;
      break;
    }
    if (/\?\s*$/.test(lines[i]) || CHOOSE.test(lines[i])) seenQuestionMark = true;
  }

  let items: Item[] = [];
  let textAnswer = '';
  let answerEnd: number;
  let questionLines: string[];

  if (markerIndex === -1) {
    // Unlabeled answer: first paragraph after the question line.
    const qEnd = lines.findIndex((l) => /\?\s*$/.test(l) || CHOOSE.test(l));
    if (qEnd === -1) return { fail: 'No answer found (no answer marker and no "?" question line)' };
    questionLines = lines.slice(0, qEnd + 1);
    const para = readParagraph(lines, qEnd + 1);
    textAnswer = para.text;
    answerEnd = para.end;
  } else {
    questionLines = lines.slice(0, markerIndex);
    if (labelContent === null) {
      const run = collectRun(lines, markerIndex);
      items = run.items;
      answerEnd = run.end;
    } else if (labelContent === '') {
      // "Correct answer is :" with the answer on the following line(s).
      let j = markerIndex + 1;
      while (j < lines.length && isBlank(lines[j])) j++;
      const run = collectRun(lines, j);
      if (run.items.length > 0) {
        items = run.items;
        answerEnd = run.end;
      } else {
        const para = readParagraph(lines, j);
        textAnswer = para.text;
        answerEnd = para.end;
      }
    } else {
      items = extractLetterParen(labelContent);
      if (items.length === 0) {
        const single = matchLettered(labelContent, true);
        if (single) items = [single];
      }
      answerEnd = markerIndex + 1;
      if (items.length === 0) {
        const parts = [labelContent];
        while (answerEnd < lines.length && !isBlank(lines[answerEnd]) && !endsSentence(parts[parts.length - 1])) {
          parts.push(lines[answerEnd++].trim());
        }
        textAnswer = parts.join(' ');
      }
    }
  }

  const questionText = questionLines
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  if (questionText.length < MIN_QUESTION_LENGTH) {
    return { fail: `Question text missing or too short ("${questionText.slice(0, 40)}")` };
  }
  if (/^[a-z]/.test(questionText)) warnings.push('Question text starts lowercase — may be truncated');

  const requiredCount = detectRequired(questionText);
  let explanationLines = lines.slice(answerEnd);

  // A standalone verdict line ("D and E") anywhere after the answer region.
  let verdict: string[] | null = null;
  const verdictIdx = explanationLines.findIndex((l) => VERDICT.test(l) || VERDICT_LABEL.test(l));
  if (verdictIdx !== -1) {
    verdict = lettersFromVerdict(explanationLines[verdictIdx].replace(/^\s*(?:[Cc]orrect\s+)?[Aa]nswers?\s*:/, ''));
    explanationLines = explanationLines.filter((_, i) => i !== verdictIdx);
  }

  let options: Option[] | null = null;
  let correct: string[] = [];
  let correctText = '';

  if (items.length > 0) {
    const annotated = items.filter((it) => it.note && /^correct\b/i.test(it.note));
    const fullList = items.length >= 3 && items.length > requiredCount && consecutiveFromA(items);
    const asOptions = (): Option[] => items.map(({ letter, text }) => ({ letter, text: cleanAnswerText(text) }));

    if (verdict) {
      if (items.length > requiredCount) options = asOptions();
      correct = verdict;
    } else if (annotated.length > 0) {
      options = asOptions();
      correct = annotated.map((it) => it.letter);
    } else if (fullList) {
      return { fail: `Options A–${items[items.length - 1].letter} listed but no correct answer is marked` };
    } else if (items.length > requiredCount) {
      return {
        fail: `Ambiguous: ${items.length} lettered lines (${items.map((i) => i.letter).join(', ')}) but question requires ${requiredCount} and no verdict`,
      };
    } else {
      correct = items.map((it) => it.letter);
    }
    const byLetter = new Map(items.map((it) => [it.letter, cleanAnswerText(it.text)]));
    correctText = correct.map((l) => (correct.length > 1 ? `${l}) ` : '') + (byLetter.get(l) ?? '')).join('\n');
  } else {
    correctText = cleanAnswerText(textAnswer);
    const single = matchLettered(correctText, true);
    if (single) {
      correct = [single.letter];
      correctText = cleanAnswerText(single.text);
    }
  }

  // Multi-select answers sometimes appear further down, separated by explanation paragraphs.
  if (!options && correct.length > 0 && correct.length < requiredCount) {
    const remaining: string[] = [];
    for (const l of explanationLines) {
      const strict = LETTERED.exec(l);
      if (strict && correct.length < requiredCount && !correct.includes(strict[1])) {
        correct.push(strict[1]);
        correctText += `\n${strict[1]}) ${cleanAnswerText(strict[2])}`;
        warnings.push(`Answer ${strict[1]} found later in the explanation`);
      } else {
        remaining.push(l);
      }
    }
    explanationLines = remaining;
    if (correctText && !correctText.startsWith(`${correct[0]}) `) && correct.length > 1) {
      correctText = `${correct[0]}) ${correctText}`;
    }
  }

  // "The correct option ... is:" followed by a lettered line overrides the listed answer.
  for (let i = 0; i < explanationLines.length; i++) {
    if (/\bcorrect (?:option|answer)\b.*(?:\bis|:)\s*:?\s*$/i.test(explanationLines[i])) {
      let j = i + 1;
      while (j < explanationLines.length && isBlank(explanationLines[j])) j++;
      const m = LETTERED.exec(explanationLines[j] ?? '');
      if (m && requiredCount === 1 && !correct.includes(m[1])) {
        warnings.push(`Listed answer ${correct.join(',') || '(none)'} overridden by explanation ("${m[1]}")`);
        correct = [m[1]];
        correctText = cleanAnswerText(m[2]);
      }
      break;
    }
  }

  const explanation = cleanExplanation(explanationLines);

  if (correct.length === 0) {
    const m = /\b[Cc]orrect answer\s*(?:is)?\s*:?\s*([A-F])\b/.exec(explanation);
    if (m) correct = [m[1]];
  }

  if (correct.length === 0 && correctText.length < 3) return { fail: 'No answer found' };
  if (correct.length === 0) warnings.push('Answer letter unknown (answer text only)');
  if (correct.length > 0 && correct.length !== requiredCount) {
    warnings.push(`Question requires ${requiredCount} answer(s) but ${correct.length} found`);
  }
  if (!explanation) warnings.push('No explanation');

  return {
    ok: {
      id: block.id,
      text: questionText,
      options,
      correct: [...correct].sort(),
      correctText: correct.length > 1 ? correctText.split('\n').sort().join('\n') : correctText,
      explanation,
      requiredCount,
      optionHints: extractHints(explanation),
      warnings,
      line: block.line,
      raw,
    },
  };
}

export function parseQuestions(source: string): ParseResult {
  const lines = normalizeSource(source).split('\n');
  const blocks = splitBlocks(lines);
  const questions: ParsedQuestion[] = [];
  const failures: ParseFailure[] = [];

  for (const block of blocks) {
    const outcome: BlockOutcome = block.rejectReason ? { fail: block.rejectReason } : parseBlock(block);
    if ('ok' in outcome) questions.push(outcome.ok);
    else failures.push({ id: block.id, line: block.line, reason: outcome.fail, raw: block.lines.join('\n').trim() });
  }

  failures.sort((a, b) => a.line - b.line);
  return { questions, failures };
}

/** IDs missing between 1 and the highest parsed/failed ID. */
export function findIdGaps(result: ParseResult): number[] {
  const ids = new Set<number>([...result.questions.map((q) => q.id), ...result.failures.map((f) => f.id ?? 0)]);
  const max = Math.max(0, ...ids);
  const gaps: number[] = [];
  for (let i = 1; i <= max; i++) if (!ids.has(i)) gaps.push(i);
  return gaps;
}
