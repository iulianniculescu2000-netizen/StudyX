import { useEffect, useMemo, useState } from 'react';
import { Copy, FolderOpen, FolderSync, Loader2, RefreshCw } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { isSourceReady, useAIStore, type AIKnowledgeSource } from '../../store/aiStore';
import { useUserStore } from '../../store/userStore';
import { useToastStore } from '../../store/toastStore';
import { useReindexSources } from '../../hooks/useReindexSources';
import { isUnderRezidentiatRoot } from '../../lib/rezidentiatRoot';
import { findOutdatedBundledBooks, isBundledLibraryBookName, reindexRezidentiatLibraryBook, type RezidentiatLibraryBook } from '../../lib/rezidentiatLibrary';
import { findDuplicateSources } from '../../lib/ai/bookAutoReindex';
import { ensureMaterialsRoot } from '../../lib/organizareRoot';
import { CAPITOLE_SYNC_EVENT } from '../../lib/capitoleSyncEvent';
import { canReadBookPdf } from '../pdf/bridge';
import ConfirmDialog from '../ConfirmDialog';
import ReindexNameConfirm from './ReindexNameConfirm';
import CapitoleSyncCard from './CapitoleSyncCard';

/** Bannerul „cărți fără pagini” + progresul reindexării + dublurile + sincronizarea Capitolelor, pentru Rezidențiat › Cărțile tale. */
export default function BookLibraryTools() {
  const theme = useTheme();
  const addToast = useToastStore((s) => s.addToast);
  const profileId = useUserStore((s) => s.activeProfileId) ?? 'default';
  const knowledgeSources = useAIStore((s) => s.knowledgeSources);
  const libraryFolders = useAIStore((s) => s.libraryFolders);
  const findSourcesWithoutPages = useAIStore((s) => s.findSourcesWithoutPages);
  const removeKnowledgeSource = useAIStore((s) => s.removeKnowledgeSource);
  const reindex = useReindexSources();
  const [withoutPages, setWithoutPages] = useState<Set<string>>(() => new Set());
  /** Surse pe care citirea automată nu le-a găsit în folder: rămân pentru selectorul manual. */
  const [leftover, setLeftover] = useState<AIKnowledgeSource[]>([]);
  const [starting, setStarting] = useState(false);
  /** Copii în plus ale unei cărți, în așteptarea confirmării (dialogul aplicației, nu cel nativ). */
  const [dupToRemove, setDupToRemove] = useState<{ extra: AIKnowledgeSource[]; name: string; chunks: number } | null>(null);

  // Surse PDF indexate înainte de markerii de pagină: fragmentele lor nu au `page`, deci citările n-au „p. N”.
  const pdfIndexKey = knowledgeSources
    .filter((source) => source.type === 'pdf' && isSourceReady(source))
    .map((source) => `${source.id}:${source.chunkCount}`)
    .join('|');
  useEffect(() => {
    let cancelled = false;
    void findSourcesWithoutPages().then((ids) => {
      if (!cancelled) setWithoutPages(new Set(ids));
    }).catch(() => {
      if (!cancelled) setWithoutPages(new Set());
    });
    return () => { cancelled = true; };
  }, [pdfIndexKey, findSourcesWithoutPages]);

  // Cărți incluse importate înainte de textul curat: se reindexează din text, fără folder și fără PDF.
  const [outdated, setOutdated] = useState<Array<{ sourceId: string; book: RezidentiatLibraryBook }>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const bundledKey = knowledgeSources.map((source) => `${source.id}:${source.charCount}:${source.indexStatus ?? ''}`).join('|');
  useEffect(() => {
    let cancelled = false;
    void findOutdatedBundledBooks(knowledgeSources).then((found) => {
      if (!cancelled) setOutdated(found);
    }).catch(() => {
      if (!cancelled) setOutdated([]);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundledKey]);

  const refreshBundled = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      for (const item of outdated) await reindexRezidentiatLibraryBook(item.sourceId, item.book);
      addToast('Cărțile incluse au fost reindexate din textul curat.', 'success');
    } catch (error) {
      addToast(`Reindexare eșuată: ${error instanceof Error ? error.message : 'eroare necunoscută'}`, 'error', 5000);
    } finally {
      setRefreshing(false);
    }
  };

  const books = useMemo(
    () => knowledgeSources.filter((source) => withoutPages.has(source.id) && !isBundledLibraryBookName(source.name) && !!source.folderId && isUnderRezidentiatRoot(source.folderId, libraryFolders)),
    [knowledgeSources, withoutPages, libraryFolders],
  );
  const manualBooks = useMemo(() => leftover.filter((source) => books.some((b) => b.id === source.id)), [leftover, books]);

  // Aceeași carte indexată de mai multe ori (aceeași denumire și același număr de fragmente).
  const duplicates = useMemo(
    () => findDuplicateSources(
      knowledgeSources.filter((source) => source.type === 'pdf' && isSourceReady(source) && !!source.folderId && isUnderRezidentiatRoot(source.folderId, libraryFolders)),
    ),
    [knowledgeSources, libraryFolders],
  );

  // În aplicația desktop folderul cu materiale se găsește singur (și se corectează dacă a fost ales greșit); în varianta web rămâne selectorul.
  const canAuto = canReadBookPdf();
  const startReindex = async () => {
    if (starting) return;
    if (!canAuto) { reindex.openPicker(books); return; }
    setStarting(true);
    try {
      const folder = await ensureMaterialsRoot(profileId, { pickIfMissing: true });
      // Fără folder cu materiale, cărțile rămân în cardul „Alege fișierele” (selectorul de fișiere).
      setLeftover(folder ? await reindex.reindexFromRoot(books, folder) : books);
    } finally {
      setStarting(false);
    }
  };

  /**
   * Un singur buton: găsește folderul cu materialele (singur, în Desktop/Documente/Drive…), reindexează cărțile fără pagini și
   * pornește sincronizarea Capitolelor, care aduce tot ce e nou fără să mai alegi nimic.
   */
  const syncMaterials = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const folder = await ensureMaterialsRoot(profileId, { pickIfMissing: true });
      if (!folder) return;
      if (books.length > 0) setLeftover(await reindex.reindexFromRoot(books, folder));
      window.dispatchEvent(new Event(CAPITOLE_SYNC_EVENT));
    } finally {
      setStarting(false);
    }
  };

  const confirmRemoveDuplicate = async () => {
    const pending = dupToRemove;
    setDupToRemove(null);
    if (!pending) return;
    for (const source of pending.extra) await removeKnowledgeSource(source.id);
    addToast(`Copia în plus a cărții „${pending.name}" a fost ștearsă.`, 'success');
  };

  return (
    <div className="mb-3 space-y-3">
      <input {...reindex.inputProps} />
      <ReindexNameConfirm check={reindex.renameCheck} onAnswer={reindex.answerRename} />
      <ConfirmDialog
        open={dupToRemove !== null}
        variant="danger"
        title="Șterg copia în plus?"
        description={dupToRemove ? `„${dupToRemove.name}" e indexată de ${dupToRemove.extra.length + 1} ori (${dupToRemove.chunks} de fragmente fiecare). Păstrez prima și șterg ${dupToRemove.extra.length === 1 ? 'copia în plus' : `${dupToRemove.extra.length} copii în plus`}. Cărțile originale de pe disc nu se ating.` : undefined}
        confirmLabel="Șterge copia"
        onConfirm={() => { void confirmRemoveDuplicate(); }}
        onCancel={() => setDupToRemove(null)}
      />
      {canAuto && !reindex.state && (
        <div className="glass-panel flex flex-wrap items-center gap-3 rounded-[var(--r-md)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold" style={{ color: theme.text }}>Sincronizează materialele</div>
            <div className="text-[12px]" style={{ color: theme.text3 }}>
              Găsesc singură folderul cu cărțile și capitolele tale, reindexez cărțile cu pagini și aduc Capitolele în Biblioteca AI. Fișierele rămân la tine, pe calculator.
            </div>
          </div>
          <button
            type="button"
            disabled={starting}
            onClick={() => { void syncMaterials(); }}
            className="press-feedback flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ background: theme.accent }}
          >
            {starting ? <Loader2 size={14} className="animate-spin" /> : <FolderSync size={14} />} Sincronizează materialele
          </button>
        </div>
      )}
      {reindex.state && (
        <div role="status" className="glass-panel flex flex-wrap items-center gap-3 rounded-[var(--r-md)] px-4 py-3">
          <Loader2 size={15} className="animate-spin" style={{ color: theme.accent }} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium" style={{ color: theme.text }}>{reindex.state.label}</span>
          <button type="button" onClick={reindex.cancel} className="fine-chip press-feedback rounded-full px-3 py-1.5 text-[12.5px] font-semibold" style={{ color: theme.danger }}>
            Anulează
          </button>
        </div>
      )}
      {outdated.length > 0 && (
        <div className="glass-panel flex flex-wrap items-center gap-3 rounded-[var(--r-md)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold" style={{ color: theme.text }}>
              {outdated.length === 1 ? 'O carte inclusă are indexul vechi' : `${outdated.length} cărți incluse au indexul vechi`}
            </div>
            <div className="truncate text-[12px]" style={{ color: theme.text3 }}>
              Le reindexez din textul curat, cu pagina din PDF la fiecare citare; indexul vechi rămâne activ până se termină.
            </div>
          </div>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => { void refreshBundled(); }}
            className="press-feedback flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ background: theme.accent }}
          >
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Reindexează din textul curat
          </button>
        </div>
      )}
      {!reindex.state && books.length > 0 && (
        <div className="glass-panel flex flex-wrap items-center gap-3 rounded-[var(--r-md)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold" style={{ color: theme.text }}>
              {books.length} {books.length === 1 ? 'carte nu are' : 'cărți nu au'} pagini în citări
            </div>
            <div className="text-[12px]" style={{ color: theme.text3 }}>
              {canAuto
                ? 'Le citesc direct din folderul tău de materiale, fără să alegi nimic; indexul vechi rămâne activ până se termină reindexarea.'
                : 'Alege din nou PDF-urile (aceleași nume); indexul vechi rămâne activ până se termină reindexarea.'}
            </div>
          </div>
          <button
            type="button"
            disabled={starting}
            onClick={() => { void startReindex(); }}
            className="press-feedback flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ background: theme.accent }}
          >
            <RefreshCw size={14} /> Reindexează cărțile ({books.length})
          </button>
        </div>
      )}
      {!reindex.state && manualBooks.length > 0 && (
        <div className="glass-panel flex flex-wrap items-center gap-3 rounded-[var(--r-md)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold" style={{ color: theme.text }}>
              {manualBooks.length} {manualBooks.length === 1 ? 'carte nu a fost găsită' : 'cărți nu au fost găsite'} în folder
            </div>
            <div className="truncate text-[12px]" style={{ color: theme.text3 }}>
              {manualBooks.map((source) => source.name).join(' · ')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => reindex.openPicker(manualBooks)}
            className="fine-chip press-feedback flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
            style={{ color: theme.accentText }}
          >
            <FolderOpen size={14} /> Alege fișierele
          </button>
        </div>
      )}
      {!reindex.state && duplicates.map((group) => (
        <div key={group.keep.id} className="glass-panel flex flex-wrap items-center gap-3 rounded-[var(--r-md)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold" style={{ color: theme.text }}>
              „{group.keep.name}" e indexată de {group.extra.length + 1} ori
            </div>
            <div className="text-[12px]" style={{ color: theme.text3 }}>
              {group.keep.chunkCount} de fragmente fiecare: căutarea le parcurge de două ori și poate aduce același text. Păstrez o singură copie.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDupToRemove({ extra: group.extra, name: group.keep.name, chunks: group.keep.chunkCount })}
            className="fine-chip press-feedback flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
            style={{ color: theme.danger }}
          >
            <Copy size={14} /> Șterge copia în plus
          </button>
        </div>
      ))}
      {!reindex.state && <CapitoleSyncCard />}
    </div>
  );
}
