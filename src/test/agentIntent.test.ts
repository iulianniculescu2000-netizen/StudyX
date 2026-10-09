import { describe, expect, it } from 'vitest';
import { extractQuizIntent, isRetryPhrase } from '../lib/ai/agent';

describe('extractQuizIntent — deterministic count + type parsing', () => {
  it('reads "3 grile" as 1 set of 3 questions (the reported bug)', () => {
    const intent = extractQuizIntent('fa-mi 3 grile complement multiplu in folderul dermato');
    expect(intent.packCount).toBe(1);
    expect(intent.questionsPerPack).toBe(3);
    expect(intent.questionType).toBe('multiple');
  });

  it('detects complement simplu explicitly', () => {
    const intent = extractQuizIntent('genereaza 10 grile complement simplu din cardiologie');
    expect(intent.packCount).toBe(1);
    expect(intent.questionsPerPack).toBe(10);
    expect(intent.questionType).toBe('single');
  });

  it('defaults question type to undefined when unspecified', () => {
    const intent = extractQuizIntent('fa-mi 5 intrebari din anatomie');
    expect(intent.questionsPerPack).toBe(5);
    expect(intent.packCount).toBe(1);
    expect(intent.questionType).toBeUndefined();
  });

  it('parses "N seturi a cate M grile"', () => {
    const intent = extractQuizIntent('genereaza 3 seturi a cate 20 de grile din fiziologie');
    expect(intent.packCount).toBe(3);
    expect(intent.questionsPerPack).toBe(20);
  });

  it('parses pack count alone', () => {
    const intent = extractQuizIntent('fa-mi 4 pachete din cursul de biochimie');
    expect(intent.packCount).toBe(4);
    expect(intent.questionsPerPack).toBeUndefined();
  });

  it('ignores numbers that belong to a source name ("Cursul 1")', () => {
    const intent = extractQuizIntent('fa-mi grile din Cursul 1');
    expect(intent.packCount).toBeUndefined();
    expect(intent.questionsPerPack).toBeUndefined();
  });

  it('handles "raspunsuri multiple" phrasing', () => {
    const intent = extractQuizIntent('vreau 8 grile cu raspunsuri multiple din neurologie');
    expect(intent.questionsPerPack).toBe(8);
    expect(intent.questionType).toBe('multiple');
  });
});

describe('isRetryPhrase — short "do it again" follow-ups', () => {
  it('recognises common Romanian retry phrases', () => {
    for (const phrase of [
      'mai încearcă',
      'mai incearca',
      'încearcă din nou',
      'încă o dată',
      'reia',
      'reîncearcă',
      'mai fă o dată',
      'din nou',
      'try again',
    ]) {
      expect(isRetryPhrase(phrase)).toBe(true);
    }
  });

  it('does NOT treat a real command as a retry', () => {
    expect(isRetryPhrase('fă-mi 10 grile din cursul 7 hemato')).toBe(false);
    expect(isRetryPhrase('creează folderul Dermato')).toBe(false);
    expect(isRetryPhrase('explică-mi mecanismul anemiei')).toBe(false);
  });
});
