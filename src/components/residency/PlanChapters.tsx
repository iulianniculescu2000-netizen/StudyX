import { organizareChapterHref } from '../../lib/organizare/appLinks';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence } from 'framer-motion';
import { BookOpen, CalendarRange, ChevronDown, CreditCard, FileText, Layers, ListChecks, MessageCircle, Sparkles } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import ProgressBar from '../fx/ProgressBar';
import BookChapterReaderModal from '../BookChapterReaderModal';
import BookViewerHost from '../pdf/BookViewerHost';
import { requestForTopic } from '../pdf/bookRequest';
import type { BookViewRequest } from '../pdf/BookPdfReader';
import { bookChapterNumber } from '../../lib/bookPages';
import { isSourceReady, type AIKnowledgeSource } from '../../store/aiStore';
import { useQuizStore } from '../../store/quizStore';
import { useStatsStore } from '../../store/statsStore';
import { useSourceChapters } from '../../hooks/useSourceChapters';
import { getChapterFullText } from '../../lib/ai/bookChapterText';
import { chapterTopics, chaptersOfBook, type BookCode, type CurriculumChapter } from '../../lib/curriculum';
import type { Topic } from '../../lib/organizare/types';
import { fileForTopic, openStudyFile, askAboutTopic } from '../../lib/organizare/actions';
import { statusOf } from '../../lib/organizare/engine';
import type { RezidentiatOverview } from '../../lib/rezidentiatOverview';
import { ChapterAction, ChapterLink } from './ChapterChip';
import { bankForChapter, chapterCounts, chapterProgress, countsOf, matchIndexedChapters } from './chapterMatch';
import { useChapterActions } from './useChapterActions';
import type { PlanProgress } from './useResidencyData';
import { plural } from '../../lib/plural';

interface ReaderState {
  title: string;
  pageLabel: string;
  loading: boolean;
  content: string;
  /** Când e dat, capitolul se arată ca în PDF; textul e varianta de rezervă. */
  request?: BookViewRequest;
  heading?: string;
}


interface Props {
  code: BookCode;
  /** Cartea din bibliotecă; null când nu a fost adăugată (capitolele rămân vizibile, fără text). */
  source: AIKnowledgeSource | null;
  overview: RezidentiatOverview;
  plan: PlanProgress;
  /** Capitolul (index în plan) care se deschide și se aduce în vedere. */
  focusIndex?: number | null;
}

/**
 * Capitolele unei cărți așa cum sunt în planul din Organizare (aceleași numere și titluri), cu progresul real,
 * flashcardurile și grilele asociate și acțiunile pe capitol. Textul se citește doar unde capitolul s-a potrivit
 * cu cartea indexată; altfel capitolul rămâne la vedere, marcat „text indisponibil”.
 */
export default function PlanChapters({ code, source, overview, plan, focusIndex = null }: Props) {
  const theme = useTheme();
  const ready = !!source && isSourceReady(source);
  const { chapters: indexed, loading } = useSourceChapters(ready ? source.id : null);
  const matched = useMemo(() => matchIndexedChapters(code, indexed), [code, indexed]);
  const quizzes = useQuizStore((state) => state.quizzes);
  const questionStats = useStatsStore((state) => state.questionStats);
  const [now] = useState(() => Date.now());
  const counts = useMemo(() => chapterCounts(quizzes, questionStats, now), [quizzes, questionStats, now]);
  const actions = useChapterActions(source);
  const [openIndex, setOpenIndex] = useState<number | null>(focusIndex);
  const [reader, setReader] = useState<ReaderState | null>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  const chapters = useMemo(() => chaptersOfBook(code), [code]);
  const canOpenFile = typeof window !== 'undefined' && !!window.electronAPI?.organizareOpen;

  useEffect(() => {
    if (focusIndex !== null) focusRef.current?.scrollIntoView({ block: 'center' });
  }, [focusIndex, loading]);

  const readText = (heading: string) => (source ? getChapterFullText(source.id, heading) : Promise.reject(new Error('no source')));

  /** Citește capitolul: ca în PDF, la secțiunea dată; textul extras rămâne rezervă când PDF-ul lipsește. */
  const read = async (chapter: CurriculumChapter, heading: string | null, topic: Topic) => {
    const base = { title: chapter.label, pageLabel: plural(Math.round(chapter.pages), 'pagină', 'pagini') };
    setReader({ ...base, loading: false, content: '', request: requestForTopic(topic), heading: heading ?? undefined });
  };

  const unavailableReason = !source
    ? 'Cartea nu e în bibliotecă'
    : !ready
      ? 'Cartea nu e indexată încă'
      : 'Capitolul nu a fost găsit în textul indexat';

  if (loading) {
    return (
      <div className="space-y-2 py-4">
        <div className="skeleton-block h-12 rounded-xl" />
        <div className="skeleton-block h-12 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="py-1">
      {!source && (
        <p className="py-3 text-[12.5px]" style={{ color: theme.text3 }}>
          Cartea nu e în bibliotecă: capitolele rămân aici, dar fără text pentru citit sau AI. Adaug-o din Bibliotecă.
        </p>
      )}
      {chapters.map((chapter, position) => {
        const open = openIndex === chapter.index;
        const heading = matched.get(chapter.index) ?? null;
        const count = countsOf(counts, chapter.index);
        const progress = plan.state ? chapterProgress(chapter, plan.state, plan.phase) : null;
        const topics = chapterTopics(chapter);
        const firstOpen = topics.find((topic) => !plan.state || statusOf(plan.state, plan.phase, topic.index) < 2) ?? topics[0];
        const bank = open ? bankForChapter(overview, chapter) : null;
        const tags = ['rezidentiat', `chapter:${chapter.index}`, `book:${code}`];
        const meta = [
          plural(Math.round(chapter.pages), 'pagină', 'pagini'),
          plural(chapter.topicIndexes.length, 'topic', 'topicuri'),
          count.cards > 0 ? `${plural(count.cards, 'card', 'carduri')}${count.due > 0 ? ` · ${count.due} scadente` : ''}` : null,
          count.grile > 0 ? plural(count.grile, 'grilă', 'grile') : null,
        ].filter(Boolean).join(' · ');

        return (
          <div
            key={chapter.index}
            ref={focusIndex === chapter.index ? focusRef : undefined}
            className="fx-rise"
            style={{ '--i': Math.min(position, 8), borderTop: position === 0 ? undefined : '1px solid var(--hairline)' } as CSSProperties}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : chapter.index)}
              aria-expanded={open}
              className="fine-row -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 px-2 py-3 text-left"
            >
              <span
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold tabular-nums"
                style={{ background: 'var(--accent-soft)', color: theme.accentText }}
              >
                {bookChapterNumber(topics[0]?.chapter) ?? chapter.number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold" style={{ color: theme.text }}>{chapter.title}</span>
                <span className="block truncate text-[11.5px]" style={{ color: theme.text3 }}>
                  {meta}
                </span>
              </span>
              {progress && (
                <span className="flex-shrink-0 text-[11.5px] font-semibold tabular-nums" style={{ color: progress.done === progress.total ? theme.success : theme.text3 }}>
                  {progress.done}/{progress.total}
                </span>
              )}
              <ChevronDown size={15} className="flex-shrink-0 transition-transform" style={{ color: theme.text3, transform: open ? 'rotate(180deg)' : undefined }} />
            </button>

            {progress && progress.done + progress.inProgress > 0 && (
              <div className="pb-2.5 pl-10">
                <ProgressBar
                  percent={progress.percent}
                  color={progress.done === progress.total ? theme.success : theme.accent}
                  label={`Progres ${chapter.title} în trecerea ${plan.phase}`}
                />
              </div>
            )}

            {open && (
              <div className="fx-rise space-y-3 pb-3.5 pl-10">
                <ul className="space-y-1">
                  {topics.map((topic) => {
                    const status = plan.state ? statusOf(plan.state, plan.phase, topic.index) : 0;
                    const color = status === 2 ? theme.success : status === 1 ? theme.warning : 'var(--hairline)';
                    return (
                      <li key={topic.index} className="flex items-center gap-2 text-[12.5px]" style={{ color: status === 2 ? theme.text3 : theme.text2 }}>
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{topic.name}</span>
                        <span className="flex-shrink-0 text-[11px] tabular-nums" style={{ color: theme.text3 }}>{topic.src.replace(/^\w+ p\./, 'p. ')}</span>
                        <button
                          type="button"
                          onClick={() => void read(chapter, heading?.heading ?? null, topic)}
                          aria-label={`Citește ${topic.name} în PDF`}
                          title="Citește în PDF"
                          className="flex-shrink-0 rounded-full p-1 focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]"
                          style={{ color: theme.text3 }}
                        >
                          <FileText size={12} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {!heading && (
                  <p className="text-[11.5px]" style={{ color: theme.text3 }}>
                    {unavailableReason}: capitolul se citește oricum (cartea vine cu aplicația); grilele și cardurile se fac după titlul și paginile din plan.
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <ChapterAction
                    icon={<BookOpen size={12} />}
                    label="Citește"
                    title="Paginile cărții, exact ca în PDF"
                    onClick={() => void read(chapter, heading?.heading ?? null, firstOpen)}
                  />
                  <ChapterAction
                    icon={<MessageCircle size={12} />}
                    label="Explică cu AI"
                    onClick={() => (heading ? actions.discuss(heading.heading, chapter.label) : askAboutTopic('explain', firstOpen))}
                  />
                  <ChapterAction
                    icon={<Sparkles size={12} />}
                    label="Generează grile"
                    onClick={() => (heading ? actions.generateQuiz(heading.heading, chapter.label) : askAboutTopic('quiz', firstOpen))}
                  />
                  <ChapterAction
                    icon={<CreditCard size={12} />}
                    label="Generează carduri"
                    busy={!!heading && actions.generatingHeading === heading.heading}
                    onClick={() => (heading ? void actions.generateCards(heading.heading, chapter.label, tags) : askAboutTopic('cards', firstOpen))}
                  />
                  {count.cards > 0 && (
                    <ChapterLink icon={<Layers size={12} />} label={`Flashcarduri · ${count.cards.toLocaleString('ro-RO')}`} to={`/rezidentiat/flashcarduri?chapter=${chapter.index}`} />
                  )}
                  {bank && (
                    <ChapterLink icon={<ListChecks size={12} />} label={`Grile din aplicație${bank.count > 0 ? ` · ${bank.count.toLocaleString('ro-RO')}` : ''}`} to={bank.href} />
                  )}
                  <ChapterLink icon={<CalendarRange size={12} />} label="Deschide în Organizare" to={organizareChapterHref(chapter.index, { phase: plan.phase })} />
                  {canOpenFile && (
                    <ChapterAction
                      icon={<FileText size={12} />}
                      label={topics[0].file ? 'Deschide fișierul' : 'Deschide cartea'}
                      onClick={() => void openStudyFile(plan.profileId, fileForTopic(topics[0]))}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <AnimatePresence>
        {reader && (
          <BookChapterReaderModal
            title={reader.title}
            pageLabel={reader.pageLabel}
            loading={reader.loading}
            content={reader.content}
            request={reader.request}
            loadText={reader.heading && source ? () => readText(reader.heading!) : undefined}
            onClose={() => setReader(null)}
          />
        )}
      </AnimatePresence>
      <BookViewerHost />
    </div>
  );
}
