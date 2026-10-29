import type { Domain, ParsedQuestion, Question, QuestionEdit } from '../types';

export const DOMAINS: { id: Domain; name: string; short: string; weight: number }[] = [
  { id: 'secure', name: 'Design Secure Architectures', short: 'Secure', weight: 0.3 },
  { id: 'resilient', name: 'Design Resilient Architectures', short: 'Resilient', weight: 0.26 },
  { id: 'performance', name: 'Design High-Performing Architectures', short: 'High-Performing', weight: 0.24 },
  { id: 'cost', name: 'Design Cost-Optimized Architectures', short: 'Cost-Optimized', weight: 0.2 },
];

export const domainName = (d: Domain) => DOMAINS.find((x) => x.id === d)?.short ?? d;

/** Tag → pattern. Order is the display order. */
export const TAG_PATTERNS: [string, RegExp][] = [
  ['S3', /\bS3\b|\bbuckets?\b/i],
  ['S3 Glacier', /glacier/i],
  ['KMS', /\bKMS\b|key management service|customer[- ]managed keys?|\bCMKs?\b|SSE-/i],
  ['IAM', /\bIAM\b|least privilege|assume (?:a |the )?role|trust policy|identity center|single sign-on/i],
  ['VPC', /\bVPCs?\b|subnets?|security groups?|network ACL|\bNACL/i],
  ['VPC Endpoints', /vpc endpoints?|gateway endpoints?|interface endpoints?|privatelink/i],
  ['NAT Gateway', /\bNAT\b/i],
  ['Transit Gateway', /transit gateway/i],
  ['Direct Connect', /direct connect/i],
  ['VPN', /\bVPN\b/i],
  ['Route 53', /route 53|routing policy/i],
  ['CloudFront', /cloudfront|edge locations?|lambda@edge/i],
  ['Global Accelerator', /global accelerator/i],
  ['ELB', /load balancers?|\bALB\b|\bNLB\b|\bELB\b|sticky sessions/i],
  ['Auto Scaling', /auto scaling|scaling polic|scheduled scaling|target tracking/i],
  ['EC2 Purchasing', /spot instances?|reserved instances?|savings plans?|on-demand instances?|dedicated hosts?|capacity reservation/i],
  ['EC2', /\bEC2\b|\bAMIs?\b|placement group/i],
  ['EBS', /\bEBS\b|\bgp[23]\b|\bio[12]\b|provisioned iops/i],
  ['Lambda', /lambda/i],
  ['SQS', /\bSQS\b|simple queue service|dead[- ]letter/i],
  ['SNS', /\bSNS\b|simple notification/i],
  ['Kinesis', /kinesis|firehose/i],
  ['EventBridge', /eventbridge|cloudwatch events/i],
  ['DynamoDB', /dynamodb|\bDAX\b/i],
  ['RDS', /\bRDS\b|read replicas?|multi-az/i],
  ['Aurora', /aurora/i],
  ['ElastiCache', /elasticache|redis|memcached/i],
  ['EFS', /\bEFS\b|elastic file system/i],
  ['FSx', /\bFSx\b/i],
  ['Storage Gateway', /storage gateway|file gateway|volume gateway|tape gateway/i],
  ['DataSync', /datasync/i],
  ['Snow Family', /snowball|snowcone|snowmobile/i],
  ['Transfer Family', /transfer family|\bSFTP\b|\bAS2\b/i],
  ['AWS Backup', /aws backup|backup plan|backup vault/i],
  ['CloudWatch', /cloudwatch(?! events)/i],
  ['CloudTrail', /cloudtrail/i],
  ['AWS Config', /aws config|config rules?/i],
  ['Organizations/SCP', /organizations|service control polic|\bSCPs?\b|control tower/i],
  ['Cognito', /cognito/i],
  ['Secrets Manager', /secrets manager|parameter store/i],
  ['WAF/Shield', /\bWAF\b|shield|ddos|sql injection|cross-site/i],
  ['GuardDuty', /guardduty/i],
  ['Macie', /macie/i],
  ['Inspector', /inspector/i],
  ['ECS/EKS/Fargate', /\bECS\b|\bEKS\b|fargate|kubernetes|containers?\b|containeri[sz]ed/i],
  ['API Gateway', /api gateway/i],
  ['Step Functions', /step functions/i],
  ['Athena', /athena/i],
  ['Glue', /\bglue\b/i],
  ['Redshift', /redshift/i],
  ['EMR', /\bEMR\b/i],
  ['QuickSight', /quicksight/i],
  ['Lake Formation', /lake formation/i],
  ['ACM/TLS', /certificate manager|\bACM\b|\bTLS\b|\bSSL\b|certificates?\b/i],
  ['Systems Manager', /systems manager|session manager|patch manager|run command/i],
  ['Cost Management', /cost explorer|aws budgets|cost and usage|cost allocation|cost anomaly|trusted advisor/i],
  ['Elastic Beanstalk', /beanstalk/i],
  ['CloudFormation', /cloudformation/i],
  ['DMS', /database migration service|\bDMS\b/i],
  ['Disaster Recovery', /disaster recovery|\bRPO\b|\bRTO\b|failover/i],
];

export const ALL_TAGS = TAG_PATTERNS.map(([t]) => t);

const DOMAIN_RULES: Record<Domain, [RegExp, number][]> = {
  cost: [
    [/cost-effective|lowest cost|minimi[sz]e (?:the )?costs?|reduce (?:the )?costs?|optimi[sz]e (?:the )?costs?|budget|savings/gi, 4],
    [/\bcosts?\b|pricing|expensive/gi, 1],
  ],
  secure: [
    [/secur|encrypt|least privilege|unauthori[sz]ed|compliance|audit|\bPII\b|sensitive|ddos|sql injection|malicious|permissions?|credentials/gi, 2],
    [/\bKMS\b|\bIAM\b|access/gi, 1],
  ],
  resilient: [
    [/highly available|high availability|fault[- ]toleran|disaster recovery|\bRPO\b|\bRTO\b|failover|resilien|decoupl|loosely coupled|durab|single points? of failure|data loss|lost|backup/gi, 2],
    [/multi-az|availability zones?|reliab/gi, 1],
  ],
  performance: [
    [/performance|latency|throughput|\bIOPS\b|real[- ]time|caching|millisecond|slow/gi, 2],
    [/scal|faster|quickly/gi, 1],
  ],
};

export function detectTags(text: string): string[] {
  return TAG_PATTERNS.filter(([, re]) => re.test(text)).map(([t]) => t);
}

export function detectDomain(text: string): Domain {
  let best: Domain = 'resilient';
  let bestScore = 0;
  for (const { id } of DOMAINS) {
    const score = DOMAIN_RULES[id].reduce((sum, [re, w]) => sum + (text.match(re)?.length ?? 0) * w, 0);
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

export function tagQuestion(q: ParsedQuestion): Question {
  const answerText = q.options ? q.options.filter((o) => q.correct.includes(o.letter)).map((o) => o.text).join(' ') : q.correctText;
  return { ...q, tags: detectTags(`${q.text}\n${answerText}`), domain: detectDomain(q.text) };
}

export function applyEdits(questions: Question[], edits: Record<number, QuestionEdit>): Question[] {
  return questions.map((q) => {
    const e = edits[q.id];
    return e ? { ...q, tags: e.tags ?? q.tags, domain: e.domain ?? q.domain } : q;
  });
}
