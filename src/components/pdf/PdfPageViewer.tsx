import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus, Maximize2 } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { loadPdfjs } from './pdfjs';

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
/** Câte pagini rămân desenate simultan (cele din jurul ferestrei); restul își eliberează canvasul. */
const PAGE_GAP = 12;
const SIDE_PAD = 16;

interface Props {
  /** Conținutul PDF-ului (se copiază: pdf.js își detașează bufferul). Pentru alt PDF, remontează componenta (`key`). */
  data: Uint8Array | ArrayBuffer;
  /** Pagina (1-based) la care se deschide. */
  initialPage?: number;
  /** O notă scurtă lângă numărul paginii, ex. „p. 153 în carte”. */
  pageNote?: (page: number) => string | null;
  /** Când PDF-ul nu se poate afișa, butonul „Deschide în aplicația de PDF”. */
  onOpenExternal?: () => void;
  onError?: (error: unknown) => void;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Pagini PDF exact ca în fișier (culori, figuri, tabele): fiecare pagină e desenată de pdf.js pe un canvas, doar când
 * e aproape de ecran (IntersectionObserver), la rezoluția ecranului; cele îndepărtate își eliberează canvasul.
 */
export default function PdfPageViewer({ data, initialPage = 1, pageNote, onOpenExternal, onError }: Props) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef(new Map<number, HTMLDivElement>());
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState(1.414);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(initialPage);
  const [jump, setJump] = useState(String(initialPage));
  const pageRef = useRef(initialPage);
  const placed = useRef(false);

  // Încarcă documentul.
  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    void (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));
        task = pdfjs.getDocument({ data: bytes });
        const pdf = await task.promise;
        if (cancelled) return;
        const first = await pdf.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        if (!cancelled) setRatio(vp.height / vp.width);
        first.cleanup();
        if (!cancelled) setDoc(pdf);
      } catch (error) {
        if (cancelled) return;
        setFailed(true);
        onError?.(error);
      }
    })();
    return () => {
      cancelled = true;
      // Distruge sarcina (și documentul) și oprește desenările în curs.
      if (task) void Promise.resolve(task.destroy()).catch(() => undefined);
    };
    // onError e doar notificare; documentul se reîncarcă numai când se schimbă datele.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Lățimea disponibilă.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc, failed]);

  const numPages = doc?.numPages ?? 0;
  const cssWidth = Math.max(120, (width - SIDE_PAD * 2) * zoom);
  const cssHeight = cssWidth * ratio;

  const scrollToPage = useCallback((target: number, smooth: boolean) => {
    const el = scrollRef.current;
    const slot = slotRefs.current.get(target);
    if (!el || !slot) return;
    const top = slot.offsetTop - PAGE_GAP;
    if (smooth && !calmMotion && typeof el.scrollTo === 'function') el.scrollTo({ top, behavior: 'smooth' });
    else el.scrollTop = top;
  }, [calmMotion]);

  const goTo = useCallback((target: number, smooth = true) => {
    if (!numPages) return;
    const next = clamp(Math.round(target) || 1, 1, numPages);
    pageRef.current = next;
    setPage(next);
    setJump(String(next));
    scrollToPage(next, smooth);
  }, [numPages, scrollToPage]);

  // Deschiderea inițială, imediat ce există lățime și pagini.
  useLayoutEffect(() => {
    if (!numPages || !width || placed.current) return;
    placed.current = true;
    goTo(initialPage, false);
  }, [numPages, width, initialPage, goTo]);

  // Zoom-ul păstrează pagina curentă în vedere.
  useLayoutEffect(() => {
    if (placed.current && numPages) scrollToPage(pageRef.current, false);
  }, [zoom, cssWidth, numPages, scrollToPage]);

  // Pagina curentă după derulare.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const probe = el.scrollTop + el.clientHeight * 0.35;
    let current = 1;
    slotRefs.current.forEach((slot, n) => { if (slot.offsetTop <= probe && n > current) current = n; });
    if (current !== pageRef.current) {
      pageRef.current = current;
      setPage(current);
      setJump(String(current));
    }
  }, []);

  const onFirstSize = useCallback((r: number) => setRatio((prev) => (Math.abs(prev - r) > 0.01 ? r : prev)), []);

  const stepZoom = (dir: 1 | -1) => {
    const next = dir === 1 ? ZOOM_STEPS.find((z) => z > zoom + 0.01) : [...ZOOM_STEPS].reverse().find((z) => z < zoom - 0.01);
    if (next !== undefined) setZoom(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    const k = event.key;
    if (k === 'PageDown' || k === 'ArrowRight') { event.preventDefault(); goTo(pageRef.current + 1); }
    else if (k === 'PageUp' || k === 'ArrowLeft') { event.preventDefault(); goTo(pageRef.current - 1); }
    else if (k === 'Home') { event.preventDefault(); goTo(1); }
    else if (k === 'End') { event.preventDefault(); goTo(numPages); }
    else if (k === '+' || k === '=') { event.preventDefault(); stepZoom(1); }
    else if (k === '-') { event.preventDefault(); stepZoom(-1); }
    else if (k === '0') { event.preventDefault(); setZoom(1); }
  };

  const submitJump = (event: FormEvent) => {
    event.preventDefault();
    goTo(Number(jump));
  };

  const button = 'flex h-8 w-8 items-center justify-center rounded-[var(--r-md)] disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]';
  const buttonStyle = { background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text2 } as const;

  if (failed) {
    return (
      <div role="alert" className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="max-w-md text-sm" style={{ color: theme.text2 }}>
          Nu am putut afișa acest PDF în aplicație. Fișierul poate fi deteriorat sau protejat.
        </p>
        {onOpenExternal && (
          <button type="button" onClick={onOpenExternal} className="fine-chip press-feedback inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ color: theme.text2 }}>
            <ExternalLink size={12} /> Deschide în aplicația de PDF
          </button>
        )}
      </div>
    );
  }

  const note = numPages ? pageNote?.(page) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="toolbar" aria-label="Controale pentru paginile cărții" className="flex flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: theme.border }}>
        <button type="button" className={button} style={buttonStyle} aria-label="Pagina anterioară" disabled={!numPages || page <= 1} onClick={() => goTo(page - 1)}>
          <ChevronLeft size={16} />
        </button>
        <form onSubmit={submitJump} className="flex items-center gap-1.5 text-[12px]" style={{ color: theme.text3 }}>
          <label htmlFor="pdf-jump" className="sr-only">Salt la pagina</label>
          <input
            id="pdf-jump"
            type="number"
            inputMode="numeric"
            min={1}
            max={numPages || undefined}
            value={jump}
            disabled={!numPages}
            onChange={(e) => setJump(e.target.value)}
            onBlur={() => setJump(String(page))}
            className="h-8 w-14 rounded-[var(--r-md)] px-2 text-center text-[12.5px] tabular-nums focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]"
            style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
          />
          <span aria-live="polite">/ {numPages || '…'}</span>
        </form>
        <button type="button" className={button} style={buttonStyle} aria-label="Pagina următoare" disabled={!numPages || page >= numPages} onClick={() => goTo(page + 1)}>
          <ChevronRight size={16} />
        </button>
        {note && <span className="text-[11.5px]" style={{ color: theme.text3 }}>{note}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" className={button} style={buttonStyle} aria-label="Micșorează" disabled={zoom <= ZOOM_STEPS[0]} onClick={() => stepZoom(-1)}>
            <Minus size={15} />
          </button>
          <span className="w-11 text-center text-[12px] tabular-nums" style={{ color: theme.text3 }} aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button type="button" className={button} style={buttonStyle} aria-label="Mărește" disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} onClick={() => stepZoom(1)}>
            <Plus size={15} />
          </button>
          <button type="button" className={button} style={buttonStyle} aria-label="Potrivește pe lățime" title="Potrivește pe lățime" onClick={() => setZoom(1)}>
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label="Paginile cărții"
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        className="custom-scrollbar relative min-h-0 flex-1 overflow-auto focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]"
        style={{ background: theme.surface2 }}
      >
        {!numPages ? (
          <div className="space-y-3 p-6" aria-busy="true" aria-label="Se încarcă PDF-ul">
            <div className="skeleton-block mx-auto h-[60vh] w-full max-w-xl rounded-lg" />
          </div>
        ) : (
          <div className="flex flex-col items-center py-3" style={{ gap: PAGE_GAP, minWidth: cssWidth + SIDE_PAD * 2 }}>
            {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
              <PageSlot
                key={n}
                n={n}
                total={numPages}
                doc={doc!}
                cssWidth={cssWidth}
                cssHeight={cssHeight}
                scrollRoot={scrollRef}
                slots={slotRefs}
                onSize={onFirstSize}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SlotProps {
  n: number;
  total: number;
  doc: PDFDocumentProxy;
  cssWidth: number;
  cssHeight: number;
  scrollRoot: React.RefObject<HTMLDivElement | null>;
  slots: React.RefObject<Map<number, HTMLDivElement>>;
  onSize: (ratio: number) => void;
}

/** O pagină: loc rezervat cu dimensiunea corectă; canvasul se desenează doar cât timp e aproape de ecran. */
function PageSlot({ n, total, doc, cssWidth, cssHeight, scrollRoot, slots, onSize }: SlotProps) {
  const theme = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [rendered, setRendered] = useState(false);

  useLayoutEffect(() => {
    const el = hostRef.current;
    const map = slots.current;
    if (el) map.set(n, el);
    return () => { map.delete(n); };
  }, [slots, n]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) setNear(e.isIntersecting); },
      { root: scrollRoot.current, rootMargin: '150% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!near || !canvas || cssWidth <= 0) {
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    let pdfPage: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | null = null;
    void (async () => {
      try {
        pdfPage = await doc.getPage(n);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        if (n === 1) onSize(base.height / base.width);
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const viewport = pdfPage.getViewport({ scale: (cssWidth * dpr) / base.width });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        task = pdfPage.render({ canvasContext: ctx, canvas, viewport });
        await task.promise;
        if (!cancelled) setRendered(true);
      } catch {
        // Desenarea anulată (derulare/demontare) sau o pagină stricată: locul rămâne gol.
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      pdfPage?.cleanup();
      setRendered(false);
    };
  }, [near, cssWidth, doc, n, onSize]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={`Pagina ${n} din ${total}`}
      data-page={n}
      className="relative flex-shrink-0 overflow-hidden shadow-[var(--elev-2)]"
      style={{
        width: cssWidth,
        height: cssHeight,
        background: '#fff',
        outline: `1px solid ${theme.border}`,
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: rendered ? 'block' : 'none' }} />
      {!rendered && (
        <span className="absolute inset-0 flex items-center justify-center text-[12px] tabular-nums" style={{ color: '#8a8a8f' }}>
          {n}
        </span>
      )}
    </div>
  );
}
