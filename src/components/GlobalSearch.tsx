import Portal from './Portal';
import { useState, useEffect, useCallback, useMemo, useId, useRef, useDeferredValue } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, AnimatePresence, useIsPresent } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, BookOpen, FileQuestion, ArrowRight, Command, CalendarCheck, Stethoscope, Folder as FolderIcon,
  StickyNote, Database, Trophy, TrendingUp, BarChart3, Settings, LayoutDashboard, Layers, Brain, Plus, Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useQuizStore } from '../store/quizStore';
import { useFolderStore } from '../store/folderStore';
import { useNotesStore } from '../store/notesStore';
import { useAIStore } from '../store/aiStore';
import { useTheme } from '../theme/ThemeContext';
import { useUIStore } from '../store/uiStore';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { CARD_COLOR_MAP } from '../theme/colorMaps';
import { isFlashcardDeck } from '../lib/deckKind';
import { type Theme } from '../theme/themes';
import { normalizeSearchText } from '../lib/searchText';
import { getContentIndex, searchContent, type ContentHit, type Segment } from '../lib/contentSearch';
import { BOOK_SHORT, chapterTopics, curriculumChapters } from '../lib/curriculum';
import { chapterBookHref } from '../lib/organizare/appLinks';
import { findRezidentiatRootFolder, isUnderRezidentiatRoot } from '../lib/rezidentiatRoot';
import { useRezidentiatOverview } from './residency/useResidencyData';

type Section = 'actions' | 'pages' | 'rezidentiat' | 'folders' | 'quizzes' | 'questions' | 'cards' | 'notes' | 'sources';

/** Ordinea secțiunilor în lista de rezultate. */
const SECTION_ORDER: Section[] = ['pages', 'rezidentiat', 'folders', 'quizzes', 'questions', 'cards', 'notes', 'sources'];
const SECTION_LABEL: Record<Section, string> = {
  actions: 'Acțiuni rapide',
  pages: 'Pagini',
  rezidentiat: 'Rezidențiat',
  folders: 'Foldere',
  quizzes: 'Grile',
  questions: 'Întrebări',
  cards: 'Flashcarduri',
  notes: 'Notițe',
  sources: 'Biblioteca AI',
};
const MAX_RESULTS = 20;

interface SearchResult {
  id: string;
  section: Section;
  label: string;
  sub?: string;
  href: string;
  emoji?: string;
  color: string;
  icon: LucideIcon;
  /** Acțiune fără rută proprie (deschide chatul AI). */
  action?: 'chat';
  /** Textul principal cu potrivirile marcate (rezultate din conținut). */
  segments?: Segment[];
  /** Rând suplimentar când potrivirea e în opțiuni / explicație / verso. */
  hint?: { label: string; segments: Segment[] };
}

/** Intrare în indexul de căutare: textele sunt normalizate o singură dată, nu la fiecare tastă. */
interface IndexEntry {
  result: SearchResult;
  /** [text normalizat, penalizare] — cea mai bună potrivire contează. */
  keys: [string, number][];
  /** Avantaj de clasare al secțiunii (paginile și disciplinele ies primele la scor egal). */
  bias: number;
}

const ORGANIZARE_HREF = '/rezidentiat/organizare';
const ORGANIZARE_TABS = [
  { id: 'panou', label: 'Panou', words: 'plan examen progres sumar' },
  { id: 'topicuri', label: 'Topicuri', words: 'teme capitole subiecte' },
  { id: 'saptamani', label: 'Săptămâni', words: 'calendar saptamana program' },
  { id: 'ritm', label: 'Ritm zilnic', words: 'zi ore program rutina' },
  { id: 'ghid', label: 'Ghid', words: 'ajutor cum functioneaza instructiuni' },
] as const;

interface PageDef {
  id: string;
  label: string;
  sub: string;
  href: string;
  icon: LucideIcon;
  color: string;
  words: string;
}

const PAGES: PageDef[] = [
  { id: 'home', label: 'Acasă', sub: 'Panoul principal', href: '/', icon: LayoutDashboard, color: 'blue', words: 'dashboard panou acasa start' },
  { id: 'quizzes', label: 'Grile', sub: 'Toate grilele tale', href: '/quizzes', icon: BookOpen, color: 'blue', words: 'teste intrebari quiz' },
  { id: 'flashcards', label: 'Flashcarduri', sub: 'Pachete de carduri', href: '/flashcards', icon: Layers, color: 'purple', words: 'carduri memorare' },
  { id: 'review', label: 'Recapitulare zilnică', sub: 'Întrebările scadente azi', href: '/daily-review', icon: Brain, color: 'purple', words: 'repetare scadente zilnic' },
  { id: 'crunch', label: 'Aproape de examen', sub: 'Sesiune de consolidare pentru ultimele săptămâni', href: '/aproape-examen', icon: Brain, color: 'red', words: 'examen crunch grabit scadente greseli lacune consolidare' },
  { id: 'rezidentiat', label: 'Rezidențiat', sub: 'Discipline și specialități', href: '/rezidentiat', icon: Stethoscope, color: 'red', words: 'rezi examen discipline specialitati' },
  { id: 'notes', label: 'Notițe', sub: 'Notițele tale la întrebări', href: '/notes', icon: StickyNote, color: 'green', words: 'note caiet' },
  { id: 'vault', label: 'Biblioteca AI', sub: 'Cursuri, cărți și surse', href: '/vault', icon: Database, color: 'blue', words: 'surse carti cursuri vault biblioteca' },
  { id: 'achievements', label: 'Realizări', sub: 'Trofee, provocări și nivel', href: '/gamification', icon: Trophy, color: 'orange', words: 'realizari trofee insigne provocari gamification nivel' },
  { id: 'insights', label: 'Perspective AI', sub: 'Predicții și lacune de cunoaștere', href: '/analytics', icon: TrendingUp, color: 'purple', words: 'perspective predictii analiza analytics lacune' },
  { id: 'stats', label: 'Statistici', sub: 'Progres, acuratețe și trenduri', href: '/stats', icon: BarChart3, color: 'teal', words: 'statistici progres acuratete grafice' },
  { id: 'settings', label: 'Setări', sub: 'Temă, backup, performanță și AI', href: '/settings', icon: Settings, color: 'teal', words: 'setari tema backup performanta aspect' },
];

const QUICK_ACTIONS: SearchResult[] = [
  { id: 'new-quiz', section: 'actions', label: 'Creează grilă nouă', sub: 'Ajungi direct în editorul de grile', href: '/create', color: 'blue', icon: Plus },
  { id: 'review', section: 'actions', label: 'Recapitulare zilnică', sub: 'Pornește întrebările scadente acum', href: '/daily-review', color: 'purple', icon: Brain },
  { id: 'organizare', section: 'actions', label: 'Organizare', sub: 'Planul de studiu pentru rezidențiat', href: ORGANIZARE_HREF, color: 'green', icon: CalendarCheck },
  { id: 'vault', section: 'actions', label: 'Biblioteca AI', sub: 'Importă cursuri, verifică sursele și organizează baza de cunoștințe', href: '/vault', color: 'blue', icon: Database },
  { id: 'chat', section: 'actions', label: 'Deschide chatul AI', sub: 'Continuă o explicație direct din asistentul StudyX', href: '/vault', color: 'purple', icon: Sparkles, action: 'chat' },
  { id: 'stats', section: 'actions', label: 'Deschide statisticile', sub: 'Vezi progresul, acuratețea și trendurile', href: '/stats', color: 'blue', icon: BarChart3 },
  { id: 'settings', section: 'actions', label: 'Setări și AI', sub: 'Temă, backup, performanță și configurare AI', href: '/settings', color: 'teal', icon: Settings },
];

/** Construiește un evaluator pentru o interogare: potrivire exactă > prefix > început de cuvânt > conține. -1 = fără potrivire. */
function makeScorer(normalizedQuery: string) {
  const wordStart = new RegExp(`\\b${normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  const words = normalizedQuery.split(/\s+/).filter(Boolean);
  return (entry: IndexEntry): number => {
    let best = -1;
    for (const [text, penalty] of entry.keys) {
      if (!text) continue;
      let score = -1;
      if (text === normalizedQuery) score = 100;
      else if (text.startsWith(normalizedQuery)) score = 80;
      else if (wordStart.test(text)) score = 60;
      else if (text.includes(normalizedQuery)) score = 40;
      if (score >= 0) best = Math.max(best, score - penalty);
    }
    // Mai multe cuvinte, în orice ordine („cardio grila 3”), când fraza întreagă nu apare ca atare.
    if (best < 0 && words.length > 1) {
      const joined = entry.keys.map(([text]) => text).join(' ');
      if (words.every((word) => joined.includes(word))) best = 30;
    }
    return best < 0 ? -1 : best + entry.bias;
  };
}

function key(text: string | undefined, penalty = 0): [string, number] {
  return [normalizeSearchText(text ?? ''), penalty];
}

function toQuestionCountLabel(count: number) {
  return `${count} ${count === 1 ? 'întrebare' : 'întrebări'}`;
}

function usePageEntries(): IndexEntry[] {
  return useMemo(() => {
    const entries: IndexEntry[] = [];
    for (const page of PAGES) {
      entries.push({
        result: { id: `page-${page.id}`, section: 'pages', label: page.label, sub: page.sub, href: page.href, color: page.color, icon: page.icon },
        keys: [key(page.label), key(page.words, 15), key(page.sub, 25)],
        bias: 15,
      });
    }
    // Organizare: pagina și fiecare filă a ei.
    entries.push({
      result: { id: 'page-organizare', section: 'pages', label: 'Organizare', sub: 'Planul de studiu pentru rezidențiat', href: ORGANIZARE_HREF, color: 'green', icon: CalendarCheck },
      keys: [key('Organizare'), key('plan program examen rezidentiat', 15)],
      bias: 18,
    });
    for (const tab of ORGANIZARE_TABS) {
      entries.push({
        result: {
          id: `page-organizare-${tab.id}`,
          section: 'pages',
          label: `Organizare · ${tab.label}`,
          sub: 'Fila din planul de studiu',
          href: tab.id === 'panou' ? ORGANIZARE_HREF : `${ORGANIZARE_HREF}?t=${tab.id}`,
          color: 'green',
          icon: CalendarCheck,
        },
        keys: [key(`Organizare ${tab.label}`), key(tab.label, 5), key(tab.words, 20)],
        bias: 8,
      });
    }
    return entries;
  }, []);
}

function useDataEntries(): IndexEntry[] {
  const quizzes = useQuizStore((state) => state.quizzes);
  const folders = useFolderStore((state) => state.folders);
  const knowledgeSources = useAIStore((state) => state.knowledgeSources);
  const libraryFolders = useAIStore((state) => state.libraryFolders);
  const overview = useRezidentiatOverview();

  return useMemo(() => {
    const entries: IndexEntry[] = [];
    const residencyFolderIds = new Set<string>();
    const root = findRezidentiatRootFolder(folders);
    if (root) residencyFolderIds.add(root.id);

    for (const discipline of overview.disciplines) {
      residencyFolderIds.add(discipline.folder.id);
      entries.push({
        result: {
          id: `rez-${discipline.folder.id}`,
          section: 'rezidentiat',
          label: discipline.folder.name,
          sub: `Disciplină · ${toQuestionCountLabel(discipline.questionCount)} · ${discipline.progress}% parcurs`,
          href: `/rezidentiat/${discipline.folder.id}`,
          emoji: discipline.folder.emoji,
          color: discipline.folder.color,
          icon: Stethoscope,
        },
        keys: [key(discipline.folder.name)],
        bias: 12,
      });
      for (const specialty of discipline.specialties) {
        if (specialty.loose) continue;
        residencyFolderIds.add(specialty.folder.id);
        entries.push({
          result: {
            id: `rez-${specialty.folder.id}`,
            section: 'rezidentiat',
            label: specialty.name,
            sub: `${discipline.folder.name} · ${toQuestionCountLabel(specialty.questionCount)} · ${specialty.progress}% parcurs`,
            href: `/rezidentiat/${discipline.folder.id}?s=${specialty.folder.id}`,
            emoji: specialty.folder.emoji,
            color: specialty.folder.color,
            icon: Stethoscope,
          },
          keys: [key(specialty.name), key(discipline.folder.name, 25)],
          bias: 10,
        });
      }
    }

    // Capitolele din plan (aceeași împărțire ca în Organizare, cărți și flashcarduri) duc în pagina Rezidențiat.
    for (const chapter of curriculumChapters()) {
      entries.push({
        result: {
          id: `chapter-${chapter.index}`,
          section: 'rezidentiat',
          label: chapter.label,
          sub: `Capitol · ${BOOK_SHORT[chapter.book]} · ${Math.round(chapter.pages)} p.`,
          href: chapterBookHref(chapter),
          color: 'teal',
          icon: BookOpen,
        },
        keys: [
          key(chapter.title),
          key(`capitol ${chapter.number} ${BOOK_SHORT[chapter.book]}`, 20),
          ...chapterTopics(chapter).map((topic) => key(topic.name, 25)),
        ],
        bias: 8,
      });
    }

    for (const folder of folders) {
      if (residencyFolderIds.has(folder.id)) continue;
      entries.push({
        result: { id: `folder-${folder.id}`, section: 'folders', label: folder.name, sub: 'Folder', href: `/folder/${folder.id}`, emoji: folder.emoji, color: folder.color, icon: FolderIcon },
        keys: [key(folder.name)],
        bias: 5,
      });
    }

    for (const quiz of quizzes) {
      const isFlashcard = isFlashcardDeck(quiz);
      entries.push({
        result: {
          id: `quiz-${quiz.id}`,
          section: 'quizzes',
          label: quiz.title,
          sub: `${isFlashcard ? `${quiz.questions.length} ${quiz.questions.length === 1 ? 'card' : 'carduri'}` : toQuestionCountLabel(quiz.questions.length)} · ${quiz.category}`,
          href: isFlashcard ? `/flashcards/session/${quiz.id}` : `/quiz/${quiz.id}`,
          emoji: quiz.emoji,
          color: quiz.color,
          icon: BookOpen,
        },
        keys: [key(quiz.title), key(quiz.description, 20), key(quiz.category, 10), ...(quiz.tags ?? []).map((tag) => key(tag, 10))],
        bias: 0,
      });
    }

    for (const source of knowledgeSources) {
      entries.push({
        result: { id: `source-${source.id}`, section: 'sources', label: source.name, sub: `Sursă · ${source.wordCount} cuvinte`, href: source.folderId && isUnderRezidentiatRoot(source.folderId, libraryFolders) ? '/rezidentiat' : `/vault?source=${source.id}`, color: 'blue', icon: Database },
        keys: [key(source.name), key(source.preview, 40)],
        bias: 0,
      });
    }

    return entries;
  }, [quizzes, folders, knowledgeSources, libraryFolders, overview]);
}

const FIELD_HINT: Record<ContentHit['kind'], Partial<Record<ContentHit['field'], string>>> = {
  question: { options: 'Opțiune', explanation: 'Explicație', tags: 'Etichetă' },
  flashcard: { options: 'Verso', explanation: 'Explicație', tags: 'Etichetă' },
  note: {},
};

function hitToResult(hit: ContentHit, query: string): SearchResult {
  const base = { id: hit.id, color: 'blue', sub: hit.quizTitle ?? undefined };
  const inText = hit.field === 'text';
  const hint = inText ? undefined : { label: FIELD_HINT[hit.kind][hit.field] ?? 'Text', segments: hit.snippet };
  const segments = inText ? hit.snippet : undefined;
  if (hit.kind === 'note') {
    return { ...base, section: 'notes', label: hit.label, sub: hit.quizTitle ? `Notiță · ${hit.quizTitle}` : 'Notiță', color: 'green', icon: StickyNote, href: `/notes?q=${encodeURIComponent(query)}`, segments };
  }
  if (hit.kind === 'flashcard') {
    return { ...base, section: 'cards', label: hit.label, color: 'purple', icon: Layers, href: `/flashcards/session/${hit.quizId}?mode=all`, segments, hint };
  }
  return { ...base, section: 'questions', label: hit.label, icon: FileQuestion, href: `/quiz/${hit.quizId}`, segments, hint };
}

/** Căutarea în conținut: indexul se construiește abia la prima interogare, iar tastarea nu așteaptă rezultatele (valoare amânată). */
function useContentResults(query: string): { result: SearchResult; score: number }[] {
  const quizzes = useQuizStore((state) => state.quizzes);
  const notes = useNotesStore((state) => state.notes);
  const deferred = useDeferredValue(query);
  // Indexul se încălzește imediat după deschidere, în afara tastării, ca prima literă să nu aștepte construirea lui.
  useEffect(() => {
    const timer = window.setTimeout(() => getContentIndex(quizzes, notes), 80);
    return () => window.clearTimeout(timer);
  }, [quizzes, notes]);
  return useMemo(() => {
    if (deferred.length < 2) return [];
    return searchContent(getContentIndex(quizzes, notes), deferred).map((hit) => ({ result: hitToResult(hit, deferred), score: hit.score }));
  }, [deferred, quizzes, notes]);
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  // Se schimbă la fiecare deschidere, ca panoul să pornească de la zero (interogare goală, primul rând activ).
  const [openCount, setOpenCount] = useState(0);

  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        // Ctrl+K cu panoul deschis îl închide, nu îl remontează.
        if (openRef.current) {
          setOpen(false);
          return;
        }
        setOpenCount((count) => count + 1);
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return (
    <Portal>
      <AnimatePresence>
        {open && <SearchPanel key={openCount} onClose={close} />}
      </AnimatePresence>
    </Portal>
  );
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const setChatOpen = useUIStore((state) => state.setChatOpen);
  const { calmMotion, t } = useAdaptiveMotion();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  // Capcana se oprește de la începutul animației de ieșire, ca să nu intre în conflict cu un modal de dedesubt.
  const isPresent = useIsPresent();
  const dialogRef = useFocusTrap(isPresent, onClose);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const titleId = `${baseId}-title`;

  const pageEntries = usePageEntries();
  const dataEntries = useDataEntries();
  const contentResults = useContentResults(query.trim());

  const trimmed = query.trim();

  const results = useMemo<SearchResult[]>(() => {
    if (trimmed.length < 1) return [];
    const score = makeScorer(normalizeSearchText(trimmed));
    const scored: { result: SearchResult; score: number }[] = [];
    for (const entry of pageEntries) {
      const value = score(entry);
      if (value >= 0) scored.push({ result: entry.result, score: value });
    }
    for (const entry of dataEntries) {
      const value = score(entry);
      if (value >= 0) scored.push({ result: entry.result, score: value });
    }
    for (const item of contentResults) scored.push(item);
    const top = scored.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS).map((entry) => entry.result);
    // Grupate pe secțiuni, în ordinea fixă; în interiorul secțiunii rămâne ordinea scorului.
    return SECTION_ORDER.flatMap((section) => top.filter((result) => result.section === section));
  }, [trimmed, pageEntries, dataEntries, contentResults]);

  const navigable = trimmed.length === 0 ? QUICK_ACTIONS : results;
  const safeActiveIdx = navigable.length > 0 ? Math.min(activeIdx, navigable.length - 1) : 0;
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const groups = useMemo(() => {
    const list = trimmed.length === 0 ? QUICK_ACTIONS : results;
    const order: Section[] = trimmed.length === 0 ? ['actions'] : SECTION_ORDER;
    return order
      .map((section) => ({ section, items: list.filter((result) => result.section === section) }))
      .filter((group) => group.items.length > 0);
  }, [trimmed, results]);

  const handleSelect = useCallback((result: SearchResult) => {
    onClose();
    if (result.action === 'chat') {
      setChatOpen(true);
      return;
    }
    navigate(result.href);
  }, [navigate, onClose, setChatOpen]);

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIdx(Math.min(safeActiveIdx + 1, Math.max(navigable.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIdx(Math.max(safeActiveIdx - 1, 0));
    } else if (event.key === 'Enter' && navigable[safeActiveIdx]) {
      event.preventDefault();
      handleSelect(navigable[safeActiveIdx]);
    }
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setActiveIdx(0);
  };

  useEffect(() => {
    const active = document.getElementById(`${baseId}-opt-${safeActiveIdx}`);
    if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest' });
  }, [baseId, safeActiveIdx, navigable]);

  const showEmpty = trimmed.length > 0 && results.length === 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={t.pop}
        onClick={onClose}
        className="fixed inset-0 z-[10020]"
        style={{ background: 'var(--overlay)' }}
      />

      <div
        className="pointer-events-none fixed inset-x-0 z-[10020] flex justify-center px-3"
        style={{ top: 'clamp(72px, 12vh, 132px)' }}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={calmMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={calmMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
          transition={t.modal}
          className="premium-modal pointer-events-auto w-full max-w-[720px] overflow-hidden rounded-[var(--r-xl)] shadow-2xl"
        >
          <h2 id={titleId} className="sr-only">Căutare globală</h2>
          <div
            className="flex items-center gap-3 px-4 py-4 sm:px-5"
            style={{ borderBottom: `1px solid ${theme.border}` }}
          >
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-md)]"
              style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}
            >
              <Search size={18} style={{ color: theme.text3 }} />
            </div>

            <input
              data-autofocus
              type="text"
              role="combobox"
              aria-label="Caută în aplicație"
              aria-expanded={navigable.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={navigable.length > 0 ? optionId(safeActiveIdx) : undefined}
              autoComplete="off"
              spellCheck={false}
              placeholder="Caută grile, întrebări, discipline, notițe sau pagini..."
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              onKeyDown={handleInputKeyDown}
              className="input-bare flex-1 text-base font-semibold"
              style={{ color: theme.text, outline: 'none' }}
            />

            {query && (
              <button
                type="button"
                onClick={() => handleQueryChange('')}
                aria-label="Șterge căutarea"
                className="press-feedback focus-ring rounded-[var(--r-md)] p-2"
                style={{ background: theme.surface2, color: theme.text3 }}
              >
                <X size={15} />
              </button>
            )}

            <div
              className="hidden items-center gap-2 rounded-[var(--r-md)] px-3 py-2 text-[11px] font-semibold sm:flex"
              style={{ background: theme.surface2, color: theme.text3, border: `1px solid ${theme.border}` }}
            >
              <kbd className="font-mono">Esc</kbd>
              <span>închide</span>
            </div>
          </div>

          <div tabIndex={0} role="region" aria-label="Rezultatele căutării" className="custom-scrollbar max-h-[min(62vh,540px)] overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
            {trimmed.length === 0 && (
              <div className="px-4 pt-5 sm:px-5">
                <div className="mb-3 flex items-center justify-center gap-1.5" style={{ color: theme.text3 }}>
                  <Command size={14} />
                  <span className="font-mono text-sm">K</span>
                </div>
                <p className="mx-auto mb-3 max-w-md text-center text-sm leading-relaxed" style={{ color: theme.text3 }}>
                  Caută rapid orice grilă, disciplină, notiță sau pagină, ori pornește o acțiune fără să ieși din fluxul de lucru.
                </p>
              </div>
            )}

            {showEmpty ? (
              <div className="px-4 py-12 text-center sm:px-5" role="status">
                <div
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[var(--r-lg)]"
                  style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text3 }}
                >
                  <Search size={26} />
                </div>
                <p className="mb-1 text-base font-semibold" style={{ color: theme.text }}>Nu am găsit rezultate</p>
                <p className="text-sm" style={{ color: theme.text3 }}>Încearcă alt cuvânt-cheie pentru „{query}”.</p>
              </div>
            ) : (
              <div id={listId} role="listbox" aria-label="Rezultate" className="px-2 py-2 sm:px-3">
                {groups.map((group) => {
                  const headingId = `${baseId}-grp-${group.section}`;
                  return (
                    <div key={group.section} role="group" aria-labelledby={headingId} className="mb-1">
                      <div
                        id={headingId}
                        role="presentation"
                        className="px-3 pb-1 pt-2 text-[12px] font-medium uppercase tracking-wide"
                        style={{ color: theme.text3 }}
                      >
                        {SECTION_LABEL[group.section]}
                      </div>
                      {group.items.map((result) => {
                        const index = navigable.indexOf(result);
                        return (
                          <ResultRow
                            key={result.id}
                            id={optionId(index)}
                            result={result}
                            isActive={safeActiveIdx === index}
                            theme={theme}
                            onSelect={() => handleSelect(result)}
                            onHover={() => setActiveIdx(index)}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {(results.length > 0 || trimmed.length === 0) && (
            <div
              className="flex items-center gap-3 px-4 py-3 text-xs sm:px-5"
              style={{ borderTop: `1px solid ${theme.border}`, color: theme.text3 }}
            >
              <span className="font-mono">↑↓</span> navighează
              <span className="font-mono">↵</span> deschide
              <span className="ml-auto" aria-live="polite">
                {trimmed.length === 0 ? `${QUICK_ACTIONS.length} acțiuni rapide` : `${results.length} ${results.length === 1 ? 'rezultat' : 'rezultate'}`}
              </span>
            </div>
          )}
        </motion.div>
      </div>
    </>
  );
}

function Highlighted({ segments }: { segments: Segment[] }) {
  const theme = useTheme();
  return (
    <>
      {segments.map((segment, index) => (segment.hit
        ? <mark key={index} className="rounded-[var(--r-sm)] bg-transparent font-bold" style={{ color: theme.accentText, textDecoration: 'underline', textDecorationThickness: '2px', textUnderlineOffset: '2px' }}>{segment.text}</mark>
        : <span key={index}>{segment.text}</span>))}
    </>
  );
}

function ResultRow({
  id,
  result,
  isActive,
  theme,
  onSelect,
  onHover,
}: {
  id: string;
  result: SearchResult;
  isActive: boolean;
  theme: Theme;
  onSelect: () => void;
  onHover: () => void;
}) {
  const colors = CARD_COLOR_MAP[result.color] ?? CARD_COLOR_MAP.blue;
  const Icon = result.icon;

  return (
    <div
      id={id}
      role="option"
      aria-selected={isActive}
      onClick={onSelect}
      onMouseMove={onHover}
      data-result-active={isActive}
      data-active={isActive}
      className="fine-row fine-row--flat cursor-pointer rounded-[var(--r-md)] px-3 py-2.5 text-left"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-md)]"
          style={{
            background: `color-mix(in srgb, ${colors.badge} 12%, transparent)`,
            color: colors.badge,
            border: `1px solid color-mix(in srgb, ${colors.badge} 16%, transparent)`,
          }}
        >
          {result.emoji ? <span className="text-base">{result.emoji}</span> : <Icon size={15} />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: theme.text }}>
            {result.segments ? <Highlighted segments={result.segments} /> : result.label}
          </p>
          {result.sub && (
            <p className="truncate text-xs" style={{ color: theme.text3 }}>{result.sub}</p>
          )}
          {result.hint && (
            <p className="truncate text-xs" style={{ color: theme.text2 }}>
              <span style={{ color: theme.text3 }}>{result.hint.label}: </span>
              <Highlighted segments={result.hint.segments} />
            </p>
          )}
        </div>

        {isActive && <ArrowRight size={14} style={{ color: theme.text3, flexShrink: 0 }} />}
      </div>
    </div>
  );
}

export function GlobalSearchTrigger() {
  const theme = useTheme();

  return (
    <button
      data-tutorial="global-search"
      onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
      className="press-feedback focus-ring flex items-center gap-2 rounded-[var(--r-md)] px-3 py-2 text-xs transition-colors"
      style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text3 }}
    >
      <Search size={13} />
      <span>Caută</span>
      <kbd className="ml-1 font-mono" style={{ opacity: 0.6 }}>Ctrl+K</kbd>
    </button>
  );
}
