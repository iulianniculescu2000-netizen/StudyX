import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useVaultUploadStore } from '../store/vaultUploadStore';
import { useAIStore } from '../store/aiStore';
import { useToastStore } from '../store/toastStore';

vi.mock('../ai/pdfParser', () => ({
  parsePDF: vi.fn().mockResolvedValue('Continut text extras din PDF pentru testare medicala.'),
}));

describe('useVaultUploadStore - Background Processing & Deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVaultUploadStore.setState({
      tasks: [],
      isProcessing: false,
      activeTaskId: null,
      isMinimized: false,
    });
  });

  it('adaugă fișiere în coada de fundal și le procesează asincron', async () => {
    const file = new File(['continut valid'], 'CursCardio.pdf', { type: 'application/pdf' });
    const mockAddKnowledge = vi.fn().mockResolvedValue({
      id: 'src-123',
      name: 'CursCardio.pdf',
      indexStatus: 'ready',
    });

    useAIStore.setState({
      addKnowledgeSource: mockAddKnowledge,
      knowledgeSources: [],
    });

    await useVaultUploadStore.getState().enqueueFiles([file]);

    // Verificăm că task-ul a fost adăugat
    const tasks = useVaultUploadStore.getState().tasks;
    expect(tasks.length).toBe(1);
    expect(tasks[0].fileName).toBe('CursCardio.pdf');

    // Așteptăm finalizarea procesării
    await vi.waitFor(() => {
      const current = useVaultUploadStore.getState().tasks[0];
      expect(current.status).toBe('completed');
    });

    expect(mockAddKnowledge).toHaveBeenCalledWith(
      'CursCardio.pdf',
      expect.stringContaining('Continut text extras'),
      'pdf',
      expect.any(Object),
    );
  });

  it('blochează duplicarea dacă un fișier cu același nume este deja în coada de procesare', async () => {
    const file1 = new File(['continut 1'], 'Gastro.pdf', { type: 'application/pdf' });
    const file2 = new File(['continut 2'], 'Gastro.pdf', { type: 'application/pdf' });

    useAIStore.setState({
      addKnowledgeSource: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 200))),
      knowledgeSources: [],
    });

    await useVaultUploadStore.getState().enqueueFiles([file1]);
    await useVaultUploadStore.getState().enqueueFiles([file2]);

    const tasks = useVaultUploadStore.getState().tasks;
    // Doar 1 task trebuie să existe, al doilea fiind blocat prin deduplicare
    expect(tasks.length).toBe(1);
  });

  it('blochează duplicarea dacă un fișier cu același nume există deja gata în bibliotecă', async () => {
    const file = new File(['continut'], 'Nefrologie.pdf', { type: 'application/pdf' });

    useAIStore.setState({
      knowledgeSources: [
        {
          id: 'src-nefro',
          name: 'Nefrologie.pdf',
          type: 'pdf',
          preview: 'preview',
          charCount: 100,
          wordCount: 20,
          chunkCount: 1,
          qualityScore: 80,
          addedAt: Date.now(),
          indexStatus: 'ready',
        },
      ],
    });

    const toastSpy = vi.spyOn(useToastStore.getState(), 'addToast');

    await useVaultUploadStore.getState().enqueueFiles([file]);

    const tasks = useVaultUploadStore.getState().tasks;
    expect(tasks.length).toBe(0);
    expect(toastSpy).toHaveBeenCalledWith(
      expect.stringContaining('există deja în bibliotecă'),
      'info',
    );
  });
});
