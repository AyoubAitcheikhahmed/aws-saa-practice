import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseQuestions } from '../src/parser/parseQuestions';
import { serializeFailures, serializeQuestions } from '../src/parser/serialize';

const source = process.argv[2] ?? 'data-source/aws-saa-c03-questions';
const SOLVED = 'data-source/solved-questions.txt';
const { questions, failures } = parseQuestions(readFileSync(source, 'utf8'));

// Hand-solved questions fill entries the source left without an answer.
const solved = existsSync(SOLVED) ? parseQuestions(readFileSync(SOLVED, 'utf8')) : { questions: [], failures: [] };
if (solved.failures.length) {
  console.error('solved-questions.txt has unparseable entries:', solved.failures.map((f) => `#${f.id}: ${f.reason}`));
  process.exit(1);
}
const existing = new Set(questions.map((q) => q.id));
const added = solved.questions.filter((q) => !existing.has(q.id));
const addedIds = new Set(added.map((q) => q.id));
const sorted = [...questions, ...added].sort((a, b) => a.id - b.id);
const remaining = failures.filter((f) => f.id === null || !addedIds.has(f.id));

writeFileSync('data-source/questions.txt', serializeQuestions(sorted));
writeFileSync(
  'data-source/questions.json',
  JSON.stringify(
    sorted.map(({ raw: _raw, line: _line, ...q }) => q),
    null,
    2,
  ) + '\n',
);
writeFileSync('data-source/needs-review.txt', serializeFailures(remaining));

console.log(`Wrote ${sorted.length} questions (${added.length} from ${SOLVED}) to data-source/questions.txt and questions.json`);
console.log(`Wrote ${remaining.length} unparseable entries to data-source/needs-review.txt`);
