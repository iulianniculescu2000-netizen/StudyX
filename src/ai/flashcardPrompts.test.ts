import { describe, expect, it } from 'vitest';
import { buildFlashcardAuthorSystem, buildFlashcardUserPrompt, difficultyBlock } from './flashcardPrompts';

describe('flashcardPrompts', () => {
  it('fiecare nivel are propriul profil, iar modul mixt le cuprinde pe toate', () => {
    expect(difficultyBlock('easy')).toContain('UȘOR');
    expect(difficultyBlock('easy')).not.toContain('DIFICIL —');
    expect(difficultyBlock('hard')).toContain('Capcană:');
    const mixed = difficultyBlock('auto');
    expect(mixed).toContain('30% ușor');
    expect(mixed).toContain('UȘOR —');
    expect(mixed).toContain('MEDIU —');
    expect(mixed).toContain('DIFICIL —');
  });

  it('sistemul fixează rolul, limba și rigoarea medicală, fără markdown', () => {
    const system = buildFlashcardAuthorSystem();
    expect(system).toContain('autor de flashcarduri');
    expect(system).toContain('română');
    expect(system).toContain('RIGOARE MEDICALĂ');
    expect(system).toContain('fără markdown');
  });

  it('cu fragment cere să rămână în text; fără fragment avertizează că vine din cunoștințe generale', () => {
    const grounded = buildFlashcardUserPrompt({ topic: 'Sepsis', difficulty: 'medium', count: 5, context: 'Text de carte.' });
    expect(grounded).toContain('DOAR informația din fragmentul');
    expect(grounded).toContain('Text de carte.');
    const free = buildFlashcardUserPrompt({ topic: 'Sepsis', difficulty: 'medium', count: 5, facet: 'tratament și conduită' });
    expect(free).toContain('Nu ai text din carte');
    expect(free).toContain('Acoperă mai ales: tratament și conduită');
    expect(free).not.toContain('FRAGMENT DIN CARTE');
  });

  it('limitează lista de evitat și scurtează fronturile lungi', () => {
    const avoid = Array.from({ length: 60 }, (_, i) => `Întrebarea numărul ${i}`);
    avoid[0] = 'x'.repeat(200);
    const prompt = buildFlashcardUserPrompt({ topic: 'T', difficulty: 'easy', count: 3, avoidFronts: avoid });
    expect(prompt.match(/\n- /g)?.length).toBe(40);
    expect(prompt).toContain('…');
  });

  it('cere JSON strict și acordă singular/plural', () => {
    expect(buildFlashcardUserPrompt({ topic: 'T', difficulty: 'easy', count: 1 })).toContain('exact 1 flashcard ');
    expect(buildFlashcardUserPrompt({ topic: 'T', difficulty: 'easy', count: 4 })).toContain('exact 4 flashcarduri');
    expect(buildFlashcardUserPrompt({ topic: 'T', difficulty: 'easy', count: 4 })).toContain('Răspunde DOAR cu JSON valid');
  });
});
