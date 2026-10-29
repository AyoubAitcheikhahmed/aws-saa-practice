export type Domain = 'secure' | 'resilient' | 'performance' | 'cost';

export interface Option {
  letter: string;
  text: string;
}

export interface OptionHint {
  letter: string;
  text: string;
}

/** Output of the parser; tags/domain are added by the tagging step. */
export interface ParsedQuestion {
  id: number;
  text: string;
  options: Option[] | null;
  /** Sorted letters, e.g. ["B","C","E"]. Empty when the source only gives the answer text. */
  correct: string[];
  correctText: string;
  explanation: string;
  requiredCount: number;
  optionHints: OptionHint[];
  warnings: string[];
  /** 1-based line in the source file where the question starts. */
  line: number;
  raw: string;
}

export interface Question extends ParsedQuestion {
  tags: string[];
  domain: Domain;
  /** True when the wrong options were generated from other questions' answers. */
  optionsGenerated?: boolean;
}

export interface ParseFailure {
  id: number | null;
  line: number;
  reason: string;
  raw: string;
}

export interface ParseResult {
  questions: ParsedQuestion[];
  failures: ParseFailure[];
}

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface SrsState {
  ease: number;
  /** Days until next review after the last successful review. */
  interval: number;
  reps: number;
  /** Epoch ms; 0 = never reviewed. */
  due: number;
}

export interface QuestionProgress {
  seen: number;
  correct: number;
  wrong: number;
  /** Correct answers that were marked "I guessed" — still counted as weak. */
  guessed: number;
  lastSeen: number | null;
  lastResult: 'correct' | 'wrong' | 'guessed' | null;
  srs: SrsState;
  starred: boolean;
  note: string;
}

export interface QuestionEdit {
  tags?: string[];
  domain?: Domain;
}

export interface ExamAnswer {
  letters: string[];
  freeText?: string;
  /** Self-grade for free-text answers; undefined = not graded yet. */
  selfGrade?: boolean;
}

export interface ExamSession {
  id: string;
  kind: 'full' | 'custom' | 'retry';
  questionIds: number[];
  answers: Record<number, ExamAnswer>;
  flagged: number[];
  guessed: number[];
  timePerQ: Record<number, number>;
  durationMs: number;
  elapsedMs: number;
  currentIndex: number;
  startedAt: number;
  reviewing: boolean;
  /** Options shown per question, fixed at exam start so letters survive refresh and review. */
  choices?: Record<number, { options: Option[]; correct: string[] }>;
}

export interface ExamResult {
  id: string;
  kind: ExamSession['kind'];
  date: number;
  questionIds: number[];
  answers: Record<number, ExamAnswer>;
  flagged: number[];
  guessed: number[];
  timePerQ: Record<number, number>;
  durationMs: number;
  timeUsedMs: number;
  choices?: ExamSession['choices'];
}

export interface Settings {
  dark: boolean;
  accommodation: boolean;
  shuffleFlashcards: boolean;
}

export interface AppData {
  version: 1;
  progress: Record<number, QuestionProgress>;
  edits: Record<number, QuestionEdit>;
  exams: ExamResult[];
  activeExam: ExamSession | null;
  /** yyyy-mm-dd → answers recorded that day. */
  activity: Record<string, number>;
  settings: Settings;
}
