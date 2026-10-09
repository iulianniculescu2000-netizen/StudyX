import { useRef, useState, type ChangeEvent } from 'react';
import { useAIStore } from '../store/aiStore';
import { useToastStore } from '../store/toastStore';
import { friendlyAIError } from '../lib/ai/friendlyError';
import { findOrCreateRezidentiatLibraryRoot } from '../lib/rezidentiatRoot';

/**
 * Adaugă un PDF direct în cărțile de Rezidențiat (folderul „Rezidențiat” din biblioteca AI, ascuns din Biblioteca AI).
 * Întoarce un buton de deschidere a selectorului și proprietățile inputului ascuns.
 */
export function useAddRezidentiatBook() {
  const addToast = useToastStore((state) => state.addToast);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter((file) => file.name.toLowerCase().endsWith('.pdf'));
    event.target.value = '';
    if (files.length === 0) return;
    try {
      const { parsePDF } = await import('../ai/pdfParser');
      for (const [index, file] of files.entries()) {
        const prefix = files.length > 1 ? `[${index + 1}/${files.length}] ` : '';
        setBusy(`${prefix}Citim ${file.name}…`);
        const text = await parsePDF(file);
        setBusy(`${prefix}Indexăm ${file.name}…`);
        const store = useAIStore.getState();
        const source = await store.addKnowledgeSource(file.name, text, 'pdf', {
          onIndexProgress: ({ percent }) => setBusy(`${prefix}Indexăm ${file.name}… ${percent}%`),
        });
        store.moveSourceToLibraryFolder(source.id, findOrCreateRezidentiatLibraryRoot());
        addToast(`„${file.name}” a intrat în cărțile tale.`, 'success');
      }
    } catch (error) {
      addToast(friendlyAIError(error) || 'Cartea nu a putut fi adăugată.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return {
    busy,
    open: () => { if (!busy) inputRef.current?.click(); },
    inputProps: { type: 'file' as const, ref: inputRef, accept: '.pdf,application/pdf', multiple: true, className: 'hidden', onChange },
  };
}
