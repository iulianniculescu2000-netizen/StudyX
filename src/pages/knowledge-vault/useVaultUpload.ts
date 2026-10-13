import { useRef, type ChangeEvent } from 'react';
import type { AIKnowledgeSource, AIKnowledgeSourceType } from '../../store/aiStore';
import { useVaultUploadStore } from '../../store/vaultUploadStore';

type AddKnowledgeSource = (
  name: string,
  text: string,
  type: AIKnowledgeSourceType,
  options?: { onIndexProgress?: (info: { percent: number }) => void; folderId?: string | null },
) => Promise<AIKnowledgeSource | undefined | void>;

interface UseVaultUploadArgs {
  activeFolderId: string | null;
  addKnowledgeSource?: AddKnowledgeSource;
  addToast?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

/**
 * Hook pentru încărcarea fișierelor în bibliotecă.
 * Conectat la magazinul global `useVaultUploadStore`, garantând:
 * 1. Rularea neîntreruptă pe fundal la părăsirea rutei;
 * 2. Deduplicare strictă (previne duplicatele);
 * 3. Progres persistent la revenirea pe pagina Bibliotecii AI.
 */
export function useVaultUpload({ activeFolderId }: UseVaultUploadArgs) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tasks = useVaultUploadStore((s) => s.tasks);
  const enqueueFiles = useVaultUploadStore((s) => s.enqueueFiles);

  const activeTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'error');
  const loading = activeTasks.length > 0;
  const processStep = activeTasks[0]?.stepText ?? '';

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Resetăm valoarea inputului imediat pentru a permite selectarea aceluiași fișier dacă se dorește
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    const targetFolderId = activeFolderId === '__unfiled__' ? null : (activeFolderId ?? null);
    await enqueueFiles(files, targetFolderId);
  };

  return { loading, processStep, fileInputRef, handleFileUpload };
}
