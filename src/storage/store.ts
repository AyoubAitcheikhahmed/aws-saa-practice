import { useSyncExternalStore } from 'react';
import type { AppData, QuestionProgress, Rating, Settings } from '../types';
import { newSrs, review } from '../srs';
import { loadJSON, saveJSON } from './storage';

const DATA_KEY = 'data';

export const DEFAULT_SETTINGS: Settings = {
  dark: typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches,
  accommodation: false,
  shuffleFlashcards: true,
};

export function emptyData(): AppData {
  return { version: 1, progress: {}, edits: {}, exams: [], activeExam: null, activity: {}, settings: { ...DEFAULT_SETTINGS } };
}

function normalize(d: Partial<AppData>): AppData {
  const base = emptyData();
  return { ...base, ...d, version: 1, settings: { ...base.settings, ...d.settings } };
}

let state: AppData = normalize(loadJSON<Partial<AppData>>(DATA_KEY, {}));
const listeners = new Set<() => void>();

export function getData(): AppData {
  return state;
}

export function setData(updater: (s: AppData) => AppData) {
  state = updater(state);
  saveJSON(DATA_KEY, state);
  listeners.forEach((l) => l());
}

export function replaceData(next: Partial<AppData>) {
  setData(() => normalize(next));
}

export function useAppData(): AppData {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function emptyProgress(): QuestionProgress {
  return { seen: 0, correct: 0, wrong: 0, guessed: 0, lastSeen: null, lastResult: null, srs: newSrs(), starred: false, note: '' };
}

export function getProgress(data: AppData, id: number): QuestionProgress {
  return data.progress[id] ?? emptyProgress();
}

export function updateProgress(id: number, fn: (p: QuestionProgress) => QuestionProgress) {
  setData((s) => ({ ...s, progress: { ...s.progress, [id]: fn(s.progress[id] ?? emptyProgress()) } }));
}

export function updateSettings(patch: Partial<Settings>) {
  setData((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

const pad = (n: number) => String(n).padStart(2, '0');
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface AnswerRecord {
  id: number;
  correct: boolean;
  guessed: boolean;
  /** Explicit SRS rating (flashcards); otherwise derived from the outcome. */
  rating?: Rating;
}

export function recordAnswers(records: AnswerRecord[]) {
  if (records.length === 0) return;
  const now = Date.now();
  const day = dayKey(now);
  setData((s) => {
    const progress = { ...s.progress };
    for (const r of records) {
      const p = progress[r.id] ?? emptyProgress();
      const rating: Rating = r.rating ?? (!r.correct ? 'again' : r.guessed ? 'hard' : 'good');
      progress[r.id] = {
        ...p,
        seen: p.seen + 1,
        correct: p.correct + (r.correct ? 1 : 0),
        wrong: p.wrong + (r.correct ? 0 : 1),
        guessed: p.guessed + (r.correct && r.guessed ? 1 : 0),
        lastSeen: now,
        lastResult: !r.correct ? 'wrong' : r.guessed ? 'guessed' : 'correct',
        srs: review(p.srs, rating, now),
      };
    }
    return { ...s, progress, activity: { ...s.activity, [day]: (s.activity[day] ?? 0) + records.length } };
  });
}
