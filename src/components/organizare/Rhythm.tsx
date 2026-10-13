import { plural } from '../../lib/plural';
import { formatStudyTime } from '../../lib/formatStudyTime';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Loader2, Sparkles, Square } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useCountUp } from '../../hooks/useCountUp';
import { useQuizStore } from '../../store/quizStore';
import { useStatsStore } from '../../store/statsStore';
import {
  accuracySeries, activePhase, heatGrid, hoursSeries, insights, progressSeries, studyStats, withDay,
} from '../../lib/organizare/engine';
import { analyzeProgress } from '../../lib/organizare/analysis';
import { quizzesOnDay } from '../../lib/organizare/appLinks';
import { weekdayDay } from '../../lib/organizare/format';
import type { DayLog } from '../../lib/organizare/types';
import { AccuracyChart, Heatmap, HoursChart, ProgressChart } from './charts';
import { useOrganizare } from './context';
import { number } from './helpers';
import { Card, Chevron, Collapse, GhostButton, Label } from './ui';
import HelpTip from '../ui/HelpTip';

const DAYS_IN_LIFE = [
  { title: 'Luni – vineri', total: '2,5 h', items: [['Anki', '30 min'], ['Topic nou', '1 h 20'], ['Grile din capitol', '30 min'], ['Caiet de erori', '10 min']], note: 'Constanța contează mai mult decât orele.' },
  { title: 'Sâmbătă', total: '5,5 h', items: [['Anki', '30 min'], ['Topicuri noi', '2 × 2 h'], ['Grile', '1 h'], ['Caiet de erori', '15 min']], note: 'Ziua principală pentru capitolele mari.' },
  { title: 'Duminică', total: 'max 3 h', items: [['Grilele greșite', '1 h'], ['Scheme', '1 h'], ['Caiet de erori', '30 min'], ['Restul zilei', 'liber']], note: 'Fără zi liberă nu ții 13 luni.' },
  { title: 'Săptămâna tampon', total: 'după nevoie', items: [['Topicuri noi', 'nu'], ['Recuperezi', 'restanțele'], ['Recapitulezi', 'grile greșite'], ['Odihnești', 'da']], note: 'O dată la 7 săptămâni.' },
];

const toNumber = (text: string) => parseFloat(text.replace(',', '.'));

/** The form for one day: hours, quizzes, how it felt. Today's quizzes from the app can fill it in. */
function DayForm({ day, setDay, formRef }: { day: string; setDay: (d: string) => void; formRef: React.RefObject<HTMLDivElement | null> }) {
  const theme = useTheme();
  const { state, today, update } = useOrganizare();
  const sessions = useQuizStore((s) => s.sessions);
  const saved = state.log[day];
  const [hours, setHours] = useState(saved?.h?.toString().replace('.', ',') ?? '');
  const [solved, setSolved] = useState(saved?.g?.toString() ?? '');
  const [correct, setCorrect] = useState(saved?.ok?.toString() ?? '');
  const [mood, setMood] = useState(saved?.e ?? 0);
  const [note, setNote] = useState(saved?.n ?? '');
  const [message, setMessage] = useState('');
  const [toStats, setToStats] = useState(true);
  const fromApp = useMemo(() => quizzesOnDay(sessions, day), [sessions, day]);

  const load = (d: string) => {
    const l = state.log[d];
    setDay(d);
    setHours(l?.h?.toString().replace('.', ',') ?? '');
    setSolved(l?.g?.toString() ?? '');
    setCorrect(l?.ok?.toString() ?? '');
    setMood(l?.e ?? 0);
    setNote(l?.n ?? '');
    setMessage('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const h = toNumber(hours); const g = parseInt(solved, 10); const ok = parseInt(correct, 10);
    if (h < 0 || h > 16 || g < 0 || ok < 0) { setMessage('Verifică valorile.'); return; }
    if (!Number.isNaN(g) && !Number.isNaN(ok) && ok > g) { setMessage('Corecte nu poate fi mai mult decât rezolvate.'); return; }
    const rec: DayLog = {};
    if (!Number.isNaN(h)) rec.h = h;
    if (!Number.isNaN(g)) rec.g = g;
    if (!Number.isNaN(ok)) rec.ok = ok;
    if (mood) rec.e = mood;
    if (note.trim()) rec.n = note.trim();

    // Hours logged for today also count in the app's study time and streak; a re-saved day only adds the difference.
    const seconds = Math.round((rec.h ?? 0) * 3600);
    const already = state.synced?.[day] ?? 0;
    const sync = toStats && day === today && seconds > already;
    if (sync) useStatsStore.getState().recordStudySession(seconds - already);
    update((s) => ({
      ...withDay(s, day, rec),
      synced: sync ? { ...s.synced, [day]: seconds } : s.synced,
    }));
    setMessage(sync ? 'Salvat. Orele au intrat și în statisticile aplicației.' : 'Salvat.');
    window.setTimeout(() => setMessage(''), 2800);
  };

  const field = 'focus-ring elev-1 w-full rounded-xl px-3 py-2 text-[14px] outline-none tabular-nums';
  const fieldStyle = { background: theme.surface2, color: theme.text };

  return (
    <Card index={0}>
      <div ref={formRef} className="scroll-mt-24" />
      <h2 className="text-[15px] font-semibold" style={{ color: theme.text }}>Înregistrează ziua</h2>
      {fromApp.sessions > 0 && (
        <div className="fine-chip mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px]" style={{ background: 'var(--accent-soft)', color: theme.accentText }}>
          <span>În aplicație, în ziua asta: {plural(fromApp.sessions, 'sesiune', 'sesiuni')} · {plural(fromApp.g, 'grilă', 'grile')} · {Math.round((fromApp.ok / fromApp.g) * 100)}% corecte</span>
          <button
            type="button"
            className="rounded-full px-3 py-1 font-semibold"
            style={{ background: theme.accent, color: '#fff' }}
            onClick={() => {
              setSolved(String(fromApp.g)); setCorrect(String(fromApp.ok));
              if (!hours && fromApp.hours > 0) setHours(String(fromApp.hours).replace('.', ','));
            }}
          >
            Folosește
          </button>
        </div>
      )}
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2" autoComplete="off">
        <label className="text-[12px]" style={{ color: theme.text3 }}>Ziua
          <input type="date" value={day} max={today} required onChange={(e) => e.target.value && load(e.target.value)} className={`${field} mt-1`} style={fieldStyle} />
        </label>
        <label className="text-[12px]" style={{ color: theme.text3 }}>Ore studiate
          <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" placeholder="2,5" className={`${field} mt-1`} style={fieldStyle} />
        </label>
        <label className="text-[12px]" style={{ color: theme.text3 }}>Grile rezolvate
          <input value={solved} onChange={(e) => setSolved(e.target.value)} inputMode="numeric" placeholder="40" className={`${field} mt-1`} style={fieldStyle} />
        </label>
        <label className="text-[12px]" style={{ color: theme.text3 }}>Grile corecte
          <input value={correct} onChange={(e) => setCorrect(e.target.value)} inputMode="numeric" placeholder="28" className={`${field} mt-1`} style={fieldStyle} />
        </label>
        <div className="text-[12px]" style={{ color: theme.text3 }}>
          Cum a mers (1-5)
          <div className="mt-1 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={mood === k}
                onClick={() => setMood(mood === k ? 0 : k)}
                className="press-feedback h-9 flex-1 rounded-xl text-[13px] font-semibold"
                style={{ background: mood === k ? theme.accent : theme.surface2, color: mood === k ? '#fff' : theme.text2, transition: 'background 0.25s ease, color 0.25s ease' }}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <label className="text-[12px]" style={{ color: theme.text3 }}>Notă (opțional)
          <input value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} placeholder="Ce am făcut, ce a mers greu" className={`${field} mt-1`} style={fieldStyle} />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" className="press-feedback fx-lift rounded-full px-5 py-2 text-[13px] font-semibold text-white" style={{ background: theme.accent, boxShadow: 'var(--glow-1)' }}>Salvează ziua</button>
          <GhostButton onClick={() => { update((s) => withDay(s, day, null)); load(day); }}>Șterge ziua</GhostButton>
          <label className="ml-auto flex items-center gap-2 text-[12px]" style={{ color: theme.text3 }}>
            <input type="checkbox" checked={toStats} onChange={(e) => setToStats(e.target.checked)} />
            Adaugă orele de azi și în statisticile aplicației
          </label>
          <span role="status" className="basis-full text-[12.5px]" style={{ color: theme.text2 }}>{message}</span>
        </div>
      </form>
    </Card>
  );
}

function AnalysisCard() {
  const theme = useTheme();
  const { plan, state, today } = useOrganizare();
  const st = studyStats(state, today);
  const lines = insights(plan, state, today);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const run = async () => {
    controller.current = new AbortController();
    setBusy(true);
    setText('Se gândește…');
    try {
      const result = await analyzeProgress(plan, state, today, { signal: controller.current.signal, onText: setText });
      setText(result || 'Nu am primit niciun răspuns.');
    } catch (error) {
      setText(error instanceof Error ? error.message : 'Nu am putut face analiza acum.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card index={2}>
      <h2 className="text-[15px] font-semibold" style={{ color: theme.text }}>Ce arată datele</h2>
      <ul className="mt-3 space-y-2 text-[13.5px]" style={{ color: theme.text2 }}>
        {lines.map((line, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: theme.accent }} />
            <span>{line.map((part, k) => (typeof part === 'string' ? part : <b key={k} style={{ color: theme.text }}>{part.b}</b>))}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || st.days.length < 3}
          onClick={() => void run()}
          className="press-feedback fx-lift inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ background: theme.accent }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Analizează-mi evoluția cu AI
        </button>
        {busy && (
          <GhostButton onClick={() => controller.current?.abort()}><Square size={12} /> Oprește</GhostButton>
        )}
        {st.days.length < 3 && <span className="text-[12px]" style={{ color: theme.text3 }}>Disponibil după 3 zile înregistrate.</span>}
      </div>
      {text && <div aria-live="polite" className="fine-chip mt-3 whitespace-pre-wrap rounded-xl px-3.5 py-3 text-[13.5px] leading-relaxed" style={{ background: 'var(--fill-subtle)', color: theme.text }}>{text}</div>}
    </Card>
  );
}

export default function Rhythm() {
  const theme = useTheme();
  const { plan, state, win, today } = useOrganizare();
  const [day, setDay] = useState(today);
  const [dayCards, setDayCards] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);
  const st = studyStats(state, today);
  const ph = Math.min(activePhase(plan, today), 4);
  const recent = st.days.slice(-8).reverse();

  const total = useCountUp(Math.round(st.total * 3600), 800);
  const streak = useCountUp(st.streak, 600);

  const tiles: Array<[string, string]> = [
    [formatStudyTime(total), 'timp înregistrat în total'],
    [String(streak), 'zile la rând'],
    [`${number(st.h7, 1)} / ${number(st.t7, 1)}`, 'ore în ultimele 7 zile'],
    [st.last14.p === null ? '–' : `${Math.round(st.last14.p * 100)}%`, 'grile corecte, 14 zile'],
  ];

  const loadDay = (d: string) => {
    setDay(d);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-4">
      <div className="px-1">
        <div className="text-[12px] font-medium uppercase tracking-wide" style={{ color: theme.text3 }}>Jurnal și analiză</div>
        <h2 className="display mt-0.5 flex items-center gap-2 text-[1.5rem] font-bold tracking-tight" style={{ color: theme.text }}>Ritm zilnic <HelpTip id="org-rhythm" /></h2>
        <p className="mt-1 max-w-prose text-[13px]" style={{ color: theme.text2 }}>
          Înregistrează fiecare zi în 20 de secunde. Pagina îți calculează ritmul, regularitatea, acuratețea la grile și cât ești față de plan.
        </p>
      </div>

      <DayForm key={day} day={day} setDay={setDay} formRef={formRef} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([value, label], i) => (
          <Card key={label} lift index={i + 1} className="!p-4">
            <div className="display text-[1.8rem] font-bold leading-none tracking-tight tabular-nums" style={{ color: theme.text }}>{value}</div>
            <div className="mt-1.5 text-[12.5px]" style={{ color: theme.text3 }}>{label}</div>
          </Card>
        ))}
      </div>

      <AnalysisCard />

      <Card index={3}>
        <h2 className="text-[15px] font-semibold" style={{ color: theme.text }}>Ore pe zi</h2>
        <p className="mb-3 mt-0.5 text-[12.5px]" style={{ color: theme.text3 }}>Ultimele 28 de zile, față de ținta fiecărei zile (2,5 h în zilele lucrătoare, 5,5 h sâmbăta).</p>
        <HoursChart data={hoursSeries(state, today)} />
      </Card>

      <Card index={4}>
        <h2 className="text-[15px] font-semibold" style={{ color: theme.text }}>Progres față de plan</h2>
        <p className="mb-3 mt-0.5 text-[12.5px]" style={{ color: theme.text3 }}>Faza {ph}: paginile terminate de tine, față de ce cerea planul.</p>
        <ProgressChart data={progressSeries(plan, state, win, ph, today)} today={today} />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card index={5}>
          <h2 className="text-[15px] font-semibold" style={{ color: theme.text }}>Acuratețea grilelor</h2>
          <p className="mb-3 mt-0.5 text-[12.5px]" style={{ color: theme.text3 }}>Procent corecte, pe săptămână.</p>
          <AccuracyChart data={accuracySeries(state, today)} />
        </Card>
        <Card index={6}>
          <h2 className="text-[15px] font-semibold" style={{ color: theme.text }}>Regularitate</h2>
          <p className="mb-3 mt-0.5 text-[12.5px]" style={{ color: theme.text3 }}>Ultimele 14 săptămâni; culoarea arată cât din țintă ai făcut.</p>
          <Heatmap grid={heatGrid(state, today)} />
        </Card>
      </div>

      <Card padded={false} spot={false} index={7} className="overflow-hidden">
        <h2 className="px-4 pt-4 text-[15px] font-semibold sm:px-5" style={{ color: theme.text }}>Zilele înregistrate</h2>
        {recent.length === 0 ? (
          <p className="px-4 pb-4 pt-1 text-[13px] sm:px-5" style={{ color: theme.text3 }}>Încă nimic. Completează formularul de sus.</p>
        ) : (
          <div className="mt-2">
            {recent.map((d) => {
              const l = state.log[d];
              return (
                <button key={d} type="button" onClick={() => loadDay(d)} className="fine-row grid w-full grid-cols-[7.5rem_4rem_1fr] items-center gap-2 px-4 py-2.5 text-left text-[13px] sm:px-5" style={{ borderRadius: 0, borderTop: '1px solid var(--hairline)' }}>
                  <span style={{ color: theme.text }}>{weekdayDay(d)}</span>
                  <span className="tabular-nums" style={{ color: theme.text }}>{number(l.h ?? 0, 1)} h</span>
                  <span className="truncate" style={{ color: theme.text3 }}>{l.g ? `${l.ok ?? 0}/${plural(l.g, 'grilă', 'grile')}` : ''}{l.n ? ` · ${l.n}` : ''}</span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card padded={false} spot={false} index={8} className="overflow-hidden">
        <button type="button" aria-expanded={dayCards} onClick={() => setDayCards((o) => !o)} className="fine-row grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-4 text-left sm:px-5" style={{ borderRadius: 0 }}>
          <span>
            <span className="block text-[15px] font-semibold" style={{ color: theme.text }}>Cum arată o zi de studiu</span>
            <span className="block text-[12px]" style={{ color: theme.text3 }}>Ritmul pe care e construit planul</span>
          </span>
          <Chevron open={dayCards} />
        </button>
        <Collapse open={dayCards}>
          <div className="grid gap-3 p-4 pt-0 sm:grid-cols-2 sm:p-5 sm:pt-0">
            {DAYS_IN_LIFE.map((d) => (
              <div key={d.title} className="rounded-xl p-4" style={{ background: 'var(--fill-subtle)' }}>
                <Label className="!px-0">{d.title}</Label>
                <div className="display mt-1 text-[1.5rem] font-bold tracking-tight" style={{ color: theme.text }}>{d.total}</div>
                <ul className="mt-2 space-y-1 text-[13px]" style={{ color: theme.text2 }}>
                  {d.items.map(([name, time]) => (
                    <li key={name} className="flex justify-between gap-3"><span>{name}</span><b className="font-semibold tabular-nums" style={{ color: theme.text }}>{time}</b></li>
                  ))}
                </ul>
                <p className="mt-3 text-[12px]" style={{ color: theme.text3 }}>{d.note}</p>
              </div>
            ))}
          </div>
        </Collapse>
      </Card>
    </div>
  );
}
