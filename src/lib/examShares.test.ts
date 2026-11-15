import { describe, expect, it } from 'vitest';
import { allocateBySpecialty, examFamilyOf, examShareOf } from './examShares';
import { buildExamSimulation } from './examSimulation';
import type { Quiz } from '../types';
import bankA from '../data/rezidentiat/lawrence-kumar.json';
import bankB from '../data/rezidentiat/modele-grile.json';

const seeded = (seed = 11) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

describe('specialitățile din examen', () => {
  it('recunoaște numele din băncile aplicației, inclusiv titlurile de capitol', () => {
    expect(examFamilyOf('Cardiologie')).toBe('Cardiologie');
    expect(examFamilyOf('Hipertensiune arterială')).toBe('Cardiologie');
    expect(examFamilyOf('Chirurgie ortopedică')).toBe('Ortopedie');
    expect(examFamilyOf('Chirurgie urologică')).toBe('Urologie');
    expect(examFamilyOf('Chirurgie viscerală')).toBe('Chirurgie digestivă');
    expect(examFamilyOf('Intestinul subțire și apendicele')).toBe('Chirurgie digestivă');
    expect(examFamilyOf('Infecțiile chirurgicale')).toBe('Chirurgie generală');
    expect(examFamilyOf('Sepsisul și tratamentul infecțiilor bacteriene')).toBe('Boli infecțioase');
    expect(examFamilyOf('Psihiatrie pediatrică')).toBe('Psihiatrie');
    expect(examFamilyOf('ORL')).toBe('ORL');
    expect(examFamilyOf('Oftalmologie')).toBeNull();
    expect(examFamilyOf('')).toBeNull();
  });

  it('cardiologia cântărește cel mai mult dintre specialitățile medicale; cifrele sunt agregate', () => {
    expect(examShareOf('Cardiologie')).toBeGreaterThan(20);
    expect(examShareOf('Cardiologie')).toBeGreaterThan(examShareOf('Pneumologie'));
    expect(examShareOf('Inexistentă')).toBe(0);
  });
});

describe('allocateBySpecialty', () => {
  it('împarte proporțional cu examenul și totalul iese exact', () => {
    const available = new Map([['Cardiologie', 500], ['Ortopedie', 500], ['Neurologie', 500], ['Oftalmologie', 100]]);
    const take = allocateBySpecialty(100, available)!;
    expect([...take.values()].reduce((a, b) => a + b, 0)).toBe(100);
    expect(take.get('Cardiologie')!).toBeGreaterThan(take.get('Ortopedie')!);
    expect(take.get('Ortopedie')!).toBeGreaterThan(take.get('Neurologie')! - 1);
    expect(take.get('Oftalmologie')).toBe(0);
  });

  it('o specialitate cu puține grile cedează locurile celorlalte', () => {
    const available = new Map([['Cardiologie', 3], ['Ortopedie', 100], ['Neurologie', 100]]);
    const take = allocateBySpecialty(50, available)!;
    expect(take.get('Cardiologie')).toBe(3);
    expect([...take.values()].reduce((a, b) => a + b, 0)).toBe(50);
  });

  it('disciplinele fără pondere completează doar când celelalte nu ajung', () => {
    const available = new Map([['Cardiologie', 30], ['Oftalmologie', 5]]);
    const take = allocateBySpecialty(33, available)!;
    expect(take.get('Cardiologie')).toBe(30);
    expect(take.get('Oftalmologie')).toBe(3);
  });

  it('întoarce null când disciplinele nu se recunosc (set personal, nu bancă de examen)', () => {
    expect(allocateBySpecialty(10, new Map([['Altele', 50], ['Curs', 20]]))).toBeNull();
  });
});

describe('simulare cu ponderile examenului', () => {
  const quizzes = (() => {
    const out: Quiz[] = [];
    for (const bank of [...(bankA as unknown as Array<{ specialties: Array<{ specialty: string; quizzes: Array<{ title: string; questions: unknown[] }> }> }>), ...(bankB as unknown as Array<{ specialties: Array<{ specialty: string; quizzes: Array<{ title: string; questions: unknown[] }> }> }>)]) {
      for (const spec of bank.specialties) {
        spec.quizzes.forEach((q, i) => {
          out.push({
            id: `${spec.specialty}-${i}`, title: q.title, category: spec.specialty, kind: 'quiz', tags: ['rezidentiat'],
            questions: (q.questions as Array<{ text: string; options: Array<{ text: string; isCorrect: boolean }> }>).map((question, k) => ({
              id: `${spec.specialty}-${i}-${k}`, text: `${spec.specialty}/${i}/${k}: ${question.text}`,
              options: question.options.map((o, n) => ({ id: String(n), text: o.text, isCorrect: o.isCorrect })),
            })),
          } as unknown as Quiz);
        });
      }
    }
    return out;
  })();

  it('o simulare de 200 pe bancele din aplicație urmează ponderile, nu proporțiile băncii', () => {
    const sim = buildExamSimulation(quizzes, 200, { random: seeded() })!;
    const by = new Map<string, number>();
    for (const question of sim.quiz.questions) {
      const family = examFamilyOf(question.tags!.find((t) => t.startsWith('disc:'))!.slice(5)) ?? 'altele';
      by.set(family, (by.get(family) ?? 0) + 1);
    }
    expect(sim.quiz.questions).toHaveLength(200);
    const cardio = by.get('Cardiologie') ?? 0;
    const ortho = by.get('Ortopedie') ?? 0;
    expect(cardio).toBeGreaterThanOrEqual(20);
    expect(cardio).toBeLessThanOrEqual(28);
    expect(ortho).toBeGreaterThanOrEqual(7);
    expect(ortho).toBeLessThanOrEqual(12);
  });

  it('cu `weighted: false` păstrează alegerea veche, la întâmplare', () => {
    const sim = buildExamSimulation(quizzes, 200, { random: seeded(), weighted: false })!;
    expect(sim.quiz.questions).toHaveLength(200);
  });
});
