import { describe, expect, it } from 'vitest';
import type { Folder } from '../types';
import {
  UNCATEGORIZED_ID,
  buildGroupTree,
  buildResidencyContext,
  classifyResidencyDeck,
  countGroups,
  filterByDeckFilter,
  folderDeleteImpact,
  folderOptions,
  folderPathLabel,
  groupByDiscipline,
  isGroupOpenByDefault,
  parseHubPrefs,
  planMove,
  type DeckLike,
  type GroupNode,
} from './flashcardGroups';

let n = 0;
const folder = (id: string, name: string, parentId: string | null = null): Folder => ({
  id, name, emoji: '📁', color: 'blue', parentId, createdAt: ++n, scope: 'flashcards',
});

interface TestDeck extends DeckLike { label: string }
const deck = (id: string, folderId: string | null, due = 0, tags: string[] = []): TestDeck => ({
  label: id,
  due,
  total: 10,
  quiz: { id, title: `Pachet ${id}`, folderId, tags },
});

const ids = (nodes: GroupNode[]) => nodes.map((node) => node.id);

describe('buildGroupTree', () => {
  const folders = [
    folder('anatomie', 'Anatomie'),
    folder('membre', 'Membre', 'anatomie'),
    folder('cap', 'Cap', 'anatomie'),
    folder('farma', 'Farmacologie'),
  ];

  it('grupează pe foldere, cu subfoldere imbricate, sortate după nume, iar Neclasificate la sfârșit', () => {
    const tree = buildGroupTree(folders, [
      deck('d1', 'membre'), deck('d2', 'anatomie'), deck('d3', null), deck('d4', 'farma'),
    ]);
    expect(ids(tree)).toEqual(['anatomie', 'farma', UNCATEGORIZED_ID]);
    const anatomie = tree[0];
    expect(ids(anatomie.children)).toEqual(['cap', 'membre']);
    expect(anatomie.decks.map((d) => d.quiz.id)).toEqual(['d2']);
    expect(anatomie.deckCount).toBe(2);
    expect(anatomie.children[1].depth).toBe(1);
  });

  it('adună restantele din subfoldere în părinte', () => {
    const tree = buildGroupTree(folders, [deck('d1', 'membre', 4), deck('d2', 'cap', 1), deck('d3', 'anatomie', 2), deck('d4', 'farma', 0)]);
    expect(tree[0].due).toBe(7);
    expect(tree[0].children.map((c) => c.due)).toEqual([1, 4]);
    expect(tree[1].due).toBe(0);
  });

  it('păstrează folderele goale când showEmpty, și le scoate altfel', () => {
    const decks = [deck('d1', 'farma')];
    const shown = buildGroupTree(folders, decks);
    expect(ids(shown)).toEqual(['anatomie', 'farma']);
    expect(shown[0].deckCount).toBe(0);
    expect(countGroups(shown)).toBe(4);
    expect(ids(buildGroupTree(folders, decks, { showEmpty: false }))).toEqual(['farma']);
  });

  it('folderele goale de grile (fără scope „flashcards”) nu apar în arborele de flashcarduri', () => {
    const plain: Folder = { id: 'grile', name: 'Grile', emoji: '📁', color: 'blue', parentId: null, createdAt: 1 };
    const tree = buildGroupTree([plain, ...folders], [deck('d1', 'farma')]);
    expect(ids(tree)).toEqual(['anatomie', 'farma']);
    // dar un folder de grile care conține pachete de flashcarduri rămâne
    expect(ids(buildGroupTree([plain], [deck('d1', 'grile')]))).toEqual(['grile']);
  });

  it('un părinte gol rămâne dacă un subfolder are pachete', () => {
    const tree = buildGroupTree(folders, [deck('d1', 'cap')], { showEmpty: false });
    expect(ids(tree)).toEqual(['anatomie']);
    expect(ids(tree[0].children)).toEqual(['cap']);
  });

  it('pachetele cu folder inexistent merg la Neclasificate, fără să dispară', () => {
    const tree = buildGroupTree(folders, [deck('d1', 'sters')]);
    const loose = tree.find((node) => node.id === UNCATEGORIZED_ID)!;
    expect(loose.folder).toBeNull();
    expect(loose.decks.map((d) => d.quiz.id)).toEqual(['d1']);
  });

  it('un folder cu părinte lipsă devine rădăcină', () => {
    const tree = buildGroupTree([folder('orfan', 'Orfan', 'lipsa')], [deck('d1', 'orfan')]);
    expect(ids(tree)).toEqual(['orfan']);
    expect(tree[0].depth).toBe(0);
  });

  it('ciclurile de părinți nu blochează și nu pierd foldere sau pachete', () => {
    const cyclic = [folder('a', 'A', 'b'), folder('b', 'B', 'a'), folder('c', 'C', 'a')];
    const tree = buildGroupTree(cyclic, [deck('d1', 'a'), deck('d2', 'b'), deck('d3', 'c')]);
    // a și b sunt într-un ciclu: ambele devin rădăcini; c rămâne copil al lui a.
    expect(ids(tree)).toEqual(['a', 'b']);
    expect(tree[0].children.map((c) => c.id)).toEqual(['c']);
    const all = tree.flatMap((node) => [node, ...node.children]).flatMap((node) => node.decks);
    expect(all.map((d) => d.quiz.id).sort()).toEqual(['d1', 'd2', 'd3']);
  });

  it('un folder care își este propriul părinte e rădăcină', () => {
    const tree = buildGroupTree([folder('x', 'X', 'x')], [deck('d1', 'x')]);
    expect(ids(tree)).toEqual(['x']);
  });

  it('folderele goale din Rezidențiat nu apar (se umplu singure)', () => {
    const tree = buildGroupTree(
      [folder('rez', 'Rezidențiat'), folder('chir', 'Chirurgie', 'rez'), folder('mine', 'Ale mele')],
      [],
    );
    expect(ids(tree)).toEqual(['mine']);
  });

  it('fără pachete și fără foldere întoarce un arbore gol', () => {
    expect(buildGroupTree([], [])).toEqual([]);
  });
});

describe('isGroupOpenByDefault', () => {
  it('deschis cu restante sau gol, strâns altfel', () => {
    expect(isGroupOpenByDefault({ due: 3, deckCount: 5 })).toBe(true);
    expect(isGroupOpenByDefault({ due: 0, deckCount: 0 })).toBe(true);
    expect(isGroupOpenByDefault({ due: 0, deckCount: 5 })).toBe(false);
  });
});

describe('clasificarea Rezidențiat', () => {
  const folders = [
    folder('rez', 'Rezidențiat'),
    folder('flash', 'Flashcarduri', 'rez'),
    folder('kumar', 'Kumar', 'flash'),
    folder('chir', 'Chirurgie', 'rez'),
    folder('interna', 'Medicină internă', 'rez'),
    folder('card', 'Cardiologie', 'interna'),
    folder('mine', 'Ale mele'),
  ];
  const context = buildResidencyContext(folders);

  it('recunoaște pachetele pe capitole după taguri, cu disciplina cărții', () => {
    expect(classifyResidencyDeck({ tags: ['rezidentiat', 'chapter:3', 'book:K'], folderId: 'kumar' }, context)).toEqual({ discipline: 'medicina-interna' });
    expect(classifyResidencyDeck({ tags: ['rezidentiat', 'chapter:3', 'book:L'], folderId: null }, context)).toEqual({ discipline: 'chirurgie' });
    // Sinopsis acoperă mai multe discipline: e de Rezidențiat, dar fără disciplină.
    expect(classifyResidencyDeck({ tags: ['rezidentiat', 'chapter:3', 'book:S'], folderId: null }, context)).toEqual({ discipline: null });
  });

  it('recunoaște cărțile Kumar / Lawrence din tagurile unui pachet AI', () => {
    expect(classifyResidencyDeck({ tags: ['flashcard', 'Lawrence – Chirurgie generală.pdf'], folderId: 'mine' }, context)).toEqual({ discipline: 'chirurgie' });
    expect(classifyResidencyDeck({ tags: ['Kumar și Clark – Medicină Clinică.pdf'], folderId: null }, context)).toEqual({ discipline: 'medicina-interna' });
  });

  it('un pachet din folderul Rezidențiat sau din urmașii lui e de Rezidențiat; disciplina vine din folder', () => {
    expect(classifyResidencyDeck({ tags: [], folderId: 'card' }, context)).toEqual({ discipline: 'medicina-interna' });
    expect(classifyResidencyDeck({ tags: [], folderId: 'chir' }, context)).toEqual({ discipline: 'chirurgie' });
    expect(classifyResidencyDeck({ tags: [], folderId: 'rez' }, context)).toEqual({ discipline: null });
    expect(classifyResidencyDeck({ tags: [], folderId: 'flash' }, context)).toEqual({ discipline: null });
  });

  it('un pachet obișnuit nu e de Rezidențiat', () => {
    expect(classifyResidencyDeck({ tags: ['flashcard'], folderId: 'mine' }, context)).toBeNull();
    expect(classifyResidencyDeck({ tags: [], folderId: null }, context)).toBeNull();
  });

  it('un folder numit „Rezidențiat” imbricat nu e rădăcina', () => {
    const nested = buildResidencyContext([folder('x', 'Ale mele'), folder('y', 'Rezidențiat', 'x')]);
    expect(classifyResidencyDeck({ tags: [], folderId: 'y' }, nested)).toBeNull();
  });

  it('fără folderul Rezidențiat, doar tagurile contează', () => {
    const none = buildResidencyContext([folder('mine', 'Ale mele')]);
    expect(none.root).toBeNull();
    expect(classifyResidencyDeck({ tags: [], folderId: 'mine' }, none)).toBeNull();
    expect(classifyResidencyDeck({ tags: ['book:L', 'chapter:1'], folderId: 'mine' }, none)).toEqual({ discipline: 'chirurgie' });
  });

  const decks = [
    deck('k1', 'kumar', 2, ['rezidentiat', 'chapter:1', 'book:K']),
    deck('l1', 'flash', 0, ['rezidentiat', 'chapter:2', 'book:L']),
    deck('s1', 'flash', 1, ['rezidentiat', 'chapter:3', 'book:S']),
    deck('m1', 'mine', 5),
    deck('m2', null),
  ];

  it('filtrează Toate / Rezidențiat / Altele fără să piardă pachete', () => {
    const toate = filterByDeckFilter(decks, 'toate', context).map((d) => d.quiz.id);
    const rez = filterByDeckFilter(decks, 'rezidentiat', context).map((d) => d.quiz.id);
    const altele = filterByDeckFilter(decks, 'altele', context).map((d) => d.quiz.id);
    expect(toate).toEqual(['k1', 'l1', 's1', 'm1', 'm2']);
    expect(rez).toEqual(['k1', 'l1', 's1']);
    expect(altele).toEqual(['m1', 'm2']);
  });

  it('grupează pe disciplină, în ordine fixă, cu ruta reală a paginii disciplinei', () => {
    const groups = groupByDiscipline(filterByDeckFilter(decks, 'rezidentiat', context), folders, context);
    expect(groups.map((g) => g.id)).toEqual(['medicina-interna', 'chirurgie', 'alte']);
    expect(groups[0].href).toBe('/rezidentiat/interna');
    expect(groups[0].label).toBe('Medicină internă');
    expect(groups[0].due).toBe(2);
    expect(groups[1].href).toBe('/rezidentiat/chir');
    expect(groups[2].href).toBe('/rezidentiat');
    expect(groups[2].decks.map((d) => d.quiz.id)).toEqual(['s1']);
  });

  it('când folderul disciplinei lipsește, trimite la Rezidențiat și folosește numele implicit', () => {
    const noFolders = buildResidencyContext([folder('rez', 'Rezidențiat')]);
    const groups = groupByDiscipline([deck('l1', null, 0, ['chapter:2', 'book:L'])], [folder('rez', 'Rezidențiat')], noFolders);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Chirurgie');
    expect(groups[0].href).toBe('/rezidentiat');
  });

  it('ignoră pachetele care nu sunt de Rezidențiat', () => {
    expect(groupByDiscipline([deck('m1', 'mine')], folders, context)).toEqual([]);
  });
});

describe('„Mută în…”', () => {
  const folders = [
    folder('b', 'Beta'),
    folder('a', 'Alfa'),
    folder('a1', 'Copil', 'a'),
    folder('ciclu', 'Ciclu', 'ciclu2'),
    folder('ciclu2', 'Ciclu 2', 'ciclu'),
  ];

  it('listează Neclasificate, apoi arborele cu căi complete', () => {
    const options = folderOptions(folders);
    expect(options[0]).toMatchObject({ id: null, label: 'Neclasificate' });
    expect(options.slice(1, 4).map((o) => [o.id, o.label, o.depth])).toEqual([
      ['a', 'Alfa', 0],
      ['a1', 'Alfa / Copil', 1],
      ['b', 'Beta', 0],
    ]);
    // Folderele din ciclu rămân alegeri valide, fără buclă infinită.
    expect(options.map((o) => o.id)).toEqual(expect.arrayContaining(['ciclu', 'ciclu2']));
    expect(options).toHaveLength(6);
  });

  it('folderPathLabel rezistă la cicluri și părinți lipsă', () => {
    expect(folderPathLabel(folders, 'a1')).toBe('Alfa / Copil');
    expect(folderPathLabel(folders, 'ciclu')).toBe('Ciclu 2 / Ciclu');
    expect(folderPathLabel([folder('o', 'Orfan', 'lipsa')], 'o')).toBe('Orfan');
    expect(folderPathLabel(folders, 'nu-exista')).toBe('');
  });

  it('planMove: mutare, același loc, țintă inexistentă', () => {
    expect(planMove({ folderId: 'a' }, 'b', folders)).toEqual({ kind: 'move', targetId: 'b', targetName: 'Beta', previousId: 'a' });
    expect(planMove({ folderId: 'b' }, 'b', folders)).toEqual({ kind: 'noop', targetName: 'Beta' });
    expect(planMove({ folderId: undefined }, null, folders)).toEqual({ kind: 'noop', targetName: 'Neclasificate' });
    expect(planMove({ folderId: 'a' }, null, folders)).toEqual({ kind: 'move', targetId: null, targetName: 'Neclasificate', previousId: 'a' });
    expect(planMove({ folderId: 'a' }, 'nu-exista', folders)).toEqual({ kind: 'invalid', targetName: '' });
  });

  it('un pachet cu folder dispărut e deja la Neclasificate', () => {
    expect(planMove({ folderId: 'sters' }, null, folders)).toEqual({ kind: 'noop', targetName: 'Neclasificate' });
    expect(planMove({ folderId: 'sters' }, 'a', folders)).toMatchObject({ kind: 'move', targetId: 'a', previousId: 'sters' });
  });
});

describe('folderDeleteImpact', () => {
  const folders = [folder('a', 'A'), folder('a1', 'A1', 'a'), folder('a2', 'A2', 'a1'), folder('b', 'B')];
  const isDeck = (quiz: { kind?: string }) => quiz.kind === 'flashcard';
  const quiz = (folderId: string | null, kind: 'flashcard' | 'quiz') => ({ folderId, kind, tags: [], questions: [], archived: false });

  it('numără subfolderele și ce trece la Neclasificate', () => {
    const impact = folderDeleteImpact('a', folders, [
      quiz('a', 'flashcard'), quiz('a2', 'flashcard'), quiz('a1', 'quiz'), quiz('b', 'flashcard'), quiz(null, 'flashcard'),
    ], isDeck);
    expect(impact).toMatchObject({ subfolders: 2, decks: 2, otherSets: 1 });
    expect([...impact.ids].sort()).toEqual(['a', 'a1', 'a2']);
  });

  it('un folder gol nu are efecte', () => {
    expect(folderDeleteImpact('b', folders, [quiz('a', 'flashcard')], isDeck)).toMatchObject({ subfolders: 0, decks: 0, otherSets: 0 });
  });

  it('nu se blochează pe cicluri', () => {
    const cyclic = [folder('x', 'X', 'y'), folder('y', 'Y', 'x')];
    expect(folderDeleteImpact('x', cyclic, [], isDeck).ids.size).toBe(2);
  });
});

describe('preferințe pe profil', () => {
  it('citește o stare validă și ignoră ce nu e valid', () => {
    expect(parseHubPrefs(JSON.stringify({ filter: 'rezidentiat', open: { a: true, b: false, c: 'da' } })))
      .toEqual({ filter: 'rezidentiat', open: { a: true, b: false } });
    expect(parseHubPrefs(JSON.stringify({ filter: 'altele' })).filter).toBe('altele');
    expect(parseHubPrefs(JSON.stringify({ filter: 'ceva' })).filter).toBe('toate');
  });

  it('cade pe implicit la lipsă sau JSON stricat', () => {
    expect(parseHubPrefs(null)).toEqual({ filter: 'toate', open: {} });
    expect(parseHubPrefs('{nu e json')).toEqual({ filter: 'toate', open: {} });
  });
});
