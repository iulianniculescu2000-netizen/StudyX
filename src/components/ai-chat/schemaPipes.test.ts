import { describe, expect, it } from 'vitest';
import { parseSchema } from './schemaDsl';

describe('parseSchema: frați și etichete cu |', () => {
  it('`a | b | c` pe o linie produce frați care pornesc din același părinte', () => {
    const parsed = parseSchema('Sindrom\n  Nefrotic | Nefritic | Mixt')!;
    const id = (label: string) => parsed.nodes.find((node) => node.label === label)!.id;
    expect(parsed.nodes.map((node) => node.label)).toEqual(['Sindrom', 'Nefrotic', 'Nefritic', 'Mixt']);
    const pairs = parsed.edges.map((edge) => `${edge.from}>${edge.to}`);
    expect(pairs).toEqual([`${id('Sindrom')}>${id('Nefrotic')}`, `${id('Sindrom')}>${id('Nefritic')}`, `${id('Sindrom')}>${id('Mixt')}`]);
  });

  it('frații cu marcaje diferite rămân frați, iar o notă simplă rămâne notă', () => {
    const sib = parseSchema('? Șoc?\n  + Fluide | ~ Lactat')!;
    expect(sib.nodes.length).toBe(3);
    const note = parseSchema('! Alertă | sub 20 min\n. Pas')!;
    expect(note.nodes[0].note).toBe('sub 20 min');
    expect(note.nodes.length).toBe(2);
  });

  it('`| 1> etichetă` devine etichetă de muchie, nu notă', () => {
    const parsed = parseSchema('Cauză\n  | 1> Prima cale Pas A\n  | 2> A doua cale Pas B')!;
    expect(parsed.edges.map((edge) => edge.label)).toEqual(['1', '2']);
    expect(parsed.nodes.map((node) => node.note).filter(Boolean)).toEqual([]);
    const inline = parseSchema('Cauză\n  Pas A | 1> prima cale\n  Pas B | 2> a doua cale')!;
    expect(inline.edges.map((edge) => edge.label)).toEqual(['prima cale', 'a doua cale']);
    expect(inline.nodes.map((node) => node.label)).toEqual(['Cauză', 'Pas A', 'Pas B']);
  });
});
