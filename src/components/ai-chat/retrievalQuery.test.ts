import { describe, expect, it } from 'vitest';
import { filterRelevantChunks, lacksSubject, resolveRetrievalText, type HistoryMessage } from './retrievalQuery';

/** Mesajele reale din istoricul chatului Rezidențiat (13 oct 2026). */
const EP_ANSWER = '### 1. De ce răspunsul corect este cel indicat\n* **Angio-CT-ul pulmonar** este investigația de elecție pentru confirmarea diagnosticului de embolie pulmonară, când suspiciunea clinică este mare.';
const HISTORY: HistoryMessage[] = [
  { role: 'user', content: 'Te rog să îmi rezumi regula pentru examen, capcanele și diferențele-cheie referitoare la această grilă.' },
  { role: 'assistant', content: EP_ANSWER },
  { role: 'assistant', content: 'Am creat **5 grile** pe baza acestui subiect. Le poți rezolva acum.', openRoute: { route: '/play/1', label: 'Începe testul' } },
];

describe('lacksSubject', () => {
  it('recunoaște comenzile și trimiterile fără subiect', () => {
    for (const text of ['fa mi o schema', 'nu vad sceham', 'fă-mi un rezumat', 'explică asta', 'Te rog să îmi rezumi regula pentru examen, capcanele și diferențele-cheie referitoare la această grilă.']) {
      expect(lacksSubject(text), text).toBe(true);
    }
  });

  it('nu confundă cu fără subiect mesajele care au unul, nici abrevierile scurte', () => {
    for (const text of ['din artrita reumatoida', 'citeste despre AR din cursul relevant', 'schema tratamentului în HTA', 'explică-mi sindromul nefrotic', 'rezumat despre HIV']) {
      expect(lacksSubject(text), text).toBe(false);
    }
  });
});

describe('resolveRetrievalText', () => {
  it('„fa mi o schema” folosește subiectul conversației, nu textul literal (care aducea HIV)', () => {
    const resolved = resolveRetrievalText('fa mi o schema', { history: HISTORY });
    expect(resolved).toContain('Angio-CT-ul pulmonar');
    expect(resolved).not.toMatch(/fa mi o schema|[*#]/);
  });

  it('„această grilă” folosește întrebarea grilei deschise', () => {
    const question = 'Care este investigația de elecție pentru confirmarea emboliei pulmonare?';
    expect(resolveRetrievalText(HISTORY[0].content, { quizQuestion: question, history: [] })).toBe(question);
  });

  it('preferă ultimul mesaj al studentului care are subiect', () => {
    const history: HistoryMessage[] = [...HISTORY, { role: 'user', content: 'explică-mi artrita reumatoidă' }, { role: 'assistant', content: 'Ce vrei să afli despre ea?' }];
    expect(resolveRetrievalText('fa mi o schema', { history })).toBe('explică-mi artrita reumatoidă');
  });

  it('lasă neschimbat un mesaj cu subiect și un mesaj fără istoric', () => {
    expect(resolveRetrievalText('tratamentul AR', { history: HISTORY })).toBe('tratamentul AR');
    expect(resolveRetrievalText('fa mi o schema', { history: [] })).toBe('fa mi o schema');
  });
});

describe('filterRelevantChunks', () => {
  it('scoate fragmentele fără legătură (scoruri 0,2–0,4) și le păstrează pe cele bune', () => {
    const chunks = [0.2317, 0.2222, 0.5268, 0.3679, 1.489, 0.82].map((score) => ({ score }));
    expect(filterRelevantChunks(chunks).map((chunk) => chunk.score)).toEqual([0.5268, 1.489, 0.82]);
  });

  it('întoarce lista goală când niciun fragment nu e legat de întrebare', () => {
    expect(filterRelevantChunks([{ score: 0.22 }, { score: 0.21 }])).toEqual([]);
  });
});
