import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractLetterParen, findIdGaps, parseQuestions } from './parseQuestions';
import { serializeQuestions } from './serialize';
import type { ParsedQuestion } from '../types';

const SEP = '----------------------------------------------------------------------';
const one = (src: string) => {
  const r = parseQuestions(src);
  expect(r.failures).toEqual([]);
  expect(r.questions).toHaveLength(1);
  return r.questions[0];
};

describe('parseQuestions', () => {
  it('parses the "Answer:" / "Answers:" format with dash separators', () => {
    const src = `678]A company stores sensitive data in Amazon S3. A solutions architect needs to create an encryption solution.
Which solution will meet these requirements?

Answer: B) Use customer-managed KMS keys (SSE-KMS).
Grants full control over key rotation/access. SSE-S3 (Option A) lacks key management.
Client-side encryption (Option D) is complex.
${SEP}

679]A company wants to back up its on-premises virtual machines (VMs) to AWS. The S3 backups must be retained for 30 days.
Which combination of steps will meet these requirements? (Choose three.)

Answers: B) Enable versioning + C) Set 30-day retention + E) Expire objects after 30 days.
Versioning + retention policies automate compliance.
${SEP}`;
    const { questions, failures } = parseQuestions(src);
    expect(failures).toEqual([]);
    expect(questions.map((q) => q.id)).toEqual([678, 679]);

    const [q1, q2] = questions;
    expect(q1.correct).toEqual(['B']);
    expect(q1.correctText).toBe('Use customer-managed KMS keys (SSE-KMS).');
    expect(q1.options).toBeNull();
    expect(q1.requiredCount).toBe(1);
    expect(q1.text).toMatch(/^A company stores.*\nWhich solution/s);
    expect(q1.explanation).toMatch(/^Grants full control.*is complex\.$/s);
    expect(q1.optionHints.map((h) => h.letter)).toEqual(['A', 'D']);

    expect(q2.correct).toEqual(['B', 'C', 'E']);
    expect(q2.requiredCount).toBe(3);
    expect(q2.correctText).toBe('B) Enable versioning\nC) Set 30-day retention\nE) Expire objects after 30 days.');
    expect(q2.warnings).toEqual([]);
  });

  it('handles Windows line endings, smart quotes and tabs', () => {
    const q = one(
      '12] A company\u2019s \u201Cweb\u201D application runs on EC2 behind an ALB.\r\nWhat should a solutions architect do?\r\n\r\n\tA. Use Amazon CloudFront.\r\n\r\nCloudFront caches content.\r\n',
    );
    expect(q.text).toContain(`company's "web" application`);
    expect(q.correct).toEqual(['A']);
    expect(q.correctText).toBe('Use Amazon CloudFront.');
    expect(q.explanation).toBe('CloudFront caches content.');
  });

  it('parses dot-style headers with IMP prefix and no separators', () => {
    const { questions, failures } = parseQuestions(`50] A company runs 1,000 EC2 instances and needs to patch quickly.
What should a solutions architect do?

D. Use AWS Systems Manager Run Command.

51.A company wants to send a report to several email addresses every morning.
Which combination of steps should a solutions architect take? (Choose two.)
 D. Create an EventBridge scheduled event that invokes a Lambda function.
B. Use Amazon SES to send the report by email.

IMP>>>>>>52.A company wants a standard file system that scales automatically.
Which solution will meet these requirements?
C. Use Amazon EFS for storage.
`);
    expect(failures).toEqual([]);
    expect(questions.map((q) => q.id)).toEqual([50, 51, 52]);
    expect(questions[1].correct).toEqual(['B', 'D']);
    expect(questions[1].requiredCount).toBe(2);
    expect(questions[2].text.startsWith('A company wants a standard')).toBe(true);
    expect(questions[2].correct).toEqual(['C']);
  });

  it('does not treat numbered lists in explanations as question headers', () => {
    const q = one(`33] A company runs an online marketplace and needs near-real-time sharing of transactions.
What should a solutions architect recommend?

C. Stream the transactions data into Amazon Kinesis Data Streams.

1. Real-time Data Stream: Kinesis ingests data in real time.

2. Data Transformation: Lambda removes sensitive data.
${SEP}`);
    expect(q.explanation).toContain('2. Data Transformation');
  });

  it('uses a full option list with a "D and E" verdict and strips "--" notes', () => {
    const q = one(`IMP>>>>>157.A company stores data in an Aurora PostgreSQL DB cluster for 5 years.

Which combination of steps should a solutions architect take? (Choose two.)
A. Take a manual snapshot of the DB cluster.--- No since automation asked
B. Create a lifecycle policy for the automated backups.--- Lifecycle policy there for S3
C. Configure automated backup retention for 5 years. -- Not possible
D. Configure an Amazon CloudWatch Logs export for the DB cluster. -- Correct
E. Use AWS Backup to take the backups and to keep the backups for 5 years.-- Correct

D and E
`);
    expect(q.options).toHaveLength(5);
    expect(q.options?.[0]).toEqual({ letter: 'A', text: 'Take a manual snapshot of the DB cluster.' });
    expect(q.correct).toEqual(['D', 'E']);
    expect(q.explanation).toBe('');
  });

  it('reports option lists without an answer as failures', () => {
    const r = parseQuestions(`IMP>>>>>160.An ecommerce company needs a DR backup accessible in milliseconds for 30 days.

Which solution meets these requirements MOST cost-effectively?

    A. Amazon OpenSearch Service
    B. Amazon S3 Glacier
    C. Amazon S3 Standard
    D. Amazon RDS for PostgreSQL
`);
    expect(r.questions).toHaveLength(0);
    expect(r.failures[0].reason).toMatch(/no correct answer is marked/);
    expect(r.failures[0].raw).toContain('Amazon S3 Glacier');
  });

  it('parses "ans-" answers and recovers the letter from "Correct answer A:"', () => {
    const q = one(`1] A company collects 500 GB per site daily and must aggregate it quickly in one S3 bucket.
Which solution meets these requirements

ans- Turn on S3 Transfer Acceleration on the destination S3 bucket. Use multipart uploads.

Correct answer A: S3 Transfer Acceleration because:
- uses Edge Locations
${SEP}`);
    expect(q.correctText).toBe('Turn on S3 Transfer Acceleration on the destination S3 bucket. Use multipart uploads.');
    expect(q.correct).toEqual(['A']);
  });

  it('keeps answer text without a letter as a warning, not a failure', () => {
    const q = one(`19] A company deployed a third-party firewall appliance in an inspection VPC.
Which solution will meet these requirements with the LEAST operational overhead?

 Deploy a Gateway Load Balancer in the inspection VPC.

 Gateway Load Balancer operates at layer 3.
${SEP}`);
    expect(q.correct).toEqual([]);
    expect(q.correctText).toBe('Deploy a Gateway Load Balancer in the inspection VPC.');
    expect(q.explanation).toBe('Gateway Load Balancer operates at layer 3.');
    expect(q.warnings).toContain('Answer letter unknown (answer text only)');
  });

  it('handles "Correct answer is :" followed by the answer on the next lines (wrapped)', () => {
    const q = one(`120.A company has a self-managed DNS solution on EC2 behind NLBs in two Regions.
Which solution can the company use to route traffic to all the EC2 instances?
---------------------------------------

Correct answer is :
B. Create a standard accelerator in AWS Global Accelerator. Add the two NLBs as
endpoints for the endpoint groups.

Explanation: Global Accelerator supports TCP/UDP.
`);
    expect(q.correct).toEqual(['B']);
    expect(q.correctText).toBe(
      'Create a standard accelerator in AWS Global Accelerator. Add the two NLBs as endpoints for the endpoint groups.',
    );
    expect(q.explanation).toBe('Global Accelerator supports TCP/UDP.');
  });

  it('handles bare letters, blank lines between answers, "Most Voted" and scattered answers', () => {
    const { questions, failures } = parseQuestions(`6]A company must migrate 70 TB of video files to S3 quickly.
Which solution will meet these requirements?

  B Create an AWS Snowball Edge job.

Snowball avoids network bandwidth.
${SEP}

223] A Spring Boot pod on EKS must write to DynamoDB privately.
Which combination of steps should the solutions architect take? (Choose two.)

A. Attach an IAM role that has sufficient privileges to the EKS pod. Most Voted

D. Create a VPC endpoint for DynamoDB. Most Voted

This IAM role should have the necessary permissions.
${SEP}

350] A company needs high availability and faster reporting for RDS SQL Server.
Which combination of steps will meet these requirements? (Choose two.)

A. Modify the DB instance to a Multi-AZ deployment:

Enabling Multi-AZ provides high availability.
C. Create a read replica of the DB instance. Point reports to the read replica:

Read replicas offload reporting.
${SEP}`);
    expect(failures).toEqual([]);
    const [q6, q223, q350] = questions;
    expect(q6.correct).toEqual(['B']);
    expect(q223.correct).toEqual(['A', 'D']);
    expect(q223.correctText).toBe('A) Attach an IAM role that has sufficient privileges to the EKS pod.\nD) Create a VPC endpoint for DynamoDB.');
    expect(q350.correct).toEqual(['A', 'C']);
    expect(q350.warnings).toContain('Answer C found later in the explanation');
  });

  it('renumbers a duplicate ID when the next ID is free, strips "Topic" prefixes', () => {
    const { questions } = parseQuestions(`215] A company experienced a breach and is migrating applications to EC2.
Which solution will meet these requirements?

A. Use Amazon Inspector.
${SEP}

314] A company has an on-premises MySQL database with infrequent access patterns.
Which service should a solutions architect recommend?

B. Amazon Aurora Serverless for MySQL
${SEP}

215] A company wants to scan EC2 instances for vulnerabilities and send a report.
Which solution will meet these requirements?

C. Use Amazon Inspector.
${SEP}

249] 249Topic 1
A company needs SMB access to shared storage that is fully managed.
Which AWS solution meets these requirements?

D. Create an Amazon FSx for Windows File Server file system.
`);
    expect(questions.map((q) => q.id)).toEqual([215, 314, 315, 249]);
    expect(questions[2].warnings[0]).toMatch(/renumbered to 315/);
    expect(questions[3].text.startsWith('A company needs SMB')).toBe(true);
  });

  it('reports empty placeholders, too-short questions and missing answers', () => {
    const r = parseQuestions(`96.C. Users can terminate an EC2 instance in the us-east-1 Region.

207] 



${SEP}

423] Josn format
${SEP}

569] An EventBridge rule targets a third-party API that receives no traffic.
Which solution will meet these requirements?

s
${SEP}`);
    expect(r.questions).toEqual([]);
    expect(r.failures.map((f) => f.id)).toEqual([96, 207, 423, 569]);
    expect(r.failures[0].reason).toMatch(/too short/);
    expect(r.failures[1].reason).toMatch(/Empty placeholder/);
    expect(r.failures[2].reason).toMatch(/No answer/);
    expect(r.failures[3].reason).toMatch(/No answer/);
  });

  it('lets "The correct option ... is:" in the explanation override the listed answer', () => {
    const q = one(`232] A company must be notified when RDP or SSH access to an environment is established.
Which solution meets this?

B. Configure the EC2 instances with an IAM instance profile.

The correct option for notifying the operations team is:

C. Publish VPC flow logs to Amazon CloudWatch Logs.
${SEP}`);
    expect(q.correct).toEqual(['C']);
    expect(q.warnings[0]).toMatch(/overridden/);
  });

  it('extracts letter-paren answers', () => {
    expect(extractLetterParen('A) Migrate web tier to ALB + Auto Scaling + C) Migrate DB to RDS Multi-AZ.')).toEqual([
      { letter: 'A', text: 'Migrate web tier to ALB + Auto Scaling' },
      { letter: 'C', text: 'Migrate DB to RDS Multi-AZ.' },
    ]);
  });

  it('finds ID gaps', () => {
    const r = parseQuestions(`1] A company wants something fairly long here.\nWhich?\nA. Yes\n\n3] A company wants something else fairly long.\nWhich?\nB. No\n`);
    expect(findIdGaps(r)).toEqual([2]);
  });
});

describe('real source file', () => {
  const path = fileURLToPath(new URL('../../data-source/aws-saa-c03-questions', import.meta.url));
  const result = parseQuestions(readFileSync(path, 'utf8'));

  it('parses the bulk of the bank with unique IDs', () => {
    expect(result.questions.length).toBeGreaterThan(550);
    const ids = result.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('parses known questions correctly', () => {
    const byId = new Map(result.questions.map((q) => [q.id, q]));
    expect(byId.get(4)?.correct).toEqual(['A']);
    expect(byId.get(44)?.correct).toEqual(['A', 'B']);
    expect(byId.get(157)?.correct).toEqual(['D', 'E']);
    expect(byId.get(679)?.correct).toEqual(['B', 'C', 'E']);
    expect(byId.get(651)?.correct).toEqual(['C']);
    expect(byId.get(684)?.correct).toEqual(['B']);
  });

  it('round-trips through the normalized format without losing data', () => {
    const reparsed = parseQuestions(serializeQuestions(result.questions));
    expect(reparsed.failures).toEqual([]);
    const strip = (q: ParsedQuestion) => ({
      id: q.id,
      text: q.text,
      options: q.options,
      correct: q.correct,
      correctText: q.correctText,
      explanation: q.explanation,
      requiredCount: q.requiredCount,
    });
    const original = [...result.questions].sort((a, b) => a.id - b.id).map(strip);
    expect(reparsed.questions.map(strip)).toEqual(original);
  });
});
