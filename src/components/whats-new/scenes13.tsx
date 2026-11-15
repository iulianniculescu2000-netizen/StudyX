import type { CSSProperties, ReactNode } from 'react';
import {
  AlertTriangle, BarChart3, BookOpen, Bot, Brain, Check, Clock, Flame, KeyRound, Monitor, Palette, Search, ShieldCheck, Sparkles, StickyNote, Target, Trophy,
} from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { fraction as fr, useSceneTime } from '../film/useTimeline';
import { HeroPlates } from './scenes';
import { chipClass, easeInOut, easeOut, layer, sceneCard, sceneChip } from './stage3d';

/*
 * Scenele 3D din „Ce e nou” 1.3. Aceleași reguli ca la 1.1 și 1.2: tot ce se vede se calculează din ceasul filmului
 * (`useSceneTime`), scena e inertă, iar povestea e în `transcript`. Cifrele, paginile și numele furnizorilor sunt doar
 * pentru ilustrare.
 */

type Theme = ReturnType<typeof useTheme>;

const ORBIT_13 = [Bot, BookOpen, ShieldCheck, Search, Palette];

/** 1.3 pe trei plăci de sticlă, cu noutățile pe orbită. */
export function Hero13Scene() {
  return <HeroPlates version="1.3" orbit={ORBIT_13} />;
}

/** Plăcuța colorată de lângă o cifră sau un titlu, ca în aplicație (pictogramă pe sticlă, nuanța secțiunii). */
function Plate({ theme, hue, size = 30, children }: { theme: Theme; hue: string; size?: number; children: ReactNode }) {
  return (
    <span
      className="grid flex-none place-items-center"
      style={{
        width: size, height: size, borderRadius: 'var(--r-sm)',
        background: `color-mix(in srgb, ${hue} 16%, ${theme.fillSubtle})`,
        border: `1px solid color-mix(in srgb, ${hue} 30%, transparent)`,
        color: `color-mix(in srgb, ${hue} 78%, ${theme.text2})`,
        boxShadow: 'inset 0 1px 0 var(--glass-highlight)',
      }}
    >
      {children}
    </span>
  );
}

const eyebrow = 'text-[9.5px] font-bold uppercase tracking-[0.12em]';
const skeleton = (theme: Theme, width: number | string): CSSProperties => ({ height: 6, width: typeof width === 'number' ? `${width}%` : width, borderRadius: 999, background: theme.fillSubtle });

/** Copilot din contul GitHub de pe calculator: contul se caută, preia chatul și explicațiile, iar la cotă atinsă cererile trec pe chei. */
export function CopilotScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const machine = easeOut(fr(t, 0, 900));
  const found = easeOut(fr(t, 500, 600));
  const press = Math.sin(fr(t, 1500, 420) * Math.PI);
  const card = easeOut(fr(t, 1900, 900));
  const chat = easeOut(fr(t, 2900, 600));
  const explain = easeOut(fr(t, 3300, 600));
  const keys = easeOut(fr(t, 3900, 900));
  const fill = easeInOut(fr(t, 5600, 1500));
  const spent = fill > 0.98;
  const fallback = easeOut(fr(t, 7400, 700));
  const tone = spent ? theme.warning : theme.success;

  return (
    <>
      {/* conectarea cu cod: butonul din Setări AI, codul introdus pe github.com */}
      <div
        className="px-3.5 py-2.5"
        style={{
          ...layer, ...sceneCard(theme, 1), left: 'calc(50% - 208px)', top: 20, width: 170,
          transform: `translate3d(0, ${(1 - machine) * 16}px, ${-70 + machine * 30}px) rotateY(${12 - machine * 6}deg)`, opacity: machine,
        }}
      >
        <div className={`flex items-center gap-1.5 ${eyebrow}`} style={{ color: theme.text3 }}><Monitor size={11} /> login/device</div>
        <div className="mt-1.5 rounded-[var(--r-sm)] px-2 py-1 font-mono text-[10.5px]" style={{ background: theme.fillSubtle, color: theme.text, letterSpacing: '0.16em' }}>ABCD-1234</div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold" style={{ color: theme.success, opacity: found }}>
          <Check size={11} strokeWidth={3} /> Cod confirmat
        </div>
      </div>
      <div style={{ ...layer, left: 'calc(50% - 208px)', top: 112, opacity: found, transform: `translate3d(0, ${(1 - found) * 8}px, ${30 + found * 30}px) scale(${1 - press * 0.07})` }}>
        <span className={chipClass} style={{ background: theme.accent, color: '#fff', fontSize: 11, padding: '6px 12px', boxShadow: 'var(--elev-2)' }}>
          <Bot size={11} /> Conectează GitHub Copilot
        </span>
      </div>

      {/* Copilot, cu cota contului */}
      <div
        className="px-3.5 py-3"
        style={{
          ...layer, ...sceneCard(theme, 3), left: 'calc(50% - 20px)', top: 16, width: 216,
          transform: `translate3d(${(1 - card) * 30}px, 0, ${-60 + card * 100}px) rotateY(${-14 + card * 8}deg)`, opacity: card,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 whitespace-nowrap text-[12px] font-semibold" style={{ color: theme.text }}>
            <Plate theme={theme} hue={theme.accent2} size={24}><Bot size={13} /></Plate> GitHub Copilot
          </span>
          <span
            className={chipClass}
            style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: spent ? theme.warning : theme.success, fontSize: 10, padding: '2px 8px' }}
          >
            {spent ? <AlertTriangle size={10} /> : <Check size={10} strokeWidth={3} />}
            {spent ? 'Cotă atinsă' : 'Conectat'}
          </span>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full" style={{ background: theme.fillSubtle }}>
          <div className="h-full rounded-full" style={{ width: `${12 + fill * 88}%`, background: spent ? theme.warning : theme.accent2 }} />
        </div>
        <div className="mt-1.5 whitespace-nowrap text-[10px] leading-snug" style={{ color: spent ? theme.warning : theme.text3 }}>
          {fallback > 0.5 ? 'Trece pe cheile API; reîncearcă mai târziu' : 'Cota contului tău e limitată'}
        </div>
      </div>
      {[
        { label: 'Chat AI', k: chat, x: -20, w: 64 },
        { label: 'Explicații', k: explain, x: 50, w: 80 },
        { label: 'Grile', k: explain, x: 136, w: 60 },
      ].map(({ label, k, x, w }) => (
        <div
          key={label}
          className="flex items-center justify-center px-2.5"
          style={{
            ...layer, ...sceneCard(theme, 2), left: `calc(50% + ${x}px)`, top: 118, width: w, height: 28,
            transform: `translate3d(0, ${(1 - k) * 12}px, ${-20 + k * 50}px)`, opacity: k,
          }}
        >
          <span className="whitespace-nowrap text-[10.5px] font-semibold" style={{ color: spent ? theme.text3 : theme.text }}>{label}</span>
        </div>
      ))}

      {/* sugestiile, analizele și verificarea rămân pe chei */}
      <div
        className="flex items-center gap-2.5 px-3.5"
        style={{
          ...layer, ...sceneCard(theme, 1), left: 'calc(50% - 208px)', top: 164, width: 416, height: 52,
          transform: `translate3d(0, ${(1 - keys) * 14}px, ${-30 + keys * 20}px)`, opacity: keys,
          outline: fallback > 0.01 ? `${Math.round(fallback * 2)}px solid color-mix(in srgb, ${theme.accent} 40%, transparent)` : undefined,
        }}
      >
        <Plate theme={theme} hue={theme.accent} size={28}><KeyRound size={14} /></Plate>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11.5px] font-semibold" style={{ color: theme.text }}>Analizele și verificarea rămân pe cheile tale</div>
          <div className="text-[10px]" style={{ color: theme.text3 }}>Groq · Gemini · Mistral</div>
        </div>
        <span className={chipClass} style={{ ...sceneChip(theme), fontSize: 10 }}>{fallback > 0.5 ? 'Preia cererea' : 'Nemodificat'}</span>
      </div>
    </>
  );
}

/** Explicația unei grile citează cartea, se deschide la pagină și rămâne salvată: a doua oară nu se mai cere. */
export function SavedExplanationScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const quiz = easeOut(fr(t, 0, 800));
  const press = Math.sin(fr(t, 1300, 420) * Math.PI);
  const explanation = easeOut(fr(t, 1700, 1000));
  const sources = easeOut(fr(t, 2900, 700));
  const open = Math.sin(fr(t, 3700, 420) * Math.PI);
  const book = easeInOut(fr(t, 3900, 1000));
  const mark = easeOut(fr(t, 4300, 800));
  const saved = easeOut(fr(t, 5400, 700));
  const again = easeOut(fr(t, 6700, 700));

  return (
    <>
      {/* pagina din carte: stă în spate, apoi vine în față cu pasajul evidențiat */}
      <div
        className="px-3.5 py-3"
        style={{
          ...layer, ...sceneCard(theme, 2), left: 'calc(50% - 208px)', top: 18, width: 150, height: 136,
          transform: `translate3d(0, 0, ${-70 + book * 120}px) rotateY(${14 - book * 10}deg)`, opacity: 0.4 + book * 0.6,
        }}
      >
        <div className={`flex items-center gap-1.5 ${eyebrow}`} style={{ color: theme.text3 }}><BookOpen size={11} /> Kumar · p. 142</div>
        {[0, 1, 2, 3, 4].map((i) => {
          const lit = i === 2 || i === 3;
          return (
            <div
              key={i}
              className="mt-2.5"
              style={{ ...skeleton(theme, 92 - i * 7), background: lit ? `color-mix(in srgb, ${theme.warning} ${Math.round(mark * 60)}%, ${theme.fillSubtle})` : theme.fillSubtle }}
            />
          );
        })}
      </div>

      {/* grila, cu „Explică AI” apăsat */}
      <div
        className="flex items-center justify-between gap-2 px-3.5"
        style={{
          ...layer, ...sceneCard(theme, 1), left: 'calc(50% - 40px)', top: 12, width: 248, height: 36,
          transform: `translate3d(0, ${(1 - quiz) * 14}px, ${-30 + quiz * 20}px)`, opacity: quiz,
        }}
      >
        <span className="truncate text-[11.5px] font-semibold" style={{ color: theme.text }}>Grila ta, după răspuns</span>
        <span className={chipClass} style={{ background: theme.accent, color: '#fff', fontSize: 10.5, padding: '3px 9px', transform: `scale(${1 - press * 0.08})` }}>
          <Sparkles size={10} /> Explică AI
        </span>
      </div>

      {/* explicația, cu citarea [1] și sursa */}
      <div
        className="px-3.5 py-2.5"
        style={{
          ...layer, ...sceneCard(theme, 3), left: 'calc(50% - 40px)', top: 56, width: 248,
          transform: `translate3d(${(1 - explanation) * 24}px, ${(1 - explanation) * 16}px, ${-50 + explanation * 90}px) rotateX(${(1 - explanation) * 8}deg)`, opacity: explanation,
        }}
      >
        <div className={`flex items-center gap-1.5 ${eyebrow}`} style={{ color: theme.text3 }}><Sparkles size={11} style={{ color: theme.accentText }} /> Explicație cu sursă</div>
        <div className="mt-2" style={skeleton(theme, 94 * explanation)} />
        <div className="mt-1.5 flex items-center gap-1.5">
          <div style={skeleton(theme, 70 * explanation)} />
          <span className="inline-grid h-4 min-w-[16px] place-items-center rounded-full text-[9.5px] font-bold" style={{ color: theme.accentText, background: `color-mix(in srgb, ${theme.accent} 16%, transparent)`, opacity: sources }}>1</span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5" style={{ opacity: sources, transform: `translateY(${(1 - sources) * 8}px)` }}>
          <span className={chipClass} style={{ ...sceneChip(theme), fontSize: 10 }}>
            <span className="inline-grid h-3.5 min-w-[14px] place-items-center rounded-full text-[9px]" style={{ background: `color-mix(in srgb, ${theme.accent} 16%, transparent)` }}>1</span>
            Carte · Kumar · p. 142
          </span>
          <span className={chipClass} style={{ background: theme.accent, color: '#fff', fontSize: 10, transform: `scale(${1 - open * 0.08})` }}>
            <BookOpen size={10} /> Deschide în carte
          </span>
        </div>
      </div>

      {/* salvată pe grilă */}
      <div className="flex items-center gap-2" style={{ ...layer, left: '50%', bottom: 10, transform: `translate3d(-50%, ${(1 - saved) * 10}px, ${saved * 50}px)`, opacity: saved }}>
        <span className={chipClass} style={{ ...sceneChip(theme), fontSize: 10.5 }}><Check size={11} strokeWidth={3} /> Salvată pe grilă</span>
        <span className={chipClass} style={{ ...sceneChip(theme), color: theme.text2, fontSize: 10.5, opacity: again, transform: `translateY(${(1 - again) * 6}px)` }}>
          A doua oară: fără cerere nouă
        </span>
      </div>
    </>
  );
}

/** Cu două chei, grila scrisă de un furnizor e verificată de altul (inclusiv variantele greșite); în chat, cifrele din afara pasajului sunt semnalate. */
export function SecondJudgeScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const author = easeOut(fr(t, 0, 900));
  const judge = easeOut(fr(t, 900, 900));
  const rows = [easeOut(fr(t, 1700, 500)), easeOut(fr(t, 2200, 500)), easeOut(fr(t, 2700, 500))];
  const reject = easeOut(fr(t, 3300, 700));
  const chat = easeInOut(fr(t, 5400, 1000));
  const badge = easeOut(fr(t, 6900, 700));
  const figure = easeOut(fr(t, 6200, 600));

  return (
    <>
      <div
        className="flex items-center gap-2 px-3"
        style={{
          ...layer, ...sceneCard(theme, 1), left: 'calc(50% - 208px)', top: 12, width: 196, height: 38,
          transform: `translate3d(${(1 - author) * -20}px, 0, ${-50 + author * 30}px) rotateY(${10 - author * 5}deg)`, opacity: author,
        }}
      >
        <Plate theme={theme} hue={theme.accent} size={24}><Target size={13} /></Plate>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: theme.text3 }}>Grila e scrisă de</div>
          <div className="text-[11.5px] font-semibold" style={{ color: theme.text }}>Groq</div>
        </div>
      </div>
      <div
        className="px-3.5 py-2.5"
        style={{
          ...layer, ...sceneCard(theme, 3), left: 'calc(50% - 208px)', top: 58, width: 196,
          transform: `translate3d(${(1 - judge) * -16}px, ${(1 - judge) * 14}px, ${-60 + judge * 100}px) rotateY(${10 - judge * 6}deg)`, opacity: judge,
        }}
      >
        <div className={`flex items-center gap-1.5 ${eyebrow}`} style={{ color: theme.text3 }}><ShieldCheck size={11} style={{ color: theme.accentText }} /> Verificată de</div>
        <div className="mt-0.5 text-[12.5px] font-semibold" style={{ color: theme.text }}>Mistral</div>
        <div className="mt-1.5 space-y-1">
          {['Enunțul', 'Răspunsul corect', 'Variantele greșite'].map((label, i) => (
            <div key={label} className="flex items-center gap-1.5 text-[10.5px]" style={{ color: theme.text2, opacity: rows[i], transform: `translateX(${(1 - rows[i]) * -8}px)` }}>
              <Check size={11} strokeWidth={3} style={{ color: theme.success }} /> {label}
            </div>
          ))}
        </div>
        <div
          className="mt-1.5 flex items-start gap-1.5 rounded-[var(--r-sm)] px-2 py-1 text-[10px] leading-snug"
          style={{ background: `color-mix(in srgb, ${theme.warning} 14%, transparent)`, color: theme.warning, opacity: reject, transform: `translateY(${(1 - reject) * 6}px)` }}
        >
          <AlertTriangle size={11} className="mt-px flex-none" /> Variantă la fel de corectă: grila se respinge
        </div>
      </div>

      {/* chatul: cifra care nu apare în pasaj */}
      <div
        className="px-3.5 py-3"
        style={{
          ...layer, ...sceneCard(theme, 2), left: 'calc(50% + 4px)', top: 20, width: 204,
          transform: `translate3d(${(1 - chat) * 30}px, ${(1 - chat) * -10}px, ${-60 + chat * 100}px) rotateY(${-16 + chat * 8}deg)`, opacity: chat,
        }}
      >
        <div className={eyebrow} style={{ color: theme.text3 }}>Răspuns în chat</div>
        <div className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: theme.text }}>
          Tratamentul durează{' '}
          <span className="rounded px-1 font-bold" style={{ background: `color-mix(in srgb, ${theme.warning} ${Math.round(figure * 22)}%, transparent)`, color: figure > 0.5 ? theme.warning : theme.text }}>14 zile</span>
          <span className="mx-0.5 inline-grid h-4 min-w-[16px] place-items-center rounded-full align-middle text-[9.5px] font-bold" style={{ color: theme.accentText, background: `color-mix(in srgb, ${theme.accent} 16%, transparent)` }}>1</span>
        </div>
        <div className="mt-2.5" style={skeleton(theme, 90)} />
        <div className="mt-1.5" style={skeleton(theme, 64)} />
        <div className="mt-1 text-[9.5px]" style={{ color: theme.text3 }}>Pasajul citat: p. 222</div>
      </div>
      <div
        style={{ ...layer, left: 'calc(50% + 4px)', top: 152, width: 204, opacity: badge, transform: `translate3d(0, ${(1 - badge) * 10}px, ${20 + badge * 50}px)` }}
      >
        <span className={chipClass} style={{ ...sceneChip(theme), color: theme.warning, fontSize: 10, whiteSpace: 'normal', alignItems: 'flex-start', lineHeight: 1.3 }}>
          <AlertTriangle size={11} className="mt-px flex-none" /> Parțial susținut: o cifră de verificat în carte
        </span>
      </div>
    </>
  );
}

const LAY_EXAMPLES = [
  { lay: 'tuse cu sânge', medical: 'hemoptizie' },
  { lay: 'scaun negru', medical: 'melenă' },
];

/** O expresie de zi cu zi duce la termenul din carte, iar fragmentele găsite vin cu pagina; încă două exemple. */
export function EverydaySearchScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const bar = easeOut(fr(t, 0, 700));
  const text = 'lipsă de aer';
  const typed = text.slice(0, Math.floor(fr(t, 300, 1300) * text.length));
  const term = easeOut(fr(t, 2700, 900));
  const hits = [easeOut(fr(t, 3500, 700)), easeOut(fr(t, 3900, 700)), easeOut(fr(t, 4300, 700))];
  const more = [easeOut(fr(t, 5500, 700)), easeOut(fr(t, 6000, 700))];

  return (
    <>
      <div
        className="flex items-center gap-2.5 px-3.5"
        style={{
          ...layer, ...sceneCard(theme, 2), left: 'calc(50% - 190px)', top: 16, width: 380, height: 40,
          transform: `translate3d(0, ${(1 - bar) * 12}px, ${-10 + bar * 40}px)`, opacity: bar,
        }}
      >
        <Search size={14} style={{ color: theme.accentText }} />
        <span className="flex-1 text-[12.5px] font-medium" style={{ color: theme.text }}>{typed || ' '}</span>
      </div>

      <div
        className="px-4 py-3"
        style={{
          ...layer, ...sceneCard(theme, 3), left: 'calc(50% - 208px)', top: 70, width: 188,
          transform: `translate3d(${(1 - term) * -24}px, ${(1 - term) * 10}px, ${-50 + term * 100}px) rotateY(${12 - term * 8}deg)`, opacity: term,
        }}
      >
        <div className={eyebrow} style={{ color: theme.text3 }}>Termenul din carte</div>
        <div className="mt-1 text-[18px] font-extrabold tracking-tight" style={{ color: theme.accentText }}>dispnee</div>
        <div className="mt-0.5 text-[10px]" style={{ color: theme.text3 }}>„lipsă de aer” înseamnă dispnee</div>
      </div>

      {hits.map((k, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-3"
          style={{
            ...layer, ...sceneCard(theme, i === 0 ? 3 : 2), left: 'calc(50% + 4px)', top: 70 + i * 30, width: 204, height: 34,
            transform: `translate3d(${(1 - k) * 24}px, 0, ${-40 + k * 40 - i * 14}px) rotateY(${-10 + k * 4}deg)`, opacity: k * (1 - i * 0.14),
          }}
        >
          <BookOpen size={12} style={{ color: theme.accentText }} />
          <div className="min-w-0 flex-1">
            <div style={skeleton(theme, 86 - i * 12)} />
            <div className="mt-1" style={skeleton(theme, 56)} />
          </div>
          <span className="text-[9.5px] tabular-nums" style={{ color: theme.text3 }}>p. {142 + i * 6}</span>
        </div>
      ))}

      <div className="flex items-center gap-2" style={{ ...layer, left: 'calc(50% - 208px)', top: 184, width: 416 }}>
        {LAY_EXAMPLES.map(({ lay, medical }, i) => (
          <span
            key={lay}
            className={chipClass}
            style={{ ...sceneChip(theme), flex: 1, justifyContent: 'center', fontSize: 10.5, opacity: more[i], transform: `translate3d(0, ${(1 - more[i]) * 12}px, ${more[i] * 30}px)` }}
          >
            <span style={{ color: theme.text2 }}>„{lay}”</span>
            <span style={{ color: theme.text3 }}>›</span>
            <b>{medical}</b>
          </span>
        ))}
      </div>
    </>
  );
}

const STATS = [
  { label: 'Grile', value: '48', Icon: BookOpen, hue: 'accent' },
  { label: 'Serie', value: '6 zile', Icon: Flame, hue: 'warning' },
  { label: 'Acuratețe', value: '82%', Icon: Target, hue: 'success' },
  { label: 'Timp', value: '12 h', Icon: Clock, hue: 'accent2' },
] as const;

const PAGES = [
  { label: 'Statistici', value: '82%', Icon: BarChart3, hue: 'accent' },
  { label: 'Realizări', value: 'Nivel 7', Icon: Trophy, hue: 'warning' },
  { label: 'Sesiune zilnică', value: '15 min', Icon: Brain, hue: 'success' },
] as const;

/** Cifrele de pe plăcuțe colorate, mai întâi în Panou, apoi în celelalte pagini; Notițele numără schemele separat. */
export function PolishScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const strip = easeOut(fr(t, 0, 900));
  const notes = easeOut(fr(t, 5600, 900));
  const schema = easeOut(fr(t, 6900, 700));

  return (
    <>
      <div
        className="grid grid-cols-4"
        style={{
          ...layer, ...sceneCard(theme, 2), left: 'calc(50% - 200px)', top: 16, width: 400, height: 64,
          transform: `translate3d(0, ${(1 - strip) * 14}px, ${-40 + strip * 20}px) rotateX(${(1 - strip) * 10}deg)`, opacity: strip,
        }}
      >
        {STATS.map(({ label, value, Icon, hue }, i) => {
          const k = easeOut(fr(t, 300 + i * 220, 800));
          return (
            <div key={label} className="flex items-center gap-1.5 px-2.5" style={{ opacity: k, transform: `translateY(${(1 - k) * 8}px)` }}>
              <Plate theme={theme} hue={theme[hue]} size={26}><Icon size={14} strokeWidth={2.2} /></Plate>
              <div className="min-w-0">
                <div className="truncate text-[8px] font-black uppercase tracking-wide" style={{ color: theme.text3 }}>{label}</div>
                <div className="truncate text-[13px] font-black tabular-nums" style={{ color: theme.text }}>{value}</div>
              </div>
            </div>
          );
        })}
      </div>

      {PAGES.map(({ label, value, Icon, hue }, i) => {
        const k = easeOut(fr(t, 2800 + i * 280, 900));
        return (
          <div
            key={label}
            className="flex items-center gap-2 px-3"
            style={{
              ...layer, ...sceneCard(theme, 3), left: `calc(50% - 200px + ${i * 136}px)`, top: 94, width: 128, height: 56,
              transform: `translate3d(0, ${(1 - k) * 20}px, ${-60 + k * 80 + (1 - i) * 0}px) rotateY(${(i - 1) * -8 * (1 - k * 0.4)}deg)`, opacity: k,
            }}
          >
            <Plate theme={theme} hue={theme[hue]} size={28}><Icon size={14} strokeWidth={2.2} /></Plate>
            <div className="min-w-0">
              <div className="truncate text-[9.5px] font-semibold" style={{ color: theme.text3 }}>{label}</div>
              <div className="truncate text-[13px] font-black tabular-nums" style={{ color: theme.text }}>{value}</div>
            </div>
          </div>
        );
      })}

      <div
        className="flex items-center gap-2.5 px-3.5"
        style={{
          ...layer, ...sceneCard(theme, 3), left: 'calc(50% - 200px)', top: 166, width: 400, height: 50,
          transform: `translate3d(0, ${(1 - notes) * 16}px, ${-30 + notes * 70}px) rotateX(${(1 - notes) * 8}deg)`, opacity: notes,
        }}
      >
        <Plate theme={theme} hue={theme.accent2} size={28}><StickyNote size={14} strokeWidth={2.2} /></Plate>
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-semibold" style={{ color: theme.text }}>Notițele mele</div>
          <div className="truncate text-[10.5px]" style={{ color: theme.text3 }}>3 notițe din 2 grile · 1 schemă</div>
        </div>
        <span className={chipClass} style={{ ...sceneChip(theme), fontSize: 10, opacity: schema, transform: `translateY(${(1 - schema) * 6}px)` }}>Schemele, numărate separat</span>
      </div>
    </>
  );
}
