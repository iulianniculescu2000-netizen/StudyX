import { Link } from 'react-router-dom';
import { CalendarClock, Layers3, RefreshCw, Target, Timer, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import SectionLabel from '../components/ui/SectionLabel';
import { useExamCrunch } from '../lib/examCrunchHook';
import { COVERAGE_GAP_THRESHOLD, type CrunchBucket } from '../lib/examCrunch';
import HelpTip from '../components/ui/HelpTip';
import { plural } from '../lib/plural';


const BUCKETS: { id: CrunchBucket; title: string; icon: LucideIcon; body: string }[] = [
  { id: 'due', title: 'Scadente', icon: RefreshCw, body: 'Întrebările la care repetarea spațiată a ajuns la termen sau a depășit termenul. Cele mai întârziate vin primele.' },
  { id: 'missed', title: 'Cele mai greșite', icon: TriangleAlert, body: 'Întrebările la care ai greșit de cel puțin două ori sau ai mai multe greșeli decât răspunsuri corecte. Fără cele retrase sau duplicate.' },
  { id: 'gaps', title: 'Lacune de acoperire', icon: Layers3, body: `Întrebări pe care nu le-ai văzut încă, doar din seturile în care ai parcurs sub ${Math.round(COVERAGE_GAP_THRESHOLD * 100)}%. Alese pe rând din seturile cel mai puțin acoperite.` },
];

export default function ExamCrunch() {
  const theme = useTheme();
  const { pool, options, secondsPerQuestion, daysLeft, exam, enabled, setEnabled, start } = useExamCrunch();
  const total = pool.due.length + pool.missed.length + pool.gaps.length;

  return (
    <div className="custom-scrollbar h-full overflow-y-auto px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          back={{ to: '/', label: 'Panou' }}
          title="Aproape de examen"
          tour={{ id: 'crunch', label: 'Ghid pentru Aproape de examen' }}
          subtitle="Pentru ultimele săptămâni: întrebări scadente, greșeli și lacune din seturile tale. Alegi sesiunea după timpul pe care îl ai."
        />

        <div data-tutorial="crunch-date" className="glass-panel mb-6 flex flex-wrap items-center gap-4 rounded-[var(--r-lg)] p-4" style={{ boxShadow: 'var(--elev-1)' }}>
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: `${theme.accent}18`, color: theme.accentText }}>
            <CalendarClock size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            {daysLeft !== null ? (
              <>
                <div className="text-[22px] font-bold tabular-nums" style={{ color: theme.text }}>{plural(daysLeft, 'zi', 'zile')}</div>
                <div className="text-[12px]" style={{ color: theme.text3 }}>{exam?.label}{exam?.estimate ? ' · dată estimată, o poți schimba în Organizare' : ''}</div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-semibold" style={{ color: theme.text }}>{exam?.passed ? 'Examenul a trecut' : 'Nu ai o dată de examen'}</div>
                <div className="text-[12px]" style={{ color: theme.text3 }}>Alege data în <Link to="/rezidentiat/organizare" className="underline" style={{ color: theme.accentText }}>Organizare</Link> ca să vezi numărătoarea inversă.</div>
              </>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[13px]" style={{ color: theme.text2 }}>
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-4 w-4" style={{ accentColor: theme.accent }} />
            Arată pe Panou tot timpul
          </label>
        </div>
        <p className="-mt-3 mb-6 px-1 text-[12px]" style={{ color: theme.text3 }}>
          Cardul apare automat pe Panou când examenul e în cel mult 30 de zile.
        </p>

        <SectionLabel className="mb-2">Ce intră în sesiune</SectionLabel>
        <ul data-tutorial="crunch-buckets" className="mb-8 grid gap-3 sm:grid-cols-3">
          {BUCKETS.map(({ id, title, icon: Icon, body }) => (
            <li key={id} className="glass-panel rounded-[var(--r-lg)] p-4" style={{ boxShadow: 'var(--elev-1)' }}>
              <div className="mb-2 flex items-center gap-2" style={{ color: theme.accentText }}>
                <Icon size={16} aria-hidden="true" />
                <span className="text-[13px] font-semibold" style={{ color: theme.text }}>{title}</span>
              </div>
              <div className="mb-1.5 text-2xl font-bold tabular-nums" style={{ color: theme.text }}>{pool[id].length.toLocaleString('ro-RO')}</div>
              <p className="text-[12px] leading-relaxed" style={{ color: theme.text3 }}>{body}</p>
            </li>
          ))}
        </ul>

        {total === 0 ? (
          <EmptyState
            icon={Target}
            title="Nimic de recuperat acum"
            body="Nu ai întrebări scadente, greșite des sau lacune în seturile pornite. Revino după ce lucrezi câteva grile."
            primary={{ label: 'Grilele mele', to: '/quizzes' }}
          />
        ) : (
          <>
            <div className="mb-2 flex items-center gap-1.5">
              <SectionLabel>Alege timpul</SectionLabel>
              <HelpTip id="crunch-session" size={16} />
            </div>
            <ul data-tutorial="crunch-duration" className="grid gap-3 sm:grid-cols-3">
              {options.map((option) => (
                <li key={option.minutes}>
                  <button
                    type="button"
                    disabled={option.size === 0}
                    onClick={() => start(option.minutes)}
                    className="glass-panel fx-lift press-feedback focus-ring flex w-full flex-col items-start gap-2 rounded-[var(--r-lg)] p-5 text-left disabled:opacity-50"
                  >
                    <span className="flex items-center gap-1.5 text-[13px]" style={{ color: theme.text3 }}>
                      <Timer size={13} aria-hidden="true" />{option.minutes} min
                    </span>
                    <span className="text-2xl font-bold tabular-nums" style={{ color: theme.text }}>{plural(option.size, 'întrebare', 'întrebări')}</span>
                    <span className="text-[12px] tabular-nums" style={{ color: theme.text3 }}>
                      {option.counts.due} scadente · {option.counts.missed} greșite · {option.counts.gaps} lacune
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] leading-relaxed" style={{ color: theme.text3 }}>
              Numărul de întrebări vine din ritmul tău: aproximativ {secondsPerQuestion} secunde pe întrebare{secondsPerQuestion === 45 ? ' (valoare implicită, până strângi mai mult istoric)' : ', din sesiunile tale recente'}.
              Sesiunea e marcată ca recuperare, deci nu dublează statisticile și nu intră în Caietul de erori.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
