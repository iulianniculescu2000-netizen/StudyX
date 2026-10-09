import { useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import SectionLabel from '../ui/SectionLabel';
import { useAIStore } from '../../store/aiStore';
import { useQuizStore } from '../../store/quizStore';
import { useToastStore } from '../../store/toastStore';
import { importRezidentiatBank, isBankImported, REZIDENTIAT_BANKS } from '../../lib/rezidentiatBank';
import { importRezidentiatLibraryBook, isLibraryBookImported, REZIDENTIAT_LIBRARY_BOOKS } from '../../lib/rezidentiatLibrary';

interface PendingItem {
  key: string;
  label: string;
  description: string;
  run: () => Promise<string>;
}

/**
 * Bundled content (real question banks, reference books) that hasn't been
 * added yet. Renders nothing once everything is imported, so a future bank or
 * book added to the registries shows up here on its own.
 */
export default function ImportPanel() {
  const theme = useTheme();
  const addToast = useToastStore((state) => state.addToast);
  const quizzes = useQuizStore((state) => state.quizzes);
  const knowledgeSources = useAIStore((state) => state.knowledgeSources);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const pending = useMemo<PendingItem[]>(() => {
    const banks = REZIDENTIAT_BANKS.filter((bank) => !isBankImported(bank)).map((bank) => ({
      key: `bank:${bank.id}`,
      label: bank.label,
      description: bank.description,
      run: async () => {
        const result = await importRezidentiatBank(bank);
        return `${bank.label}: ${result.quizzes} seturi, ${result.questions} grile adăugate.`;
      },
    }));
    const books = REZIDENTIAT_LIBRARY_BOOKS.filter((book) => !isLibraryBookImported(book)).map((book) => ({
      key: `book:${book.id}`,
      label: book.label,
      description: book.description,
      run: async () => {
        await importRezidentiatLibraryBook(book);
        return `${book.label} adăugată în bibliotecă.`;
      },
    }));
    return [...banks, ...books];
    // Re-evaluated whenever either store changes (e.g. right after an import).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizzes, knowledgeSources]);

  const runItems = async (items: PendingItem[], busy: string) => {
    if (busyKey) return;
    setBusyKey(busy);
    try {
      for (const item of items) addToast(await item.run(), 'success', 5000);
    } catch (error) {
      addToast(`Import eșuat: ${error instanceof Error ? error.message : 'eroare necunoscută'}`, 'error', 5000);
    } finally {
      setBusyKey(null);
    }
  };

  if (pending.length === 0) return null;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>De adăugat</SectionLabel>
        {pending.length > 1 && (
          <button
            type="button"
            onClick={() => void runItems(pending, 'all')}
            disabled={!!busyKey}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold disabled:opacity-60"
            style={{ color: theme.accentText }}
          >
            {busyKey === 'all' && <Loader2 size={12} className="animate-spin" />}
            Adaugă tot
          </button>
        )}
      </div>
      <div className="glass-panel overflow-hidden rounded-2xl">
        {pending.map((item, index) => (
          <div
            key={item.key}
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold" style={{ color: theme.text }}>{item.label}</div>
              <div className="truncate text-[12px]" style={{ color: theme.text3 }}>{item.description}</div>
            </div>
            <button
              type="button"
              onClick={() => void runItems([item], item.key)}
              disabled={!!busyKey}
              className="fine-chip press-feedback flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-60"
              style={{ color: theme.accentText }}
            >
              {busyKey === item.key || busyKey === 'all' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              Adaugă
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
