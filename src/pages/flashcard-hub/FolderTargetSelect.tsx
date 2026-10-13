import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, FolderPlus } from 'lucide-react';
import type { Folder } from '../../types';
import type { Theme } from '../../theme/themes';
import { folderPath } from './folderPath';
import { hasSiblingFolderNamed } from '../../store/folderStore';
import { dur, ease } from '../../theme/motion';
import HelpTip from '../../components/ui/HelpTip';
import type { HelpTipId } from '../../tutorial/helpTips';
import { dropdownFitStyle, useDropdownFit } from '../../hooks/useDropdownFit';

export function FolderTargetSelect({
  folders,
  value,
  theme,
  label = 'Salvează în',
  help = 'fc-save-in',
  onChange,
  onCreateFolder,
}: {
  folders: Folder[];
  value: string;
  theme: Theme;
  label?: string;
  /** Indiciul „?” afișat lângă săgeată. */
  help?: HelpTipId;
  onChange: (folderId: string) => void;
  onCreateFolder: (name: string, parentId: string | null) => string;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [browseParentId, setBrowseParentId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fit = useDropdownFit(open, rootRef, { desired: 320 });
  const selectedFolder = folders.find((folder) => folder.id === value);
  const selectedLabel = selectedFolder ? `${selectedFolder.emoji} ${selectedFolder.name}` : 'Neclasificate';
  const browseFolder = browseParentId ? folders.find((folder) => folder.id === browseParentId) : undefined;
  const childFolders = folders
    .filter((folder) => (folder.parentId ?? null) === browseParentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const childCount = (folderId: string) => folders.filter((folder) => folder.parentId === folderId).length;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setBrowseParentId(null);
    setCreating(false);
    setOpen(true);
  };

  const newNameDuplicate = hasSiblingFolderNamed(folders, newName, browseParentId);

  const submitNewFolder = () => {
    const name = newName.trim();
    if (!name || newNameDuplicate) return;
    const id = onCreateFolder(name, browseParentId);
    onChange(id);
    setNewName('');
    setCreating(false);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className="flex w-full items-center gap-3 rounded-[var(--r-md)] border py-2.5 pl-3 pr-14 text-left transition-colors"
        style={{
          background: theme.surface2,
          borderColor: open ? `${theme.accent}55` : theme.border,
          color: theme.text,
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: theme.text2 }}>
            {label}
          </div>
          <div className="mt-0.5 truncate text-xs font-black">{selectedLabel}</div>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} style={{ color: theme.text3 }}>
          <ChevronDown size={15} />
        </motion.div>
      </button>
      <span className="absolute right-9 top-1/2 -translate-y-1/2">
        <HelpTip id={help} size={16} />
      </span>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: dur.fast, ease: ease.standard }}
            className="custom-scrollbar absolute left-0 right-0 z-40 rounded-[var(--r-lg)] border p-1.5 elev-3"
            style={{
              background: theme.modalBg,
              borderColor: theme.border,
              backdropFilter: 'blur(18px) saturate(160%)',
              ...dropdownFitStyle(fit, '0.45rem'),
            }}
          >
            {browseFolder && (
              <button
                type="button"
                onClick={() => setBrowseParentId(browseFolder.parentId ?? null)}
                className="mb-1 flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--hover-fill)]"
                style={{ color: theme.text3 }}
              >
                <ChevronDown size={13} className="rotate-90" />
                <span className="truncate text-[11px] font-black">{folderPath(folders, browseFolder)}</span>
              </button>
            )}

            <div>
              {(() => {
                const hereId = browseFolder ? browseFolder.id : '__uncategorized__';
                const hereLabel = browseFolder ? `${browseFolder.emoji} ${browseFolder.name}` : 'Neclasificate';
                const hereActive = hereId === value;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(hereId);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-[var(--r-md)] px-3 py-2 text-left transition-colors"
                    style={{
                      background: hereActive ? theme.accent : 'transparent',
                      color: hereActive ? '#fff' : theme.text,
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-black">{hereLabel}</div>
                      <div
                        className="mt-0.5 truncate text-[10px]"
                        style={{ color: hereActive ? 'inherit' : theme.text3, opacity: hereActive ? 0.8 : 1 }}
                      >
                        Salvează aici
                      </div>
                    </div>
                    {hereActive && <Check size={14} />}
                  </button>
                );
              })()}

              {childFolders.map((folder) => {
                const active = folder.id === value;
                const subCount = childCount(folder.id);
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setBrowseParentId(folder.id)}
                    className="flex w-full items-center gap-3 rounded-[var(--r-md)] px-3 py-2 text-left transition-colors hover:bg-[var(--hover-fill)]"
                    style={{
                      background: active ? `${theme.accent}1c` : 'transparent',
                      color: theme.text,
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-black">
                        {folder.emoji} {folder.name}
                      </div>
                      <div className="mt-0.5 truncate text-[10px]" style={{ color: theme.text3 }}>
                        {subCount > 0
                          ? `${subCount} ${subCount === 1 ? 'subfolder' : 'subfoldere'}`
                          : 'Deschide'}
                      </div>
                    </div>
                    {active && <Check size={14} style={{ color: theme.accentText }} />}
                    <ChevronDown size={14} className="-rotate-90" style={{ color: theme.text3 }} />
                  </button>
                );
              })}
            </div>

            <div className="mt-1 border-t pt-1.5" style={{ borderColor: theme.border }}>
              {creating ? (
                <div className="flex flex-col gap-2 p-1.5">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submitNewFolder();
                      if (event.key === 'Escape') setCreating(false);
                    }}
                    placeholder={browseFolder ? `Subfolder în ${browseFolder.name}` : 'Nume folder nou'}
                    aria-invalid={newNameDuplicate || undefined}
                    className="w-full rounded-[var(--r-sm)] border px-3 py-2 text-xs font-bold outline-none"
                    style={{ background: theme.surface2, borderColor: theme.border, color: theme.text }}
                  />
                  {newNameDuplicate && (
                    <div role="alert" className="text-[11px] font-semibold" style={{ color: theme.danger }}>
                      Există deja un folder cu acest nume aici. Alege alt nume.
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={submitNewFolder}
                      disabled={newNameDuplicate}
                      className="disabled:opacity-50 flex-1 rounded-[var(--r-sm)] px-3 py-2 text-[11px] font-black uppercase tracking-wider text-white"
                      style={{ background: theme.accent }}
                    >
                      Creează
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        setNewName('');
                      }}
                      className="rounded-[var(--r-sm)] px-3 py-2 text-[11px] font-black"
                      style={{ background: theme.surface2, color: theme.text3 }}
                    >
                      Anulează
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex w-full items-center gap-2 rounded-[var(--r-md)] px-3 py-2 text-left transition-colors hover:bg-[var(--hover-fill)]"
                  style={{ color: theme.accentText }}
                >
                  <FolderPlus size={15} />
                  <span className="text-xs font-black">
                    {browseFolder ? `Subfolder nou în ${browseFolder.name}` : 'Folder nou'}
                  </span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
