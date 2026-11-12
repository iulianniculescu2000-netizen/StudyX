import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Loader2, Sparkles, X } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useFolderStore } from '../../store/folderStore';
import { useToastStore } from '../../store/toastStore';
import { OPEN_BOOK_EVENT, type OpenBookDetail } from '../ai-chat/citations';
import { parseSchema } from '../ai-chat/schemaDsl';
import { renderDiagramSvg } from '../ai-chat/diagram';
import { sanitizeSvg } from '../ai-chat/sanitize';
import DiagramFrame from '../ai-chat/DiagramFrame';
import { friendlyAIError } from '../../lib/ai/friendlyError';
import { frontsInFolder } from '../../lib/ai/flashcardAuthor';
import {
  DEFAULT_PROPOSED_CARDS,
  MAX_PROPOSED_CARDS,
  MIN_PROPOSED_CARDS,
  NO_AI_KEY_MESSAGE,
  NoAIKeyError,
  buildAcceptedDeck,
  citationLabel,
  generateBookProposals,
  saveAcceptedProposals,
  type BookCitation,
  type ProposalSet,
} from '../../lib/ai/bookStudyProposals';
import { chapterTopics, type CurriculumChapter } from '../../lib/curriculum';
import { chapterPageRange } from '../../lib/bookText';
import { useAIStore } from '../../store/aiStore';
import { FLASHCARDS_ROOT_CHOICE, describeFolderChoice, resolveFolderChoice, type FolderChoice } from '../../lib/rezidentiatFlashcardFolders';
import { plural } from '../../lib/plural';
import ModalShell from '../ui/ModalShell';
import { FieldLabel, Stepper } from '../ui/FormControls';
import FolderChoiceField from './FolderChoiceField';

interface Props {
  open: boolean;
  chapter: CurriculumChapter;
  onClose: () => void;
}

type Decision = 'accepted' | 'rejected';

const DEFAULT_CHOICE: FolderChoice = { mode: 'existing', id: FLASHCARDS_ROOT_CHOICE };

function openInBook(citation: BookCitation) {
  const detail: OpenBookDetail = { book: citation.book, pdfPage: citation.page };
  window.dispatchEvent(new CustomEvent<OpenBookDetail>(OPEN_BOOK_EVENT, { detail }));
}

function CitationLine({ citation }: { citation: BookCitation }) {
  const theme = useTheme();
  return (
    <div className="mt-2 flex items-start gap-2 text-[11.5px]" style={{ color: theme.text3 }}>
      <button
        type="button"
        onClick={() => openInBook(citation)}
        aria-label={`Deschide în carte: ${citationLabel(citation)}`}
        className="press-feedback inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
        style={{ background: theme.surface2, color: theme.text2 }}
      >
        <BookOpen size={11} aria-hidden />
        {citationLabel(citation)}
      </button>
      <span className="min-w-0 italic">„{citation.quote}”</span>
    </div>
  );
}

function DecisionButtons({ value, onChange, label }: { value: Decision | undefined; onChange: (next: Decision | undefined) => void; label: string }) {
  const theme = useTheme();
  const base = 'press-feedback inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-semibold';
  return (
    <div className="flex flex-shrink-0 gap-1.5" role="group" aria-label={label}>
      <button
        type="button"
        aria-pressed={value === 'accepted'}
        aria-label={`Acceptă: ${label}`}
        onClick={() => onChange(value === 'accepted' ? undefined : 'accepted')}
        className={base}
        style={{ background: value === 'accepted' ? theme.accent : theme.surface2, color: value === 'accepted' ? '#fff' : theme.text2 }}
      >
        <Check size={13} aria-hidden /> Acceptă
      </button>
      <button
        type="button"
        aria-pressed={value === 'rejected'}
        aria-label={`Respinge: ${label}`}
        onClick={() => onChange(value === 'rejected' ? undefined : 'rejected')}
        className={base}
        style={{ background: value === 'rejected' ? theme.surface : theme.surface2, color: value === 'rejected' ? theme.text3 : theme.text2, outline: value === 'rejected' ? `1px solid ${theme.border}` : 'none' }}
      >
        <X size={13} aria-hidden /> Respinge
      </button>
    </div>
  );
}

/**
 * Schemă și carduri propuse din paginile unui capitol, fiecare cu citare verificată la pagină. Nimic nu se salvează
 * până nu apeși „Salvează”, și doar ce ai acceptat. Textul cărții nu apare aici, doar citatul scurt și pagina.
 */
export default function BookProposalsDialog({ open, chapter, onClose }: Props) {
  const theme = useTheme();
  const addToast = useToastStore((state) => state.addToast);
  const folders = useFolderStore((state) => state.folders);
  const defaultRange = useMemo(() => {
    const first = chapterTopics(chapter)[0];
    return (first && chapterPageRange(first)) ?? { first: 1, last: 1 };
  }, [chapter]);
  const [from, setFrom] = useState(String(defaultRange.first));
  const [to, setTo] = useState(String(defaultRange.last));
  const [count, setCount] = useState(DEFAULT_PROPOSED_CARDS);
  const [choice, setChoice] = useState<FolderChoice>(DEFAULT_CHOICE);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProposalSet | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision | undefined>>({});
  const abortRef = useRef<AbortController | null>(null);
  const keyed = useAIStore((state) => !!state.apiKey.trim() || Object.values(state.providerKeys).some((key) => !!key?.trim()));

  useEffect(() => () => abortRef.current?.abort(), []);

  const decide = (id: string, next: Decision | undefined) => setDecisions((current) => ({ ...current, [id]: next }));
  const schemaSvg = useMemo(() => {
    if (!result?.schema) return null;
    const parsed = parseSchema(result.schema.code);
    return parsed ? sanitizeSvg(renderDiagramSvg(parsed)) : null;
  }, [result]);

  const acceptedCards = result?.cards.filter((card) => decisions[card.id] === 'accepted') ?? [];
  const schemaAccepted = !!result?.schema && decisions[result.schema.id] === 'accepted';
  const acceptedCount = acceptedCards.length + (schemaAccepted ? 1 : 0);

  const close = () => { abortRef.current?.abort(); onClose(); };

  const generate = async () => {
    const first = Math.round(Number(from));
    const last = Math.round(Number(to));
    if (!Number.isFinite(first) || !Number.isFinite(last) || first < 1 || last < first) {
      setError('Alege un interval de pagini valid, de exemplu 120 până la 135.');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    setDecisions({});
    try {
      const folderId = choice.mode === 'existing' && choice.id !== FLASHCARDS_ROOT_CHOICE ? choice.id : null;
      const set = await generateBookProposals({
        book: chapter.book,
        range: { first, last },
        topic: chapter.title,
        count,
        avoidFronts: frontsInFolder(folderId),
        signal: controller.signal,
        onProgress: (done, total) => setProgress([done, total]),
      });
      if (!controller.signal.aborted) setResult(set);
    } catch (e) {
      if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      setError(e instanceof NoAIKeyError ? e.message : friendlyAIError(e));
    } finally {
      if (abortRef.current === controller) setBusy(false);
    }
  };

  const save = () => {
    if (!result || acceptedCount === 0) return;
    try {
      const folderId = resolveFolderChoice(choice);
      const deck = buildAcceptedDeck(
        { cards: acceptedCards, schema: schemaAccepted ? result.schema : null },
        { title: `${chapter.title} · din carte`, topic: chapter.title, book: chapter.book, folderId },
      );
      saveAcceptedProposals(deck);
      addToast(`Am salvat ${plural(acceptedCount, 'propunere acceptată', 'propuneri acceptate')} în ${describeFolderChoice(choice, folders)}.`, 'success');
      onClose();
    } catch (e) {
      addToast(friendlyAIError(e), 'error');
    }
  };

  const footer = (
    <>
      <button type="button" onClick={close} className="press-feedback rounded-full px-4 py-2.5 text-[13px] font-semibold" style={{ background: theme.surface2, color: theme.text2 }}>
        Închide
      </button>
      {result && (
        <button
          type="button"
          onClick={save}
          disabled={acceptedCount === 0}
          className="press-feedback rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-45"
          style={{ background: theme.accent }}
        >
          {acceptedCount === 0 ? 'Salvează' : `Salvează ${acceptedCount}`}
        </button>
      )}
    </>
  );

  return (
    <ModalShell
      open={open}
      title="Schemă și carduri din carte"
      subtitle={`${chapter.title}. Fiecare propunere vine cu pagina și un citat din carte; salvezi doar ce accepți.`}
      onClose={close}
      width="lg"
      footer={footer}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <FieldLabel>De la pagina</FieldLabel>
          <input type="number" min={1} value={from} onChange={(event) => setFrom(event.target.value)} aria-label="De la pagina" className="w-full text-[13.5px]" />
        </label>
        <label className="block">
          <FieldLabel>Până la pagina</FieldLabel>
          <input type="number" min={1} value={to} onChange={(event) => setTo(event.target.value)} aria-label="Până la pagina" className="w-full text-[13.5px]" />
        </label>
      </div>
      <Stepper label="Câte carduri" value={count} min={MIN_PROPOSED_CARDS} max={MAX_PROPOSED_CARDS} onChange={setCount} />
      <FolderChoiceField value={choice} onChange={setChoice} label="Unde le salvăm" />

      {!keyed && (
        <p role="status" className="rounded-[14px] px-3 py-2.5 text-[12.5px]" style={{ background: theme.surface2, color: theme.text2 }}>{NO_AI_KEY_MESSAGE}</p>
      )}
      {error && (
        <p role="alert" className="rounded-[14px] px-3 py-2.5 text-[12.5px]" style={{ background: theme.surface2, color: theme.danger }}>{error}</p>
      )}

      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy || !keyed}
        className="press-feedback inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-45"
        style={{ background: theme.accent }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
        {busy ? `Pregătesc propunerile${progress[1] ? ` (${progress[0]}/${progress[1]})` : ''}…` : result ? 'Propune din nou' : 'Propune schemă și carduri'}
      </button>

      {result && (
        <div className="space-y-4" aria-live="polite">
          {result.warnings.map((warning) => (
            <p key={warning} className="text-[12px]" style={{ color: theme.text3 }}>{warning}</p>
          ))}
          {result.rejected > 0 && (
            <p className="text-[12px]" style={{ color: theme.text3 }}>
              {plural(result.rejected, 'propunere a fost aruncată', 'propuneri au fost aruncate')} pentru că citarea nu s-a regăsit în paginile alese.
            </p>
          )}

          {result.schema && (
            <section aria-label="Schema propusă" className="rounded-[14px] p-3" style={{ background: theme.surface2 }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: theme.text3 }}>Schemă</p>
                  <p className="text-[14px] font-semibold" style={{ color: theme.text }}>{result.schema.title}</p>
                </div>
                <DecisionButtons value={decisions[result.schema.id]} onChange={(next) => decide(result.schema!.id, next)} label={`schema ${result.schema.title}`} />
              </div>
              {schemaSvg ? <div className="mt-3"><DiagramFrame svg={schemaSvg} code={result.schema.code} /></div> : (
                <pre className="mt-3 overflow-x-auto text-[12px]" style={{ color: theme.text2 }}>{result.schema.code}</pre>
              )}
              {result.schema.citations.map((citation) => <CitationLine key={`${citation.page}-${citation.quote}`} citation={citation} />)}
            </section>
          )}

          <ul className="space-y-2">
            {result.cards.map((card) => (
              <li key={card.id} className="rounded-[14px] p-3" style={{ background: theme.surface2, opacity: decisions[card.id] === 'rejected' ? 0.55 : 1 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold" style={{ color: theme.text }}>{card.front}</p>
                    <p className="mt-1 text-[13px]" style={{ color: theme.text2 }}>{card.back}</p>
                  </div>
                  <DecisionButtons value={decisions[card.id]} onChange={(next) => decide(card.id, next)} label={card.front} />
                </div>
                <CitationLine citation={card.citation} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </ModalShell>
  );
}
