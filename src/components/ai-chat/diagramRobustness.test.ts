import { describe, expect, it } from 'vitest';
import { describeDiagram, parseDiagram, renderDiagramBlock } from './diagram';

const fan = (label: (i: number) => string) =>
  ['graph TD', ...Array.from({ length: 5 }, (_, i) => ` S[Start] -->${label(i)} C${i}[Ramura ${i}]`)].join('\n');

describe('detectHub stability', () => {
  it('keeps the bracketed list when every arc carries the same decorative label', () => {
    const svg = renderDiagramBlock(fan(() => '|include|'))!;
    expect(svg).not.toContain(' C ');
  });
  it('stays a graph when labels tell the branches apart', () => {
    const svg = renderDiagramBlock(fan((i) => (i % 2 ? '|da|' : '|nu|')))!;
    expect(svg).toContain(' C ');
  });
  it('stays a graph when only one arc is labelled', () => {
    const svg = renderDiagramBlock(fan((i) => (i === 0 ? '|da|' : '')))!;
    expect(svg).toContain(' C ');
  });
});

describe('parseDiagram groups and keywords', () => {
  const src = `graph TD
  subgraph Urgenta
    A[Durere] --> B{ST?}
  end
  B -->|da| C[Reperfuzie]
  style A fill:#f00
  click A callback`;

  it('keeps nodes and edges inside a subgraph and warns about the lost groups', () => {
    const parsed = parseDiagram(src)!;
    expect(parsed.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C']);
    expect(parsed.edges).toHaveLength(2);
    expect(parsed.notice).toBe('Grupurile din schemă nu sunt afișate');
  });
  it('sets no notice without subgraph', () => {
    expect(parseDiagram('graph TD\n A --> B\n style A fill:#f00')!.notice).toBeUndefined();
  });
  it('does not swallow nodes whose id starts with a keyword', () => {
    const parsed = parseDiagram('graph TD\n style1[Unu] --> endocard[Doi]\n classA --> click2')!;
    expect(parsed.nodes.map((n) => n.id)).toEqual(['style1', 'endocard', 'classA', 'click2']);
  });
});

describe('describeDiagram links', () => {
  it('describes relations with branch labels', () => {
    const parsed = parseDiagram('graph TD\n A{Supradenivelare ST?} -->|da| B[Reperfuzie]\n A -->|nu| C[Troponină]')!;
    expect(describeDiagram(parsed)).toContain('Supradenivelare ST? duce la: Reperfuzie (da), Troponină (nu)');
  });
  it('stays within 900 characters and keeps some links on big schemas', () => {
    const lines = Array.from({ length: 24 }, (_, i) => ` N${i}[Pas lung numarul ${i} cu text] --> N${i + 1}[Pas lung numarul ${i + 1} cu text]`);
    const text = describeDiagram(parseDiagram(`graph TD\n${lines.join('\n')}`)!);
    expect(text.length).toBeLessThanOrEqual(900);
    expect(text).toContain('Legături:');
  });
});
