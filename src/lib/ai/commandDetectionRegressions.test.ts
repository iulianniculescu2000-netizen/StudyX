import { describe, expect, it } from 'vitest';
import { isAppQuestion } from './routerPolicy';
import { looksLikeAgentCommand, refersToCurrentStudyItem } from './agentCore/detection';
import { detectStudyRequest } from './optionRequest';

/** Întrebări medicale obișnuite care erau confundate cu comenzi sau cu întrebări despre aplicație (găsite la auditul prompturilor). */
describe('întrebări medicale nu sunt întrebări despre aplicație', () => {
  it.each([
    'Care este opțiunea terapeutică de elecție în HTA?',
    'Ecranarea cancerului de col uterin',
    'Meniul dietetic în diabet',
    'Care sunt setările pompei de insulină?',
  ])('%s', (text) => expect(isAppQuestion(text)).toBe(false));

  it.each([
    'unde găsesc butonul de reindexare?',
    'Unde găsesc opțiunea de export în aplicație?',
    'cum schimb setările de aspect în StudyX?',
  ])('dar întrebările despre aplicație rămân: %s', (text) => expect(isAppQuestion(text)).toBe(true));
});

describe('întrebările nu pornesc planificatorul de comenzi', () => {
  it.each([
    'importanța clinică a troponinei',
    'Ce face metformina?',
    'principiile anesteziei generale',
    'Cum se pune diagnosticul de lupus?',
  ])('%s', (text) => expect(looksLikeAgentCommand(text)).toBe(false));

  it.each([
    'fă-mi 10 grile despre HTA',
    'creează un folder Cardiologie',
    'generează flashcarduri din cursul de nefrologie',
    'importă fișierul în folderul Hematologie',
    'șterge folderul Cardiologie',
    'ce grile mi-ai putea face din cursul ăsta? creează-le în folderul Test',
  ])('dar comenzile reale rămân comenzi: %s', (text) => expect(looksLikeAgentCommand(text)).toBe(true));
});

describe('cererile de grile și carduri', () => {
  it.each([
    'Scrie-mi pe scurt ce teste se fac pentru lupus',
    'Am nevoie de fișa de observație pentru pacient',
  ])('nu sunt cereri de generare: %s', (text) => expect(detectStudyRequest(text)).toBeNull());

  it.each([
    ['fă-mi 10 grile despre HTA', 'quiz'],
    ['vreau 5 teste despre HTA', 'quiz'],
    ['fă-mi flashcarduri despre pancreatita acută', 'flashcards'],
    ['pregătește-mi fișe de studiu despre nefrologie', 'flashcards'],
  ])('rămân cereri: %s', (text, kind) => expect(detectStudyRequest(text)?.kind).toBe(kind));
});

describe('mesaje despre ceva existent nu sunt comenzi', () => {
  const own = [
    'Explică-mi această întrebare: de ce am greșit și de ce este corect răspunsul indicat? Adaugă și o schemă scurtă a raționamentului.',
    'Te rog să îmi explici această grilă. De ce am greșit și de ce este corect răspunsul indicat? fa mi o schema',
    'Vreau un debrief al sesiunii "Sepsis". Am obținut 6/10 (60%).\n\nÎntrebările pe care le-am pierdut:\n1. Vasopresorul de primă linie',
    'Fă-mi un debrief al sesiunii "Sepsis"',
  ];
  it.each(own)('%s', (text) => {
    expect(refersToCurrentStudyItem(text)).toBe(true);
    expect(looksLikeAgentCommand(text)).toBe(false);
    expect(detectStudyRequest(text)).toBeNull();
  });
  it('„fă-mi 10 grile” rămâne comandă', () => {
    expect(refersToCurrentStudyItem('Fă-mi 10 grile despre sepsis')).toBe(false);
    expect(looksLikeAgentCommand('Fă-mi 10 grile despre sepsis')).toBe(true);
    expect(detectStudyRequest('Fă-mi 10 grile despre sepsis')).not.toBeNull();
  });
});
