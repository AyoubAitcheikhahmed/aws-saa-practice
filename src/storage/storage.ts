export interface StorageBackend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

const PREFIX = 'saa-trainer:';

const memory = new Map<string, string>();
const hasLocalStorage = typeof localStorage !== 'undefined';

export const localStorageBackend: StorageBackend = hasLocalStorage
  ? {
      get: (key) => localStorage.getItem(PREFIX + key),
      set: (key, value) => localStorage.setItem(PREFIX + key, value),
      remove: (key) => localStorage.removeItem(PREFIX + key),
    }
  : {
      get: (key) => memory.get(key) ?? null,
      set: (key, value) => void memory.set(key, value),
      remove: (key) => void memory.delete(key),
    };

let backend: StorageBackend = localStorageBackend;

/** Swap the persistence layer (e.g. for IndexedDB or tests). */
export function setStorageBackend(next: StorageBackend) {
  backend = next;
}

export function loadText(key: string): string | null {
  return backend.get(key);
}

export function saveText(key: string, value: string) {
  backend.set(key, value);
}

export function removeKey(key: string) {
  backend.remove(key);
}

export function loadJSON<T>(key: string, fallback: T): T {
  const raw = backend.get(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown) {
  backend.set(key, JSON.stringify(value));
}
