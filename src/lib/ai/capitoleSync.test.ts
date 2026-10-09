import { describe, expect, it } from 'vitest';
import { disciplineOf, MAX_SYNC_BYTES, planSync, sourceNameOf, subfoldersOf, type SyncFile } from './capitoleSync';

const f = (relPath: string, size = 1000, mtimeMs = 1): SyncFile => ({ relPath, size, mtimeMs });

describe('capitoleSync', () => {
  it('scoate disciplina, numele și subfolderele din cale', () => {
    const p = 'Capitole/Medicina Interna/Cardiologie/Capitole complete/Aritmii.pdf';
    expect(disciplineOf(p)).toBe('Medicina Interna');
    expect(sourceNameOf(p)).toBe('Aritmii');
    expect(subfoldersOf(p)).toEqual(['Cardiologie', 'Capitole complete']);
    expect(disciplineOf('Capitole/Orfan.pdf')).toBe('Altele');
    expect(subfoldersOf('Capitole/ATI/Sepsis.pdf')).toEqual([]);
  });

  it('marchează nou / sincronizat / schimbat și sare flashcardurile, fișierele uriașe și cele fără text', () => {
    const files = [
      f('Capitole/ATI/Sepsis/Nou.pdf'),
      f('Capitole/ATI/Sepsis/Gata.pdf', 10, 5),
      f('Capitole/ATI/Sepsis/Schimbat.pdf', 20, 9),
      f('Capitole/ATI/Sepsis/ATI - Flashcarduri.pdf'),
      f('Capitole/ATI/Carte scanata.pdf', MAX_SYNC_BYTES + 1),
      f('Capitole/ATI/Scanat mic.pdf', 777),
      f('Capitole/Neurologie/Alt capitol.pdf'),
    ];
    const synced = new Map([
      ['Capitole/ATI/Sepsis/Gata.pdf', f('Capitole/ATI/Sepsis/Gata.pdf', 10, 5)],
      ['Capitole/ATI/Sepsis/Schimbat.pdf', f('Capitole/ATI/Sepsis/Schimbat.pdf', 20, 1)],
    ]);
    const groups = planSync(files, synced, { 'Capitole/ATI/Scanat mic.pdf': 777 });
    expect(groups.map((g) => g.name)).toEqual(['ATI', 'Neurologie']);
    const ati = groups[0];
    expect(ati.files.map((x) => x.status)).toEqual(['new', 'done', 'changed', 'skip-flashcards', 'skip-big', 'skip-unreadable']);
    expect(ati.pending.map((x) => x.relPath)).toEqual(['Capitole/ATI/Sepsis/Nou.pdf', 'Capitole/ATI/Sepsis/Schimbat.pdf']);
    expect(ati.pendingBytes).toBe(1020);
    expect(ati.done).toBe(1);
    expect(ati.skipped).toBe(3);
  });

  it('reîncearcă un fișier „fără text” doar dacă mărimea lui s-a schimbat', () => {
    const file = f('Capitole/ATI/X.pdf', 900);
    expect(planSync([file], new Map(), { 'Capitole/ATI/X.pdf': 800 })[0].pending).toHaveLength(1);
  });
});
