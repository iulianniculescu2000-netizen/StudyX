import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { FilePlus, Sparkles } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';

interface Props {
  onFilesDropped: (files: File[]) => void;
}

export default function DropzoneOverlay({ onFilesDropped }: Props) {
  const [active, setActive] = useState(false);
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types.includes('Files')) {
        setActive(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Only deactivate if leaving the window (relatedTarget is null)
      if (!e.relatedTarget) {
        setActive(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setActive(false);
      
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        onFilesDropped(Array.from(e.dataTransfer.files));
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [onFilesDropped]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: t.modal }}
          exit={{ opacity: 0, transition: t.modalExit }}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-6 sm:p-10 pointer-events-none"
          style={{
            background: 'var(--overlay)',
            backdropFilter: 'blur(var(--blur-1))',
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: t.modal }}
            exit={{ opacity: 0, y: 8, scale: 0.985, transition: t.modalExit }}
            className="w-full max-w-lg p-10 sm:p-16 rounded-[48px] border-4 border-dashed text-center flex flex-col items-center gap-8"
            style={{
              background: theme.modalBg,
              borderColor: theme.accent,
              boxShadow: 'var(--elev-4), var(--glow-2)',
            }}
          >
            <motion.div
              animate={calmMotion ? undefined : {
                y: [0, -20, 0],
                rotate: [0, 5, -5, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
              className="w-28 h-28 rounded-[var(--r-xl)] flex items-center justify-center"
              style={{
                background: theme.accent,
                color: '#fff',
                boxShadow: 'var(--elev-3)',
              }}
            >
              <FilePlus size={56} />
            </motion.div>
            
            <div className="space-y-3">
              <h2 className="text-4xl font-black tracking-tight" style={{ color: theme.text }}>
                Import <span style={{ color: theme.accentText }}>Inteligent</span>
              </h2>
              <p className="text-lg font-medium opacity-60 max-w-xs mx-auto leading-relaxed" style={{ color: theme.text }}>
                Eliberează fișierele aici pentru a le indexa în Biblioteca AI.
              </p>
            </div>

            <div className="flex gap-3 flex-wrap justify-center">
              {[
                { label: 'PDF / Word', color: theme.accentText },
                { label: 'OCR Medical', color: '#FF9F0A' },
                { label: 'RAG Indexing', color: theme.success }
              ].map(chip => (
                <span key={chip.label} className="elev-1 px-5 py-2 rounded-[var(--r-md)] text-[10px] font-black uppercase tracking-[0.15em]"
                  style={{ background: `${chip.color}15`, color: chip.color, border: `1px solid ${chip.color}30` }}>
                  {chip.label}
                </span>
              ))}
            </div>

            <div className="absolute bottom-8 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-40" style={{ color: theme.text }}>
              <Sparkles size={12} />
              StudyX Smart Engine v2
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
