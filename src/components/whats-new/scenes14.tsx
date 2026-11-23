import type { CSSProperties, ReactNode } from 'react';
import {
  Check, Compass, Cpu, Gauge, Layers, Moon, PanelLeft, Sparkles, Sun, Zap,
} from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { fraction as fr, useSceneTime } from '../film/useTimeline';
import { HeroPlates } from './scenes';
import { chipClass, easeInOut, easeOut, layer, sceneCard } from './stage3d';

/*
 * Scenele 3D din „Ce e nou” 1.4. Aceleași reguli ca la 1.1–1.3: tot ce se vede se calculează din ceasul filmului
 * (`useSceneTime`), scena e inertă, iar povestea e în `transcript`. Cifrele sunt doar pentru ilustrare.
 */

type Theme = ReturnType<typeof useTheme>;

const ORBIT_14 = [Zap, Sparkles, Cpu, PanelLeft];

/** 1.4 pe trei plăci de sticlă, cu cele patru noutăți pe orbită. */
export function Hero14Scene() {
  return <HeroPlates version="1.4" orbit={ORBIT_14} />;
}

function Plate({ theme, hue, size = 28, children }: { theme: Theme; hue: string; size?: number; children: ReactNode }) {
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

const bar = (theme: Theme, width: number | string): CSSProperties => ({
  height: 6,
  width: typeof width === 'number' ? `${width}%` : width,
  borderRadius: 999,
  background: theme.fillSubtle,
});

/** Scroll fluid: aura pe gradiente moi + carduri de grile care glisează cursiv fără re-randare React. */
export function FluidScrollScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const enter = easeOut(fr(t, 0, 900));
  const glide = easeInOut(fr(t, 2400, 2600));
  const badge = easeOut(fr(t, 3200, 700));
  const hover = easeOut(fr(t, 5800, 700));

  const cards = [
    { title: 'Cardiologie · Set 1', hue: theme.accent, y: 0 },
    { title: 'Pneumologie · Set 2', hue: theme.accent2, y: 66 },
    { title: 'Dermatologie · Set 3', hue: theme.success, y: 132 },
  ];

  return (
    <>
      {/* aura moale pe gradient radial, fără blur costisitor */}
      <div
        style={{
          ...layer,
          left: 'calc(50% - 170px)', top: 8, width: 340, height: 196, borderRadius: 'var(--r-xl)',
          background: `radial-gradient(circle at 30% 35%, color-mix(in srgb, ${theme.accent} 20%, transparent), transparent 65%), radial-gradient(circle at 75% 70%, color-mix(in srgb, ${theme.accent2} 18%, transparent), transparent 65%)`,
          opacity: enter,
          transform: 'translate3d(0, 0, -60px)',
        }}
      />

      {/* stiva de carduri care glisează cursiv */}
      {cards.map((item, i) => {
        const active = i === 1 && hover > 0.2;
        return (
          <div
            key={item.title}
            className="flex items-center gap-3 px-3.5 py-2.5"
            style={{
              ...layer, ...sceneCard(theme, active ? 3 : 2),
              left: 'calc(50% - 196px)', top: 20 + item.y - glide * 24, width: 224,
              opacity: enter,
              transform: `translate3d(0, ${(1 - enter) * 14}px, ${active ? 44 : 10}px) rotateY(${8 - glide * 4}deg)`,
              outline: active ? `2px solid color-mix(in srgb, ${item.hue} 45%, transparent)` : undefined,
            }}
          >
            <Plate theme={theme} hue={item.hue} size={28}><Zap size={13} /></Plate>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] font-semibold" style={{ color: theme.text }}>{item.title}</div>
              <div className="mt-1.5" style={bar(theme, 68)} />
            </div>
          </div>
        );
      })}

      {/* cardul de fluiditate în dreapta */}
      <div
        className="px-3.5 py-3"
        style={{
          ...layer, ...sceneCard(theme, 3),
          left: 'calc(50% + 44px)', top: 44, width: 156,
          opacity: badge,
          transform: `translate3d(${(1 - badge) * 20}px, 0, ${30 + badge * 30}px) rotateY(-8deg)`,
        }}
      >
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.success }}>
          <Gauge size={12} /> Derulare lină
        </div>
        <div className="mt-2 space-y-1.5">
          <div className={chipClass} style={{ background: `color-mix(in srgb, ${theme.accent} 14%, transparent)`, color: theme.accentText, fontSize: 10.5 }}>
            Panou · 4× mai fluid
          </div>
          <div className={chipClass} style={{ background: `color-mix(in srgb, ${theme.success} 14%, transparent)`, color: theme.success, fontSize: 10.5 }}>
            Grile · 0 cadre lungi
          </div>
        </div>
        <div className="mt-2 text-[10px] leading-snug" style={{ color: theme.text3, opacity: hover }}>
          Hover în CSS, fără re-randare
        </div>
      </div>
    </>
  );
}

/** Animații deblocate: profilul revine din modul economic moștenit pe Auto · Complet, cu răspuns instant. */
export function MotionUnlockScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const enter = easeOut(fr(t, 0, 900));
  const unlock = easeInOut(fr(t, 2400, 900));
  const unlocked = unlock > 0.5;
  const boot = easeOut(fr(t, 5400, 800));

  return (
    <>
      <div
        className="px-4 py-3.5"
        style={{
          ...layer, ...sceneCard(theme, 3),
          left: 'calc(50% - 196px)', top: 24, width: 256,
          opacity: enter,
          transform: `translate3d(0, ${(1 - enter) * 14}px, ${20 + unlock * 30}px) rotateY(${6 - unlock * 6}deg)`,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: theme.text }}>
            <Plate theme={theme} hue={unlocked ? theme.accent : theme.warning} size={26}><Sparkles size={13} /></Plate>
            Performanță
          </span>
          <span
            className={chipClass}
            style={{
              background: `color-mix(in srgb, ${unlocked ? theme.success : theme.warning} 16%, transparent)`,
              color: unlocked ? theme.success : theme.warning,
              fontSize: 10, padding: '2px 8px',
            }}
          >
            {unlocked ? <Check size={10} strokeWidth={3} /> : null}
            {unlocked ? 'Complet' : 'Economic vechi'}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-[var(--r-sm)] p-1" style={{ background: theme.fillSubtle }}>
          {['Auto', 'Economic', 'Complet'].map((label, i) => {
            const active = unlocked ? i === 0 : i === 1;
            return (
              <span
                key={label}
                className="rounded-[var(--r-sm)] py-1 text-center text-[10.5px] font-semibold"
                style={{
                  background: active ? theme.surface : 'transparent',
                  color: active ? theme.text : theme.text3,
                  boxShadow: active ? 'var(--elev-1)' : undefined,
                }}
              >
                {label}
              </span>
            );
          })}
        </div>

        <div className="mt-2.5 text-[10.5px] leading-snug" style={{ color: theme.text3 }}>
          {unlocked ? 'Sticlă, aură și tranziții active instant' : 'Blocat dintr-o versiune anterioară'}
        </div>
      </div>

      {/* cardul de pornire confirmată rapid */}
      <div
        className="px-3.5 py-3"
        style={{
          ...layer, ...sceneCard(theme, 2),
          left: 'calc(50% + 74px)', top: 68, width: 130,
          opacity: boot,
          transform: `translate3d(${(1 - boot) * 18}px, 0, ${20 + boot * 30}px) rotateY(-8deg)`,
        }}
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.accentText }}>Pornire sigură</div>
        <div className="mt-1.5 text-[18px] font-black tabular-nums" style={{ color: theme.text }}>0.5 s</div>
        <div className="mt-1 text-[10px] leading-snug" style={{ color: theme.text3 }}>
          Fără blocări la închidere rapidă
        </div>
      </div>
    </>
  );
}

/** Consum redus în repaus: straturi Pip pe compozitor, sticlă ușoară pe Luminos și pauză la minimizare. */
export function IdlePowerScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const enter = easeOut(fr(t, 0, 900));
  const split = easeInOut(fr(t, 1200, 1400));
  const light = easeOut(fr(t, 3000, 800));
  const pause = easeOut(fr(t, 5600, 800));

  return (
    <>
      {/* 3 straturi reprezentând mascota Pip pe compozitor */}
      {[
        { label: 'Corp', z: 0, dx: -16, hue: theme.accent },
        { label: 'Ochi', z: 26, dx: 0, hue: theme.accent2 },
        { label: 'Antenă', z: 52, dx: 16, hue: theme.success },
      ].map((item, idx) => (
        <div
          key={item.label}
          className="flex items-center gap-2 px-3 py-2"
          style={{
            ...layer, ...sceneCard(theme, 2),
            left: `calc(50% - 188px + ${split * item.dx}px)`,
            top: 32 + idx * 42,
            width: 152,
            opacity: enter,
            transform: `translate3d(0, ${(1 - enter) * 12}px, ${split * item.z}px) rotateY(${10 * split}deg)`,
          }}
        >
          <Plate theme={theme} hue={item.hue} size={22}><Layers size={11} /></Plate>
          <span className="text-[11px] font-semibold" style={{ color: theme.text }}>Strat · {item.label}</span>
        </div>
      ))}

      {/* sticlă ușoară în tema Luminos */}
      <div
        className="px-3.5 py-2.5"
        style={{
          ...layer, ...sceneCard(theme, 2),
          left: 'calc(50% + 12px)', top: 26, width: 184,
          opacity: light,
          transform: `translate3d(${(1 - light) * 20}px, 0, ${20 + light * 20}px) rotateY(-8deg)`,
        }}
      >
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.accentText }}>
          <Sun size={11} /> Tema Luminos
        </div>
        <div className="mt-1 text-[11px] font-semibold" style={{ color: theme.text }}>Sticlă ușoară pe carduri</div>
        <div className="mt-1 text-[10px]" style={{ color: theme.text3 }}>−38% GPU în repaus pe Grile</div>
      </div>

      {/* pauză automată la minimizare */}
      <div
        className="px-3.5 py-2.5"
        style={{
          ...layer, ...sceneCard(theme, 3),
          left: 'calc(50% + 12px)', top: 118, width: 184,
          opacity: pause,
          transform: `translate3d(0, ${(1 - pause) * 14}px, ${30 + pause * 24}px) rotateY(-6deg)`,
        }}
      >
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.success }}>
          <Cpu size={11} /> În repaus
        </div>
        <div className="mt-1 text-[11px] font-semibold" style={{ color: theme.text }}>Ceasurile intră în pauză</div>
        <div className="mt-1 text-[10px]" style={{ color: theme.text3 }}>Când fereastra e minimizată</div>
      </div>
    </>
  );
}

/** Finisaje de navigare: Sidebar îngust <-> lat, comutator Luminos/Întunecat/Automat și tururi care se închid la plecare. */
export function NavPolishScene() {
  const theme = useTheme();
  const { elapsedMs: t } = useSceneTime();
  const enter = easeOut(fr(t, 0, 900));
  const expand = easeInOut(fr(t, 1200, 1400));
  const switcher = easeOut(fr(t, 2900, 800));
  const dismiss = easeOut(fr(t, 5600, 800));

  return (
    <>
      {/* sidebar îngust -> extins */}
      <div
        className="p-2.5"
        style={{
          ...layer, ...sceneCard(theme, 2),
          left: 'calc(50% - 196px)', top: 22,
          width: 62 + expand * 86, height: 170,
          opacity: enter,
          transform: `translate3d(0, ${(1 - enter) * 12}px, 24px) rotateY(8deg)`,
        }}
      >
        {['Panou', 'Grile', 'Setări'].map((name, i) => (
          <div
            key={name}
            className="mb-1.5 flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-2"
            style={{
              background: i === 0 ? `color-mix(in srgb, ${theme.accent} 14%, transparent)` : 'transparent',
              color: i === 0 ? theme.accentText : theme.text2,
            }}
          >
            <Compass size={13} className="shrink-0" />
            {expand > 0.35 && <span className="truncate text-[11px] font-semibold" style={{ opacity: expand }}>{name}</span>}
          </div>
        ))}
      </div>

      {/* ThemeModeSwitcher pe 3 coloane egale */}
      <div
        className="px-3 py-2.5"
        style={{
          ...layer, ...sceneCard(theme, 3),
          left: 'calc(50% - 32px)', top: 28, width: 228,
          opacity: switcher,
          transform: `translate3d(${(1 - switcher) * 18}px, 0, ${30 + switcher * 20}px) rotateY(-6deg)`,
        }}
      >
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.text3 }}>Aspect</div>
        <div className="grid grid-cols-3 gap-1 rounded-[var(--r-sm)] p-1" style={{ background: theme.fillSubtle, border: `1px solid ${theme.hairline}` }}>
          {[
            { label: 'Luminos', Icon: Sun },
            { label: 'Întunecat', Icon: Moon },
            { label: 'Automat', Icon: PanelLeft },
          ].map(({ label, Icon }, i) => (
            <span
              key={label}
              className="flex items-center justify-center gap-1 rounded-[var(--r-sm)] py-1 text-[9.5px] font-semibold"
              style={{
                background: i === 1 ? theme.surface : 'transparent',
                color: i === 1 ? theme.text : theme.text3,
                boxShadow: i === 1 ? 'var(--elev-1)' : undefined,
              }}
            >
              <Icon size={10} /> {label}
            </span>
          ))}
        </div>
      </div>

      {/* tur local închis la schimbarea rutei */}
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5"
        style={{
          ...layer, ...sceneCard(theme, 2),
          left: 'calc(50% - 32px)', top: 122, width: 228,
          opacity: dismiss,
          transform: `translate3d(0, ${(1 - dismiss) * 14}px, ${24 + dismiss * 20}px)`,
        }}
      >
        <Plate theme={theme} hue={theme.success} size={26}><Check size={13} strokeWidth={3} /></Plate>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold" style={{ color: theme.text }}>Tururile locale se închid singure</div>
          <div className="text-[10px]" style={{ color: theme.text3 }}>Când schimbi pagina din meniu</div>
        </div>
      </div>
    </>
  );
}
