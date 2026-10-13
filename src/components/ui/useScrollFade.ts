import { useEffect, useRef, useState, type CSSProperties } from 'react';

const FADE = 28;

/**
 * Pentru o bandă cu derulare orizontală (taburi): arată o estompare pe marginea unde mai e conținut ascuns,
 * ca tăierea să nu pară un defect. Pune `ref` pe containerul care derulează și `style` pe același element.
 */
export function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    el.addEventListener('scroll', update, { passive: true });
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update);
      observer.observe(el);
      Array.from(el.children).forEach((child) => observer?.observe(child));
    }
    return () => {
      el.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);

  const left = edges.start ? `transparent 0, #000 ${FADE}px` : '#000 0';
  const right = edges.end ? `#000 calc(100% - ${FADE}px), transparent 100%` : '#000 100%';
  const mask = `linear-gradient(to right, ${left}, ${right})`;
  const style: CSSProperties = edges.start || edges.end ? { maskImage: mask, WebkitMaskImage: mask } : {};
  return [ref, style] as const;
}
