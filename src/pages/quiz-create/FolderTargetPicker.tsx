import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { Folder } from '../../types';
import type { Theme } from '../../theme/themes';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { dropdownFitStyle, useDropdownFit } from '../../hooks/useDropdownFit';

export default function FolderTargetPicker({
  folders,
  value,
  theme,
  onChange,
}: {
  folders: Folder[];
  value: string;
  theme: Theme;
  onChange: (folderId: string) => void;
}) {
  const { t } = useAdaptiveMotion();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fit = useDropdownFit(open, rootRef);
  const folderPath = (folder: Folder) => {
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
  };
  const selectedFolder = folders.find((folder) => folder.id === value);
  const selectedLabel = selectedFolder ? `${selectedFolder.emoji} ${folderPath(selectedFolder)}` : 'Neclasificate';
  const options = [
    { id: '__uncategorized__', label: 'Neclasificate', helper: 'Setul rămâne în lista principală' },
    ...folders.map((folder) => ({
      id: folder.id,
      label: `${folder.emoji} ${folderPath(folder)}`,
      helper: 'Salvează direct în folder',
    })),
  ];

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative mt-2">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,color,opacity,transform]"
        style={{
          background: theme.surface2,
          borderColor: open ? `${theme.accent}55` : theme.border,
          color: theme.text,
                  }}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{selectedLabel}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: theme.text3 }}>
            Unde se salvează grila după creare
          </div>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} style={{ color: theme.text3 }}>
          <ChevronDown size={15} />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={t.pop}
            className="custom-scrollbar absolute left-0 right-0 z-40 rounded-2xl border p-1.5 shadow-lg"
            style={{
              background: theme.surface,
              borderColor: theme.border,
              backdropFilter: 'blur(var(--blur-2)) saturate(160%)',
              ...dropdownFitStyle(fit, '0.45rem'),
            }}
          >
            {options.map((option) => {
              const active = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  className="fine-row press-feedback flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  style={{
                    ...(active ? { background: theme.accent, boxShadow: 'none' } : {}),
                    color: active ? '#fff' : theme.text,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{option.label}</div>
                    <div className="mt-0.5 truncate text-[11px]" style={{ color: active ? 'rgba(255,255,255,0.72)' : theme.text3 }}>
                      {option.helper}
                    </div>
                  </div>
                  {active && <Check size={14} />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
