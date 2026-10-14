import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Loader2, Plus } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAIStore } from '../../store/aiStore';
import SectionLabel from '../ui/SectionLabel';
import BookLibraryTools from './BookLibraryTools';
import { findRezidentiatRootFolder } from '../../lib/rezidentiatRoot';
import { isBundledLibraryBookName } from '../../lib/rezidentiatLibrary';
import { plural } from '../../lib/plural';
import { useResidencyBooks } from './useResidencyData';

const RECENT = 5;

interface Props {
  onAdd: () => void;
  /** Textul de progres cât se adaugă un PDF, sau null. */
  adding: string | null;
}

/**
 * Banca de materiale: capitolele, notele și culegerile studentului, indexate în Biblioteca AI. Completează cărțile de bază
 * (nu le înlocuiesc), deci secțiunea e mai compactă: câte sunt, ultimele adăugate, sincronizarea și adăugarea.
 */
export default function MaterialsBank({ onAdd, adding }: Props) {
  const theme = useTheme();
  const { books } = useResidencyBooks();
  const folders = useAIStore((state) => state.libraryFolders);
  const root = useMemo(() => findRezidentiatRootFolder(folders), [folders]);
  const materials = useMemo(() => books.filter((source) => !isBundledLibraryBookName(source.name)), [books]);
  const recent = useMemo(() => [...materials].sort((a, b) => b.addedAt - a.addedAt).slice(0, RECENT), [materials]);
  const fragments = useMemo(() => materials.reduce((sum, source) => sum + (source.chunkCount ?? 0), 0), [materials]);

  return (
    <section data-tutorial="residency-bank" aria-labelledby="materials-bank-title">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <SectionLabel className="mb-0"><span id="materials-bank-title">Banca de materiale</span></SectionLabel>
        <span className="px-1 text-[12px]" style={{ color: theme.text3 }}>Completează cărțile de bază</span>
      </div>
      <div className="glass-panel overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold" style={{ color: theme.text }}>
              {materials.length > 0 ? `${plural(materials.length, 'material', 'materiale')} indexate` : 'Încă nu ai materiale proprii'}
            </div>
            <div className="text-[12px]" style={{ color: theme.text3 }}>
              {materials.length > 0
                ? `${fragments.toLocaleString('ro-RO')} de fragmente · capitole, note și culegeri care întregesc răspunsurile din cărți`
                : 'Capitole, note și culegeri pe care le adaugi tu. Cărțile de bază merg și fără ele.'}
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            {root && materials.length > 0 && (
              <Link
                to={`/vault?folder=${root.id}`}
                className="fine-chip press-feedback rounded-full px-3 py-1.5 text-[12.5px] font-medium"
                style={{ color: theme.accentText }}
              >
                Biblioteca AI
              </Link>
            )}
            <button
              type="button"
              onClick={onAdd}
              disabled={adding !== null}
              className="fine-chip press-feedback inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-60"
              style={{ color: theme.accentText }}
            >
              {adding ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Plus size={13} aria-hidden />} Adaugă PDF
            </button>
          </div>
        </div>
        {adding && (
          <div role="status" className="truncate px-4 pb-3 text-[12px]" style={{ color: theme.text3 }}>{adding}</div>
        )}
        {recent.length > 0 && (
          <ul style={{ borderTop: '1px solid var(--hairline)' }}>
            {recent.map((source, index) => (
              <li key={source.id} style={{ borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}>
                <Link to={`/vault?source=${source.id}`} className="fine-row flex items-center gap-3 px-4 py-2.5" style={{ borderRadius: 0 }}>
                  <FileText size={15} aria-hidden style={{ color: theme.text3 }} />
                  <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: theme.text }}>{source.name.replace(/\.(pdf|docx|txt|md)$/i, '')}</span>
                  <span className="flex-shrink-0 text-[11.5px] tabular-nums" style={{ color: theme.text3 }}>
                    {source.indexStatus === 'indexing' ? 'se indexează' : source.indexStatus === 'error' ? 'eroare' : `${(source.chunkCount ?? 0).toLocaleString('ro-RO')} fragmente`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3">
        <BookLibraryTools />
      </div>
    </section>
  );
}
