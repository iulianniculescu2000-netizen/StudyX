import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  BookOpen,
  Brain,
  CalendarDays,
  Bot,
  Cpu,
  CreditCard,
  FolderPlus,
  GraduationCap,
  HelpCircle,
  Layers,
  Lightbulb,
  ListChecks,
  Network,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Timer,
  X,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../theme/ThemeContext';
import { useTutorialStore } from '../store/tutorialStore';
import { RELEASE_DISPLAY_NAME, type TourId } from '../tutorial/tourMeta';
import { useUserStore } from '../store/userStore';
import { useOverlayFlag } from '../hooks/useOverlayFlag';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';

/** Force-open event (Settings → "Vezi noutățile" or dev preview). */
export const WHATS_NEW_OPEN_EVENT = 'studyx:whats-new:open';

type Theme = ReturnType<typeof useTheme>;

// ─────────────────────────────────────────────────────────────────────────────
// Mini live demos — each slide gets a looping, self-playing animation.
// ─────────────────────────────────────────────────────────────────────────────

function DemoFrame({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <div
      className="relative mx-auto flex h-[210px] w-full max-w-[420px] items-center justify-center overflow-hidden rounded-[var(--r-xl)] border"
      style={{
        background: theme.isDark
          ? 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))'
          : 'linear-gradient(160deg, rgba(255,255,255,0.9), rgba(244,246,255,0.7))',
        borderColor: theme.border,
        boxShadow: 'inset 0 1px 0 var(--glass-highlight), var(--elev-1)',
      }}
    >
      {children}
    </div>
  );
}

/**
 * The icons used to "orbit" by animating x/y between three keyframes with an
 * easeInOut curve — which means they slowed to a stop and reversed twice per
 * cycle. That reads as stutter, not motion. A continuous rotation of the whole
 * ring (linear, one transform per element) is both genuinely smooth and cheaper
 * for the compositor; each icon counter-rotates so it stays upright.
 */
function HeroDemo({ theme }: { theme: Theme }) {
  const { calmMotion } = useAdaptiveMotion();
  const icons = [Timer, BookMarked, CalendarDays, Stethoscope, Layers, GraduationCap];
  const radiusX = 92;
  const radiusY = 58;

  return (
    <DemoFrame theme={theme}>
      <div className="relative flex h-full w-full items-center justify-center">
        {/* Glow pulses on opacity only; scaling a large box-shadow re-rasters it every frame. */}
        <motion.div
          animate={calmMotion ? { opacity: 0.55 } : { opacity: [0.35, 0.75, 0.35] }}
          transition={calmMotion ? { duration: 0 } : { repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          className="absolute h-[120px] w-[120px] rounded-full"
          style={{ background: theme.accent, filter: 'blur(38px)', willChange: 'opacity' }}
        />
        <div
          className="z-10 flex h-[84px] w-[84px] items-center justify-center rounded-[var(--r-xl)] text-white"
          style={{ background: theme.accent }}
        >
          <Sparkles size={38} />
        </div>

        <motion.div
          className="absolute inset-0"
          animate={calmMotion ? { rotate: 0 } : { rotate: 360 }}
          transition={calmMotion ? { duration: 0 } : { repeat: Infinity, duration: 26, ease: 'linear' }}
          style={{ willChange: 'transform' }}
        >
          {icons.map((Icon, i) => {
            const angle = (i / icons.length) * Math.PI * 2;
            return (
              <motion.div
                key={i}
                className="absolute left-1/2 top-1/2 flex h-10 w-10 items-center justify-center rounded-[var(--r-md)] border"
                style={{
                  marginLeft: -20,
                  marginTop: -20,
                  x: Math.cos(angle) * radiusX,
                  y: Math.sin(angle) * radiusY,
                  background: theme.surface2,
                  borderColor: theme.border,
                  color: theme.accentText,
                  willChange: 'transform',
                }}
                animate={calmMotion ? { rotate: 0 } : { rotate: -360 }}
                transition={calmMotion ? { duration: 0 } : { repeat: Infinity, duration: 26, ease: 'linear' }}
              >
                <Icon size={17} />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </DemoFrame>
  );
}

/** A mock exam: the clock runs down while the answers fill in, then the result by discipline appears. */
function SimulationDemo({ theme }: { theme: Theme }) {
  const { calmMotion } = useAdaptiveMotion();
  const RUN = 22;
  const SHOW = 12;
  const [tickRaw, setTick] = useState(0);
  useEffect(() => {
    if (calmMotion) return undefined;
    const id = window.setInterval(() => setTick((n) => (n + 1) % (RUN + SHOW)), 150);
    return () => window.clearInterval(id);
  }, [calmMotion]);
  const tick = calmMotion ? 10 : tickRaw;
  const finished = tick >= RUN;
  const progress = Math.min(tick, RUN) / RUN;
  const minutes = Math.round(120 * (1 - progress));
  const results = [
    { name: 'Cardiologie', value: 84 },
    { name: 'Neurologie', value: 71 },
    { name: 'Pediatrie', value: 58 },
  ];

  return (
    <DemoFrame theme={theme}>
      <div className="w-full max-w-[320px] space-y-3 px-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[13px] font-bold tabular-nums" style={{ color: theme.text }}>
            <Timer size={15} style={{ color: finished ? theme.success : theme.accent }} aria-hidden="true" />
            {finished ? 'Simulare încheiată' : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`}
          </span>
          <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider" style={{ background: `${theme.warning}1c`, color: theme.warning }}>
            −0,25 / greșeală
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--fill-subtle)' }}>
          <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: finished ? theme.success : theme.accent, transition: 'width 150ms linear' }} />
        </div>
        <div className="h-[92px]">
          {finished ? (
            <motion.div initial={calmMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
              {results.map((row) => (
                <div key={row.name} className="flex items-center gap-2.5">
                  <span className="w-[78px] text-[10.5px] font-bold" style={{ color: theme.text2 }}>{row.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--fill-subtle)' }}>
                    <div className="h-full rounded-full" style={{ width: `${row.value}%`, background: theme.accent }} />
                  </div>
                  <span className="w-8 text-right text-[10.5px] font-bold tabular-nums" style={{ color: theme.text }}>{row.value}%</span>
                </div>
              ))}
            </motion.div>
          ) : (
            <div className="grid grid-cols-10 gap-1.5 pt-1">
              {Array.from({ length: 30 }, (_, i) => (
                <span
                  key={i}
                  className="h-4 rounded"
                  style={{ background: i < Math.round(progress * 30) ? `${theme.accent}55` : 'var(--fill-subtle)', transition: 'background 150ms linear' }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </DemoFrame>
  );
}

type LitRow = { Icon: typeof Zap; label: string };

/** A short list whose lines are lit one after the other (all lit, and still, with calm motion). */
function LitRowsDemo({ theme, rows }: { theme: Theme; rows: LitRow[] }) {
  const { calmMotion } = useAdaptiveMotion();
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (calmMotion) return undefined;
    const id = window.setInterval(() => setPhase((p) => (p + 1) % rows.length), 1500);
    return () => window.clearInterval(id);
  }, [rows.length, calmMotion]);

  return (
    <DemoFrame theme={theme}>
      <div className="w-full max-w-[340px] space-y-1.5 px-2">
        {rows.map((row, i) => {
          const active = calmMotion || i === phase;
          return (
            <motion.div
              key={row.label}
              animate={{ opacity: active ? 1 : 0.5, scale: active && !calmMotion ? 1.02 : 1 }}
              className="flex items-center gap-2.5 rounded-[var(--r-sm)] border px-3 py-2"
              style={{
                background: active ? `${theme.accent}12` : theme.surface2,
                borderColor: active ? `${theme.accent}35` : theme.border,
              }}
            >
              <row.Icon size={14} style={{ color: active ? theme.accentText : theme.text3 }} aria-hidden="true" />
              <span className="text-[11px] font-bold" style={{ color: active ? theme.text : theme.text2 }}>{row.label}</span>
            </motion.div>
          );
        })}
      </div>
    </DemoFrame>
  );
}

type Slide = {
  id: string;
  badge: string;
  title: string;
  description: string;
  Demo: (props: { theme: Theme }) => ReactElement;
  tip?: string;
  /** "Arată-mi": closes the slides, opens the page and, when there is one, starts its short tour. */
  cta?: { label: string; to: string; tour?: TourId };
};

const studyRows: LitRow[] = [
  { Icon: BookOpen, label: 'Grile: Studiu, Simulare Examen, Cronometrat' },
  { Icon: CreditCard, label: 'Flashcarduri cu repetare spațiată' },
  { Icon: Brain, label: 'Sesiune zilnică cu ce e scadent azi' },
  { Icon: ListChecks, label: 'Caiet de erori, ca să fixezi ce ai greșit' },
  { Icon: ShieldCheck, label: 'Statistici, realizări și datele tale în siguranță' },
];
const aiRows: LitRow[] = [
  { Icon: Bot, label: 'Chat și agent, cu pașii la vedere' },
  { Icon: BookMarked, label: 'Citări cu pagină și „Deschide în carte”' },
  { Icon: Network, label: 'Scheme pe care le explorezi în chat' },
  { Icon: Cpu, label: 'Mai mulți furnizori gratuiți, cu rezervă automată' },
  { Icon: Sparkles, label: 'Verifică un răspuns cu alt model' },
];
const residencyRows: LitRow[] = [
  { Icon: Stethoscope, label: 'Discipline și specialități, pe înțelesul tău' },
  { Icon: FolderPlus, label: 'Foldere proprii de grile și de carduri' },
  { Icon: CalendarDays, label: 'Organizare: patru treceri până la examen' },
  { Icon: Timer, label: 'Ritm zilnic și zilele rămase, la vedere' },
];
const helpRows: LitRow[] = [
  { Icon: HelpCircle, label: '„?” lângă titluri: un răspuns scurt sau un ghid' },
  { Icon: ListChecks, label: 'Ghiduri pe pagini, în Setări › Ajutor' },
  { Icon: Search, label: 'Ctrl+K caută în tot conținutul tău' },
  { Icon: Lightbulb, label: 'Tasta ? arată scurtăturile de tastatură' },
];
const StudyDemo = ({ theme }: { theme: Theme }) => <LitRowsDemo theme={theme} rows={studyRows} />;
const AIDemo = ({ theme }: { theme: Theme }) => <LitRowsDemo theme={theme} rows={aiRows} />;
const ResidencyDemo = ({ theme }: { theme: Theme }) => <LitRowsDemo theme={theme} rows={residencyRows} />;
const HelpDemo = ({ theme }: { theme: Theme }) => <LitRowsDemo theme={theme} rows={helpRows} />;

/**
 * The slides, in order. At most seven. For 1.0 they present the whole app; in later releases they tell what changed
 * (CURRENT_TOUR_VERSION makes everyone see them once).
 */
const SLIDES: Slide[] = [
  {
    id: 'hero',
    badge: `Versiunea ${RELEASE_DISPLAY_NAME}`,
    title: 'StudyX 1.0',
    description: 'Prima versiune completă: grile, flashcarduri, o bibliotecă AI și un plan pentru rezidențiat, într-o singură aplicație.',
    Demo: HeroDemo,
  },
  {
    id: 'study',
    badge: 'Studiu',
    title: 'Grile și flashcarduri care te țin la zi',
    description: 'Moduri de lucru pentru fiecare moment, repetare spațiată pe flashcarduri și o sesiune zilnică ce strânge tot ce e scadent.',
    Demo: StudyDemo,
    cta: { label: 'Arată-mi Flashcardurile', to: '/flashcards', tour: 'flashcards' },
  },
  {
    id: 'ai',
    badge: 'Asistent AI',
    title: 'Un AI care lucrează din cărțile tale',
    description: 'Încarci cursurile în Biblioteca AI, ceri în română grile, carduri sau scheme, iar răspunsul arată din ce pagină vine.',
    Demo: AIDemo,
    cta: { label: 'Arată-mi Biblioteca AI', to: '/vault', tour: 'vault' },
  },
  {
    id: 'residency',
    badge: 'Rezidențiat',
    title: 'Pregătire pe discipline și specialități',
    description: 'Grile, cărți și carduri aranjate pe discipline, foldere proprii și un plan în patru treceri până la examen.',
    Demo: ResidencyDemo,
    cta: { label: 'Arată-mi Rezidențiat', to: '/rezidentiat', tour: 'residency' },
  },
  {
    id: 'exam',
    badge: 'Exersare',
    title: 'Simulare, caiet de erori și examen adaptiv',
    description: 'Un examen de probă cu ceas și penalizare, un caiet care strânge greșelile tale și un examen care se calibrează după istoricul tău.',
    Demo: SimulationDemo,
    cta: { label: 'Arată-mi Simularea', to: '/simulare', tour: 'simulation' },
  },
  {
    id: 'help',
    badge: 'Ajutor',
    title: 'Răspunsul e mereu la un „?” distanță',
    description: 'Butonul „?” de lângă titluri și controale deschide un răspuns scurt sau un ghid pas cu pas. Filmul de bun venit și toate ghidurile sunt în Setări.',
    Demo: HelpDemo,
    cta: { label: 'Arată-mi Setările', to: '/settings', tour: 'settings' },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function WhatsNewTour() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { calmMotion, t } = useAdaptiveMotion();
  const titleId = useId();
  const activeProfileId = useUserStore((state) => state.activeProfileId);
  const tutorialActive = useTutorialStore((state) => state.active);
  const hydrated = useTutorialStore((state) => state._hasHydrated);
  const seenTours = useTutorialStore((state) => state.seen);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  useOverlayFlag(open);
  useScrollLock(open);
  const [direction, setDirection] = useState(1);
  // Set while the slides are paused for a page tour (see showMe).
  const resumeRef = useRef<{ index: number; tour: TourId } | null>(null);

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;
  const isFirst = index === 0;

  // Opens once per version, for people who already finished the onboarding (a new user is not told what
  // is new in an app they have just met) and only while no tour is running.
  useEffect(() => {
    if (!hydrated || !activeProfileId || tutorialActive || resumeRef.current) return;
    const store = useTutorialStore.getState();
    if (!store.hasSeen(activeProfileId, 'onboarding') || store.hasSeen(activeProfileId, 'whatsNew')) return;
    const timer = window.setTimeout(() => setOpen(true), 1400);
    return () => window.clearTimeout(timer);
  }, [activeProfileId, hydrated, seenTours, tutorialActive]);

  // Manual re-open (Settings / dev).
  useEffect(() => {
    const handler = () => { setIndex(0); setDirection(1); setOpen(true); };
    window.addEventListener(WHATS_NEW_OPEN_EVENT, handler);
    return () => window.removeEventListener(WHATS_NEW_OPEN_EVENT, handler);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    if (activeProfileId) useTutorialStore.getState().markSeen(activeProfileId, 'whatsNew');
  }, [activeProfileId]);

  // "Arată-mi": step out of the slides, open the page and run its short tour; when that tour ends (finished or
  // closed) the slides come back on the next slide, so the user can carry on to the end. The slides are only
  // marked seen when they are really closed, never while they are paused for a page tour.
  const showMe = useCallback((cta: NonNullable<Slide['cta']>) => {
    if (!cta.tour) {
      close();
      navigate(cta.to);
      return;
    }
    const tour = cta.tour as TourId;
    resumeRef.current = { index: Math.min(index + 1, SLIDES.length - 1), tour };
    setOpen(false);
    navigate(cta.to);
    window.setTimeout(() => useTutorialStore.getState().startTour(tour), 400);
    // If the page tour never starts (another tour got in first), do not strand the user outside the slides.
    window.setTimeout(() => {
      const pending = resumeRef.current;
      if (pending && pending.tour === tour && useTutorialStore.getState().activeTour !== tour) {
        resumeRef.current = null;
        setIndex(pending.index);
        setDirection(1);
        setOpen(true);
      }
    }, 3000);
  }, [close, index, navigate]);

  useEffect(() => {
    return useTutorialStore.subscribe((state, previous) => {
      const pending = resumeRef.current;
      if (!pending || previous.activeTour !== pending.tour || state.activeTour !== null) return;
      resumeRef.current = null;
      window.setTimeout(() => {
        setIndex(pending.index);
        setDirection(1);
        setOpen(true);
      }, 350);
    });
  }, []);

  const go = useCallback((delta: number) => {
    setDirection(delta);
    setIndex((current) => Math.min(SLIDES.length - 1, Math.max(0, current + delta)));
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, go]);

  const slideVariants = useMemo(() => ({
    enter: (dir: number) => ({ opacity: 0, x: dir * 56, scale: 0.985 }),
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (dir: number) => ({ opacity: 0, x: dir * -56, scale: 0.985 }),
  }), []);
  const dialogRef = useFocusTrap(open, close);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: t.modal }}
          exit={{ opacity: 0, transition: t.modalExit }}
          className="fixed inset-0 z-[10010] flex items-center justify-center p-5"
          style={{ background: 'var(--overlay)', backdropFilter: 'blur(var(--blur-1)) saturate(130%)' }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: t.modal }}
            exit={{ opacity: 0, y: 8, scale: 0.985, transition: t.modalExit }}
            className="relative flex w-full max-w-[620px] flex-col overflow-hidden rounded-[var(--r-xl)] border"
            style={{
              background: theme.modalBg,
              borderColor: theme.border,
              boxShadow: 'var(--elev-4)',
            }}
          >
            {/* ambient glow */}
            <div
              className="pointer-events-none absolute -top-28 left-1/2 h-56 w-[480px] -translate-x-1/2 rounded-full opacity-40 blur-[80px]"
              style={{ background: theme.accent }}
            />

            {/* header */}
            <div className="relative z-10 flex items-center justify-between px-7 pt-6">
              <div className="flex items-center gap-2.5">
                <motion.div
                  animate={calmMotion ? undefined : { rotate: [0, 12, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 5, repeatDelay: 1.5 }}
                  className="elev-1 flex h-9 w-9 items-center justify-center rounded-[var(--r-md)] text-white"
                  style={{ background: theme.accent }}
                >
                  <Rocket size={17} />
                </motion.div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: theme.accentText }}>
                    Prezentare
                  </div>
                  <div id={titleId} className="text-[13px] font-black tracking-tight" style={{ color: theme.text }}>
                    StudyX {RELEASE_DISPLAY_NAME}
                  </div>
                </div>
              </div>
              <button
                onClick={close}
                aria-label="Închide prezentarea"
                className="rounded-full p-2 transition-colors hover:bg-[var(--hover-fill)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                style={{ color: theme.text3 }}
              >
                <X size={18} />
              </button>
            </div>

            {/* slide body */}
            <div className="relative z-10 px-7 pb-2 pt-5">
              <AnimatePresence mode="wait" custom={direction} initial={false}>
                <motion.div
                  key={slide.id}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={t.modal}
                >
                  <slide.Demo theme={theme} />

                  <div className="mt-5 text-center">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
                      style={{ background: `${theme.accent}12`, borderColor: `${theme.accent}30`, color: theme.accentText }}
                    >
                      <Sparkles size={10} />
                      {slide.badge}
                    </span>
                    <h2 className="mt-3 text-[1.45rem] font-black leading-tight tracking-tight" style={{ color: theme.text }}>
                      {slide.title}
                    </h2>
                    <p className="mx-auto mt-2.5 max-w-[470px] text-[13px] font-medium leading-relaxed" style={{ color: theme.text2 }}>
                      {slide.description}
                    </p>
                    {slide.cta && (
                      <button
                        type="button"
                        onClick={() => showMe(slide.cta as NonNullable<Slide['cta']>)}
                        className="press-feedback mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-semibold"
                        style={{ background: `${theme.accent}16`, color: theme.accentText }}
                      >
                        {slide.cta.label} <ArrowRight size={13} />
                      </button>
                    )}
                    <div className="mt-2 h-[30px]">
                      {slide.tip && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5 }}
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold"
                          style={{ color: theme.text3 }}
                        >
                          <Lightbulb size={12} aria-hidden="true" />{slide.tip}
                        </motion.p>
                      )}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* footer: dots + nav */}
            <div className="relative z-10 flex items-center justify-between px-7 pb-6 pt-1">
              <button
                onClick={() => go(-1)}
                disabled={isFirst}
                aria-label="Slide anterior"
                className="flex h-10 w-10 items-center justify-center rounded-[var(--r-md)] border transition-colors disabled:opacity-30"
                style={{ background: theme.surface2, borderColor: theme.border, color: theme.text2 }}
              >
                <ArrowLeft size={16} />
              </button>

              <div className="flex items-center gap-2">
                {SLIDES.map((entry, i) => (
                  <button
                    key={entry.id}
                    onClick={() => { setDirection(i > index ? 1 : -1); setIndex(i); }}
                    aria-label={`Slide ${i + 1}`}
                    className="rounded-full transition-colors"
                    style={{
                      width: i === index ? 22 : 7,
                      height: 7,
                      background: i === index
                        ? theme.accent
                        : `${theme.text3}38`,
                    }}
                  />
                ))}
              </div>

              {isLast ? (
                <motion.button
                  whileTap={calmMotion ? undefined : { scale: 0.97 }}
                  onClick={close}
                  className="elev-1 flex h-10 items-center gap-2 rounded-[var(--r-md)] px-5 text-[12px] font-black text-white"
                  style={{ background: theme.accent }}
                >
                  Începe să explorezi
                  <Zap size={14} />
                </motion.button>
              ) : (
                <button
                  onClick={() => go(1)}
                  aria-label="Slide următor"
                  className="elev-1 flex h-10 w-10 items-center justify-center rounded-[var(--r-md)] text-white transition-colors"
                  style={{ background: theme.accent }}
                >
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
