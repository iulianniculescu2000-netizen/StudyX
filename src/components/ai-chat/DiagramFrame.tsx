import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, Copy, Download, FileImage, Maximize2 } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { copyText, downloadPng, downloadSvg, readSvgSize } from './diagramExport';
import { sanitizeSvg } from './sanitize';
import { attachSchemaInteraction } from './schemaInteraction';
import ZoomModal from './ZoomModal';
import HelpTip from '../ui/HelpTip';

interface DiagramFrameProps {
  /** Already-safe SVG markup (mermaid output or the built-in renderer's SVG). */
  svg: string;
  /** Source shown by "Copiază codul"; omit to hide the button. */
  code?: string;
  /**
   * Optional hook for a later "Fă flashcarduri din schemă" action: when given,
   * a button calls it with the diagram source. Not wired anywhere yet.
   */
  onCreateFlashcards?: (code: string) => void;
}

/** Theme colors the schema renderer reads as CSS variables (with fixed fallbacks for exports). */
function schemaVars(theme: ReturnType<typeof useTheme>): CSSProperties {
  return {
    '--sx-danger': theme.danger,
    '--sx-ok': theme.success,
    '--sx-info': theme.accent,
    '--sx-neutral': theme.text3,
    '--sx-surface': theme.surface,
    '--sx-line': theme.border,
  } as CSSProperties;
}

/**
 * A drawn diagram with a quiet header row (label left, actions right) so the
 * controls never sit on top of the drawing. Click the drawing, or the zoom
 * button, to open the pan/zoom viewer.
 */
export default function DiagramFrame({ svg, code, onCreateFlashcards }: DiagramFrameProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'png' | 'svg' | null>(null);
  const [error, setError] = useState('');
  const copyTimer = useRef<number | undefined>(undefined);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { calmMotion } = useAdaptiveMotion();

  const safe = useMemo(() => sanitizeSvg(svg), [svg]);
  const size = useMemo(() => readSvgSize(safe), [safe]);

  const interactive = useMemo(() => safe.includes('sx-node'), [safe]);
  const summary = useMemo(() => /aria-label="([^"]*)"/.exec(safe)?.[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'), [safe]);

  // Hover/click/keyboard behaviour lives outside the (sanitized, handler-free) markup.
  useEffect(() => {
    const body = bodyRef.current;
    return interactive && body ? attachSchemaInteraction(body) : undefined;
  }, [interactive, safe]);

  const viewerCleanup = useRef<(() => void) | null>(null);
  const viewerRef = useCallback((element: HTMLDivElement | null) => {
    viewerCleanup.current?.();
    viewerCleanup.current = element && interactive ? attachSchemaInteraction(element) : null;
  }, [interactive]);

  const handleCopy = async () => {
    if (!code) return;
    const ok = await copyText(code);
    setCopied(ok);
    window.clearTimeout(copyTimer.current);
    if (ok) copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  const run = async (kind: 'png' | 'svg') => {
    setBusy(kind);
    setError('');
    try {
      if (kind === 'svg') downloadSvg(safe, theme.text);
      else await downloadPng(safe, theme.text, theme.surface);
    } catch {
      setError('Descărcarea nu a reușit. Încearcă SVG.');
    } finally {
      setBusy(null);
    }
  };

  const button = 'fine-row inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11.5px] font-semibold transition-colors hover:bg-[var(--hover-fill)] disabled:opacity-50';

  const actions: ReactNode = (
    <>
      {code && (
        <button type="button" className={button} onClick={() => void handleCopy()} aria-label="Copiază codul schemei" title="Copiază codul schemei">
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          <span className="hidden sm:inline">{copied ? 'Copiat' : 'Cod'}</span>
        </button>
      )}
      <button type="button" className={button} onClick={() => void run('svg')} disabled={busy !== null} aria-label="Descarcă schema ca SVG" title="Descarcă SVG">
        <Download size={14} aria-hidden="true" /><span className="hidden sm:inline">SVG</span>
      </button>
      <button type="button" className={button} onClick={() => void run('png')} disabled={busy !== null} aria-label="Descarcă schema ca PNG" title="Descarcă PNG">
        <FileImage size={14} aria-hidden="true" /><span className="hidden sm:inline">PNG</span>
      </button>
    </>
  );

  return (
    <figure className="ai-md-diagram" style={{ borderColor: theme.border, color: theme.text }}>
      <figcaption className="ai-md-diagram-bar" style={{ borderColor: theme.border, color: theme.text3 }}>
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em]">Schemă</span>
          {interactive && <HelpTip id="chat-diagram" size={16} />}
        </span>
        <span className="flex items-center gap-0.5" style={{ color: theme.text2 }}>
          {actions}
          {onCreateFlashcards && code && (
            <button type="button" className={button} onClick={() => onCreateFlashcards(code)} aria-label="Fă flashcarduri din schemă">
              Flashcarduri
            </button>
          )}
          <button type="button" className={button} onClick={() => setOpen(true)} aria-label="Mărește schema pe tot ecranul" title="Mărește">
            <Maximize2 size={14} aria-hidden="true" /><span className="hidden sm:inline">Mărește</span>
          </button>
        </span>
      </figcaption>
      <div
        ref={bodyRef}
        className={`ai-md-diagram-body${interactive ? ` sx-host${calmMotion ? '' : ' sx-anim'}` : ''}`}
        style={interactive ? schemaVars(theme) : undefined}
        role={interactive ? 'group' : 'img'}
        aria-label={interactive && summary ? summary : 'Schemă desenată din răspunsul AI. Apasă Mărește pentru a o vedea mai mare.'}
        onClick={() => setOpen(true)}
        dangerouslySetInnerHTML={{ __html: safe }}
      />
      {error && <div role="alert" className="px-3 pb-2 text-[11.5px]" style={{ color: theme.danger }}>{error}</div>}
      {open && (
          <ZoomModal title="Schemă" mode="pan" onClose={() => setOpen(false)} actions={actions} contentSize={size}>
            <div
              ref={viewerRef}
              className={`ai-md-diagram-viewer${interactive ? ' sx-host' : ''}`}
              style={{ ...(interactive ? schemaVars(theme) : {}), width: `min(${Math.min(size.width * 1.4, 1220)}px, calc(100vw - 96px))` }}
              dangerouslySetInnerHTML={{ __html: safe }}
            />
          </ZoomModal>
      )}
    </figure>
  );
}
