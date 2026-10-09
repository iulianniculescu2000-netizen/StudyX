import { Link } from 'react-router-dom';
import { ChevronRight, Play } from 'lucide-react';
import type { Theme } from '../../theme/themes';
import { dueLabel, progressSegments, type DeckStats, type DueSummary } from '../../lib/flashcardTreeView';

/** Bucăți comune pentru vederea „Pe capitole” și pentru secțiunile de capitole din arborele de pachete. */

const pill = 'flex-shrink-0 rounded-full px-1.5 py-px text-[11px] font-semibold';

/** Bară subțire: stăpânite / în învățare / noi. */
export function SegmentedBar({ stats, theme, className = 'w-16' }: { stats: DeckStats; theme: Theme; className?: string }) {
  const { known, learning, fresh } = progressSegments(stats);
  const label = `${stats.mastered} stăpânite, ${Math.max(0, stats.seen - stats.mastered)} în învățare, ${Math.max(0, stats.total - stats.seen)} noi`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`flex h-1 flex-shrink-0 overflow-hidden rounded-full ${className}`}
      style={{ background: 'var(--fill-subtle)' }}
    >
      <span style={{ width: `${known}%`, background: theme.success }} />
      <span style={{ width: `${learning}%`, background: theme.accent, opacity: 0.55 }} />
      <span style={{ width: `${fresh}%` }} />
    </span>
  );
}

export function DueBadge({ count, theme }: { count: number; theme: Theme }) {
  return (
    <span className={`${pill} tabular-nums`} style={{ color: theme.warning, background: `${theme.warning}1f` }}>
      {dueLabel(count)}
    </span>
  );
}

/** Punct discret în loc de insigna „nou”: pachetul n-a fost început. */
export function NewDot({ theme }: { theme: Theme }) {
  return (
    <span
      role="img"
      aria-label="nou"
      title="nou"
      className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
      style={{ background: theme.accent }}
    />
  );
}

export function BookTag({ tag, theme }: { tag: string; theme: Theme }) {
  return (
    <span
      className="flex-shrink-0 rounded-[var(--r-sm)] px-1.5 py-px text-[10.5px] font-medium tabular-nums"
      style={{ color: theme.text3, background: 'var(--fill-subtle)' }}
      title={`${tag} în carte`}
    >
      {tag}
    </span>
  );
}

export function RepeatLink({ to, label, theme }: { to: string; label: string; theme: Theme }) {
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className="focus-ring press-feedback flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ color: theme.accentText, background: `${theme.accent}14` }}
    >
      <Play size={10} aria-hidden="true" fill="currentColor" /> Repetă
    </Link>
  );
}

const cardsWord = (count: number) => (count === 1 ? '1 card' : `${count} carduri`);
const chaptersWord = (count: number) => (count === 1 ? '1 capitol' : `${count} capitole`);

/** „De repetat azi: 87 carduri în 9 capitole” + „Începe” (o sesiune peste toate capitolele cu restante). */
export function DueSummaryStrip<T extends DeckStats>({
  summary,
  startHref,
  theme,
  paddingLeft = 14,
}: {
  summary: DueSummary<T>;
  startHref: string | null;
  theme: Theme;
  paddingLeft?: number;
}) {
  if (summary.cards <= 0 || !startHref) return null;
  const startTitle = `${cardsWord(summary.cards)} din ${chaptersWord(summary.chapters)}`;
  return (
    <div
      data-testid="chapter-due-summary"
      className="flex min-h-[38px] items-center gap-3 pr-3"
      style={{ paddingLeft, borderTop: '1px solid var(--hairline)', background: 'var(--accent-soft)' }}
    >
      <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: theme.text2 }}>
        <span className="font-semibold" style={{ color: theme.text }}>De repetat azi:</span>{' '}
        {cardsWord(summary.cards)} în {chaptersWord(summary.chapters)}
      </span>
      <Link
        to={startHref}
        aria-label={`Începe repetarea: ${startTitle}`}
        title={startTitle}
        className="focus-ring press-feedback flex flex-shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold text-white"
        style={{ background: theme.accent }}
      >
        Începe <ChevronRight size={12} aria-hidden="true" />
      </Link>
    </div>
  );
}

/** Antet de specialitate (pliabil): nume, capitole, restante și „Repetă”. */
export function SpecialtyHeader({
  label,
  range,
  count,
  cards,
  due,
  open,
  bodyId,
  paddingLeft,
  repeatHref,
  repeatLabel,
  onToggle,
  theme,
  calm,
}: {
  label: string;
  range: [number, number];
  count: number;
  cards: number;
  due: number;
  open: boolean;
  bodyId: string;
  paddingLeft: number;
  repeatHref: string | null;
  repeatLabel: string;
  onToggle: () => void;
  theme: Theme;
  calm: boolean;
}) {
  const span = range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`;
  return (
    <div
      data-testid="specialty-header"
      className="flex h-9 items-center pr-3"
      style={{ borderTop: '1px solid var(--hairline)', paddingLeft }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="focus-ring fine-row flex h-full min-w-0 flex-1 items-center gap-2 pl-1.5 pr-2 text-left"
        style={{ borderRadius: 0 }}
      >
        <ChevronRight
          size={13}
          aria-hidden="true"
          className="flex-shrink-0"
          style={{ color: theme.text3, transform: open ? 'rotate(90deg)' : 'none', transition: calm ? 'none' : 'transform var(--dur-base) var(--ease-emphasized)' }}
        />
        <span className="min-w-0 truncate text-[12.5px] font-semibold" style={{ color: theme.text2 }}>{label}</span>
        <span className="flex-shrink-0 text-[12px] tabular-nums" style={{ color: theme.text3 }}>
          · {chaptersWord(count)} ({span}) · {cardsWord(cards)}
        </span>
        {due > 0 && <DueBadge count={due} theme={theme} />}
      </button>
      {due > 0 && repeatHref && <RepeatLink to={repeatHref} label={repeatLabel} theme={theme} />}
    </div>
  );
}
