import Portal from '../../components/Portal';
import { AnimatePresence, motion } from 'framer-motion';
import { useId, useRef, useState } from 'react';
import { dropdownFitStyle, useDropdownFit } from '../../hooks/useDropdownFit';
import { AlertCircle, Check, ChevronDown, FolderTree, Loader2, Upload, Volume2, X as XIcon } from 'lucide-react';
import type { Folder, Quiz } from '../../types';
import type { Theme } from '../../theme/themes';
import { parseApkg } from '../../lib/anki/ankiParser';
import { mapAnkiCollectionToDecks, planFolderChain, type MappedAnkiDeck } from '../../lib/anki/ankiImport';
import { suggestFolderAppearance } from '../../lib/folderAppearance';
import { useFolderStore } from '../../store/folderStore';
import { useQuizStore } from '../../store/quizStore';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useScrollLock } from '../../hooks/useScrollLock';

type Phase = 'pick' | 'parsing' | 'summary' | 'importing' | 'error';

function folderPath(folders: Folder[], folder: Folder) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  const names = [folder.name];
  let parent = folder.parentId ? byId.get(folder.parentId) : undefined;
  const guard = new Set([folder.id]);
  while (parent && !guard.has(parent.id)) {
    guard.add(parent.id);
    names.unshift(parent.name);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return names.join(' / ');
}

export function AnkiImportModal({
  folders,
  theme,
  onClose,
  onImported,
  defaultParentId,
  requireParent = false,
}: {
  folders: Folder[];
  theme: Theme;
  onClose: () => void;
  onImported: (firstQuizId: string | null) => void;
  /** Folderul în care intră pachetele când utilizatorul nu alege altul (ex. „Rezidențiat / Flashcarduri”). */
  defaultParentId?: string;
  /** Fără opțiunea „rădăcină”: pachetele trebuie să rămână într-un folder dat (Rezidențiat). */
  requireParent?: boolean;
}) {
  const addFolder = useFolderStore((state) => state.addFolder);
  const deleteFolder = useFolderStore((state) => state.deleteFolder);
  const addQuiz = useQuizStore((state) => state.addQuiz);
  const deleteQuiz = useQuizStore((state) => state.deleteQuiz);

  const [phase, setPhase] = useState<Phase>('pick');
  const { calmMotion, t } = useAdaptiveMotion();
  const titleId = useId();
  // Cât timp se importă, fereastra nu se poate închide (nici cu Esc).
  const dialogRef = useFocusTrap(true, () => { if (phase !== 'importing') onClose(); });
  useScrollLock(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ decks: MappedAnkiDeck[]; stats: { deckCount: number; cardCount: number; clozeCount: number; imageCount: number; skippedAudioCount: number } } | null>(null);
  const [parentFolderId, setParentFolderId] = useState<string>(defaultParentId ?? '__root__');
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const parentPickerRef = useRef<HTMLDivElement>(null);
  const parentFit = useDropdownFit(parentPickerOpen, parentPickerRef, { desired: 176 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parentOptions = [
    ...(requireParent ? [] : [{ id: '__root__', label: 'Fără folder părinte (rădăcină)' }]),
    ...folders.map((folder) => ({ id: folder.id, label: folderPath(folders, folder) })),
  ];
  const selectedParentLabel = parentOptions.find((option) => option.id === parentFolderId)?.label ?? 'Fără folder părinte (rădăcină)';

  const handleFilePick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (file: File) => {
    setPhase('parsing');
    setError('');
    try {
      const collection = await parseApkg(file);
      const mapped = await mapAnkiCollectionToDecks(collection);
      if (mapped.decks.length === 0) {
        throw new Error('Nu s-a găsit niciun card în acest pachet Anki.');
      }
      setResult(mapped);
      setPhase('summary');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Eroare la citirea fișierului .apkg.');
      setPhase('error');
    }
  };

  const confirmImport = () => {
    if (!result) return;
    setPhase('importing');

    // Tracks everything created during THIS call so a failure partway through
    // can be undone instead of leaving a partial import silently saved while
    // the UI reports "eșuat" — addFolder never reuses an existing folder, so
    // every id collected here is safe to delete outright on rollback.
    const createdFolderIds: string[] = [];
    const createdQuizIds: string[] = [];

    try {
      const rootParentId = parentFolderId === '__root__' ? null : parentFolderId;
      const folderIdByPath = new Map<string, string>();

      for (const path of planFolderChain(result.decks.map((deck) => deck.path))) {
        const key = path.join('::');
        const segment = path[path.length - 1];
        const parentId = path.length > 1 ? (folderIdByPath.get(path.slice(0, -1).join('::')) ?? rootParentId) : rootParentId;
        const appearance = suggestFolderAppearance(segment);
        const newFolderId = addFolder(segment, appearance.emoji, appearance.color, parentId);
        folderIdByPath.set(key, newFolderId);
        createdFolderIds.push(newFolderId);
      }

      let firstQuizId: string | null = null;
      for (const deck of result.decks) {
        const leafFolderId = deck.path.length > 0 ? (folderIdByPath.get(deck.path.join('::')) ?? rootParentId) : rootParentId;
        const quiz: Quiz = { ...deck.quiz, folderId: leafFolderId };
        addQuiz(quiz);
        createdQuizIds.push(quiz.id);
        if (!firstQuizId) firstQuizId = quiz.id;
      }

      onImported(firstQuizId);
    } catch (err: unknown) {
      // Undo everything this call added — a failed import must leave zero
      // trace, not a partial deck set the UI reported as "eșuat".
      createdQuizIds.forEach((id) => deleteQuiz(id));
      // deleteFolder cascades to descendants, so deleting only the top-level
      // ones this call created is enough — but calling it on an id already
      // removed by its own parent's cascade would be a harmless no-op anyway.
      createdFolderIds.forEach((id) => deleteFolder(id));
      // Without this the modal would stay in 'importing' forever — a phase that
      // deliberately hides the close button — leaving a reload as the only exit.
      setError(err instanceof Error ? err.message : 'Salvarea deck-urilor a eșuat.');
      setPhase('error');
    }
  };

  return (
    <Portal>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: t.modal }}
      exit={{ opacity: 0, transition: t.modalExit }}
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto"
      style={{ background: 'var(--overlay)', backdropFilter: 'blur(var(--blur-1))', padding: '2rem 1rem' }}
      onClick={(event) => { if (event.target === event.currentTarget && phase !== 'importing') onClose(); }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, y: 8, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: t.modal }}
        exit={{ opacity: 0, y: 8, scale: 0.985, transition: t.modalExit }}
        className="w-full max-w-lg rounded-[var(--r-xl)] p-6"
        style={{ background: theme.surface, border: `1px solid ${theme.border}`, boxShadow: 'var(--elev-4)' }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id={titleId} className="text-[15px] font-black" style={{ color: theme.text }}>Import din Anki (.apkg)</h2>
          {phase !== 'importing' && (
            <button
              onClick={onClose}
              aria-label="Închide"
              className="flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] transition-colors focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]"
              style={{ color: theme.text3, background: theme.surface2 }}
            >
              <XIcon size={16} />
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".apkg"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (file) void handleFileChange(file);
          }}
        />

        {phase === 'pick' && (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] font-medium leading-relaxed opacity-70" style={{ color: theme.text }}>
              Alege fișierul .apkg exportat din Anki. Structura de deck-uri (::) devine foldere imbricate,
              iar fiecare notă devine un card față/spate.
            </p>
            <motion.button
              whileTap={calmMotion ? undefined : { scale: 0.97 }}
              onClick={handleFilePick}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--r-md)] py-3.5 text-xs font-black uppercase tracking-widest text-white transition-colors"
              style={{ background: theme.accent }}
            >
              <Upload size={16} />
              Selectează fișier .apkg
            </motion.button>
          </div>
        )}

        {phase === 'parsing' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 size={28} className="animate-spin" style={{ color: theme.accentText }} />
            <p className="text-xs font-bold" style={{ color: theme.text3 }}>Se citește pachetul Anki...</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col gap-3">
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-[var(--r-lg)] border p-3"
              style={{ background: `${theme.danger}08`, borderColor: `${theme.danger}20`, color: theme.danger }}
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <div className="text-[11px] font-bold leading-relaxed">{error}</div>
            </div>
            <button
              onClick={() => setPhase(result ? 'summary' : 'pick')}
              className="rounded-[var(--r-md)] py-3 text-[11px] font-black uppercase tracking-wider transition-colors"
              style={{ background: theme.surface2, color: theme.text3 }}
            >
              {result ? 'Înapoi la sumar' : 'Încearcă din nou'}
            </button>
          </div>
        )}

        {(phase === 'summary' || phase === 'importing') && result && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Deck-uri', value: result.stats.deckCount },
                { label: 'Carduri', value: result.stats.cardCount },
                { label: 'Imagini', value: result.stats.imageCount },
              ].map((stat) => (
                <div key={stat.label} className="rounded-[var(--r-md)] p-3 text-center" style={{ background: theme.surface2 }}>
                  <div className="text-lg font-black leading-none" style={{ color: theme.text }}>{stat.value}</div>
                  <div className="mt-1 text-[9px] font-black uppercase tracking-wider opacity-55" style={{ color: theme.text }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {(result.stats.clozeCount > 0 || result.stats.skippedAudioCount > 0) && (
              <div className="flex flex-col gap-1.5 rounded-[var(--r-md)] border p-3" style={{ borderColor: theme.border, background: theme.surface2 }}>
                {result.stats.clozeCount > 0 && (
                  <p className="text-[10px] font-bold opacity-70" style={{ color: theme.text }}>
                    {result.stats.clozeCount} carduri cloze au fost simplificate la față/spate simplu.
                  </p>
                )}
                {result.stats.skippedAudioCount > 0 && (
                  <p className="flex items-center gap-1.5 text-[10px] font-bold opacity-70" style={{ color: theme.text }}>
                    <Volume2 size={11} />
                    {result.stats.skippedAudioCount} fișiere audio au fost omise (nu sunt redate în StudyX).
                  </p>
                )}
              </div>
            )}

            <div className="max-h-[min(12rem,24vh)] overflow-y-auto rounded-[var(--r-md)] border" style={{ borderColor: theme.border }}>
              {result.decks.map((deck) => (
                <div
                  key={deck.quiz.id}
                  className="flex items-center justify-between gap-2 border-b px-3 py-2 last:border-b-0"
                  style={{ borderColor: theme.border }}
                >
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold" style={{ color: theme.text }}>
                    {deck.path.join(' / ')}
                  </span>
                  <span className="shrink-0 text-[10px] font-black opacity-55" style={{ color: theme.text }}>
                    {deck.quiz.questions.length}
                  </span>
                </div>
              ))}
            </div>

            <div ref={parentPickerRef} className="relative">
              <button
                type="button"
                disabled={phase === 'importing'}
                onClick={() => setParentPickerOpen((current) => !current)}
                aria-haspopup="listbox"
                aria-expanded={parentPickerOpen}
                className="flex w-full items-center gap-2 rounded-[var(--r-md)] border px-3 py-2.5 text-left transition-colors disabled:opacity-60"
                style={{ background: theme.surface2, borderColor: theme.border, color: theme.text }}
              >
                <FolderTree size={14} style={{ color: theme.text3 }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: theme.text3 }}>
                    Folder părinte
                  </div>
                  <div className="mt-0.5 truncate text-xs font-black">{selectedParentLabel}</div>
                </div>
                <ChevronDown size={14} style={{ color: theme.text3 }} />
              </button>

              <AnimatePresence>
                {parentPickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0, transition: t.pop }}
                    exit={{ opacity: 0, y: 4, transition: t.popExit }}
                    className="custom-scrollbar absolute left-0 right-0 z-10 rounded-[var(--r-md)] border p-1.5"
                    style={{
                      background: theme.modalBg,
                      borderColor: theme.border,
                      boxShadow: 'var(--elev-3)',
                      ...dropdownFitStyle(parentFit, '0.4rem'),
                    }}
                  >
                    {parentOptions.map((option) => {
                      const active = option.id === parentFolderId;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => { setParentFolderId(option.id); setParentPickerOpen(false); }}
                          className="flex w-full items-center gap-2 rounded-[var(--r-sm)] px-3 py-2 text-left transition-colors"
                          style={{
                            background: active ? theme.accent : 'transparent',
                            color: active ? '#fff' : theme.text,
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate text-xs font-bold">{option.label}</span>
                          {active && <Check size={13} />}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.button
              whileTap={calmMotion || phase === 'importing' ? undefined : { scale: 0.97 }}
              disabled={phase === 'importing'}
              onClick={confirmImport}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--r-md)] py-3.5 text-xs font-black uppercase tracking-widest text-white transition-colors"
              style={{
                background: phase === 'importing' ? theme.surface2 : theme.accent,
                color: phase === 'importing' ? theme.text3 : '#fff',
              }}
            >
              {phase === 'importing' ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Se importă...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Importă {result.stats.deckCount} deck-uri
                </>
              )}
            </motion.button>
          </div>
        )}
      </motion.div>
    </motion.div>
    </Portal>
  );
}
