import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link, Navigate } from 'react-router-dom';
import { rezidentiatHrefForFolder } from '../lib/rezidentiatRoutes';
import { startQuizMix } from '../lib/quizMixSession';
import { isFolderSessionQuiz } from '../lib/rezidentiatOverview';
import { QUIZ_COLOR_HEX } from '../theme/colorMaps';
import { Check, CalendarDays, FolderPlus, Inbox, Pencil, Plus, Search, Shuffle, Trash2, X } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import QuizCard from '../components/QuizCard';
import ImportQuizButton from '../components/ImportQuizButton';
import ExamSplitModal from '../components/ExamSplitModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { isFlashcardDeck } from '../lib/deckKind';
import { isRezidentiatRootFolder } from '../lib/rezidentiatRoot';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import PageSkeleton from '../components/ui/PageSkeleton';
import { useStoresHydrated } from '../hooks/useStoresHydrated';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { matchesQuery } from '../lib/searchText';
import type { Quiz, QuizColor } from '../types';

const COLOR_HEX = QUIZ_COLOR_HEX;
const FOLDER_COLORS = Object.keys(COLOR_HEX) as QuizColor[];

export default function FolderView() {
  const { id } = useParams<{ id: string }>();
  // ?plain=1: the Rezidențiat page sent us here because this folder has nothing to show there.
  const [folderSearchParams, setFolderSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const hydrated = useStoresHydrated('quiz');
  const { t, calmMotion } = useAdaptiveMotion();
  const folders = useFolderStore((s) => s.folders);
  const addFolder = useFolderStore((s) => s.addFolder);
  const updateFolder = useFolderStore((s) => s.updateFolder);
  const deleteFolder = useFolderStore((s) => s.deleteFolder);
  const getQuizzesByFolder = useQuizStore((s) => s.getQuizzesByFolder);
  const allQuizzes = useQuizStore((s) => s.quizzes);
  const bulkDeleteQuizzes = useQuizStore((s) => s.bulkDeleteQuizzes);
  const [creatingSubfolder, setCreatingSubfolder] = useState(false);
  const [subfolderName, setSubfolderName] = useState('');
  const [subfolderEmoji, setSubfolderEmoji] = useState('📁');
  const [subfolderColor, setSubfolderColor] = useState<QuizColor>('blue');
  const [showExamSplit, setShowExamSplit] = useState(false);
  const [confirmPlayAll, setConfirmPlayAll] = useState(false);
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [editChildName, setEditChildName] = useState('');
  const [editChildEmoji, setEditChildEmoji] = useState('📁');
  const [editChildColor, setEditChildColor] = useState<QuizColor>('blue');
  const [deleteChildTarget, setDeleteChildTarget] = useState<{ id: string; name: string } | null>(null);

  // Folders in the Rezidențiat tree are browsed on the Rezidențiat pages, not here.
  const rezidentiatHref = id && !folderSearchParams.get('plain') ? rezidentiatHrefForFolder(id, folders) : null;

  const isNull = id === 'null';
  const folder = isNull ? null : folders.find(f => f.id === id);
  const folderQuizzes = getQuizzesByFolder(isNull ? null : id ?? null);
  const realQuizzes = folderQuizzes.filter((q) => !isFlashcardDeck(q));
  // Căutarea în folder trăiește în URL (?q=), alături de ?plain=1 pe care îl păstrăm.
  const folderQuery = folderSearchParams.get('q') ?? '';
  const visibleQuizzes = folderQuery
    ? folderQuizzes.filter((q) => matchesQuery(`${q.title} ${q.description} ${q.category}`, folderQuery))
    : folderQuizzes;
  const setFolderQuery = (value: string) => setFolderSearchParams((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set('q', value); else next.delete('q');
    return next;
  }, { replace: true });
  const childFolders = isNull ? [] : folders.filter((candidate) => candidate.parentId === id);

  const title = isNull ? 'Neclasificate' : folder ? `${folder.emoji} ${folder.name}` : 'Folder';
  const accentColor = folder ? (COLOR_HEX[folder.color] ?? theme.accent) : theme.text3;

  // A folder holding only subfolders (e.g. a discipline like "Chirurgie")
  // otherwise always read "0 grile" even when it has hundreds nested a level
  // down — recurse so the count reflects what's actually inside the tree.
  const countRecursive = (folderId: string): number => {
    const own = getQuizzesByFolder(folderId).length;
    const children = folders.filter((f) => f.parentId === folderId);
    return own + children.reduce((sum, child) => sum + countRecursive(child.id), 0);
  };
  const totalQuizCount = useMemo(
    () => (folder ? countRecursive(folder.id) : folderQuizzes.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folder, folders, folderQuizzes.length],
  );
  // Every real (non-flashcard) quiz under this folder, including subfolders —
  // what "Joacă tot folderul" combines into one session.
  const collectQuizzesRecursive = (folderId: string): Quiz[] => {
    // A previous "play everything" session lives in the folder too; folding it back in multiplied the questions on every run.
    const own = getQuizzesByFolder(folderId).filter((q) => !isFlashcardDeck(q) && !q.archived && !isFolderSessionQuiz(q));
    const children = folders.filter((f) => f.parentId === folderId);
    return children.reduce((acc, child) => acc.concat(collectQuizzesRecursive(child.id)), own);
  };
  const playableSets = useMemo(
    () => (folder ? collectQuizzesRecursive(folder.id) : realQuizzes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folder, folders, allQuizzes],
  );
  const playableQuestionCount = useMemo(
    () => playableSets.reduce((sum, q) => sum + q.questions.length, 0),
    [playableSets],
  );

  const handlePlayFolder = () => {
    if (!folder || playableSets.length === 0) return;
    const mixId = startQuizMix(folder, playableSets);
    setConfirmPlayAll(false);
    if (mixId) navigate(`/play/${mixId}`);
  };

  const parentFolder = folder?.parentId ? folders.find((f) => f.id === folder.parentId) : null;
  // The root "Rezidențiat" folder is deliberately absent from "Toate grilele"
  // (kept separate from the year's coursework) — sending its own "back" there
  // would point at a list that never shows it. Its true home is its own page.
  const isRezidentiatRoot = !!folder && isRezidentiatRootFolder(folder);
  const backHref = folder
    ? (folder.parentId ? `/folder/${folder.parentId}` : isRezidentiatRoot ? '/rezidentiat' : '/quizzes')
    : null;
  const backLabel = folder ? (parentFolder ? parentFolder.name : isRezidentiatRoot ? 'Rezidențiat' : 'Toate grilele') : null;

  const openSubfolderForm = () => {
    if (!folder) return;
    setSubfolderColor(folder.color);
    setSubfolderEmoji('📁');
    setCreatingSubfolder(true);
  };

  const closeSubfolderForm = () => {
    setCreatingSubfolder(false);
    setSubfolderName('');
    setSubfolderEmoji('📁');
    setSubfolderColor(folder?.color ?? 'blue');
  };

  const handleCreateSubfolder = () => {
    const name = subfolderName.trim();
    if (!folder || !name) return;
    addFolder(name, subfolderEmoji.trim() || '📁', subfolderColor, folder.id);
    closeSubfolderForm();
  };

  const openEditChild = (child: { id: string; name: string; emoji: string; color: QuizColor }) => {
    setEditingChildId(child.id);
    setEditChildName(child.name);
    setEditChildEmoji(child.emoji);
    setEditChildColor(child.color);
  };

  const closeEditChild = () => setEditingChildId(null);

  const saveEditChild = () => {
    const name = editChildName.trim();
    if (!editingChildId || !name) return;
    updateFolder(editingChildId, { name, emoji: editChildEmoji.trim() || '📁', color: editChildColor });
    setEditingChildId(null);
  };

  // Deleting a subfolder takes its own nested subfolders (and every quiz inside
  // that whole subtree) with it — same recursive rule as Sidebar's folder delete,
  // so nothing gets silently orphaned under a folder that no longer exists.
  const confirmDeleteChild = () => {
    if (!deleteChildTarget) return;
    const toDelete = new Set([deleteChildTarget.id]);
    let changed = true;
    while (changed) {
      changed = false;
      folders.forEach((candidate) => {
        if (candidate.parentId && toDelete.has(candidate.parentId) && !toDelete.has(candidate.id)) {
          toDelete.add(candidate.id);
          changed = true;
        }
      });
    }
    const quizIdsToDelete = allQuizzes.filter((q) => q.folderId && toDelete.has(q.folderId)).map((q) => q.id);
    if (quizIdsToDelete.length > 0) bulkDeleteQuizzes(quizIdsToDelete);
    deleteFolder(deleteChildTarget.id);
    setDeleteChildTarget(null);
  };

  if (rezidentiatHref) return <Navigate to={rezidentiatHref} replace />;
  if (!hydrated) return <PageSkeleton blocks={3} />;
  const countLabel = `${totalQuizCount} ${totalQuizCount === 1 ? 'set' : 'seturi'}${childFolders.length > 0 && totalQuizCount !== folderQuizzes.length ? ' în total' : ''}${childFolders.length > 0 ? ` · ${childFolders.length} ${childFolders.length === 1 ? 'subfolder' : 'subfoldere'}` : ''}`;

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="max-w-4xl mx-auto">
        <PageHeader
          eyebrow={isNull ? 'Neclasificate' : 'Folder'}
          title={title}
          subtitle={countLabel}
          back={backHref && backLabel ? { to: backHref, label: backLabel } : undefined}
          actions={(
            <>
              {folder && (
                <button
                  type="button"
                  onClick={openSubfolderForm}
                  className="glass-panel press-feedback fx-lift focus-ring flex items-center gap-2 px-4 py-2.5 rounded-[var(--r-md)] text-sm font-medium"
                  style={{ color: theme.text }}
                >
                  <FolderPlus size={15} />Subfolder nou
                </button>
              )}
              <ImportQuizButton targetFolderId={id === 'null' ? null : id} />
              {realQuizzes.reduce((n, q) => n + q.questions.length, 0) >= 2 && (
                <button
                  type="button"
                  data-tutorial="btn-exam-split"
                  onClick={() => setShowExamSplit(true)}
                  className="glass-panel press-feedback fx-lift focus-ring flex items-center gap-2 px-4 py-2.5 rounded-[var(--r-md)] text-sm font-medium"
                  style={{ color: theme.text2 }}
                >
                  <CalendarDays size={15} />Distribuie pe zile
                </button>
              )}
              {playableSets.length > 1 && (
                <button
                  type="button"
                  onClick={() => setConfirmPlayAll(true)}
                  className="press-feedback focus-ring flex items-center gap-2 px-4 py-2.5 rounded-[var(--r-md)] text-sm font-semibold text-white"
                  style={{ background: theme.success }}
                >
                  <Shuffle size={15} />Joacă tot folderul
                </button>
              )}
              <Link to={`/create?folder=${id}`}
                className="press-feedback focus-ring flex items-center gap-2 px-4 py-2.5 rounded-[var(--r-md)] text-sm font-medium text-white"
                style={{ background: `linear-gradient(135deg, ${accentColor}, ${theme.accent2})` }}>
                <Plus size={15} />Grilă nouă
              </Link>
            </>
          )}
        />

        {folder && creatingSubfolder && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={t.page}
            className="glass-panel mb-6 rounded-[var(--r-md)] p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={subfolderEmoji}
                onChange={(event) => setSubfolderEmoji(event.target.value.slice(0, 4))}
                className="focus-ring elev-1 h-11 w-full rounded-xl px-3 text-center text-xl sm:w-16"
                style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
                aria-label="Emoji subfolder"
              />
              <input
                value={subfolderName}
                onChange={(event) => setSubfolderName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCreateSubfolder();
                  if (event.key === 'Escape') closeSubfolderForm();
                }}
                autoFocus
                placeholder="Nume subfolder"
                className="focus-ring elev-1 h-11 min-w-0 flex-1 rounded-xl px-4 text-sm font-semibold outline-none"
                style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
              />
              <div className="flex items-center gap-2">
                {FOLDER_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSubfolderColor(color)}
                    className="press-feedback focus-ring h-8 w-8 rounded-full transition-transform"
                    style={{
                      background: COLOR_HEX[color],
                      boxShadow: subfolderColor === color ? 'var(--ring-focus)' : 'none',
                      border: subfolderColor === color ? `2px solid ${theme.text}` : '2px solid transparent',
                    }}
                    aria-label={`Culoare ${color}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreateSubfolder}
                  disabled={!subfolderName.trim()}
                  className="press-feedback focus-ring inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white disabled:opacity-50 sm:flex-none"
                  style={{ background: accentColor }}
                >
                  <Check size={15} />Creează
                </button>
                <button
                  type="button"
                  onClick={closeSubfolderForm}
                  className="fine-chip press-feedback inline-flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ color: theme.text3 }}
                  aria-label="Închide formularul"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {childFolders.length > 0 && (
          <div className={`${calmMotion ? '' : 'fx-rise '}mb-8`}>
            <h2 className="text-sm font-black uppercase tracking-wider mb-3" style={{ color: theme.text3 }}>
              Subfoldere
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {childFolders.map((child) => {
                const count = countRecursive(child.id);
                const hasSubfolders = folders.some((f) => f.parentId === child.id);
                const childColor = COLOR_HEX[child.color] ?? theme.accent;

                if (editingChildId === child.id) {
                  return (
                    <div key={child.id} className="glass-panel rounded-[var(--r-md)] p-4" style={{ boxShadow: `0 0 0 1.5px ${childColor}55` }}>
                      <div className="flex items-center gap-2">
                        <input
                          value={editChildEmoji}
                          onChange={(event) => setEditChildEmoji(event.target.value.slice(0, 4))}
                          className="focus-ring elev-1 h-10 w-12 flex-shrink-0 rounded-xl text-center text-lg"
                          style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
                          aria-label="Emoji subfolder"
                        />
                        <input
                          value={editChildName}
                          onChange={(event) => setEditChildName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') saveEditChild();
                            if (event.key === 'Escape') closeEditChild();
                          }}
                          autoFocus
                          className="focus-ring elev-1 h-10 min-w-0 flex-1 rounded-xl px-3 text-sm font-bold outline-none"
                          style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
                          aria-label="Nume subfolder"
                        />
                      </div>
                      <div className="mt-2.5 flex items-center gap-1.5">
                        {FOLDER_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setEditChildColor(color)}
                            className="press-feedback focus-ring h-6 w-6 rounded-full transition-transform"
                            style={{
                              background: COLOR_HEX[color],
                              boxShadow: editChildColor === color ? 'var(--ring-focus)' : 'none',
                              border: editChildColor === color ? `2px solid ${theme.text}` : '2px solid transparent',
                            }}
                            aria-label={`Culoare ${color}`}
                          />
                        ))}
                        <div className="ml-auto flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={saveEditChild}
                            disabled={!editChildName.trim()}
                            className="press-feedback focus-ring flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-40"
                            style={{ background: theme.success, color: '#fff' }}
                            aria-label="Salvează"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={closeEditChild}
                            className="fine-chip press-feedback flex h-8 w-8 items-center justify-center rounded-lg"
                            style={{ color: theme.text3 }}
                            aria-label="Anulează"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={child.id} className="group relative">
                    <Link
                      to={`/folder/${child.id}`}
                      className="glass-panel fx-lift press-feedback focus-ring block rounded-[var(--r-md)] p-4"
                      style={{ color: theme.text }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xl"
                          style={{ background: `${childColor}18` }}
                        >
                          {child.emoji}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate pr-14 font-black">{child.name}</div>
                          <span
                            className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ background: theme.surface2, color: theme.text3 }}
                          >
                            {count} {count === 1 ? 'set' : 'seturi'}{hasSubfolders ? ' în total' : ''}
                          </span>
                        </div>
                        <div className="h-8 w-1 flex-shrink-0 rounded-full" style={{ background: childColor }} />
                      </div>
                    </Link>
                    {/* Edit/delete — hidden until hover, same pattern as Sidebar's folder rows. */}
                    <div
                      className="absolute right-3 top-3 hidden items-center gap-1 rounded-lg px-1 py-1 group-hover:flex"
                      style={{ background: 'color-mix(in srgb, var(--bg) 92%, transparent)', boxShadow: 'var(--elev-1)' }}
                    >
                      <button
                        type="button"
                        onClick={(event) => { event.preventDefault(); openEditChild(child); }}
                        aria-label={`Redenumește sau schimbă iconița pentru ${child.name}`}
                        className="rounded p-1 hover:opacity-80"
                        style={{ color: theme.text3 }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => { event.preventDefault(); setDeleteChildTarget({ id: child.id, name: child.name }); }}
                        aria-label={`Șterge subfolderul ${child.name}`}
                        className="rounded p-1 hover:opacity-80"
                        style={{ color: theme.danger }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {folderQuizzes.length === 0 && childFolders.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Folderul este gol"
            body="Adaugă grile sau importă un fișier JSON."
            primary={{ label: 'Creează grilă', to: `/create?folder=${id}` }}
            secondary={folder ? { label: 'Subfolder nou', onClick: openSubfolderForm } : undefined}
          />
        ) : (
          <>
            {childFolders.length > 0 && folderQuizzes.length > 0 && (
              <h2 className="text-sm font-black uppercase tracking-wider mb-3" style={{ color: theme.text3 }}>
                Seturi
              </h2>
            )}
            {folderQuizzes.length > 6 && (
              <div className="mb-4 flex items-center gap-3 rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--fill-subtle)] px-4 py-2.5 focus-within:border-[var(--accent)] focus-within:shadow-[var(--ring-focus)]">
                <Search size={16} className="opacity-40" style={{ color: theme.text }} aria-hidden="true" />
                <input
                  type="text"
                  value={folderQuery}
                  onChange={(event) => setFolderQuery(event.target.value)}
                  placeholder="Caută în folder..."
                  aria-label="Caută în folder"
                  className="flex-1 border-none bg-transparent text-sm font-semibold outline-none"
                  style={{ color: theme.text }}
                />
              </div>
            )}
            {visibleQuizzes.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Nicio grilă găsită"
                body={`Nu am găsit nimic pentru „${folderQuery}”.`}
                primary={{ label: 'Șterge căutarea', onClick: () => setFolderQuery('') }}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleQuizzes.map((quiz, i) => (
                  <QuizCard key={quiz.id} quiz={quiz} index={i} showDelete />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showExamSplit && (
        <ExamSplitModal
          folderName={folder?.name ?? 'Neclasificate'}
          folderId={isNull ? null : (id ?? null)}
          color={folder?.color ?? 'blue'}
          category={folder?.name ?? 'Altele'}
          quizzes={realQuizzes}
          onClose={() => setShowExamSplit(false)}
        />
      )}

      <ConfirmDialog
        open={confirmPlayAll}
        variant="default"
        title={`Joci tot folderul „${folder?.name ?? ''}"?`}
        description={`Se combină ${playableSets.length} seturi într-o singură sesiune amestecată, cu ${playableQuestionCount} întrebări în total.`}
        confirmLabel="Începe sesiunea"
        onConfirm={handlePlayFolder}
        onCancel={() => setConfirmPlayAll(false)}
      />

      <ConfirmDialog
        open={!!deleteChildTarget}
        title={`Ștergi subfolderul „${deleteChildTarget?.name ?? ''}"?`}
        description="Se șterg și toate subfolderele și grilele dinăuntru. Acțiunea nu poate fi anulată."
        confirmLabel="Șterge"
        onConfirm={confirmDeleteChild}
        onCancel={() => setDeleteChildTarget(null)}
      />
    </div>
  );
}
