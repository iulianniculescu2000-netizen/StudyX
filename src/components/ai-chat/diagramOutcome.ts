type Outcome = { key: string; svg: string } | { key: string; failed: true };

/** A completed render may arrive after the user edits the prompt or switches theme. */
export function currentDiagramSvg(key: string, cached: string | undefined, outcome: Outcome | null): string | null {
  return cached ?? (outcome?.key === key && 'svg' in outcome ? outcome.svg : null);
}
