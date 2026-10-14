import PageHeader from '../components/ui/PageHeader';
import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  FileText,
  Image,
  Layers3,
  Library,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useAIStore, isSourceReady, type AILibraryFolder, type AIKnowledgeSource } from '../store/aiStore';
import { useToastStore } from '../store/toastStore';
import { useUIStore } from '../store/uiStore';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useSourceChapters } from '../hooks/useSourceChapters';
import { dispatchGenerateFromChapter } from '../lib/ai/chapterEvents';
import ConfirmDialog from '../components/ConfirmDialog';
import ExamPlanCard from '../components/ExamPlanCard';
import { getPdfOcrEnabled, setPdfOcrEnabled } from '../ai/pdfOcr';
import SectionLabel from '../components/ui/SectionLabel';
import { useReindexSources } from '../hooks/useReindexSources';
import ReindexNameConfirm from '../components/residency/ReindexNameConfirm';
import EmptyState from '../components/ui/EmptyState';
import { suggestFolderAppearance } from '../lib/folderAppearance';
import { isBundledLibraryBookName } from '../lib/rezidentiatLibrary';
import { FILTERS, filterByType, plainSearchText, type TypeFilter } from './knowledge-vault/helpers';
import BaseBooksGroup from './knowledge-vault/BaseBooksGroup';
import { groupByTier } from '../lib/bookTier';
import { isProtectedSource } from '../lib/bookProtection';
import { findRezidentiatRootFolder, isRezidentiatRootFolder } from '../lib/rezidentiatRoot';
import { bookOfSourceName } from '../lib/curriculum';
import { dispatchOpenBook } from '../components/pdf/bookRequest';
import FolderRow from './knowledge-vault/FolderRow';
import SourceRow, { type MenuPos } from './knowledge-vault/SourceRow';
import ReaderModal from './knowledge-vault/ReaderModal';
import { useVaultUpload } from './knowledge-vault/useVaultUpload';
import { tidyBookText } from './quiz-play/relevantDocFormatting';

export default function KnowledgeVault() {
  const theme = useTheme();
  const { performanceLite } = useAdaptiveMotion();
  const allKnowledgeSources = useAIStore((state) => state.knowledgeSources);
  const addKnowledgeSource = useAIStore((state) => state.addKnowledgeSource);
  const removeKnowledgeSource = useAIStore((state) => state.removeKnowledgeSource);
  const findSourcesWithoutPages = useAIStore((state) => state.findSourcesWithoutPages);
  const allLibraryFolders = useAIStore((state) => state.libraryFolders);
  // Ierarhia din Rezidențiat se vede și aici: cărțile de bază fixate sus, apoi materialele din Rezidențiat, apoi restul bibliotecii.
  const libraryFolders = allLibraryFolders;
  const knowledgeSources = allKnowledgeSources;
  const rezRoot = useMemo(() => findRezidentiatRootFolder(libraryFolders), [libraryFolders]);
  const baseBookIds = useMemo(() => new Set(groupByTier(knowledgeSources, libraryFolders).book.map((source) => source.id)), [knowledgeSources, libraryFolders]);
  const addLibraryFolder = useAIStore((state) => state.addLibraryFolder);
  const deleteLibraryFolder = useAIStore((state) => state.deleteLibraryFolder);
  const renameLibraryFolder = useAIStore((state) => state.renameLibraryFolder);
  const moveSourceToLibraryFolder = useAIStore((state) => state.moveSourceToLibraryFolder);
  const addToast = useToastStore((state) => state.addToast);
  const setChatOpen = useUIStore((state) => state.setChatOpen);
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkedSourceRef = useRef<string | null>(null);

  // Navigation: null = top level (folders view), folderId = inside a folder
  const [activeFolderId, setActiveFolderId] = useState<string | null | '__unfiled__'>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [menuSourceId, setMenuSourceId] = useState<string | null>(null);
  // Where the open "⋯" menu sits (viewport coordinates); drawn in a portal, flips upward when there is no room.
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState<{ id: string; name: string } | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerContent, setReaderContent] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [movingSourceId, setMovingSourceId] = useState<string | null>(null);
  const [creatingSubfolder, setCreatingSubfolder] = useState(false);
  const [newSubfolderName, setNewSubfolderName] = useState('');
  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string } | null>(null);

  const { loading, processStep, fileInputRef, handleFileUpload } = useVaultUpload({
    activeFolderId: activeFolderId === '__unfiled__' ? null : activeFolderId,
    addKnowledgeSource,
    addToast,
  });

  // Reindexare pentru pagini: octeții PDF-ului original nu se păstrează (în bibliotecă rămân doar textul
  // fragmentat și vectorii), deci utilizatorul alege din nou fișierul, legat de sursa existentă.
  const reindex = useReindexSources(loading);
  const reindexState = reindex.state;
  const [sourcesWithoutPages, setSourcesWithoutPages] = useState<Set<string>>(() => new Set());
  const [ocrEnabled, setOcrEnabled] = useState(getPdfOcrEnabled);
  // Enter/Escape close the name field, and removing a focused input can still fire its blur: without
  // this guard the folder was created twice (Enter) or even after Escape.
  const folderFormClosedRef = useRef(true);
  const subfolderFormClosedRef = useRef(true);

  const activeFolder = useMemo(
    () => libraryFolders.find((f) => f.id === activeFolderId) ?? null,
    [libraryFolders, activeFolderId],
  );

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let unfiled = 0;
    for (const source of knowledgeSources) {
      // Cărțile de bază au grupul lor, deasupra folderelor: nu se numără în foldere.
      if (baseBookIds.has(source.id)) continue;
      if (source.folderId) counts.set(source.folderId, (counts.get(source.folderId) ?? 0) + 1);
      else unfiled += 1;
    }
    return { counts, unfiled };
  }, [knowledgeSources, baseBookIds]);

  const rootFolders = useMemo(
    () => libraryFolders.filter((folder) => !folder.parentId && !isRezidentiatRootFolder(folder)),
    [libraryFolders],
  );

  const subfoldersByParent = useMemo(() => {
    const map = new Map<string, AILibraryFolder[]>();
    for (const folder of libraryFolders) {
      if (!folder.parentId) continue;
      map.set(folder.parentId, [...(map.get(folder.parentId) ?? []), folder]);
    }
    return map;
  }, [libraryFolders]);

  const activeSubfolders = useMemo(
    () => (activeFolder ? subfoldersByParent.get(activeFolder.id) ?? [] : []),
    [activeFolder, subfoldersByParent],
  );

  // Flat "move to folder" options, labelled with their full path so a subfolder
  // like "Hematologie / Cursuri" is distinguishable from a sibling root folder.
  const libraryFolderOptions = useMemo(() => {
    const byId = new Map(libraryFolders.map((folder) => [folder.id, folder]));
    const pathLabel = (folder: AILibraryFolder) => {
      const names = [folder.name];
      const guard = new Set<string>([folder.id]);
      let parent = folder.parentId ? byId.get(folder.parentId) : undefined;
      while (parent && !guard.has(parent.id)) {
        guard.add(parent.id);
        names.unshift(parent.name);
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      }
      return names.join(' / ');
    };
    return libraryFolders.map((folder) => ({ value: folder.id, label: `${folder.emoji} ${pathLabel(folder)}` }));
  }, [libraryFolders]);

  // Breadcrumb chain from the root down to the active folder (inclusive).
  const folderPath = useMemo(() => {
    if (!activeFolder) return [] as AILibraryFolder[];
    const byId = new Map(libraryFolders.map((folder) => [folder.id, folder]));
    const chain: AILibraryFolder[] = [];
    const guard = new Set<string>();
    let current: AILibraryFolder | undefined = activeFolder;
    while (current && !guard.has(current.id)) {
      guard.add(current.id);
      chain.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return chain;
  }, [activeFolder, libraryFolders]);

  const visibleSources = useMemo(() => {
    let list = knowledgeSources;
    if (activeFolderId === '__unfiled__') {
      list = list.filter((s) => !s.folderId);
    } else if (activeFolderId) {
      list = list.filter((s) => s.folderId === activeFolderId);
    }
    const q = plainSearchText(search);
    if (q) {
      list = list.filter((s) => plainSearchText(s.name).includes(q) || plainSearchText(s.preview).includes(q));
    }
    // Cărțile de bază primele, apoi cele mai noi.
    return [...list].sort((a, b) => Number(baseBookIds.has(b.id)) - Number(baseBookIds.has(a.id)) || (baseBookIds.has(a.id) ? 'KLS'.indexOf(bookOfSourceName(a.name) ?? "S") - 'KLS'.indexOf(bookOfSourceName(b.name) ?? "S") : 0) || b.addedAt - a.addedAt);
  }, [knowledgeSources, activeFolderId, search, baseBookIds]);

  // Unfiltered by the search box — the exam plan card needs every source
  // directly in this folder, not just the ones matching the current query.
  const sourcesInActiveFolder = useMemo(
    () => (activeFolder ? knowledgeSources.filter((s) => s.folderId === activeFolder.id) : []),
    [knowledgeSources, activeFolder],
  );

  const totalWords = useMemo(
    () => knowledgeSources.reduce((acc, s) => acc + s.wordCount, 0),
    [knowledgeSources],
  );

  const stats = useMemo(() => ({
    indexingCount: knowledgeSources.filter((s) => s.indexStatus === 'indexing').length,
    failedCount: knowledgeSources.filter((s) => s.indexStatus === 'error').length,
    chunkCount: knowledgeSources.reduce((acc, s) => acc + (s.chunkCount ?? 0), 0),
  }), [knowledgeSources]);

  const selectedSource = useMemo(
    () => allKnowledgeSources.find((s) => s.id === selectedSourceId) ?? null,
    [allKnowledgeSources, selectedSourceId],
  );

  const { chapters: sourceChapters } = useSourceChapters(readerOpen ? selectedSourceId : null);

  useEffect(() => {
    if (!menuSourceId) return;
    const close = () => setMenuSourceId(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    // capture: any scrolling container (the page, not just the window) moves the anchor away
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menuSourceId]);

  const confirmDeleteSource = async () => {
    if (!sourceToDelete) return;
    const { id, name } = sourceToDelete;
    setSourceToDelete(null);
    try {
      await removeKnowledgeSource(id);
      addToast(`„${name.replace(/\.(pdf|docx|txt|md)$/i, '')}" a fost șters din bibliotecă.`, 'info');
    } catch (error) {
      console.warn('[Vault] ștergere eșuată', error);
      addToast('Nu am putut șterge documentul. Încearcă din nou.', 'error');
    }
  };

  const submitNewFolder = () => {
    if (folderFormClosedRef.current) return;
    folderFormClosedRef.current = true;
    const name = newFolderName.trim();
    if (!name) { setCreatingFolder(false); return; }
    const id = addLibraryFolder(name, suggestFolderAppearance(name).emoji);
    setNewFolderName('');
    setCreatingFolder(false);
    setActiveFolderId(id);
    addToast(`Folderul „${name}" a fost creat.`, 'success');
  };

  const submitNewSubfolder = () => {
    if (subfolderFormClosedRef.current) return;
    subfolderFormClosedRef.current = true;
    const name = newSubfolderName.trim();
    if (!name || !activeFolder) { setCreatingSubfolder(false); setNewSubfolderName(''); return; }
    const id = addLibraryFolder(name, suggestFolderAppearance(name).emoji, activeFolder.id);
    setNewSubfolderName('');
    setCreatingSubfolder(false);
    setActiveFolderId(id);
    addToast(`Subfolderul „${name}" a fost creat.`, 'success');
  };

  const confirmDeleteFolder = () => {
    if (!folderToDelete) return;
    const deletedId = folderToDelete.id;
    const parentOfDeleted = libraryFolders.find((folder) => folder.id === deletedId)?.parentId ?? null;
    deleteLibraryFolder(deletedId);
    addToast(`Folderul „${folderToDelete.name}" șters.`, 'info');
    // If we were viewing the folder we just deleted, step back to its parent.
    if (activeFolderId === deletedId) setActiveFolderId(parentOfDeleted);
    setFolderToDelete(null);
  };

  // Surse PDF indexate înainte de markerii de pagină: fragmentele lor nu au `page`, deci citările n-au „p. N".
  const pdfIndexKey = knowledgeSources
    .filter((source) => source.type === 'pdf' && isSourceReady(source))
    .map((source) => `${source.id}:${source.chunkCount}`)
    .join('|');
  useEffect(() => {
    let cancelled = false;
    void findSourcesWithoutPages().then((ids) => {
      if (cancelled) return;
      // Cărțile incluse în aplicație sunt text simplu, fără pagini: nu le semnalăm.
      const bundled = new Set(useAIStore.getState().knowledgeSources.filter((source) => isBundledLibraryBookName(source.name)).map((source) => source.id));
      setSourcesWithoutPages(new Set(ids.filter((id) => !bundled.has(id))));
    }).catch(() => {
      if (!cancelled) setSourcesWithoutPages(new Set());
    });
    return () => { cancelled = true; };
  }, [pdfIndexKey, findSourcesWithoutPages]);

  const openReader = async (source: AIKnowledgeSource) => {
    setSelectedSourceId(source.id);
    setReaderOpen(true);

    if (source.indexStatus === 'indexing') {
      setReaderLoading(false);
      setReaderContent('Documentul este încă în indexare. Vizualizarea devine disponibilă după finalizare.');
      return;
    }

    if (source.indexStatus === 'error') {
      setReaderLoading(false);
      setReaderContent(source.indexError || 'Importul a intrat în eroare. Reimportă documentul.');
      return;
    }

    setReaderLoading(true);
    try {
      const { getVaultChunksBySource } = await import('../ai/vectorStore');
      const chunks = await getVaultChunksBySource(source.id);
      const previewText = chunks
        .slice(0, 8)
        .map((chunk) => tidyBookText(chunk.text).trim())
        .filter(Boolean)
        .join('\n\n');
      setReaderContent(previewText || 'Nu am găsit încă fragmente pentru această sursă.');
    } catch {
      setReaderContent('Nu am putut încărca conținutul pentru această sursă.');
    } finally {
      setReaderLoading(false);
    }
  };

  // Deep-link from external triggers: /vault?source=<id> opens
  // that document's reader once, then clears the param.
  useEffect(() => {
    const sourceId = searchParams.get('source');
    if (!sourceId || deepLinkedSourceRef.current === sourceId) return;
    const source = allKnowledgeSources.find(
      (s) => s.id === sourceId || s.name.toLowerCase() === sourceId.toLowerCase()
    );
    if (!source) return;
    deepLinkedSourceRef.current = sourceId;
    void openReader(source);
    const next = new URLSearchParams(searchParams);
    next.delete('source');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, allKnowledgeSources]);

  // Deep-link from other pages (e.g. the Residency bookshelf's "Adaugă carte" button):
  // /vault?folder=<id> selects that folder once, then clears the param.
  const deepLinkedFolderRef = useRef<string | null>(null);
  useEffect(() => {
    const folderId = searchParams.get('folder');
    if (!folderId || deepLinkedFolderRef.current === folderId) return;
    if (!libraryFolders.some((folder) => folder.id === folderId)) return;
    deepLinkedFolderRef.current = folderId;
    setActiveFolderId(folderId);
    const next = new URLSearchParams(searchParams);
    next.delete('folder');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, libraryFolders]);

  const askAIAboutSource = (source: AIKnowledgeSource) => {
    setChatOpen(true);
    window.dispatchEvent(new CustomEvent('studyx:ai-prompt', {
      detail: {
        open: true,
        view: 'chat', // "Întreabă AI" opens a conversation, not the generator
        mode: 'summarize',
        sourceId: source.id,
        sourceName: source.name,
        resetConversation: true,
        prompt: `Analizează documentul "${source.name}" și rezumă-mi ideile-cheie, punctele sensibile și ce merită învățat prioritar din el.`,
      },
    }));
  };

  const openAIStudioForSource = (source?: AIKnowledgeSource) => {
    const targetSource = source ?? selectedSource ?? visibleSources.find((s) => s.indexStatus === 'ready') ?? null;
    setChatOpen(true);
    window.dispatchEvent(new CustomEvent('studyx:ai-prompt', {
      detail: {
        open: true,
        view: 'studio',
        mode: 'summarize',
        sourceId: targetSource?.id,
        sourceName: targetSource?.name,
        resetConversation: true,
        prompt: targetSource
          ? `Generează pentru "${targetSource.name}" pachete de grile adaptate și ajută-mă să aleg setările potrivite.`
          : 'Vreau să generez pachete de grile dintr-un curs și să aleg unde se salvează.',
      },
    }));
  };

  const generateFromChapter = (heading: string, label: string) => {
    if (!selectedSource) return;
    setChatOpen(true);
    dispatchGenerateFromChapter(selectedSource, heading, label);
  };

  const isTopLevel = activeFolderId === null;

  const showFolderList = isTopLevel && !search.trim();
  const isSearchingTop = isTopLevel && !!search.trim();
  const ownSources = knowledgeSources.filter((source) => !baseBookIds.has(source.id));
  const showRecents = showFolderList && ownSources.length >= 4;
  const recentSources = showRecents
    ? [...ownSources].sort((a, b) => b.addedAt - a.addedAt).slice(0, 3)
    : [];
  const showEmptyHint = showFolderList && ownSources.length === 0 && rootFolders.length === 0 && !rezRoot;

  const typeFilteredSources = filterByType(visibleSources, typeFilter);

  const headerTitle = isTopLevel
    ? <>Biblioteca <span style={{ color: theme.accentText }}>AI</span></>
    : activeFolderId === '__unfiled__'
      ? 'Neclasificate'
      : (activeFolder ? activeFolder.name : 'Bibliotecă');

  const headerSubtitle = isTopLevel
    ? `${knowledgeSources.length} ${knowledgeSources.length === 1 ? 'document' : 'documente'} · ${totalWords.toLocaleString('ro-RO')} cuvinte · ${stats.chunkCount.toLocaleString('ro-RO')} fragmente indexate`
    : `${sourcesInActiveFolder.length || (activeFolderId === '__unfiled__' ? folderCounts.unfiled : 0)} ${(sourcesInActiveFolder.length || (activeFolderId === '__unfiled__' ? folderCounts.unfiled : 0)) === 1 ? 'document' : 'documente'}${activeSubfolders.length > 0 ? ` · ${activeSubfolders.length} ${activeSubfolders.length === 1 ? 'subfolder' : 'subfoldere'}` : ''}`;

  const toggleSourceMenu = (source: AIKnowledgeSource, anchor: HTMLElement) => {
    if (menuSourceId === source.id) { setMenuSourceId(null); return; }
    const rect = anchor.getBoundingClientRect();
    const room = window.innerHeight - rect.bottom;
    setMenuPos({
      right: Math.max(8, window.innerWidth - rect.right),
      ...(room < 220 ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
    setMenuSourceId(source.id);
  };

  /** O carte de bază se deschide în cititorul cărții (din aplicație, fără folder ales); altfel în previzualizarea de text. */
  const openBaseBook = (source: AIKnowledgeSource) => {
    const code = bookOfSourceName(source.name);
    if (code) dispatchOpenBook({ book: code, pdfPage: 1 });
    else void openReader(source);
  };

  const renderSourceRow = (source: AIKnowledgeSource, index: number) => (
    <SourceRow
      key={source.id}
      source={source}
      index={index}
      performanceLite={performanceLite}
      folderName={source.folderId ? libraryFolders.find((f) => f.id === source.folderId)?.name : null}
      isSearchingTop={isSearchingTop}
      menuOpen={menuSourceId === source.id}
      menuPos={menuPos}
      moving={movingSourceId === source.id}
      missingPages={sourcesWithoutPages.has(source.id)}
      reindexState={reindexState}
      reindexBusy={loading || reindexState !== null}
      folderOptions={libraryFolderOptions}
      onOpenReader={(s) => void openReader(s)}
      onAsk={askAIAboutSource}
      onOpenStudio={openAIStudioForSource}
      onReindex={(s) => reindex.openPicker([s])}
      onToggleMenu={toggleSourceMenu}
      onCloseMenu={() => setMenuSourceId(null)}
      onStartMove={setMovingSourceId}
      onCancelMove={() => setMovingSourceId(null)}
      onMove={(sourceId, folderId) => { moveSourceToLibraryFolder(sourceId, folderId); setMovingSourceId(null); }}
      onRequestDelete={(s) => setSourceToDelete({ id: s.id, name: s.name })}
      locked={isProtectedSource(source)}
      onOpenBook={openBaseBook}
    />
  );

  const renderFolderRow = (folder: AILibraryFolder, index: number, onOpen: () => void) => (
    <FolderRow
      key={folder.id}
      folder={folder}
      index={index}
      docCount={folderCounts.counts.get(folder.id) ?? 0}
      subCount={subfoldersByParent.get(folder.id)?.length ?? 0}
      fragments={knowledgeSources.reduce((sum, s) => (s.folderId === folder.id && !baseBookIds.has(s.id) ? sum + (s.chunkCount ?? 0) : sum), 0)}
      onOpen={onOpen}
      onDelete={() => setFolderToDelete({ id: folder.id, name: folder.name })}
      onRename={(name) => renameLibraryFolder(folder.id, name)}
    />
  );

  return (
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <PageHeader
            title={headerTitle}
            subtitle={headerSubtitle}
            tour={isTopLevel ? { id: 'vault', label: 'Vezi turul Bibliotecii AI' } : undefined}
            breadcrumbs={!isTopLevel && (
            <div className="flex flex-wrap items-center gap-0.5 text-[13.5px] font-medium">
              <button
                type="button"
                onClick={() => { setActiveFolderId(null); setSearch(''); setTypeFilter('all'); }}
                className="press-feedback inline-flex items-center gap-0.5"
                style={{ color: theme.accentText }}
              >
                <ArrowLeft size={15} /> Biblioteca AI
              </button>
              {folderPath.slice(0, -1).map((ancestor) => (
                <span key={ancestor.id} className="flex items-center gap-0.5" style={{ color: theme.text3 }}>
                  <ChevronRight size={13} />
                  <button
                    type="button"
                    onClick={() => { setActiveFolderId(ancestor.id); setSearch(''); setTypeFilter('all'); }}
                    style={{ color: theme.accentText }}
                  >
                    {ancestor.name}
                  </button>
                </span>
              ))}
            </div>
          )}
          actions={<>
              {!isTopLevel && activeFolder && !creatingSubfolder && (
                <button
                  type="button"
                  onClick={() => { subfolderFormClosedRef.current = false; setCreatingSubfolder(true); }}
                  className="fine-chip press-feedback flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium"
                  style={{ color: theme.text2 }}
                >
                  <FolderPlus size={14} /> Subfolder nou
                </button>
              )}
              {isTopLevel && (
                <button
                  type="button"
                  data-tutorial="vault-studio"
                  onClick={() => openAIStudioForSource()}
                  className="fine-chip press-feedback flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium"
                  style={{ color: theme.text2 }}
                >
                  <Layers3 size={14} /> AI Studio
                </button>
              )}
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept=".pdf,.docx,.txt,.md,image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                type="button"
                data-tutorial="vault-add"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="press-feedback flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white transition-[filter] duration-300 hover:brightness-110 disabled:opacity-70"
                style={{ background: theme.accent }}
              >
                {loading ? <><Loader2 size={14} className="animate-spin" /> Procesăm…</> : <><Plus size={14} /> {isTopLevel ? 'Adaugă' : 'Adaugă în folder'}</>}
              </button>
          </>}
          />
          {loading && processStep && (
            <div role="status" className="mt-3 inline-flex max-w-full rounded-full px-3.5 py-1.5 text-[12px] font-medium" style={{ background: `${theme.accent}12`, color: theme.accentText }}>
              <span className="truncate">{processStep}</span>
            </div>
          )}
        </div>

        <input {...reindex.inputProps} />
        <ReindexNameConfirm check={reindex.renameCheck} onAnswer={reindex.answerRename} />
        {reindexState && (
          <div role="status" className="glass-panel flex flex-wrap items-center gap-3 rounded-[var(--r-md)] px-4 py-3">
            <Loader2 size={15} className="animate-spin" style={{ color: theme.accent }} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium" style={{ color: theme.text }}>{reindexState.label}</span>
            <button
              type="button"
              onClick={reindex.cancel}
              className="fine-chip press-feedback rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
              style={{ color: theme.danger }}
            >
              Anulează
            </button>
          </div>
        )}
        {/* Search (+ type filters inside a folder) */}
        <div className="flex flex-wrap items-center gap-2">
          <label data-tutorial="vault-search" className="search-field flex min-w-[200px] flex-1 items-center gap-2 rounded-[var(--r-sm)] px-3 py-2" style={{ background: 'var(--fill-subtle)' }}>
            <Search size={15} style={{ color: theme.text3 }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isTopLevel ? 'Caută în toate documentele' : 'Caută în folder'}
              aria-label="Caută documente"
              className="input-bare w-full text-[13.5px]"
              style={{ color: theme.text }}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Șterge căutarea" style={{ color: theme.text3 }}><X size={14} /></button>
            )}
          </label>
          {!isTopLevel && FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              data-active={typeFilter === filter.id}
              aria-pressed={typeFilter === filter.id}
              onClick={() => setTypeFilter(filter.id)}
              className="fine-chip press-feedback rounded-full px-3 py-1.5 text-[12.5px] font-medium"
              style={{ color: typeFilter === filter.id ? undefined : theme.text2 }}
            >
              {filter.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={ocrEnabled}
            title="Citește prin OCR paginile PDF fără text (scanări). Încet; o scanare integrală se citește oricum prin OCR."
            onClick={() => { const next = !ocrEnabled; setOcrEnabled(next); setPdfOcrEnabled(next); }}
            className="fine-chip press-feedback rounded-full px-3 py-1.5 text-[12.5px] font-medium"
            data-active={ocrEnabled}
            style={{ color: ocrEnabled ? undefined : theme.text2 }}
          >
            OCR pagini scanate: {ocrEnabled ? 'pornit' : 'oprit'}
          </button>
        </div>

        {/* ── TOP LEVEL ── */}
        {showFolderList && <BaseBooksGroup onAsk={askAIAboutSource} />}

        {showRecents && (
          <section>
            <SectionLabel className="mb-2">Recente</SectionLabel>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {recentSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => void openReader(source)}
                  aria-label={`${source.indexStatus === 'indexing' || source.indexStatus === 'error' ? 'Vezi starea pentru' : 'Deschide'} ${source.name}`}
                  className="fine-card press-feedback min-w-0 rounded-[var(--r-md)] p-3 text-left"
                  style={{ background: theme.surface }}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-[var(--r-sm)]" style={{ background: `${theme.accent}18`, color: theme.accentText }}>
                    {source.type === 'image' ? <Image size={18} /> : <FileText size={18} />}
                  </div>
                  <div className="mt-2.5 truncate text-[13.5px] font-semibold" style={{ color: theme.text }}>{source.name.replace(/\.(pdf|docx|txt|md)$/i, '')}</div>
                  <div className="text-[12px]" style={{ color: theme.text3 }}>
                    {source.folderId ? libraryFolders.find((f) => f.id === source.folderId)?.name ?? 'Bibliotecă' : 'Neclasificate'}
                    {source.indexStatus === 'ready' || source.indexStatus === undefined ? ' · indexat' : source.indexStatus === 'indexing' ? ' · se indexează' : ' · eroare'}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {showFolderList && rezRoot && (
          <section>
            <SectionLabel className="mb-2">Materiale din Rezidențiat</SectionLabel>
            <div className="glass-panel overflow-hidden rounded-[var(--r-md)]">
              {renderFolderRow(rezRoot, 0, () => setActiveFolderId(rezRoot.id))}
            </div>
          </section>
        )}

        {showFolderList && (
          <section>
            <SectionLabel className="mb-2">Foldere</SectionLabel>
            {showEmptyHint && !creatingFolder ? (
              // While the first file is being read the library is empty only for a moment: say that, not "add files".
              loading ? (
                <EmptyState
                  icon={Loader2}
                  busy
                  title="Pregătim documentul"
                  body="Îl citim și îl împărțim pe fragmente pentru AI. Apare aici imediat ce e gata."
                />
              ) : (
              <EmptyState
                icon={Library}
                title="Niciun document propriu încă"
                body="Adaugă PDF-uri, documente Word sau imagini, iar AI-ul le folosește ca sursă pentru răspunsuri, alături de cărțile de bază."
                primary={{ label: 'Adaugă fișiere', onClick: () => fileInputRef.current?.click() }}
              />
              )
            ) : (
              <div className="glass-panel overflow-hidden rounded-[var(--r-md)]">
                {folderCounts.unfiled > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setActiveFolderId('__unfiled__')}
                      className="fine-row flex w-full items-center gap-3 px-4 py-3 text-left"
                      style={{ borderRadius: 0 }}
                    >
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)] text-lg" style={{ background: 'var(--fill-subtle)', color: theme.text3 }}><FolderOpen size={18} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold" style={{ color: theme.text }}>Neclasificate</div>
                        <div className="text-[12px]" style={{ color: theme.text3 }}>{folderCounts.unfiled} {folderCounts.unfiled === 1 ? 'document' : 'documente'}</div>
                      </div>
                      <ChevronRight size={16} style={{ color: theme.text3 }} />
                    </button>
                  </div>
                )}
                {rootFolders.map((folder, i) => renderFolderRow(folder, i + (folderCounts.unfiled > 0 ? 1 : 0), () => setActiveFolderId(folder.id)))}
                {creatingFolder && (
                  <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: '1px solid var(--hairline)' }}>
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)] text-lg" style={{ background: `${theme.accent}18`, color: theme.accent }}><BookOpen size={18} /></div>
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitNewFolder();
                        if (e.key === 'Escape') { folderFormClosedRef.current = true; setCreatingFolder(false); setNewFolderName(''); }
                      }}
                      onBlur={submitNewFolder}
                      placeholder="Nume folder"
                      aria-label="Nume folder nou"
                      className="w-full rounded-[var(--r-sm)] px-3 py-2 text-[14px] font-medium outline-none"
                      style={{ background: 'var(--fill-subtle)', color: theme.text }}
                    />
                  </div>
                )}
              </div>
            )}
            {!creatingFolder && (
              <button
                type="button"
                onClick={() => { folderFormClosedRef.current = false; setCreatingFolder(true); }}
                className="press-feedback mt-3 flex items-center gap-1.5 px-1 text-[13px] font-semibold"
                style={{ color: theme.accentText }}
              >
                <FolderPlus size={14} /> Folder nou
              </button>
            )}
          </section>
        )}

        {/* ── SEARCH RESULTS (top level) and FOLDER LEVEL: documents ── */}
        {(isSearchingTop || !isTopLevel) && (
          <div className="space-y-5">
            {!isTopLevel && activeFolder && (activeSubfolders.length > 0 || creatingSubfolder) && (
              <section>
                <SectionLabel className="mb-2">Subfoldere</SectionLabel>
                <div className="glass-panel overflow-hidden rounded-[var(--r-md)]">
                  {activeSubfolders.map((folder, i) => renderFolderRow(folder, i, () => { setActiveFolderId(folder.id); setSearch(''); setTypeFilter('all'); }))}
                  {creatingSubfolder && (
                    <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: activeSubfolders.length > 0 ? '1px solid var(--hairline)' : undefined }}>
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)] text-lg" style={{ background: `${theme.accent}18`, color: theme.accent }}><Folder size={18} /></div>
                      <input
                        autoFocus
                        value={newSubfolderName}
                        onChange={(e) => setNewSubfolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitNewSubfolder();
                          if (e.key === 'Escape') { subfolderFormClosedRef.current = true; setCreatingSubfolder(false); setNewSubfolderName(''); }
                        }}
                        onBlur={submitNewSubfolder}
                        placeholder="Nume subfolder"
                        aria-label="Nume subfolder nou"
                        className="w-full rounded-[var(--r-sm)] px-3 py-2 text-[14px] font-medium outline-none"
                        style={{ background: 'var(--fill-subtle)', color: theme.text }}
                      />
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeFolder && <ExamPlanCard folder={activeFolder} sources={sourcesInActiveFolder} />}

            {typeFilteredSources.length === 0 ? (
              search || typeFilter !== 'all' ? (
                <EmptyState
                  icon={Search}
                  title="Niciun document găsit"
                  body="Încearcă altă căutare sau alt filtru."
                  primary={{ label: 'Șterge filtrele', onClick: () => { setSearch(''); setTypeFilter('all'); } }}
                />
              ) : (
                <EmptyState
                  icon={Library}
                  title="Folderul e gol"
                  body="Adaugă documente în acest folder sau creează un subfolder."
                  primary={{ label: 'Adaugă în folder', onClick: () => fileInputRef.current?.click() }}
                />
              )
            ) : (
              <div className="glass-panel overflow-hidden rounded-[var(--r-md)]">
                <AnimatePresence initial={false}>
                  {typeFilteredSources.map((source, index) => renderSourceRow(source, index))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>


      <ReaderModal
        open={readerOpen}
        source={selectedSource}
        loading={readerLoading}
        content={readerContent}
        chapters={sourceChapters}
        onClose={() => setReaderOpen(false)}
        onAsk={askAIAboutSource}
        onOpenStudio={openAIStudioForSource}
        onGenerateFromChapter={generateFromChapter}
      />


      <ConfirmDialog
        open={folderToDelete !== null}
        title={`Ștergi folderul „${folderToDelete?.name}"?`}
        description="Documentele rămân în Neclasificate, dar subfolderele acestui folder vor fi șterse. Acțiunea nu poate fi anulată."
        confirmLabel="Șterge folderul"
        cancelLabel="Anulează"
        variant="danger"
        onConfirm={confirmDeleteFolder}
        onCancel={() => setFolderToDelete(null)}
      />
      <ConfirmDialog
        open={sourceToDelete !== null}
        title={`Ștergi „${sourceToDelete?.name.replace(/\.(pdf|docx|txt|md)$/i, '')}"?`}
        description="Documentul și indexul lui dispar din bibliotecă, iar AI-ul nu îl mai poate folosi ca sursă. Acțiunea nu poate fi anulată."
        confirmLabel="Șterge documentul"
        cancelLabel="Anulează"
        variant="danger"
        onConfirm={() => void confirmDeleteSource()}
        onCancel={() => setSourceToDelete(null)}
      />
    </div>
  );
}
