import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Library, Play, Plus, Shuffle } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import FxPage from '../components/fx/FxPage';
import PageHeader from '../components/ui/PageHeader';
import PageSkeleton from '../components/ui/PageSkeleton';
import EmptyState from '../components/ui/EmptyState';
import SectionLabel from '../components/ui/SectionLabel';
import ProgressRing from '../components/residency/ProgressRing';
import ImportQuizButton from '../components/ImportQuizButton';
import { ImportQuizFolderDialog } from '../components/residency/RezidentiatFlashcardDialogs';
import { useQuizStore } from '../store/quizStore';
import { useRezidentiatOverview } from '../components/residency/useResidencyData';
import { buildBankTree, type BankChapter } from '../lib/rezidentiatBankTree';
import { startQuizMix } from '../lib/quizMixSession';
import { plural } from '../lib/plural';
import type { SpecialtyOverview } from '../lib/rezidentiatOverview';

/** „Cardiologie — Test 3” devine „Test 3”: capitolul e deja titlul de deasupra. */
function shortTitle(title: string, name: string): string {
  const stripped = title.replace(name, '').replace(/^[\s—–:-]+/, '').trim();
  return stripped || title;
}

function ChapterRow({ node, open, onToggle, first }: { node: BankChapter; open: boolean; onToggle: () => void; first: boolean }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const next = node.quizzes[0];
  const single = node.specialties.length === 1 ? node.specialties[0] : null;
  return (
    <div style={{ borderTop: first ? undefined : '1px solid var(--hairline)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="fine-row flex w-full items-center gap-3 px-4 py-3 text-left"
        style={{ borderRadius: 0 }}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold" style={{ color: theme.text }}>{node.chapter.label}</div>
          <div className="text-[12px]" style={{ color: theme.text3 }}>
            {plural(node.quizzes.length, 'set', 'seturi')} · {plural(node.questionCount, 'grilă', 'grile')}
          </div>
        </div>
        <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: theme.text3 }}>{node.progress}%</span>
        <ChevronRight size={16} aria-hidden style={{ color: theme.text3, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 180ms ease' }} />
      </button>
      {open && (
        <div className="px-4 pb-3.5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {next && (
              <Link
                to={`/quiz/${next.id}`}
                className="press-feedback flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
                style={{ background: theme.accent }}
              >
                <Play size={13} aria-hidden /> {node.answered === 0 ? 'Începe' : 'Continuă'}
              </Link>
            )}
            {single && node.quizzes.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const id = startQuizMix(single.folder, node.quizzes, { title: `${node.chapter.title} — sesiune completă`, residency: true });
                  if (id) navigate(`/play/${id}`);
                }}
                className="fine-chip press-feedback flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium"
                style={{ color: theme.text2 }}
              >
                <Shuffle size={13} aria-hidden /> Joacă tot
              </button>
            )}
          </div>
          <div className="overflow-hidden rounded-[14px]" style={{ background: 'var(--fill-subtle)' }}>
            {node.quizzes.map((quiz, index) => (
              <Link
                key={quiz.id}
                to={`/quiz/${quiz.id}`}
                className="fine-row flex items-center gap-3 px-3.5 py-2.5"
                style={{ borderRadius: 0, borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold" style={{ color: theme.text }}>
                    {shortTitle(quiz.title, node.specialties.find((s) => s.quizzes.includes(quiz))?.name ?? node.chapter.title)}
                  </div>
                  <div className="text-[12px]" style={{ color: theme.text3 }}>{plural(quiz.questions.length, 'grilă', 'grile')}</div>
                </div>
                <ChevronRight size={15} aria-hidden style={{ color: theme.text3 }} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function otherHref(specialty: SpecialtyOverview): string {
  return specialty.loose ? `/rezidentiat/${specialty.folder.id}` : `/rezidentiat/${specialty.folder.parentId}?s=${specialty.folder.id}`;
}

/** „Banca de grile”: folderele Kumar și Lawrence, în fiecare capitolele cărții cu seturile de grile ale capitolului. */
export default function ResidencyBank() {
  const theme = useTheme();
  const overview = useRezidentiatOverview();
  const hydrated = useQuizStore((state) => state._hasHydrated);
  const tree = useMemo(() => buildBankTree(overview), [overview]);
  const [openChapter, setOpenChapter] = useState<number | null>(null);
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [importFolder, setImportFolder] = useState<string | null>(null);

  if (!hydrated) return <PageSkeleton />;

  return (
    <FxPage className="px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-7">
        <PageHeader
          back={{ to: '/rezidentiat', label: 'Rezidențiat' }}
          title="Banca de grile"
          subtitle={`${plural(tree.questionCount, 'grilă', 'grile')} · ${plural(tree.books.length, 'carte', 'cărți')}`}
          actions={(
            <button
              type="button"
              onClick={() => setChoosingFolder(true)}
              className="press-feedback flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold"
              style={{ color: theme.accentText, background: `${theme.accent}1F`, outline: `1px solid ${theme.accent}55` }}
            >
              <Plus size={15} strokeWidth={2.4} aria-hidden /> Adaugă grilele tale
            </button>
          )}
        />
        <ImportQuizFolderDialog
          open={choosingFolder}
          onClose={() => setChoosingFolder(false)}
          onChosen={(folderId) => { setChoosingFolder(false); setImportFolder(folderId); }}
        />
        {importFolder && <ImportQuizButton hideTrigger open targetFolderId={importFolder} onClose={() => setImportFolder(null)} />}

        {tree.books.length === 0 && tree.other.length === 0 && (
          <EmptyState icon={Library} title="Banca de grile e goală." primary={{ label: 'Înapoi la Rezidențiat', to: '/rezidentiat' }} />
        )}

        {tree.books.map((book) => (
          <section key={book.code} aria-label={book.name}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <SectionLabel className="mb-0">{book.short}</SectionLabel>
                <div className="px-1 text-[12px]" style={{ color: theme.text3 }}>
                  {book.name} · {plural(book.chapters.length, 'capitol', 'capitole')} · {plural(book.questionCount, 'grilă', 'grile')}
                </div>
              </div>
              <ProgressRing percent={book.progress} label={`${book.progress}% parcurs din ${book.short}`} />
            </div>
            <div className="glass-panel overflow-hidden rounded-2xl">
              {book.chapters.map((node, index) => (
                <ChapterRow
                  key={node.chapter.index}
                  node={node}
                  first={index === 0}
                  open={openChapter === node.chapter.index}
                  onToggle={() => setOpenChapter((current) => (current === node.chapter.index ? null : node.chapter.index))}
                />
              ))}
            </div>
          </section>
        ))}

        {tree.other.length > 0 && (
          <section aria-label="Grilele tale și alte seturi">
            <SectionLabel className="mb-2">Grilele tale și alte seturi</SectionLabel>
            <div className="glass-panel overflow-hidden rounded-2xl">
              {tree.other.map((specialty, index) => (
                <Link
                  key={specialty.folder.id}
                  to={otherHref(specialty)}
                  className="fine-row flex items-center gap-3 px-4 py-3"
                  style={{ borderRadius: 0, borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold" style={{ color: theme.text }}>{specialty.name}</div>
                    <div className="text-[12px]" style={{ color: theme.text3 }}>
                      {plural(specialty.quizzes.length, 'set', 'seturi')} · {plural(specialty.questionCount, 'grilă', 'grile')}
                    </div>
                  </div>
                  <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: theme.text3 }}>{specialty.progress}%</span>
                  <ChevronRight size={16} aria-hidden style={{ color: theme.text3 }} />
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </FxPage>
  );
}
