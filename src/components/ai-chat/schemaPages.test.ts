import { afterEach, describe, expect, it, vi } from 'vitest';
import { DIAGRAM_RULES_COMPACT } from '../../ai/diagramRules';
import { estimateTextTokens } from '../../lib/ai/tokenBudget';
import { renderDiagramBlock } from './diagram';
import { parseSchema } from './schemaDsl';
import { attachSchemaInteraction } from './schemaInteraction';
import { citationForPage, openSchemaPage, pageStatusFor } from './schemaPages';
import { OPEN_BOOK_EVENT, type OpenBookDetail } from './citations';

const pageOf = (source: string, label: string) => parseSchema(source)!.nodes.find((node) => node.label === label);

describe('schema step pages: parser', () => {
  const base = '! Durere\n~ ECG';

  it('reads a page at the end of the label or of the note', () => {
    const parsed = parseSchema(`${base}\n+ Aspirină (p. 350)\n= Gata | notă scurtă (p. 12)`)!;
    const aspirin = parsed.nodes.find((node) => node.label === 'Aspirină')!;
    expect(aspirin.page).toBe('350');
    expect(aspirin.note).toBeUndefined();
    const done = parsed.nodes.find((node) => node.label === 'Gata')!;
    expect(done.page).toBe('12');
    expect(done.note).toBe('notă scurtă');
  });

  it('reads an interval and normalizes the dash', () => {
    expect(pageOf(`${base}\n+ Pas | nota (p. 350-351)`, 'Pas')?.page).toBe('350–351');
    expect(pageOf(`${base}\n+ Pas (pp. 350–351)`, 'Pas')?.page).toBe('350–351');
  });

  it('keeps "p." inside a label, without parentheses, or in a backwards interval', () => {
    expect(pageOf(`${base}\n+ Vezi p. 350 din Kumar`, 'Vezi p. 350 din Kumar')?.page).toBeUndefined();
    expect(pageOf(`${base}\n+ Doza p. 350 (zilnic)`, 'Doza p. 350 (zilnic)')?.page).toBeUndefined();
    expect(pageOf(`${base}\n+ Pas (p. 351-350)`, 'Pas (p. 351-350)')?.page).toBeUndefined();
    expect(pageOf(`${base}\n+ Pas (p. 350) final`, 'Pas (p. 350) final')?.page).toBeUndefined();
  });

  it('has no page when none is written', () => {
    expect(parseSchema(`${base}\n+ Pas`)!.nodes.every((node) => node.page === undefined)).toBe(true);
  });
});

describe('schema step pages: drawing', () => {
  const source = '! Durere toracică\n~ ECG (p. 350)\n+ Aspirină | doză de încărcare (p. 351)';
  const none = renderDiagramBlock(source, 'schema')!;

  it('draws the pill and puts the page in the aria-label', () => {
    expect(none).toContain('>p. 350<');
    expect(none).toMatch(/aria-label="Investigație: ECG\. Pagina 350"/);
    expect(none).toContain('data-page="350" data-page-state="info"');
  });

  it('exports without external CSS: only inline attributes, no class-dependent styling', () => {
    const pill = /<g class="sx-pg"[\s\S]*?<\/g>/.exec(none)![0];
    expect(pill).not.toContain('<style');
    expect(pill).toContain('fill="currentColor"');
    expect(pill).not.toMatch(/style=/);
  });

  it('with sources, draws a link only for pages inside a cited fragment and hides the rest', () => {
    const status = pageStatusFor([{ source: 'Kumar.pdf', page: 360, pageEnd: 361, printedPage: 350 }]);
    const svg = renderDiagramBlock(source, 'schema', { pageStatus: status })!;
    expect(svg).toContain('data-page="350" data-page-state="ok"');
    expect(svg).toContain('data-page="351" data-page-state="ok"');
    const none2 = renderDiagramBlock(source, 'schema', { pageStatus: pageStatusFor([{ source: 'Kumar.pdf', page: 10 }]) })!;
    expect(none2).not.toContain('data-page=');
    expect(none2).not.toContain('Pagina 350');
    expect(none2).not.toContain('sx-pg');
  });
});

describe('schema step pages: opening the book', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const citations = [{ source: 'Kumar.pdf', sourceId: 's1', page: 360, pageEnd: 361, printedPage: 350, excerpt: 'text' }];

  it('narrows the citation to the exact page', () => {
    expect(citationForPage(citations, '351')).toMatchObject({ page: 361, printedPage: 351, sourceId: 's1' });
    expect(citationForPage(citations, '352')).toBeUndefined();
    expect(citationForPage(citations, '350–351')).toMatchObject({ page: 360, printedPage: 350 });
    expect(citationForPage([{ source: 'x', page: 5, pageEnd: 7 }], '6')).toMatchObject({ page: 6 });
  });

  it('dispatches the same event the chat chips use', () => {
    const seen = vi.fn();
    const listener = (event: Event) => seen((event as CustomEvent<OpenBookDetail>).detail);
    window.addEventListener(OPEN_BOOK_EVENT, listener);
    expect(openSchemaPage(citations, '350')).toBe(true);
    expect(openSchemaPage(citations, '999')).toBe(false);
    window.removeEventListener(OPEN_BOOK_EVENT, listener);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0]).toMatchObject({ sourceName: 'Kumar.pdf', pdfPage: 360, printedPage: 350 });
  });

  function mount(state: 'ok' | 'info', onOpenPage?: (page: string) => void) {
    const c = document.createElement('div');
    c.innerHTML = `<svg><g class="sx-node" data-id="a" data-path="a" data-note="Nota" data-page="350" data-page-state="${state}" tabindex="0" role="button"></g></svg>`;
    document.body.appendChild(c);
    attachSchemaInteraction(c, { onOpenPage });
    return c;
  }

  it('Enter pins a popover whose button opens the page', () => {
    const open = vi.fn();
    const c = mount('ok', open);
    const node = c.querySelector('.sx-node')!;
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const button = c.querySelector<HTMLButtonElement>('.sx-pop button')!;
    expect(button.textContent).toBe('Deschide în carte, p. 350');
    button.click();
    expect(open).toHaveBeenCalledWith('350');
  });

  it('stays informative (no button) without a handler or when unverified', () => {
    for (const c of [mount('ok'), mount('info', vi.fn())]) {
      c.querySelector('.sx-node')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(c.querySelector('.sx-pop button')).toBeNull();
      expect(c.querySelector('.sx-pop')!.textContent).toContain('Pagina 350');
    }
  });
});

describe('prompt', () => {
  it('teaches the page format without inviting invention, within the token budget', () => {
    expect(DIAGRAM_RULES_COMPACT).toContain('(p. N)');
    expect(DIAGRAM_RULES_COMPACT).toContain('nu inventa pagini');
    expect(estimateTextTokens(DIAGRAM_RULES_COMPACT)).toBeLessThanOrEqual(150);
  });
});
