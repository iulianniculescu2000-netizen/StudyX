import { useContext, useEffect, useMemo, useState } from 'react';
import type { Ref } from 'react';
import { Copy, Check } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { renderDiagramBlock } from './diagram';
import DiagramFrame from './DiagramFrame';
import { copyText, extractSvg } from './diagramExport';
import { isMermaidSource } from './markdown';
import { CitationsContext, DiagramActionsContext } from './markdownContext';
import { openSchemaPage, pageStatusFor } from './schemaPages';
import { peekRendered, renderMermaid } from './mermaidRuntime';
import { currentDiagramSvg } from './diagramOutcome';

interface MermaidBlockProps {
  code: string;
  lang: string;
  /** The fence is still open (model is mid-stream): do not try to draw yet. */
  incomplete: boolean;
}

type Outcome = { key: string; svg: string } | { key: string; failed: true };

/** True while the element is (nearly) on screen; always true without IntersectionObserver. */
function useInView(): [(el: HTMLElement | null) => void, boolean] {
  const supported = typeof IntersectionObserver !== 'undefined';
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!supported || !el) return undefined;
    const observer = new IntersectionObserver((entries) => {
      setSeen(entries.some((entry) => entry.isIntersecting));
    }, { rootMargin: '300px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, supported]);
  return [setEl, supported ? seen : true];
}

function Placeholder({ label, innerRef }: { label: string; innerRef?: Ref<HTMLDivElement> }) {
  const theme = useTheme();
  return (
    <div
      ref={innerRef}
      className="ai-md-diagram-placeholder"
      role="status"
      aria-live="polite"
      style={{ borderColor: theme.border, color: theme.text3, background: theme.surface2 }}
    >
      <span className="ai-md-dot" aria-hidden="true" style={{ background: theme.accent }} />
      {label}
    </div>
  );
}

/** Failure state: short message plus the code, which stays copyable. */
export function DiagramError({ code }: { code: string }) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  return (
    <figure className="ai-md-diagram" style={{ borderColor: theme.border }}>
      <figcaption className="ai-md-diagram-bar" style={{ borderColor: theme.border, color: theme.text3 }}>
        <span className="text-[12px] font-semibold" style={{ color: theme.text2 }}>Schema nu a putut fi desenată</span>
        <button
          type="button"
          className="fine-row inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11.5px] font-semibold transition-colors hover:bg-[var(--hover-fill)]"
          style={{ color: theme.text2 }}
          aria-label="Copiază codul schemei"
          onClick={async () => {
            if (await copyText(code)) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }
          }}
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? 'Copiat' : 'Copiază codul'}
        </button>
      </figcaption>
      <pre className="ai-md-pre" style={{ margin: 0, border: 0, borderRadius: 0 }}><code>{code}</code></pre>
    </figure>
  );
}

/**
 * A ```mermaid fence. mermaid itself is imported on first use; if it cannot
 * draw the diagram, flowcharts fall back to the built-in renderer, and
 * anything else shows the code with a short message.
 */
export default function MermaidBlock({ code, lang, incomplete }: MermaidBlockProps) {
  const theme = useTheme();
  const { onCreateFlashcards } = useContext(DiagramActionsContext);
  const citations = useContext(CitationsContext);
  // Step pages are checked against the sources the model was given; with none, they stay informative (no button).
  const pageOptions = useMemo(() => (citations.length > 0 ? { pageStatus: pageStatusFor(citations) } : {}), [citations]);
  const onOpenPage = useMemo(
    () => (citations.length > 0 ? (page: string) => { openSchemaPage(citations, page); } : undefined),
    [citations],
  );
  const key = `${theme.id}\u0000${code}`;
  const useMermaid = isMermaidSource(lang, code);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [watch, inView] = useInView();
  const cached = useMermaid ? peekRendered(theme.id, code) : undefined;

  useEffect(() => {
    if (incomplete || !useMermaid || peekRendered(theme.id, code)) return undefined;
    let cancelled = false;
    renderMermaid(code, theme, inView ? 'visible' : 'idle')
      .then((svg) => { if (!cancelled) setOutcome({ key, svg }); })
      .catch(() => { if (!cancelled) setOutcome({ key, failed: true }); });
    return () => { cancelled = true; };
    // `theme` identity is stable per theme id; `key` already encodes id + code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, incomplete, useMermaid, inView]);

  const failedHere = outcome?.key === key && 'failed' in outcome;
  const fallbackSvg = useMemo(() => {
    if (incomplete || (useMermaid && !failedHere)) return null;
    const html = renderDiagramBlock(code, lang, pageOptions);
    return html ? extractSvg(html) : null;
  }, [code, lang, incomplete, useMermaid, failedHere, pageOptions]);

  if (incomplete) return <Placeholder label="Se desenează schema…" />;

  const svg = currentDiagramSvg(key, cached, outcome);
  if (svg) return <DiagramFrame svg={svg} code={code} onCreateFlashcards={onCreateFlashcards} />;
  if (fallbackSvg) return <DiagramFrame svg={fallbackSvg} code={code} onCreateFlashcards={onCreateFlashcards} onOpenPage={onOpenPage} />;
  if (failedHere || !useMermaid) return <DiagramError code={code} />;
  return <Placeholder label="Se desenează schema…" innerRef={watch} />;
}
