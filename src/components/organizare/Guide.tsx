import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { PASS_NAMES, totalPages } from '../../lib/organizare/engine';
import { dayRange, dayYear, longDay, pageRange } from '../../lib/organizare/format';
import { useOrganizare } from './context';
import { number, pages, useBookColor, usePassColors } from './helpers';
import { Card, Chevron, Collapse, Label } from './ui';

const BOOKS = [
  { id: 'K', title: 'Kumar și Clark, Medicină clinică', edition: 'Ediția a 10-a, în limba română' },
  { id: 'L', title: 'Lawrence, Chirurgie generală și specialități chirurgicale', edition: 'Ediția a 6-a, în limba română' },
  { id: 'S', title: 'Sinopsis de medicină', edition: 'Ediția a 5-a, în limba română' },
] as const;

const PASS_INFO = [
  ['Topic cu topic: planșa, grile din capitol, caiet de erori, Anki zilnic.', 'Cărțile (Kumar, Lawrence, Sinopsis), planșele tale, Flashcards/Rezi Anki, Grile pe capitole'],
  ['Același traseu, mai rapid. Scheme și grile 2021-2025; caietul de erori e materialul principal.', 'Grile pe capitole 2021-2025, Grile Rezidentiat (3500), Kumar complement simplu, Grile 2021-2023'],
  ['Parcurgi rapid schemele și caietul de erori; grile doar pe ce ai greșit și pe zonele slabe.', 'Caietul de erori, planșele tale, Grile pe capitole 2021-2025'],
  ['Treci prin tot într-un ritm foarte rapid, doar ce nu știi încă. Fără învățat de la zero.', 'Caietul de erori, schemele tale, Anki'],
];

/** Dates from the 2023 exam, shown only as a guide: the real ones for 2027 are announced later. */
const EXAM_STEPS = [
  ['Înscrierea la DSP', '11–24 octombrie 2023', 'Pregătești dosarul cu 1-2 luni înainte; se depune la DSP sau prin poștă.'],
  ['Examenul', '19 noiembrie 2023 · 200 grile · 4 ore', 'Intri în sală de la 8:30 cu actul valabil; grila se completează cu cariocă neagră; caietele se deschid la 10:00.'],
  ['Repartiția mare', '26–28 noiembrie 2023', 'Alegi specialitatea și orașul în funcție de punctaj.'],
  ['Angajare la spital', '6–18 decembrie 2023', 'Depui actele și analizele cerute de spitalul plătitor.'],
  ['Repartiția mică', '18–21 decembrie 2023', 'Alegi spitalul și coordonatorul.'],
  ['Semnarea contractului', '~ianuarie 2024', 'Contract și medicina muncii, diferit la fiecare spital.'],
];

/** A fold-open row: a title, a quieter line under it, and a body that slides open. */
function Fold({ head, sub, children, defaultOpen = false, flat = false }: { head: ReactNode; sub?: ReactNode; children: ReactNode; defaultOpen?: boolean; flat?: boolean }) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  // The body is built the first time the row is opened, not for every closed row at once.
  const [seen, setSeen] = useState(defaultOpen);
  return (
    <div style={flat ? { borderTop: '1px solid var(--hairline)' } : undefined}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => { setSeen(true); setOpen((o) => !o); }}
        className="fine-row grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left sm:px-5"
        style={{ borderRadius: 0 }}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[14.5px] font-semibold" style={{ color: theme.text }}>{head}</span>
          {sub && <span className="mt-0.5 block text-[12px]" style={{ color: theme.text3 }}>{sub}</span>}
        </span>
        <Chevron open={open} />
      </button>
      <Collapse open={open}>{seen && children}</Collapse>
    </div>
  );
}

/** The books of the syllabus, chapter by chapter, and the topics where the extracted PDFs do not match the official list. */
function Syllabus() {
  const theme = useTheme();
  const { plan } = useOrganizare();
  const bookColor = useBookColor();
  const incomplete = plan.topics.filter((t) => /^(LIPSE|PAR)/.test(t.note));

  return (
    <div className="space-y-3">
      {BOOKS.map(({ id, title, edition }, bi) => {
        const own = plan.topics.filter((t) => t.book === id);
        const chapterNo = (t: (typeof own)[number]) => (t.chapter.match(/Cap\.\s*(\d+)/) ?? [])[1] ?? '';
        const chapters = [...new Set(own.map(chapterNo))];
        const total = own.reduce((a, t) => a + t.pages, 0);
        return (
          <Card key={id} padded={false} spot={false} index={bi} className="overflow-hidden">
            <Fold
              head={<><i className="h-2.5 w-2.5 rounded-full" style={{ background: bookColor(id) }} />{title}</>}
              sub={`${edition} · ${chapters.length} capitole · ${own.length} topicuri · ${number(total)} pagini`}
            >
              <div style={{ borderTop: '1px solid var(--hairline)' }}>
                {chapters.map((cap) => {
                  const rows = own.filter((t) => chapterNo(t) === cap);
                  const name = rows[0].chapter.replace(/^\w+, Cap\.\s*\d+\.?\s*/, '');
                  const sum = rows.reduce((a, t) => a + t.pages, 0);
                  return (
                    <Fold key={cap} flat head={name} sub={`Cap. ${Number(cap)} · ${rows.length} ${rows.length === 1 ? 'topic' : 'topicuri'} · ${number(sum, sum % 1 ? 1 : 0)} pagini`}>
                      <ul className="px-4 pb-3 sm:px-5">
                        {rows.map((t) => (
                          <li key={t.index} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-4 py-1.5 text-[13px]" style={{ borderTop: '1px solid var(--hairline)' }}>
                            <span style={{ color: theme.text }}>{t.name}</span>
                            <span className="tabular-nums" style={{ color: theme.text3 }}>p.{pageRange(t.src)}</span>
                            <span className="hidden tabular-nums sm:block" style={{ color: theme.text3 }}>{pages(t.pages)}</span>
                          </li>
                        ))}
                      </ul>
                    </Fold>
                  );
                })}
              </div>
            </Fold>
          </Card>
        );
      })}

      {incomplete.length > 0 && (
        <Card padded={false} spot={false} className="overflow-hidden">
          <Fold head={<><AlertTriangle size={16} style={{ color: theme.warning }} />Pagini care lipsesc din PDF-urile extrase</>} sub={`${incomplete.length} topicuri · Kumar`}>
            <div className="space-y-2 px-4 pb-4 sm:px-5">
              <p className="text-[12.5px]" style={{ color: theme.text3 }}>
                Comparat cu tematica oficială. Pentru aceste pagini folosește cartea completă (Kumar 10th ed RO - carte completa, 1568 p), la pagina tipărită.
              </p>
              {incomplete.map((t) => (
                <div key={t.index} className="fine-chip rounded-xl px-3.5 py-2.5 text-[12.5px]" style={{ background: `color-mix(in srgb, ${theme.warning} 12%, transparent)` }}>
                  <div style={{ color: theme.text }}>{t.name} <span style={{ color: theme.text3 }}>· {t.src}</span></div>
                  <div style={{ color: theme.warning }}>{t.note.replace('LIPSEȘTE din PDF-ul extras: ', '').replace('PARȚIAL în PDF-ul extras: ', '')}</div>
                </div>
              ))}
            </div>
          </Fold>
        </Card>
      )}
    </div>
  );
}

/** The four passes, the simulations, and the steps of the exam itself. */
function Strategy() {
  const theme = useTheme();
  const { plan, state } = useOrganizare();
  const colors = usePassColors();

  return (
    <div className="space-y-3">
      <Label className="pt-1">Pregătirea</Label>
      {[1, 2, 3, 4].map((p) => {
        const hours = plan.topics.reduce((a, t) => a + t.h[p - 1], 0);
        const rows: Array<[string, string]> = [
          ['Ce faci', PASS_INFO[p - 1][0]],
          ['Ritm', `${plan.pph[p - 1]} pagini/oră · ${Math.round(plan.pct[p - 1] * 100)}% din grilele fiecărui topic`],
          ['Materiale', PASS_INFO[p - 1][1]],
          ['Topicuri', `${plan.topics.length} topicuri · ${number(totalPages(plan))} pagini`],
        ];
        return (
          <Card key={p} padded={false} spot={false} index={p - 1} className="overflow-hidden">
            <Fold
              head={<><span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: colors[p - 1] }}>Faza {p}</span>{PASS_NAMES[p - 1]}</>}
              sub={`${dayRange(plan.starts[p - 1], plan.ends[p - 1])} · ~${number(hours)} ore`}
            >
              <dl className="grid gap-x-4 gap-y-2 px-4 pb-4 text-[13px] sm:grid-cols-[6rem_1fr] sm:px-5">
                {rows.map(([k, v]) => (<div key={k} className="contents"><dt style={{ color: theme.text3 }}>{k}</dt><dd style={{ color: theme.text }}>{v}</dd></div>))}
              </dl>
            </Fold>
          </Card>
        );
      })}

      <Card padded={false} spot={false} index={4} className="overflow-hidden">
        <Fold
          head={<><span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: colors[4] }}>Simulări</span>Ultimele săptămâni</>}
          sub={`${dayYear(plan.sim0)} – ${dayYear(plan.sim1)} · apoi menținere până la examen`}
        >
          <dl className="grid gap-x-4 gap-y-2 px-4 pb-4 text-[13px] sm:grid-cols-[6rem_1fr] sm:px-5">
            <div className="contents"><dt style={{ color: theme.text3 }}>Ce faci</dt><dd style={{ color: theme.text }}>O simulare pe săptămână: 200 de grile în 4 ore, circa 72 de secunde pe grilă. Analizezi fiecare greșeală.</dd></div>
            <div className="contents"><dt style={{ color: theme.text3 }}>Menținere</dt><dd style={{ color: theme.text }}>{dayYear(plan.maint0)} – {longDay(state.exam)}: Anki, o simulare ușoară, fără materie nouă, somn și logistica zilei examenului.</dd></div>
            <div className="contents"><dt style={{ color: theme.text3 }}>Materiale</dt><dd style={{ color: theme.text }}>Subiecte Rezidentiat-anterior (2021-2025 cu barem), Simulari/ cu borderou, Modele Grile 1, ghidul Rezi Steps</dd></div>
          </dl>
        </Fold>
      </Card>

      <Label className="pt-3">Examenul</Label>
      <Card padded={false} spot={false} className="overflow-hidden">
        <Fold head="Etapele examenului" sub="Reper din 2023 (ghidul Rezi Steps)">
          <div className="px-4 pb-3 sm:px-5">
            <p className="mb-1 text-[12.5px]" style={{ color: theme.text3 }}>Datele sunt cele din 2023 și servesc doar ca reper. Pentru 2027 nu se știu încă; se anunță pe rezidentiat.ms.ro.</p>
            {EXAM_STEPS.map(([title, when, text], i) => (
              <div key={title} className="grid grid-cols-[1.75rem_1fr] gap-3 py-3" style={{ borderTop: '1px solid var(--hairline)' }}>
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold" style={{ background: 'var(--accent-soft)', color: theme.accentText }}>{i + 1}</span>
                <div>
                  <div className="text-[14px] font-semibold" style={{ color: theme.text }}>{title}</div>
                  <div className="text-[12px] tabular-nums" style={{ color: theme.text3 }}>{when}</div>
                  <p className="mt-1 text-[13px]" style={{ color: theme.text2 }}>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </Fold>
      </Card>
    </div>
  );
}

/** Reference material: the syllabus as the books list it, then how the preparation and the exam are laid out. */
export default function Guide() {
  const theme = useTheme();
  return (
    <div className="space-y-4">
      <div className="px-1">
        <div className="text-[12px] font-medium uppercase tracking-wide" style={{ color: theme.text3 }}>Tematică și strategie</div>
        <h2 className="display mt-0.5 text-[1.5rem] font-bold tracking-tight" style={{ color: theme.text }}>Ghid</h2>
        <p className="mt-1 max-w-prose text-[13px]" style={{ color: theme.text2 }}>
          Cărțile din tematică, capitol cu capitol, și cum sunt așezate cele patru treceri și examenul. Tematica e cea din sesiunea noiembrie 2026; verific-o când apare cea pentru 2027.
        </p>
      </div>
      <Syllabus />
      <Strategy />
    </div>
  );
}

