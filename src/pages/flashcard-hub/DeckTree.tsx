import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { CreditCard, FolderPlus, Inbox, Layers, Search, X } from 'lucide-react';
import type { Folder, Quiz } from '../../types';
import type { Theme } from '../../theme/themes';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { useFolderStore } from '../../store/folderStore';
import { useNewFolderDialog } from '../../store/newFolderDialogStore';
import { useRezidentiatFolderDialog } from '../../store/rezidentiatFolderDialogStore';
import { useQuizStore } from '../../store/quizStore';
import { useToastStore } from '../../store/toastStore';
import { useUserStore } from '../../store/userStore';
import EmptyState from '../../components/ui/EmptyState';
import SegmentedTabs from '../../components/fx/SegmentedTabs';
import { matchesQuery } from '../../lib/searchText';
import { UNCATEGORIZED_ID, UNCATEGORIZED_LABEL, buildGroupTree, buildResidencyContext, classifyResidencyDeck, filterByDeckFilter, groupByDiscipline, isGroupOpenByDefault, planMove, readHubPrefs, writeHubPrefs, type DeckFilter, type GroupNode, type HubListPrefs, userFlashcardSpaceIds } from '../../lib/flashcardGroups';
import { CHAPTER_GROUPING_MIN, chapterOfSummary, collapseFolderChains, flashcardPickerFolders, groupBySpecialty, orderChapterFirst, splitChapterDecks, summarizeDue, type CollapsedNode } from '../../lib/flashcardTreeView';
import { type FlashcardDeckSummary } from './sections';
import { dueSessionPath } from '../../lib/flashcardDueQueue';
import { DueSummaryStrip, SpecialtyHeader } from './chapterParts';
import { DeckRow } from './DeckRow';
import { GroupHeader } from './GroupHeader';
import { DeckTreeOverlays } from './DeckTreeOverlays';
import { useDeckDeletion, useFolderDeletion } from './useTreeDeletion';
import HelpTip from '../../components/ui/HelpTip';
import { BOOK_FALLBACK, QUIZ_DRAG_MIME, ROW_HEIGHT, VIRTUALIZE_FROM, chapterTag, isQuizDrag, restanteLabel } from './deckTreeShared';

/* ═══════════════════════════ Lista ═══════════════════════════ */

export interface FlashcardDeckTreeProps {
  /** Toate pachetele (căutarea și filtrul se aplică aici). */
  decks: FlashcardDeckSummary[];
  folders: Folder[];
  theme: Theme;
  query: string;
  onQueryChange: (value: string) => void;
  /** Pagina Rezidențiat: starea goală explică butonul „+” în loc să trimită spre Biblioteca AI. */
  residency?: boolean;
}

export function FlashcardDeckTree(props: FlashcardDeckTreeProps) {
  const profileId = useUserStore((state) => state.activeProfileId);
  // Preferințele (filtru, grupuri deschise) sunt pe profil: la schimbarea profilului se reiau de la zero.
  return <DeckTreeBody key={profileId ?? 'none'} profileId={profileId} {...props} />;
}

function DeckTreeBody({ profileId, decks, folders, theme, query, onQueryChange, residency: residencyPage = false }: FlashcardDeckTreeProps & { profileId: string | null }) {
  const { calmMotion, t } = useAdaptiveMotion();
  const moveToFolder = useQuizStore((state) => state.moveToFolder);
  const updateFolder = useFolderStore((state) => state.updateFolder);
  const addToast = useToastStore((state) => state.addToast);
  const baseId = useId();

  const [prefs, setPrefsState] = useState<HubListPrefs>(() => readHubPrefs(profileId));
  const setPrefs = useCallback((update: (previous: HubListPrefs) => HubListPrefs) => {
    setPrefsState((previous) => {
      const next = update(previous);
      writeHubPrefs(profileId, next);
      return next;
    });
  }, [profileId]);

  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const moveAnchor = useRef<HTMLElement | null>(null);
  const [editingDeck, setEditingDeck] = useState<Quiz | null>(null);
  const { deckToDelete, deckDeleteOpen, requestDeckDelete, closeDeckDelete, confirmDeckDelete } = useDeckDeletion();
  const { folderToDelete, folderDeleteOpen, folderImpact, requestFolderDelete, closeFolderDelete, confirmFolderDelete } = useFolderDeletion(folders);

  const searching = query.trim().length > 0;
  const residency = useMemo(() => buildResidencyContext(folders), [folders]);
  // Folderele făcute de utilizator în Rezidențiat › Flashcarduri se pot redenumi, șterge și împărți în subfoldere.
  const userSpace = useMemo(() => userFlashcardSpaceIds(folders), [folders]);
  const hasResidencyDecks = useMemo(() => decks.some((deck) => classifyResidencyDeck(deck.quiz, residency) !== null), [decks, residency]);
  // Fără pachete de Rezidențiat filtrul n-ar avea ce să arate: lista rămâne „Toate”.
  // Pe pagina Rezidențiat toate pachetele sunt de Rezidențiat: aici contează arborele real al folderelor, nu filtrul.
  const filter: DeckFilter = residencyPage ? 'toate' : hasResidencyDecks ? prefs.filter : 'toate';

  const matching = useMemo(
    () => (searching ? decks.filter((deck) => matchesQuery(`${deck.quiz.title} ${deck.quiz.category ?? ''}`, query)) : decks),
    [decks, query, searching],
  );
  const visible = useMemo(() => filterByDeckFilter(matching, filter, residency), [matching, filter, residency]);
  const tree = useMemo(
    () => (filter === 'rezidentiat' ? [] : collapseFolderChains(buildGroupTree(folders, visible, { showEmpty: !searching }))),
    [filter, folders, visible, searching],
  );
  const disciplines = useMemo(
    () => (filter === 'rezidentiat' ? groupByDiscipline(visible, folders, residency) : []),
    [filter, visible, folders, residency],
  );
  // „Mută în…” oferă doar folderele Flashcardurilor (nu pe cele de grile).
  const moveFolders = useMemo(
    () => flashcardPickerFolders(folders, decks.map((deck) => deck.quiz), residency.folderIds),
    [folders, decks, residency],
  );
  const virtualize = visible.length > VIRTUALIZE_FROM;
  const flat = folders.length === 0;

  const isOpen = (id: string, node: Pick<GroupNode, 'due' | 'deckCount'>) => searching || (prefs.open[id] ?? isGroupOpenByDefault(node));
  const toggle = (id: string, node: Pick<GroupNode, 'due' | 'deckCount'>) => {
    const next = !isOpen(id, node);
    setPrefs((previous) => ({ ...previous, open: { ...previous.open, [id]: next } }));
  };
  const setFilter = (value: DeckFilter) => setPrefs((previous) => ({ ...previous, filter: value }));

  /* ── Mutare ── */
  const moveDeck = useCallback((quizId: string, targetId: string | null) => {
    const quiz = useQuizStore.getState().quizzes.find((item) => item.id === quizId);
    if (!quiz) return;
    const currentFolders = useFolderStore.getState().folders;
    const plan = planMove(quiz, targetId, currentFolders);
    if (plan.kind === 'invalid') return;
    if (plan.kind === 'noop') {
      addToast(`„${quiz.title}” este deja în «${plan.targetName}».`, 'info', 2200);
      return;
    }
    moveToFolder(quiz.id, plan.targetId);
    // Folderul-țintă se deschide, ca pachetul mutat să se vadă acolo.
    if (plan.targetId) setPrefs((previous) => ({ ...previous, open: { ...previous.open, [plan.targetId as string]: true } }));
    const previousId = plan.previousId && currentFolders.some((folder) => folder.id === plan.previousId) ? plan.previousId : null;
    addToast(`Am mutat «${quiz.title}» în «${plan.targetName}».`, 'success', 4000, {
      label: 'Anulează',
      onClick: () => moveToFolder(quiz.id, previousId),
    });
  }, [addToast, moveToFolder, setPrefs]);

  const handleOpenMove = useCallback((quizId: string, anchor: HTMLElement | null) => {
    moveAnchor.current = anchor;
    setMovingId((current) => (current === quizId ? null : quizId));
  }, []);
  const closeMove = useCallback(() => setMovingId(null), []);
  const clearDropTarget = useCallback(() => setDropTargetId(null), []);

  const handleEdit = useCallback((quiz: Quiz) => setEditingDeck(quiz), []);
  const handleDelete = requestDeckDelete;

  const commitRename = (folderId: string, name: string) => {
    updateFolder(folderId, { name });
    setRenamingId(null);
  };

  const dropProps = (nodeId: string) => ({
    active: dropTargetId === nodeId,
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!isQuizDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTargetId(nodeId);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!isQuizDrag(event)) return;
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      setDropTargetId((current) => (current === nodeId ? null : current));
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!isQuizDrag(event)) return;
      event.preventDefault();
      setDropTargetId(null);
      const quizId = event.dataTransfer.getData(QUIZ_DRAG_MIME) || event.dataTransfer.getData('text/plain');
      if (quizId) moveDeck(quizId, nodeId === UNCATEGORIZED_ID ? null : nodeId);
    },
  });

  const rows = (list: FlashcardDeckSummary[], depth: number, inChapters = false) => list.map((deck) => (
    <DeckRow
      key={deck.quiz.id}
      deck={deck}
      depth={depth}
      theme={theme}
      moving={movingId === deck.quiz.id}
      virtualize={virtualize}
      chapter={inChapters ? { tag: chapterTag(deck) } : undefined}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onOpenMove={handleOpenMove}
      onDragEnd={clearDropTarget}
    />
  ));

  /**
   * Pachetele unui folder: cele de capitol în ordinea capitolelor (1, 2, 3…); de la câteva în sus, grupate pe
   * specialitate în secțiuni pliabile, cu rezumatul „De repetat azi” deasupra. Restul pachetelor rămân după.
   */
  const deckBody = (scopeId: string, list: FlashcardDeckSummary[], depth: number): React.ReactNode => {
    const { chapters, rest } = splitChapterDecks(list);
    if (chapters.length < CHAPTER_GROUPING_MIN) return rows(orderChapterFirst(list), depth, chapters.length > 0);
    const groups = groupBySpecialty(chapters, chapterOfSummary);
    const labelled = groups.some((group) => group.label !== null);
    const summary = summarizeDue(chapters);
    const startHref = summary.start ? dueSessionPath(chapters.filter((deck) => deck.due > 0).map((deck) => deck.quiz.id)) : null;
    return (
      <>
        <DueSummaryStrip
          summary={summary}
          startHref={startHref}
          theme={theme}
          paddingLeft={14 + depth * 16}
        />
        {labelled ? groups.map((group, index) => {
          const key = `${scopeId}::${group.id}`;
          const due = group.items.reduce((sum, deck) => sum + deck.due, 0);
          const open = searching || (prefs.open[key] ?? (due > 0 || index === 0));
          const bodyId = `${baseId}-${key}`;
          const groupDue = group.items.filter((deck) => deck.due > 0);
          return (
            <div key={key} data-testid="specialty-group" data-specialty={group.id}>
              <SpecialtyHeader
                label={group.label ?? BOOK_FALLBACK}
                range={group.range}
                count={group.items.length}
                cards={group.items.reduce((sum, deck) => sum + deck.total, 0)}
                due={due}
                open={open}
                bodyId={bodyId}
                paddingLeft={4 + depth * 16}
                repeatHref={groupDue.length > 0 ? dueSessionPath(groupDue.map((deck) => deck.quiz.id)) : null}
                repeatLabel={groupDue.length > 0 ? `Repetă ${group.label ?? ''}: ${restanteLabel(due)} în ${groupDue.length === 1 ? '1 capitol' : `${groupDue.length} capitole`}` : ''}
                onToggle={() => setPrefs((previous) => ({ ...previous, open: { ...previous.open, [key]: !open } }))}
                theme={theme}
                calm={calmMotion}
              />
              {body(bodyId, open, rows(group.items, depth + 1, true))}
            </div>
          );
        }) : rows(chapters, depth, true)}
        {rows(rest, depth)}
      </>
    );
  };

  const body = (id: string, open: boolean, content: React.ReactNode) => (calmMotion ? (
    // Mișcare redusă / lite: fără animație de înălțime, conținutul apare și dispare pe loc.
    open ? <div id={id}>{content}</div> : null
  ) : (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="body"
          id={id}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={t.modal}
          style={{ overflow: 'hidden' }}
        >
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  ));

  const renderNode = (node: CollapsedNode<FlashcardDeckSummary>): React.ReactNode => {
    const folder = node.folder;
    const open = isOpen(node.id, node);
    const bodyId = `${baseId}-${node.id}`;
    const drop = dropProps(node.id);
    const manageable = !!folder && (!residency.folderIds.has(folder.id) || userSpace.has(folder.id));
    return (
      <div key={node.id} data-testid="deck-group" data-group-id={node.id}>
        <GroupHeader
          name={folder?.name ?? UNCATEGORIZED_LABEL}
          ancestors={node.path.slice(0, -1).map((item) => item.name)}
          emoji={folder?.emoji}
          color={folder?.color}
          icon={folder ? undefined : <Inbox size={12} />}
          depth={node.depth}
          count={node.deckCount}
          due={node.due}
          open={open}
          bodyId={bodyId}
          theme={theme}
          calm={calmMotion}
          onToggle={() => toggle(node.id, node)}
          drop={drop}
          dropId={node.id}
          manage={manageable && folder ? {
            renaming: renamingId === folder.id,
            onSubfolder: () => (residencyPage
              ? useRezidentiatFolderDialog.getState().show(folder.id)
              : useNewFolderDialog.getState().show(folder.id, { stay: true, scope: 'flashcards' })),
            onRename: () => setRenamingId(folder.id),
            onDelete: () => requestFolderDelete(folder),
            onRenameCommit: (name) => commitRename(folder.id, name),
            onRenameCancel: () => setRenamingId(null),
          } : undefined}
        />
        {body(bodyId, open, (
          <>
            {deckBody(node.id, node.decks, node.depth + 1)}
            {node.deckCount === 0 && (
              <div
                className="flex items-center text-[12px]"
                style={{ height: ROW_HEIGHT, paddingLeft: 38 + node.depth * 16, color: theme.text3, borderTop: '1px solid var(--hairline)' }}
                onDragOver={drop.onDragOver}
                onDragLeave={drop.onDragLeave}
                onDrop={drop.onDrop}
                data-testid="empty-folder-hint"
              >
                Trage pachete aici
              </div>
            )}
            {node.children.map(renderNode)}
          </>
        ))}
      </div>
    );
  };

  /* ── Stări goale ── */
  if (decks.length === 0 && residencyPage) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Niciun pachet de Rezidențiat încă"
        body="Apasă „+” din dreapta sus: poți crea un folder, scrie un pachet, genera unul cu AI din cărțile tale sau importa din CSV și Anki."
        primary={{ label: 'Cărțile tale', to: '/rezidentiat' }}
      />
    );
  }
  if (decks.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Niciun pachet încă"
        body="Încarcă un curs PDF sau creează un pachet rapid mai jos. Poți genera carduri și din Biblioteca AI."
        primary={{ label: 'Biblioteca AI', to: '/vault' }}
        secondary={{ label: 'Rezidențiat', to: '/rezidentiat' }}
      />
    );
  }


  const empty = visible.length === 0;
  const cardClass = 'overflow-hidden rounded-[var(--r-md)]';
  const cardStyle = { background: theme.surface, border: '1px solid var(--hairline)' } as const;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <h2 className="text-[12px] font-medium uppercase tracking-wide" style={{ color: theme.text3 }}>PACHETELE TALE</h2>
        {filter !== 'rezidentiat' && (
          <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => (residencyPage
              ? useRezidentiatFolderDialog.getState().show()
              : useNewFolderDialog.getState().show(null, { stay: true, scope: 'flashcards' }))}
            className="fine-chip press-feedback flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium"
            style={{ color: theme.text2 }}
          >
            <FolderPlus size={13} aria-hidden="true" /> Folder nou
          </button>
          <HelpTip id="fc-new-folder" />
          </div>
        )}
      </div>

      <div className="relative mb-3">
        <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: theme.text3 }} />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Caută un pachet"
          aria-label="Caută un pachet"
          className="focus-ring elev-1 w-full rounded-full border py-2.5 pl-10 pr-10 text-[13px] outline-none"
          style={{ background: theme.surface, borderColor: 'var(--hairline)', color: theme.text }}
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="Șterge căutarea"
            className="press-feedback absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full"
            style={{ color: theme.text3 }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {hasResidencyDecks && !residencyPage && (
        <SegmentedTabs
          layoutId="flashcard-hub-filter"
          ariaLabel="Filtrează pachetele"
          className="mb-3"
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'toate', label: 'Toate' },
            { id: 'rezidentiat', label: 'Rezidențiat' },
            { id: 'altele', label: 'Altele' },
          ]}
        />
      )}

      {empty ? (
        <EmptyState
          icon={Layers}
          title={searching ? 'Niciun pachet găsit' : filter === 'rezidentiat' ? 'Niciun pachet de Rezidențiat' : 'Niciun pachet aici'}
          body={searching
            ? `Nu există pachete pentru „${query.trim()}”${filter === 'toate' ? '' : ' în această vizualizare'}.`
            : filter === 'altele' ? 'Toate pachetele tale sunt la Rezidențiat.' : undefined}
          primary={searching ? { label: 'Șterge căutarea', onClick: () => onQueryChange('') } : undefined}
        />
      ) : filter === 'rezidentiat' ? (
        <div className="flex flex-col gap-4">
          {disciplines.map((group) => {
            const id = `disc:${group.id}`;
            const node = { due: group.due, deckCount: group.decks.length };
            const open = isOpen(id, node);
            const bodyId = `${baseId}-${id}`;
            return (
              <div key={id} data-testid="deck-group" data-group-id={id} className={cardClass} style={cardStyle}>
                <div style={{ marginTop: -1 }}>
                  <GroupHeader
                    name={group.label}
                    emoji={group.folder?.emoji ?? '🩺'}
                    color={group.folder?.color ?? 'blue'}
                    depth={0}
                    count={group.decks.length}
                    due={group.due}
                    open={open}
                    bodyId={bodyId}
                    theme={theme}
                    calm={calmMotion}
                    onToggle={() => toggle(id, node)}
                    openHref={group.href}
                  />
                  {body(bodyId, open, deckBody(id, group.decks, 1))}
                </div>
              </div>
            );
          })}
        </div>
      ) : flat ? (
        <div className={cardClass} style={cardStyle}>
          <div style={{ marginTop: -1 }}>{deckBody('flat', visible, 0)}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {tree.map((node) => (
            <div key={node.id} className={cardClass} style={cardStyle}>
              <div style={{ marginTop: -1 }}>{renderNode(node)}</div>
            </div>
          ))}
        </div>
      )}
      <DeckTreeOverlays
        theme={theme}
        residencyPage={residencyPage}
        decks={decks}
        folders={folders}
        moveFolders={moveFolders}
        editingDeck={editingDeck}
        onCloseEdit={() => setEditingDeck(null)}
        deckToDelete={deckToDelete}
        deckDeleteOpen={deckDeleteOpen}
        onConfirmDeckDelete={confirmDeckDelete}
        onCloseDeckDelete={closeDeckDelete}
        folderToDelete={folderToDelete}
        folderDeleteOpen={folderDeleteOpen}
        folderImpact={folderImpact}
        onConfirmFolderDelete={confirmFolderDelete}
        onCloseFolderDelete={closeFolderDelete}
        movingId={movingId}
        moveAnchor={moveAnchor}
        onCloseMove={closeMove}
        onPickMove={(quizId, folderId) => { setMovingId(null); moveDeck(quizId, folderId); }}
      />
    </section>
  );
}
