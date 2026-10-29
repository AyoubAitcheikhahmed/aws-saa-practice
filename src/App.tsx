import { useEffect, useState } from 'react';
import { QuestionBankProvider } from './data/questionBank';
import { useRoute } from './router';
import { useAppData } from './storage/store';
import { cx } from './components/ui';
import { DashboardPage } from './pages/DashboardPage';
import { ExamPage } from './pages/ExamPage';
import { PracticePage } from './pages/PracticePage';
import { FlashcardsPage } from './pages/FlashcardsPage';
import { WeakAreasPage } from './pages/WeakAreasPage';
import { QuestionBankPage } from './pages/QuestionBankPage';
import { SettingsPage } from './pages/SettingsPage';
import { DataHealthPage } from './pages/DataHealthPage';

const NAV = [
  { path: 'dashboard', label: 'Dashboard', icon: '◧' },
  { path: 'exam', label: 'Exam', icon: '⏱' },
  { path: 'practice', label: 'Practice', icon: '✎' },
  { path: 'recall', label: 'Open Recall', icon: '✍' },
  { path: 'flashcards', label: 'Flashcards', icon: '▤' },
  { path: 'weak', label: 'Weak Areas', icon: '⚑' },
  { path: 'bank', label: 'Question Bank', icon: '☰' },
  { path: 'settings', label: 'Settings', icon: '⚙' },
];

function Page() {
  const route = useRoute();
  const [section] = route.path;
  switch (section) {
    case 'exam':
      return <ExamPage route={route} />;
    case 'practice':
      return <PracticePage key={route.raw} route={route} />;
    case 'recall':
      return <PracticePage key={route.raw} route={route} mode="recall" />;
    case 'flashcards':
      return <FlashcardsPage />;
    case 'weak':
      return <WeakAreasPage />;
    case 'bank':
      return <QuestionBankPage />;
    case 'settings':
      return <SettingsPage />;
    case 'health':
      return <DataHealthPage />;
    default:
      return <DashboardPage />;
  }
}

export function App() {
  const { settings, activeExam } = useAppData();
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const section = route.path[0] ?? 'dashboard';
  const examRunning = section === 'exam' && activeExam !== null && route.path[1] === undefined;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.dark);
  }, [settings.dark]);

  useEffect(() => setMenuOpen(false), [route.raw]);

  return (
    <QuestionBankProvider>
      <div className="flex min-h-screen">
        {!examRunning && (
          <>
            <aside
              className={cx(
                'fixed inset-y-0 left-0 z-30 w-56 shrink-0 border-r border-slate-200 bg-white p-3 transition-transform dark:border-slate-800 dark:bg-slate-900 md:static md:translate-x-0',
                menuOpen ? 'translate-x-0' : '-translate-x-full',
              )}
            >
              <div className="mb-6 px-2 pt-2">
                <div className="text-lg font-bold">SAA-C03 Trainer</div>
                <div className="text-xs text-slate-500">Exam: 30 Nov 2026</div>
              </div>
              <nav className="space-y-1">
                {NAV.map((n) => (
                  <a
                    key={n.path}
                    href={`#/${n.path}`}
                    className={cx(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
                      section === n.path
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                    )}
                  >
                    <span className="w-4 text-center">{n.icon}</span>
                    {n.label}
                  </a>
                ))}
              </nav>
            </aside>
            {menuOpen && <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setMenuOpen(false)} />}
          </>
        )}
        <main className="min-w-0 flex-1">
          {!examRunning && (
            <div className="flex items-center gap-2 border-b border-slate-200 p-3 md:hidden dark:border-slate-800">
              <button type="button" className="rounded px-2 py-1 text-xl" onClick={() => setMenuOpen(true)} aria-label="Open menu">
                ☰
              </button>
              <span className="font-semibold">SAA-C03 Trainer</span>
            </div>
          )}
          <div className={cx('mx-auto p-4 md:p-8', examRunning ? 'max-w-5xl' : 'max-w-6xl')}>
            <Page />
          </div>
        </main>
      </div>
    </QuestionBankProvider>
  );
}
