import { useRef, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import type { Theme } from '../../theme/themes';
import { CARD_COLOR_MAP } from '../../theme/colorMaps';
import { restanteLabel } from './deckTreeShared';

export interface GroupHeaderProps {
  name: string;
  emoji?: string;
  color?: string;
  /** Pictogramă în locul emoji-ului (Neclasificate). */
  icon?: React.ReactNode;
  /** Folderele de deasupra (lanț strâns): se arată ca breadcrumb înaintea numelui. */
  ancestors?: string[];
  depth: number;
  count: number;
  due: number;
  open: boolean;
  bodyId: string;
  theme: Theme;
  calm: boolean;
  onToggle: () => void;
  /** Doar pentru grupurile de pe disciplină: ruta paginii disciplinei. */
  openHref?: string;
  /** Acțiuni pe folder (doar pentru foldere proprii). */
  manage?: {
    renaming: boolean;
    onSubfolder: () => void;
    onRename: () => void;
    onDelete: () => void;
    onRenameCommit: (name: string) => void;
    onRenameCancel: () => void;
  };
  dropId?: string;
  /** Țintă de tragere: pachetele se pot lăsa pe antet. */
  drop?: {
    active: boolean;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
  };
}

function RenameInput({ initial, onCommit, onCancel, theme }: { initial: string; onCommit: (name: string) => void; onCancel: () => void; theme: Theme }) {
  const finished = useRef(false);
  const finish = (commit: boolean, value: string) => {
    if (finished.current) return;
    finished.current = true;
    if (commit && value.trim()) onCommit(value.trim()); else onCancel();
  };
  return (
    <input
      autoFocus
      defaultValue={initial}
      aria-label="Numele folderului"
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); finish(true, event.currentTarget.value); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false, ''); }
      }}
      onBlur={(event) => finish(true, event.currentTarget.value)}
      className="focus-ring min-w-0 flex-1 rounded-[var(--r-sm)] border px-2 py-0.5 text-[13px] font-semibold outline-none"
      style={{ background: theme.surface2, borderColor: 'var(--hairline)', color: theme.text }}
    />
  );
}

export function GroupHeader({ name, ancestors, emoji, color, icon, depth, count, due, open, bodyId, theme, calm, onToggle, openHref, manage, drop, dropId }: GroupHeaderProps) {
  const tint = color ? (CARD_COLOR_MAP[color] ?? CARD_COLOR_MAP.blue).badge : null;
  const lead = (
    <>
      <ChevronRight
        size={14}
        aria-hidden="true"
        className="flex-shrink-0"
        style={{ color: theme.text3, transform: open ? 'rotate(90deg)' : 'none', transition: calm ? 'none' : 'transform var(--dur-base) var(--ease-emphasized)' }}
      />
      <span
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[12px]"
        style={{ background: tint ? `${tint}26` : 'var(--fill-subtle)', color: theme.text3 }}
        aria-hidden="true"
      >
        {icon ?? emoji}
      </span>
    </>
  );

  return (
    <div
      data-testid="group-header"
      className="group/header relative flex h-9 items-center"
      style={{
        borderTop: '1px solid var(--hairline)',
        paddingLeft: 4 + depth * 16,
        ...(drop?.active ? { background: 'var(--accent-soft)', boxShadow: 'var(--ring-inset)' } : null),
      }}
      onDragOver={drop?.onDragOver}
      onDragLeave={drop?.onDragLeave}
      onDrop={drop?.onDrop}
      data-drop-folder-id={drop ? dropId : undefined}
    >
      {manage?.renaming ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 pl-1.5 pr-3">
          {lead}
          <RenameInput initial={name} onCommit={manage.onRenameCommit} onCancel={manage.onRenameCancel} theme={theme} />
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="focus-ring fine-row flex h-full min-w-0 flex-1 items-center gap-2 pl-1.5 pr-2 text-left"
          style={{ borderRadius: 0 }}
        >
          {lead}
          <span className="min-w-0 truncate text-[13px] font-semibold" style={{ color: theme.text }}>
            {ancestors?.map((part) => (
              <span key={part}>
                <span className="font-medium" style={{ color: theme.text3 }}>{part}</span>
                <ChevronRight size={11} aria-hidden="true" className="mx-0.5 inline align-[-1px]" style={{ color: theme.text3 }} />
              </span>
            ))}
            {name}
          </span>
          <span className="flex-shrink-0 text-[12px]" style={{ color: theme.text3 }}>· {count} {count === 1 ? 'pachet' : 'pachete'}</span>
          {due > 0 && (
            <span
              className="flex-shrink-0 rounded-full px-1.5 py-px text-[11px] font-semibold"
              style={{ color: theme.warning, background: `${theme.warning}1f` }}
            >
              {restanteLabel(due)}
            </span>
          )}
        </button>
      )}

      {openHref && (
        <Link
          to={openHref}
          aria-label={`Deschide ${name} în Rezidențiat`}
          className="focus-ring press-feedback mr-2 flex flex-shrink-0 items-center gap-0.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
          style={{ color: theme.accentText }}
        >
          Deschide <ChevronRight size={13} aria-hidden="true" />
        </Link>
      )}

      {manage && !manage.renaming && (
        <div
          className="flex flex-shrink-0 items-center pr-1.5 opacity-0 group-hover/header:opacity-100 group-focus-within/header:opacity-100 [@media(hover:none)]:opacity-100"
          style={{ transition: 'opacity var(--dur-fast) var(--ease-standard)' }}
        >
          <button
            type="button"
            onClick={manage.onSubfolder}
            aria-label={`Subfolder nou în ${name}`}
            title="Subfolder nou"
            className="press-feedback flex h-7 w-7 items-center justify-center rounded-[var(--r-sm)] [@media(hover:none)]:h-8 [@media(hover:none)]:w-8"
            style={{ color: theme.text3 }}
          >
            <FolderPlus size={14} />
          </button>
          <button
            type="button"
            onClick={manage.onRename}
            aria-label={`Redenumește folderul ${name}`}
            title="Redenumește"
            className="press-feedback flex h-7 w-7 items-center justify-center rounded-[var(--r-sm)] [@media(hover:none)]:h-8 [@media(hover:none)]:w-8"
            style={{ color: theme.text3 }}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={manage.onDelete}
            aria-label={`Șterge folderul ${name}`}
            title="Șterge folderul"
            className="press-feedback flex h-7 w-7 items-center justify-center rounded-[var(--r-sm)] [@media(hover:none)]:h-8 [@media(hover:none)]:w-8"
            style={{ color: theme.text3 }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
