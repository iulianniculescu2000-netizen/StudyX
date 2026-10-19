import SegmentedTabs from '../components/fx/SegmentedTabs';
import Portal from '../components/Portal';
import ThemeModeSwitcher from '../components/ThemeModeSwitcher';
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  Clapperboard,
  Cpu,
  Database,
  Gauge,
  History,
  ListChecks,
  MousePointer,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCursorStore } from '../store/cursorStore';
import BackupExport from '../components/BackupExport';
import AISettings from '../components/AISettings';
import AIKeyGuide from '../tutorial/AIKeyGuide';
import { WHATS_NEW_OPEN_EVENT } from '../components/WhatsNewTour';
import { WELCOME_FILM_OPEN_EVENT } from '../components/film/filmEvents';
import { GUIDE_LIST } from '../tutorial/tourMeta';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { detectDeviceCapabilities, liteReason } from '../lib/deviceTier';
import { getHealthBadgeLabel } from '../lib/healthReporter';
import { runStartupHealthCheck } from '../lib/startupHealthCheck';
import { clearRollbackSnapshot, formatSnapshotDate, getRollbackSnapshot } from '../lib/rollback';
import { isAIDebugEnabled, setAIDebugEnabled } from '../ai/debug';
import { saveProfileData } from '../store/profileStorage';
import { useQuizStore } from '../store/quizStore';
import { useFolderStore } from '../store/folderStore';
import type { Folder, Quiz, QuizSession } from '../types';
import { useAIStore } from '../store/aiStore';
import { useDiagnosticsStore } from '../store/diagnosticsStore';
import { useFocusModeStore } from '../store/focusModeStore';
import { useRuntimeStore } from '../store/runtimeStore';
import { useToastStore } from '../store/toastStore';
import { useTutorialStore } from '../store/tutorialStore';
import { useUpdateStore } from '../store/updateStore';
import { useUserStore } from '../store/userStore';
import { useTheme } from '../theme/ThemeContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import PageHeader from '../components/ui/PageHeader';
import SectionLabel from '../components/ui/SectionLabel';
import { Z_LAYERS } from '../theme/zLayers';
import { plural } from '../lib/plural';

function ConfirmResetModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const dialogRef = useFocusTrap(open, onCancel);
  useScrollLock(open);
  const titleId = useId();
  const descId = useId();

  return (
    <Portal>
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={t.modal}
            onClick={onCancel}
            className="fixed inset-0 bg-[var(--overlay)] backdrop-blur-sm"
            style={{ zIndex: Z_LAYERS.settingsDialog.backdrop }}
          />
          <motion.div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            initial={calmMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: t.modal }}
            exit={{ opacity: 0, y: calmMotion ? 0 : 8, scale: calmMotion ? 1 : 0.985, transition: t.modalExit }}
            className="fixed left-1/2 top-1/2 w-[calc(100vw-1.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-lg)] p-6 elev-4"
            style={{ background: theme.modalBg, border: '1px solid var(--hairline)', zIndex: Z_LAYERS.settingsDialog.panel }}
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[var(--r-md)]" style={{ background: `${theme.danger}18`, color: theme.danger }}>
              <AlertTriangle size={24} />
            </div>
            <h3 id={titleId} className="mb-1.5 text-[16px] font-semibold leading-snug" style={{ color: theme.text }}>
              Resetare totală?
            </h3>
            <p id={descId} className="mb-5 text-[13px] leading-relaxed" style={{ color: theme.text3 }}>
              Toate datele, grilele și progresul tău vor fi șterse definitiv. Această acțiune nu poate fi anulată.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={onCancel}
                data-autofocus
                className="focus-ring flex-1 rounded-[var(--r-sm)] py-3 text-sm font-bold transition-colors"
                style={{ background: theme.surface2, color: theme.text }}
              >
                Anulează
              </button>
              <button
                onClick={onConfirm}
                className="focus-ring flex-1 rounded-[var(--r-sm)] py-3 text-sm font-bold text-white"
                style={{ background: theme.danger, boxShadow: 'var(--elev-1)' }}
              >
                Resetează
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </Portal>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const { calmMotion } = useAdaptiveMotion();

  return (
    <section
      role="tabpanel"
      id={`settings-panel-${id}`}
      aria-labelledby={`settings-tab-${id}`}
      className={`${calmMotion ? '' : 'fx-rise '}mb-6`}
    >
      <SectionLabel className="mb-3">{title}</SectionLabel>
      <div className="glass-panel rounded-[var(--r-xl)] border border-[var(--hairline)] p-5 sm:p-6">
        {children}
      </div>
    </section>
  );
}

const SETTINGS_SECTIONS = [
  { id: 'aspect', label: 'Aspect' },
  { id: 'performanta', label: 'Performanță' },
  { id: 'date', label: 'Date și securitate' },
  { id: 'ai', label: 'Inteligență artificială' },
  { id: 'ajutor', label: 'Ajutor și sistem' },
  { id: 'periculos', label: 'Zonă periculoasă' },
] as const;
type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

function Divider() {
  return <div className="my-1 h-[0.5px] w-full" style={{ background: 'var(--hairline)' }} />;
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
  accent,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  accent?: string;
}) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const color = accent ?? theme.accent;

  return (
    <div className="fine-row -mx-2 flex items-center gap-3 px-2 py-3 sm:gap-4">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-sm)]"
        style={{ background: `${color}15`, color }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold" style={{ color: theme.text }}>
          {label}
        </div>
        {description && (
          <div className="mt-0.5 text-[11px]" style={{ color: theme.text2 }}>
            {description}
          </div>
        )}
      </div>
      <motion.button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        whileTap={calmMotion ? undefined : { scale: 0.94 }}
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 rounded-full transition-colors focus-ring"
        style={{ background: checked ? color : 'var(--fill-subtle)', boxShadow: checked ? undefined : 'var(--hairline-ring)' }}
      >
        <motion.div
          animate={{ x: checked ? 22 : 4 }}
          transition={calmMotion ? { duration: 0 } : undefined}
          className="absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm"
        />
      </motion.button>
    </div>
  );
}

function ActionRow({
  icon,
  label,
  description,
  buttonLabel,
  onClick,
  badge,
  danger,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  buttonLabel: string;
  onClick: () => void;
  badge?: ReactNode;
  danger?: boolean;
}) {
  const theme = useTheme();
  const color = danger ? theme.danger : theme.accent;

  return (
    <div className="fine-row -mx-2 flex flex-col gap-4 px-2 py-3 sm:flex-row sm:items-start">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-sm)]"
        style={{ background: `${color}15`, color }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold" style={{ color: theme.text }}>
            {label}
          </span>
          {badge}
        </div>
        {description && (
          <div className="mb-4 text-[11px] leading-relaxed" style={{ color: theme.text2 }}>
            {description}
          </div>
        )}
        <button
          onClick={onClick}
          className="press-feedback fx-lift rounded-[var(--r-sm)] border px-5 py-2 text-xs font-black uppercase tracking-widest hover:bg-[var(--hover-fill)] focus-ring"
          style={{ background: `${color}10`, borderColor: `${color}30`, color }}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const { addToast } = useToastStore();
  const { activeProfileId } = useUserStore();
  const { screenshotProtection, setContentProtection } = useFocusModeStore();
  const { hasKey } = useAIStore();
  const clearAIMemory = useAIStore((state) => state.clearAIMemory);
  const [confirmMemory, setConfirmMemory] = useState(false);
  const { localVersion } = useUpdateStore();
  const performanceMode = useRuntimeStore((state) => state.performanceMode);
  const lowPowerMode = useRuntimeStore((state) => state.lowPowerMode);
  const featureFlags = useRuntimeStore((state) => state.featureFlags);
  const setPerformanceMode = useRuntimeStore((state) => state.setPerformanceMode);
  const setLowPowerMode = useRuntimeStore((state) => state.setLowPowerMode);
  const setFeatureFlag = useRuntimeStore((state) => state.setFeatureFlag);
  const cursorEnabled = useCursorStore((state) => state.enabled);
  const setCursorEnabled = useCursorStore((state) => state.setEnabled);
  const [aiDebug, setAiDebug] = useState(() => isAIDebugEnabled());
  const healthStatus = useDiagnosticsStore((state) => state.healthStatus);
  const checks = useDiagnosticsStore((state) => state.checks);
  const events = useDiagnosticsStore((state) => state.events);
  const lastCheckedAt = useDiagnosticsStore((state) => state.lastCheckedAt);
  const setHealthReport = useDiagnosticsStore((state) => state.setHealthReport);
  const clearDiagnostics = useDiagnosticsStore((state) => state.clearDiagnostics);

  // Secțiunea activă trăiește în URL (?s=aspect|performanta|date|ai|ajutor|periculos).
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('s');
  const active: SettingsSectionId = SETTINGS_SECTIONS.some((item) => item.id === requested)
    ? (requested as SettingsSectionId)
    : 'aspect';
  const selectSection = (id: SettingsSectionId) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('s', id);
      return next;
    }, { replace: true });
  };

  const [showBackup, setShowBackup] = useState(false);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showKeyGuide, setShowKeyGuide] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const deviceInfo = detectDeviceCapabilities();

  // A rollback snapshot is written before every content-pack install. Until now
  // nothing ever read it back, so the safety net only performed the half that
  // costs storage and none of the half that saves you.
  const [snapshot, setSnapshot] = useState(() => getRollbackSnapshot());
  const [restoring, setRestoring] = useState(false);

  const handleRestoreSnapshot = async () => {
    if (!snapshot || restoring) return;
    setRestoring(true);
    try {
      useQuizStore.getState()._hydrate({
        quizzes: snapshot.quizzes as Quiz[],
        sessions: snapshot.sessions as QuizSession[],
      });
      useFolderStore.getState()._hydrate({ folders: snapshot.folders as Folder[] });
      if (activeProfileId) await saveProfileData(activeProfileId);
      clearRollbackSnapshot();
      setSnapshot(null);
      addToast('Am restaurat starea dinaintea ultimei instalări.', 'success');
    } catch (error) {
      console.warn('[Settings] restaurare eșuată', error);
      addToast('Nu am putut restaura starea anterioară. Încearcă din nou sau exportă un backup din Gestionare Date.', 'error');
    } finally {
      setRestoring(false);
    }
  };

  const handleReset = async () => {
    if (window.electronAPI?.hardReset) {
      await window.electronAPI.hardReset();
      return;
    }
    // Browser build has no electronAPI — `?.` on hardReset used to make this
    // a silent no-op: the user confirms an "ireversibil" reset and nothing
    // happens, with no indication it didn't work.
    try {
      localStorage.clear();
      if (window.indexedDB?.databases) {
        const databases = await window.indexedDB.databases();
        await Promise.all(
          databases
            .filter((db): db is { name: string } => !!db.name)
            .map((db) => new Promise<void>((resolve) => {
              const req = window.indexedDB.deleteDatabase(db.name);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            })),
        );
      }
      window.location.reload();
    } catch (error) {
      console.warn('[Settings] resetare eșuată', error);
      addToast('Resetarea nu a reușit. Închide aplicația și încearcă din nou.', 'error');
    }
  };

  const rerunHealthCheck = async () => {
    try {
      const report = await runStartupHealthCheck();
      setHealthReport(report.status, report.checks);
      addToast(`Verificare finalizată: ${getHealthBadgeLabel(report.status)}.`, report.status === 'healthy' ? 'success' : 'warning');
    } catch (error) {
      console.warn('[Settings] health check eșuat', error);
      addToast('Verificarea de sănătate nu a putut rula. Încearcă din nou.', 'error');
    }
  };

  return (
    <div className="custom-scrollbar h-full overflow-y-auto px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Setări" subtitle="Configurarea experienței tale StudyX." tour={{ id: 'settings', label: 'Vezi turul Setărilor' }} />

        <div className="pointer-events-none sticky top-2 z-10 mb-6">
          <div data-tutorial="settings-tabs" className="pointer-events-auto rounded-2xl p-1.5" style={{ background: 'color-mix(in srgb, var(--bg) 94%, transparent)', backdropFilter: 'blur(22px) saturate(1.2)', WebkitBackdropFilter: 'blur(22px) saturate(1.2)', boxShadow: 'var(--hairline-ring), var(--elev-2)' }}>
            <SegmentedTabs
              tabs={SETTINGS_SECTIONS}
              value={active}
              onChange={selectSection}
              layoutId="settings-tabs"
              ariaLabel="Secțiuni de setări"
              idPrefix="settings"
              variant="bare"
            />
          </div>
        </div>

        {active === 'aspect' && (
        <Section id="aspect" title="Aspect">
          <p className="mb-3 text-[13px] leading-relaxed" style={{ color: theme.text2 }}>
            Alege între tema luminoasă, cea întunecată sau lasă aplicația să urmeze setarea sistemului tău de operare.
          </p>
          <ThemeModeSwitcher />

          <Divider />

          <ToggleRow
            icon={<MousePointer size={16} />}
            label="Cursor fin StudyX"
            description="Săgeată, mână și cursor de text în stilul StudyX, desenate direct de sistem: se mișcă fără nicio întârziere."
            checked={cursorEnabled}
            onChange={setCursorEnabled}
          />
        </Section>
        )}

        {active === 'performanta' && (
        <Section id="performanta" title="Stabilitate și performanță">
          <div className="glass-panel mb-5 rounded-[var(--r-lg)] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold" style={{ color: theme.text }}>
                  {getHealthBadgeLabel(healthStatus)}
                </div>
                <div className="text-[11px]" style={{ color: theme.text2 }}>
                  Nivel dispozitiv: {deviceInfo.tier} · {deviceInfo.hardwareConcurrency} thread-uri · {deviceInfo.deviceMemory} GB RAM estimat
                </div>
                <div className="text-[11px]" style={{ color: theme.text2 }}>
                  Aspect: {liteReason(deviceInfo, performanceMode, lowPowerMode) ? `economic, pentru că ${liteReason(deviceInfo, performanceMode, lowPowerMode)}` : 'complet (sticlă, animații)'}
                </div>
              </div>
              <span
                className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]"
                style={{
                  background: healthStatus === 'healthy' ? `${theme.success}15` : healthStatus === 'warning' ? `${theme.warning}15` : `${theme.danger}15`,
                  color: healthStatus === 'healthy' ? theme.success : healthStatus === 'warning' ? theme.warning : theme.danger,
                }}
              >
                {healthStatus === 'healthy' ? 'Optim' : healthStatus === 'warning' ? 'Avertizare' : 'Eroare'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(['auto', 'lite', 'full'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPerformanceMode(mode)}
                  aria-pressed={performanceMode === mode}
                  data-active={performanceMode === mode}
                  className="fine-chip rounded-[var(--r-sm)] px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em]"
                  style={{
                    background: performanceMode === mode ? 'var(--accent-soft)' : theme.surface,
                    color: performanceMode === mode ? theme.accent : theme.text,
                    border: `1px solid ${performanceMode === mode ? `${theme.accent}40` : theme.border}`,
                  }}
                >
                  {mode === 'auto' ? 'Auto' : mode === 'lite' ? 'Lite' : 'Full'}
                </button>
              ))}
            </div>
            {lastCheckedAt && (
              <div className="mt-3 text-[11px]" style={{ color: theme.text3 }}>
                Ultima verificare: {new Date(lastCheckedAt).toLocaleString('ro-RO')}
              </div>
            )}
          </div>

          <ToggleRow
            icon={<Cpu size={16} />}
            label="Mod economisire"
            description="Reduce blur-ul, intensitatea motion și favorizează taskurile mai sigure pe device-uri slabe."
            checked={lowPowerMode}
            onChange={setLowPowerMode}
            accent={theme.warning}
          />
          <Divider />
          <ToggleRow
            icon={<Activity size={16} />}
            label="Panou diagnostic"
            description="Păstrează vizibile verificările de sănătate și semnalele de stabilitate în Setări."
            checked={featureFlags.diagnosticsPanel}
            onChange={(value) => setFeatureFlag('diagnosticsPanel', value)}
            accent={theme.success}
          />
          <Divider />
          <ToggleRow
            icon={<Bot size={16} />}
            label="Jurnal AI detaliat"
            description="Scrie în consola browserului (F12) cererea și răspunsul brut la fiecare apel AI — util ca să trimiți exact ce a răspuns modelul când o generare eșuează."
            checked={aiDebug}
            onChange={(value) => { setAIDebugEnabled(value); setAiDebug(value); }}
            accent={theme.accent2 ?? theme.accent}
          />
          <Divider />
          <ToggleRow
            icon={<Gauge size={16} />}
            label="Coadă fundal sigură"
            description="Rulează sarcinile grele de AI în serie pentru sisteme mai slabe și importuri mai stabile."
            checked={featureFlags.backgroundQueue}
            onChange={(value) => setFeatureFlag('backgroundQueue', value)}
            accent={theme.accent}
          />
          <Divider />
          <ToggleRow
            icon={<ShieldCheck size={16} />}
            label="Pornire sigură"
            description="Rulează verificări de sănătate după pornire și semnalează automat modurile degradate."
            checked={featureFlags.safeStartup}
            onChange={(value) => setFeatureFlag('safeStartup', value)}
            accent={theme.success}
          />
          <Divider />
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <motion.button
              whileTap={calmMotion ? undefined : { scale: 0.97 }}
              onClick={() => void rerunHealthCheck()}
              className="press-feedback fx-lift fine-chip rounded-[var(--r-sm)] px-5 py-2 text-xs font-black uppercase tracking-widest focus-ring"
              style={{ background: 'var(--accent-soft)', color: theme.accentText }}
            >
              Rulează health check
            </motion.button>
            <motion.button
              whileTap={calmMotion ? undefined : { scale: 0.97 }}
              onClick={clearDiagnostics}
              className="glass-panel press-feedback fx-lift rounded-[var(--r-sm)] px-5 py-2 text-xs font-black uppercase tracking-widest focus-ring"
              style={{ color: theme.text3 }}
            >
              Resetează diagnosticul
            </motion.button>
          </div>

          {featureFlags.diagnosticsPanel && checks.length > 0 && (
            <div className="mt-5 space-y-2">
              {checks.map((check, checkIndex) => (
                <div
                  key={check.id}
                  className={`glass-panel ${calmMotion ? '' : 'fx-rise '}rounded-[var(--r-lg)] px-4 py-3`}
                  style={{
                    '--i': checkIndex,
                    borderColor: check.status === 'ok' ? `${theme.success}33` : check.status === 'warning' ? `${theme.warning}33` : `${theme.danger}33`,
                  } as CSSProperties}
                >
                  <div className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: theme.text }}>
                    {check.label}
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed" style={{ color: theme.text2 }}>
                    {check.detail}
                  </div>
                </div>
              ))}
            </div>
          )}

          {featureFlags.diagnosticsPanel && events.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: theme.text3 }}>
                Evenimente recente
              </div>
              <div className="space-y-2">
                {events.slice(0, 6).map((event, eventIndex) => (
                  <div
                    key={event.id}
                    className={`glass-panel ${calmMotion ? '' : 'fx-rise '}rounded-[var(--r-lg)] px-4 py-3`}
                    style={{
                      '--i': eventIndex,
                      borderColor: event.level === 'error' ? `${theme.danger}33` : event.level === 'warning' ? `${theme.warning}33` : `${theme.accent}2e`,
                    } as CSSProperties}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: theme.text }}>
                        {event.title}
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: theme.text3 }}>
                        {event.area} · {new Date(event.createdAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div className="micro-copy mt-1" style={{ color: theme.text2 }}>
                      {event.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
        )}

        {active === 'date' && (
        <Section id="date" title="Date și securitate">
          <div data-tutorial="settings-backup">
          <ActionRow
            icon={<Database size={16} />}
            label="Gestionare Date"
            description="Exportă progresul sau importă backup-uri anterioare."
            buttonLabel="Deschide"
            onClick={() => setShowBackup(true)}
          />
          </div>
          {snapshot && (
            <>
              <Divider />
              <ActionRow
                icon={<History size={16} />}
                label="Restaurează dinaintea ultimei instalări"
                description={`${snapshot.label} · ${formatSnapshotDate(snapshot.savedAt)} · ${plural(snapshot.quizzes.length, 'set', 'seturi')}`}
                buttonLabel={restoring ? 'Se restaurează...' : 'Restaurează'}
                onClick={handleRestoreSnapshot}
                danger
              />
            </>
          )}
          <Divider />
          <ToggleRow
            icon={<ShieldCheck size={16} />}
            label="Protecție Conținut"
            description="Blochează capturile de ecran (recomandat în testări)."
            checked={screenshotProtection}
            onChange={setContentProtection}
            accent={theme.success}
          />
        </Section>
        )}

        {active === 'ai' && (
        <Section id="ai" title="Inteligență artificială">
          <div data-tutorial="settings-ai">
          <ActionRow
            icon={<Bot size={16} />}
            label="Asistent AI"
            description="Analiză inteligentă și explicații medicale automate."
            buttonLabel={hasKey ? 'Gestionează' : 'Configurează'}
            onClick={() => setShowAISettings(true)}
            badge={(
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-black"
                style={{ background: hasKey ? `${theme.success}20` : `${theme.warning}20`, color: hasKey ? theme.success : theme.warning }}
              >
                {hasKey ? 'ACTIV' : 'NECONFIGURAT'}
              </span>
            )}
          />
          </div>
          <Divider />
          <ActionRow
            icon={<Sparkles size={16} />}
            label="Ghid chei gratuite"
            description="Obții o cheie gratuită, o testezi și o salvezi, pas cu pas. Mai multe chei înseamnă rezerve automate."
            buttonLabel={showKeyGuide ? 'Ascunde' : 'Deschide'}
            onClick={() => setShowKeyGuide((open) => !open)}
          />
          {showKeyGuide && (
            <div className="pb-3 pl-0 sm:pl-14">
              <AIKeyGuide />
            </div>
          )}
          <Divider />
          <ActionRow
            icon={<Trash2 size={16} />}
            label="Memoria AI"
            description="Ce a reținut asistentul despre cum înveți (subiecte, ritm, preferințe), doar pentru acest profil. Grilele, cardurile și statisticile nu se șterg."
            buttonLabel={confirmMemory ? 'Sigur? Apasă din nou' : 'Șterge memoria'}
            onClick={() => {
              if (!confirmMemory) { setConfirmMemory(true); return; }
              if (activeProfileId) clearAIMemory(activeProfileId);
              setConfirmMemory(false);
            }}
          />
        </Section>
        )}

        {active === 'ajutor' && (
        <Section id="ajutor" title="Ajutor și sistem">
          <div data-tutorial="settings-help">
          <ActionRow
            icon={<Clapperboard size={16} />}
            label="Filmul de bun venit"
            description="O prezentare de aproximativ un minut, cu voce în română și scene pe care le poți relua."
            buttonLabel="Vezi"
            onClick={() => window.dispatchEvent(new CustomEvent(WELCOME_FILM_OPEN_EVENT))}
          />
          <Divider />
          <ActionRow
            icon={<Brain size={16} />}
            label="Tur de bun venit"
            description="Reia ghidul de utilizare a platformei."
            buttonLabel="Pornește"
            onClick={() => {
              useTutorialStore.getState().startTutorial();
              addToast('Turul a pornit.', 'info');
            }}
          />
          <Divider />
          <ActionRow
            icon={<Sparkles size={16} />}
            label="Prezentarea StudyX 1.0"
            description="Ce poți face în aplicație, cu trimitere la fiecare pagină."
            buttonLabel="Vezi"
            onClick={() => window.dispatchEvent(new CustomEvent(WHATS_NEW_OPEN_EVENT))}
          />
          <Divider />
          <ActionRow
            icon={<ListChecks size={16} />}
            label="Ghiduri pe pagini"
            description="Câte un tur scurt pentru fiecare parte a aplicației. Le găsești și cu „?” de lângă titluri."
            buttonLabel={showGuides ? 'Ascunde' : 'Arată'}
            onClick={() => setShowGuides((open) => !open)}
          />
          {showGuides && (
            <div className="mb-2 grid gap-1.5 sm:pl-14">
              {GUIDE_LIST.map((guide) => (
                <button
                  key={guide.id}
                  type="button"
                  onClick={() => { useTutorialStore.getState().startTour(guide.id); }}
                  className="press-feedback focus-ring flex items-center justify-between gap-3 rounded-[var(--r-sm)] px-3 py-2 text-left hover:bg-[var(--hover-fill)]"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold" style={{ color: theme.text }}>{guide.title}</span>
                    <span className="block text-[11.5px]" style={{ color: theme.text3 }}>{guide.description}</span>
                  </span>
                  <span className="flex-shrink-0 text-[12px] font-semibold" style={{ color: theme.accentText }}>Pornește</span>
                </button>
              ))}
            </div>
          )}
          <Divider />
          <ActionRow
            icon={<RotateCcw size={16} />}
            label="Actualizări"
            description={localVersion && localVersion !== '-' ? `Versiunea curentă: ${localVersion}` : 'Actualizările funcționează doar în aplicația desktop'}
            buttonLabel="Caută update"
            onClick={() => useUpdateStore.getState().setShowUpdateModal(true)}
          />
          </div>
        </Section>
        )}

        {active === 'periculos' && (
        <Section id="periculos" title="Zonă periculoasă">
          <ActionRow
            icon={<Trash2 size={16} />}
            label="Resetare Completă"
            description="Șterge tot progresul și setările. Ireversibil."
            buttonLabel="Resetează tot"
            onClick={() => setConfirmReset(true)}
            danger
          />
        </Section>
        )}

        <div className="py-10 text-center text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: theme.text3 }}>
          StudyX Premium • 2026
        </div>
      </div>

      <ConfirmResetModal open={confirmReset} onCancel={() => setConfirmReset(false)} onConfirm={handleReset} />
      {showBackup && <BackupExport open={showBackup} onClose={() => setShowBackup(false)} />}
      {showAISettings && <AISettings open={showAISettings} onClose={() => setShowAISettings(false)} />}
    </div>
  );
}
