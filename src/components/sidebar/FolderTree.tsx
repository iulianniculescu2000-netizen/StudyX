import { useState } from 'react';
import type { DragEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { useFolderStore } from '../../store/folderStore';
import { useQuizStore } from '../../store/quizStore';
import { useNewFolderDialog } from '../../store/newFolderDialogStore';
import { QUIZ_COLOR_HEX } from '../../theme/colorMaps';
import ConfirmDialog from '../ConfirmDialog';
import { FOLDER_COLORS } from './constants';

type FolderItem = ReturnType<typeof useFolderStore.getState>['folders'][number];

interface FolderTreeProps {
  visibleFolders: Array<{ folder: FolderItem; depth: number }>;
  folderQuizCount: Map<string, number>;
  uncategorizedCount: number;
  dropTargetId: string | null;
  handleFolderDragOver: (event: DragEvent<HTMLElement>, targetFolderId: string | null) => void;
  handleFolderDragLeave: (event: DragEvent<HTMLElement>) => void;
  handleFolderDrop: (event: DragEvent<HTMLElement>, targetFolderId: string | null) => void;
}

/** "Foldere" section: Neclasificate + nested folders, inline rename, delete confirmation, quiz drop targets. */
export default function FolderTree({
  visibleFolders, folderQuizCount, uncategorizedCount, dropTargetId,
  handleFolderDragOver, handleFolderDragLeave, handleFolderDrop,
}: FolderTreeProps) {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const folders = useFolderStore((s) => s.folders);
  const updateFolder = useFolderStore((s) => s.updateFolder);
  const deleteFolder = useFolderStore((s) => s.deleteFolder);
  const quizzes = useQuizStore((s) => s.quizzes);
  const bulkDeleteQuizzes = useQuizStore((s) => s.bulkDeleteQuizzes);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const handleRenameFolder = (id: string) => {
    if (!editName.trim()) return;
    updateFolder(id, { name: editName.trim() });
    setEditingFolder(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const toDelete = new Set([deleteTarget.id]);
    let changed = true;
    while (changed) {
      changed = false;
      folders.forEach((folder) => {
        if (folder.parentId && toDelete.has(folder.parentId) && !toDelete.has(folder.id)) {
          toDelete.add(folder.id);
          changed = true;
        }
      });
    }
    const quizIdsToDelete = quizzes
      .filter(q => q.folderId && toDelete.has(q.folderId))
      .map(q => q.id);
    if (quizIdsToDelete.length > 0) {
      bulkDeleteQuizzes(quizIdsToDelete);
    }
    deleteFolder(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <>
            {/* Folders section */}
            <div data-tutorial="sidebar-folders" className="pt-4 pb-1">
              <div className="flex items-center justify-between px-1 mb-1.5">
                <span className="secondary-label">
                  Foldere
                </span>
                <button
                  onClick={() => {
                    useNewFolderDialog.getState().show(null);
                  }}
                  aria-label="Creează folder"
                  className="p-1 rounded-lg transition-colors press-feedback"
                  style={{ color: theme.text3 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = theme.accent)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = theme.text3)}
                >
                  <Plus size={13} />
                </button>
              </div>


              <div className="space-y-0.5">
                {(() => {
                  const count = uncategorizedCount;
                  const isDropTarget = dropTargetId === '__uncategorized__';
                  return count > 0 ? (
                    <NavLink to="/folder/null" style={{ textDecoration: 'none', display: 'block' }}>
                      {({ isActive }) => (
                        <motion.div
                          data-testid="folder-drop-target"
                          data-folder-id="__uncategorized__"
                          onDragOver={(event) => handleFolderDragOver(event, null)}
                          onDragEnter={(event) => handleFolderDragOver(event, null)}
                          onDragLeave={handleFolderDragLeave}
                          onDrop={(event) => handleFolderDrop(event, null)}
                          className="relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors press-feedback"
                          style={{
                            background: isDropTarget ? `${theme.accent}24` : isActive ? `${theme.accent}16` : 'transparent',
                            color: isActive ? theme.accentText : theme.text2,
                            boxShadow: isDropTarget ? `inset 0 0 0 1px ${theme.accent}55` : isActive ? `0 3px 14px ${theme.accent}22` : 'none',
                          }}
                          onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = `${theme.accent}09`; }}
                          onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          {isActive && (
                            <motion.div layoutId="nav-active-bar"
                              className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
                              style={{ width: 3, height: 16, background: theme.accent }}
                              transition={{ duration: 0.25 }} />
                          )}
                          <span>{"\u{1F4CB}"}</span>
                          <span className="flex-1 truncate">Neclasificate</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full"
                            style={{ background: theme.surface2, color: theme.text3 }}>{count}</span>
                        </motion.div>
                      )}
                    </NavLink>
                  ) : null;
                })()}

                {visibleFolders.map(({ folder, depth }) => {
                  const count = folderQuizCount.get(folder.id) ?? 0;
                  const colorHex = FOLDER_COLORS.find(c => c.id === folder.color)?.bg ?? QUIZ_COLOR_HEX.blue;
                  const childCount = folders.filter((candidate) => candidate.parentId === folder.id).length;
                  const isDropTarget = dropTargetId === folder.id;

                  if (editingFolder === folder.id) {
                    return (
                      <div key={folder.id} className="flex items-center gap-1 py-1" style={{ paddingLeft: 8 + depth * 14 }}>
                        <span>{folder.emoji}</span>
                        <input autoFocus type="text" value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRenameFolder(folder.id); if (e.key === 'Escape') setEditingFolder(null); }}
                          className="flex-1 bg-transparent text-sm rounded px-1"
                          style={{ color: theme.text, outline: `1px solid ${theme.accent}`, border: 'none' }} />
                        <button
                          onClick={() => handleRenameFolder(folder.id)}
                          aria-label="Salvează numele folderului"
                          className="p-1"
                          style={{ color: theme.success }}
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => setEditingFolder(null)}
                          aria-label="Anulează redenumirea folderului"
                          className="p-1"
                          style={{ color: theme.text3 }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  }

                  return (
                    <NavLink key={folder.id} to={`/folder/${folder.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                      {({ isActive }) => (
                        <div className="group relative">
                          <motion.div
                            data-testid="folder-drop-target"
                            data-folder-id={folder.id}
                            onDragOver={(event) => handleFolderDragOver(event, folder.id)}
                            onDragEnter={(event) => handleFolderDragOver(event, folder.id)}
                            onDragLeave={handleFolderDragLeave}
                            onDrop={(event) => handleFolderDrop(event, folder.id)}
                            initial={calmMotion ? false : { opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={t.panel}
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors press-feedback"
                            style={{
                              background: isDropTarget ? `${colorHex}24` : isActive ? `${theme.accent}16` : 'transparent',
                              color: isActive ? theme.accentText : theme.text2,
                              paddingRight: 36,
                              paddingLeft: 12 + depth * 14,
                              boxShadow: isDropTarget ? `inset 0 0 0 1px ${colorHex}66` : isActive ? `0 3px 14px ${colorHex}22` : 'none',
                            }}
                            onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = `${theme.accent}09`; }}
                            onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                          >
                            {isActive && (
                              <motion.div layoutId="nav-active-bar"
                                className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
                                style={{ width: 3, height: 16, background: theme.accent }}
                                transition={{ duration: 0.25 }} />
                            )}
                            <span className="text-base leading-none flex-shrink-0">{folder.emoji}</span>
                            {depth > 0 && (
                              <span className="text-[10px] opacity-40" style={{ color: theme.text3 }}>└</span>
                            )}
                            <span className="flex-1 truncate">{folder.name}</span>
                            {childCount > 0 && !count && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                                style={{ background: theme.surface2, color: theme.text3 }}>
                                {childCount}
                              </span>
                            )}
                            {count > 0 && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full"
                                style={{ background: `${colorHex}22`, color: colorHex }}>
                                {count}
                              </span>
                            )}
                          </motion.div>
                          {/* Edit/delete: on hover or keyboard focus, always on touch screens */}
                          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-lg px-1 py-0.5 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
                            style={{ background: theme.surface, boxShadow: 'var(--elev-1)' }}>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                useNewFolderDialog.getState().show(folder.id);
                              }}
                              aria-label={`Creează subfolder în ${folder.name}`}
                              className="rounded p-[7px] hover:opacity-80" style={{ color: theme.accentText }}>
                              <Plus size={11} />
                            </button>
                            <button
                              onClick={(e) => { e.preventDefault(); setEditingFolder(folder.id); setEditName(folder.name); }}
                              aria-label={`Redenumește folderul ${folder.name}`}
                              className="rounded p-[7px] hover:opacity-80" style={{ color: theme.text3 }}>
                              <Pencil size={11} />
                            </button>
                            <button
                              onClick={(e) => { e.preventDefault(); setDeleteTarget({ id: folder.id, name: folder.name }); }}
                              aria-label={`Șterge folderul ${folder.name}`}
                              className="rounded p-[7px] hover:opacity-80" style={{ color: theme.danger }}>
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Ștergi folderul "${deleteTarget?.name}"?`}
        description="Grilele din el vor fi șterse definitiv împreună cu folderul. Această acțiune nu poate fi anulată."
        confirmLabel="Șterge folderul" cancelLabel="Anulează" variant="danger"
        onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
