import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import bundledSource from '../../data-source/questions.txt?raw';
import { parseQuestions } from '../parser/parseQuestions';
import { applyEdits, tagQuestion } from '../tagging/tagging';
import { loadText, removeKey, saveText } from '../storage/storage';
import { useAppData } from '../storage/store';
import type { ParseResult, Question } from '../types';

const SOURCE_KEY = 'source';

interface QuestionBank {
  questions: Question[];
  byId: Map<number, Question>;
  parsed: ParseResult;
  isImported: boolean;
  importSource: (text: string) => ParseResult;
  resetSource: () => void;
}

const Ctx = createContext<QuestionBank | null>(null);

export function QuestionBankProvider({ children }: { children: ReactNode }) {
  const [imported, setImported] = useState<string | null>(() => loadText(SOURCE_KEY));
  const source = imported ?? bundledSource;
  const parsed = useMemo(() => parseQuestions(source), [source]);
  const base = useMemo(() => parsed.questions.map(tagQuestion), [parsed]);
  const { edits } = useAppData();
  const questions = useMemo(() => applyEdits(base, edits), [base, edits]);
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  const value: QuestionBank = {
    questions,
    byId,
    parsed,
    isImported: imported !== null,
    importSource: (text) => {
      const result = parseQuestions(text);
      if (result.questions.length > 0) {
        saveText(SOURCE_KEY, text);
        setImported(text);
      }
      return result;
    },
    resetSource: () => {
      removeKey(SOURCE_KEY);
      setImported(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useQuestionBank(): QuestionBank {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useQuestionBank must be used inside QuestionBankProvider');
  return ctx;
}
