import { useEffect, useRef, useState } from 'react';
import { useCursorStore, type CursorGesture } from '../../store/cursorStore';
import { useTheme } from '../../theme/ThemeContext';
import { useVaultUploadStore } from '../../store/vaultUploadStore';
import { HandSvg } from './HandSvg';

export default function StudyXHandCursor() {
  const enabled = useCursorStore((s) => s.enabled);
  const manualGesture = useCursorStore((s) => s.gesture);
  const theme = useTheme();

  // Watch background tasks for ambient loading state beside the pointer
  const activeUploads = useVaultUploadStore((s) => s.tasks.some((t) => t.status !== 'completed' && t.status !== 'error'));

  const [visible, setVisible] = useState(false);
  const [clicking, setClicking] = useState(false);
  const [autoGesture, setAutoGesture] = useState<CursorGesture>('idle');

  const cursorRef = useRef<HTMLDivElement>(null);
  const mousePos = useRef({ x: -100, y: -100 });
  const rafRef = useRef<number | null>(null);

  const activeGesture: CursorGesture =
    manualGesture !== 'idle'
      ? manualGesture
      : autoGesture !== 'idle'
      ? autoGesture
      : activeUploads
      ? 'loading'
      : 'idle';

  const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    if (!enabled || isTouchDevice) {
      document.documentElement.classList.remove('studyx-custom-cursor-active');
      return;
    }

    document.documentElement.classList.add('studyx-custom-cursor-active');
    return () => {
      document.documentElement.classList.remove('studyx-custom-cursor-active');
    };
  }, [enabled, isTouchDevice]);

  // Instant 1:1 hardware-accelerated movement (Zero trail, zero lag)
  useEffect(() => {
    if (!enabled || isTouchDevice) return;

    const onMouseMove = (e: MouseEvent) => {
      mousePos.current.x = e.clientX;
      mousePos.current.y = e.clientY;

      if (!visible) setVisible(true);

      const target = e.target as HTMLElement | null;
      if (target) {
        if (
          target.closest(
            'button, a, [role="button"], [data-interactive="true"], select, input[type="checkbox"], input[type="radio"], [data-tutorial], [data-tab], .clickable',
          )
        ) {
          setAutoGesture('pointer');
        } else if (
          target.closest('input[type="text"], input[type="search"], textarea, [contenteditable="true"]')
        ) {
          setAutoGesture('text');
        } else if (
          target.closest('[data-grabbable="true"], [data-drag-handle="true"], [class*="--cursor-grab"], [aria-roledescription="sortable"]')
        ) {
          setAutoGesture('grab');
        } else {
          setAutoGesture('idle');
        }
      }
    };

    const onMouseDown = () => setClicking(true);
    const onMouseUp = () => setClicking(false);
    const onMouseLeave = () => setVisible(false);
    const onMouseEnter = () => setVisible(true);

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('mouseenter', onMouseEnter);

    const render = () => {
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${mousePos.current.x}px, ${mousePos.current.y}px, 0)`;
      }
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('mouseenter', onMouseEnter);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, isTouchDevice, visible]);

  if (!enabled || isTouchDevice) return null;

  return (
    <div
      ref={cursorRef}
      aria-hidden="true"
      className="fixed top-0 left-0 pointer-events-none z-[999999] transition-opacity duration-150 will-change-transform"
      style={{
        opacity: visible ? 1 : 0,
      }}
    >
      <HandSvg
        gesture={activeGesture}
        accent={theme.accent}
        isDark={theme.isDark}
        clicking={clicking}
      />
    </div>
  );
}
