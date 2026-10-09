import { beforeEach, describe, expect, it } from 'vitest';
import { useFolderStore } from '../../store/folderStore';
import { FLASHCARDS_ROOT_CHOICE } from '../rezidentiatFlashcardFolders';
import {
  QUIZ_AUTO_CHOICE,
  QUIZ_ROOT_CHOICE,
  TREE_ROOT_CHOICE,
  defaultDestinationChoice,
  describeDestination,
  destinationOptions,
  resolveDestination,
} from './studyDestinations';

const store = () => useFolderStore.getState();
beforeEach(() => useFolderStore.setState({ folders: [] }));

function seed() {
  const rez = store().addFolder('Rezidențiat', '🩺', 'blue', null);
  const grile = store().addFolder('Grile', '📘', 'blue', rez);
  const cardio = store().addFolder('Cardiologie', '❤️', 'red', grile);
  const flash = store().addFolder('Flashcarduri', '🃏', 'purple', rez);
  const mine = store().addFolder('Recapitulare', '📁', 'blue', flash);
  const general = store().addFolder('Facultate', '📁', 'green', null);
  const generalCards = store().addFolder('Anatomie', '📁', 'green', null, 'flashcards');
  return { rez, grile, cardio, flash, mine, general, generalCards };
}

describe('studyDestinations — ce foldere se oferă', () => {
  it('flashcarduri în Rezidențiat: doar Flashcarduri și ce e sub el', () => {
    seed();
    const labels = destinationOptions('flashcards', 'rezidentiat', store().folders).map((option) => option.label);
    expect(labels).toEqual(['Flashcarduri', 'Recapitulare']);
  });

  it('grile în Rezidențiat: Grile și specialitățile, fără Flashcarduri', () => {
    seed();
    const labels = destinationOptions('quiz', 'rezidentiat', store().folders).map((option) => option.label);
    expect(labels).toEqual(['Automat, pe specialitate', 'Grile', 'Grile / Cardiologie']);
  });

  it('în general: flashcardurile merg în folderele lor, grilele în ale lor, niciodată în Rezidențiat', () => {
    seed();
    expect(destinationOptions('flashcards', 'general', store().folders).map((option) => option.label)).toEqual(['Fără folder', 'Anatomie']);
    expect(destinationOptions('quiz', 'general', store().folders).map((option) => option.label)).toEqual(['Neclasificate', 'Facultate']);
  });

  it('fără foldere încă, oferă măcar destinația implicită', () => {
    expect(destinationOptions('quiz', 'rezidentiat', []).map((option) => option.id)).toEqual([QUIZ_AUTO_CHOICE, QUIZ_ROOT_CHOICE]);
    expect(destinationOptions('flashcards', 'rezidentiat', []).map((option) => option.id)).toEqual([FLASHCARDS_ROOT_CHOICE]);
  });
});

describe('studyDestinations — unde se salvează', () => {
  it('implicit: grilele de Rezidențiat pe specialitate, flashcardurile în Flashcarduri, fără folder în general', () => {
    expect(defaultDestinationChoice('quiz', 'rezidentiat')).toEqual({ mode: 'existing', id: QUIZ_AUTO_CHOICE });
    expect(resolveDestination('quiz', 'rezidentiat', { mode: 'existing', id: QUIZ_AUTO_CHOICE })).toBeNull();
    expect(defaultDestinationChoice('flashcards', 'rezidentiat')).toEqual({ mode: 'existing', id: FLASHCARDS_ROOT_CHOICE });
    expect(defaultDestinationChoice('quiz', 'general')).toEqual({ mode: 'existing', id: TREE_ROOT_CHOICE });
  });

  it('„fără folder” înseamnă null, iar un folder existent rămâne cum e', () => {
    const { general } = seed();
    expect(resolveDestination('quiz', 'general', { mode: 'existing', id: TREE_ROOT_CHOICE })).toBeNull();
    expect(resolveDestination('quiz', 'general', { mode: 'existing', id: general })).toBe(general);
  });

  it('un folder nou de grile în Rezidențiat apare sub Grile, o singură dată', () => {
    const first = resolveDestination('quiz', 'rezidentiat', { mode: 'new', name: 'Sesiunea 2027', parentId: QUIZ_ROOT_CHOICE });
    const again = resolveDestination('quiz', 'rezidentiat', { mode: 'new', name: ' sesiunea 2027 ', parentId: QUIZ_ROOT_CHOICE });
    expect(again).toBe(first);
    const folder = store().folders.find((entry) => entry.id === first)!;
    const parent = store().folders.find((entry) => entry.id === folder.parentId)!;
    expect(parent.name).toBe('Grile');
    expect(store().folders.filter((entry) => entry.name === 'Grile')).toHaveLength(1);
  });

  it('un folder nou de flashcarduri în general primește spațiul Flashcardurilor, unul de grile nu', () => {
    const cards = resolveDestination('flashcards', 'general', { mode: 'new', name: 'Fiziologie', parentId: TREE_ROOT_CHOICE })!;
    const quiz = resolveDestination('quiz', 'general', { mode: 'new', name: 'Fiziologie', parentId: TREE_ROOT_CHOICE })!;
    expect(store().folders.find((entry) => entry.id === cards)!.scope).toBe('flashcards');
    expect(store().folders.find((entry) => entry.id === quiz)!.scope).toBeUndefined();
    expect(cards).not.toBe(quiz);
  });

  it('un nume gol cade pe părinte', () => {
    expect(resolveDestination('quiz', 'general', { mode: 'new', name: '  ', parentId: TREE_ROOT_CHOICE })).toBeNull();
  });
});

describe('studyDestinations — descrierea în clar', () => {
  it('numește destinația așa cum o vede utilizatorul', () => {
    const { general } = seed();
    expect(describeDestination('quiz', 'rezidentiat', { mode: 'existing', id: QUIZ_ROOT_CHOICE }, store().folders)).toBe('Rezidențiat / Grile');
    expect(describeDestination('quiz', 'general', { mode: 'existing', id: TREE_ROOT_CHOICE }, store().folders)).toBe('Neclasificate');
    expect(describeDestination('quiz', 'general', { mode: 'existing', id: general }, store().folders)).toBe('Facultate');
    expect(describeDestination('quiz', 'general', { mode: 'new', name: 'Nou', parentId: TREE_ROOT_CHOICE }, store().folders)).toBe('Nou');
    expect(describeDestination('quiz', 'rezidentiat', { mode: 'new', name: 'Nou', parentId: QUIZ_ROOT_CHOICE }, store().folders)).toBe('Rezidențiat / Grile / Nou');
  });
});
