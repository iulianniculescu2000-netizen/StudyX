import { lazy, Suspense } from 'react';
import type { MarkdownRendererProps } from './MarkdownRenderer';

// react-markdown, remark and the diagram code stay out of the main bundle until a reply is shown.
const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'));

/** Plain text stand-in while the renderer chunk loads (React escapes it). */
function Fallback({ content, className = '', style }: Pick<MarkdownRendererProps, 'content' | 'className' | 'style'>) {
  return <div className={`ai-rich-text ai-md ${className}`.trim()} style={{ ...style, whiteSpace: 'pre-wrap' }}>{content}</div>;
}

/** Safe markdown for every AI surface: tables, task lists, formulas, mermaid schemas. */
export default function AIMarkdown(props: MarkdownRendererProps) {
  if (!props.content) return null;
  return (
    <Suspense fallback={<Fallback content={props.content} className={props.className} style={props.style} />}>
      <MarkdownRenderer {...props} />
    </Suspense>
  );
}
