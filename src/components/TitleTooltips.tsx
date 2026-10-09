import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../theme/ThemeContext';
import { Z_LAYERS } from '../theme/zLayers';
import { TOOLTIP_DELAY_MS, claimTooltipText, estimateTooltipBox, placeTooltip, type TooltipPlacement } from './titleTooltip';

interface Shown { text: string; placement: TooltipPlacement; width: number }

/**
 * Un singur tooltip pentru toată aplicația: orice element cu `title="…"` arată textul într-un balon de sticlă, în
 * aceeași stilistică cu restul (în loc de tooltipul nativ, pătrat și cu contur negru). Se montează o dată, în App.
 * Mouse și tastatură (focus); pe ecrane tactile nu face nimic. Dispare la ieșire, clic, scroll și Esc.
 */
export default function TitleTooltips() {
  const theme = useTheme();
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = useRef<Element | null>(null);

  useEffect(() => {
    const hide = () => {
      window.clearTimeout(timer.current);
      current.current = null;
      setShown(null);
    };
    const schedule = (start: EventTarget | null, immediate: boolean) => {
      if (!(start instanceof Element)) return;
      const claim = claimTooltipText(start);
      if (!claim) {
        if (current.current && !current.current.contains(start)) hide();
        return;
      }
      if (current.current === claim.element) return;
      window.clearTimeout(timer.current);
      current.current = claim.element;
      setShown(null);
      const show = () => {
        if (current.current !== claim.element || !claim.element.isConnected) return;
        const rect = claim.element.getBoundingClientRect();
        const box = estimateTooltipBox(claim.text);
        setShown({
          text: claim.text,
          width: box.width,
          placement: placeTooltip(rect, box, { width: window.innerWidth, height: window.innerHeight }),
        });
      };
      if (immediate) show();
      else timer.current = window.setTimeout(show, TOOLTIP_DELAY_MS);
    };

    const onOver = (event: PointerEvent) => { if (event.pointerType !== 'touch') schedule(event.target, false); };
    const onOut = (event: PointerEvent) => {
      const el = current.current;
      if (el && event.relatedTarget instanceof Node && el.contains(event.relatedTarget)) return;
      if (el && !(event.target instanceof Node && el.contains(event.target))) return;
      hide();
    };
    const onFocus = (event: FocusEvent) => schedule(event.target, true);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('focusout', hide, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('focusout', hide, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  if (!shown) return null;
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none rounded-[var(--r-sm)] px-3 py-1.5 text-[12px] font-medium leading-[18px]"
      style={{
        position: 'fixed',
        top: shown.placement.top,
        left: shown.placement.centerX,
        transform: 'translateX(-50%)',
        maxWidth: 280,
        width: 'max-content',
        zIndex: Z_LAYERS.assistant.popover + 10,
        background: `color-mix(in srgb, ${theme.surface} 90%, transparent)`,
        WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
        backdropFilter: 'blur(14px) saturate(1.4)',
        border: `1px solid ${theme.border2}`,
        color: theme.text,
        boxShadow: 'var(--elev-3)',
        animation: 'tip-in 120ms ease-out',
      }}
    >
      {shown.text}
    </div>,
    document.body,
  );
}
