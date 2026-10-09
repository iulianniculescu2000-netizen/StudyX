import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import { useTheme } from '../../theme/ThemeContext';
import { useFolderStore } from '../../store/folderStore';
import { useQuizStore } from '../../store/quizStore';
import { useToastStore } from '../../store/toastStore';
import { useUserStore } from '../../store/userStore';
import { useNewFolderDialog } from '../../store/newFolderDialogStore';
import { hubPrefsKey } from '../../lib/flashcardGroups';
import type { Folder, Quiz } from '../../types';
import { FlashcardDeckTree } from './DeckTree';
import type { FlashcardDeckSummary } from './sections';

// Mișcare redusă: lista nu mai animă înălțimea, deci pliatul se vede imediat în DOM.
vi.mock('../../hooks/useAdaptiveMotion', async () => {
  const { resolve } = await import('../../theme/motion');
  return { useAdaptiveMotion: () => ({ calmMotion: true, reducedMotion: true, performanceLite: false, t: resolve(true) }) };
});

let tick = 0;
const folder = (id: string, name: string, parentId: string | null = null): Folder => ({
  id, name, emoji: '📁', color: 'blue', parentId, createdAt: ++tick, scope: 'flashcards',
});

const quiz = (id: string, folderId: string | null, tags: string[] = []): Quiz => ({
  id,
  title: `Pachet ${id}`,
  description: '',
  emoji: '🃏',
  category: 'Test',
  kind: 'flashcard',
  folderId,
  createdAt: 0,
  color: 'blue',
  tags,
  questions: [{ id: `${id}-1`, text: 'Față', options: [{ id: 'a', text: 'Spate', isCorrect: true }] }],
});

const summary = (q: Quiz, due = 0, seen = 1): FlashcardDeckSummary => ({
  quiz: q, total: 10, seen, due, mastered: 0, masteryPct: 0, accentColor: '#000',
});

interface HarnessProps { decks: FlashcardDeckSummary[]; query?: string; onQueryChange?: (value: string) => void }

function Harness({ decks, query = '', onQueryChange = () => {} }: HarnessProps) {
  const theme = useTheme();
  const folders = useFolderStore((state) => state.folders);
  return <FlashcardDeckTree decks={decks} folders={folders} theme={theme} query={query} onQueryChange={onQueryChange} />;
}

function setup(decks: FlashcardDeckSummary[], props: Partial<HarnessProps> = {}) {
  useQuizStore.setState({ quizzes: decks.map((deck) => deck.quiz), sessions: [], _hasHydrated: true });
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <Harness decks={decks} {...props} />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const group = (id: string) => document.querySelector<HTMLElement>(`[data-group-id="${id}"]`)!;
const toggleOf = (id: string) => group(id).querySelector<HTMLElement>('[aria-expanded]')!;
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(3000); });

beforeEach(() => {
  localStorage.clear();
  useToastStore.setState({ toasts: [] });
  useNewFolderDialog.setState({ open: false, parentId: null, stay: false });
  useUserStore.setState({ activeProfileId: 'p1' });
  useFolderStore.setState({
    folders: [folder('anat', 'Anatomie'), folder('membre', 'Membre', 'anat'), folder('farma', 'Farmacologie'), folder('gol', 'Gol')],
  });
});

describe('lista de pachete: rânduri și grupuri', () => {
  const decks = () => [
    summary(quiz('d1', 'membre'), 3),
    summary(quiz('d2', 'anat'), 0, 0),
    summary(quiz('d3', 'farma')),
    summary(quiz('d4', null)),
  ];

  it('arată rânduri compacte cu chip de restante și „nou”, fără bara lungă și „% stăpânit” vizibile', () => {
    setup(decks());
    const row = screen.getByText('Pachet d1').closest<HTMLElement>('[data-testid="deck-row"]')!;
    expect(row.style.height).toBe('38px');
    expect(within(row).getByText('3 restante')).toBeTruthy();
    expect(within(row).getByText('10 carduri')).toBeTruthy();
    const newRow = screen.getByText('Pachet d2').closest<HTMLElement>('[data-testid="deck-row"]')!;
    expect(within(newRow).getByRole('img', { name: 'nou' })).toBeTruthy();
    expect(within(newRow).queryByText('nou')).toBeNull();
    expect(screen.queryByText(/% stăpânit/)).toBeNull();
    // Detaliile trec în tooltip și în numele accesibil.
    const link = within(row).getByRole('link');
    expect(link.getAttribute('title')).toContain('0% stăpânit');
    expect(link.getAttribute('aria-label')).toContain('3 restante');
  });

  it('grupurile cu restante sunt deschise, restul strânse, iar subfolderul adună restantele în părinte', () => {
    setup(decks());
    // Anatomie are 3 restante în Membre: se deschide, la fel și subfolderul.
    expect(screen.getByText('Pachet d1')).toBeTruthy();
    expect(screen.getByText('Pachet d2')).toBeTruthy();
    const header = within(group('anat')).getAllByTestId('group-header')[0];
    expect(within(header).getByText('3 restante')).toBeTruthy();
    expect(within(header).getByText(/2 pachete/)).toBeTruthy();
    // Farmacologie și Neclasificate nu au restante: strânse.
    expect(screen.queryByText('Pachet d3')).toBeNull();
    expect(screen.queryByText('Pachet d4')).toBeNull();
    // Folderul gol rămâne deschis, cu indicația.
    expect(within(group('gol')).getByText('Trage pachete aici')).toBeTruthy();
  });

  it('pliază și desfășoară un grup și păstrează alegerea pe profil', async () => {
    const { unmount } = setup(decks());
    const farma = toggleOf('farma');
    expect(farma.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(farma);
    expect(screen.getByText('Pachet d3')).toBeTruthy();

    fireEvent.click(toggleOf('anat'));
    await settle();
    expect(screen.queryByText('Pachet d2')).toBeNull();

    const saved = JSON.parse(localStorage.getItem(hubPrefsKey('p1'))!);
    expect(saved.open).toMatchObject({ farma: true, anat: false });

    unmount();
    setup(decks());
    expect(screen.getByText('Pachet d3')).toBeTruthy();
    expect(screen.queryByText('Pachet d2')).toBeNull();
  });

  it('un alt profil nu moștenește grupurile deschise', () => {
    localStorage.setItem(hubPrefsKey('p1'), JSON.stringify({ filter: 'toate', open: { farma: true } }));
    useUserStore.setState({ activeProfileId: 'p2' });
    setup(decks());
    expect(screen.queryByText('Pachet d3')).toBeNull();
  });

  it('căutarea deschide grupurile cu potriviri și ascunde folderele fără rezultate', () => {
    setup(decks(), { query: 'd3' });
    expect(screen.getByText('Pachet d3')).toBeTruthy();
    expect(document.querySelector('[data-group-id="gol"]')).toBeNull();
    expect(document.querySelector('[data-group-id="anat"]')).toBeNull();
  });

  it('căutare fără rezultate: „Niciun pachet găsit”', () => {
    setup(decks(), { query: 'zzz' });
    expect(screen.getByText('Niciun pachet găsit')).toBeTruthy();
  });

  it('fără foldere, lista e simplă, fără antete', () => {
    useFolderStore.setState({ folders: [] });
    setup([summary(quiz('x1', null)), summary(quiz('x2', null))]);
    expect(screen.queryAllByTestId('group-header')).toHaveLength(0);
    expect(screen.getAllByTestId('deck-row')).toHaveLength(2);
  });
});

describe('filtre Toate / Rezidențiat / Altele', () => {
  const kumar = quiz('k1', null, ['rezidentiat', 'chapter:3', 'book:K']);
  const lawrence = quiz('l1', null, ['rezidentiat', 'chapter:4', 'book:L']);
  const decks = () => [summary(kumar, 2), summary(lawrence), summary(quiz('m1', 'farma'), 1)];

  it('nu arată filtrul când nu există pachete de Rezidențiat', () => {
    setup([summary(quiz('m1', 'farma'))]);
    expect(screen.queryByRole('tablist', { name: 'Filtrează pachetele' })).toBeNull();
  });

  it('Rezidențiat grupează pe disciplină cu „Deschide” spre ruta reală, Altele arată restul; alegerea se păstrează', () => {
    useFolderStore.setState({
      folders: [folder('rez', 'Rezidențiat'), folder('chir', 'Chirurgie', 'rez'), folder('farma', 'Farmacologie')],
    });
    const { unmount } = setup(decks());
    fireEvent.click(screen.getByRole('tab', { name: 'Rezidențiat' }));
    expect(screen.getByRole('tab', { name: 'Rezidențiat' }).getAttribute('aria-selected')).toBe('true');
    const chirurgie = group('disc:chirurgie');
    expect(within(chirurgie).getByRole('link', { name: /Deschide Chirurgie/ }).getAttribute('href')).toBe('/rezidentiat/chir');
    // Medicina internă nu are folder-disciplină: trimite la pagina Rezidențiat.
    expect(within(group('disc:medicina-interna')).getByRole('link', { name: /Deschide/ }).getAttribute('href')).toBe('/rezidentiat');
    expect(screen.queryByText('Pachet m1')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Folder nou' })).toBeNull();

    unmount();
    setup(decks());
    expect(screen.getByRole('tab', { name: 'Rezidențiat' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Altele' }));
    expect(screen.getByText('Pachet m1')).toBeTruthy();
    expect(screen.queryByText('Pachet k1')).toBeNull();
    expect(JSON.parse(localStorage.getItem(hubPrefsKey('p1'))!).filter).toBe('altele');
  });

  it('Toate arată și pachetele de Rezidențiat', () => {
    setup(decks());
    fireEvent.click(screen.getByRole('tab', { name: 'Toate' }));
    expect(screen.getByText('Pachet k1')).toBeTruthy();
    expect(screen.getByText('Pachet l1')).toBeTruthy();
  });
});

describe('„Mută în…”', () => {
  it('mută un pachet din meniu, cu toast și cu folderul-țintă deschis', () => {
    setup([summary(quiz('d1', 'farma'), 1)]);
    fireEvent.click(screen.getByRole('button', { name: 'Mută pachetul Pachet d1 în…' }));
    const menu = screen.getByRole('menu', { name: 'Mută în…' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items[0].getAttribute('aria-label')).toBe('Neclasificate');
    expect(within(menu).getByRole('menuitem', { name: 'Anatomie / Membre' })).toBeTruthy();
    // Folderul curent e marcat și nu se poate alege.
    expect(within(menu).getByRole('menuitem', { name: /Farmacologie \(aici\)/ }).getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Anatomie / Membre' }));
    expect(useQuizStore.getState().quizzes[0].folderId).toBe('membre');
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Am mutat «Pachet d1» în «Membre».');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(JSON.parse(localStorage.getItem(hubPrefsKey('p1'))!).open.membre).toBe(true);
  });

  it('se folosește doar de la tastatură: săgeți, Enter, Esc', () => {
    setup([summary(quiz('d1', 'farma'), 1)]);
    const trigger = screen.getByRole('button', { name: 'Mută pachetul Pachet d1 în…' });
    trigger.focus();
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    // Focusul intră pe folderul curent; săgeata în sus ajunge la „Neclasificate” (primul, nu cel dezactivat).
    const first = within(menu).getAllByRole('menuitem')[0];
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(within(menu).getAllByRole('menuitem')[1]);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(useQuizStore.getState().quizzes[0].folderId).toBe('farma');
  });

  it('Neclasificate scoate pachetul din folder', () => {
    setup([summary(quiz('d1', 'farma'), 1)]);
    fireEvent.click(screen.getByRole('button', { name: 'Mută pachetul Pachet d1 în…' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Neclasificate' }));
    expect(useQuizStore.getState().quizzes[0].folderId).toBeNull();
  });

  it('„Anulează” din toast readuce pachetul', () => {
    setup([summary(quiz('d1', 'farma'), 1)]);
    fireEvent.click(screen.getByRole('button', { name: 'Mută pachetul Pachet d1 în…' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Anatomie' }));
    useToastStore.getState().toasts.at(-1)?.action?.onClick();
    expect(useQuizStore.getState().quizzes[0].folderId).toBe('farma');
  });
});

describe('tragere pe antet', () => {
  const dragData = (id: string) => ({
    types: ['application/x-studyx-quiz-id', 'text/plain'],
    getData: (type: string) => (type === 'application/x-studyx-quiz-id' || type === 'text/plain' ? id : ''),
    setData: () => {},
    dropEffect: 'none',
    effectAllowed: 'all',
  });

  it('marchează ținta, apoi mută pachetul și scrie toastul', () => {
    setup([summary(quiz('d1', 'farma'), 1)]);
    // Anatomie › Membre e un lanț fără pachete proprii: un singur antet, a cărui țintă e Membre.
    const target = within(group('membre')).getAllByTestId('group-header')[0];
    fireEvent.dragOver(target, { dataTransfer: dragData('d1') });
    expect(target.style.boxShadow).toContain('--ring-inset');
    fireEvent.drop(target, { dataTransfer: dragData('d1') });
    expect(target.style.boxShadow).toBe('');
    expect(useQuizStore.getState().quizzes[0].folderId).toBe('membre');
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Am mutat «Pachet d1» în «Membre».');
  });

  it('un pachet lăsat în folderul lui nu se mută, doar anunță', () => {
    setup([summary(quiz('d1', 'farma'), 1)]);
    fireEvent.drop(within(group('farma')).getAllByTestId('group-header')[0], { dataTransfer: dragData('d1') });
    expect(useQuizStore.getState().quizzes[0].folderId).toBe('farma');
    expect(useToastStore.getState().toasts.at(-1)?.type).toBe('info');
  });

  it('ignoră ce nu e pachet tras (fișiere, text)', () => {
    setup([summary(quiz('d1', 'farma'), 1)]);
    const target = within(group('membre')).getAllByTestId('group-header')[0];
    fireEvent.dragOver(target, { dataTransfer: { types: ['Files'], getData: () => '' } });
    expect(target.style.boxShadow).toBe('');
    fireEvent.drop(target, { dataTransfer: { types: ['Files'], getData: () => '' } });
    expect(useQuizStore.getState().quizzes[0].folderId).toBe('farma');
  });

  it('un folder gol primește pachete trase pe indicație', () => {
    setup([summary(quiz('d1', 'farma'), 1)]);
    fireEvent.drop(within(group('gol')).getByTestId('empty-folder-hint'), { dataTransfer: dragData('d1') });
    expect(useQuizStore.getState().quizzes[0].folderId).toBe('gol');
  });

  it('Neclasificate e țintă validă', () => {
    setup([summary(quiz('d1', 'farma'), 1), summary(quiz('d2', null))]);
    fireEvent.click(toggleOf('__uncategorized__'));
    fireEvent.drop(within(group('__uncategorized__')).getAllByTestId('group-header')[0], { dataTransfer: dragData('d1') });
    expect(useQuizStore.getState().quizzes[0].folderId).toBeNull();
  });
});

describe('lanțuri de foldere și capitole', () => {
  const chapterDeck = (index: number, due = 0, seen = 0, title = `Cap ${index}`): FlashcardDeckSummary => {
    const q = quiz(`c${index}`, 'k', ['rezidentiat', `chapter:${index}`, 'book:K']);
    q.title = title;
    return { quiz: q, total: 20, seen, due, mastered: 0, masteryPct: 0, accentColor: '#000' };
  };
  const chain = () => useFolderStore.setState({ folders: [folder('rez', 'Rezidențiat'), folder('fc', 'Flashcarduri', 'rez'), folder('k', 'Kumar', 'fc')] });

  it('strânge Rezidențiat › Flashcarduri › Kumar într-un singur antet-breadcrumb', () => {
    chain();
    setup([chapterDeck(0, 2, 5)]);
    expect(screen.getAllByTestId('group-header')).toHaveLength(1);
    const header = screen.getAllByTestId('group-header')[0];
    expect(header.textContent).toContain('Rezidențiat');
    expect(header.textContent).toContain('Flashcarduri');
    expect(header.textContent).toContain('Kumar');
    expect(group('k')).toBeTruthy();
    expect(group('rez')).toBeNull();
  });

  it('ordonează capitolele cronologic, nu după restante, și arată „Cap. N” din carte', () => {
    chain();
    setup([chapterDeck(10, 9, 5, '11. Cardiologie'), chapterDeck(1, 0, 3, '2. Echilibrul'), chapterDeck(0, 0, 3, '1. Sepsis'), chapterDeck(4, 3, 5, '5. Reumatologie')]);
    const titles = screen.getAllByTestId('deck-row').map((row) => row.getAttribute('data-deck-id'));
    expect(titles).toEqual(['c0', 'c1', 'c4', 'c10']);
    const first = screen.getAllByTestId('deck-row')[0];
    expect(first.textContent).toContain('Cap. 8');
  });

  it('grupează pe specialitate, cu rezumat „De repetat azi” și „Repetă” pe capitol și pe grup', () => {
    chain();
    setup([chapterDeck(0, 0, 3), chapterDeck(1, 4, 5), chapterDeck(2), chapterDeck(3, 6, 5), chapterDeck(4, 0, 2)]);
    const summaryStrip = screen.getByTestId('chapter-due-summary');
    expect(summaryStrip.textContent).toContain('10 carduri în 2 capitole');
    expect(screen.getAllByTestId('specialty-header').length).toBeGreaterThanOrEqual(2);
    expect(within(summaryStrip).getByRole('link', { name: /Începe repetarea/ }).getAttribute('href')).toBe('/flashcards/session/due?ids=c1%2Cc3');
    const row = screen.getByText('Cap 1').closest<HTMLElement>('[data-testid="deck-row"]')!;
    expect(within(row).getByText('4 de repetat')).toBeTruthy();
    expect(within(row).getByRole('link', { name: /Repetă/ }).getAttribute('href')).toBe('/flashcards/session/c1');
    expect(within(row).getByRole('img', { name: /stăpânite/ })).toBeTruthy();
  });

  it('redenumirea și ștergerea de pe antetul lanțului lucrează pe folderul cel mai de jos', () => {
    useFolderStore.setState({ folders: [folder('a', 'A'), folder('b', 'B', 'a')] });
    setup([summary(quiz('d1', 'b'), 1)]);
    expect(screen.getByRole('button', { name: 'Redenumește folderul B' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Redenumește folderul A' })).toBeNull();
  });

  it('„Mută în…” nu oferă foldere obișnuite de grile', () => {
    useFolderStore.setState({
      folders: [
        folder('fc', 'Flashcarduri'),
        { id: 'grile', name: 'Grile', emoji: '📁', color: 'blue', parentId: null, createdAt: 99 },
      ],
    });
    setup([summary(quiz('d1', 'fc'), 1)]);
    fireEvent.click(screen.getByRole('button', { name: /Mută pachetul Pachet d1/ }));
    expect(screen.getAllByRole('menuitem').some((item) => item.textContent?.includes('Flashcarduri'))).toBe(true);
    expect(screen.getAllByRole('menuitem').some((item) => item.textContent?.includes('Grile'))).toBe(false);
  });
});

describe('foldere proprii', () => {
  it('„Folder nou” deschide dialogul existent și rămâne pe pagină după creare', () => {
    setup([summary(quiz('d1', null))]);
    fireEvent.click(screen.getByRole('button', { name: 'Folder nou' }));
    expect(useNewFolderDialog.getState()).toMatchObject({ open: true, parentId: null, stay: true, scope: 'flashcards' });
  });

  it('„Subfolder nou” presetează părintele', () => {
    setup([summary(quiz('d1', 'farma'))]);
    fireEvent.click(within(group('farma')).getByRole('button', { name: 'Subfolder nou în Farmacologie' }));
    expect(useNewFolderDialog.getState()).toMatchObject({ open: true, parentId: 'farma', stay: true, scope: 'flashcards' });
  });

  it('redenumește inline cu Enter și renunță cu Esc', () => {
    setup([summary(quiz('d1', 'farma'))]);
    fireEvent.click(within(group('farma')).getByRole('button', { name: 'Redenumește folderul Farmacologie' }));
    let input = screen.getByLabelText('Numele folderului') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Farma nouă' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useFolderStore.getState().folders.find((f) => f.id === 'farma')?.name).toBe('Farmacologie');

    fireEvent.click(within(group('farma')).getByRole('button', { name: 'Redenumește folderul Farmacologie' }));
    input = screen.getByLabelText('Numele folderului') as HTMLInputElement;
    input.value = '  Farma nouă ';
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useFolderStore.getState().folders.find((f) => f.id === 'farma')?.name).toBe('Farma nouă');
    expect(screen.queryByLabelText('Numele folderului')).toBeNull();
  });

  it('ștergerea cere confirmare, păstrează pachetele (la Neclasificate) și se poate anula', async () => {
    useFolderStore.setState({ folders: [folder('anat', 'Anatomie'), folder('membre', 'Membre', 'anat')] });
    setup([summary(quiz('d1', 'anat'), 1), summary(quiz('d2', 'membre'), 1)]);
    fireEvent.click(within(group('anat')).getAllByRole('button', { name: 'Șterge folderul Anatomie' })[0]);

    expect(screen.getByText('Ștergi folderul „Anatomie"?')).toBeTruthy();
    expect(screen.getByText(/Cele 2 pachete rămân, dar trec la Neclasificate\. Se șterge și 1 subfolder\./)).toBeTruthy();
    // Nimic nu s-a șters înainte de confirmare.
    expect(useFolderStore.getState().folders).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Șterge folderul' }));
    expect(useFolderStore.getState().folders).toHaveLength(0);
    expect(useQuizStore.getState().quizzes.map((q) => [q.id, q.folderId])).toEqual([['d1', null], ['d2', null]]);

    const toast = useToastStore.getState().toasts.at(-1)!;
    expect(toast.message).toBe('Am șters folderul „Anatomie”.');
    act(() => toast.action?.onClick());
    expect(useFolderStore.getState().folders.map((f) => f.id).sort()).toEqual(['anat', 'membre']);
    expect(useQuizStore.getState().quizzes.map((q) => [q.id, q.folderId])).toEqual([['d1', 'anat'], ['d2', 'membre']]);
  });

  it('„Anulează” în dialog nu șterge nimic', async () => {
    setup([summary(quiz('d1', 'farma'))]);
    fireEvent.click(within(group('farma')).getAllByRole('button', { name: 'Șterge folderul Farmacologie' })[0]);
    expect(screen.getByText('Ștergi folderul „Farmacologie"?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Anulează' }));
    await settle();
    expect(useFolderStore.getState().folders.some((f) => f.id === 'farma')).toBe(true);
  });

  it('folderele din Rezidențiat nu se pot redenumi sau șterge de aici', () => {
    useFolderStore.setState({ folders: [folder('rez', 'Rezidențiat'), folder('chir', 'Chirurgie', 'rez'), folder('farma', 'Farmacologie')] });
    setup([summary(quiz('d1', 'chir'), 1)]);
    expect(screen.queryByRole('button', { name: /Șterge folderul Chirurgie/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Redenumește folderul Rezidențiat/ })).toBeNull();
  });
});
