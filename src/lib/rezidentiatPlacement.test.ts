import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveResidencyPlacement,
  resolveTopicPlacement,
  specialtyMatches,
  tidySpecialtyName,
  isResidencySource,
  ensureTopicFolder,
  adoptStrayResidencyQuizzes,
  describePlacement,
} from './rezidentiatPlacement';
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import type { Quiz } from '../types';

const f = (id: string, name: string, parentId: string | null = null) => ({ id, name, parentId });

// The user's tree: banks under Chirurgie / Medicină internă, plus their own "Grile" folder for AI sets.
const tree = [
  f('root', 'Rezidențiat'),
  f('chir', 'Chirurgie', 'root'),
  f('med', 'Medicină internă', 'root'),
  f('grile', 'Grile', 'root'),
  f('s-hemato', 'Hematologie', 'grile'),
  f('s-diab', 'Diabet zaharat', 'grile'),
  f('b-card', 'Cardiologie', 'med'),
];

describe('specialtyMatches', () => {
  it('treats diacritics, case, stop-words and word endings as the same specialty', () => {
    expect(specialtyMatches('DIABETUL ZAHARAT', 'Diabet zaharat')).toBe(true);
    expect(specialtyMatches('BOLILE HEPATICE', 'Boli hepatice')).toBe(true);
    expect(specialtyMatches('Hipertensiunea arterială', 'Hipertensiune arterială')).toBe(true);
    expect(specialtyMatches('Sepsisul ȘI tratamentul infecțiilor', 'sepsisul si tratamentul infectiilor')).toBe(true);
  });

  it('matches official chapter titles to the shorter bank names', () => {
    expect(specialtyMatches('Otorinolaringologia: bolile capului și gâtului', 'Otorinolaringologie')).toBe(true);
    expect(specialtyMatches('Chirurgie ortopedică: bolile sistemului musculoscheletal', 'Chirurgie ortopedică')).toBe(true);
    expect(specialtyMatches('Infecții transmisibile pe cale sexuală și infecția cu virusul imunodeficienței umane', 'Infecții transmisibile pe cale sexuală')).toBe(true);
    expect(specialtyMatches('Tulburările psihice', 'Psihiatrie')).toBe(true);
  });

  it('keeps genuinely different specialties apart', () => {
    expect(specialtyMatches('Neurochirurgie', 'Neurologie')).toBe(false);
    expect(specialtyMatches('Pneumonia', 'Pneumologie')).toBe(false);
    expect(specialtyMatches('Endocardita', 'Endocrinologie')).toBe(false);
    expect(specialtyMatches('Cardiomiopatii', 'Cardiologie')).toBe(false);
    expect(specialtyMatches('Reumatism', 'Reumatologie')).toBe(false);
    expect(specialtyMatches('Cardiologie', 'Pneumologie')).toBe(false);
    expect(specialtyMatches('Chirurgie', 'Chirurgie ortopedică')).toBe(false);
  });
});

describe('tidySpecialtyName', () => {
  it('turns SHOUTED chapter titles into sentence case and leaves normal ones alone', () => {
    expect(tidySpecialtyName('CARDIOLOGIE')).toBe('Cardiologie');
    expect(tidySpecialtyName('12. HEMATOLOGIE')).toBe('Hematologie');
    expect(tidySpecialtyName('Colon, rect și anus')).toBe('Colon, rect și anus');
  });
});

describe('resolveResidencyPlacement', () => {
  it('files a chapter under the existing specialty inside "Grile"', () => {
    const p = resolveResidencyPlacement('Kumar și Clark – Medicină Clinică.pdf', 'DIABETUL ZAHARAT', tree);
    expect(p).toEqual({ disciplineName: 'Grile', specialtyName: 'Diabet zaharat', disciplineId: 'grile', specialtyId: 's-diab' });
  });

  it('names a new specialty inside "Grile" for a chapter with no folder yet', () => {
    const p = resolveResidencyPlacement('Lawrence – Chirurgie generală.pdf', 'PANCREASUL', tree);
    expect(p).toEqual({ disciplineName: 'Grile', specialtyName: 'Pancreasul', disciplineId: 'grile', specialtyId: null });
  });

  it('does not reuse a bank specialty from another discipline — sets always go to "Grile"', () => {
    const p = resolveResidencyPlacement('Kumar și Clark – Medicină Clinică.pdf', 'Cardiologie', tree);
    expect(p.disciplineId).toBe('grile');
    expect(p.specialtyId).toBeNull();
  });

  it('files a whole-book pack under a specialty named after the book', () => {
    const p = resolveResidencyPlacement('Kumar și Clark – Medicină Clinică.pdf', null, tree);
    expect(p.specialtyName).toBe('Kumar și Clark – Medicină Clinică');
    expect(p.disciplineId).toBe('grile');
  });

  it('still names "Grile" when the folder does not exist yet, or when there is no Rezidențiat root', () => {
    expect(resolveResidencyPlacement('Lawrence.pdf', 'Esofagul', [f('root', 'Rezidențiat')])).toEqual({
      disciplineName: 'Grile', specialtyName: 'Esofagul', disciplineId: null, specialtyId: null,
    });
    expect(resolveResidencyPlacement('Lawrence.pdf', 'Esofagul', []).disciplineId).toBeNull();
  });

  it('finds the user\'s "Grile" folder regardless of case', () => {
    const p = resolveResidencyPlacement('x.pdf', 'Esofagul', [f('root', 'Rezidențiat'), f('g', 'GRILE', 'root')]);
    expect(p.disciplineId).toBe('g');
  });
});

describe('resolveTopicPlacement', () => {
  it('files "mielom multiplu" under Hematologie inside "Grile"', () => {
    const p = resolveTopicPlacement('mielom multiplu', tree);
    expect(p).toEqual({ disciplineName: 'Grile', specialtyName: 'Hematologie', disciplineId: 'grile', specialtyId: 's-hemato' });
    expect(describePlacement(p)).toBe('Rezidențiat › Grile › Hematologie');
  });

  it('does not mistake a subdural hematoma for hematology, or diabetes insipidus for diabetes mellitus', () => {
    expect(resolveTopicPlacement('hematom subdural', tree).specialtyName).toBe('Neurochirurgie');
    expect(resolveTopicPlacement('diabet insipid', tree).specialtyName).toBe('Endocrinologie');
    expect(resolveTopicPlacement('diabet zaharat tip 2', tree).specialtyName).toBe('Diabet zaharat');
  });

  it('files an unrecognised topic directly in "Grile"', () => {
    const p = resolveTopicPlacement('subiect fără cuvinte cheie', tree);
    expect(p.specialtyName).toBeNull();
    expect(p.disciplineId).toBe('grile');
    expect(describePlacement(p)).toBe('Rezidențiat › Grile');
  });
});

describe('isResidencySource', () => {
  const lib = [f('r', 'Rezidențiat'), f('sub', 'Cursuri', 'r'), f('other', 'Altceva')];
  it('recognises sources under the Rezidențiat section, at any depth', () => {
    expect(isResidencySource({ folderId: 'r' }, lib)).toBe(true);
    expect(isResidencySource({ folderId: 'sub' }, lib)).toBe(true);
    expect(isResidencySource({ folderId: 'other' }, lib)).toBe(false);
    expect(isResidencySource({ folderId: null }, lib)).toBe(false);
  });
});

describe('with the real stores', () => {
  const mkQuiz = (id: string, title: string, folderId: string | null, extra: Partial<Quiz> = {}): Quiz =>
    ({ id, title, description: '', emoji: '', category: '', folderId, createdAt: 0, color: 'blue', tags: [], questions: [], ...extra }) as unknown as Quiz;

  beforeEach(() => {
    useFolderStore.setState({ folders: tree.map((x) => ({ ...x, emoji: '📁', color: 'blue', createdAt: 0 })) as never });
    useQuizStore.setState({ quizzes: [] });
  });

  it('reuses the existing "Grile" folder and its specialty when filing a topic', () => {
    const folder = ensureTopicFolder('mielom multiplu');
    expect(folder.id).toBe('s-hemato');
    expect(useFolderStore.getState().folders.filter((x) => x.name === 'Grile')).toHaveLength(1);
  });

  it('creates the specialty inside "Grile" when it is missing', () => {
    const folder = ensureTopicFolder('pancreatită acută');
    expect(folder.name).toBe('Pancreasul');
    expect(folder.parentId).toBe('grile');
  });

  it('moves sets stranded in the Rezidențiat root into "Grile", and leaves bank sets and sessions alone', () => {
    useQuizStore.setState({
      quizzes: [
        mkQuiz('stray', 'mielom multiplu', 'root'),
        mkQuiz('bank', 'Din bancă', 'root', { tags: ['rezidentiat', 'rezidentiat-bank:x'] }),
        mkQuiz('mix', 'Sesiune', 'root', { tags: ['folder-session:root'] }),
        mkQuiz('elsewhere', 'Alt loc', 'chir'),
      ],
    });
    expect(adoptStrayResidencyQuizzes()).toBe(1);
    const byId = Object.fromEntries(useQuizStore.getState().quizzes.map((q) => [q.id, q.folderId]));
    expect(byId).toEqual({ stray: 's-hemato', bank: 'root', mix: 'root', elsewhere: 'chir' });
    expect(adoptStrayResidencyQuizzes()).toBe(0); // idempotent
  });
});
