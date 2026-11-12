import { describe, expect, it } from 'vitest';
import { createSearchIndex } from './searchIndex';

describe('createSearchIndex (MiniSearch)', () => {
  const sampleNotes = [
    { id: '1', title: 'Cardiologie', content: 'Diagnostic diferențial pentru insuficiență cardiacă' },
    { id: '2', title: 'Pneumologie', content: 'Astm bronșic și BPOC exacerbat' },
    { id: '3', title: 'Endocrinologie', content: 'Tratament pentru feocromocitom și criză hipertensivă' },
  ];

  it('găsește rezultate chiar și cu greșeli de tastare (typos)', () => {
    const index = createSearchIndex(sampleNotes, {
      fields: ['title', 'content'],
      idField: 'id',
    });

    // Căutare cu typo: "feocromocidom" în loc de "feocromocitom"
    const results = index.search('feocromocidom');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('3');
  });

  it('găsește rezultate prin prefix (auto-complete)', () => {
    const index = createSearchIndex(sampleNotes, {
      fields: ['title', 'content'],
      idField: 'id',
    });

    const results = index.search('cardio');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('1');
  });

  it('oferă sugestii de căutare (autoSuggest)', () => {
    const index = createSearchIndex(sampleNotes, {
      fields: ['title', 'content'],
      idField: 'id',
    });

    const suggestions = index.autoSuggest('pneumo');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].suggestion).toContain('pneumologie');
  });

  describe('MiniSearch edge cases', () => {
    it('permite inițializare cu documente goale sau câmpuri lipsă/undefined/null', () => {
      const edgeDocuments = [
        { id: '10', title: '', content: '' },
        { id: '11', title: 'Titlu valid', content: undefined },
        { id: '12', title: undefined, content: 'Doar conținut' },
        { id: '13', title: null, content: null },
        { id: '14' }, // fără title și fără content
      ];

      expect(() => {
        const index = createSearchIndex(edgeDocuments as unknown as Parameters<typeof createSearchIndex>[0], {
          fields: ['title', 'content'],
          idField: 'id',
        });
        const res = index.search('valid');
        expect(res.length).toBe(1);
        expect(res[0].id).toBe('11');
      }).not.toThrow();
    });

    it('gestionează căutări goale, spații și caractere speciale', () => {
      const index = createSearchIndex(sampleNotes, {
        fields: ['title', 'content'],
        idField: 'id',
      });

      expect(index.search('')).toEqual([]);
      expect(index.search('   ')).toEqual([]);
      expect(index.autoSuggest('')).toEqual([]);
      expect(index.autoSuggest('   ')).toEqual([]);

      // Caractere regex speciale
      expect(() => index.search('[')).not.toThrow();
      expect(() => index.search(']')).not.toThrow();
      expect(() => index.search('\\')).not.toThrow();
      expect(() => index.search('*')).not.toThrow();
      expect(() => index.search('+')).not.toThrow();
      expect(() => index.autoSuggest('[')).not.toThrow();
      expect(() => index.autoSuggest('*')).not.toThrow();
    });

    it('funcționează cu listă inițială vidă de documente', () => {
      const index = createSearchIndex([], {
        fields: ['title', 'content'],
        idField: 'id',
      });

      expect(index.search('orice')).toEqual([]);
      expect(index.autoSuggest('orice')).toEqual([]);
    });
  });
});
