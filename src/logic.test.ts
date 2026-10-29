import { describe, expect, it } from 'vitest';
import { buildChoices, seededRandom, withChoices } from './choices';
import { gradeAnswer, scaledScore, scoreExam } from './exam';
import { review, newSrs } from './srs';
import { drawExamQuestions } from './sessions';
import { detectDomain, detectTags } from './tagging/tagging';
import type { Domain, Question } from './types';

const q = (id: number, over: Partial<Question> = {}): Question => ({
  id,
  text: 'A company …',
  options: null,
  correct: ['B'],
  correctText: 'x',
  explanation: '',
  requiredCount: 1,
  optionHints: [],
  warnings: [],
  line: 1,
  raw: '',
  tags: [],
  domain: 'secure',
  ...over,
});

describe('grading', () => {
  it('grades letters, multi-select and free text', () => {
    expect(gradeAnswer(q(1), { letters: ['B'] })).toBe(true);
    expect(gradeAnswer(q(1), { letters: ['A'] })).toBe(false);
    expect(gradeAnswer(q(1), undefined)).toBe(false);
    expect(gradeAnswer(q(2, { correct: ['B', 'D'], requiredCount: 2 }), { letters: ['D', 'B'] })).toBe(true);
    expect(gradeAnswer(q(2, { correct: ['B', 'D'], requiredCount: 2 }), { letters: ['B'] })).toBe(false);
    expect(gradeAnswer(q(3), { letters: [], freeText: 'SQS' })).toBeNull();
    expect(gradeAnswer(q(3), { letters: [], freeText: 'SQS', selfGrade: true })).toBe(true);
  });

  it('maps raw score to an approximate scaled score with 72% = 720', () => {
    expect(scaledScore(0)).toBe(100);
    expect(scaledScore(0.72)).toBe(720);
    expect(scaledScore(1)).toBe(1000);
  });

  it('scores per domain', () => {
    const byId = new Map([
      [1, q(1, { domain: 'cost' })],
      [2, q(2, { domain: 'secure' })],
    ]);
    const s = scoreExam({ questionIds: [1, 2], answers: { 1: { letters: ['B'] }, 2: { letters: ['C'] } } }, byId);
    expect(s.correct).toBe(1);
    expect(s.perDomain.cost).toEqual({ correct: 1, total: 1 });
    expect(s.perDomain.secure).toEqual({ correct: 0, total: 1 });
  });
});

describe('generated choices', () => {
  const bank = [
    q(1, { correctText: 'Use customer managed KMS keys with SSE-KMS.', tags: ['KMS', 'S3'] }),
    q(2, { correct: ['A'], correctText: 'Use S3 Object Lock in compliance mode.', tags: ['S3'] }),
    q(3, { correct: ['C'], correctText: 'Enable S3 versioning and MFA Delete on the bucket.', tags: ['S3'] }),
    q(4, { correct: ['D'], correctText: 'Use SSE-S3 with Amazon S3 managed keys for the bucket.', tags: ['S3', 'KMS'] }),
    q(5, { correct: ['B', 'E'], requiredCount: 2, correctText: 'B) Create an SQS queue.\nE) Use a Lambda function.', tags: ['SQS'] }),
    q(6, { correct: [], correctText: 'Use AWS Global Accelerator in front of the NLBs.', tags: ['Global Accelerator'] }),
    q(7, { correct: ['A'], correctText: 'Use an S3 gateway VPC endpoint in the route table.', tags: ['S3', 'VPC'] }),
    q(8, { correct: ['B'], correctText: 'Configure an S3 Lifecycle rule to Glacier Deep Archive.', tags: ['S3'] }),
  ];

  it('keeps the correct answer at its original letter and fills other slots with different answers', () => {
    const c = buildChoices(bank[0], bank, seededRandom('x'));
    expect(c.options.map((o) => o.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(c.correct).toEqual(['B']);
    expect(c.options[1].text).toBe(bank[0].correctText);
    expect(new Set(c.options.map((o) => o.text)).size).toBe(4);
    expect(gradeAnswer(withChoices(bank[0], c), { letters: ['B'] })).toBe(true);
  });

  it('uses 5 options for choose-two and assigns a letter to text-only answers', () => {
    const multi = buildChoices(bank[4], bank, seededRandom('y'));
    expect(multi.options).toHaveLength(5);
    expect(multi.correct).toEqual(['B', 'E']);
    expect(multi.options[4].text).toBe('Use a Lambda function.');

    const textOnly = buildChoices(bank[5], bank, seededRandom('z'));
    expect(textOnly.correct).toHaveLength(1);
    expect(textOnly.options.find((o) => o.letter === textOnly.correct[0])?.text).toBe(bank[5].correctText);
  });
});

describe('SRS', () => {
  it('grows intervals on success and resets on again', () => {
    const now = 0;
    const a = review(newSrs(), 'good', now);
    const b = review(a, 'good', now);
    const c = review(b, 'good', now);
    expect([a.interval, b.interval]).toEqual([1, 4]);
    expect(c.interval).toBeGreaterThan(b.interval);
    const lapse = review(c, 'again', now);
    expect(lapse.reps).toBe(0);
    expect(lapse.due).toBe(10 * 60_000);
    expect(lapse.ease).toBeLessThan(c.ease);
  });
});

describe('tagging', () => {
  it('detects services and synonyms', () => {
    const tags = detectTags('Use a customer-managed key for the bucket and an SQS dead-letter queue behind an ALB');
    expect(tags).toEqual(expect.arrayContaining(['KMS', 'S3', 'SQS', 'ELB']));
  });

  it('detects domains', () => {
    expect(detectDomain('Which solution will meet these requirements MOST cost-effectively?')).toBe('cost');
    expect(detectDomain('The data must be encrypted at rest and access restricted with least privilege.')).toBe('secure');
    expect(detectDomain('The application must be highly available with automatic failover.')).toBe('resilient');
    expect(detectDomain('Users report high latency; reduce latency for global users.')).toBe('performance');
  });
});

describe('exam draw', () => {
  it('draws 65 unique questions weighted by domain', () => {
    const domains: Domain[] = ['secure', 'resilient', 'performance', 'cost'];
    const pool = Array.from({ length: 400 }, (_, i) => q(i + 1, { domain: domains[i % 4] }));
    const ids = drawExamQuestions(pool, 65);
    expect(new Set(ids).size).toBe(65);
    const count = (d: Domain) => ids.filter((id) => pool[id - 1].domain === d).length;
    const exact = { secure: 19.5, resilient: 16.9, performance: 15.6, cost: 13 };
    for (const d of domains) expect(Math.abs(count(d) - exact[d])).toBeLessThan(1);
  });
});
