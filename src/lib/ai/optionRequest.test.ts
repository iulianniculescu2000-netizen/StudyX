import { describe, expect, it } from 'vitest';
import { detectStudyRequest } from './optionRequest';

describe('detectStudyRequest', () => {
  it('recunoaște o cerere simplă de flashcarduri și întreabă tot ce lipsește', () => {
    const request = detectStudyRequest('Fă-mi flashcarduri despre pancreatita acută')!;
    expect(request.kind).toBe('flashcards');
    expect(request.topic).toBe('pancreatita acută');
    expect(request.missing).toEqual(['count', 'difficulty', 'folder']);
  });

  it('scoate numărul, nivelul și folderul când au fost spuse', () => {
    const request = detectStudyRequest('Vreau 20 de flashcarduri dificile despre fibrilația atrială în folderul Cardiologie, te rog')!;
    expect(request).toMatchObject({ kind: 'flashcards', topic: 'fibrilația atrială', count: 20, difficulty: 'hard', folderName: 'Cardiologie' });
    expect(request.missing).toEqual([]);
  });

  it('recunoaște grilele și tipul lor', () => {
    const request = detectStudyRequest('Generează 15 grile cu complement multiplu despre insuficiența cardiacă')!;
    expect(request).toMatchObject({ kind: 'quiz', count: 15, questionType: 'multiple', topic: 'insuficiența cardiacă' });
    expect(request.missing).toEqual(['difficulty', 'folder']);
  });

  it('numerele scrise cu litere și nivelul „ușor” sunt înțelese', () => {
    expect(detectStudyRequest('creează zece carduri ușoare despre sepsis')).toMatchObject({ count: 10, difficulty: 'easy' });
  });

  it('„grile simple” e un format, nu un nivel', () => {
    expect(detectStudyRequest('fă-mi 10 grile simple despre HTA')!.difficulty).toBeNull();
  });

  it('lasă subiectul gol când nu e spus, fără să-l inventeze', () => {
    const request = detectStudyRequest('fă-mi niște flashcarduri')!;
    expect(request.topic).toBe('');
    expect(request.missing).toContain('topic');
    expect(detectStudyRequest('fă-mi flashcarduri despre asta')!.topic).toBe('');
  });

  it('subiectul se oprește înaintea folderului sau a nivelului', () => {
    expect(detectStudyRequest('fă-mi flashcarduri despre diabet zaharat tip 2 în folderul Endocrino')!.topic).toBe('diabet zaharat tip 2');
    expect(detectStudyRequest('fă-mi grile despre tuberculoză cu nivel mediu')!.topic).toBe('tuberculoză');
  });

  it('nu confundă întrebările și alte comenzi cu o cerere de generare', () => {
    expect(detectStudyRequest('cum fac flashcarduri?')).toBeNull();
    expect(detectStudyRequest('explică-mi grilele de la sepsis')).toBeNull();
    expect(detectStudyRequest('șterge flashcardurile despre sepsis')).toBeNull();
    expect(detectStudyRequest('fă-mi flashcarduri din documentul Kumar')).toBeNull();
    expect(detectStudyRequest('fă-mi grile și flashcarduri despre sepsis')).toBeNull();
    expect(detectStudyRequest('bună')).toBeNull();
  });

  it('un nume de folder cu ghilimele se citește întreg', () => {
    expect(detectStudyRequest('fă-mi 10 grile despre HTA în folderul „Recapitulare iarnă”')!.folderName).toBe('Recapitulare iarnă');
  });
});
