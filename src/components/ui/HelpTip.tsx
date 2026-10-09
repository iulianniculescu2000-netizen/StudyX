import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { Z_LAYERS } from '../../theme/zLayers';
import { computeCardLayout, type CardLayout, type Placement } from '../../tutorial/placement';
import { HELP_TIPS, type HelpTipEntry, type HelpTipId } from '../../tutorial/helpTips';
import { useTutorialStore } from '../../store/tutorialStore';
import { closeHelpTip, openHelpTip, useOpenHelpTipKey } from './helpTipStore';

interface HelpTipProps {
  id: HelpTipId;
  /** Diametrul butonului în pixeli. */
  size?: number;
  /** Partea preferată; popoverul trece singur pe cealaltă parte dacă nu încape. */
  placement?: Exclude<Placement, 'center'>;
  className?: string;
  /** „onDark”: butonul se vede pe fundaluri colorate închise (antetul sesiunii de grile). */
  tone?: 'default' | 'onDark';
}

/** Scroll-ul după care popoverul se închide în loc să urmărească butonul. */
const CLOSE_SCROLL_DISTANCE = 120;

/**
 * Butonul mic „?” care deschide o explicație scurtă (textele sunt în `tutorial/helpTips.ts`).
 * Popover de sticlă, non-modal, în portal; se închide cu Esc, click în afară sau scroll mare.
 */
export default function HelpTip({ id, size = 18, placement = 'bottom', className = '', tone = 'default' }: HelpTipProps) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const entry: HelpTipEntry = HELP_TIPS[id];
  const key = useId();
  const panelId = `${key}-panel`;
  const titleId = `${key}-title`;
  const open = useOpenHelpTipKey() === key;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const originTop = useRef(0);
  const measured = useRef(0);
  const [layout, setLayout] = useState<CardLayout | null>(null);

  const place = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    setLayout(computeCardLayout({
      target: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      vw: window.innerWidth,
      vh: window.innerHeight,
      preferred: placement,
      cardHeight: panelRef.current?.offsetHeight || 150,
    }));
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) return;
    measured.current = 0;
    originTop.current = buttonRef.current?.getBoundingClientRect().top ?? 0;
    place();
  }, [open, place]);

  // A doua trecere, după ce panoul are înălțimea reală.
  useLayoutEffect(() => {
    const height = panelRef.current?.offsetHeight ?? 0;
    if (open && layout && Math.abs(height - measured.current) > 2) {
      measured.current = height;
      place();
    }
  }, [open, layout, place]);

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closeHelpTip(key);
      buttonRef.current?.focus({ preventScroll: true });
    };
    const onPointer = (event: Event) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      closeHelpTip(key);
    };
    const onScroll = () => {
      const top = buttonRef.current?.getBoundingClientRect().top ?? 0;
      if (Math.abs(top - originTop.current) > CLOSE_SCROLL_DISTANCE) closeHelpTip(key);
      else place();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, key, place]);

  // Dispare din pagină cu popoverul deschis: nu lăsa starea globală agățată.
  useEffect(() => () => closeHelpTip(key), [key]);

  const toggle = () => (open ? closeHelpTip(key) : openHelpTip(key));
  const startTour = () => {
    closeHelpTip(key);
    if (entry.tour) useTutorialStore.getState().startTour(entry.tour);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={`Ajutor: ${entry.title}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        className={`press-feedback focus-ring inline-flex flex-shrink-0 items-center justify-center rounded-full border align-middle text-[11px] font-semibold leading-none ${className}`}
        style={{
          width: size,
          height: size,
          color: tone === 'onDark' ? 'rgba(255,255,255,0.85)' : open ? theme.accentText : theme.text3,
          borderColor: tone === 'onDark' ? 'rgba(255,255,255,0.40)' : open ? theme.accent : theme.border,
          background: tone === 'onDark' ? (open ? 'rgba(255,255,255,0.22)' : 'transparent') : open ? `${theme.accent}14` : 'transparent',
        }}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && createPortal(
        <motion.div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          tabIndex={-1}
          initial={calmMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
          animate={calmMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: calmMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="glass-panel fixed overflow-y-auto rounded-[var(--r-lg)] border p-4 outline-none elev-3"
          style={{
            zIndex: Z_LAYERS.assistant.popover,
            top: layout?.top ?? 0,
            left: layout?.left ?? 0,
            width: layout?.width ?? 300,
            maxHeight: layout?.maxHeight,
            visibility: layout ? 'visible' : 'hidden',
            borderColor: theme.border,
            color: theme.text,
          }}
        >
          <h3 id={titleId} className="text-[13px] font-semibold" style={{ color: theme.text }}>{entry.title}</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: theme.text2 }}>{entry.body}</p>
          {entry.tour && (
            <button
              type="button"
              onClick={startTour}
              className="press-feedback focus-ring mt-2 rounded-md text-[12px] font-medium underline-offset-2 hover:underline"
              style={{ color: theme.accentText }}
            >
              Ghid pas cu pas
            </button>
          )}
        </motion.div>,
        document.body,
      )}
    </>
  );
}
