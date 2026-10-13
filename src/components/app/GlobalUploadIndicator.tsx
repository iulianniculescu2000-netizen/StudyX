import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useVaultUploadStore } from '../../store/vaultUploadStore';
import { useTheme } from '../../theme/ThemeContext';
import { dur, ease } from '../../theme/motion';
import ProcessLoader from '../ui/ProcessLoader';

export default function GlobalUploadIndicator() {
  const theme = useTheme();
  const tasks = useVaultUploadStore((s) => s.tasks);
  const isMinimized = useVaultUploadStore((s) => s.isMinimized);
  const toggleMinimized = useVaultUploadStore((s) => s.toggleMinimized);
  const dismissTask = useVaultUploadStore((s) => s.dismissTask);
  const clearCompleted = useVaultUploadStore((s) => s.clearCompleted);

  const activeTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'error');
  const errorTasks = tasks.filter((t) => t.status === 'error');
  const isAllDone = activeTasks.length === 0 && tasks.length > 0;

  // Auto-dismiss: after all tasks are completed, show success for 3.5s and auto-vanish
  useEffect(() => {
    if (isAllDone && errorTasks.length === 0) {
      const timer = window.setTimeout(() => {
        clearCompleted();
      }, 3500);
      return () => window.clearTimeout(timer);
    }
  }, [isAllDone, errorTasks.length, clearCompleted]);

  if (tasks.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="upload-indicator-top-pill"
        initial={{ opacity: 0, y: -24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: dur.base, ease: ease.emphasized }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[9995] flex flex-col overflow-hidden rounded-[var(--r-lg)] glass-panel shadow-2xl"
        style={{
          width: isMinimized ? '310px' : '360px',
          maxWidth: 'calc(100vw - 32px)',
          background: theme.modalBg,
          borderColor: isAllDone ? `${theme.success}50` : `${theme.accent}40`,
          boxShadow: 'var(--elev-4)',
        }}
      >
        {/* Top Header Pill Bar */}
        <div
          className="flex items-center justify-between px-3.5 py-2.5 border-b select-none"
          style={{ borderColor: theme.border }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {activeTasks.length > 0 ? (
              <ProcessLoader variant="bio-orbit" size="sm" inline className="flex-shrink-0" />
            ) : errorTasks.length > 0 ? (
              <AlertCircle size={15} className="flex-shrink-0" style={{ color: theme.danger }} />
            ) : (
              <CheckCircle2 size={15} className="flex-shrink-0 animate-pulse" style={{ color: theme.success }} />
            )}
            <span
              className="text-[12px] font-bold truncate"
              style={{ color: isAllDone ? theme.success : theme.text }}
            >
              {activeTasks.length > 0
                ? `Indexare în fundal (${activeTasks.length})...`
                : errorTasks.length > 0
                ? 'Indexare cu erori'
                : 'Indexare finalizată'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleMinimized}
              aria-label={isMinimized ? 'Extinde detaliile' : 'Restrânge'}
              className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              style={{ color: theme.text3 }}
            >
              {isMinimized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
            <button
              type="button"
              onClick={clearCompleted}
              aria-label="Închide panoul"
              className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              style={{ color: theme.text3 }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Detailed task list when expanded */}
        {!isMinimized && (
          <div className="p-3 space-y-3 max-h-56 overflow-y-auto custom-scrollbar">
            {tasks.map((task) => {
              const isDone = task.status === 'completed';
              const isErr = task.status === 'error';
              const color = isErr ? theme.danger : isDone ? theme.success : theme.accent;

              return (
                <div key={task.id} className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold truncate max-w-[210px]" style={{ color: theme.text }}>
                        {task.fileName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[11px] font-mono font-medium" style={{ color: theme.text3 }}>
                        {isDone ? '100%' : `${task.progressPercent}%`}
                      </span>
                      {(isDone || isErr) && (
                        <button
                          type="button"
                          onClick={() => dismissTask(task.id)}
                          className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
                          style={{ color: theme.text3 }}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Animated Progress Bar */}
                  <div
                    className="w-full h-1.5 rounded-full overflow-hidden"
                    style={{ background: theme.surface2 }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: color }}
                      initial={false}
                      animate={{ width: `${isDone ? 100 : Math.max(5, task.progressPercent)}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>

                  <p className="text-[10.5px] truncate" style={{ color: isErr ? theme.danger : theme.text3 }}>
                    {isDone ? 'Gata! Disponibil în Biblioteca AI.' : task.stepText}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
