import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ZoomModalProps {
  title: string;
  /** `pan`: drag + wheel/buttons zoom (diagrams). `scroll`: plain scrolling (wide tables). */
  mode: 'pan' | 'scroll';
  onClose: () => void;
  /** Extra header buttons (download, copy…), rendered before the zoom controls. */
  actions?: ReactNode;
  children: ReactNode;
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 6;
const clamp = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

/**
 * Full-screen viewer shared by diagrams and wide tables. Rendered in a portal
 * (the chat drawer has transforms that would trap a fixed overlay), traps
 * focus, and takes Esc before the surrounding chat does.
 */
export default function ZoomModal({ title, mode, onClose, actions, children }: ZoomModalProps) {
  const theme = useTheme();
  const { t, calmMotion } = useAdaptiveMotion();
  const dialogRef = useFocusTrap(true, onClose);
  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ id: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Esc closes just this layer: the chat behind listens on window, so intercept first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const zoomBy = useCallback((factor: number, originX = 0, originY = 0) => {
    setView((current) => {
      const k = clamp(current.k * factor);
      const ratio = k / current.k;
      return { k, x: originX - (originX - current.x) * ratio, y: originY - (originY - current.y) * ratio };
    });
  }, []);

  // Wheel zoom needs a non-passive listener to stop the page scrolling behind.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || mode !== 'pan') return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const px = event.clientX - (rect.left + rect.width / 2);
      const py = event.clientY - (rect.top + rect.height / 2);
      zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, px, py);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [mode, zoomBy]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode !== 'pan' || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y };
    setDragging(true);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    setView((v) => ({ ...v, x: current.originX + event.clientX - current.startX, y: current.originY + event.clientY - current.startY }));
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) {
      drag.current = null;
      setDragging(false);
    }
  };

  const onStageKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (mode !== 'pan') return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.2); }
    else if (event.key === '-') { event.preventDefault(); zoomBy(1 / 1.2); }
    else if (event.key === '0') { event.preventDefault(); setView({ k: 1, x: 0, y: 0 }); }
    else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const step = 40;
      setView((v) => ({
        ...v,
        x: v.x + (event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0),
        y: v.y + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
      }));
    }
  };

  const iconButton = 'fine-row inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-[var(--hover-fill)]';

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={t.pop}
      onClick={onClose}
      className="fixed inset-0 flex items-center justify-center p-3 sm:p-8"
      style={{ background: 'var(--overlay)', zIndex: 10010 }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={calmMotion ? { opacity: 0 } : { scale: 0.985, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={t.modal}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-full w-full max-w-[1280px] flex-col overflow-hidden rounded-[var(--r-xl)] shadow-2xl"
        style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text, height: mode === 'pan' ? 'min(86vh, 900px)' : undefined }}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${theme.border}` }}>
          <span className="truncate text-[13px] font-semibold" style={{ color: theme.text2 }}>{title}</span>
          <div className="flex items-center gap-0.5" style={{ color: theme.text2 }}>
            {actions}
            {mode === 'pan' && (
              <>
                <button type="button" className={iconButton} onClick={() => zoomBy(1 / 1.25)} aria-label="Micșorează" title="Micșorează (-)"><Minus size={16} aria-hidden="true" /></button>
                <button type="button" className={iconButton} onClick={() => zoomBy(1.25)} aria-label="Mărește" title="Mărește (+)"><Plus size={16} aria-hidden="true" /></button>
                <button type="button" className={iconButton} onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Resetează vizualizarea" title="Resetează (0)"><RotateCcw size={15} aria-hidden="true" /></button>
              </>
            )}
            <button type="button" className={iconButton} onClick={onClose} aria-label="Închide" title="Închide (Esc)" data-autofocus><X size={17} aria-hidden="true" /></button>
          </div>
        </div>

        {mode === 'pan' ? (
          <div
            ref={stageRef}
            tabIndex={0}
            role="group"
            aria-label="Zonă de vizualizare: trage pentru a muta, rotița sau + și - pentru zoom"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onStageKey}
            className="ai-md-stage relative flex min-h-0 flex-1 items-center justify-center overflow-hidden outline-none"
            style={{ cursor: dragging ? 'var(--cursor-grabbing, grabbing)' : 'var(--cursor-grab, grab)', touchAction: 'none' }}
          >
            <div
              className="ai-md-stage-content"
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
                transition: dragging || calmMotion ? 'none' : 'transform var(--dur-instant) var(--ease-standard)',
              }}
            >
              {children}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">{children}</div>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
