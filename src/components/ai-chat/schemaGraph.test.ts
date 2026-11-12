import { describe, expect, it } from 'vitest';
import { DIAGRAM_RULES_COMPACT, SCHEMA_MAX_NODES as RULES_MAX, SCHEMA_PROMPT_NODES } from '../../ai/diagramRules';
import { findBackEdges, orderLayers, renderDiagramBlock } from './diagram';
import { SCHEMA_MAX_NODES, parseSchema } from './schemaDsl';

const edgeKeys = (source: string) => {
  const parsed = parseSchema(source)!;
  const label = new Map(parsed.nodes.map((node) => [node.id, node.label]));
  return parsed.edges.map((edge) => `${label.get(edge.from)}>${label.get(edge.to)}`);
};

describe('limite schemă', () => {
  it('promptul cere mai puțin decât acceptă parserul, dintr-o singură sursă', () => {
    expect(SCHEMA_MAX_NODES).toBe(RULES_MAX);
    expect(SCHEMA_PROMPT_NODES).toBeLessThan(SCHEMA_MAX_NODES);
    expect(DIAGRAM_RULES_COMPACT).toContain(`max ${SCHEMA_PROMPT_NODES} noduri`);
  });

  it('taie pe ramuri: începutul fiecărei ramuri apare înaintea adâncimii altora', () => {
    const deep = Array.from({ length: 14 }, (_, i) => `${'  '.repeat(i + 2)}. Adânc ${i + 1}`).join('\n');
    const source = `? Decizie?\n  da> . Ramura da\n${deep}\n  nu> . Ramura nu\n    . Copil nu`;
    const parsed = parseSchema(source)!;
    const labels = parsed.nodes.map((node) => node.label);
    expect(parsed.nodes.length).toBeLessThanOrEqual(SCHEMA_MAX_NODES);
    expect(labels).toContain('Ramura nu');
    expect(labels).toContain('Copil nu');
    expect(parsed.notice).toMatch(/din \d+ pași/);
  });

  it('nu are notificare sub plafon', () => {
    expect(parseSchema('. A\n. B\n. C')!.notice).toBeUndefined();
  });
});

describe('@referințe în schemă', () => {
  it('buclă înapoi: săgeată spre un pas existent, fără nod nou', () => {
    const source = '~ ECG\n? Normal?\n  da> = Externare\n  nu> + Tratament\n    @ecg';
    const parsed = parseSchema(source)!;
    expect(parsed.nodes).toHaveLength(4);
    expect(edgeKeys(source)).toContain('Tratament>ECG');
  });

  it('referință în față, fără diacritice și fără majuscule', () => {
    const source = '? Stabil?\n  da> @externare\n  nu> + Resuscitare\n= Externare';
    expect(edgeKeys(source)).toContain('Stabil?>Externare');
    expect(parseSchema(source)!.nodes).toHaveLength(3);
  });

  it('potrivire „conține” unică; ambiguă sau lipsă se ignoră fără eroare', () => {
    expect(edgeKeys('. Evaluare inițială\n. Pas\n  @inițială')).toContain('Pas>Evaluare inițială');
    const lipsa = parseSchema('. A\n. B\n  @inexistent')!;
    expect(lipsa.nodes).toHaveLength(2);
    expect(lipsa.edges).toHaveLength(1);
  });

  it('referința nu consumă din buget', () => {
    const steps = Array.from({ length: SCHEMA_MAX_NODES - 1 }, (_, i) => `. Pas ${i + 1}`).join('\n');
    const parsed = parseSchema(`${steps}\n@pas 1`)!;
    expect(parsed.notice).toBeUndefined();
    expect(parsed.nodes).toHaveLength(SCHEMA_MAX_NODES - 1);
  });

  it('unifică automat rezultatele „=” cu aceeași etichetă', () => {
    const source = '? A?\n  da> ? B?\n    da> = Externare\n    nu> + Tratament\n  nu> = externare';
    const parsed = parseSchema(source)!;
    expect(parsed.nodes.filter((node) => node.label.toLowerCase() === 'externare')).toHaveLength(1);
    const target = parsed.nodes.find((node) => node.label === 'Externare')!;
    expect(parsed.edges.filter((edge) => edge.to === target.id)).toHaveLength(2);
  });

  it('o schemă cu buclă se desenează, cu săgeata înapoi punctată', () => {
    const svg = renderDiagramBlock('~ ECG\n? Normal?\n  da> = Externare\n  nu> + Tratament\n    @ECG', 'schema')!;
    expect(svg).toContain('data-dashed="1"');
  });
});

describe('aranjare', () => {
  it('găsește doar muchia care închide bucla', () => {
    const nodes = ['a', 'b', 'c'].map((id) => ({ id, label: id, shape: 'process' as const }));
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ];
    const back = findBackEdges(nodes, edges);
    expect([...back]).toEqual([edges[2]]);
  });

  it('ordonează stratul după poziția părinților (baricentru)', () => {
    const layers = new Map([
      [0, [{ id: 'p1' }, { id: 'p2' }]],
      [1, [{ id: 'c2' }, { id: 'c1' }]],
    ]);
    orderLayers(layers, [0, 1], [
      { from: 'p1', to: 'c1' },
      { from: 'p2', to: 'c2' },
    ]);
    expect(layers.get(1)!.map((node) => node.id)).toEqual(['c1', 'c2']);
  });
});
