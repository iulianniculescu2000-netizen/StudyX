import { describe, expect, it } from 'vitest';
import {
  buildStudioCommandHelp,
  parseStudioChatCommand,
  resolveStudioFolderFromCommand,
  resolveStudioSourceFromCommand,
} from '../lib/ai/studioChatCommands';

const sources = [
  { id: 's1', name: 'Curs Cardiologie' },
  { id: 's2', name: 'Fiziologie Respiratorie' },
];

const folders = [
  { id: 'f1', name: 'Rezidentiat', emoji: '📚', color: 'blue' as const },
  { id: 'f2', name: 'Cardio', emoji: '🫀', color: 'red' as const },
];

describe('studioChatCommands', () => {
  it('parses a full Romanian generation request', () => {
    const parsed = parseStudioChatCommand('Fa-mi 12 pachete a cate 20 de grile din cursul Curs Cardiologie in folderul Rezidentiat, dificultate hard.');

    expect(parsed.shouldGenerate).toBe(true);
    expect(parsed.packCount).toBe(12);
    expect(parsed.questionsPerPack).toBe(20);
    expect(parsed.difficulty).toBe('hard');
    expect(parsed.folderName).toBe('Rezidentiat');
  });

  it('resolves the best matching source and folder from chat text', () => {
    const source = resolveStudioSourceFromCommand('Genereaza 6 seturi din fiziologie respiratorie', sources, null);
    const folder = resolveStudioFolderFromCommand('Pune-le in folderul cardio', folders, null);

    expect(source?.id).toBe('s2');
    expect(folder.kind).toBe('existing');
    if (folder.kind === 'existing') {
      expect(folder.folder.id).toBe('f2');
    }
  });

  it('falls back to selected source and uncategorized when needed', () => {
    const source = resolveStudioSourceFromCommand('Genereaza 4 pachete a cate 15 intrebari', sources, sources[0]);
    const folder = resolveStudioFolderFromCommand('Lasa-le neclasificate', folders, null);

    expect(source?.id).toBe('s1');
    expect(folder.kind).toBe('uncategorized');
  });

  it('builds a concise help block with examples', () => {
    const help = buildStudioCommandHelp(sources, folders);

    expect(help).toContain('Fă-mi 12 pachete');
    expect(help).toContain('Curs Cardiologie');
    expect(help).toContain('Rezidentiat');
  });
});
