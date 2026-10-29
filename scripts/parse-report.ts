import { readFileSync } from 'node:fs';
import { findIdGaps, parseQuestions } from '../src/parser/parseQuestions';

const path = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'data-source/aws-saa-c03-questions';
const result = parseQuestions(readFileSync(path, 'utf8'));
const { questions, failures } = result;

const count = (pred: (q: (typeof questions)[number]) => boolean) => questions.filter(pred).length;
const warningCounts = new Map<string, number>();
for (const q of questions) {
  for (const w of q.warnings) {
    const key = w.replace(/\d+/g, 'N').replace(/"[^"]*"/g, '"…"');
    warningCounts.set(key, (warningCounts.get(key) ?? 0) + 1);
  }
}

console.log(`Source: ${path}`);
console.log(`Parsed questions:        ${questions.length}`);
console.log(`  with answer letter(s): ${count((q) => q.correct.length > 0)}`);
console.log(`  answer text only:      ${count((q) => q.correct.length === 0)}`);
console.log(`  with options A-F:      ${count((q) => q.options !== null)}`);
console.log(`  multi-select:          ${count((q) => q.requiredCount > 1)}`);
console.log(`  with option hints:     ${count((q) => q.optionHints.length > 0)}`);
console.log(`Failures:                ${failures.length}`);
console.log(`ID gaps:                 ${findIdGaps(result).join(', ') || 'none'}`);
console.log('\nWarnings:');
for (const [w, n] of [...warningCounts].sort((a, b) => b[1] - a[1])) console.log(`  ${n}x ${w}`);
console.log('\nFailures:');
for (const f of failures) console.log(`  #${f.id} (line ${f.line}): ${f.reason}`);
if (process.argv.includes('--warnings')) {
  console.log('\nQuestions with warnings:');
  for (const q of questions.filter((q) => q.warnings.length)) console.log(`  #${q.id}: ${q.warnings.join(' | ')}`);
}
