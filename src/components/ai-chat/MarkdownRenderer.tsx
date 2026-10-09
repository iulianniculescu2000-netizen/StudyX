import { Children, isValidElement, memo, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, Maximize2 } from 'lucide-react';
import { bookOfSourceName } from '../../lib/curriculum';
import { useTheme } from '../../theme/ThemeContext';
import { copyText } from './diagramExport';
import { BR_MARK, hasMath, isDiagramLang, isMermaidSource, normalizeMarkdown, safeUrl, splitMarkdownBlocks } from './markdown';
import { CitationsContext, DiagramActionsContext, StreamingBlockContext, type DiagramActions } from './markdownContext';
import { citationAriaLabel, citationLabel, openBookCitation } from './citations';
import { parseInlineCitations } from '../../ai/contextBuilder';
import type { Citation } from './shared';
import { useMathPlugins, type MathPlugins } from './mathLoader';
import MermaidBlock from './MermaidBlock';
import { asciiFlowToMermaid, isPlainFenceLang } from './asciiFlow';
import ZoomModal from './ZoomModal';

type RehypePlugins = NonNullable<Options['rehypePlugins']>;

// ── Plugins ──────────────────────────────────────────────────────────────────

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** Turns the BR_MARK placeholder (a literal `<br>` the model typed) into real `<br>` elements. */
function rehypeBreaks() {
  const walk = (node: HastNode) => {
    if (!node.children || node.tagName === 'code' || node.tagName === 'pre') return;
    const next: HastNode[] = [];
    for (const child of node.children) {
      if (child.type === 'text' && child.value?.includes(BR_MARK)) {
        child.value.split(BR_MARK).forEach((part, index) => {
          if (index > 0) next.push({ type: 'element', tagName: 'br', properties: {}, children: [] });
          if (part) next.push({ type: 'text', value: part });
        });
      } else {
        walk(child);
        next.push(child);
      }
    }
    node.children = next;
  };
  return (tree: HastNode) => walk(tree);
}

const NO_CITE_PARENTS = new Set(['code', 'pre', 'a', 'button', 'cite-chip']);

/** Turns `[1]`, `[1, 3]`, `[2-4]` in plain text into `cite-chip` elements (never inside code or links). */
function rehypeCitations(options: { citations: readonly Citation[] }) {
  const sources = options.citations.filter((citation): citation is Citation & { n: number } => typeof citation.n === 'number');
  const walk = (node: HastNode) => {
    if (!node.children || (node.tagName && NO_CITE_PARENTS.has(node.tagName))) return;
    const next: HastNode[] = [];
    for (const child of node.children) {
      if (child.type === 'text' && child.value && child.value.includes('[')) {
        for (const segment of parseInlineCitations(child.value, sources)) {
          if (segment.type === 'text') {
            next.push({ type: 'text', value: segment.text });
          } else {
            for (const source of segment.sources) {
              next.push({ type: 'element', tagName: 'cite-chip', properties: { dataN: String(source.n) }, children: [] });
            }
          }
        }
      } else {
        walk(child);
        next.push(child);
      }
    }
    node.children = next;
  };
  return (tree: HastNode) => (sources.length > 0 ? walk(tree) : undefined);
}

/** Inline numbered source chip: shows "Kumar, p. 1136 (Titlu)" and opens the book page on click. */
function CiteChip({ n }: { n: number }) {
  const citations = useContext(CitationsContext);
  const citation = citations.find((entry) => entry.n === n);
  if (!citation) return <span>{`[${n}]`}</span>;
  const label = citationLabel(citation);
  const canOpen = citation.page !== undefined || citation.printedPage !== undefined || bookOfSource(citation.source);
  if (!canOpen) return <span className="ai-md-cite ai-md-cite-static" title={citation.excerpt}><span className="ai-md-cite-n">{n}</span>{label}</span>;
  return (
    <button
      type="button"
      className="ai-md-cite"
      aria-label={citationAriaLabel(citation)}
      title={citation.excerpt}
      onClick={() => openBookCitation(citation)}
    >
      <span className="ai-md-cite-n">{n}</span>
      {label}
    </button>
  );
}

function bookOfSource(source: string) {
  return bookOfSourceName(source) !== null;
}

const REMARK_BASE: NonNullable<Options['remarkPlugins']> = [[remarkGfm, { singleTilde: false }]];
const REHYPE_BASE: RehypePlugins = [rehypeBreaks];

// ── Components ───────────────────────────────────────────────────────────────

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return '';
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className="ai-md-copy fine-row"
      aria-label={label}
      onClick={async () => {
        if (!(await copyText(text))) return;
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      <span>{copied ? 'Copiat' : 'Copiază'}</span>
    </button>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="ai-md-code">
      <div className="ai-md-code-bar">
        <span>{lang || 'cod'}</span>
        <CopyButton text={code} label="Copiază codul" />
      </div>
      <pre className="ai-md-pre"><code>{code}</code></pre>
    </div>
  );
}

function Pre({ children }: { children?: ReactNode }) {
  const streamingOpen = useContext(StreamingBlockContext);
  const child = Children.toArray(children)[0];
  if (!isValidElement(child)) return <pre>{children}</pre>;
  const props = child.props as { className?: string; children?: ReactNode };
  const lang = /language-(\S+)/.exec(props.className ?? '')?.[1] ?? '';
  const code = nodeText(props.children).replace(/\n$/, '');
  if (isDiagramLang(lang) || isMermaidSource(lang, code)) {
    return <MermaidBlock code={code} lang={lang} incomplete={streamingOpen} />;
  }
  if (isPlainFenceLang(lang)) {
    const flow = asciiFlowToMermaid(code);
    if (flow) return <MermaidBlock code={flow} lang="mermaid" incomplete={streamingOpen} />;
  }
  return <CodeBlock lang={lang} code={code} />;
}

function MdTable({ children }: { children?: ReactNode }) {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 2);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const table = el.firstElementChild;
    if (table) observer.observe(table);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="ai-md-table" style={{ borderColor: theme.border }}>
      <div
        ref={scrollRef}
        className="ai-md-table-scroll"
        style={{ cursor: overflowing ? 'var(--cursor-zoom-in, zoom-in)' : undefined }}
        onClick={(event) => {
          if (overflowing && !(event.target as HTMLElement).closest('a')) setOpen(true);
        }}
      >
        <table>{children}</table>
      </div>
      {overflowing && (
        <button type="button" className="ai-md-table-zoom fine-row" onClick={() => setOpen(true)} aria-label="Mărește tabelul pe tot ecranul" style={{ color: theme.text3 }}>
          <Maximize2 size={12} aria-hidden="true" /> Mărește
        </button>
      )}
      {open && (
        <ZoomModal title="Tabel" mode="scroll" onClose={() => setOpen(false)}>
          <div className="ai-md ai-md-table-full"><table>{children}</table></div>
        </ZoomModal>
      )}
    </div>
  );
}

const COMPONENTS: Components = {
  a({ href, children }) {
    const url = safeUrl(href);
    if (!url) return <span>{children}</span>;
    return <a href={url} target="_blank" rel="noopener noreferrer">{children}</a>;
  },
  // Remote images would leak reads to arbitrary hosts and the app is offline-first: keep only the alt text.
  img({ alt }) {
    return alt ? <span className="ai-md-alt">{alt}</span> : null;
  },
  pre: Pre,
  table: MdTable,
  'cite-chip': ({ node }: { node?: HastNode }) => {
    const n = Number(node?.properties?.dataN);
    return Number.isFinite(n) ? <CiteChip n={n} /> : null;
  },
} as Components;

const urlTransform = (url: string) => safeUrl(url);

// ── Chunks + root ────────────────────────────────────────────────────────────

const NO_CITATIONS: readonly Citation[] = [];

const MdChunk = memo(function MdChunk({ text, streamingOpen, math, citations }: { text: string; streamingOpen: boolean; math: MathPlugins | null; citations: readonly Citation[] }) {
  const remark = useMemo(() => (math ? [...REMARK_BASE, ...math.remark] : REMARK_BASE), [math]);
  const rehype = useMemo<RehypePlugins>(() => {
    const base: RehypePlugins = citations.length > 0 ? [...REHYPE_BASE, [rehypeCitations, { citations }]] : REHYPE_BASE;
    return math ? [...base, ...math.rehype] : base;
  }, [math, citations]);
  return (
    <StreamingBlockContext.Provider value={streamingOpen}>
      <ReactMarkdown remarkPlugins={remark} rehypePlugins={rehype} components={COMPONENTS} urlTransform={urlTransform}>
        {text}
      </ReactMarkdown>
    </StreamingBlockContext.Provider>
  );
});

export interface MarkdownRendererProps extends DiagramActions {
  content: string;
  /** The reply is still arriving: diagrams wait for their closing fence. */
  streaming?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Numbered sources of this reply: `[n]` in the text become clickable chips for the ones listed here. */
  citations?: readonly Citation[];
}

/**
 * Model markdown to React nodes (never raw HTML). Top-level blocks are
 * memoised, so while a reply streams only the block being written is parsed
 * again for each token.
 */
export default function MarkdownRenderer({ content, streaming = false, className = '', style, onCreateFlashcards, citations = NO_CITATIONS }: MarkdownRendererProps) {
  const normalized = useMemo(() => normalizeMarkdown(content), [content]);
  const blocks = useMemo(() => splitMarkdownBlocks(normalized), [normalized]);
  const wantsMath = useMemo(() => hasMath(normalized), [normalized]);
  const math = useMathPlugins(wantsMath);
  const actions = useMemo<DiagramActions>(() => ({ onCreateFlashcards }), [onCreateFlashcards]);

  return (
    <DiagramActionsContext.Provider value={actions}>
     <CitationsContext.Provider value={citations}>
      <div className={`ai-rich-text ai-md ${className}`.trim()} style={style}>
        {blocks.map((block, index) => (
          <MdChunk key={index} text={block.text} streamingOpen={streaming && block.open} math={math} citations={citations} />
        ))}
      </div>
     </CitationsContext.Provider>
    </DiagramActionsContext.Provider>
  );
}
