/**
 * Shared `studyx:ai-prompt` event payloads for chapter-scoped actions (Discută / Generează
 * grile), so the Knowledge Vault reader and the Residency bookshelf dispatch identically —
 * one place to change the prompt wording or event shape instead of two.
 */

export interface ChapterEventSource {
  id: string;
  name: string;
}

function dispatchChapterEvent(detail: {
  view: 'chat' | 'studio';
  mode: 'explain' | 'summarize';
  source: ChapterEventSource;
  heading: string;
  prompt: string;
  examStyle?: 'residency';
}) {
  window.dispatchEvent(new CustomEvent('studyx:ai-prompt', {
    detail: {
      open: true,
      view: detail.view,
      mode: detail.mode,
      sourceId: detail.source.id,
      sourceName: detail.source.name,
      heading: detail.heading,
      resetConversation: true,
      prompt: detail.prompt,
      examStyle: detail.examStyle,
    },
  }));
}

/**
 * Opens the AI Studio panel with this chapter pre-selected, ready to generate.
 * `examMode` (set by the Residency page, unset from Knowledge Vault's generic
 * chapters) both names "rezidențiat" in the prompt AND sets `examStyle:
 * 'residency'` on the event — the prompt text alone does NOT drive generation
 * here: the Studio's 5-variante/4-variante track is its own manually-toggled
 * state (`studioExamStyle`), read only from free-text agent commands via
 * `detectExamStyle`, not from this structured chapter-generation path. Without
 * the explicit flag, "Generează grile" from Residency silently used whatever
 * track was last toggled (default: 4-option "simple").
 */
export function dispatchGenerateFromChapter(source: ChapterEventSource, heading: string, label: string, examMode = false) {
  dispatchChapterEvent({
    view: 'studio',
    mode: 'summarize',
    source,
    heading,
    examStyle: examMode ? 'residency' : undefined,
    prompt: examMode
      ? `Generează grile de rezidențiat (stil examen, 5 variante A-E) din capitolul "${label}" al documentului "${source.name}".`
      : `Generează grile din capitolul "${label}" al documentului "${source.name}".`,
  });
}

/** Opens the chat with a conversational prompt about this chapter. See `dispatchGenerateFromChapter` for `examMode`. */
export function dispatchDiscussChapter(source: ChapterEventSource, heading: string, label: string, examMode = false) {
  dispatchChapterEvent({
    view: 'chat',
    mode: 'explain',
    source,
    heading,
    prompt: examMode
      ? `Pregătește-mă pentru rezidențiat pe capitolul "${label}" din cartea "${source.name}": ce e mai probabil să apară la examen, ce capcane sunt frecvente, și răspunde-mi la întrebări pe măsură ce le am.`
      : `Hai să discutăm capitolul "${label}" din cartea "${source.name}". Explică-mi ce e important din el și răspunde-mi la întrebări pe măsură ce le am.`,
  });
}
