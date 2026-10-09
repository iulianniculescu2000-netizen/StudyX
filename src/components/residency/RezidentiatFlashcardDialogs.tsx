import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAIStore } from '../../store/aiStore';
import { useFolderStore } from '../../store/folderStore';
import { useQuizStore } from '../../store/quizStore';
import { useToastStore } from '../../store/toastStore';
import { FLASHCARD_DIFFICULTY_LABEL, type FlashcardDifficulty } from '../../ai/flashcardPrompts';
import { BOOK_SHORT, chapterTopics, curriculumChapters } from '../../lib/curriculum';
import { friendlyAIError } from '../../lib/ai/friendlyError';
import { frontsInFolder, generateFlashcardDeck, saveFlashcardDeck, type FlashcardScopeRequest } from '../../lib/ai/flashcardAuthor';
import {
  FLASHCARDS_ROOT_CHOICE,
  buildManualDeck,
  describeFolderChoice,
  parseFlashcardLines,
  resolveFolderChoice,
  type FolderChoice,
} from '../../lib/rezidentiatFlashcardFolders';
import { generateStudyMaterial } from '../../lib/ai/studyMaterial';
import {
  QUIZ_AUTO_CHOICE,
  defaultDestinationChoice,
  defaultNewFolderParent,
  destinationOptions,
  resolveDestination,
  type StudyKind,
} from '../../lib/ai/studyDestinations';
import ThemedSelect from '../ThemedSelect';
import ModalShell from '../ui/ModalShell';
import { FieldLabel, Segmented, Stepper } from '../ui/FormControls';
import HelpTip from '../ui/HelpTip';
import FolderChoiceField from './FolderChoiceField';

interface BaseProps { open: boolean; onClose: () => void }

const DEFAULT_CHOICE: FolderChoice = { mode: 'existing', id: FLASHCARDS_ROOT_CHOICE };

function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press-feedback flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-45"
      style={{ background: theme.accent }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  const theme = useTheme();
  return (
    <button type="button" onClick={onClick} className="press-feedback rounded-full px-4 py-2.5 text-[13px] font-semibold" style={{ background: theme.surface2, color: theme.text2 }}>
      {children}
    </button>
  );
}

/* ── Folder nou ─────────────────────────────────────────────────────────────────────────────── */

export function NewFolderDialog({ open, onClose, onCreated, initialParentId, kind = 'flashcards' }: BaseProps & { onCreated: (folderId: string) => void; initialParentId?: string | null; kind?: StudyKind }) {
  const addToast = useToastStore((state) => state.addToast);
  const folders = useFolderStore((state) => state.folders);
  const defaultParent = defaultNewFolderParent(kind, 'rezidentiat');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState(initialParentId ?? defaultParent);
  // La fiecare deschidere pornim de la părintele cerut (rădăcina sau folderul pe care s-a apăsat „Subfolder”).
  const [openedFor, setOpenedFor] = useState(open);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) setParentId(initialParentId ?? defaultParent);
  }
  const options = useMemo(
    () => destinationOptions(kind, 'rezidentiat', folders)
      .filter((option) => option.id !== QUIZ_AUTO_CHOICE)
      .map((option) => ({ value: option.id, label: `${option.depth > 0 ? '↳ ' : ''}${option.label}` })),
    [folders, kind],
  );

  const submit = () => {
    if (!name.trim()) return;
    const id = resolveDestination(kind, 'rezidentiat', { mode: 'new', name, parentId }) ?? parentId;
    addToast(`Folderul „${name.trim()}” e gata.`, 'success');
    setName('');
    onCreated(id);
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title="Folder nou"
      subtitle="Îți ține pachetele de Rezidențiat organizate, ca în orice altă parte a aplicației."
      onClose={onClose}
      width="sm"
      footer={<><SecondaryButton onClick={onClose}>Anulează</SecondaryButton><PrimaryButton onClick={submit} disabled={!name.trim()}>Creează</PrimaryButton></>}
    >
      <div>
        <FieldLabel>Numele folderului</FieldLabel>
        <input
          type="text"
          autoFocus
          value={name}
          maxLength={60}
          placeholder="ex. Cardiologie, Recapitulare iarnă…"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
          aria-label="Numele folderului"
          className="w-full text-[13.5px]"
        />
      </div>
      <div>
        <FieldLabel>Se creează în</FieldLabel>
        <ThemedSelect options={options} value={parentId} onChange={setParentId} />
      </div>
    </ModalShell>
  );
}

/* ── Pachet scris de mână ───────────────────────────────────────────────────────────────────── */

interface Row { key: number; front: string; back: string }
let rowKey = 0;
const emptyRows = (count: number): Row[] => Array.from({ length: count }, () => ({ key: rowKey += 1, front: '', back: '' }));

export function ManualDeckDialog({ open, onClose, onCreated }: BaseProps & { onCreated: (deckId: string, folderId: string) => void }) {
  const theme = useTheme();
  const addToast = useToastStore((state) => state.addToast);
  const [title, setTitle] = useState('');
  const [choice, setChoice] = useState<FolderChoice>(DEFAULT_CHOICE);
  const [rows, setRows] = useState<Row[]>(() => emptyRows(3));
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');

  const filled = rows.filter((row) => row.front.trim() && row.back.trim());
  const canSave = title.trim().length > 0 && filled.length > 0 && (choice.mode === 'existing' || choice.name.trim().length > 0);
  const update = (key: number, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addPasted = () => {
    const parsed = parseFlashcardLines(pasted);
    if (parsed.cards.length === 0) {
      addToast('Nu am găsit perechi față / spate. Scrie câte un card pe linie, separat prin tab, „;” sau „|”.', 'warning');
      return;
    }
    setRows((current) => [...current.filter((row) => row.front.trim() || row.back.trim()), ...parsed.cards.map((card) => ({ key: rowKey += 1, ...card }))]);
    setPasted('');
    setPasting(false);
    if (parsed.skipped > 0) addToast(`${parsed.skipped} linii nu aveau față și spate și au fost sărite.`, 'info');
  };

  const save = () => {
    if (!canSave) return;
    const folderId = resolveFolderChoice(choice);
    const deck = buildManualDeck({ title, folderId, cards: filled });
    useQuizStore.getState().addQuiz(deck);
    addToast(`Pachetul „${deck.title}” are ${deck.questions.length} carduri.`, 'success');
    setTitle('');
    setRows(emptyRows(3));
    setChoice(DEFAULT_CHOICE);
    onCreated(deck.id, folderId);
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title="Pachet nou"
      subtitle="Scrie-ți singur cardurile. Poți adăuga oricând altele din meniul pachetului."
      onClose={onClose}
      width="lg"
      footer={(
        <>
          <span className="mr-auto text-[12px]" style={{ color: theme.text3 }}>{filled.length} {filled.length === 1 ? 'card' : 'carduri'}</span>
          <SecondaryButton onClick={onClose}>Anulează</SecondaryButton>
          <PrimaryButton onClick={save} disabled={!canSave}>Salvează pachetul</PrimaryButton>
        </>
      )}
    >
      <div>
        <FieldLabel>Titlul pachetului</FieldLabel>
        <input type="text" autoFocus value={title} maxLength={80} placeholder="ex. Aritmii supraventriculare" onChange={(event) => setTitle(event.target.value)} aria-label="Titlul pachetului" className="w-full text-[13.5px]" />
      </div>
      <FolderChoiceField value={choice} onChange={setChoice} />

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <FieldLabel>Carduri</FieldLabel>
          <button type="button" onClick={() => setPasting((value) => !value)} className="text-[12px] font-semibold" style={{ color: theme.accentText }}>
            {pasting ? 'Scrie pe rând' : 'Lipește mai multe'}
          </button>
        </div>
        {pasting ? (
          <div className="space-y-2">
            <textarea
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              rows={6}
              placeholder={'Un card pe linie, față și spate separate prin tab, „;” sau „|”:\nCe este sepsisul? | Disfuncție de organ prin răspuns dereglat la infecție.'}
              aria-label="Carduri lipite"
              className="w-full text-[13px]"
            />
            <SecondaryButton onClick={addPasted}>Adaugă cardurile</SecondaryButton>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={row.key} className="flex items-start gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  <input type="text" value={row.front} placeholder={`Față ${index + 1}`} onChange={(event) => update(row.key, { front: event.target.value })} aria-label={`Fața cardului ${index + 1}`} className="w-full text-[13px]" />
                  <input type="text" value={row.back} placeholder="Spate" onChange={(event) => update(row.key, { back: event.target.value })} aria-label={`Spatele cardului ${index + 1}`} className="w-full text-[13px]" />
                </div>
                <button
                  type="button"
                  onClick={() => setRows((current) => (current.length > 1 ? current.filter((entry) => entry.key !== row.key) : current))}
                  aria-label={`Șterge cardul ${index + 1}`}
                  className="press-feedback mt-1 rounded-full p-2"
                  style={{ color: theme.text3 }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setRows((current) => [...current, ...emptyRows(1)])} className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: theme.accentText }}>
              <Plus size={14} /> Adaugă un card
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/* ── Creat cu AI ────────────────────────────────────────────────────────────────────────────── */

type SourceMode = 'chapter' | 'free';

const DIFFICULTY_OPTIONS = (['auto', 'easy', 'medium', 'hard'] as const).map((id) => ({ id, label: FLASHCARD_DIFFICULTY_LABEL[id] }));

export function AiDeckDialog({ open, onClose, onCreated }: BaseProps & { onCreated: (deckId: string, folderId: string) => void }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const addToast = useToastStore((state) => state.addToast);
  const hasKey = useAIStore((state) => state.hasKey);
  const chapters = useMemo(() => curriculumChapters(), []);
  const chapterOptions = useMemo(
    () => chapters.map((chapter) => ({ value: String(chapter.index), label: `${chapter.number}. ${chapter.title} · ${BOOK_SHORT[chapter.book]}` })),
    [chapters],
  );

  const [mode, setMode] = useState<SourceMode>('chapter');
  const [chapterIndex, setChapterIndex] = useState(String(chapters[0]?.index ?? 0));
  const [topic, setTopic] = useState('');
  const [freeTopic, setFreeTopic] = useState('');
  const [difficulty, setDifficulty] = useState<FlashcardDifficulty>('auto');
  const [count, setCount] = useState(15);
  const [choice, setChoice] = useState<FolderChoice>(DEFAULT_CHOICE);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const chapter = chapters.find((entry) => String(entry.index) === chapterIndex) ?? chapters[0];
  const topicOptions = useMemo(
    () => [{ value: '', label: 'Tot capitolul' }, ...(chapter ? chapterTopics(chapter).map((entry) => ({ value: entry.name, label: entry.name })) : [])],
    [chapter],
  );
  const busy = progress !== null;
  const folderReady = choice.mode === 'existing' || choice.name.trim().length > 0;
  const subjectReady = mode === 'chapter' ? !!chapter : freeTopic.trim().length > 2;
  const canRun = hasKey && folderReady && subjectReady && !busy;

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const run = async () => {
    if (!canRun) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ done: 0, total: 1 });
    const scope: FlashcardScopeRequest = mode === 'chapter' && chapter
      ? { kind: 'chapter', chapter, topic: topic || undefined }
      : { kind: 'topic', topic: freeTopic.trim() };
    try {
      const existingFolder = choice.mode === 'existing' && choice.id !== FLASHCARDS_ROOT_CHOICE ? choice.id : null;
      const result = await generateFlashcardDeck({
        scope,
        count,
        difficulty,
        folderId: null,
        space: 'rezidentiat',
        avoidFronts: frontsInFolder(existingFolder),
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      // Folderul nou se creează abia acum, ca un eșec să nu lase foldere goale.
      const folderId = resolveFolderChoice(choice);
      const deck = { ...result.deck, folderId };
      const id = saveFlashcardDeck(deck);
      addToast(
        `${result.produced} carduri în ${describeFolderChoice(choice, useFolderStore.getState().folders)}.`,
        'success',
        7000,
        { label: 'Începe', onClick: () => navigate(`/flashcards/session/${id}?mode=all`) },
      );
      if (result.warnings.length > 0) addToast(result.warnings[0], 'warning', 8000);
      onCreated(id, folderId);
      onClose();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      addToast(friendlyAIError(error) || (error instanceof Error ? error.message : 'Generarea a eșuat.'), 'error', 7000);
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  return (
    <ModalShell
      open={open}
      title="Flashcarduri cu AI"
      subtitle="Din tematica cărților tale sau dintr-un subiect liber, la nivelul pe care îl alegi."
      onClose={close}
      width="lg"
      footer={(
        <>
          {busy && <span className="mr-auto flex items-center gap-2 text-[12.5px]" style={{ color: theme.text3 }}><Loader2 size={14} className="animate-spin" /> Generez{progress && progress.total > 1 ? ` · ${progress.done}/${progress.total}` : '…'}</span>}
          <SecondaryButton onClick={close}>{busy ? 'Oprește' : 'Anulează'}</SecondaryButton>
          <PrimaryButton onClick={() => void run()} disabled={!canRun}>Generează {count} carduri</PrimaryButton>
        </>
      )}
    >
      {!hasKey && (
        <p className="rounded-2xl px-3.5 py-3 text-[12.5px]" style={{ background: `${theme.warning}14`, border: `1px solid ${theme.warning}30`, color: theme.text }}>
          Ai nevoie de o cheie AI ca să generezi carduri. O adaugi din Setări › AI.
        </p>
      )}
      <Segmented
        label="Sursa cardurilor"
        value={mode}
        options={[{ id: 'chapter', label: 'Din tematică' }, { id: 'free', label: 'Subiect liber' }]}
        onChange={setMode}
      />
      {mode === 'chapter' ? (
        <>
          <div>
            <FieldLabel>Capitol</FieldLabel>
            <ThemedSelect options={chapterOptions} value={chapterIndex} onChange={(next) => { setChapterIndex(next); setTopic(''); }} />
          </div>
          <div>
            <FieldLabel>Topic</FieldLabel>
            <ThemedSelect options={topicOptions} value={topic} onChange={setTopic} />
          </div>
        </>
      ) : (
        <div>
          <FieldLabel>Subiect</FieldLabel>
          <input type="text" value={freeTopic} maxLength={120} placeholder="ex. Acidoza metabolică, Fibrilația atrială…" onChange={(event) => setFreeTopic(event.target.value)} aria-label="Subiectul cardurilor" className="w-full text-[13.5px]" />
          <p className="mt-1.5 text-[11.5px]" style={{ color: theme.text3 }}>Caut întâi în cărțile de Rezidențiat; dacă nu găsesc nimic, folosesc cunoștințe medicale generale și te avertizez.</p>
        </div>
      )}
      <div>
        <FieldLabel>Dificultate</FieldLabel>
        <Segmented label="Dificultate" value={difficulty} options={DIFFICULTY_OPTIONS} onChange={setDifficulty} />
      </div>
      <Stepper label="Număr de carduri" value={count} min={5} max={60} step={5} onChange={setCount} />
      <FolderChoiceField value={choice} onChange={setChoice} label="Se salvează în" />
    </ModalShell>
  );
}

/* ── Import din fișier CSV / TSV / text ──────────────────────────────────────────────────────── */

export function ImportCsvDialog({ file, onClose, onCreated }: { file: File | null; onClose: () => void; onCreated: (deckId: string, folderId: string) => void }) {
  const theme = useTheme();
  const addToast = useToastStore((state) => state.addToast);
  const [title, setTitle] = useState('');
  const [choice, setChoice] = useState<FolderChoice>(DEFAULT_CHOICE);
  const [parsed, setParsed] = useState<ReturnType<typeof parseFlashcardLines> | null>(null);
  const [loadedFor, setLoadedFor] = useState<File | null>(null);

  // Citim fișierul o singură dată pentru fiecare alegere.
  if (file && loadedFor !== file) {
    setLoadedFor(file);
    setTitle(file.name.replace(/\.[^.]+$/, ''));
    setParsed(null);
    void file.text().then((text) => setParsed(parseFlashcardLines(text))).catch(() => setParsed({ cards: [], skipped: 0 }));
  }

  const count = parsed?.cards.length ?? 0;
  const canSave = count > 0 && title.trim().length > 0 && (choice.mode === 'existing' || choice.name.trim().length > 0);

  const save = () => {
    if (!parsed || !canSave) return;
    const folderId = resolveFolderChoice(choice);
    const deck = buildManualDeck({ title, folderId, cards: parsed.cards, origin: 'import' });
    useQuizStore.getState().addQuiz(deck);
    addToast(`Am importat ${deck.questions.length} carduri${parsed.skipped ? ` (${parsed.skipped} linii sărite)` : ''}.`, 'success');
    onCreated(deck.id, folderId);
    onClose();
  };

  return (
    <ModalShell
      open={file !== null}
      title="Importă carduri"
      subtitle={file ? `${file.name} · ${parsed ? `${count} carduri găsite${parsed.skipped ? `, ${parsed.skipped} sărite` : ''}` : 'citesc fișierul…'}` : undefined}
      onClose={onClose}
      footer={<><SecondaryButton onClick={onClose}>Anulează</SecondaryButton><PrimaryButton onClick={save} disabled={!canSave}>Importă</PrimaryButton></>}
    >
      {parsed && count === 0 && (
        <p className="rounded-2xl px-3.5 py-3 text-[12.5px]" style={{ background: `${theme.warning}14`, border: `1px solid ${theme.warning}30`, color: theme.text }}>
          Nu am găsit perechi față / spate. Fiecare linie trebuie să aibă cardul și răspunsul, separate prin tab, „;”, „|” sau virgulă.
        </p>
      )}
      <div>
        <FieldLabel>Titlul pachetului</FieldLabel>
        <input type="text" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} aria-label="Titlul pachetului" className="w-full text-[13.5px]" />
      </div>
      <FolderChoiceField value={choice} onChange={setChoice} label="Se salvează în" />
    </ModalShell>
  );
}

/* ── Grile cu AI ────────────────────────────────────────────────────────────────────────────── */

const TYPE_OPTIONS = [{ id: 'single', label: 'Complement simplu' }, { id: 'multiple', label: 'Complement multiplu' }] as const;

export function AiQuizDialog({ open, onClose }: BaseProps) {
  const theme = useTheme();
  const navigate = useNavigate();
  const addToast = useToastStore((state) => state.addToast);
  const hasKey = useAIStore((state) => state.hasKey);
  const folders = useFolderStore((state) => state.folders);
  const options = useMemo(() => destinationOptions('quiz', 'rezidentiat', folders), [folders]);
  const parentOptions = useMemo(() => options.filter((option) => option.id !== QUIZ_AUTO_CHOICE), [options]);

  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<FlashcardDifficulty>('auto');
  const [count, setCount] = useState(10);
  const [questionType, setQuestionType] = useState<'single' | 'multiple'>('single');
  const [choice, setChoice] = useState<FolderChoice>(() => defaultDestinationChoice('quiz', 'rezidentiat'));
  const [busy, setBusy] = useState(false);

  const folderReady = choice.mode === 'existing' || choice.name.trim().length > 0;
  const canRun = hasKey && topic.trim().length >= 3 && folderReady && !busy;

  const run = async () => {
    if (!canRun) return;
    setBusy(true);
    try {
      const result = await generateStudyMaterial({ kind: 'quiz', space: 'rezidentiat', topic, count, difficulty, questionType, folder: choice });
      addToast(`${result.produced} grile despre „${topic.trim()}” în ${result.destination}.`, 'success', 7000, { label: 'Rezolvă', onClick: () => navigate(result.route.route) });
      onClose();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Generarea a eșuat.', 'error', 7000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title="Grile cu AI"
      subtitle="În formatul de rezidențiat: 5 variante, enunț scurt, distractori din aceeași categorie."
      onClose={onClose}
      width="lg"
      footer={(
        <>
          {busy && <span className="mr-auto flex items-center gap-2 text-[12.5px]" style={{ color: theme.text3 }}><Loader2 size={14} className="animate-spin" /> Generez…</span>}
          <SecondaryButton onClick={onClose}>Anulează</SecondaryButton>
          <PrimaryButton onClick={() => void run()} disabled={!canRun}>Generează {count} grile</PrimaryButton>
        </>
      )}
    >
      {!hasKey && (
        <p className="rounded-2xl px-3.5 py-3 text-[12.5px]" style={{ background: `${theme.warning}14`, border: `1px solid ${theme.warning}30`, color: theme.text }}>
          Ai nevoie de o cheie AI ca să generezi grile. O adaugi din Setări › AI.
        </p>
      )}
      <div>
        <FieldLabel>Subiect</FieldLabel>
        <input type="text" autoFocus value={topic} maxLength={120} placeholder="ex. Insuficiența cardiacă, Pancreatita acută…" onChange={(event) => setTopic(event.target.value)} aria-label="Subiectul grilelor" className="w-full text-[13.5px]" />
      </div>
      <div>
        <FieldLabel help="rez-ai-level">Nivel</FieldLabel>
        <Segmented label="Nivel" value={difficulty} options={DIFFICULTY_OPTIONS} onChange={setDifficulty} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Stepper label="Număr de grile" value={count} min={5} max={60} step={5} onChange={setCount} />
        <div>
          <FieldLabel help="rez-ai-type">Tip de grilă</FieldLabel>
          <Segmented label="Tip de grilă" value={questionType} options={TYPE_OPTIONS} onChange={setQuestionType} />
        </div>
      </div>
      <FolderChoiceField value={choice} onChange={setChoice} label="Se salvează în" options={options} parentOptions={parentOptions} newParentDefault={defaultNewFolderParent('quiz', 'rezidentiat')} />
    </ModalShell>
  );
}

/* ── Import de grile: întâi folderul, apoi fișierul ─────────────────────────────────────────── */

export function ImportQuizFolderDialog({ open, onClose, onChosen }: BaseProps & { onChosen: (folderId: string) => void }) {
  const folders = useFolderStore((state) => state.folders);
  const options = useMemo(() => destinationOptions('quiz', 'rezidentiat', folders).filter((option) => option.id !== QUIZ_AUTO_CHOICE), [folders]);
  const [choice, setChoice] = useState<FolderChoice>({ mode: 'existing', id: defaultNewFolderParent('quiz', 'rezidentiat') });
  const ready = choice.mode === 'existing' || choice.name.trim().length > 0;

  const next = () => {
    const id = resolveDestination('quiz', 'rezidentiat', choice);
    if (id) onChosen(id);
  };

  return (
    <ModalShell
      open={open}
      title="Importă grile"
      subtitle="Alege unde intră grilele; urmează fișierul din care le iei."
      onClose={onClose}
      width="sm"
      footer={<><SecondaryButton onClick={onClose}>Anulează</SecondaryButton><PrimaryButton onClick={next} disabled={!ready}>Continuă</PrimaryButton></>}
    >
      <div className="flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--text3, #86868b)' }}>
        <span>Ce pot importa?</span>
        <HelpTip id="rez-import-quiz" size={16} />
      </div>
      <FolderChoiceField value={choice} onChange={setChoice} label="Se salvează în" options={options} newParentDefault={defaultNewFolderParent('quiz', 'rezidentiat')} />
    </ModalShell>
  );
}
