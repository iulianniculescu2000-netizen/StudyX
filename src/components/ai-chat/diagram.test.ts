import { describe, expect, it } from 'vitest';
import { isDiagramLanguage, parseDiagram, renderDiagramBlock, wrapLabel } from './diagram';
import { formatMessage } from './shared';

describe('parseDiagram', () => {
  it('parses a chain with shapes, direction and edge labels', () => {
    const parsed = parseDiagram(`graph TD
  A([Start]) --> B[Proces]
  B --> C{Decizie?}
  C -->|Da| D[Conduita A]
  C -->|Nu| E((Capcana))`);

    expect(parsed).not.toBeNull();
    expect(parsed!.direction).toBe('TD');
    expect(parsed!.nodes.map((node) => node.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(parsed!.nodes.find((node) => node.id === 'A')!.shape).toBe('terminal');
    expect(parsed!.nodes.find((node) => node.id === 'C')!.shape).toBe('decision');
    expect(parsed!.nodes.find((node) => node.id === 'E')!.shape).toBe('accent');
    expect(parsed!.edges).toHaveLength(4);
    expect(parsed!.edges[2]).toMatchObject({ from: 'C', to: 'D', label: 'Da' });
  });

  it('expands multi-hop chains written on one line', () => {
    const parsed = parseDiagram('flowchart LR\n  A[Cauza] --> B[Efect] --> C[Consecinta]');
    expect(parsed!.direction).toBe('LR');
    expect(parsed!.edges).toEqual([
      { from: 'A', to: 'B', label: undefined, dashed: false },
      { from: 'B', to: 'C', label: undefined, dashed: false },
    ]);
  });

  it('keeps the richest declaration of a node referenced twice', () => {
    const parsed = parseDiagram('graph TD\n A --> B[Eticheta]\n A[Prima] --> C[Alta]');
    expect(parsed!.nodes.find((node) => node.id === 'A')!.label).toBe('Prima');
  });

  it('ignores structural mermaid noise instead of failing', () => {
    const parsed = parseDiagram(`graph TD
  %% comentariu
  classDef rosu fill:#f00
  subgraph Etapa 1
  A[Unu] --> B[Doi]
  end
  style A fill:#fff`);
    expect(parsed!.nodes).toHaveLength(2);
    expect(parsed!.edges).toHaveLength(1);
  });

  it('marks dotted arrows as dashed', () => {
    const parsed = parseDiagram('graph TD\n A[Unu] -.-> B[Doi]');
    expect(parsed!.edges[0].dashed).toBe(true);
  });

  it('returns null when there is no usable graph', () => {
    expect(parseDiagram('graph TD')).toBeNull();
    expect(parseDiagram('doar niste text liber')).toBeNull();
    expect(parseDiagram('')).toBeNull();
  });

  it('survives cycles without hanging', () => {
    const parsed = parseDiagram('graph TD\n A[Unu] --> B[Doi]\n B --> C[Trei]\n C --> A');
    expect(parsed!.edges).toHaveLength(3);
    expect(renderDiagramBlock('graph TD\n A[Unu] --> B[Doi]\n B --> A')).toContain('<svg');
  });
});

describe('wrapLabel', () => {
  it('wraps long labels without silently dropping medical terms or later lines', () => {
    expect(wrapLabel('unu doi trei patru cinci', 10)).toEqual(['unu doi', 'trei patru', 'cinci']);
    expect(wrapLabel('a b c d e f g h i j k l', 1)).toHaveLength(12);
    expect(wrapLabel('psoriazisul-este-o-afectiune-cronica', 10).join('')).toBe('psoriazisul-este-o-afectiune-cronica');
  });
});

describe('renderDiagramBlock', () => {
  it('renders escaped labels into svg text nodes', () => {
    const svg = renderDiagramBlock('graph TD\n A[Risc &lt;script&gt;] --> B[Doi]')!;
    expect(svg).toContain('<svg');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });

  it('gives each render its own gradient id', () => {
    const first = renderDiagramBlock('graph TD\n A[Unu] --> B[Doi]')!;
    const second = renderDiagramBlock('graph TD\n A[Unu] --> B[Doi]')!;
    const idOf = (svg: string) => /linearGradient id="([^"]+)"/.exec(svg)![1];
    expect(idOf(first)).not.toBe(idOf(second));
  });

  it('lets small schemas scale down but keeps wide ones at full size', () => {
    const small = renderDiagramBlock('graph TD\n A[Unu] --> B[Doi]')!;
    expect(small).toContain('max-width:100%');
    expect(small).not.toContain('min-width');

    const wide = renderDiagramBlock([
      'graph TD',
      ...Array.from({ length: 5 }, (_, i) => ` R[Radacina] --> A${i}[Ramura numarul ${i}]`),
      // An edge that doesn't start at the root keeps this a real graph, not a hub.
      ' A0 --> B0[Consecinta finala]',
    ].join('\n'))!;
    expect(wide).toContain('min-width:');
    expect(wide).not.toContain('max-width:100%');
  });

  it('reflows an over-wide left-to-right chain top-down so labels stay readable', () => {
    const chain = Array.from({ length: 9 }, (_, i) => `N${i}[Etapa numarul ${i}]`).join(' --> ');
    const svg = renderDiagramBlock(`graph LR\n ${chain}`)!;
    const [, width, height] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)!.map(Number);
    expect(height).toBeGreaterThan(width);
  });

  /**
   * "Book → chapters" is the most common schema the model produces, and as a
   * plain graph it became a 1500px-wide row of cards crossed by long curves.
   * It is drawn as a bracketed list instead: root left, chapters stacked right.
   */
  it('draws a one-to-many hub as a compact bracketed list', () => {
    const svg = renderDiagramBlock([
      'graph TD',
      ...Array.from({ length: 8 }, (_, i) => ` S[Sinopsis] --> C${i}[Capitolul numarul ${i}]`),
    ].join('\n'))!;

    const [, width] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)!.map(Number);
    expect(width).toBeLessThan(420);
    // Bracket connectors are straight H/V runs; the graph renderer uses curves.
    expect(svg).not.toContain(' C ');
    expect(svg).toContain(' V ');
  });

  it('keeps the graph renderer when the shape is more than a hub', () => {
    const svg = renderDiagramBlock([
      'graph TD',
      ...Array.from({ length: 5 }, (_, i) => ` S[Start] --> C${i}[Ramura ${i}]`),
      ' C0 --> F[Final]',
    ].join('\n'))!;
    expect(svg).toContain(' C ');
  });

  it('does not treat a small branch as a hub', () => {
    const svg = renderDiagramBlock('graph TD\n A[Unu] --> B[Doi]\n A --> C[Trei]')!;
    expect(svg).toContain(' C ');
  });

  it('refuses oversized graphs', () => {
    const lines = Array.from({ length: 45 }, (_, index) => `N${index}[Nod ${index}] --> N${index + 1}[Nod ${index + 1}]`);
    expect(renderDiagramBlock(`graph TD\n${lines.join('\n')}`)).toBeNull();
  });
});

describe('isDiagramLanguage', () => {
  it('accepts the fences we ask the model for', () => {
    expect(isDiagramLanguage('mermaid')).toBe(true);
    expect(isDiagramLanguage('Flowchart')).toBe(true);
    expect(isDiagramLanguage('schema')).toBe(true);
    expect(isDiagramLanguage('json')).toBe(false);
    expect(isDiagramLanguage('')).toBe(false);
  });
});

describe('wide content in a narrow chat column', () => {
  it('marks schemas and tables as zoomable', () => {
    expect(renderDiagramBlock('graph TD\n A[Unu] --> B[Doi]')).toContain('data-sx-zoom');
    expect(formatMessage('| a | b |\n| --- | --- |\n| 1 | 2 |')).toContain('data-sx-zoom');
  });

  it('renders literal <br> in table cells as a line break, not as text', () => {
    const html = formatMessage('| Q | Variante |\n| --- | --- |\n| 1 | A. unu <br> B. doi |');
    expect(html).toContain('A. unu <br/> B. doi');
    expect(html).not.toContain('&lt;br&gt;');
  });

  it('still escapes other tags inside cells', () => {
    const html = formatMessage('| a |\n| --- |\n| <script>x</script> |');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('formatMessage integration', () => {
  it('renders a mermaid fence as svg', () => {
    const html = formatMessage('Uite schema:\n\n```mermaid\ngraph TD\n A([Start]) --> B[Proces]\n```\n\nGata.');
    expect(html).toContain('<svg');
    expect(html).toContain('Proces');
    expect(html).toContain('Gata.');
  });

  it('falls back to a code block when the diagram is unparsable', () => {
    const html = formatMessage('```mermaid\nnimic valid aici\n```');
    expect(html).not.toContain('<svg');
    expect(html).toContain('<pre');
  });

  it('leaves non-diagram code blocks untouched', () => {
    const html = formatMessage('```json\n{"a":1}\n```');
    expect(html).toContain('<pre');
  });
});
