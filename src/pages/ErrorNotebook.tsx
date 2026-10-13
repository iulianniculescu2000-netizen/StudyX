import { plural } from '../lib/plural';
import { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Search, Sparkles, Repeat2, BookMarked } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTheme } from '../theme/ThemeContext';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import SectionLabel from '../components/ui/SectionLabel';
import SegmentedTabs from '../components/fx/SegmentedTabs';
import TourHelpButton from '../tutorial/TourHelpButton';
import { useQuizStore } from '../store/quizStore';
import { upsertGeneratedQuiz } from '../lib/generatedQuiz';
import { useStatsStore } from '../store/statsStore';
import { useTutorialStore } from '../store/tutorialStore';
import {
  buildErrorEntries,
  buildErrorPracticeQuiz,
  filterErrorEntries,
  groupErrors,
  type ErrorEntry,
  type ErrorSort,
} from '../lib/errorNotebook';
import CrossCheckCard from '../components/ai-chat/CrossCheckCard';
import FxPage from '../components/fx/FxPage';
import { askAiAboutError } from '../lib/errorNotebookActions';
import { withoutSemicolons } from '../helpers/quizAi';

const SORTS: ReadonlyArray<{ id: ErrorSort; label: string }> = [
  { id: 'wrong', label: 'Cele mai greșite' },
  { id: 'accuracy', label: 'Acuratețe' },
  { id: 'recent', label: 'Recente' },
];

type FlatErrorItem =
  | {
      kind: 'header';
      id: string;
      category: string;
      count: number;
    }
  | {
      kind: 'entry';
      id: string;
      entry: ErrorEntry;
      isFirstOverall: boolean;
    };

function EntryRow({ entry, open, onToggle, anchor }: { entry: ErrorEntry; open: boolean; onToggle: () => void; anchor?: boolean }) {
  const theme = useTheme();
  const panelId = `err-${entry.key.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <div {...(anchor ? { 'data-tutorial': 'errors-entry' } : {})} className="glass-panel rounded-[var(--r-md)]">
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
            {entry.quiz.title} · greșită {entry.wrong === 1 ? 'o dată' : `de ${plural(entry.wrong, 'dată', 'ori')}`} din {entry.total} · {entry.accuracy}% corect
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
            <p className="text-[13px] leading-relaxed" style={{ color: theme.text2 }}>{withoutSemicolons(entry.question.explanation)}</p>
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
    </div>
  );
}

export default function ErrorNotebook() {
  const theme = useTheme();
  const navigate = useNavigate();
  const quizzes = useQuizStore((state) => state.quizzes);
  const questionStats = useStatsStore((state) => state.questionStats);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ErrorSort>('wrong');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => buildErrorEntries(quizzes, questionStats), [quizzes, questionStats]);
  const visible = useMemo(() => filterErrorEntries(all, search), [all, search]);
  const groups = useMemo(() => groupErrors(visible, sort), [visible, sort]);

  // Flatten grouped errors for dynamic height virtualization
  const flatItems = useMemo<FlatErrorItem[]>(() => {
    const items: FlatErrorItem[] = [];
    let isFirstOverall = true;
    for (const group of groups) {
      items.push({
        kind: 'header',
        id: `hdr-${group.category}`,
        category: group.category,
        count: group.entries.length,
      });
      for (const entry of group.entries) {
        items.push({
          kind: 'entry',
          id: `entry-${entry.key}`,
          entry,
          isFirstOverall,
        });
        isFirstOverall = false;
      }
    }
    return items;
  }, [groups]);

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = flatItems[index];
      if (!item) return 68;
      if (item.kind === 'header') return 36;
      return openKey === item.entry.key ? 380 : 68;
    },
    overscan: 5,
    initialRect: { width: 1024, height: 800 },
    getItemKey: (index) => flatItems[index]?.id ?? index,
    measureElement: (element, entry, instance) => {
      if (entry?.borderBoxSize?.[0]?.blockSize) {
        return Math.round(entry.borderBoxSize[0].blockSize);
      }
      const measured = element.getBoundingClientRect().height || (element instanceof HTMLElement ? element.offsetHeight : 0);
      if (measured > 0) return measured;
      const index = instance.indexFromElement(element);
      return instance.options.estimateSize(index);
    },
    observeElementRect: (instance, cb) => {
      const element = instance.scrollElement;
      if (!element) return;
      const targetWindow = instance.targetWindow;
      const handler = () => {
        const rect = element.getBoundingClientRect();
        const width = rect.width > 0 ? rect.width : 1024;
        const height = rect.height > 0 ? rect.height : 800;
        cb({ width, height });
      };
      handler();
      let ro: ResizeObserver | null = null;
      if (typeof targetWindow !== 'undefined' && targetWindow?.ResizeObserver) {
        ro = new targetWindow.ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry?.borderBoxSize?.[0]) {
            const box = entry.borderBoxSize[0];
            const width = box.inlineSize > 0 ? Math.round(box.inlineSize) : 1024;
            const height = box.blockSize > 0 ? Math.round(box.blockSize) : 800;
            cb({ width, height });
          } else {
            handler();
          }
        });
        ro.observe(element, { box: 'border-box' });
      }
      targetWindow?.addEventListener('resize', handler, { passive: true });
      return () => {
        ro?.disconnect();
        targetWindow?.removeEventListener('resize', handler);
      };
    },
  });

  // Re-measure and adjust virtualizer when an error row expands or collapses
  const prevOpenKeyRef = useRef<string | null>(openKey);
  useEffect(() => {
    if (prevOpenKeyRef.current !== openKey) {
      if (prevOpenKeyRef.current) {
        const prevId = `entry-${prevOpenKeyRef.current}`;
        const prevIdx = flatItems.findIndex((it) => it.id === prevId);
        if (prevIdx !== -1) {
          const el = rowVirtualizer.elementsCache.get(prevId);
          if (el) rowVirtualizer.measureElement(el);
          else rowVirtualizer.resizeItem(prevIdx, 68);
        }
      }
      if (openKey) {
        const newId = `entry-${openKey}`;
        const newIdx = flatItems.findIndex((it) => it.id === newId);
        if (newIdx !== -1) {
          const el = rowVirtualizer.elementsCache.get(newId);
          if (el) rowVirtualizer.measureElement(el);
          else rowVirtualizer.resizeItem(newIdx, 380);
        }
      }
      prevOpenKeyRef.current = openKey;
    }
  }, [openKey, flatItems, rowVirtualizer]);

  // Reset scroll to top when search or sort changes
  useEffect(() => {
    if (parentRef.current) {
      parentRef.current.scrollTop = 0;
    }
    rowVirtualizer.scrollToOffset(0);
  }, [search, sort]);

  // Ensure first error entry is mounted and in view when tutorial runs or step changes
  const activeTour = useTutorialStore((s) => s.activeTour);
  const currentStep = useTutorialStore((s) => s.currentStep);
  useEffect(() => {
    if (activeTour === 'errors') {
      if (parentRef.current) {
        parentRef.current.scrollTop = 0;
      }
      rowVirtualizer.scrollToOffset(0);
    }
  }, [activeTour, currentStep]);

  const practice = () => {
    const ordered = groups.flatMap((group) => group.entries);
    const quiz = buildErrorPracticeQuiz(ordered);
    if (!quiz) return;
    // Un singur „Caiet de erori" pe profil: la fiecare „Repetă" îi înlocuim întrebările, nu mai adăugăm un set nou.
    const playId = upsertGeneratedQuiz(quiz);
    navigate(`/play/${playId}`);
  };

  return (
    <FxPage ref={parentRef} className="custom-scrollbar px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          back={{ to: '/review', label: 'Recapitulare' }}
          title="Caiet de erori"
          subtitle={all.length > 0 ? `${plural(all.length, 'întrebare', 'întrebări')} la care ai greșit și ${all.length === 1 ? 'nu a fost fixată' : 'nu au fost fixate'} încă (3 răspunsuri corecte la rând ${all.length === 1 ? 'o închid' : 'le închid'}).` : 'Întrebările greșite apar aici, grupate pe disciplină.'}
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
                  className="input-bare min-w-0 flex-1 text-[13px]"
                  style={{ color: theme.text }}
                />
              </div>
              <SegmentedTabs tabs={SORTS} value={sort} onChange={setSort} layoutId="error-sort" ariaLabel="Sortare greșeli" />
            </div>

            {groups.length === 0 ? (
              <p className="py-10 text-center text-[13px]" style={{ color: theme.text3 }}>Nicio greșeală nu se potrivește căutării.</p>
            ) : (
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const item = flatItems[virtualRow.index];
                  if (!item) return null;

                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="pb-2.5"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {item.kind === 'header' ? (
                        <div className="pt-4 pb-1">
                          <SectionLabel className="mb-2">{item.category} · {item.count}</SectionLabel>
                        </div>
                      ) : (
                        <EntryRow
                          anchor={item.isFirstOverall}
                          entry={item.entry}
                          open={openKey === item.entry.key}
                          onToggle={() => setOpenKey(openKey === item.entry.key ? null : item.entry.key)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </FxPage>
  );
}
