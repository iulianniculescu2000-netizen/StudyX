import { describe, expect, it } from 'vitest';
import { diagramIntent, diagramLayoutHint } from './diagramPlanning';
import { composeChatSystemPrompt } from './promptKit';

describe('diagram planning', () => {
  it('recunoaște intenția fără să depindă de diacritice', () => {
    expect(diagramIntent('Formele clinice ale psoriazisului')).toBe('classification');
    expect(diagramIntent('tipuri de psoriazis')).toBe('classification');
    expect(diagramIntent('Algoritm de diagnostic')).toBe('decision');
    expect(diagramIntent('Etapele evoluției')).toBe('sequence');
    expect(diagramIntent('schemă despre psoriazis')).toBe('general');
  });

  it('include un ghid de aranjare în cererile de scheme, fără fapte medicale inventate', () => {
    const prompt = composeChatSystemPrompt({ mode: 'diagram', userMessage: 'fă o schemă interactivă cu formele psoriazisului' });
    expect(prompt).toContain(diagramLayoutHint('formele psoriazisului'));
    expect(prompt).toContain('ramuri distincte');
    expect(prompt).toContain('max 3 niveluri, 12 noduri');
    expect(prompt).toContain('Păstrează exact relațiile');
    expect(prompt).not.toContain('Gutat');
  });

  it('nu adaugă instrucțiuni de schemă la întrebări obișnuite', () => {
    const prompt = composeChatSystemPrompt({ mode: 'grounded', userMessage: 'Ce este psoriazisul?' });
    expect(prompt).not.toContain('ARANJAMENT:');
  });
});
