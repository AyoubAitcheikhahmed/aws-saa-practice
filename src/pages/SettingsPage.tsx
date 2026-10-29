import { useRef, useState } from 'react';
import { useQuestionBank } from '../data/questionBank';
import { emptyData, getData, replaceData, updateSettings, useAppData } from '../storage/store';
import type { AppData } from '../types';
import { Button, Card, PageHeader } from '../components/ui';

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isProgressExport(v: unknown): v is Partial<AppData> {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return o.version === 1 && typeof o.progress === 'object' && o.progress !== null && !Array.isArray(o.progress);
}

export function SettingsPage() {
  const { settings } = useAppData();
  const bank = useQuestionBank();
  const [message, setMessage] = useState<string | null>(null);
  const txtInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);

  const onImportTxt = async (file: File) => {
    const result = bank.importSource(await file.text());
    setMessage(
      result.questions.length
        ? `Imported ${file.name}: ${result.questions.length} questions, ${result.failures.length} failed. Your progress is kept (matched by question ID).`
        : `Could not find any questions in ${file.name}; nothing changed.`,
    );
  };

  const onImportJson = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isProgressExport(parsed)) throw new Error('not a trainer export');
      if (!confirm('Replace all current progress with this backup?')) return;
      replaceData(parsed);
      setMessage(`Restored progress from ${file.name}.`);
    } catch (e) {
      setMessage(`Import failed: ${(e as Error).message}`);
    }
  };

  const onExport = () => {
    download(`saa-trainer-progress-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(getData(), null, 2));
  };

  const onReset = () => {
    if (!confirm('Delete ALL progress, notes, stars, tag edits and exam history? This cannot be undone.')) return;
    if (prompt('Type RESET to confirm') !== 'RESET') return;
    replaceData({ ...emptyData(), settings });
    setMessage('Progress reset.');
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      {message && <div className="rounded-md bg-indigo-50 p-3 text-sm text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">{message}</div>}

      <Card title="Preferences">
        <div className="space-y-4 text-sm">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={settings.dark} onChange={(e) => updateSettings({ dark: e.target.checked })} className="h-4 w-4" />
            Dark mode
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.accommodation}
              onChange={(e) => updateSettings({ accommodation: e.target.checked })}
              className="h-4 w-4"
            />
            Exam with accommodation (+30 minutes) by default
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.shuffleFlashcards}
              onChange={(e) => updateSettings({ shuffleFlashcards: e.target.checked })}
              className="h-4 w-4"
            />
            Shuffle flashcards
          </label>
        </div>
      </Card>

      <Card title="Question source">
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          {bank.isImported ? 'Using an imported .txt file.' : 'Using the bundled data-source/questions.txt.'} {bank.questions.length} questions loaded,{' '}
          {bank.parsed.failures.length} failed to parse.{' '}
          <a href="#/health" className="text-indigo-600 hover:underline dark:text-indigo-400">
            Open Data health →
          </a>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => txtInput.current?.click()}>Import .txt</Button>
          {bank.isImported && (
            <Button variant="secondary" onClick={() => bank.resetSource()}>
              Use bundled file
            </Button>
          )}
        </div>
        <input
          ref={txtInput}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportTxt(f);
            e.target.value = '';
          }}
        />
      </Card>

      <Card title="Your data">
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          Stats, SRS state, notes, stars, tag edits and exam history are stored in this browser and keyed by question ID.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onExport}>Export progress (JSON)</Button>
          <Button variant="secondary" onClick={() => jsonInput.current?.click()}>
            Import progress
          </Button>
          <Button variant="danger" onClick={onReset}>
            Reset progress
          </Button>
        </div>
        <input
          ref={jsonInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportJson(f);
            e.target.value = '';
          }}
        />
      </Card>
    </div>
  );
}
