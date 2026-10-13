import { describe, expect, it } from 'vitest';
import { persistableMessages } from './chatPersistence';
import type { ChatMessage } from './shared';

const citation = { n: 1, source: 'Curs', topic: 'HIV', score: 0.9, excerpt: 'x' };

describe('persistableMessages', () => {
  it('scoate placeholderul gol de asistent (cu sursele lui), dar păstrează conversația', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'fa mi o schema', mode: 'diagram' },
      { role: 'assistant', content: '', citations: [citation], mode: 'diagram' },
      { role: 'user', content: 'nu vad schema' },
      { role: 'assistant', content: 'Iată schema…' },
    ];
    expect(persistableMessages(messages).map((m) => m.content)).toEqual(['fa mi o schema', 'nu vad schema', 'Iată schema…']);
  });

  it('păstrează mesajele golite care au altceva de arătat: card de opțiuni, job, buton de deschidere, eroare cu text', () => {
    const optionCard = { id: 'c', kind: 'quiz', status: 'pending', space: 'general', topic: 't', count: 5, difficulty: 'auto', questionType: 'single', folder: { mode: 'existing', id: 'x' } } as ChatMessage['optionCard'];
    const messages: ChatMessage[] = [
      { role: 'assistant', content: '', optionCard },
      { role: 'assistant', content: '', agentJobId: 'job-1' },
      { role: 'assistant', content: '', openRoute: { route: '/play/1', label: 'Începe' } },
      { role: 'assistant', content: 'Serviciul AI este indisponibil.', isError: true },
    ];
    expect(persistableMessages(messages)).toHaveLength(4);
  });

  it('nu atinge mesajele utilizatorului, nici când sunt scurte', () => {
    expect(persistableMessages([{ role: 'user', content: '?' }])).toHaveLength(1);
  });
});
