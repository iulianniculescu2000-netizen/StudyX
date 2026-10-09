import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Search, Sparkles, Repeat2, BookMarked } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import SectionLabel from '../components/ui/SectionLabel';
import SegmentedTabs from '../components/fx/SegmentedTabs';
import TourHelpButton from '../tutorial/TourHelpButton';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import {
  buildErrorEntries,
  buildErrorPracticeQuiz,
  filterErrorEntries,
  groupErrors,
  type ErrorEntry,
  type ErrorSort,
} from '../lib/errorNotebook';
import CrossCheckCard from '../components/ai-chat/CrossCheckCard';
import { askAiAboutError } from '../lib/errorNotebookActions';

const SORTS: ReadonlyArray<{ id: ErrorSort; label: string }> = [
  { id: 'wrong', label: 'Cele mai greșite' },
  { id: 'accuracy', label: 'Acuratețe' },
  { id: 'recent', label: 'Recente' },
];

function EntryRow({ entry, open, onToggle, anchor }: { entry: ErrorEntry; open: boolean; onToggle: () => void; anchor?: boolean }) {
  const theme = useTheme();
  const panelId = `err-${entry.key.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <li {...(anchor ? { 'data-tutorial': 'errors-entry' } : {})} className="glass-panel rounded-[var(--r-md)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="focus-ring flex w-full items-start gap-3 rounded-[var(--r-md)] px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-snug" style={{ color: theme.text }}>{entry.question.text}</span>
          <span className="mt-1 block text-[12px]" style={{ color: theme.text3 }}>
            {entry.quiz.title} · greșită de {entry.wrong} {entry.wrong === 1 ? 'dată' : 'ori'} din {entry.total} · {entry.accuracy}% corect
          </span>
        </span>
        <ChevronDown size={16} aria-hidden="true" className="mt-1 shrink-0 transition-transform" style={{ color: theme.text3, transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && (
        <div id={panelId} className="space-y-3 px-4 pb-4">
          <ul className="space-y-1.5">
            {entry.question.options.map((option) => (
              <li
                key={option.id}
                className="rounded-[var(--r-sm)] px-3 py-2 text-[13px]"
                style={{
                  background: option.isCorrect ? 'var(--accent-soft)' : 'var(--fill-subtle)',
                  color: option.isCorrect ? theme.accentText : theme.text2,
                }}
              >
                {option.isCorrect ? '✓ ' : ''}{option.text}
              </li>
            ))}
          </ul>
          {entry.question.explanation && (
            <p className="text-[13px] leading-relaxed" style={{ color: theme.text2 }}>{entry.question.explanation}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => askAiAboutError(entry, 'explain')} className="fine-chip press-feedback focus-ring flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold" style={{ color: theme.accentText }}>
              <Sparkles size={13} aria-hidden="true" />Explică-mi
            </button>
            <button type="button" onClick={() => askAiAboutError(entry, 'similar')} className="fine-chip press-feedback focus-ring flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold" style={{ color: theme.accentText }}>
              <Repeat2 size={13} aria-hidden="true" />3 grile similare
            </button>
          </div>
          <CrossCheckCard
            question={`${entry.question.text}\n${entry.question.options.map((o) => `- ${o.text}`).join('\n')}`}
            answer={`Răspuns corect: ${entry.question.options.filter((o) => o.isCorrect).map((o) => o.text).join('; ')}.${entry.question.explanation ? ` Explicație: ${entry.question.explanation}` : ''}`}
            producer={null}
          />
        </div>
      )}
    </li>
  );
}

export default function ErrorNotebook() {
  const theme = useTheme();
  const navigate = useNavigate();
  const quizzes = useQuizStore((state) => state.quizzes);
  const addQuiz = useQuizStore((state) => state.addQuiz);
  const questionStats = useStatsStore((state) => state.questionStats);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ErrorSort>('wrong');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const all = useMemo(() => buildErrorEntries(quizzes, questionStats), [quizzes, questionStats]);
  const visible = useMemo(() => filterErrorEntries(all, search), [all, search]);
  const groups = useMemo(() => groupErrors(visible, sort), [visible, sort]);

  const practice = () => {
    const ordered = groups.flatMap((group) => group.entries);
    const quiz = buildErrorPracticeQuiz(ordered);
    if (!quiz) return;
    addQuiz(quiz);
    navigate(`/play/${quiz.id}`);
  };

  return (
    <div className="custom-scrollbar h-full overflow-y-auto px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          back={{ to: '/review', label: 'Recapitulare' }}
          title="Caiet de erori"
          subtitle={all.length > 0 ? `${all.length} întrebări la care ai greșit și nu le-ai fixat încă (3 răspunsuri corecte la rând le închid).` : 'Întrebările greșite apar aici, grupate pe disciplină.'}
          actions={(
            <>
              <TourHelpButton tour="errors" label="Vezi turul Caietului de erori" />
              {visible.length > 0 && (
                <button type="button" data-tutorial="errors-practice" onClick={practice} className="press-feedback focus-ring rounded-full px-4 py-2 text-[13px] font-semibold text-white" style={{ background: theme.accent }}>
                  Repetă {Math.min(visible.length, 20)}
                </button>
              )}
            </>
          )}
        />

        {all.length === 0 ? (
          <EmptyState
            icon={BookMarked}
            title="Nicio greșeală deschisă"
            body="Când greșești o grilă, o găsești aici cu explicația. Continuă să exersezi."
            primary={{ label: 'Rezidențiat', to: '/rezidentiat' }}
            secondary={{ label: 'Toate grilele', to: '/quizzes' }}
          />
        ) : (
          <>
            <div data-tutorial="errors-toolbar" className="mb-5 flex flex-wrap items-center gap-3">
              <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--fill-subtle)] px-3.5 py-2.5 focus-within:border-[var(--accent)]">
                <Search size={15} aria-hidden="true" style={{ color: theme.text3 }} />
                <input
                  type="search"
                  aria-label="Caută în greșeli"
                  placeholder="Caută în greșeli..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="flex-1 bg-transparent text-[13px] outline-none border-none shadow-none"
                  style={{ color: theme.text }}
                />
              </div>
              <SegmentedTabs tabs={SORTS} value={sort} onChange={setSort} layoutId="error-sort" ariaLabel="Sortare greșeli" />
            </div>

            {groups.length === 0 ? (
              <p className="py-10 text-center text-[13px]" style={{ color: theme.text3 }}>Nicio greșeală nu se potrivește căutării.</p>
            ) : (
              <div className="space-y-7">
                {groups.map((group, groupIndex) => (
                  <section key={group.category}>
                    <SectionLabel className="mb-2">{group.category} · {group.entries.length}</SectionLabel>
                    <ul className="space-y-2">
                      {group.entries.map((entry, entryIndex) => (
                        <EntryRow
                          key={entry.key}
                          anchor={groupIndex === 0 && entryIndex === 0}
                          entry={entry}
                          open={openKey === entry.key}
                          onToggle={() => setOpenKey(openKey === entry.key ? null : entry.key)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
