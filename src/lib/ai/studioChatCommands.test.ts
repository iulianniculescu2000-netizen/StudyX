import { describe, it, expect } from 'vitest';
import { parseStudioChatCommand, resolveStudioSourceFromCommand, resolveStudioFolderFromCommand } from './studioChatCommands';

const folder = (id: string, name: string) => ({ id, name, emoji: '📁', color: 'blue' as const });
const source = (id: string, name: string) => ({ id, name });

describe('parseStudioChatCommand — what is asked', () => {
  it('reads a plain amount as one set of exactly that many questions', () => {
    expect(parseStudioChatCommand('Fă-mi 5 grile din mielom multiplu')).toMatchObject({ shouldGenerate: true, packCount: 1, questionsPerPack: 5 });
    expect(parseStudioChatCommand('Fă 10 grile din Kumar')).toMatchObject({ shouldGenerate: true, packCount: 1, questionsPerPack: 10 });
  });

  it('reads packs and per-pack counts, with or without diacritics', () => {
    expect(parseStudioChatCommand('Fă-mi 12 pachete a câte 20 de grile din cursul Cardiologie')).toMatchObject({ packCount: 12, questionsPerPack: 20 });
    expect(parseStudioChatCommand('genereaza 6 seturi a cate 15 intrebari')).toMatchObject({ packCount: 6, questionsPerPack: 15 });
    expect(parseStudioChatCommand('4 pachete cu 10 grile pe pachet').questionsPerPack).toBe(10);
  });

  it('does not treat ordinary questions as generation requests', () => {
    expect(parseStudioChatCommand('Vreau să pun o întrebare despre digoxin').shouldGenerate).toBe(false);
    expect(parseStudioChatCommand('Vreau să înțeleg grila 5 din testul de ieri').shouldGenerate).toBe(false);
    expect(parseStudioChatCommand('Ce înseamnă STEMI?').shouldGenerate).toBe(false);
  });

  it('still recognises the different ways to ask', () => {
    for (const phrase of ['Fă 10 grile despre pancreatită', 'Generează 8 grile', 'Adaugă 5 grile din Lawrence', 'Dă-mi 5 grile din Kumar', 'Vreau 10 grile din Kumar']) {
      expect(parseStudioChatCommand(phrase).shouldGenerate).toBe(true);
    }
  });

  it('reads difficulty', () => {
    expect(parseStudioChatCommand('fă 5 grile dificultate mediu').difficulty).toBe('medium');
    expect(parseStudioChatCommand('fă 5 grile ușoare, ușor').difficulty).toBe('easy');
  });
});

describe('parseStudioChatCommand — destination', () => {
  it('reads a named folder and stops where the sentence moves on', () => {
    expect(parseStudioChatCommand('Fă 5 grile în folderul Cardio pentru examen').folderName).toBe('Cardio');
    expect(parseStudioChatCommand('Fă 5 grile în folderul Anatomie din cursul Cardiologie').folderName).toBe('Anatomie');
  });

  it('handles Romanian quotes, "pune-le în" and a plain "în folder"', () => {
    expect(parseStudioChatCommand('Fă 5 grile în folderul „Chirurgie generală”').folderName).toBe('Chirurgie Generală');
    expect(parseStudioChatCommand('Fă 5 grile și pune-le în Anatomie').folderName).toBe('Anatomie');
    expect(parseStudioChatCommand('salvează în Fiziologie').folderName).toBe('Fiziologie');
  });

  it('does not read "din folderul X" (a source) as a destination', () => {
    expect(parseStudioChatCommand('Fă 5 grile din folderul Cardiologie').folderName).toBeNull();
  });
});

describe('resolveStudioFolderFromCommand', () => {
  it('finds an existing folder whose name contains "și" / "la" instead of cutting it short', () => {
    const named = [
      { id: 'a', name: 'Boli infecțioase și parazitare', emoji: '🦠', color: 'blue' as const },
      { id: 'b', name: 'Tulburări renale și ale tractului urinar', emoji: '💧', color: 'blue' as const },
    ];
    expect(resolveStudioFolderFromCommand('Fă-mi 5 grile din mielom în folderul Boli infecțioase și parazitare', named))
      .toEqual({ kind: 'existing', folder: named[0] });
    expect(resolveStudioFolderFromCommand('Generează 3 pachete în folderul Tulburări renale și ale tractului urinar pentru examen', named))
      .toEqual({ kind: 'existing', folder: named[1] });
    // A name that is not an existing folder is still shortened as before.
    expect(resolveStudioFolderFromCommand('Fă-mi 5 grile în folderul Cardio pentru examen', named))
      .toEqual({ kind: 'create', name: 'Cardio' });
  });

  const folders = [folder('1', 'Grile'), folder('2', 'Cardiologie'), folder('3', 'Test')];

  it('never picks a folder just because its name appears in the sentence', () => {
    expect(resolveStudioFolderFromCommand('Fă-mi 5 grile din mielom multiplu', folders).kind).toBe('uncategorized');
    expect(resolveStudioFolderFromCommand('Vreau să testez cunoștințele: 5 grile', folders).kind).toBe('uncategorized');
  });

  it('uses an exact folder name only', () => {
    expect(resolveStudioFolderFromCommand('Fă 5 grile în folderul Cardiologie', folders)).toMatchObject({ kind: 'existing' });
    expect(resolveStudioFolderFromCommand('Fă 5 grile în folderul Cardiologie clinică', folders)).toMatchObject({ kind: 'create', name: 'Cardiologie Clinică' });
    expect(resolveStudioFolderFromCommand('Fă 5 grile în folderul Grile 2', folders)).toMatchObject({ kind: 'create' });
  });

  it('falls back to the folder selected in Studio, or to none', () => {
    expect(resolveStudioFolderFromCommand('Fă 5 grile din Kumar', folders, folders[1])).toMatchObject({ kind: 'existing', folder: folders[1] });
    expect(resolveStudioFolderFromCommand('Fă 5 grile din Kumar', folders).kind).toBe('uncategorized');
    expect(resolveStudioFolderFromCommand('Fă 5 grile neclasificate', folders).kind).toBe('uncategorized');
  });
});

describe('resolveStudioSourceFromCommand', () => {
  const kumar = source('k', 'Kumar și Clark – Medicină Clinică.pdf');
  const lawrence = source('l', 'Lawrence – Chirurgie generală și specialități chirurgicale.pdf');
  const sinopsis = source('s', 'Sinopsis de medicină.pdf');
  const all = [kumar, lawrence, sinopsis];

  it('matches by a distinctive word of the title, no extension needed', () => {
    expect(resolveStudioSourceFromCommand('Fă-mi 20 flashcarduri din Lawrence', all, kumar)).toBe(lawrence);
    expect(resolveStudioSourceFromCommand('grile din Kumar', all)).toBe(kumar);
    expect(resolveStudioSourceFromCommand('grile din sinopsis', all, kumar)).toBe(sinopsis);
  });

  it('matches the full name even with the extension typed', () => {
    expect(resolveStudioSourceFromCommand('grile din Sinopsis de medicină.pdf', all, kumar)).toBe(sinopsis);
  });

  it('uses the active source when none is named, but does not replace a named one that is missing', () => {
    expect(resolveStudioSourceFromCommand('Fă 5 grile despre tiroida', all, kumar)).toBe(kumar);
    expect(resolveStudioSourceFromCommand('Fă 5 grile din cursul Anatomie', all, kumar)).toBeNull();
  });

  it('asks (null) when two sources fit equally and nothing is active', () => {
    expect(resolveStudioSourceFromCommand('grile din Kumar și Lawrence', all)).toBeNull();
  });

  it('uses the only source when there is one', () => {
    expect(resolveStudioSourceFromCommand('fă 5 grile', [kumar])).toBe(kumar);
  });
});
