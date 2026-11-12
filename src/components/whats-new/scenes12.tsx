import { BookMarked, BookOpen, Brain, CalendarDays, Check, ClipboardCheck, Layers, Target } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { fraction as fr, useSceneTime } from '../film/useTimeline';
import { HeroPlates } from './scenes';
import { chipClass, easeInOut, easeOut, layer, sceneCard, sceneChip } from './stage3d';

/*
 * Scenele 3D din „Ce e nou” 1.2. Aceleași reguli ca la 1.1: tot ce se vede se calculează din ceasul filmului
 * (`useSceneTime`), scena e inertă, iar povestea e în `transcript`. Cifrele sunt doar pentru ilustrare.
 */

const ORBIT_12 = [Layers, ClipboardCheck, Brain, BookMarked, CalendarDays];

/** 1.2 pe trei plăci de sticlă, cu noutățile pe orbită. */
export function Hero12Scene() {
  return <HeroPlates version="1.2" orbit={ORBIT_12} />;
}

const QUEUE = [
  { label: 'Carduri scadente', meta: '9 de repetat', Icon: Layers },
  { label: 'Grile de refăcut', meta: '4 recente', Icon: Target },
  { label: 'Greșeli din caiet', meta: '2 de înțeles', Icon: Brain },
];

/** Trei surse (carduri, grile, greșeli) coboară într-o singură coadă; „Începe, 15 min” e apăsat. */
export function DailyReviewScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const merge = easeInOut(fr(t, 2600, 1200));
  const cta = easeOut(fr(t, 4400, 700));
  const press = Math.sin(fr(t, 6200, 400) * Math.PI);
  return (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ ...layer, left: 'calc(50% - 150px)', top: 22, color: theme.text3 }}>Azi de revăzut</div>
      {QUEUE.map(({ label, meta, Icon }, i) => {
        const k = easeOut(fr(t, i * 220, 900));
        const spread = (1 - merge) * (i - 1) * 46;
        return (
          <div
            key={label}
            className="flex items-center gap-2.5 px-3.5"
            style={{
              ...layer, ...sceneCard(theme, 2), left: 'calc(50% - 140px)', top: 'calc(50% - 74px)', width: 280, height: 40,
              transform: `translate3d(0, ${spread + merge * (i * 44 + 8)}px, ${-60 + k * 60 - merge * i * 12}px) rotateX(${(1 - merge) * 8}deg)`,
              opacity: k,
            }}
          >
            <Icon size={15} style={{ color: theme.accentText }} />
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold" style={{ color: theme.text }}>{label}</span>
            <span className="text-[10.5px]" style={{ color: theme.text3 }}>{meta}</span>
          </div>
        );
      })}
      <div style={{ ...layer, left: '50%', bottom: 18, opacity: cta, transform: `translate3d(-50%, ${(1 - cta) * 14}px, ${20 + cta * 40}px) scale(${1 - press * 0.06})` }}>
        <span className={chipClass} style={{ background: theme.accent, color: '#fff', fontSize: 12, padding: '7px 16px', boxShadow: 'var(--elev-2)' }}>Începe, 15 min</span>
      </div>
    </>
  );
}

/** Numărul de întrebări se alege, amestecul CS/CM se așază, apoi raportul vine în față cu o estimare orientativă. */
export function SimulationScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const shown = Math.round((40 + 60 * easeInOut(fr(t, 600, 1400))) / 10) * 10;
  const cs = easeOut(fr(t, 2400, 900));
  const report = easeInOut(fr(t, 4400, 1200));
  const score = Math.round(68 * easeOut(fr(t, 5200, 1600)));
  return (
    <>
      <div
        className="px-4 py-3"
        style={{
          ...layer, ...sceneCard(theme, 2), left: 'calc(50% - 150px)', top: 38, width: 300,
          transform: `translate3d(0, ${report * -8}px, ${-30 - report * 90}px) rotateX(${report * 6}deg)`, opacity: 1 - report * 0.5,
        }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: theme.text3 }}>Simulare</div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-[12px]" style={{ color: theme.text2 }}>Număr de întrebări</span>
          <b className="text-[20px] tabular-nums" style={{ color: theme.text }}>{shown}</b>
        </div>
        <div className="mt-2 flex gap-2" style={{ opacity: cs, transform: `translateY(${(1 - cs) * 8}px)` }}>
          <span className={chipClass} style={{ ...sceneChip(theme) }}>CS · răspuns unic</span>
          <span className={chipClass} style={{ ...sceneChip(theme) }}>CM · răspunsuri multiple</span>
        </div>
      </div>
      <div
        className="px-4 py-3"
        style={{
          ...layer, ...sceneCard(theme, 3), left: 'calc(50% - 130px)', top: 'calc(50% - 8px)', width: 260,
          transform: `translate3d(0, ${(1 - report) * 40}px, ${-80 + report * 120}px) rotateY(${(1 - report) * -14}deg)`, opacity: report,
        }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: theme.text3 }}>Raport</div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-[12px]" style={{ color: theme.text2 }}>Estimare orientativă</span>
          <b className="text-[20px] tabular-nums" style={{ color: theme.text }}>~{score}%</b>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: theme.fillSubtle }}>
          <div className="h-full rounded-full" style={{ width: `${score}%`, background: theme.accent }} />
        </div>
        <div className="mt-1.5 text-[10.5px]" style={{ color: theme.text3 }}>Nu e o promisiune de rezultat la examen.</div>
      </div>
    </>
  );
}

const ROOTS = [
  { name: 'Confuzie între concepte', value: 46 },
  { name: 'Detaliu uitat', value: 32 },
  { name: 'Citit în grabă', value: 22 },
];

/** Întrebări de ghidare, tipul erorii salvat, apoi cardul „Unde se rupe raționamentul” din Statistici. */
export function SocraticScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const q1 = easeOut(fr(t, 300, 800));
  const q2 = easeOut(fr(t, 1700, 800));
  const tag = easeOut(fr(t, 3200, 700));
  const stats = easeInOut(fr(t, 4600, 1200));
  return (
    <>
      <div style={{ ...layer, left: 'calc(50% - 190px)', top: 30, width: 220 }}>
        {['Ce ți-a spus enunțul despre debit?', 'Ce se întâmplă cu presiunea dacă…?'].map((q, i) => {
          const k = i ? q2 : q1;
          return (
            <div
              key={q}
              className="mb-2 px-3 py-2 text-[11.5px]"
              style={{ ...layer, position: 'relative', ...sceneCard(theme, 2), color: theme.text, opacity: k * (1 - stats * 0.4), transform: `translate3d(${(1 - k) * -20}px, 0, ${k * 30 - stats * 60}px)` }}
            >
              {q}
            </div>
          );
        })}
        <div style={{ opacity: tag, transform: `translate3d(0, ${(1 - tag) * 8}px, 40px)` }}>
          <span className={chipClass} style={{ ...sceneChip(theme) }}><Check size={11} /> Tip de eroare salvat</span>
        </div>
      </div>
      <div
        className="p-3"
        style={{
          ...layer, ...sceneCard(theme, 3), left: 'calc(50% + 10px)', top: 'calc(50% - 56px)', width: 190,
          transform: `translate3d(${(1 - stats) * 40}px, 0, ${-80 + stats * 110}px) rotateY(${-16 + stats * 8}deg)`, opacity: stats,
        }}
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: theme.text3 }}>Unde se rupe raționamentul</div>
        {ROOTS.map((r, i) => (
          <div key={r.name} className="mt-2">
            <div className="flex justify-between text-[10.5px]" style={{ color: theme.text }}><span>{r.name}</span><b className="tabular-nums">{r.value}%</b></div>
            <div className="mt-0.5 h-1 overflow-hidden rounded-full" style={{ background: theme.fillSubtle }}>
              <div className="h-full rounded-full" style={{ width: `${r.value * 2 * easeOut(fr(t, 5400 + i * 250, 700))}%`, background: theme.accent }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Pagina din carte (cu pasajul evidențiat) dă un card cu citare la pagină; fiecare card se acceptă pe rând. */
export function BookCardsScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const page = easeOut(fr(t, 0, 900));
  const mark = easeOut(fr(t, 1200, 900));
  const cards = [easeOut(fr(t, 2800, 800)), easeOut(fr(t, 3500, 800))];
  const accepted = easeOut(fr(t, 5200, 600));
  return (
    <>
      <div
        className="px-4 py-3"
        style={{
          ...layer, ...sceneCard(theme, 2), left: 'calc(50% - 190px)', top: 40, width: 170, height: 150,
          transform: `translate3d(0, ${(1 - page) * 20}px, ${-60 + page * 30}px) rotateY(${14 - page * 4}deg)`, opacity: page,
        }}
      >
        <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: theme.text3 }}><BookOpen size={11} /> Lawrence · p. 412</div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="mt-2 h-1.5 rounded-full" style={{ width: `${88 - i * 9}%`, background: i === 1 || i === 2 ? `color-mix(in srgb, ${theme.warning} ${Math.round(mark * 55)}%, ${theme.fillSubtle})` : theme.fillSubtle }} />
        ))}
      </div>
      {cards.map((k, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-3"
          style={{
            ...layer, ...sceneCard(theme, 3), left: 'calc(50% - 6px)', top: 52 + i * 62, width: 190, height: 52,
            transform: `translate3d(${(1 - k) * 30}px, 0, ${-20 + k * 50}px) rotateY(${-10 + k * 4}deg)`, opacity: k,
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11.5px] font-semibold" style={{ color: theme.text }}>{i ? 'Card: criterii de cardioversie' : 'Schemă: conduita în tahicardie'}</div>
            <div className="text-[10px]" style={{ color: theme.text3 }}>Lawrence · p. 412</div>
          </div>
          <span className={chipClass} style={i === 0 ? { background: theme.accent, color: '#fff', fontSize: 10 } : { ...sceneChip(theme), fontSize: 10 }}>
            {i === 0 && accepted > 0.5 ? <Check size={10} /> : null}{i === 0 && accepted > 0.5 ? 'Acceptat' : 'Acceptă'}
          </span>
        </div>
      ))}
    </>
  );
}

const EXAM_TOPICS = [
  { name: 'Insuficiența cardiacă', meta: '14 grile · 2021–2025', hot: 'p. 212' },
  { name: 'Hiponatremia', meta: '9 grile · 2022–2025', hot: 'p. 87' },
  { name: 'Artrita reumatoidă', meta: '6 grile · 2021–2024', hot: 'p. 640' },
];

/** Rândurile din Organizare primesc „La examen”: grile căzute, anii și paginile fierbinți. */
export function ExamScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const open = easeInOut(fr(t, 2400, 1000));
  return (
    <>
      {EXAM_TOPICS.map(({ name, hot }, i) => {
        const k = easeOut(fr(t, i * 220, 900));
        const focus = i === 0;
        return (
          <div
            key={name}
            className="flex items-center gap-2.5 px-3.5"
            style={{
              ...layer, ...sceneCard(theme, focus ? 3 : 1), left: 'calc(50% - 150px)', top: 30 + i * 40 + (focus ? 0 : open * 62), width: 300, height: 34,
              transform: `translate3d(0, ${(1 - k) * 16}px, ${-40 + k * 40 + (focus ? open * 30 : 0)}px)`, opacity: k,
            }}
          >
            <span className="h-3.5 w-3.5 flex-none rounded-full" style={{ border: `2px solid ${theme.accent}` }} />
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium" style={{ color: theme.text }}>{name}</span>
            <span className="text-[10px]" style={{ color: theme.text3 }}>{focus ? 'La examen ›' : hot}</span>
          </div>
        );
      })}
      <div
        className="px-3.5 py-2.5"
        style={{
          ...layer, ...sceneCard(theme, 3), left: 'calc(50% - 150px)', top: 68, width: 300,
          transform: `translate3d(0, ${(1 - open) * -12}px, ${open * 70}px)`, opacity: open,
        }}
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: theme.text3 }}>La examen</div>
        <div className="mt-1 text-[12px] font-semibold" style={{ color: theme.text }}>{EXAM_TOPICS[0].meta}</div>
        <div className="mt-1.5 flex gap-1.5">
          <span className={chipClass} style={{ ...sceneChip(theme), fontSize: 10 }}>Pagină fierbinte · {EXAM_TOPICS[0].hot}</span>
        </div>
      </div>
    </>
  );
}
