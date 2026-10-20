import { Fragment, type CSSProperties } from 'react';
import { Activity, AlertCircle, BarChart3, BookMarked, BookOpen, CalendarDays, Check, MessageCircle, Target } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { onFillText } from '../../theme/contrastText';
import { fraction as fr, useSceneTime } from '../film/useTimeline';
import { easeInOut, easeOut, sceneCard, sceneChip } from './stage3d';

/*
 * Scenele 3D din „Ce e nou” 1.1. Fiecare cadru e o proiecție a ceasului filmului (`useSceneTime`): poziții, rotații și
 * opacități calculate din timp, fără cronometre și fără animații independente. Scena e inertă; textul e în `transcript`.
 */

const layer: CSSProperties = { position: 'absolute', transformStyle: 'preserve-3d' };
const chipClass = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold';
const shade = (color: string, amount: number) => `color-mix(in srgb, ${color} ${100 - amount}%, #000)`;
const tint = (color: string, amount: number) => `color-mix(in srgb, ${color} ${100 - amount}%, #fff)`;

const ORBIT = [BookOpen, BookMarked, Target, MessageCircle, CalendarDays, BarChart3, Activity];

/** 1.1 pe trei plăci de sticlă în adâncime, cu noutățile pe o orbită. */
export function HeroScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const sweep = easeInOut(fr(t, 1500, 1100));
  const appear = easeOut(fr(t, 2200, 1600));
  const planeFill = [`color-mix(in srgb, ${theme.accent2} 22%, ${theme.surface})`, `color-mix(in srgb, ${theme.accent} 16%, ${theme.surface})`, theme.surface];
  return (
    <>
      <div style={{ ...layer, left: '50%', top: '50%' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={`ring-${i}`}
            className="rounded-full"
            style={{
              ...layer,
              left: -150 - i * 26, top: -150 - i * 26, width: 300 + i * 52, height: 300 + i * 52,
              border: `1px solid ${theme.accent}${['2e', '20', '14'][i]}`,
              transform: `rotateX(72deg) rotateZ(${t * 0.006 * (i % 2 ? -1 : 1)}deg)`,
              opacity: easeOut(fr(t, 300 + i * 150, 900)),
            }}
          />
        ))}
        {[0, 1, 2].map((i) => {
          const k = easeOut(fr(t, i * 220, 1100));
          return (
            <div
              key={`plane-${i}`}
              className="overflow-hidden"
              style={{
                ...layer,
                left: -86, top: -58, width: 172, height: 116,
                borderRadius: 'var(--r-lg)', border: `1px solid ${theme.border}`,
                background: planeFill[i], boxShadow: `var(--elev-${i + 1})`,
                transform: `translate3d(${(i - 2) * 14}px, ${(i - 2) * 10}px, ${-260 + k * (260 + (i - 2) * 36)}px)`,
                opacity: k,
              }}
            >
              {i === 2 && (
                <>
                  <div
                    className="absolute inset-0 grid place-items-center text-[62px] font-extrabold"
                    style={{ letterSpacing: '-0.04em', background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
                  >
                    1.1
                  </div>
                  <div
                    className="absolute -bottom-6 -top-6 w-[46px]"
                    style={{ left: `${-30 + sweep * 140}%`, background: `linear-gradient(90deg, transparent, ${theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.7)'}, transparent)`, transform: 'skewX(-18deg)' }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
      {ORBIT.map((Icon, i) => {
        const a = (i / ORBIT.length) * Math.PI * 2 + t * 0.00028;
        const radius = 168 * (0.6 + 0.4 * appear);
        const z = Math.sin(a) * radius * 0.9;
        return (
          <div
            key={i}
            className="grid h-[34px] w-[34px] place-items-center"
            style={{
              ...layer, ...sceneCard(theme, 1), borderRadius: 'var(--r-sm)', color: theme.accentText,
              left: 'calc(50% - 17px)', top: 'calc(50% - 17px)',
              transform: `translate3d(${Math.cos(a) * radius}px, ${Math.sin(a) * 18 + 6}px, ${z - 40}px)`,
              opacity: easeOut(fr(t, 2200 + i * 160, 600)) * (0.45 + 0.55 * (z / radius + 1) / 2),
            }}
          >
            <Icon size={15} />
          </div>
        );
      })}
    </>
  );
}

const PLAN_PASSES = [
  { label: 'Faza 1', from: 0, share: 38 },
  { label: 'Faza 2', from: 38, share: 28 },
  { label: 'Faza 3', from: 66, share: 17 },
  { label: 'Faza 4', from: 83, share: 9 },
  { label: 'Simulări', from: 92, share: 8 },
];

/** Bara celor patru treceri pe o placă de sticlă, ziua de azi pe ea, apoi rândul „restanțe” care vine în față și duce la topicuri. */
export function PlanScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const tones = [theme.accent, theme.success, theme.warning, theme.danger, theme.accent2];
  const plate = easeOut(fr(t, 0, 1100));
  const today = easeOut(fr(t, 1400, 700));
  const late = easeOut(fr(t, 2800, 900));
  const press = Math.sin(fr(t, 4600, 400) * Math.PI);
  const open = easeInOut(fr(t, 5000, 1000));
  const rows = ['Artrita reumatoidă', 'Hiponatremia', 'Diureticele'];
  return (
    <>
      <div style={{ ...layer, left: '50%', top: '50%' }}>
        {/* the timeline, lying back on its plate */}
        <div
          className="px-4 pb-4 pt-3"
          style={{
            ...layer, ...sceneCard(theme, 2), left: -170, top: -128, width: 340,
            transform: `translate3d(0, ${(1 - plate) * 30}px, ${-80 - (1 - plate) * 120 - open * 60}px) rotateX(${14 - plate * 6}deg)`,
            opacity: plate * (1 - open * 0.35),
          }}
        >
          <div className="text-[11px] font-semibold" style={{ color: theme.text }}>Cele patru treceri</div>
          <div className="relative mt-5 flex h-[18px] overflow-hidden rounded-[var(--r-sm)]">
            {PLAN_PASSES.map((p, i) => {
              const grow = easeOut(fr(t, 300 + i * 140, 700));
              return (
                <div
                  key={p.label}
                  className="absolute inset-y-0 flex items-center justify-center overflow-hidden whitespace-nowrap text-[8.5px] font-bold"
                  style={{ left: `${p.from}%`, width: `${p.share}%`, background: tones[i], color: onFillText(tones[i]), transform: `scaleX(${grow})`, transformOrigin: 'left' }}
                >
                  {p.share > 8 ? p.label : ''}
                </div>
              );
            })}
          </div>
          <div style={{ position: 'absolute', left: 'calc(16px + 4%)', top: 34, opacity: today, transform: `translateY(${(1 - today) * -10}px)` }}>
            <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold" style={{ background: theme.text, color: theme.bg }}>Azi</span>
            <div className="mx-auto mt-0.5 h-[24px] w-[2px] rounded-full" style={{ background: theme.text }} />
          </div>
        </div>
        {/* „N restanțe”: comes forward from the plate and is pressed */}
        <div
          className="flex items-center justify-between gap-3 px-3.5"
          style={{
            ...layer, ...sceneCard(theme, 3), left: -150, top: -40, width: 300, height: 36,
            background: `color-mix(in srgb, ${theme.warning} 10%, ${theme.surface})`,
            transform: `translate3d(0, ${(1 - late) * -36}px, ${-60 + late * 90 + open * 20}px) scale(${1 - press * 0.04})`,
            opacity: late,
          }}
        >
          <span className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: theme.text }}>
            <AlertCircle size={14} style={{ color: theme.warning }} /> 3 restanțe
          </span>
          <span className="text-[10.5px] font-semibold" style={{ color: theme.warning }}>termen trecut ›</span>
        </div>
        {/* the topics it opens, each marked „restant” */}
        {rows.map((name, i) => {
          const k = easeOut(fr(t, 5400 + i * 180, 700));
          return (
            <div
              key={name}
              className="flex items-center gap-2.5 px-3.5"
              style={{
                ...layer, ...sceneCard(theme, 1), left: -150, top: 6 + i * 34, width: 300, height: 28,
                transform: `translate3d(0, ${(1 - k) * 16}px, ${-20 + k * 40}px)`,
                opacity: k,
              }}
            >
              <span className="h-3.5 w-3.5 flex-none rounded-full" style={{ border: `2px solid ${theme.accent}` }} />
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium" style={{ color: theme.text }}>{name}</span>
              <span className="rounded-full px-1.5 py-px text-[9px] font-semibold" style={{ background: `color-mix(in srgb, ${theme.warning} 16%, transparent)`, color: theme.warning }}>restant</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

const BOOK = { w: 74, h: 104, d: 20 };

/** Kumar, Lawrence și Sinopsis în picioare, pregătite singure și marcate „Carte de bază”; Banca de materiale în spate. */
export function BooksScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const tones = [theme.accent, theme.accent2, theme.successFill];
  const recede = easeOut(fr(t, 4400, 1200));
  const progress = Math.round(easeInOut(fr(t, 1600, 3000)) * 100);
  const done = progress >= 100;
  return (
    <>
      <div style={{ ...layer, left: '50%', top: '52%' }}>
        <div
          className="flex items-end justify-center pb-2.5 text-[11px] font-semibold"
          style={{
            ...layer, left: -190, top: -70, width: 380, height: 150, borderRadius: 'var(--r-lg)',
            border: `1px dashed ${theme.border2}`, background: theme.surface2, color: theme.text3,
            transform: `translate3d(0, 6px, ${-150 - recede * 60}px)`, opacity: 1 - recede * 0.4,
          }}
        >
          Banca de materiale
        </div>
        {['Kumar', 'Lawrence', 'Sinopsis'].map((name, i) => {
          const k = easeOut(fr(t, 150 + i * 200, 900));
          const turn = -48 + 24 * easeOut(fr(t, 900, 1800));
          const tag = easeOut(fr(t, 5000 + i * 220, 600));
          const tone = tones[i];
          return (
            <div
              key={name}
              style={{
                ...layer, left: -BOOK.w / 2, top: -BOOK.h / 2, width: BOOK.w, height: BOOK.h,
                transform: `translate3d(${(i - 1) * 104}px, ${(1 - k) * -50}px, ${(1 - k) * -120}px) rotateY(${turn}deg)`,
                opacity: k,
              }}
            >
              <div style={{ position: 'absolute', left: 0, top: 0, width: BOOK.d, height: BOOK.h, background: shade(tone, 30), transformOrigin: 'left', transform: `translateZ(${BOOK.d / 2}px) rotateY(-90deg)` }} />
              <div style={{ position: 'absolute', right: 0, top: 0, width: BOOK.d, height: BOOK.h, background: `repeating-linear-gradient(90deg, ${theme.surface}, ${theme.surface} 2px, ${theme.border} 3px)`, transformOrigin: 'right', transform: `translateZ(${BOOK.d / 2}px) rotateY(90deg)` }} />
              <div
                className="absolute inset-0 flex flex-col justify-between px-2.5 py-2.5 text-white"
                style={{ borderRadius: 'var(--r-sm) 0 0 var(--r-sm)', background: `linear-gradient(150deg, ${tint(tone, 12)}, ${tone})`, transform: `translateZ(${BOOK.d / 2}px)`, boxShadow: 'var(--elev-2)' }}
              >
                <span className="text-[8px] font-bold uppercase tracking-[0.14em] opacity-80">Carte</span>
                <span className="text-[12.5px] font-extrabold">{name}</span>
              </div>
              <div style={{ ...layer, left: BOOK.w / 2 - 46, top: -28, width: 92, textAlign: 'center', opacity: tag, transform: `translate3d(0, ${(1 - tag) * 10}px, ${20 + tag * 30}px)` }}>
                <span className={chipClass} style={{ ...sceneChip(theme), fontSize: 9.5 }}><Check size={10} strokeWidth={3} /> Carte de bază</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ ...layer, left: '50%', bottom: 12, transform: 'translateX(-50%)', opacity: easeOut(fr(t, 1300, 400)) }}>
        <span className={`${chipClass} tabular-nums`} style={{ ...sceneChip(theme), color: theme.text2 }}>
          <span className="h-3 w-3 rounded-full" style={{ background: `conic-gradient(${done ? theme.success : theme.accent} ${progress * 3.6}deg, ${theme.fillSubtle} 0)` }} />
          {done ? 'Gata · 3 cărți pregătite, protejate' : `Se pregătesc singure · ${progress}%`}
        </span>
      </div>
    </>
  );
}

const PASSAGE = ['Pacientul instabil hemodinamic, cu tahicardie', 'cu complexe largi, necesită cardioversie', 'electrică sincronizată imediată.'];

/** O grilă din bancă se dă la o parte, iar pagina din carte vine în față cu pasajul evidențiat pe roluri. */
export function SourceScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const enter = easeOut(fr(t, 0, 700));
  const press = 1 - Math.sin(fr(t, 1500, 400) * Math.PI) * 0.08;
  const swap = easeInOut(fr(t, 2000, 1100));
  const cite = easeOut(fr(t, 6000, 700));
  const mark = (k: number, color: string): CSSProperties => ({ position: 'absolute', inset: 0, zIndex: -1, borderRadius: 'var(--r-sm)', background: color, transformOrigin: 'left', transform: `scaleX(${k})` });
  return (
    <>
      <div
        className="overflow-hidden px-[18px] py-4"
        style={{
          ...layer, left: 'calc(50% - 130px)', top: 18, width: 260, height: 200, ...sceneCard(theme, 3), borderRadius: 'var(--r-sm)',
          transform: `translate3d(${swap * 40}px, 0, ${-110 + swap * 110}px) rotateY(${-10 + swap * 6}deg)`, opacity: 0.55 + swap * 0.45,
        }}
      >
        <div className="mb-2.5 text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.text3 }}>Tahiaritmii · Lawrence</div>
        {[92, 84, 96].map((width) => <div key={width} className="mb-[9px] h-1.5 rounded-full" style={{ width: `${width}%`, background: theme.skeleton }} />)}
        {PASSAGE.map((line, i) => (
          <div key={line} className="relative -mx-1 mb-px px-1 text-[10.5px] leading-[15px]" style={{ color: theme.text, isolation: 'isolate' }}>
            <span style={mark(easeOut(fr(t, 3600 + i * 450, 520)), `${theme.accent}38`)} />
            {line}
          </div>
        ))}
        <div className="relative -mx-1 mt-2 px-1 text-[10.5px] leading-[15px]" style={{ color: theme.text2, isolation: 'isolate' }}>
          <span style={mark(easeOut(fr(t, 5100, 520)), `${theme.warning}2e`)} />
          Amiodarona rămâne pentru pacientul stabil.
        </div>
        <div className="absolute bottom-2.5 right-3.5 text-[9px] tabular-nums" style={{ color: theme.text3 }}>p. 412</div>
      </div>
      <div
        className="p-3.5"
        style={{
          ...layer, ...sceneCard(theme), left: 'calc(50% - 140px)', top: 30, width: 280,
          transform: `translate3d(${-swap * 150}px, ${(1 - enter) * 20 + swap * 40}px, ${30 - swap * 60}px) rotateY(${swap * 32}deg) scale(${1 - swap * 0.18})`,
          opacity: enter * (1 - swap * 0.5),
        }}
      >
        <div className="text-[12px] font-semibold leading-snug" style={{ color: theme.text }}>Tahicardie regulată, QRS larg, hipotensiv. Prima conduită?</div>
        <div className="mt-2 flex items-center gap-1.5 rounded-[var(--r-sm)] border px-2 py-1.5 text-[11px]" style={{ borderColor: theme.success, color: theme.success, background: `${theme.success}1a` }}>
          <b>B</b><span className="flex-1">Cardioversie electrică sincronizată</span><Check size={12} strokeWidth={3} />
        </div>
        <div className="mt-2.5 flex justify-end">
          <span className={chipClass} style={{ background: theme.accent, color: '#fff', transform: `scale(${press})` }}><BookOpen size={11} /> Vezi în carte</span>
        </div>
      </div>
      <div style={{ ...layer, left: 'calc(50% + 40px)', top: 16, opacity: cite, transform: `translate3d(${swap * 40}px, ${(1 - cite) * 12}px, ${30 + cite * 50}px)` }}>
        <span className={chipClass} style={{ ...sceneChip(theme), boxShadow: 'var(--elev-2)' }}><BookOpen size={11} /> Lawrence · p. 412</span>
      </div>
    </>
  );
}

/** Trei subiecte în adâncime; Exersează întoarce cardul, iar pe spate stăpânirea urcă de la 21% la 50%. */
export function FocusScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const leave = easeInOut(fr(t, 2700, 700));
  const flip = easeInOut(fr(t, 2900, 1000));
  const value = Math.round(21 + 29 * easeOut(fr(t, 4300, 1700)));
  const rows = [
    { title: 'Aritmii', meta: '10 greșeli din 12 · 21%', tone: theme.danger, Icon: Target },
    { title: 'Insuficiență cardiacă', meta: 'Neatinsă de 10 zile · 86%', tone: theme.accentText, Icon: BookOpen },
    { title: 'Tiroidă', meta: '6 greșeli din 9 · 38%', tone: theme.warning, Icon: Target },
  ];
  const face: CSSProperties = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };
  return (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ ...layer, left: 'calc(50% - 150px)', top: 24, color: theme.text3 }}>Pentru tine</div>
      {rows.map(({ title, meta, tone, Icon }, i) => {
        const k = easeOut(fr(t, i * 180, 900));
        const z = -i * 60 - (1 - k) * 140 - (i ? leave * 120 : 0);
        return (
          <div
            key={title}
            style={{
              ...layer, left: 'calc(50% - 150px)', top: 'calc(50% - 34px)', width: 300, height: 68,
              transform: `translate3d(0, ${i * -22 - (i ? leave * 10 : 0)}px, ${z}px) rotateX(${i ? 6 : flip * 180}deg)`,
              opacity: k * (i ? (1 - leave) * (1 - i * 0.18) : 1),
            }}
          >
            <div className="flex items-center gap-2.5 px-3.5" style={{ ...face, ...sceneCard(theme, i === 0 ? 3 : 2) }}>
              <div className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[var(--r-sm)]" style={{ color: tone, background: `${tone}1f` }}><Icon size={16} /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold" style={{ color: theme.text }}>{title}</div>
                <div className="truncate text-[11px]" style={{ color: theme.text3 }}>{meta}</div>
              </div>
              <span
                className={chipClass}
                style={i === 0
                  ? { background: theme.accent, color: '#fff', transform: `scale(${1 - Math.sin(fr(t, 2300, 400) * Math.PI) * 0.1})` }
                  : { background: theme.fillSubtle, color: theme.accentText }}
              >
                Exersează
              </span>
            </div>
            {i === 0 && (
              <div className="px-4 py-2.5" style={{ ...face, ...sceneCard(theme, 3), transform: 'rotateX(180deg)' }}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] font-semibold" style={{ color: theme.text }}>Aritmii</span>
                  <span className="text-[11px] tabular-nums" style={{ color: theme.text3 }}>21% → <b className="text-[17px]" style={{ color: theme.text }}>{value}%</b></span>
                </div>
                <div className="mt-[7px] h-1.5 overflow-hidden rounded-full" style={{ background: theme.fillSubtle }}>
                  <div className="h-full rounded-full" style={{ width: `${value}%`, background: theme.success }} />
                </div>
                <div className="mt-1.5 text-[11px]" style={{ color: theme.success, opacity: fr(t, 6100, 400) }}>+29 puncte după sesiune</div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

const ANSWER = 'Cardioversia sincronizată este prima conduită la pacientul instabil [1]; amiodarona rămâne pentru cel stabil [2].';
/** Bucățile răspunsului cu poziția lor în text: o citare apare întreagă, după ce s-a scris tot până la ea. */
const ANSWER_PARTS = ANSWER.split(/(\[\d\])/).reduce<{ text: string; start: number; end: number }[]>((parts, text) => {
  const start = parts.length ? parts[parts.length - 1].end : 0;
  return [...parts, { text, start, end: start + text.length }];
}, []);

/** Răspunsul din chat se scrie, iar citările [1] și [2] își aduc în față sursele: Carte și Material. */
export function ChatScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const tones = [theme.accentText, theme.accent2];
  const typed = Math.floor(fr(t, 400, 2600) * ANSWER.length);
  const enter = easeOut(fr(t, 0, 600));
  const suggestion = easeOut(fr(t, 5800, 600));
  const parts = ANSWER_PARTS.map(({ text: part, start, end }, index) => {
    const marker = /^\[(\d)\]$/.exec(part);
    if (marker) {
      if (typed < end) return null;
      const n = Number(marker[1]);
      return (
        <span key={index} className="mx-px inline-grid h-4 min-w-[16px] place-items-center rounded-full align-middle text-[9.5px] font-bold" style={{ color: tones[n - 1], background: `${tones[n - 1]}24` }}>{n}</span>
      );
    }
    return <Fragment key={index}>{part.slice(0, Math.max(0, typed - start))}</Fragment>;
  });
  const sources = [
    { kind: 'Carte', label: 'Lawrence · p. 412', x: -80 },
    { kind: 'Material', label: 'Curs cardiologie · p. 7', x: 80 },
  ];
  const markerAt = [ANSWER.indexOf('[1]'), ANSWER.indexOf('[2]')];
  return (
    <>
      <div
        className="min-h-[76px] px-3.5 py-3 text-left text-[12px] leading-relaxed"
        style={{ ...layer, ...sceneCard(theme), left: 'calc(50% - 160px)', top: 22, width: 320, color: theme.text, opacity: enter, transform: `translate3d(0, ${(1 - enter) * 14}px, 20px)` }}
      >
        {parts}
      </div>
      {sources.map(({ kind, label, x }, i) => {
        const k = easeOut(fr(t, 400 + (markerAt[i] / ANSWER.length) * 2600 + 200, 800));
        const pulse = Math.sin(fr(t, 3400 + i * 900, 700) * Math.PI);
        return (
          <div
            key={kind}
            className="px-[11px] py-[9px] text-left"
            style={{
              ...layer, ...sceneCard(theme), left: `calc(50% - 92px + ${x}px)`, top: 126, width: 184,
              opacity: k,
              transform: `translate3d(0, ${(1 - k) * 20}px, ${-120 + k * 100 + pulse * 26}px) rotateY(${(i ? -1 : 1) * (14 - k * 6)}deg)`,
              outline: pulse > 0.01 ? `${Math.round(pulse * 3)}px solid ${tones[i]}4d` : undefined,
            }}
          >
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: tones[i] }}>
              <span className="inline-grid h-4 min-w-[16px] place-items-center rounded-full" style={{ background: `${tones[i]}24` }}>{i + 1}</span>{kind}
            </div>
            <div className="mt-0.5 text-[11.5px] font-semibold" style={{ color: theme.text }}>{label}</div>
          </div>
        );
      })}
      <div style={{ ...layer, left: '50%', top: 194, opacity: suggestion, transform: `translate3d(-50%, ${(1 - suggestion) * 10}px, ${suggestion * 20}px)` }}>
        <span className={chipClass} style={sceneChip(theme)}><MessageCircle size={11} /> Fă 5 grile pe Aritmii</span>
      </div>
    </>
  );
}

const TOPICS = [
  { name: 'Cardiologie', value: 82 },
  { name: 'Aritmii', value: 21 },
  { name: 'Neurologie', value: 64 },
  { name: 'Tiroidă', value: 38 },
  { name: 'Pediatrie', value: 71 },
];
const BAR = 26;

/** Bare 3D pe o podea în perspectivă: subiectele slabe se colorează și ies în față, lângă lista de la care pornește raportul. */
export function GapsScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const highlight = easeOut(fr(t, 2600, 900));
  const legend = easeOut(fr(t, 4800, 700));
  return (
    <>
      <div
        style={{
          ...layer, left: 'calc(50% - 200px)', top: 70, width: 240, height: 130, borderRadius: 'var(--r-md)',
          border: `1px solid ${theme.border}`, background: `radial-gradient(circle at 50% 50%, ${theme.accent}1a, transparent 70%)`,
          transform: 'rotateX(60deg) rotateZ(-24deg) translateZ(-30px)', opacity: easeOut(fr(t, 0, 600)),
        }}
      >
        {TOPICS.map(({ name, value }, i) => {
          const weak = value < 50;
          const height = Math.max(2, value * 1.15 * easeOut(fr(t, 400 + i * 160, 1400)));
          const tone = value < 30 ? theme.danger : theme.warning;
          const base = weak ? `color-mix(in srgb, ${tone} ${Math.round(highlight * 100)}%, ${theme.accent})` : theme.accent;
          return (
            <div key={name} style={{ ...layer, left: 22 + i * 42, top: 52, width: BAR, height: BAR, opacity: weak ? 1 : 1 - highlight * 0.45 }}>
              <div style={{ position: 'absolute', left: 0, top: BAR, width: BAR, height, background: base, transformOrigin: 'top', transform: 'rotateX(90deg)' }} />
              <div style={{ position: 'absolute', left: BAR, top: 0, width: height, height: BAR, background: shade(base, 28), transformOrigin: 'left', transform: 'rotateY(-90deg)' }} />
              <div style={{ position: 'absolute', inset: 0, background: tint(base, 30), transform: `translateZ(${height}px)` }} />
            </div>
          );
        })}
      </div>
      <div
        className="p-3 text-left"
        style={{ ...layer, ...sceneCard(theme), left: 'calc(50% + 40px)', top: 46, width: 160, opacity: legend, transform: `translate3d(${(1 - legend) * 20}px, 0, ${-80 + legend * 100}px) rotateY(${-16 + legend * 8}deg)` }}
      >
        <div className="text-[9.5px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.text3 }}>Subiecte slabe</div>
        {[{ name: 'Aritmii', value: 21, tone: theme.danger }, { name: 'Tiroidă', value: 38, tone: theme.warning }].map((row, i) => (
          <div key={row.name} className="mt-1.5 flex justify-between text-[12px]" style={{ color: theme.text, opacity: easeOut(fr(t, 5200 + i * 300, 500)) }}>
            <span>{row.name}</span><b className="tabular-nums" style={{ color: row.tone }}>{row.value}%</b>
          </div>
        ))}
        <div className="mt-2.5" style={{ opacity: easeOut(fr(t, 5800, 500)) }}>
          <span className={chipClass} style={{ background: theme.accent, color: '#fff', fontSize: 10.5 }}>Ce nu știu?</span>
        </div>
      </div>
    </>
  );
}

/** Trei furnizori pe un inel care se rotește; Gemini are cota epuizată, iar cererea trece singură pe Mistral. */
export function ProvidersScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const step = easeInOut(fr(t, 2200, 1100)) + easeInOut(fr(t, 5200, 1100));
  const enter = easeOut(fr(t, 0, 900));
  const notice = easeOut(fr(t, 6200, 600));
  const tiles = [
    { name: 'Groq', status: 'Activ', tone: theme.success, extra: <div className="text-[10.5px]" style={{ color: theme.text3 }}>Răspuns în 0,4 s</div> },
    {
      name: 'Gemini', status: 'Cotă epuizată până la 14:00', tone: theme.warning,
      extra: (
        <>
          <div className="text-[10.5px]" style={{ color: theme.text }}><b>Gemini 4 Argon</b> · cotă proprie</div>
          <div className="text-[10.5px] line-through" style={{ color: theme.text3, opacity: 0.6 }}>Model vechi · retras</div>
        </>
      ),
    },
    { name: 'Mistral', status: 'Activ', tone: theme.success, extra: <div className="text-[10.5px]" style={{ color: theme.text3 }}>Preia cererile acum</div> },
  ];
  return (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ ...layer, left: 22, top: 18, color: theme.text3 }}>Stare furnizori</div>
      <div style={{ ...layer, left: '50%', top: '50%', transform: 'translate3d(0, -6px, -150px) rotateX(-4deg)' }}>
        {tiles.map(({ name, status, tone, extra }, i) => {
          const angle = ((i - step) * 120 * Math.PI) / 180;
          const depth = Math.cos(angle);
          const radius = 190 * enter;
          return (
            <div
              key={name}
              className="flex flex-col gap-[5px] px-3.5 py-3 text-left"
              style={{
                ...layer, ...sceneCard(theme), left: -92, top: -56, width: 184, height: 112, borderRadius: 'var(--r-lg)',
                transform: `translate3d(${Math.sin(angle) * radius}px, 0, ${depth * radius * 0.8}px) rotateY(${Math.sin(angle) * -24}deg)`,
                zIndex: Math.round(depth * 10) + 10,
                opacity: (0.28 + 0.72 * ((depth + 1) / 2) ** 1.4) * enter,
              }}
            >
              <div className="flex items-center gap-[7px]"><span className="h-2 w-2 rounded-full" style={{ background: tone }} /><b className="text-[13px]" style={{ color: theme.text }}>{name}</b></div>
              <div className="text-[11px] font-semibold" style={{ color: tone }}>{status}</div>
              {extra}
            </div>
          );
        })}
      </div>
      <div style={{ ...layer, left: '50%', bottom: 14, opacity: notice, transform: `translate3d(-50%, ${(1 - notice) * 10}px, 10px)` }}>
        <span className={chipClass} style={{ ...sceneChip(theme), color: theme.text2 }}><Activity size={11} /> Comutare automată: Gemini → Mistral</span>
      </div>
    </>
  );
}
