import { useId, useState } from 'react';
import ProgressBar from './fx/ProgressBar';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, RefreshCw, Check, Package2, Sparkles, Download, RotateCcw,
  AlertCircle, ArrowDownCircle, BookOpen, FolderPlus, ChevronRight,
} from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { QUIZ_COLOR_HEX } from '../theme/colorMaps';
import { useUpdateStore, type ContentUpdate } from '../store/updateStore';
import { useQuizStore } from '../store/quizStore';
import { useFolderStore } from '../store/folderStore';
import { saveRollbackSnapshot } from '../lib/rollback';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import Portal from './Portal';
import type { Quiz } from '../types';

function uid() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

async function fetchContentPack(url: string): Promise<{
  subject: string;
  emoji: string;
  color: string;
  quizzes: Array<{
    title?: string;
    description?: string;
    questions: Array<Record<string, unknown>>;
  }>;
}> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Eroare rețea: HTTP ${res.status}`);
  return res.json();
}

function StatusDot({ color }: { color: string }) {
  const { calmMotion } = useAdaptiveMotion();
  return (
    <motion.span
      animate={calmMotion ? undefined : { scale: [1, 1.4, 1], opacity: [1, 0.45, 1] }}
      transition={{ duration: 1.8, repeat: Infinity }}
      style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }}
    />
  );
}

function VersionPill({ label, value, tone }: { label: string; value: string; tone: string }) {
  const theme = useTheme();
  return (
    <div
      className="luxe-card"
      style={{
        background: theme.surface2,
        border: `1px solid ${tone === theme.text ? theme.border : `${tone}28`}`,
        borderRadius: 'var(--r-md)',
        padding: '12px 14px',
        boxShadow: 'var(--elev-1)',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: theme.text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: tone, fontFamily: 'monospace' }}>
        {value}
      </div>
    </div>
  );
}

function ContentPackCard({
  pack,
  installed,
  installing,
  onInstall,
}: {
  pack: ContentUpdate;
  installed: boolean;
  installing: boolean;
  onInstall: () => void;
}) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const accent = QUIZ_COLOR_HEX[pack.color] ?? theme.accent;

  return (
    <div
      className="premium-card-hover flex flex-col items-start gap-4 sm:flex-row sm:items-center"
      style={{
        background: installed ? `${accent}0E` : theme.surface2,
        border: `1px solid ${installed ? `${accent}28` : theme.border}`,
        borderRadius: 'var(--r-lg)',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow: 'var(--elev-1)',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 'var(--r-md)',
          background: `${accent}18`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          flexShrink: 0,
        }}
      >
        {pack.emoji}
      </div>

      <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: theme.text }}>{pack.subject}</span>
          {installed && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: `${theme.success}18`,
                color: theme.success,
              }}
            >
              Instalat
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: theme.text2, lineHeight: 1.5, marginBottom: 6 }}>
          {pack.description}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: theme.text3 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <BookOpen size={10} />
            {pack.questionCount} întrebări
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <FolderPlus size={10} />
            Folder automat
          </span>
          <span>{pack.publishedAt}</span>
        </div>
      </div>

      {installed ? (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: `${theme.success}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Check size={16} color={theme.success} />
        </div>
      ) : installing ? (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <RefreshCw size={16} color={theme.accent} />
        </motion.div>
      ) : (
        <motion.button
          whileHover={calmMotion ? undefined : { scale: 1.03 }}
          whileTap={calmMotion ? undefined : { scale: 0.97 }}
          onClick={onInstall}
          className="w-full sm:w-auto"
          style={{
            padding: '9px 14px',
            borderRadius: 'var(--r-sm)',
            border: 'none',
            cursor: 'pointer',
            background: `linear-gradient(135deg, ${accent}, ${accent}CC)`,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            boxShadow: 'var(--elev-1)',
            flexShrink: 0,
          }}
        >
          Instalează
        </motion.button>
      )}
    </div>
  );
}

export default function UpdateModal() {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const titleId = useId();
  const {
    showUpdateModal, setShowUpdateModal,
    status, localVersion, manifest, downloadPercent, lastCheckedAt, error,
    checkForUpdate, downloadUpdate, applyUpdate, dismiss,
    installedContentIds, contentInstalling, setContentInstalling, markContentInstalled,
  } = useUpdateStore();
  const addQuiz = useQuizStore((s) => s.addQuiz);
  const { addFolder } = useFolderStore();

  const dialogRef = useFocusTrap(showUpdateModal, () => close());
  useScrollLock(showUpdateModal);
  const [contentError, setContentError] = useState<string | null>(null);
  const [rollbackWarning, setRollbackWarning] = useState<string | null>(null);

  const contentUpdates = manifest?.contentUpdates ?? [];
  const latestVersion = manifest?.latestVersion ?? manifest?.version ?? localVersion;
  const nextVersion = manifest?.version ?? localVersion;
  const hasSystemUpdate = ['available', 'downloading', 'ready', 'error'].includes(status);
  const hasContent = contentUpdates.length > 0;
  const canRefresh = status !== 'checking' && status !== 'downloading';
  const deliveryLabel = manifest?.delivery === 'native'
    ? 'Actualizare automată'
    : manifest?.delivery === 'installer'
      ? 'Pachet de instalare'
      : 'Actualizare locală';
  const checkedLabel = lastCheckedAt
    ? new Intl.DateTimeFormat('ro-RO', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      }).format(lastCheckedAt)
    : null;

  const close = () => {
    setShowUpdateModal(false);
    setContentError(null);
    setRollbackWarning(null);
  };

  const handleInstallContent = async (pack: ContentUpdate) => {
    setContentError(null);
    setRollbackWarning(null);
    setContentInstalling(pack.id);
    try {
      const rollbackSaved = saveRollbackSnapshot(
        useQuizStore.getState().quizzes,
        useQuizStore.getState().sessions,
        useFolderStore.getState().folders,
        `Înainte de instalare: ${pack.subject}`,
      );
      if (!rollbackSaved) {
        // Not a reason to block the install — but if it goes wrong, there is
        // no copy to restore from, and the user has to know that up front.
        setRollbackWarning('Nu am putut salva o copie de siguranță (spațiu de stocare plin) — dacă ceva nu merge după instalare, nu vei putea reveni automat.');
      }

      const data = await fetchContentPack(pack.url);
      const existingFolder = useFolderStore.getState().folders.find((f) => f.name.toLowerCase() === pack.subject.toLowerCase());
      const folderId = existingFolder?.id ?? addFolder(pack.subject, pack.emoji, pack.color);

      for (const q of data.quizzes ?? []) {
        const quiz: Quiz = {
          id: uid(),
          title: q.title ?? `${pack.subject} - Set`,
          description: q.description ?? '',
          emoji: pack.emoji,
          category: pack.subject.toLowerCase(),
          folderId,
          questions: (q.questions ?? []).map((qn) => ({
            ...(qn as object),
            id: uid(),
          })) as Quiz['questions'],
          createdAt: Date.now(),
          color: pack.color,
          tags: [pack.subject.toLowerCase()],
        };
        addQuiz(quiz);
      }

      markContentInstalled(pack.id);
    } catch (err: unknown) {
      setContentError(err instanceof Error ? err.message : 'Eroare la instalare');
    } finally {
      setContentInstalling(null);
    }
  };

  return (
    <Portal>
      <AnimatePresence>
        {showUpdateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: t.modal }}
            exit={{ opacity: 0, transition: t.modalExit }}
            onClick={close}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              background: 'var(--overlay)',
            }}
          >
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ opacity: 0, y: 8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: t.modal }}
              exit={{ opacity: 0, y: 8, scale: 0.985, transition: t.modalExit }}
              onClick={(e) => e.stopPropagation()}
              className="premium-modal"
              style={{
                width: '100%',
                maxWidth: 680,
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: 'var(--r-xl)',
                background: theme.modalBg,
                border: `1px solid ${theme.border}`,
                boxShadow: 'var(--elev-4)',
              }}
            >
              <div
                className="flex flex-wrap items-start gap-3 sm:flex-nowrap"
                style={{
                  padding: '22px 24px 18px',
                  borderBottom: `1px solid ${theme.border}`,
                  background: `linear-gradient(135deg, ${theme.accent}10 0%, transparent 60%)`,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--r-md)',
                    background: `linear-gradient(135deg, ${theme.accent}30, ${theme.accent2}30)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Package2 size={20} color={theme.accent} />
                </div>
                <div style={{ flex: 1 }}>
                  <h2 id={titleId} style={{ margin: 0, fontSize: 18, fontWeight: 800, color: theme.text }}>
                    Centru actualizări
                  </h2>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: theme.text3 }}>
                    Vezi clar versiunea curentă, următorul pas și ultima versiune publicată.
                  </p>
                  {checkedLabel && (
                    <div style={{ marginTop: 6, fontSize: 11, color: theme.text3 }}>
                      Ultima verificare: {checkedLabel}
                    </div>
                  )}
                </div>
                <motion.button
                  whileHover={calmMotion ? undefined : { scale: 1.05 }}
                  whileTap={calmMotion ? undefined : { scale: 0.97 }}
                  onClick={() => checkForUpdate()}
                  disabled={!canRefresh}
                  title="Verifică actualizările"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--r-sm)',
                    border: 'none',
                    cursor: canRefresh ? 'pointer' : 'not-allowed',
                    background: canRefresh ? theme.surface2 : `${theme.surface2}CC`,
                    color: canRefresh ? theme.text3 : theme.text3,
                    opacity: canRefresh ? 1 : 0.55,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {status === 'checking' ? (
                    <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                      <RefreshCw size={15} />
                    </motion.span>
                  ) : (
                    <RefreshCw size={15} />
                  )}
                </motion.button>
                <motion.button
                  whileTap={calmMotion ? undefined : { scale: 0.97 }}
                  onClick={close}
                  aria-label="Închide"
                  className="hover:bg-[var(--hover-fill)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    border: 'none',
                    cursor: 'pointer',
                    background: 'transparent',
                    color: theme.text3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={15} />
                </motion.button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 24px', minHeight: 0 }} className="custom-scrollbar sm:p-[20px_24px_24px]">
                <div className="mb-[18px] grid grid-cols-1 gap-[10px] sm:grid-cols-3">
                  <VersionPill label="Curentă" value={localVersion} tone={theme.text} />
                  <VersionPill label="Următoarea" value={nextVersion} tone={theme.accent} />
                  <VersionPill label="Ultima publicată" value={latestVersion} tone={theme.success} />
                </div>

                <div style={{ marginBottom: hasContent ? 28 : 0 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: theme.text3,
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <Package2 size={12} />
                    Actualizare Sistem
                  </div>

                  <AnimatePresence mode="wait">
                    {/* Error State */}
                    {status === 'error' && error && (
                      <motion.div key="error"
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                        style={{
                          background: `${theme.danger}0F`, border: `1px solid ${theme.danger}40`,
                          borderRadius: 'var(--r-md)', padding: '18px 20px',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <AlertCircle size={16} color={theme.danger} />
                          <span style={{ fontSize: 14, fontWeight: 700, color: theme.danger }}>
                            Eroare actualizare
                          </span>
                        </div>
                        <p style={{ margin: '0 0 14px', fontSize: 13, color: theme.text2 }}>{error}</p>
                        <button
                          onClick={() => { dismiss(); checkForUpdate(); }}
                          style={{
                            padding: '8px 16px', borderRadius: 'var(--r-sm)', border: `1px solid ${theme.danger}4D`,
                            background: `${theme.danger}14`, color: theme.danger,
                            cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          }}
                        >
                          Încearcă din nou
                        </button>
                      </motion.div>
                    )}

                    {/* Up to date State */}
                    {(status === 'up-to-date' || (status === 'idle' && !hasSystemUpdate)) && (
                      <motion.div key="up-to-date"
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                        style={{
                          background: `${theme.success}0D`, border: `1px solid ${theme.success}25`,
                          borderRadius: 'var(--r-md)', padding: '18px 20px',
                          display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                          background: `${theme.success}20`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Check size={18} color={theme.success} />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>
                            Aplicația este la zi
                          </div>
                          <div style={{ fontSize: 12, color: theme.text3, marginTop: 2 }}>
                            Versiunea {localVersion} este cea mai recentă.
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Wizard State */}
                    {(status === 'checking' || status === 'available' || status === 'downloading' || status === 'ready') && (
                      <motion.div key="wizard"
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        style={{
                           background: theme.surface2,
                           borderRadius: 'var(--r-md)',
                           padding: '24px',
                           border: `1px solid ${theme.border}`,
                        }}
                      >
                        {[
                          { id: 'checking', label: 'Verificare', icon: RefreshCw },
                          { id: 'available', label: 'Noua versiune', icon: Sparkles },
                          { id: 'downloading', label: 'Descărcare', icon: Download },
                          { id: 'ready', label: 'Finalizare', icon: RotateCcw }
                        ].map((step, idx, arr) => {
                          const currentIdx = status === 'checking' ? 0 : status === 'available' ? 1 : status === 'downloading' ? 2 : 3;
                          const isActive = idx === currentIdx;
                          const isDone = idx < currentIdx;
                          const isFuture = idx > currentIdx;

                          return (
                            <div key={step.id} style={{ display: 'flex', gap: 16, position: 'relative' }}>
                              {/* Connector line */}
                              {idx < arr.length - 1 && (
                                <div style={{
                                  position: 'absolute', left: 19, top: 40, bottom: -8, width: 2,
                                  background: theme.border, borderRadius: 2, zIndex: 0
                                }}>
                                  <motion.div
                                    initial={false}
                                    animate={{ scaleY: isDone ? 1 : 0 }}
                                    transition={calmMotion ? t.page : { duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
                                    style={{ width: '100%', height: '100%', background: theme.accent, borderRadius: 2, transformOrigin: 'top' }}
                                  />
                                </div>
                              )}

                              {/* Step Node */}
                              <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{
                                  width: 40, height: 40, borderRadius: '50%',
                                  background: isActive ? theme.accent : isDone ? theme.success : theme.surface,
                                  color: isActive || isDone ? '#fff' : theme.text3,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  boxShadow: isActive ? `0 0 0 4px ${theme.accent}33, var(--elev-1)` : 'var(--elev-1)',
                                  border: isFuture ? `1px solid ${theme.border}` : 'none',
                                  transition: 'background-color 0.3s ease, color 0.3s ease'
                                }}>
                                  {/* Pulse effect */}
                                  {isActive && !calmMotion && (
                                    <motion.div
                                      animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                      style={{ position: 'absolute', inset: -2, borderRadius: '50%', border: `2px solid ${theme.accent}` }}
                                    />
                                  )}
                                  {isDone ? <Check size={20} /> : <step.icon size={18} />}
                                </div>
                              </div>

                              {/* Content */}
                              <div style={{ flex: 1, paddingBottom: idx === arr.length - 1 ? 0 : 28, paddingTop: 8, opacity: isFuture ? 0.5 : 1 }}>
                                <div style={{ fontSize: 15, fontWeight: isActive ? 800 : 600, color: isActive ? theme.accent : theme.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                                   {step.label}
                                   {isActive && status === 'checking' && (
                                      <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                                         <RefreshCw size={12} color={theme.accent} />
                                      </motion.span>
                                   )}
                                </div>

                                <AnimatePresence mode="sync">
                                  {isActive && (
                                    <motion.div
                                      initial={{ opacity: 0, y: 4 }}
                                      animate={{ opacity: 1, y: 0, transition: t.pop }}
                                      exit={{ opacity: 0, transition: t.popExit }}
                                      style={{ marginTop: 12 }}
                                    >
                                      {/* --- Checking --- */}
                                      {status === 'checking' && (
                                        <div style={{ fontSize: 13, color: theme.text2 }}>
                                          Ne conectăm la server pentru a căuta cea mai nouă versiune...
                                        </div>
                                      )}

                                      {/* --- Available --- */}
                                      {status === 'available' && manifest && (
                                        <div style={{
                                           background: theme.surface, borderRadius: 'var(--r-sm)', padding: 16,
                                           border: `1px solid ${theme.border}`
                                        }}>
                                           <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                              <StatusDot color={theme.accent} />
                                              <span style={{ fontSize: 16, fontWeight: 800, color: theme.text }}>v{manifest.version}</span>
                                              <span style={{ fontSize: 12, color: theme.text3 }}>{manifest.releaseDate}</span>
                                              <span
                                                style={{
                                                  fontSize: 10,
                                                  fontWeight: 800,
                                                  textTransform: 'uppercase',
                                                  letterSpacing: '0.08em',
                                                  padding: '3px 8px',
                                                  borderRadius: 999,
                                                  background: `${theme.accent}16`,
                                                  color: theme.accentText,
                                                }}
                                              >
                                                {deliveryLabel}
                                              </span>
                                           </div>

                                           {manifest.changes?.length > 0 && (
                                             <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                               {manifest.changes.map((c, i) => (
                                                 <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: theme.text2, lineHeight: 1.5 }}>
                                                   <ChevronRight size={14} color={theme.accent} style={{ flexShrink: 0, marginTop: 2 }} />
                                                   {c}
                                                 </li>
                                               ))}
                                             </ul>
                                           )}

                                           {manifest.isSequential && (manifest.stepsRemaining ?? 0) > 1 && (
                                             <div style={{
                                               fontSize: 12, color: theme.warning, background: `${theme.warning}12`,
                                               border: `1px solid ${theme.warning}30`, borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: 16
                                             }}>
                                                Upgrade secvențial ({manifest.stepsRemaining} pași rămași până la ultima versiune).
                                             </div>
                                           )}

                                           <motion.button
                                             onClick={downloadUpdate}
                                             whileTap={calmMotion ? undefined : { scale: 0.97 }}
                                             style={{
                                               width: '100%', padding: '10px 16px', borderRadius: 'var(--r-sm)', border: 'none',
                                               cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff',
                                               background: theme.accent,
                                               display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                               boxShadow: 'var(--elev-1)',
                                             }}
                                           >
                                              <Download size={15} /> Începe descărcarea
                                           </motion.button>
                                        </div>
                                      )}

                                      {/* --- Downloading --- */}
                                      {status === 'downloading' && (
                                       <div style={{
                                           background: theme.surface, borderRadius: 'var(--r-sm)', padding: 16,
                                           border: `1px solid ${theme.border}`
                                        }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>Se descarcă pachetul...</span>
                                            <span style={{ fontSize: 13, fontWeight: 800, color: theme.accentText, fontFamily: 'monospace' }}>{downloadPercent}%</span>
                                          </div>
                                          <ProgressBar
                                            percent={downloadPercent}
                                            heightClass="h-1.5"
                                            track={theme.surface2}
                                            color={theme.accent}
                                            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                                            label="Descărcare actualizare"
                                          />
                                        </div>
                                      )}

                                      {/* --- Ready --- */}
                                      {status === 'ready' && (
                                        <div style={{
                                           background: `${theme.success}10`, borderRadius: 'var(--r-sm)', padding: 16,
                                           border: `1px solid ${theme.success}30`
                                        }}>
                                          <p style={{ margin: '0 0 16px', fontSize: 13, color: theme.text2 }}>
                                            Pachetul a fost descărcat cu succes. Repornește aplicația pentru a aplica modificările.
                                          </p>
                                          <motion.button
                                            onClick={applyUpdate}
                                            whileTap={calmMotion ? undefined : { scale: 0.97 }}
                                            style={{
                                              width: '100%', padding: '10px 16px', borderRadius: 'var(--r-sm)', border: 'none',
                                              cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff',
                                              background: `linear-gradient(135deg, ${theme.success}, ${theme.accent})`,
                                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                              boxShadow: 'var(--elev-1)',
                                            }}
                                          >
                                            <RotateCcw size={15} /> Repornește StudyX
                                          </motion.button>
                                        </div>
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {hasContent && (
                  <div>
                    <div style={{ height: 1, background: theme.border, marginBottom: 24 }} />
                    <div style={{ fontSize: 11, fontWeight: 700, color: theme.text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                      Conținut opțional
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {contentUpdates.map((pack) => (
                        <ContentPackCard
                          key={pack.id}
                          pack={pack}
                          installed={installedContentIds.includes(pack.id)}
                          installing={contentInstalling === pack.id}
                          onInstall={() => handleInstallContent(pack)}
                        />
                      ))}
                    </div>

                    {rollbackWarning && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: '12px 16px',
                          borderRadius: 'var(--r-sm)',
                          background: `${theme.warning}14`,
                          border: `1px solid ${theme.warning}33`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 13,
                          color: theme.warning,
                        }}
                      >
                        <AlertCircle size={14} />
                        {rollbackWarning}
                      </div>
                    )}

                    {contentError && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: '12px 16px',
                          borderRadius: 'var(--r-sm)',
                          background: `${theme.danger}14`,
                          border: `1px solid ${theme.danger}33`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 13,
                          color: theme.danger,
                        }}
                      >
                        <AlertCircle size={14} />
                        {contentError}
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: 16,
                        padding: '12px 16px',
                        borderRadius: 'var(--r-sm)',
                        background: theme.surface2,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                      }}
                    >
                      <ArrowDownCircle size={14} color={theme.text3} style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ margin: 0, fontSize: 12, color: theme.text3, lineHeight: 1.6 }}>
                        La instalarea unui pachet opțional se creează automat un folder pentru materie și se salvează un snapshot de rollback.
                      </p>
                    </div>
                  </div>
                )}

                {!hasContent && !hasSystemUpdate && status !== 'checking' && (
                  <div style={{ textAlign: 'center', padding: '14px 0 4px', fontSize: 13, color: theme.text3 }}>
                    {status === 'up-to-date'
                      ? 'Aplicația este deja la zi. Nu există conținut opțional disponibil momentan.'
                      : 'Nu există conținut opțional disponibil momentan.'}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
