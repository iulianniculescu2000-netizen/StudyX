import { describe, expect, it } from 'vitest';
import type { Question, Quiz } from '../types';
import { foldSameLength, getContentIndex, searchContent } from './contentSearch';

const q = (id: string, text: string, extra: Partial<Question> = {}): Question => ({
  id, text, options: [{ id: 'a', text: 'Opțiune A', isCorrect: true }, { id: 'b', text: 'Opțiune B', isCorrect: false }], ...extra,
});
const quiz = (id: string, questions: Question[], extra: Partial<Quiz> = {}): Quiz => ({
  id, title: `Set ${id}`, description: '', emoji: '', category: '', kind: 'quiz', questions, createdAt: 0, color: 'blue', ...extra,
});

describe('contentSearch', () => {
  const quizzes = [
    quiz('a', [
      q('a1', 'Fibrilația atrială are ritm neregulat'),
      q('a2', 'Care este tratamentul', { explanation: 'Se administrează anticoagulante în fibrilatie atriala' }),
      q('a3', 'Despre pancreas', { options: [{ id: 'x', text: 'Pancreatita acută este inflamatorie', isCorrect: true }] }),
      q('a4', 'Insuficiența cardiacă se tratează cu diuretice'),
      q('a5', 'Tratament IC cronică'),
    ]),
    quiz('cards', [q('c1', 'Ce este ischemia?', { options: [{ id: 'k', text: 'Lipsa fluxului sanguin', isCorrect: true }] })], { kind: 'flashcard' }),
    quiz('mix-x', [q('a1', 'Fibrilația atrială are ritm neregulat')], { tags: ['folder-session:x'] }),
  ];
  const notes = { a1: 'Reține: fibrilația are risc embolic', ghost: 'notiță fără grilă despre ischemie' };

  it('fold păstrează lungimea și scoate diacriticele', () => {
    expect(foldSameLength('Țânțar ȘȚ ă')).toBe('tantar st a');
    expect(foldSameLength('Țânțar').length).toBe('Țânțar'.length);
  });

  it('găsește în enunț, opțiuni, explicații, carduri și notițe, fără diacritice', () => {
    const index = getContentIndex(quizzes, notes);
    const fib = searchContent(index, 'fibrilat');
    expect(fib.filter((h) => h.kind === 'question').map((h) => h.questionId).sort()).toEqual(['a1', 'a2']);
    expect(fib.find((h) => h.kind === 'note')?.questionId).toBe('a1');
    expect(searchContent(index, 'pancreatita')[0]).toMatchObject({ questionId: 'a3', field: 'options', kind: 'question' });
    expect(searchContent(index, 'flux sanguin')[0]).toMatchObject({ kind: 'flashcard', questionId: 'c1', field: 'options' });
    expect(searchContent(index, 'ischemi').map((h) => h.kind).sort()).toEqual(['flashcard', 'note']);
  });

  it('ignoră sesiunile combinate (fără duplicate) și face rezultate unice', () => {
    const hits = searchContent(getContentIndex(quizzes, notes), 'ritm neregulat');
    expect(hits.filter((h) => h.kind === 'question')).toHaveLength(1);
    expect(hits[0].quizId).toBe('a');
  });

  it('clasează enunțul înaintea explicației și potrivirea de început de cuvânt înaintea celei din mijloc', () => {
    const hits = searchContent(getContentIndex(quizzes, {}), 'atriala');
    expect(hits.map((h) => h.questionId)).toEqual(['a1', 'a2']);
    const mid = getContentIndex([quiz('m', [q('m1', 'antifibrilant'), q('m2', 'fibrilant ritm')])], {});
    expect(searchContent(mid, 'fibril').map((h) => h.questionId)).toEqual(['m2', 'm1']);
  });

  it('înțelege abrevierile medicale în ambele sensuri', () => {
    const index = getContentIndex(quizzes, {});
    expect(searchContent(index, 'IC').map((h) => h.questionId).sort()).toEqual(['a4', 'a5']);
    expect(searchContent(index, 'insuficienta cardiaca').map((h) => h.questionId).sort()).toEqual(['a4', 'a5']);
    // „ic” scris mic nu e abreviere: nu se potrivește ca subșir în orice cuvânt.
    expect(searchContent(index, 'ic').map((h) => h.questionId)).toEqual(['a5']);
  });

  it('marchează potrivirile în fragment', () => {
    const [hit] = searchContent(getContentIndex(quizzes, {}), 'ritm');
    expect(hit.snippet.filter((s) => s.hit).map((s) => s.text.toLowerCase())).toEqual(['ritm']);
    expect(hit.snippet.map((s) => s.text).join('')).toContain('Fibrilația');
  });

  it('limitează pe tip', () => {
    const many = [quiz('big', Array.from({ length: 50 }, (_, i) => q(`b${i}`, `Hipertensiune ${i}`)))];
    const hits = searchContent(getContentIndex(many, {}), 'hipertensiune');
    expect(hits).toHaveLength(10);
  });

  it('refolosește indexul pentru aceleași referințe și îl reface când se schimbă', () => {
    const first = getContentIndex(quizzes, notes);
    expect(getContentIndex(quizzes, notes)).toBe(first);
    expect(getContentIndex([...quizzes], notes)).not.toBe(first);
    expect(getContentIndex(quizzes, { ...notes })).not.toBe(first);
  });

  it('rămâne rapid pe 4200+ întrebări', () => {
    const words = ['cardiac', 'renal', 'pulmonar', 'hepatic', 'tiroida', 'diabet', 'sepsis', 'anemie', 'leucemie', 'astm'];
    const big = Array.from({ length: 6 }, (_, s) => quiz(`s${s}`, Array.from({ length: 750 }, (_, i) => q(
      `s${s}-${i}`,
      `Pacient ${i} cu ${words[i % 10]} ${words[(i * 3) % 10]} și simptom ${s}${i}`,
      { explanation: `Explicație despre ${words[(i + s) % 10]} tratament standard ${i}` },
    ))));
    const t0 = performance.now();
    const index = getContentIndex(big, {});
    const build = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < 10; i++) searchContent(index, 'cardiac tratament');
    const per = (performance.now() - t1) / 10;
    expect(index.docs.length).toBe(4500);
    expect(per).toBeLessThan(150);
    expect(build).toBeLessThan(2000);
  });
});
