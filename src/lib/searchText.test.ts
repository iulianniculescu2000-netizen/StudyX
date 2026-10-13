import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeSearchText } from './searchText';

describe('searchText', () => {
  it('scoate diacriticele și majusculele', () => {
    expect(normalizeSearchText('Știință ȘȚ ŞŢ ăâî')).toBe('stiinta st st aai');
  });
  it('potrivește fără diacritice în ambele sensuri', () => {
    expect(matchesQuery('Anestezie', 'anestezie')).toBe(true);
    expect(matchesQuery('anestezie', 'Anestezie')).toBe(true);
    expect(matchesQuery('Sarcină', 'sarcina')).toBe(true);
    expect(matchesQuery('sarcina', 'sarcină')).toBe(true);
    expect(matchesQuery('știință', 'stiinta')).toBe(true);
    expect(matchesQuery('stiinta', 'știință')).toBe(true);
  });
  it('cere toate cuvintele', () => {
    expect(matchesQuery('Boli infecțioase la copil', 'copil infectioase')).toBe(true);
    expect(matchesQuery('Boli infecțioase', 'copil infectioase')).toBe(false);
    expect(matchesQuery('orice', '   ')).toBe(true);
  });

  it('tolerează greșeli de tastare (typos) și potrivește prin prefix', () => {
    // 1 greșeală tolerată pentru cuvinte medii
    expect(matchesQuery('Care este diagnosticul de feocromocitom?', 'feocromocidom')).toBe(true);
    // 1-2 greșeli tolerate pentru cuvinte lungi
    expect(matchesQuery('Glomerulonefrită acută post-streptococică', 'glumerulonefrita')).toBe(true);
    // Prefix matching
    expect(matchesQuery('Cardiologie clinică și fiziopatologie', 'cardio')).toBe(true);
    // Diacritice + typo
    expect(matchesQuery('Insuficiență cardiacă congestivă', 'insuficenta cardiaca')).toBe(true);
  });

  describe('edge cases audit', () => {
    it('tratează corect string gol și doar spații', () => {
      expect(matchesQuery('', '')).toBe(true);
      expect(matchesQuery('orice text', '')).toBe(true);
      expect(matchesQuery('orice text', '   ')).toBe(true);
      expect(matchesQuery('', '   ')).toBe(true);
      expect(matchesQuery('', 'ceva')).toBe(false);
      expect(matchesQuery('   ', 'ceva')).toBe(false);
    });

    it('gestionează caractere speciale regex fără erori', () => {
      // Caractere regex: [, ], \, *, +, (, ), ?, ^, $
      expect(matchesQuery('Cardiologie [Ghid 2024]', '[ghid]')).toBe(true);
      expect(matchesQuery('Tratament C++', 'c++')).toBe(true);
      expect(matchesQuery('Tratament C++', 'C++')).toBe(true);
      expect(matchesQuery('Formula A + B', '+')).toBe(true);
      expect(matchesQuery('Cale c:\\teste\\doc', '\\')).toBe(true);
      expect(matchesQuery('Notă importantă *', '*')).toBe(true);

      // Căutare caractere speciale când textul NU le conține
      expect(matchesQuery('Cardiologie simplă', '[')).toBe(false);
      expect(matchesQuery('Cardiologie simplă', ']')).toBe(false);
      expect(matchesQuery('Cardiologie simplă', '\\')).toBe(false);
      expect(matchesQuery('Cardiologie simplă', '*')).toBe(false);
      expect(matchesQuery('Cardiologie simplă', '+')).toBe(false);
    });

    it('potrivește corect diacritice mixte: ș/ț cu virgulă vs ş/ţ cu sedilă', () => {
      // ș (virgulă U+0219) vs ş (sedilă U+015F)
      expect(matchesQuery('șoc anafilactic', 'şoc')).toBe(true);
      expect(matchesQuery('şoc anafilactic', 'șoc')).toBe(true);
      // ț (virgulă U+021B) vs ţ (sedilă U+0163)
      expect(matchesQuery('hipertensiune arterială tratată', 'trataţă')).toBe(true);
      expect(matchesQuery('hipertensiune arterială trataţă', 'tratată')).toBe(true);
      // Fără diacritice vs cu sedilă
      expect(matchesQuery('soc anafilactic', 'şoc')).toBe(true);
      expect(matchesQuery('trataţă', 'tratata')).toBe(true);
    });

    it('gestionează numere corect', () => {
      expect(matchesQuery('Întrebarea 1 despre cord', '1')).toBe(true);
      expect(matchesQuery('Întrebarea 2 despre plămâni', '2')).toBe(true);
      expect(matchesQuery('Grile Rezidențiat 2024', '2024')).toBe(true);
      expect(matchesQuery('Grile Rezidențiat 2024', '2025')).toBe(false);
      expect(matchesQuery('Întrebarea 1', '2')).toBe(false);
    });

    it('răspunde rapid și corect la cuvinte foarte lungi', () => {
      const veryLongTarget = 'pneumonoultramicroscopicsilicovolcanoconiosis și alte afecțiuni pulmonare';
      const veryLongQuery = 'pneumonoultramicroscopicsilicovolcanoconiosis';
      expect(matchesQuery(veryLongTarget, veryLongQuery)).toBe(true);

      const hugeNonsense = 'a'.repeat(500);
      expect(matchesQuery('Cardiologie', hugeNonsense)).toBe(false);
      expect(matchesQuery(hugeNonsense, 'Cardio')).toBe(false);
    });
  });
});
