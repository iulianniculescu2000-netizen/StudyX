import { useState, type CSSProperties } from 'react';
import { BookOpen, ChevronDown, Loader2, Lock, MessageCircle, RotateCcw } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useToastStore } from '../../store/toastStore';
import { useUIStore } from '../../store/uiStore';
import SectionLabel from '../ui/SectionLabel';
import PlanChapters from './PlanChapters';
import { dispatchOpenBook } from '../pdf/bookRequest';
import { useBundledBookStatuses, type BundledBookStatus } from '../../lib/bundledBooks';
import { importRezidentiatLibraryBook } from '../../lib/rezidentiatLibrary';
import { BOOK_FILES } from '../../lib/bookPages';
import { BOOK_SHORT, bookOfSourceName, chaptersOfBook, type BookCode } from '../../lib/curriculum';
import { plural } from '../../lib/plural';
import type { RezidentiatOverview } from '../../lib/rezidentiatOverview';
import type { PlanProgress } from './useResidencyData';

/** Ce conține fiecare carte, într-o frază, și numărul de pagini din PDF-ul inclus (din numele fișierului). */
const BOOK_BLURB: Record<BookCode, string> = {
  K: 'Medicină internă: capitolele de rezidențiat, cu sumar, tabele și figuri.',
  L: 'Chirurgie generală și specialități chirurgicale.',
  S: 'Sinopsis pe specialități: dermatologie, pediatrie, obstetrică-ginecologie și altele.',
};

const pagesOf = (code: BookCode) => Number(/\((\d+) p\)/.exec(BOOK_FILES[code])?.[1] ?? 0);

interface Props {
  overview: RezidentiatOverview;
  plan: PlanProgress;
  /** Cartea și capitolul de deschis (ex. „Continuă de unde ai rămas”); `token` schimbat redeschide aceeași țintă. */
  focus?: { code: BookCode; index: number; token: number } | null;
}

/**
 * Cele trei cărți de bază: sursa de adevăr pentru Rezidențiat. Vin cu aplicația (nu se adaugă, nu se șterg), se deschid
 * imediat în cititor și se pregătesc singure pentru căutare și AI; starea pregătirii se arată discret în card.
 */
export default function BundledBooksSection({ overview, plan, focus = null }: Props) {
  const theme = useTheme();
  const statuses = useBundledBookStatuses();
  const addToast = useToastStore((state) => state.addToast);
  const setChatOpen = useUIStore((state) => state.setChatOpen);
  const [expanded, setExpanded] = useState<BookCode | null>(focus?.code ?? null);
  const [seenToken, setSeenToken] = useState(focus?.token ?? 0);
  const [retrying, setRetrying] = useState<string | null>(null);
  if (focus && focus.token !== seenToken) {
    setSeenToken(focus.token);
    setExpanded(focus.code);
  }

  const tints: Record<BookCode, string> = { K: theme.accent, L: theme.accent2, S: theme.success };

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

  const ask = (entry: BundledBookStatus, code: BookCode) => {
    if (!entry.source) return;
    setChatOpen(true);
    window.dispatchEvent(new CustomEvent('studyx:ai-prompt', {
      detail: { open: true, view: 'chat', mode: 'grounded', sourceId: entry.source.id, sourceName: entry.source.name, resetConversation: true, prompt: `Din ${BOOK_SHORT[code]}: ` },
    }));
  };

  const openEntry = statuses.find((entry) => bookOfSourceName(entry.book.name) === expanded) ?? null;

  return (
    <section data-tutorial="residency-books" aria-labelledby="bundled-books-title">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <SectionLabel className="mb-0"><span id="bundled-books-title">Cărțile de bază</span></SectionLabel>
        <span className="px-1 text-[12px]" style={{ color: theme.text3 }}>Sursa de adevăr pentru Rezidențiat</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {statuses.map((entry, position) => {
          const code = bookOfSourceName(entry.book.name);
          if (!code) return null;
          const tint = tints[code];
          const isOpen = expanded === code;
          const chapterCount = chaptersOfBook(code).length;
          return (
            <article
              key={entry.book.id}
              className="glass-panel fx-lift fx-spot fx-rise flex flex-col rounded-2xl p-4"
              style={{ '--i': position + 1 } as CSSProperties}
              aria-label={entry.book.label}
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  aria-hidden
                  className="relative flex h-[84px] w-[64px] flex-shrink-0 items-end justify-center overflow-hidden rounded-[var(--r-sm)] pb-2.5"
                  style={{ background: `linear-gradient(160deg, ${tint}40, ${tint}12)`, outline: `1px solid ${tint}38`, color: tint }}
                >
                  <span className="absolute left-2 top-0 h-full w-px" style={{ background: `${tint}40` }} />
                  <span className="absolute inset-x-3 top-3 h-px" style={{ background: `${tint}40` }} />
                  <span className="absolute inset-x-3 top-5 h-px" style={{ background: `${tint}26` }} />
                  <BookOpen size={20} />
                </div>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-medium uppercase tracking-wide"
                  style={{ background: 'var(--fill-subtle)', color: theme.text2 }}
                >
                  <Lock size={10} aria-hidden /> Inclusă în aplicație
                </span>
              </div>

              <h3 className="mt-3 text-[15px] font-semibold leading-snug" style={{ color: theme.text }}>{entry.book.label}</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: theme.text3 }}>{BOOK_BLURB[code]}</p>
              <p className="mt-2 text-[12px] tabular-nums" style={{ color: theme.text2 }}>
                {plural(pagesOf(code), 'pagină', 'pagini')} · {plural(chapterCount, 'capitol', 'capitole')}
              </p>

              <div className="mt-2 min-h-[18px] text-[12px]" role="status">
                {entry.state === 'ready' && (
                  <span className="inline-flex items-center gap-1.5" style={{ color: theme.text3 }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: theme.success }} aria-hidden /> Gata pentru căutare și AI
                  </span>
                )}
                {entry.state === 'indexing' && (
                  <div>
                    <span style={{ color: theme.text3 }}>Se pregătește pentru căutare · {Math.round(entry.progress)}%</span>
                    <div className="mt-1.5 h-[3px] overflow-hidden rounded-full" style={{ background: 'var(--fill-subtle)' }} aria-hidden>
                      <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(4, Math.round(entry.progress))}%`, background: tint }} />
                    </div>
                  </div>
                )}
                {entry.state === 'missing' && (
                  <span className="inline-flex items-center gap-1.5" style={{ color: theme.text3 }}>
                    <Loader2 size={12} className="animate-spin" aria-hidden /> Se pregătește pentru căutare
                  </span>
                )}
                {entry.state === 'error' && (
                  <span style={{ color: theme.danger }}>Pregătirea pentru căutare nu a reușit.</span>
                )}
              </div>

              <div className="mt-auto space-y-1.5 pt-3.5">
                <button
                  type="button"
                  onClick={() => dispatchOpenBook({ book: code, pdfPage: 1 })}
                  className="press-feedback flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
                  style={{ background: theme.accent }}
                  aria-label={`Deschide ${entry.book.label}`}
                >
                  <BookOpen size={14} aria-hidden /> Deschide
                </button>
                <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : code)}
                  aria-expanded={isOpen}
                  className="fine-chip press-feedback flex flex-1 items-center justify-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium"
                  style={{ color: theme.accentText }}
                >
                  Capitole <ChevronDown size={13} aria-hidden className="transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />
                </button>
                {entry.state === 'ready' && (
                  <button
                    type="button"
                    onClick={() => ask(entry, code)}
                    className="fine-chip press-feedback flex flex-1 items-center justify-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium"
                    style={{ color: theme.accentText }}
                  >
                    <MessageCircle size={13} aria-hidden /> Întreabă
                  </button>
                )}
                {(entry.state === 'error' || entry.state === 'missing') && (
                  <button
                    type="button"
                    disabled={retrying !== null}
                    onClick={() => void retry(entry)}
                    className="fine-chip press-feedback flex flex-1 items-center justify-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-60"
                    style={{ color: theme.accentText }}
                  >
                    {retrying === entry.book.id ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <RotateCcw size={13} aria-hidden />}
                    {entry.state === 'error' ? 'Reîncearcă' : 'Pornește acum'}
                  </button>
                )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {openEntry && expanded && (
        <div className="glass-panel fx-rise mt-3 overflow-hidden rounded-2xl px-4">
          <div className="flex items-center justify-between gap-3 py-3">
            <h3 className="text-[14px] font-semibold" style={{ color: theme.text }}>{openEntry.book.label} · capitole</h3>
            <button
              type="button"
              onClick={() => setExpanded(null)}
              className="fine-chip press-feedback rounded-full px-3 py-1.5 text-[12.5px] font-medium"
              style={{ color: theme.text2 }}
            >
              Închide
            </button>
          </div>
          <div style={{ borderTop: '1px solid var(--hairline)' }}>
            <PlanChapters
              code={expanded}
              source={openEntry.source ?? null}
              overview={overview}
              plan={plan}
              focusIndex={focus?.code === expanded ? focus.index : null}
            />
          </div>
        </div>
      )}
    </section>
  );
}
