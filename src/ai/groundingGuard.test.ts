import { describe, expect, it } from 'vitest';
import { citationsForAnswer, stripCitationsAfterGeneralKnowledge, hasGeneralKnowledgeMarker } from './groundingGuard';
import { composeChatSystemPrompt, NOTHING_FOUND_NOTICE, BOOK_MODULE } from './promptKit';

describe('groundingGuard', () => {
  it('recunoaște marcajul cu și fără diacritice', () => {
    expect(hasGeneralKnowledgeMarker('Din cunoștințe generale (nu din cărți): ...')).toBe(true);
    expect(hasGeneralKnowledgeMarker('din cunostinte generale: ...')).toBe(true);
    expect(hasGeneralKnowledgeMarker('Nu am găsit în cărți criteriile CASPAR.')).toBe(true);
    expect(hasGeneralKnowledgeMarker('Metotrexatul se dă o dată pe săptămână [1].')).toBe(false);
  });

  it('scoate [n] doar după marcaj, în același paragraf', () => {
    const text = 'Sulfatul feros se ia pe stomacul gol [2].\n\nDin cunoștințe generale (nu din cărți): se asociază vitamina C [1] [3].';
    expect(stripCitationsAfterGeneralKnowledge(text)).toBe(
      'Sulfatul feros se ia pe stomacul gol [2].\n\nDin cunoștințe generale (nu din cărți): se asociază vitamina C.',
    );
  });

  it('lasă neatins un text fără marcaj', () => {
    const text = 'Fapt [1]. Altul [2, 3].';
    expect(stripCitationsAfterGeneralKnowledge(text)).toBe(text);
  });

  it('ascunde chipurile când răspunsul e doar din cunoștințe generale', () => {
    const cites = [{ n: 1 }, { n: 2 }];
    expect(citationsForAnswer('Din cunoștințe generale (nu din cărți): ...', cites)).toEqual([]);
    expect(citationsForAnswer('Nu am găsit în cărți. Din cunoștințe generale: ...', cites)).toEqual([]);
  });

  it('păstrează chipurile când răspunsul citează fragmente', () => {
    const cites = [{ n: 1 }];
    expect(citationsForAnswer('Fapt [1]. Din cunoștințe generale: altceva.', cites)).toHaveLength(1);
    expect(citationsForAnswer('Răspuns fără marcaj și fără etichete.', cites)).toHaveLength(1);
  });
});

describe('prompt: nimic găsit în carte', () => {
  it('căutare reală fără rezultat: contextul spune explicit că nu s-a găsit nimic', () => {
    const prompt = composeChatSystemPrompt({ hasContext: false, searchedLibrary: true, userMessage: 'criteriile CASPAR' });
    expect(prompt).toContain(NOTHING_FOUND_NOTICE);
    expect(prompt).toContain('Nu am găsit în cărți');
    expect(prompt).not.toContain('fără meta-comentarii despre bibliotecă');
  });

  it('fără căutare în bibliotecă: comportamentul vechi, natural', () => {
    const prompt = composeChatSystemPrompt({ hasContext: false, userMessage: 'salut' });
    expect(prompt).not.toContain(NOTHING_FOUND_NOTICE);
    expect(prompt).toContain('fără meta-comentarii despre bibliotecă');
  });

  it('cu context, nu apare nota „nimic găsit”', () => {
    const prompt = composeChatSystemPrompt({ hasContext: true, searchedLibrary: true, contextSummary: '[1] Kumar · pag. 1 — T\ntext', bookMode: true });
    expect(prompt).not.toContain(NOTHING_FOUND_NOTICE);
  });

  it('modulul de carte cere ca cifrele și pragurile să fie în fragment și separă cunoștințele generale', () => {
    expect(BOOK_MODULE).toContain('doar dacă sunt scrise în fragmentul citat');
    expect(BOOK_MODULE).toContain('Din cunoștințe generale (nu din cărți):');
    expect(BOOK_MODULE).toContain('Nu am găsit în cărți');
  });
});

describe('Doar din cărți (promptKit)', () => {
  it('cu fragmente: adaugă regula strictă la final; fără comutator nu', async () => {
    const { BOOKS_ONLY_RULE } = await import('./promptKit');
    const base = { mode: 'grounded' as const, contextSummary: '[1] Kumar · pag. 1 — Fier\nText', hasContext: true };
    expect(composeChatSystemPrompt({ ...base, booksOnly: true })).toContain(BOOKS_ONLY_RULE);
    expect(composeChatSystemPrompt(base)).not.toContain(BOOKS_ONLY_RULE);
  });
  it('fără fragmente: nota fixă, nu invită la cunoștințe generale', async () => {
    const { BOOKS_ONLY_EMPTY_NOTICE } = await import('./promptKit');
    const prompt = composeChatSystemPrompt({ mode: 'grounded', booksOnly: true });
    expect(prompt).toContain(BOOKS_ONLY_EMPTY_NOTICE);
    expect(prompt).not.toContain(NOTHING_FOUND_NOTICE);
  });
  it('întrebările despre aplicație sunt scutite', async () => {
    const { BOOKS_ONLY_EMPTY_NOTICE, BOOKS_ONLY_RULE } = await import('./promptKit');
    const prompt = composeChatSystemPrompt({ mode: 'grounded', booksOnly: true, appQuestion: true });
    expect(prompt).not.toContain(BOOKS_ONLY_EMPTY_NOTICE);
    expect(prompt).not.toContain(BOOKS_ONLY_RULE);
  });
});

describe('Doar din cărți și prompturile interne', () => {
  it('grila discutată rămâne în prompt și e material valid', () => {
    const prompt = composeChatSystemPrompt({ mode: 'grounded', booksOnly: true, tutorContext: '[CONTEXT TUTOR]\nÎntrebare: X', searchedLibrary: true });
    expect(prompt).toContain('[CONTEXT TUTOR]');
    expect(prompt).toContain('CE DISCUTĂ STUDENTUL ACUM');
    expect(prompt).toContain('rămâne material valid');
  });
});
