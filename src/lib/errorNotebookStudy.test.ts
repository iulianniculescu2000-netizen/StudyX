import { beforeEach, describe, expect, it } from 'vitest';
import { addErrorCards, errorEntryToCard, pickRecapEntries, ERROR_CARDS_DECK } from './errorNotebookStudy';
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import type { ErrorEntry } from './errorNotebook';
import type { Question, Quiz } from '../types';

const entry = (id: string, text: string, explanation?: string): ErrorEntry => {
  const question: Question = {
    id,
    text,
    explanation,
    options: [
      { id: 'a', text: 'Corect 1', isCorrect: true },
      { id: 'b', text: 'Greșit', isCorrect: false },
      { id: 'c', text: 'Corect 2', isCorrect: true },
    ],
  };
  return { key: `q:${id}`, quiz: { id: 'q', title: 'Test' } as Quiz, question, stat: {} as ErrorEntry['stat'], wrong: 2, total: 3, accuracy: 33, mastered: false };
};

describe('errorNotebookStudy', () => {
  beforeEach(() => {
    useFolderStore.setState({ folders: [] });
    useQuizStore.setState({ quizzes: [] });
  });

  it('face cardul determinist: întrebarea pe față, răspunsul și explicația pe verso', () => {
    const card = errorEntryToCard(entry('1', 'Ce este X?', 'Pentru că Y'));
    expect(card.text).toBe('Ce este X?');
    expect(card.options).toHaveLength(1);
    expect(card.options[0].text).toBe('Răspuns corect: Corect 1; Corect 2\n\nPentru că Y');
    expect(errorEntryToCard(entry('2', 'Fără explicație')).options[0].text).toBe('Răspuns corect: Corect 1; Corect 2');
  });

  it('creează folderul și pachetul o singură dată și nu dublează la apăsări repetate', () => {
    const entries = [entry('1', 'Ce este X?'), entry('2', 'Ce este Z?')];
    const first = addErrorCards(entries);
    expect(first).toMatchObject({ added: 2, skipped: 0 });
    const again = addErrorCards([...entries, entry('3', 'ce ESTE x?  ')]);
    expect(again).toMatchObject({ added: 0, skipped: 3 });

    const folders = useFolderStore.getState().folders;
    expect(folders).toHaveLength(1);
    expect(folders[0]).toMatchObject({ name: 'Din caietul de erori', scope: 'flashcards' });
    const decks = useQuizStore.getState().quizzes;
    expect(decks).toHaveLength(1);
    expect(decks[0]).toMatchObject({ kind: 'flashcard', title: ERROR_CARDS_DECK, folderId: folders[0].id });
    expect(decks[0].questions).toHaveLength(2);

    expect(addErrorCards([entry('4', 'Altă întrebare')])).toMatchObject({ added: 1 });
    expect(useQuizStore.getState().quizzes[0].questions).toHaveLength(3);
  });

  it('nu face nimic fără greșeli', () => {
    expect(addErrorCards([])).toEqual({ added: 0, skipped: 0, deckId: null });
    expect(useFolderStore.getState().folders).toHaveLength(0);
  });

  it('mini-recapitularea ia primele greșeli', () => {
    const list = Array.from({ length: 9 }, (_, i) => entry(String(i), `Î${i}`));
    expect(pickRecapEntries(list)).toHaveLength(5);
    expect(pickRecapEntries(list, 3).map((e) => e.question.id)).toEqual(['0', '1', '2']);
  });
});
