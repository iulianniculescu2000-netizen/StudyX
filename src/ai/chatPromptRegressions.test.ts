import { describe, expect, it } from 'vitest';
import { composeChatSystemPrompt, suggestsDiagram } from './promptKit';

const RULE = 'indentare = ramificare';

/** Probleme găsite în istoricul real al chatului Rezidențiat (13 oct 2026). */
describe('suggestsDiagram', () => {
  it('recunoaște și cererile de schemă scrise cu greșeli', () => {
    for (const text of ['fa mi o schema', 'nu vad sceham', 'fă-mi o scehma', 'vreau o shema', 'desenează-mi algoritmul']) {
      expect(suggestsDiagram(text), text).toBe(true);
    }
  });

  it('nu declanșează schema pentru mesaje obișnuite', () => {
    for (const text of ['ce e HTA?', 'explică-mi sindromul nefrotic', 'same', 'sama de seara']) {
      expect(suggestsDiagram(text), text).toBe(false);
    }
  });
});

describe('composeChatSystemPrompt: probleme din istoric', () => {
  it('„nu vad sceham” primește regulile de schemă, ca modelul să nu mai inventeze un arbore ASCII', () => {
    expect(composeChatSystemPrompt({ userMessage: 'nu vad sceham' })).toContain(RULE);
  });

  it('o conversație recentă despre scheme păstrează regulile și la un mesaj scurt', () => {
    const without = composeChatSystemPrompt({ userMessage: 'și acum?' });
    const withRecent = composeChatSystemPrompt({ userMessage: 'și acum?', recentDiagram: true });
    expect(without).not.toContain(RULE);
    expect(withRecent).toContain(RULE);
  });

  it('grila discutată intră în prompt chiar când biblioteca nu a dat niciun fragment', () => {
    const prompt = composeChatSystemPrompt({
      hasContext: false,
      userMessage: 'explică această grilă',
      tutorContext: '[CONTEXT TUTOR]\nÎntrebare: Prima conduită în tahicardia cu QRS larg și hipotensiune?\nRăspuns corect: cardioversie electrică',
    });
    expect(prompt).toContain('NU EXISTĂ CONTEXT din biblioteca utilizatorului');
    expect(prompt).toContain('CE DISCUTĂ STUDENTUL ACUM');
    expect(prompt).toContain('tahicardia cu QRS larg');
  });

  it('fără grilă deschisă, blocul nu apare', () => {
    expect(composeChatSystemPrompt({ userMessage: 'ce e HTA?' })).not.toContain('CE DISCUTĂ STUDENTUL ACUM');
  });

  it('topicurile slabe sunt doar context: nu schimbă subiectul cerut', () => {
    const prompt = composeChatSystemPrompt({ userMessage: 'testează-mă la HTA', focusTopics: ['Aritmii'] });
    expect(prompt).toContain('nu schimba subiectul cerut de student');
  });

  it('o abreviere ambiguă din mesaj cere o clarificare, o singură dată; textul obișnuit nu o cere', () => {
    expect(composeChatSystemPrompt({ userMessage: 'citește despre AR din cursul relevant' })).toContain('ABREVIERE AMBIGUĂ ÎN MESAJ („AR”)');
    expect(composeChatSystemPrompt({ userMessage: 'citește despre artrita reumatoidă' })).not.toContain('ABREVIERE AMBIGUĂ');
    expect(composeChatSystemPrompt({ userMessage: 'ce este arterita? și ce sunt arii cerebrale' })).not.toContain('ABREVIERE AMBIGUĂ');
  });
});
