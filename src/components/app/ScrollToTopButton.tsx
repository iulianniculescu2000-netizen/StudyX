import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';

/**
 * Pages scroll either in the route host itself or in their own `h-full overflow-y-auto`
 * container inside it, and the host is replaced on every navigation. So instead of
 * binding to one element, listen to scroll events anywhere (they don't bubble, hence the
 * capture phase) and follow whichever element inside the route is the one being scrolled.
 */
export default function ScrollToTopButton() {
  // The path the button was shown for: navigating away hides it without resetting state in an effect.
  const [visibleOn, setVisibleOn] = useState<string | null>(null);
  const visibleRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const { pathname } = useLocation();
  const { calmMotion, t } = useAdaptiveMotion();

  const pathRef = useRef(pathname);

  // A new page starts at the top, with its own scroller.
  useEffect(() => {
    pathRef.current = pathname;
    scrollerRef.current = null;
    visibleRef.current = false;
  }, [pathname]);

  useEffect(() => {
    const update = () => {
      frameRef.current = null;
      const scroller = scrollerRef.current;
      if (scroller && !scroller.isConnected) scrollerRef.current = null;
      const nextVisible = (scrollerRef.current?.scrollTop ?? 0) > 400;
      if (visibleRef.current !== nextVisible) {
        visibleRef.current = nextVisible;
        setVisibleOn(nextVisible ? pathRef.current : null);
      }
    };

    const handler = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      // Only the page's own scroll counts: not a modal, a dropdown list or the chat drawer.
      if (!target.closest('.route-scroll-host') || target.closest('[role="dialog"], [role="listbox"], [role="menu"]')) return;
      scrollerRef.current = target;
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(update);
    };

    document.addEventListener('scroll', handler, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', handler, true);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  if (visibleOn !== pathname) return null;

  return (
    <motion.button
      initial={calmMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={t.toast}
      onClick={() => scrollerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Revino sus"
      className="focus-ring fixed z-[100] flex h-12 w-12 items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-[0.97]"
      style={{
        background: 'var(--accent)',
        boxShadow: 'var(--elev-2)',
        // Pe aceeași linie cu lansatorul AI (56px, right-9), în stânga lui: 36 + 56 + 8 (mascota depășește) + 20 aer = 120px de la dreapta.
        right: 120,
        bottom: 28,
      }}
    >
      <ArrowUp size={20} strokeWidth={3} />
    </motion.button>
  );
}
