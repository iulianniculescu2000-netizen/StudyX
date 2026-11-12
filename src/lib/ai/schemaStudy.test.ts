import { describe, expect, it } from 'vitest';
import type { ParsedDiagram } from '../../components/ai-chat/diagram';
import { buildSchemaFlashcards, buildSchemaQuestions, schemaNoteId, schemaNoteText, schemaTitle } from './schemaStudy';

const node = (id: string, label: string, shape: 'process' | 'decision' = 'process') => ({ id, label, shape });

const diagram: ParsedDiagram = {
  direction: 'TD',
  title: 'Durere toracică',
  nodes: [
    node('a', 'Durere toracică'),
    node('b', 'ECG cu supradenivelare ST?', 'decision'),
    node('c', 'Angioplastie primară'),
    node('d', 'Troponină seriată'),
    node('e', 'Aspirină'),
    node('f', 'Externare'),
  ],
  edges: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c', label: 'da' },
    { from: 'b', to: 'd', label: 'nu' },
    { from: 'd', to: 'e' },
    { from: 'e', to: 'f' },
  ],
};

let counter = 0;
const id = () => `q${counter++}`;

describe('buildSchemaQuestions', () => {
  it('face din decizie cu două ramuri întrebări cu 5 variante, una corectă, distincte', () => {
    const result = buildSchemaQuestions(diagram, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const q = result.items.find((item) => item.text.includes('= da'));
    expect(q?.text).toBe('Ce urmează dacă ECG cu supradenivelare ST = da?');
    expect(q?.options).toHaveLength(5);
    expect(q?.options.filter((o) => o.isCorrect)).toHaveLength(1);
    expect(q?.options.find((o) => o.isCorrect)?.text).toBe('Angioplastie primară');
    expect(new Set(q?.options.map((o) => o.text.toLowerCase())).size).toBe(5);
    expect(q?.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(q?.explanation).toMatch(/^Din schemă:/);
  });

  it('refuză o schemă prea mică', () => {
    const small = { ...diagram, nodes: diagram.nodes.slice(0, 3), edges: diagram.edges.slice(0, 2) };
    const result = buildSchemaQuestions(small, id);
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.message).toContain('prea mică');
  });

  it('refuză când nu sunt destui distractori', () => {
    const four = { ...diagram, nodes: diagram.nodes.slice(0, 4), edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'da' }, { from: 'b', to: 'd', label: 'nu' }] };
    expect(buildSchemaQuestions(four, id).ok).toBe(false);
  });

  it('deduplică întrebările și etichetele identice', () => {
    const dup: ParsedDiagram = {
      ...diagram,
      nodes: [...diagram.nodes, node('g', 'aspirină'), node('h', 'Externare')],
      edges: [...diagram.edges, { from: 'e', to: 'f' }],
    };
    const result = buildSchemaQuestions(dup, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const texts = result.items.map((item) => item.text.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
    for (const item of result.items) {
      expect(new Set(item.options.map((o) => o.text.toLowerCase())).size).toBe(5);
    }
  });
});

describe('buildSchemaFlashcards', () => {
  it('pune pasul pe față și ce urmează pe verso', () => {
    const result = buildSchemaFlashcards(diagram, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const card = result.items.find((item) => item.text.includes('= nu'));
    expect(card?.options).toEqual([{ id: 'a', text: 'Troponină seriată', isCorrect: true }]);
  });

  it('refuză schema cu un singur pas', () => {
    expect(buildSchemaFlashcards({ ...diagram, nodes: diagram.nodes.slice(0, 1), edges: [] }, id).ok).toBe(false);
  });
});

describe('notiță', () => {
  it('pune sursa într-un bloc de cod și id stabil', () => {
    expect(schemaNoteText('T', 'a -> b')).toBe('T\n\n```schema\na -> b\n```');
    expect(schemaNoteId('x')).toBe(schemaNoteId('x'));
    expect(schemaNoteId('x')).not.toBe(schemaNoteId('y'));
    expect(schemaTitle(diagram)).toBe('Durere toracică');
  });
});
