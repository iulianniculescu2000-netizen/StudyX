import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderMermaid = vi.hoisted(() => vi.fn());

vi.mock('./mermaidRuntime', async (importOriginal) => {
  const original = await importOriginal<typeof import('./mermaidRuntime')>();
  return { ...original, renderMermaid, peekRendered: () => undefined };
});

import MarkdownRenderer from './MarkdownRenderer';

beforeEach(() => {
  renderMermaid.mockReset();
});

describe('MarkdownRenderer: safety', () => {
  it('never turns model HTML into elements', () => {
    const { container } = render(
      <MarkdownRenderer
        content={'<script>window.__pwned = 1</script>\n\n<img src=x onerror="window.__pwned = 2">\n\n<b onclick="x()">bold</b>'}
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('[onerror], [onclick]')).toBeNull();
    // Shown as inert text instead of being silently swallowed.
    expect(container.textContent).toContain('<script>');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('renders only http(s) links, opened safely', () => {
    const { container } = render(
      <MarkdownRenderer content={'[ok](https://example.com) [bad](javascript:alert(1)) [data](data:text/html;base64,AAAA) [rel](/relative)'} />,
    );
    const anchors = [...container.querySelectorAll('a')];
    expect(anchors).toHaveLength(1);
    expect(anchors[0].getAttribute('href')).toBe('https://example.com');
    expect(anchors[0].getAttribute('target')).toBe('_blank');
    expect(anchors[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.textContent).toContain('bad');
    expect(container.innerHTML).not.toContain('javascript:');
  });

  it('drops remote images and keeps their alt text', () => {
    const { container } = render(<MarkdownRenderer content={'![grafic](https://tracker.example/x.png)'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('grafic');
  });
});

describe('MarkdownRenderer: structure', () => {
  it('renders gfm tables, task lists and code with a copy button', () => {
    const { container } = render(
      <MarkdownRenderer
        content={'| A | B |\n|---|---|\n| 1<br>2 | 3 |\n\n- [x] gata\n- [ ] de făcut\n\n```js\nconst a = 1;\n```'}
      />,
    );
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('td br')).not.toBeNull();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(container.querySelector('pre code')?.textContent).toBe('const a = 1;');
    expect(screen.getByRole('button', { name: 'Copiază codul' })).toBeTruthy();
  });

  it('renders math through the lazy KaTeX chunk', async () => {
    const { container } = render(<MarkdownRenderer content={'Energia $E = mc^2$ și\n\n$$\\frac{a}{b}$$'} />);
    await vi.waitFor(() => expect(container.querySelector('.katex')).not.toBeNull(), { timeout: 8000 });
    expect(container.querySelector('.katex-display')).not.toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });
});

describe('MarkdownRenderer: diagrams', () => {
  const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

  it('waits for the closing fence while streaming', async () => {
    render(<MarkdownRenderer streaming content={'Uite schema:\n\n```mermaid\ngraph TD\nA-->'} />);
    await flush();
    expect(screen.getByText('Se desenează schema…')).toBeTruthy();
    expect(renderMermaid).not.toHaveBeenCalled();
  });

  it('draws a finished diagram with zoom, download and copy actions', async () => {
    renderMermaid.mockResolvedValue('<svg viewBox="0 0 100 50"><text>Salut</text></svg>');
    render(<MarkdownRenderer content={'```mermaid\ngraph TD\nA-->B\n```'} />);
    await flush();
    expect(renderMermaid).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Salut')).toBeTruthy();
    for (const name of ['Mărește schema pe tot ecranul', 'Descarcă schema ca PNG', 'Descarcă schema ca SVG', 'Copiază codul schemei']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('falls back to the built-in renderer for a flowchart mermaid cannot draw', async () => {
    renderMermaid.mockRejectedValue(new Error('parse'));
    const { container } = render(<MarkdownRenderer content={'```mermaid\ngraph TD\nA[Start] --> B[Final]\n```'} />);
    await flush();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toContain('Start');
    expect(screen.queryByText('Schema nu a putut fi desenată')).toBeNull();
  });

  it('shows a short message and the code when nothing can draw it', async () => {
    renderMermaid.mockRejectedValue(new Error('parse'));
    const { container } = render(<MarkdownRenderer content={'```mermaid\nsequenceDiagram\nA->>B: salut\n```'} />);
    await flush();
    expect(screen.getByText('Schema nu a putut fi desenată')).toBeTruthy();
    expect(container.querySelector('pre code')?.textContent).toContain('sequenceDiagram');
    expect(screen.getByRole('button', { name: 'Copiază codul schemei' })).toBeTruthy();
  });
});
