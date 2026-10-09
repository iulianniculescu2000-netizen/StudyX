import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Check, Clock, Loader2, X as XIcon } from 'lucide-react';
import type { Folder } from '../../types';
import type { Theme } from '../../theme/themes';
import { cardsLabel } from './cardsLabel';
import { folderPath } from './folderPath';
import { FolderTargetSelect } from './FolderTargetSelect';
import type { GeneratedDeckInfo } from './sectionTypes';


/** "40 s" under a minute and a half, else whole minutes. */
function formatWaitShort(seconds: number) {
  return seconds < 90 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}

/**
 * "Continuă generarea" with a countdown while the provider's limit resets.
 * The parent keys it by the interruption, so every new wait starts a new count.
 */
function ResumeButton({
  waitSeconds,
  busy,
  progress,
  theme,
  onResume,
}: {
  waitSeconds: number | null;
  busy: boolean;
  progress: string;
  theme: Theme;
  onResume: () => void;
}) {
  // Waits longer than five minutes (a daily limit) are not worth counting down: let the user decide.
  const [left, setLeft] = useState(() => (waitSeconds !== null && waitSeconds <= 300 ? Math.ceil(waitSeconds) + 1 : 0));
  const counting = left > 0;

  useEffect(() => {
    if (!counting) return undefined;
    const timer = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  return (
    <button
      type="button"
      onClick={onResume}
      disabled={busy || counting}
      className="press-feedback mt-3 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-[13.5px] font-semibold text-white transition-[filter] duration-[var(--dur-base)] hover:brightness-110 disabled:opacity-60"
      style={{ background: theme.accent }}
    >
      {busy && <Loader2 size={15} className="animate-spin" />}
      {busy ? progress || 'Generez...' : counting ? `Continuă în ${formatWaitShort(left)}` : 'Continuă generarea'}
    </button>
  );
}

export function GeneratedDeckCard({
  info,
  folders,
  theme,
  resuming,
  progress,
  onMove,
  onCreateFolder,
  onStart,
  onResume,
  onDismiss,
}: {
  info: GeneratedDeckInfo;
  folders: Folder[];
  theme: Theme;
  resuming: boolean;
  progress: string;
  onMove: (folderId: string) => void;
  onCreateFolder: (name: string, parentId: string | null) => string;
  onStart: () => void;
  onResume: () => void;
  onDismiss: () => void;
}) {
  const folder = info.folderId ? folders.find((item) => item.id === info.folderId) ?? null : null;
  const where = folder ? `${folder.emoji} ${folderPath(folders, folder)}` : 'Neclasificate';
  const { interrupted } = info;
  const tone = interrupted ? theme.warning : theme.success;

  return (
    <motion.section
      role="status"
      aria-label={interrupted ? 'Pachet creat parțial' : 'Pachet creat'}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-[var(--r-md)] p-4"
      style={{ background: theme.surface, border: `1px solid ${tone}45` }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
          style={{ background: `${tone}18`, color: tone }}
        >
          {interrupted ? <Clock size={18} /> : <Check size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-semibold" style={{ color: theme.text }}>
            {interrupted
              ? `Pachet creat parțial · ${info.count} din ${interrupted.requested} carduri`
              : `Pachet creat · ${cardsLabel(info.count)}`}
          </div>
          <div className="truncate text-[12.5px]" style={{ color: theme.text3 }}>
            {info.title}
          </div>
          <div className="mt-1 text-[12.5px]" style={{ color: theme.text2 }}>
            Salvat în <span className="font-semibold">{where}</span>
            {info.suggested && (
              <span style={{ color: theme.text3 }}> · ales după numele cursului</span>
            )}
          </div>
          {interrupted && (
            <div className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: theme.text3 }}>
              {interrupted.reason} Cardurile de până acum sunt salvate; poți continua de unde a rămas.
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Închide"
          onClick={onDismiss}
          className="press-feedback flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors"
          style={{ background: theme.surface2, color: theme.text2 }}
        >
          <XIcon size={15} />
        </button>
      </div>

      <div className="mt-3">
        <FolderTargetSelect
          label="Mută în"
          help="fc-deck-created"
          folders={folders}
          value={info.folderId ?? '__uncategorized__'}
          theme={theme}
          onChange={onMove}
          onCreateFolder={onCreateFolder}
        />
      </div>

      {interrupted && (
        <ResumeButton
          key={interrupted.at}
          waitSeconds={interrupted.waitSeconds}
          busy={resuming}
          progress={progress}
          theme={theme}
          onResume={onResume}
        />
      )}

      <button
        type="button"
        onClick={onStart}
        className="press-feedback mt-3 flex w-full items-center justify-center rounded-full py-2.5 text-[13.5px] font-semibold transition-[filter] duration-[var(--dur-base)] hover:brightness-110"
        style={interrupted ? { background: theme.surface2, color: theme.text } : { background: theme.accent, color: '#fff' }}
      >
        Începe repetarea
      </button>
    </motion.section>
  );
}
