import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { useBack } from '../hooks/useBack';
import { ChevronLeft, Download, Upload } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { spring } from '../theme/motion';
import { useUserStore } from '../store/userStore';
import { useOrganizareStore } from '../store/organizareStore';
import { useToastStore } from '../store/toastStore';
import { burstAt, celebrate } from '../lib/fxConfetti';
import { cancelIdleTask, scheduleIdleTask } from '../lib/idleTaskScheduler';
import {
  activePhase, buildSummary, computeWindows, hasProgress, normalizePlan, readState, statusOf, toDay, withStatus,
} from '../lib/organizare/engine';
import { specialtyHref } from '../lib/organizare/appLinks';
import { longDay, monthName, withoutNumber } from '../lib/organizare/format';
import type { Plan, RawPlan } from '../lib/organizare/types';
import { useRezidentiatOverview } from '../components/residency/useResidencyData';
import PageHeader from '../components/ui/PageHeader';
import FxPage from '../components/fx/FxPage';
import { useScrollFade } from '../components/ui/useScrollFade';
import TourHelpButton from '../tutorial/TourHelpButton';
import { OrganizareContext, type OrganizareApi } from '../components/organizare/context';
import { Card, GhostButton } from '../components/organizare/ui';
import Overview from '../components/organizare/Overview';

// The heavier tabs are separate chunks. They are fetched in idle time once the plan is ready (and on hover/focus of
// their tab), so the first switch never waits on the network or shows a skeleton in the middle of the transition.
const tabLoaders = {
  topicuri: () => import('../components/organizare/Passes'),
  saptamani: () => import('../components/organizare/Weeks'),
  ritm: () => import('../components/organizare/Rhythm'),
  ghid: () => import('../components/organizare/Guide'),
};
const preloadTab = (id: string) => { void tabLoaders[id as keyof typeof tabLoaders]?.(); };
const preloadAllTabs = () => { for (const id of Object.keys(tabLoaders)) preloadTab(id); };
const Passes = lazy(tabLoaders.topicuri);
const Weeks = lazy(tabLoaders.saptamani);
const Rhythm = lazy(tabLoaders.ritm);
const Guide = lazy(tabLoaders.ghid);

const TABS = [
  { id: 'panou', label: 'Panou' },
  { id: 'topicuri', label: 'Topicuri' },
  { id: 'saptamani', label: 'Săptămâni' },
  { id: 'ritm', label: 'Ritm zilnic' },
  { id: 'ghid', label: 'Ghid' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function usePlan(): Plan | null {
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import('../data/organizare/plan.json').then((module) => {
      if (!cancelled) setPlan(normalizePlan((module.default ?? module) as unknown as RawPlan));
    });
    return () => { cancelled = true; };
  }, []);
  return plan;
}

function Loading() {
  const { calmMotion } = useAdaptiveMotion();
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Se încarcă planul">
      {[120, 84, 96].map((h, i) => (
        <div key={i} className={`glass-panel rounded-2xl ${calmMotion ? '' : 'animate-pulse'}`} style={{ height: h, opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  );
}

export default function Organizare() {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const profileId = useUserStore((state) => state.activeProfileId) ?? 'default';
  const addToast = useToastStore((state) => state.addToast);
  const overview = useRezidentiatOverview();
  const [params, setParams] = useSearchParams();
  const goBack = useBack('/rezidentiat');
  const [today] = useState(() => toDay(new Date()));
  const plan = usePlan();
  useEffect(() => {
    if (!plan) return;
    const handle = scheduleIdleTask(preloadAllTabs);
    return () => cancelIdleTask(handle);
  }, [plan]);
  const stored = useOrganizareStore((state) => state.byProfile[profileId]?.state);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const importer = useRef<HTMLInputElement>(null);
  const [stuck, setStuck] = useState(false);
  const [tabRef, tabFade] = useScrollFade<HTMLDivElement>();

  const state = useMemo(() => (plan ? readState(plan, stored) : null), [plan, stored]);
  const win = useMemo(() => (plan && state ? computeWindows(plan, state, today) : null), [plan, state, today]);

  const requestedTab = params.get('t');
  const baseTab: TabId = TABS.some((t) => t.id === requestedTab) ? (requestedTab as TabId) : 'panou';
  const currentPass = plan ? Math.min(activePhase(plan, today), 4) : 1;
  const requestedPass = Number(params.get('f'));
  const pass = requestedPass >= 1 && requestedPass <= 4 ? requestedPass : currentPass;

  // Deep link: `c` = chapter (plan group) index, 0-based; `topic` = Topic.index inside it. Stale ids are ignored.
  const focus = useMemo(() => {
    if (!plan) return null;
    const int = (v: string | null) => (v !== null && /^\d+$/.test(v) ? Number(v) : null);
    const topicIdx = int(params.get('topic'));
    const topic = topicIdx !== null ? plan.topics[topicIdx] : undefined;
    let chapter = int(params.get('c'));
    if (chapter !== null && (chapter >= plan.groups.length || (topic && topic.group !== chapter))) chapter = null;
    if (chapter === null && topic) chapter = topic.group;
    return chapter === null ? null : { chapter, topic: topic && topic.group === chapter ? topic.index : null };
  }, [plan, params]);
  const clearFocus = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('c');
      next.delete('topic');
      if (!next.get('t')) next.set('t', 'topicuri');
      return next;
    }, { replace: true });
  }, [setParams]);

  const tab: TabId = focus && baseTab === 'panou' ? 'topicuri' : baseTab;

  const goTo = useCallback((next: string, nextPass?: number, topic?: number) => {
    const out: Record<string, string> = {};
    if (next !== 'panou') out.t = next;
    if (nextPass) out.f = String(nextPass);
    if (topic !== undefined) out.topic = String(topic);
    // The old tab stays on screen until the new one is ready, then exit and enter run back to back.
    startTransition(() => setParams(out));
  }, [setParams]);

  // A new tab starts at the top, not wherever the last one was scrolled to.
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [tab]);

  // The tab bar sticks to the top once the header has scrolled away; only then does it make room for a back button.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !scroller.current) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { root: scroller.current, threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [plan]);

  const update = useCallback<OrganizareApi['update']>((change) => {
    if (!plan) return;
    const current = readState(plan, useOrganizareStore.getState().byProfile[profileId]?.state);
    useOrganizareStore.getState().setState(profileId, { ...change(current), ts: Date.now() });
  }, [plan, profileId]);

  const setStatus = useCallback<OrganizareApi['setStatus']>((ph, i, v, origin) => {
    if (!plan || !state) return;
    update((s) => withStatus(s, ph, i, v, today));
    if (v !== 2) return;
    if (origin) burstAt(origin.x, origin.y);
    const group = plan.topics[i].group;
    const complete = plan.topics.filter((t) => t.group === group).every((t) => t.index === i || statusOf(state, ph, t.index) === 2);
    if (complete) {
      window.setTimeout(celebrate, 250);
      addToast(`Grupă terminată: ${withoutNumber(plan.groups[group])}`, 'success', 3800);
    }
  }, [plan, state, update, today, addToast]);

  // Tell the rest of the app where the student is (the Rezidențiat card and the assistant read this).
  useEffect(() => {
    if (!plan || !state) return;
    useOrganizareStore.getState().setSummary(profileId, buildSummary(plan, state, today, Date.now()));
  }, [plan, state, today, profileId]);

  const exportCopy = () => {
    if (!state) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' }));
    link.download = `progres-rezidentiat-${today}.json`;
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 500);
    addToast('Copia progresului a fost descărcată.', 'success', 3000);
  };

  const importCopy = async (file: File | undefined) => {
    if (!file || !plan) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !('s1' in parsed)) throw new Error('not a plan');
      useOrganizareStore.getState().setState(profileId, { ...readState(plan, parsed), ts: Date.now() });
      addToast('Copia a fost încărcată.', 'success', 3000);
    } catch {
      addToast('Fișierul nu e o copie validă a planului.', 'error', 4000);
    }
  };

  const api = useMemo<OrganizareApi | null>(() => (plan && state && win ? {
    plan, state, win, today, profileId, update, setStatus, goTo,
    grileHref: (topic) => specialtyHref(overview, topic),
  } : null), [plan, state, win, today, profileId, update, setStatus, goTo, overview]);

  const exam = state?.exam ?? '';
  const content = (() => {
    switch (tab) {
      case 'topicuri': return <Passes pass={pass} onPass={(p) => goTo('topicuri', p)} focus={focus} onFocusDone={clearFocus} />;
      case 'saptamani': return <Weeks />;
      case 'ritm': return <Rhythm />;
      case 'ghid': return <Guide />;
      default: return <Overview />;
    }
  })();

  // pb-28: the last row can scroll up past the floating „Revino sus” button and the assistant.
  return (
    <FxPage ref={scroller} className="px-4 pb-28 pt-5 sm:px-8 sm:pt-8">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          back={{ to: '/rezidentiat', label: 'Rezidențiat' }}
          eyebrow={`Rezidențiat${exam ? ` · ${monthName(exam).toLowerCase()}` : ''}`}
          title="Organizare"
          subtitle={plan ? `${plan.topics.length.toLocaleString('ro-RO')} de topicuri · patru treceri · simulări` : 'Planul tău de studiu'}
          actions={(
            <>
              <TourHelpButton tour="organizare" label="Vezi turul paginii Organizare" />
              {state && (
            <label data-tutorial="organizare-exam" className="glass-panel flex items-center gap-2.5 rounded-full py-1.5 pl-4 pr-1.5 text-[12px]" style={{ color: theme.text3 }}>
              Examen (estimare)
              <input
                type="date"
                value={state.exam}
                onChange={(e) => e.target.value && update((s) => ({ ...s, exam: e.target.value }))}
                aria-label={`Data examenului: ${longDay(state.exam)}`}
                className="rounded-full px-3 py-1.5 text-[13px] outline-none"
                style={{ background: theme.surface2, color: theme.text }}
              />
            </label>
              )}
            </>
          )}
        />

        <div ref={sentinel} className="h-px" aria-hidden="true" />
        <nav
          data-tutorial="organizare-tabs"
          className="pointer-events-none sticky top-2 z-20 mb-5"
          aria-label="Secțiunile planului"
        >
          <div ref={tabRef} role="tablist" className={`${stuck ? '' : 'glass-panel '}pointer-events-auto flex items-center gap-1 overflow-x-auto rounded-2xl p-1.5`} style={{ scrollbarWidth: 'none', transition: 'box-shadow 0.2s', ...tabFade, ...(stuck ? { background: 'color-mix(in srgb, var(--bg) 94%, transparent)', backdropFilter: 'blur(22px) saturate(1.2)', WebkitBackdropFilter: 'blur(22px) saturate(1.2)', boxShadow: 'var(--hairline-ring), var(--elev-3)' } : {}) }}>
            <AnimatePresence initial={false}>
              {stuck && (
                <motion.span
                  key="back"
                  initial={calmMotion ? false : { width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={calmMotion ? undefined : { width: 0, opacity: 0 }}
                  transition={t.modal}
                  className="flex flex-shrink-0 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={goBack}
                    aria-label="Înapoi la Rezidențiat"
                    title="Înapoi la Rezidențiat"
                    className="press-feedback flex h-9 w-9 items-center justify-center rounded-[var(--r-sm)]"
                    style={{ color: theme.accentText, background: 'var(--accent-soft)' }}
                  >
                    <ChevronLeft size={18} strokeWidth={2.4} />
                  </button>
                </motion.span>
              )}
            </AnimatePresence>
            {TABS.map((t) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => goTo(t.id)}
                  onPointerEnter={() => preloadTab(t.id)}
                  onFocus={() => preloadTab(t.id)}
                  className="relative flex-shrink-0 rounded-[var(--r-sm)] px-3.5 py-2 text-[13.5px]"
                  style={{ color: active ? theme.text : theme.text2, fontWeight: active ? 600 : 500 }}
                >
                  {active && (
                    <motion.span
                      layoutId="organizare-tab-pill"
                      className="absolute inset-0 rounded-[var(--r-sm)]"
                      style={{ background: theme.surface, boxShadow: 'var(--hairline-ring), var(--elev-1)' }}
                      transition={calmMotion ? { duration: 0 } : spring.nav}
                    />
                  )}
                  <span className="relative">{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {api ? (
          <OrganizareContext.Provider value={api}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={calmMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={calmMotion ? undefined : { opacity: 0, y: -6 }}
                transition={t.modal}
              >
                <Suspense fallback={<Loading />}>{content}</Suspense>
              </motion.div>
            </AnimatePresence>

            <Card className="mt-8 flex flex-wrap items-center justify-between gap-3 !p-4" spot={false}>
              <div>
                <div className="text-[13px] font-semibold" style={{ color: theme.text }}>Copie de siguranță</div>
                <div className="text-[12px]" style={{ color: theme.text3 }}>Progresul se salvează singur pe profilul tău și intră în backup-ul aplicației. Poți păstra și o copie separată.</div>
              </div>
              <div className="flex gap-2">
                <GhostButton onClick={exportCopy}><Download size={14} /> Descarcă</GhostButton>
                <GhostButton onClick={() => importer.current?.click()}><Upload size={14} /> Încarcă</GhostButton>
                <input
                  ref={importer}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(e) => { void importCopy(e.target.files?.[0]); e.target.value = ''; }}
                />
              </div>
            </Card>
            {!hasProgress(api.state) && (
              <p className="mt-3 px-1 text-[12px]" style={{ color: theme.text3 }}>
                Ai folosit planul într-o altă pagină? „Încarcă” o copie descărcată de acolo și continui de unde ai rămas.
              </p>
            )}
          </OrganizareContext.Provider>
        ) : (
          <Loading />
        )}
      </div>
    </FxPage>
  );
}
