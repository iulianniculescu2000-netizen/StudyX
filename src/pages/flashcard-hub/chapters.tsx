import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Layers, Scissors } from 'lucide-react';
import type { Theme } from '../../theme/themes';
import { BOOK_NAMES, BOOK_SHORT, type BookCode } from '../../lib/curriculum';
import type { BookSection, ChapterRow, ChapterSplitPlan } from '../../lib/chapterDecks';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { bookChapterTag, groupBySpecialty, summarizeDue } from '../../lib/flashcardTreeView';
import { dueSessionPath } from '../../lib/flashcardDueQueue';
import { BookTag, DueBadge, DueSummaryStrip, NewDot, RepeatLink, SegmentedBar, SpecialtyHeader } from './chapterParts';
import SectionLabel from '../../components/ui/SectionLabel';
import EmptyState from '../../components/ui/EmptyState';

const fx = (calm: boolean) => (calm ? '' : 'fx-rise ');
const cssIndex = (i: number) => ({ '--i': Math.min(i, 8) }) as React.CSSProperties;

function cards(count: number) {
  if (count === 1) return '1 card';
  const rest = count % 100;
  return rest === 0 || rest >= 20 ? `${count} de carduri` : `${count} carduri`;
}

function chapters(count: number) {
  return count === 1 ? '1 capitol' : `${count} capitole`;
}

/* ═══════════════════════════════════════════════════════════════════════
   „Împarte pe capitole”: card discret, cu previzualizare și confirmare în doi pași
   ═══════════════════════════════════════════════════════════════════════ */

export function ChapterSplitCard({
  plan,
  theme,
  busy,
  onSplit,
  onDismiss,
}: {
  plan: ChapterSplitPlan;
  theme: Theme;
  busy: boolean;
  onSplit: () => void;
  onDismiss: () => void;
}) {
  const { calmMotion } = useAdaptiveMotion();
  const [open, setOpen] = useState(false);
  const detail = [
    cards(plan.assigned),
    chapters(plan.chapterCount),
    plan.other > 0 ? `${plan.other} rămase la „Alte”` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section
      aria-label="Împarte pe capitole"
      className={`${fx(calmMotion)}glass-panel rounded-[var(--r-lg)] p-4`}
      style={cssIndex(0)}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
          style={{ background: `${theme.accent}18`, color: theme.accentText }}
        >
          <Scissors size={18} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold" style={{ color: theme.text }}>Împarte pe capitole</div>
          <p className="mt-0.5 text-[12.5px]" style={{ color: theme.text3 }}>
            „{plan.sourceTitle}” are {detail}. Istoricul tău se păstrează.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="fine-chip press-feedback inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold"
            style={{ color: theme.accentText }}
          >
            Previzualizare
            <ChevronDown size={13} aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform var(--dur-base) var(--ease-standard)' }} />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3.5">
          <ul className="grid gap-x-6 sm:grid-cols-2" aria-label="Capitolele rezultate">
            {plan.groups.map((group) => (
              <li
                key={group.id}
                className="flex items-baseline justify-between gap-3 py-1.5 text-[12.5px]"
                style={{ borderTop: '1px solid var(--hairline)' }}
              >
                <span className="min-w-0 truncate" style={{ color: theme.text2 }}>
                  {group.chapter ? group.title : 'Alte (fără capitol recunoscut)'}
                </span>
                <span className="flex-shrink-0 tabular-nums" style={{ color: theme.text3 }}>{group.questions.length}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[12px]" style={{ color: theme.text3 }}>
            Pachetul întreg se arhivează, nu se șterge, și poți anula oricând după împărțire.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSplit}
              disabled={busy}
              className="press-feedback rounded-full px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: theme.accent }}
            >
              {busy ? 'Se împarte...' : `Împarte în ${chapters(plan.groups.length)}`}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="fine-row press-feedback rounded-full px-4 py-2 text-[13px] font-medium"
              style={{ color: theme.text3 }}
            >
              Nu acum
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Vedere „Pe capitole”: pe cărți, în ordinea capitolelor, grupate pe specialitate
   ═══════════════════════════════════════════════════════════════════════ */

function ChapterRowItem({
  row,
  index,
  theme,
  highlighted,
}: {
  row: ChapterRow;
  index: number;
  theme: Theme;
  highlighted: boolean;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const { calmMotion } = useAdaptiveMotion();
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: calmMotion ? 'auto' : 'smooth', block: 'center' });
  }, [highlighted, calmMotion]);

  const tag = bookChapterTag(row.chapter);
  const fresh = row.seen === 0;
  const label = `${row.chapter.number}. ${row.chapter.title}, ${cards(row.total)}${row.due > 0 ? `, ${row.due} de repetat` : ''}`;

  return (
    <li
      className={`${fx(calmMotion)}flex items-center`}
      style={{ ...cssIndex(index), minHeight: 38, borderTop: '1px solid var(--hairline)' }}
    >
      <Link
        ref={ref}
        to={`/flashcards/session/${row.main.id}`}
        data-active={highlighted ? 'true' : undefined}
        aria-label={`${label}. Începe sesiunea`}
        className="fine-row flex min-h-[38px] min-w-0 flex-1 items-center gap-2.5 py-1.5 pl-4 pr-2"
        style={{ borderRadius: 0 }}
      >
        <span
          className="w-5 flex-shrink-0 text-right text-[12px] font-semibold tabular-nums"
          style={{ color: theme.text3 }}
          aria-hidden
        >
          {row.chapter.number}
        </span>
        <span className="min-w-0 truncate text-[13.5px] font-medium" style={{ color: theme.text }}>{row.chapter.title}</span>
        {tag && <BookTag tag={tag} theme={theme} />}
        {fresh && <NewDot theme={theme} />}
      </Link>
      <span className="hidden flex-shrink-0 sm:flex"><SegmentedBar stats={row} theme={theme} className="w-20" /></span>
      <span className="hidden w-[64px] flex-shrink-0 text-right text-[12px] tabular-nums sm:block" style={{ color: theme.text3 }}>
        {row.total}
      </span>
      <span className="mx-2 hidden w-[92px] flex-shrink-0 justify-end sm:flex">
        {row.due > 0 && <DueBadge count={row.due} theme={theme} />}
      </span>
      <span className="mr-3 flex w-[68px] flex-shrink-0 justify-end">
        {row.due > 0 && <RepeatLink to={row.decks.length > 1 ? dueSessionPath(row.decks.map((deck) => deck.id)) : `/flashcards/session/${row.main.id}`} label={`Repetă ${row.chapter.title}: ${row.due} de repetat`} theme={theme} />}
      </span>
    </li>
  );
}

function BookPanel({
  section,
  start,
  chapterIndex,
  theme,
}: {
  section: BookSection;
  start: number;
  chapterIndex: number | null;
  theme: Theme;
}) {
  const { calmMotion } = useAdaptiveMotion();
  const baseId = useId();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const groups = groupBySpecialty(section.rows, (row) => row.chapter);
  const labelled = groups.some((group) => group.label !== null);
  const summary = summarizeDue(section.rows);
  const deckIdsOf = (list: ChapterRow[]) => list.filter((row) => row.due > 0).flatMap((row) => row.decks.map((deck) => deck.id));
  const startHref = summary.start ? dueSessionPath(deckIdsOf(section.rows)) : null;
  const offsets = new Map<number, number>();
  let counter = start;
  for (const row of section.rows) offsets.set(row.chapter.index, counter++);

  return (
    <ul className="glass-panel overflow-hidden rounded-[var(--r-lg)]">
      <li className="empty:hidden">
        <DueSummaryStrip summary={summary} startHref={startHref} theme={theme} paddingLeft={16} />
      </li>
      {groups.map((group) => {
        const rows = group.items;
        const due = rows.reduce((sum, row) => sum + row.due, 0);
        const key = group.id;
        // Deschise implicit: cele cu restante sau cu capitolul căutat; altfel doar primul grup.
        const forced = chapterIndex !== null && rows.some((row) => row.chapter.index === chapterIndex);
        const open = forced || !(closed[key] ?? (due === 0 && group !== groups[0]));
        const bodyId = `${baseId}-${key}`;
        const groupDueRows = rows.filter((row) => row.due > 0);
        return (
          <li key={key} data-testid="specialty-group" data-specialty={group.id}>
            {labelled && (
              <SpecialtyHeader
                label={group.label ?? BOOK_NAMES[section.book]}
                range={group.range}
                count={rows.length}
                cards={rows.reduce((sum, row) => sum + row.total, 0)}
                due={due}
                open={open}
                bodyId={bodyId}
                paddingLeft={8}
                repeatHref={groupDueRows.length > 0 ? dueSessionPath(deckIdsOf(groupDueRows)) : null}
                repeatLabel={groupDueRows.length > 0 ? `Repetă ${group.label ?? ''}: ${due} de repetat în ${groupDueRows.length === 1 ? '1 capitol' : `${groupDueRows.length} capitole`}` : ''}
                onToggle={() => setClosed((previous) => ({ ...previous, [key]: open }))}
                theme={theme}
                calm={calmMotion}
              />
            )}
            {(open || !labelled) && (
              <ul id={bodyId}>
                {rows.map((row) => (
                  <ChapterRowItem
                    key={row.chapter.index}
                    row={row}
                    index={offsets.get(row.chapter.index) ?? 0}
                    theme={theme}
                    highlighted={chapterIndex === row.chapter.index}
                  />
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ChapterBooks({
  sections,
  book,
  chapterIndex,
  theme,
  onBookChange,
}: {
  sections: BookSection[];
  book: BookCode | null;
  chapterIndex: number | null;
  theme: Theme;
  onBookChange: (book: BookCode | null) => void;
}) {
  const shown = book ? sections.filter((section) => section.book === book) : sections;
  const starts = shown.map((_, i) => shown.slice(0, i).reduce((n, section) => n + section.rows.length, 0));

  return (
    <div className="space-y-5">
      {sections.length > 1 && (
        <div role="group" aria-label="Filtrează după carte" className="flex flex-wrap gap-2">
          {([null, ...sections.map((section) => section.book)] as Array<BookCode | null>).map((code) => {
            const active = code === book;
            return (
              <button
                key={code ?? 'all'}
                type="button"
                aria-pressed={active}
                data-active={active ? 'true' : undefined}
                onClick={() => onBookChange(code)}
                className="fine-chip press-feedback rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold"
                style={{ color: active ? theme.accentText : theme.text2 }}
              >
                {code ? BOOK_SHORT[code] : 'Toate'}
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 && (
        <EmptyState icon={Layers} title="Niciun pachet pe capitole" body="Nu există încă pachete pentru această carte." />
      )}

      {shown.map((section, sectionIndex) => (
        <section key={section.book} aria-label={BOOK_NAMES[section.book]}>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <SectionLabel className="!px-1">{BOOK_NAMES[section.book]}</SectionLabel>
            <span className="text-[12px] tabular-nums" style={{ color: theme.text3 }}>
              {chapters(section.rows.length)} · {cards(section.total)}
              {section.due > 0 && <span style={{ color: theme.warning }}> · {section.due} de repetat</span>}
            </span>
          </div>
          <BookPanel section={section} start={starts[sectionIndex]} chapterIndex={chapterIndex} theme={theme} />
        </section>
      ))}
    </div>
  );
}
