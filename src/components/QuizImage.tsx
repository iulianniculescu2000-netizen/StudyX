import { useEffect, useState, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, X, ImageOff } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { getFlashcardImage, isFlashcardImageRef } from '../lib/flashcardImageStore';
import Portal from './Portal';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';

interface QuizImageProps {
  src: string;
  alt?: string;
  /** Max height in px of the inline image. Default: 240 */
  maxHeight?: number;
  /** Disable the click-to-zoom lightbox. Default: false */
  noLightbox?: boolean;
  variant?: 'default' | 'flashcard' | 'compact';
  className?: string;
}

function normalizeImageSrc(src: string) {
  return src.trim();
}

function ImageSkeleton({ maxHeight }: { maxHeight: number }) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  return (
    <motion.div
      animate={calmMotion ? undefined : { opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        width: '100%',
        height: Math.max(96, maxHeight * 0.6),
        background: theme.surface2,
        borderRadius: 'var(--r-lg)',
        opacity: calmMotion ? 0.55 : undefined,
      }}
    />
  );
}

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const { calmMotion, t } = useAdaptiveMotion();
  const dialogRef = useFocusTrap(true, onClose);
  useScrollLock(true);
  const [zoom, setZoom] = useState(false);
  const [pos, setPosition] = useState({ x: 50, y: 50 });

  const handleMouseMove = (event: MouseEvent<HTMLImageElement>) => {
    if (!zoom) return;
    const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - left) / width) * 100;
    const y = ((event.clientY - top) / height) * 100;
    setPosition({ x, y });
  };

  return (
    <motion.div
      key="lightbox-backdrop"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: t.modal }}
      exit={{ opacity: 0, transition: t.modalExit }}
      onClick={onClose}
      className="fixed inset-0 z-[19999] flex cursor-[var(--cursor-zoom-out,zoom-out)] items-center justify-center bg-black/90 p-6 backdrop-blur-[var(--blur-2)]"
    >
      <motion.button
        whileHover={calmMotion ? undefined : { scale: 1.05 }}
        whileTap={calmMotion ? undefined : { scale: 0.97 }}
        onClick={onClose}
        aria-label="Închide imaginea"
        className="absolute right-6 top-6 z-[20000] flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white backdrop-blur-md focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]"
      >
        <X size={24} />
      </motion.button>

      <div className="relative max-h-[90vh] max-w-[95vw] overflow-hidden rounded-[var(--r-md)]" style={{ boxShadow: 'var(--elev-4)' }}>
        <motion.img
          initial={{ scale: 0.985, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, transition: t.modal }}
          src={normalizeImageSrc(src)}
          alt={alt}
          onMouseMove={handleMouseMove}
          onClick={(event) => {
            event.stopPropagation();
            setZoom((current) => !current);
          }}
          className={`transition-transform duration-300 ${zoom ? 'scale-[2.5] cursor-[var(--cursor-zoom-out,zoom-out)]' : 'cursor-[var(--cursor-zoom-in,zoom-in)]'}`}
          style={{
            maxHeight: '85vh',
            maxWidth: '92vw',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            transformOrigin: `${pos.x}% ${pos.y}%`,
          }}
          decoding="async"
        />
        {!zoom && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white backdrop-blur-md">
            Click pentru lupa medicala
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function QuizImage({
  src,
  alt = 'Imagine întrebare',
  maxHeight = 240,
  noLightbox = false,
  variant = 'default',
  className = '',
}: QuizImageProps) {
  const theme = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const isRef = isFlashcardImageRef(src);
  const [idb, setIdb] = useState<{ key: string; data: string | null }>({ key: '', data: null });

  // Visual decks store their photos in IndexedDB; resolve the `idb:` pointer to a data URL.
  useEffect(() => {
    if (!isRef) return undefined;
    let cancelled = false;
    getFlashcardImage(src)
      .then((dataUrl) => { if (!cancelled) setIdb({ key: src, data: dataUrl }); })
      .catch(() => { if (!cancelled) setIdb({ key: src, data: null }); });
    return () => { cancelled = true; };
  }, [src, isRef]);

  const idbResolved = isRef && idb.key === src;
  const resolvedSrc = isRef ? (idbResolved ? (idb.data ?? '') : '') : src;
  const showError = error || (idbResolved && !idb.data);

  const openLightbox = (event: MouseEvent<HTMLDivElement>) => {
    if (!noLightbox && loaded && !showError) {
      event.stopPropagation();
      setLightbox(true);
    }
  };

  const frameRadius = variant === 'flashcard' ? 'var(--r-lg)' : variant === 'compact' ? 'var(--r-sm)' : 'var(--r-md)';
  const imageRadius = variant === 'flashcard' ? 'var(--r-lg)' : 'var(--r-sm)';
  const framePadding = variant === 'flashcard' ? 10 : variant === 'compact' ? 6 : 8;
  const shadow = variant === 'flashcard'
    ? 'inset 0 1px 0 var(--glass-highlight), var(--elev-2)'
    : 'inset 0 1px 0 var(--glass-highlight), var(--elev-1)';

  return (
    <>
      <div
        className={className}
        style={{
          position: 'relative',
          display: 'grid',
          placeItems: 'center',
          width: '100%',
          maxHeight: maxHeight + framePadding * 2,
          padding: loaded && !showError ? framePadding : 0,
          borderRadius: frameRadius,
          overflow: 'hidden',
          border: `1px solid ${theme.border}`,
          background: theme.isDark
            ? 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.22))'
            : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(247,248,252,0.82))',
          boxShadow: shadow,
          cursor: !noLightbox && loaded && !showError ? 'var(--cursor-zoom-in, zoom-in)' : 'default',
        }}
        onClick={openLightbox}
      >
        {!loaded && !showError && (
          <div style={{ width: '100%', padding: '12px' }}>
            <ImageSkeleton maxHeight={maxHeight} />
          </div>
        )}

        {!showError && resolvedSrc && (
          <img
            src={normalizeImageSrc(resolvedSrc)}
            alt={alt}
            style={{
              display: 'block',
              opacity: loaded ? 1 : 0,
              position: loaded ? 'static' : 'absolute',
              width: 'auto',
              height: 'auto',
              maxWidth: '100%',
              maxHeight,
              objectFit: 'contain',
              borderRadius: imageRadius,
            }}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setError(true);
              setLoaded(true);
            }}
            loading="eager"
            decoding="async"
          />
        )}

        {showError && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '24px 16px',
              color: theme.text3,
            }}
          >
            <ImageOff size={22} />
            <span style={{ fontSize: 12 }}>Imaginea nu s-a putut încărca</span>
          </div>
        )}

        {!noLightbox && loaded && !showError && (
          <div
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.48)',
              color: '#fff',
              fontSize: 11,
              backdropFilter: 'blur(6px)',
              pointerEvents: 'none',
            }}
          >
            <ZoomIn size={11} />
            <span>Zoom</span>
          </div>
        )}
      </div>

      {!noLightbox && (
        <Portal>
          <AnimatePresence>
            {lightbox && resolvedSrc && (
              <Lightbox src={resolvedSrc} alt={alt} onClose={() => setLightbox(false)} />
            )}
          </AnimatePresence>
        </Portal>
      )}
    </>
  );
}
