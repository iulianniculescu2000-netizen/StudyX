import { create } from 'zustand';
import { useAIStore, type AIKnowledgeSourceType } from './aiStore';
import { useToastStore } from './toastStore';
import { friendlyAIError } from '../lib/ai/friendlyError';
import { INDEX_STALL_MS, readTimeoutMs, withStallGuard } from '../pages/knowledge-vault/helpers';

export type VaultUploadStatus = 'queued' | 'reading' | 'ocr' | 'indexing' | 'completed' | 'error';

export interface VaultUploadTask {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  type: AIKnowledgeSourceType;
  status: VaultUploadStatus;
  progressPercent: number;
  stepText: string;
  error?: string;
  folderId?: string | null;
  startedAt: number;
  completedAt?: number;
}

interface VaultUploadState {
  tasks: VaultUploadTask[];
  isMinimized: boolean;
  isProcessing: boolean;
  activeTaskId: string | null;
}

interface VaultUploadActions {
  enqueueFiles: (files: File[], folderId?: string | null) => Promise<void>;
  toggleMinimized: () => void;
  setMinimized: (minimized: boolean) => void;
  dismissTask: (taskId: string) => void;
  clearCompleted: () => void;
  _processQueue: () => Promise<void>;
}

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string) => {
  let timeoutId: ReturnType<typeof window.setTimeout>;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    window.clearTimeout(timeoutId!);
  }
};

const yieldToPaint = async () => {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
};

function detectFileType(name: string): AIKnowledgeSourceType {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (/\.(jpe?g|png|webp|bmp)$/i.test(lower)) return 'image';
  return 'txt';
}

export const useVaultUploadStore = create<VaultUploadState & VaultUploadActions>((set, get) => ({
  tasks: [],
  isMinimized: false,
  isProcessing: false,
  activeTaskId: null,

  toggleMinimized: () => set((s) => ({ isMinimized: !s.isMinimized })),
  setMinimized: (minimized) => set({ isMinimized: minimized }),

  dismissTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    })),

  clearCompleted: () =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.status !== 'completed' && t.status !== 'error'),
    })),

  enqueueFiles: async (files, folderId = null) => {
    const addToast = useToastStore.getState().addToast;
    const existingKnowledgeSources = useAIStore.getState().knowledgeSources;
    const currentTasks = get().tasks;

    const newTasks: VaultUploadTask[] = [];

    for (const file of files) {
      const fileNameLower = file.name.trim().toLowerCase();

      // Deduplicare 1: Verificare dacă fișierul este deja în coada activă
      const inFlightTask = currentTasks.find(
        (t) =>
          t.fileName.trim().toLowerCase() === fileNameLower &&
          t.status !== 'completed' &&
          t.status !== 'error'
      );
      if (inFlightTask) {
        addToast(`"${file.name}" se procesează deja în fundal.`, 'info');
        continue;
      }

      // Deduplicare 2: Verificare dacă documentul există deja gata în bibliotecă
      const alreadyReady = existingKnowledgeSources.find(
        (s) =>
          s.name.trim().toLowerCase() === fileNameLower &&
          s.indexStatus === 'ready' &&
          (folderId === null ? !s.folderId : s.folderId === folderId)
      );
      if (alreadyReady) {
        addToast(`Documentul "${file.name}" există deja în bibliotecă.`, 'info');
        continue;
      }

      const taskId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      newTasks.push({
        id: taskId,
        file,
        fileName: file.name,
        fileSize: file.size,
        type: detectFileType(file.name),
        status: 'queued',
        progressPercent: 0,
        stepText: 'În așteptare...',
        folderId,
        startedAt: Date.now(),
      });
    }

    if (newTasks.length === 0) return;

    set((state) => ({
      tasks: [...state.tasks, ...newTasks],
      isMinimized: false,
    }));

    if (newTasks.length > 1) {
      addToast(`Am adăugat ${newTasks.length} fișiere în coada de indexare.`, 'info');
    } else {
      addToast(`Pornim indexarea pentru "${newTasks[0].fileName}" în fundal.`, 'info');
    }

    void get()._processQueue();
  },

  _processQueue: async () => {
    if (get().isProcessing) return;

    set({ isProcessing: true });

    try {
      while (true) {
        const nextTask = get().tasks.find((t) => t.status === 'queued');
        if (!nextTask) break;

        set({ activeTaskId: nextTask.id });

        const taskId = nextTask.id;
        const file = nextTask.file;
        const fileName = nextTask.fileName;
        const type = nextTask.type;
        const targetFolderId = nextTask.folderId ?? null;

        const updateTask = (patch: Partial<VaultUploadTask>) => {
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
          }));
        };

        try {
          updateTask({ status: 'reading', progressPercent: 10, stepText: `Citim ${fileName}...` });
          await yieldToPaint();

          let text = '';

          if (type === 'pdf') {
            const { parsePDF } = await import('../ai/pdfParser');
            const timeout = readTimeoutMs(file.size, 'pdf');
            text = await withTimeout(
              parsePDF(file),
              timeout,
              `Citirea PDF-ului ${fileName} a durat prea mult.`
            );
          } else if (type === 'docx') {
            const { parseDocx } = await import('../ai/docxParser');
            text = await withTimeout(
              parseDocx(file),
              readTimeoutMs(file.size, 'docx'),
              `Citirea documentului ${fileName} a durat prea mult.`
            );
          } else if (type === 'image') {
            updateTask({ status: 'ocr', progressPercent: 25, stepText: `Analizăm imaginea (OCR): ${fileName}...` });
            await yieldToPaint();
            const { parseImageOCR } = await import('../ai/ocrParser');
            text = await withTimeout(
              parseImageOCR(file),
              readTimeoutMs(file.size, 'image'),
              `OCR-ul pentru ${fileName} a durat prea mult.`
            );
          } else {
            text = await withTimeout(
              file.text(),
              readTimeoutMs(file.size, 'text'),
              `Citirea fișierului ${fileName} a expirat.`
            );
          }

          if (text.trim().length < 5) {
            throw new Error(`Conținut insuficient extras din ${fileName}.`);
          }

          updateTask({
            status: 'indexing',
            progressPercent: 40,
            stepText: `Pregătim indexarea pentru ${fileName}...`,
          });
          await yieldToPaint();

          const addKnowledgeSource = useAIStore.getState().addKnowledgeSource;

          await withStallGuard(
            (touch) =>
              Promise.resolve(
                addKnowledgeSource(fileName, text, type, {
                  folderId: targetFolderId,
                  onIndexProgress: ({ percent }: { percent: number }) => {
                    touch();
                    const scaled = Math.min(99, Math.round(40 + (percent * 0.58)));
                    updateTask({
                      progressPercent: scaled,
                      stepText: `Indexăm ${fileName}... ${percent}%`,
                    });
                  },
                })
              ),
            INDEX_STALL_MS,
            `Indexarea pentru ${fileName} nu mai avansează.`
          );

          updateTask({
            status: 'completed',
            progressPercent: 100,
            stepText: 'Finalizat cu succes.',
            completedAt: Date.now(),
          });

          // Notificare Toast
          useToastStore.getState().addToast(`"${fileName}" a fost procesat și adăugat în bibliotecă!`, 'success');

          // Notificare Nativă Desktop Electron dacă e disponibilă
          try {
            if (typeof window !== 'undefined' && (window as unknown as { electronAPI?: { showNotification?: (opts: { title: string; body: string }) => void } }).electronAPI?.showNotification) {
              (window as unknown as { electronAPI: { showNotification: (opts: { title: string; body: string }) => void } }).electronAPI.showNotification({
                title: 'StudyX — Biblioteca AI',
                body: `Documentul "${fileName}" a fost indexat complet și este gata de utilizare.`,
              });
            }
          } catch {
            // Ignoră erorile de notificare nativă
          }
        } catch (error) {
          const errMsg = friendlyAIError(error) || (error instanceof Error ? error.message : 'Eroare la procesare.');
          updateTask({
            status: 'error',
            error: errMsg,
            stepText: `Eroare: ${errMsg}`,
          });
          useToastStore.getState().addToast(`„${fileName}": ${errMsg}`, 'error');
        }
      }
    } finally {
      set({ isProcessing: false, activeTaskId: null });
    }
  },
}));
