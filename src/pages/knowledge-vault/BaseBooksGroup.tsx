import { useState } from 'react';
import { BookOpen, Loader2, Lock, RotateCcw } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useToastStore } from '../../store/toastStore';
import type { AIKnowledgeSource } from '../../store/aiStore';
import SectionLabel from '../../components/ui/SectionLabel';
import { dispatchOpenBook } from '../../components/pdf/bookRequest';
import { useBundledBookStatuses, type BundledBookStatus } from '../../lib/bundledBooks';
import { importRezidentiatLibraryBook } from '../../lib/rezidentiatLibrary';
import { bookOfSourceName } from '../../lib/curriculum';

/**
 * Cărțile de bază în Biblioteca AI: fixate sus, mereu aceleași trei, cu lacăt. Nu au meniu de mutare, redenumire sau ștergere:
 * vin cu aplicația și se pregătesc singure. Se deschid în cititorul cărții, fără niciun folder ales.
 */
export default function BaseBooksGroup({ onAsk }: { onAsk: (source: AIKnowledgeSource) => void }) {
  const theme = useTheme();
  const statuses = useBundledBookStatuses();
  const addToast = useToastStore((state) => state.addToast);
  const [retrying, setRetrying] = useState<string | null>(null);

  const retry = async (entry: BundledBookStatus) => {
    if (retrying) return;
    setRetrying(entry.book.id);
    try {
      await importRezidentiatLibraryBook(entry.book);
    } catch (error) {
      addToast(`Cartea nu s-a putut pregăti: ${error instanceof Error ? error.message : 'eroare necunoscută'}`, 'error', 5000);
    } finally {
      setRetrying(null);
    }
  };

  return (
    <section data-tutorial="vault-base-books" aria-labelledby="vault-base-books-title">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <SectionLabel className="mb-0"><span id="vault-base-books-title">Cărți de bază</span></SectionLabel>
        <span className="px-1 text-[12px]" style={{ color: theme.text3 }}>Incluse în aplicație · sursa de adevăr pentru Rezidențiat</span>
      </div>
      <div className="glass-panel overflow-hidden rounded-[var(--r-md)]">
        {statuses.map((entry, index) => {
          const code = bookOfSourceName(entry.book.name);
          return (
            <div
              key={entry.book.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              style={{ borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}
            >
              <div
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
                style={{ background: `${theme.accent}18`, color: theme.accentText }}
                aria-hidden
              >
                <Lock size={16} />
              </div>
              <div className="min-w-0 flex-1 basis-48">
                <div className="truncate text-[14px] font-semibold" style={{ color: theme.text }}>{entry.book.label}</div>
                <div className="truncate text-[12px]" role="status" style={{ color: entry.state === 'error' ? theme.danger : theme.text3 }}>
                  {entry.state === 'ready' && `Gata pentru căutare și AI${entry.source?.chunkCount ? ` · ${entry.source.chunkCount.toLocaleString('ro-RO')} fragmente` : ''}`}
                  {entry.state === 'indexing' && `Se pregătește pentru căutare · ${Math.round(entry.progress)}%`}
                  {entry.state === 'missing' && 'Se pregătește pentru căutare'}
                  {entry.state === 'error' && 'Pregătirea pentru căutare nu a reușit'}
                </div>
                {entry.state === 'indexing' && (
                  <div className="mt-1.5 h-[3px] overflow-hidden rounded-full" style={{ background: 'var(--fill-subtle)' }} aria-hidden>
                    <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(4, Math.round(entry.progress))}%`, background: theme.accent }} />
                  </div>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                {code && (
                  <button
                    type="button"
                    onClick={() => dispatchOpenBook({ book: code, pdfPage: 1 })}
                    className="press-feedback inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:brightness-110"
                    style={{ background: theme.accent }}
                    aria-label={`Deschide ${entry.book.label}`}
                  >
                    <BookOpen size={13} aria-hidden /> Deschide
                  </button>
                )}
                {entry.state === 'ready' && entry.source && (
                  <button
                    type="button"
                    onClick={() => onAsk(entry.source!)}
                    className="fine-chip press-feedback hidden rounded-full px-3 py-1.5 text-[12.5px] font-medium sm:block"
                    style={{ color: theme.accentText }}
                  >
                    Întreabă
                  </button>
                )}
                {entry.state === 'error' && (
                  <button
                    type="button"
                    disabled={retrying !== null}
                    onClick={() => void retry(entry)}
                    className="fine-chip press-feedback inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-60"
                    style={{ color: theme.accentText }}
                  >
                    {retrying === entry.book.id ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <RotateCcw size={13} aria-hidden />} Reîncearcă
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
