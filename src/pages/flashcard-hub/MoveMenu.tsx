import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { Check } from 'lucide-react';
import Portal from '../../components/Portal';
import { useTheme } from '../../theme/ThemeContext';
import type { Folder } from '../../types';
import { folderOptions } from '../../lib/flashcardGroups';

const MENU_WIDTH = 280;
const MENU_MAX_HEIGHT = 320;

interface MoveMenuProps {
  folders: ReadonlyArray<Folder>;
  /** Folderul în care e acum pachetul (null = Neclasificate). */
  currentFolderId: string | null;
  anchorRef: RefObject<HTMLElement | null>;
  onPick: (folderId: string | null) => void;
  onClose: () => void;
}

/**
 * Meniul „Mută în…” al unui pachet: lista folderelor cu calea completă, Neclasificate primul. Stă într-un
 * portal (rândurile au `content-visibility`, care ar tăia un meniu local) și se poate folosi doar de la
 * tastatură: săgeți, Home/End, Enter, Esc. Alternativa la tragere pentru cine nu folosește mouse-ul.
 */
export default function MoveMenu({ folders, currentFolderId, anchorRef, onPick, onClose }: MoveMenuProps) {
  const theme = useTheme();
  const options = useMemo(() => folderOptions(folders), [folders]);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const openUp = below < 200 && above > below;
    const maxHeight = Math.min(MENU_MAX_HEIGHT, openUp ? above : below);
    setPosition({ left, top: openUp ? Math.max(8, rect.top - 6 - Math.min(maxHeight, MENU_MAX_HEIGHT)) : rect.bottom + 6, maxHeight });
  }, [anchorRef]);

  useEffect(() => {
    if (!position) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    const current = Array.from(items ?? []).find((item) => item.dataset.current === 'true') ?? items?.[0];
    current?.focus();
    current?.scrollIntoView?.({ block: 'nearest' });
  }, [position]);

  useEffect(() => {
    const anchor = anchorRef.current;
    const close = () => onClose();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (menuRef.current?.contains(target) || anchor?.contains(target))) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [anchorRef, onClose]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      anchorRef.current?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      onClose();
    }
  };

  return (
    <Portal>
      <div
        ref={menuRef}
        role="menu"
        aria-label="Mută în…"
        onKeyDown={onKeyDown}
        className="glass-panel elev-3 custom-scrollbar overflow-y-auto rounded-[var(--r-md)] p-1"
        style={{
          position: 'fixed',
          zIndex: 9999,
          top: position?.top ?? 0,
          left: position?.left ?? 0,
          width: Math.min(MENU_WIDTH, typeof window === 'undefined' ? MENU_WIDTH : window.innerWidth - 16),
          maxHeight: position?.maxHeight ?? MENU_MAX_HEIGHT,
          visibility: position ? 'visible' : 'hidden',
        }}
      >
        <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: theme.text3 }}>
          Mută în…
        </div>
        {options.map((option) => {
          const current = option.id === currentFolderId;
          return (
            <button
              key={option.id ?? '__uncategorized__'}
              type="button"
              role="menuitem"
              data-current={current}
              aria-label={current ? `${option.label} (aici)` : option.label}
              aria-disabled={current || undefined}
              onClick={() => { if (!current) onPick(option.id); }}
              className="fine-row flex w-full items-center gap-2 rounded-[var(--r-sm)] py-1.5 pr-2 text-left text-[13px] outline-none"
              style={{ paddingLeft: 10 + Math.min(option.depth, 3) * 10, color: current ? theme.text3 : theme.text, cursor: current ? 'default' : 'pointer' }}
            >
              <span className="w-4 flex-shrink-0 text-center text-[13px]" aria-hidden>{option.emoji}</span>
              <span className="min-w-0 flex-1 truncate" title={option.label}>{option.depth === 0 ? option.label : option.label.split(' / ').pop()}</span>
              {current && <Check size={13} aria-label="Aici" style={{ color: theme.accentText }} />}
            </button>
          );
        })}
      </div>
    </Portal>
  );
}
