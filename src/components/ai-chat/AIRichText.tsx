import AIMarkdown from './AIMarkdown';

/**
 * Renders AI-authored text with the chat's markdown pipeline (headings, lists,
 * tables, formulas, schemas) so every AI surface reads the same way.
 *
 * The renderer builds React nodes from the markdown tree and never injects
 * model HTML, so it is safe to feed untrusted text.
 */
export default function AIRichText({
  text,
  className = '',
  style,
}: {
  text: string | null | undefined;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!text?.trim()) return null;
  return <AIMarkdown content={text} className={className} style={style} />;
}
