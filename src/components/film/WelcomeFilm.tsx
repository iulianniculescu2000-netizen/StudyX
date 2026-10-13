import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import { useTutorialStore } from '../../store/tutorialStore';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useOverlayFlag } from '../../hooks/useOverlayFlag';
import { useScrollLock } from '../../hooks/useScrollLock';
import { WELCOME_FILM_OPEN_EVENT } from './filmEvents';
import { FILM_SCENES } from './scenes';
import { STAGE } from './stage';
import FilmAtmosphere from './FilmAtmosphere';
import FilmShortcuts from './FilmShortcuts';
import { FilmTime, fraction } from './useTimeline';
import { scenePosition, usePlayback } from './usePlayback';
import { BUNDLED_NARRATION, parseNarration, SCRIPT_NARRATION } from './narration';
import type { NarrationEntry } from './narration';
import { useNarration } from './useNarration';

const COLORS = [STAGE.blue, STAGE.blue, STAGE.violet, STAGE.blue, STAGE.green, STAGE.amber, STAGE.blue];
const BUTTON = 'focus-ring flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold disabled:opacity-30';
const buttonStyle = { borderColor: STAGE.line, color: STAGE.text2, background: STAGE.panel };

/** Suspense commits this only after the selected visual is ready. */
function ReadyVisual({ id, ready, children }: { id: string; ready: (id: string) => void; children: ReactNode }) {
  useEffect(() => { ready(id); }, [id, ready]);
  return children;
}

/** First-run ownership and seen-state handoff remain outside the playback session. */
export default function WelcomeFilm() {
  const profileId = useUserStore((state) => state.activeProfileId);
  const hydrated = useTutorialStore((state) => state._hasHydrated);
  const onboardingRunning = useTutorialStore((state) => state.activeTour === 'onboarding');
  const seen = useTutorialStore((state) => state.seen);
  const [replay, setReplay] = useState(false);
  const [session, setSession] = useState(0);
  const firstRun = hydrated && !!profileId && onboardingRunning && !seen[profileId]?.welcomeFilm;
  const open = firstRun || replay;
  useOverlayFlag(open);
  useScrollLock(open);
  useEffect(() => {
    const handler = () => { setSession((value) => value + 1); setReplay(true); };
    window.addEventListener(WELCOME_FILM_OPEN_EVENT, handler);
    return () => window.removeEventListener(WELCOME_FILM_OPEN_EVENT, handler);
  }, []);
  const close = useCallback(() => {
    setReplay(false);
    // Defer the handoff: the same Escape must not also dismiss onboarding.
    if (profileId) window.setTimeout(() => useTutorialStore.getState().markSeen(profileId, 'welcomeFilm'), 0);
  }, [profileId]);
  return open ? <FilmSession key={`${profileId}-${session}`} firstRun={firstRun} close={close} /> : null;
}

function FilmSession({ firstRun, close }: { firstRun: boolean; close: () => void }) {
  const { calmMotion } = useAdaptiveMotion();
  const titleId = useId();
  const [manifest, setManifest] = useState<NarrationEntry[]>(BUNDLED_NARRATION);
  const [manifestReady, setManifestReady] = useState(BUNDLED_NARRATION.length > 0);
  const [readyId, setReadyId] = useState<string | null>(null);
  const [sound, setSound] = useState(false);
  const [restart, setRestart] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    // Local optional metadata must never prevent captions-only playback.
    const timeout = window.setTimeout(() => { controller.abort(); if (alive) setManifestReady(true); }, 1500);
    fetch(`${import.meta.env.BASE_URL}audio/intro/manifest.json`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value: unknown) => { const entries = parseNarration(value); if (alive && entries.length) setManifest(entries); })
      .catch(() => { /* Missing local assets: use the scene captions and default timing. */ })
      .finally(() => { if (alive) setManifestReady(true); window.clearTimeout(timeout); });
    return () => { alive = false; controller.abort(); window.clearTimeout(timeout); };
  }, []);

  const durations = useMemo(() => FILM_SCENES.map((scene) => {
    const measured = manifest.find((entry) => entry.id === scene.id)?.durationMs ?? 0;
    const scripted = SCRIPT_NARRATION.find((entry) => entry.id === scene.id)?.durationMs ?? 0;
    return measured || scripted ? Math.max(measured, scripted) + 150 : scene.durationMs;
  }), [manifest]);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const clock = usePlayback(manifestReady, total, (elapsed) => readyId === FILM_SCENES[scenePosition(elapsed, durations).index].id, calmMotion ? 100 : 1000 / 30);
  const { seek, reset, toggle } = clock;
  const position = scenePosition(clock.elapsedMs, durations);
  const scene = FILM_SCENES[position.index];
  const isLast = position.index === FILM_SCENES.length - 1;
  const finished = clock.elapsedMs >= total;
  const caption = SCRIPT_NARRATION.find((entry) => entry.id === scene.id)?.text
    ?? manifest.find((entry) => entry.id === scene.id)?.text ?? scene.text;
  const { audioRef, unavailable } = useNarration(scene.id, position.elapsed, clock.running, sound);
  const dialogRef = useFocusTrap(true, close);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setFit(Math.min(1, el.clientHeight / 330, el.clientWidth / 520));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const selectScene = useCallback((index: number) => {
    const selected = Math.max(0, Math.min(FILM_SCENES.length - 1, index));
    seek(durations.slice(0, selected).reduce((sum, duration) => sum + duration, 0));
    setRestart((value) => value + 1);
    setReadyId(null);
  }, [seek, durations]);
  const replayFilm = useCallback(() => {
    reset(); setRestart((value) => value + 1); setReadyId(null);
  }, [reset]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); selectScene(position.index + 1); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); selectScene(position.index - 1); }
      else if (/^[1-7]$/.test(event.key)) { event.preventDefault(); selectScene(Number(event.key) - 1); }
      else if ((event.key === ' ' || event.code === 'Space') && !target?.closest('button, a, [role="button"]')) {
        event.preventDefault(); if (finished) replayFilm(); else toggle();
      } else if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Works whichever control has focus (Enter/Space belong to the button, R does not); Ctrl+R stays reload.
        event.preventDefault(); replayFilm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, finished, position.index, replayFilm, selectScene]);

  const fade = calmMotion ? 1 : fraction(position.elapsed, 0, 400);
  // pt-12: butoanele ferestrei (Electron) stau deasupra filmului, nu peste „Sari peste”.
  return <div className="fixed inset-0 flex items-center justify-center px-3 pb-3 pt-12" style={{ zIndex: 10012, background: 'rgba(3,4,8,0.92)', backdropFilter: 'blur(18px)' }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
      data-film-scene={scene.id} data-film-elapsed-ms={Math.round(clock.elapsedMs)}
      data-film-scene-elapsed-ms={Math.round(position.elapsed)} data-film-playing={clock.running}
      className="relative flex w-full max-w-[880px] flex-col overflow-hidden rounded-[28px] border"
      style={{ background: STAGE.bg, borderColor: STAGE.line, boxShadow: 'var(--elev-4)', maxHeight: 'calc(100dvh - 60px)', color: STAGE.text }}>
      <FilmAtmosphere />
      <div className="relative flex flex-shrink-0 items-center justify-between px-5 pt-4">
        <div><span className="text-base font-bold">Study<span style={{ color: STAGE.blue }}>X</span></span>
          <span className="ml-3 text-[10px] font-semibold uppercase tracking-widest" style={{ color: STAGE.text3 }}>Film de bun venit</span></div>
        <button type="button" onClick={close} className={BUTTON} style={buttonStyle}>{isLast ? 'Închide' : 'Sari peste'} <X size={12} /></button>
      </div>
      <div className="relative min-h-0 overflow-y-auto">
        <div ref={stageRef} className="flex items-center justify-center px-4" style={{ height: 'clamp(140px, min(43vh, calc(100dvh - 420px)), 350px)' }}>
          <div className="flex flex-shrink-0 items-center justify-center" aria-hidden="true" style={{ width: 520, height: 330, transform: `scale(${fit})`, opacity: fade }}>
            <FilmTime.Provider value={{ elapsedMs: position.elapsed, calm: calmMotion }}>
              <Suspense fallback={<p className="text-sm text-white/60">Pregătim scena…</p>}>
                <ReadyVisual key={`${scene.id}-${restart}`} id={scene.id} ready={setReadyId}><scene.Visual /></ReadyVisual>
              </Suspense>
            </FilmTime.Provider>
          </div>
        </div>
        <div className="px-6 pb-3 text-center" aria-live="polite" aria-atomic="true">
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: COLORS[position.index] }}>{scene.kicker}</div>
          <h2 id={titleId} className="display mt-2 text-2xl font-extrabold leading-tight">{scene.title}</h2>
          <p className="mx-auto mt-2 min-h-[60px] max-w-[600px] text-[13px] leading-relaxed" style={{ color: STAGE.text2 }}>{caption}</p>
        </div>
      </div>
      <div className="relative flex-shrink-0 px-5 pb-4">
        <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-widest" style={{ color: STAGE.text3 }}>
          {position.index + 1} / {FILM_SCENES.length} · {scene.kicker}
        </p>
        <div className="mb-3 flex items-center gap-3">
          <button type="button" onClick={() => selectScene(position.index - 1)} disabled={position.index === 0} aria-label="Scena anterioară" className={BUTTON} style={buttonStyle}><ArrowLeft size={15} /></button>
          <div className="flex flex-1 gap-2" role="group" aria-label="Scenele filmului">{FILM_SCENES.map((entry, index) => {
            const progress = index < position.index ? 1 : index === position.index ? fraction(position.elapsed, 0, durations[index]) : 0;
            return <button key={entry.id} type="button" onClick={() => selectScene(index)} aria-label={`Scena ${index + 1}: ${entry.kicker}`} aria-current={index === position.index ? 'step' : undefined} className="focus-ring flex h-9 flex-1 items-center">
              <span className="h-1 w-full overflow-hidden rounded-full" style={{ background: STAGE.line }}><span className="block h-full rounded-full" style={{ width: `${progress * 100}%`, background: COLORS[index] }} /></span>
            </button>;
          })}</div>
          {isLast ? <button type="button" onClick={close} className={BUTTON} style={{ ...buttonStyle, background: '#0A84FF', color: '#fff' }}>{firstRun ? 'Începe turul' : 'Gata'} <Play size={13} /></button>
            : <button type="button" onClick={() => selectScene(position.index + 1)} aria-label="Scena următoare" className={BUTTON} style={buttonStyle}><ArrowRight size={15} /></button>}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" data-autofocus onClick={finished ? replayFilm : clock.toggle} aria-label={finished ? 'Reia filmul' : clock.paused ? 'Continuă filmul' : 'Pauză film'} aria-pressed={clock.paused} className={BUTTON} style={buttonStyle}>
            {clock.paused || finished ? <Play size={14} /> : <Pause size={14} />}{finished ? 'Reia' : clock.paused ? 'Continuă' : 'Pauză'}
          </button>
          <button type="button" onClick={replayFilm} aria-label="Reia de la început" className={BUTTON} style={buttonStyle}><RotateCcw size={14} /></button>
          <button type="button" onClick={() => setSound((value) => !value)} aria-label={sound ? 'Oprește narațiunea' : 'Pornește narațiunea'} aria-pressed={sound} className={BUTTON} style={buttonStyle}>{sound ? <Volume2 size={14} /> : <VolumeX size={14} />}{sound ? 'Cu voce' : 'Fără sunet'}</button>
          <span role="progressbar" aria-label="Progres film" aria-valuemin={0} aria-valuemax={total}
            aria-valuenow={Math.round(clock.elapsedMs)} aria-valuetext={`${Math.floor(clock.elapsedMs / 1000)} din ${Math.ceil(total / 1000)} secunde`}
            className="text-[11px] tabular-nums" style={{ color: STAGE.text3 }}>{Math.floor(clock.elapsedMs / 1000)} / {Math.ceil(total / 1000)} s</span>
        </div>
        <FilmShortcuts />
        <p role="status" className="text-center text-[11px] empty:hidden" style={{ color: STAGE.text3 }}>
          {unavailable ? 'Vocea nu este disponibilă pentru această scenă. Poți citi textul.' : clock.hidden ? 'Filmul așteaptă revenirea în fereastră.' : !manifestReady ? 'Pregătim filmul…' : ''}
        </p>
      </div>
      <audio ref={audioRef} preload="none" aria-hidden="true" />
    </div>
  </div>;
}
