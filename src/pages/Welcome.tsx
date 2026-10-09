import ThemeModeSwitcher from '../components/ThemeModeSwitcher';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, ChevronLeft } from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { useTheme } from '../theme/ThemeContext';
import Logo from '../components/Logo';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { dur, ease, spring } from '../theme/motion';

interface Props {
  onBack?: () => void;
}

// A few real first names to cycle through as the placeholder — a static
// "ex: Alexandru" read as a form field; a name that quietly changes every
// few seconds reads as an invitation, without ever competing with what the
// user is actually typing (only runs while the field is empty AND unfocused).
const NAME_EXAMPLES = ['Alexandru', 'Maria', 'Andrei', 'Ioana', 'Ștefan', 'Elena'];

export default function Welcome({ onBack }: Props) {
  const { setUsername } = useUserStore();
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const orbMotion = (animate: { x: number[]; y: number[] }, duration: number, delay = 0) =>
    calmMotion ? {} : { animate, transition: { duration, repeat: Infinity, ease: 'easeInOut' as const, delay } };
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [shake, setShake] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    if (name || inputFocused) return undefined;
    const id = window.setInterval(() => setPlaceholderIndex((i) => (i + 1) % NAME_EXAMPLES.length), 2200);
    return () => window.clearInterval(id);
  }, [name, inputFocused]);
  const handleNameSubmit = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 30) {
      setError(trimmed.length < 2 ? 'Cel puțin 2 caractere.' : 'Maxim 30 de caractere.');
      setShake(true);
      window.setTimeout(() => setShake(false), 420);
      return;
    }
    setError('');
    setUsername(trimmed);
  };

  const avatarLetter = name.trim().charAt(0).toUpperCase() || '?';
  const hasLetter = name.trim().length >= 1;

  return (
    <div className="min-h-screen flex flex-col items-center px-6 pt-12 pb-10 relative"
      style={{ background: theme.bg, overflowX: 'hidden' }}>
      {/* In the frameless Electron window the minimize/maximize/close buttons float at the top-right: sit to their left. */}
      <div className={`absolute top-5 z-20 ${window.electronAPI ? 'right-[156px]' : 'right-5'}`}>
        <ThemeModeSwitcher variant="compact" />
      </div>

      {/* Ambient orbs */}
      <motion.div className="absolute rounded-full pointer-events-none"
        style={{ width: 700, height: 700, top: '-25%', left: '-20%', background: `radial-gradient(circle, ${theme.orb1} 0%, transparent 65%)`, filter: 'blur(80px)' }}
        {...orbMotion({ x: [0, 40, 0], y: [0, -30, 0] }, 14)}
      />
      <motion.div className="absolute rounded-full pointer-events-none"
        style={{ width: 600, height: 600, bottom: '-15%', right: '-15%', background: `radial-gradient(circle, ${theme.orb2} 0%, transparent 65%)`, filter: 'blur(80px)' }}
        {...orbMotion({ x: [0, -30, 0], y: [0, 25, 0] }, 17, 3)}
      />
      <motion.div className="absolute rounded-full pointer-events-none"
        style={{ width: 400, height: 400, top: '40%', left: '60%', background: `radial-gradient(circle, ${theme.orb3} 0%, transparent 65%)`, filter: 'blur(60px)' }}
        {...orbMotion({ x: [0, 20, 0], y: [0, -15, 0] }, 10, 6)}
      />

      <div className="w-full max-w-md relative z-10">
        <AnimatePresence mode="wait">

          {/* ── Step 1: Name ──────────────────────────────────── */}
          {(
            <motion.div key="name"
              initial={calmMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: dur.slow, ease: ease.emphasized }}
            >
              {/* Back button (when adding a new profile) */}
              {onBack && (
                <motion.button
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold mb-6 hover:opacity-80 focus-ring"
                  style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text2 }}>
                  <ChevronLeft size={15} />Înapoi la profiluri
                </motion.button>
              )}

              {/* Logo + title */}
              <div className="text-center mb-8">
                <motion.div
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={spring.panel}
                  className="mx-auto mb-5 flex items-center justify-center"
                >
                  <Logo size={80} />
                </motion.div>
                <motion.h1
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-4xl font-bold tracking-tight mb-1.5"
                  style={{ color: theme.text }}>
                  Bun venit la <span style={{ color: theme.accentText }}>StudyX</span>
                </motion.h1>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                  style={{ color: theme.text2 }}>
                  Platforma ta de grile inteligente
                </motion.p>
              </div>

              {/* Card */}
              <motion.div
                initial={calmMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, x: shake && !calmMotion ? [0, -8, 8, -6, 6, -3, 3, 0] : 0 }}
                transition={shake ? { duration: 0.42, ease: 'easeInOut' } : { delay: 0.25 }}
                className="glass-panel rounded-[var(--r-lg)] p-6 mb-4"
                style={{ boxShadow: inputFocused ? 'var(--ring-focus)' : undefined }}>

                {/* Live avatar preview */}
                <div className="flex items-center gap-4 mb-5">
                  <div className="relative flex-shrink-0">
                    <AnimatePresence mode="wait">
                      {hasLetter ? (
                        <motion.div
                          key={avatarLetter}
                          initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
                          animate={{ scale: 1, opacity: 1, rotate: 0 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                          transition={spring.tap}
                          className="w-14 h-14 rounded-[var(--r-md)] flex items-center justify-center text-xl font-bold text-white"
                          style={{
                            background: theme.accent,
                            boxShadow: 'var(--elev-1)',
                          }}>
                          {avatarLetter}
                        </motion.div>
                      ) : (
                        <motion.div
                          key="placeholder"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1, scale: inputFocused ? 1.05 : 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ scale: spring.panel }}
                          className="w-14 h-14 rounded-[var(--r-md)] flex items-center justify-center"
                          style={{
                            background: theme.surface2,
                            border: `2px dashed ${inputFocused ? theme.accent : theme.border2}`,
                            transition: 'border-color 0.3s ease',
                          }}>
                          <span className="text-xl" style={{ opacity: 0.3 }}>?</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="flex-1 min-w-0">
                    <label htmlFor="welcome-name" className="text-xs font-semibold uppercase tracking-widest block mb-1.5"
                      style={{ color: inputFocused ? theme.accent : theme.text3, transition: 'color 0.25s ease' }}>
                      Cum te cheamă?
                    </label>
                    <div className="relative">
                      {/* Plain input, deliberately NOT remounted on placeholder cycling —
                          `autoFocus` re-fires on every mount, so swapping key here would
                          have stolen focus back every 2.2s even while the user was doing
                          something else entirely. The placeholder text just swaps in place. */}
                      <input
                        id="welcome-name"
                        type="text"
                        placeholder={`ex: ${NAME_EXAMPLES[placeholderIndex]}`}
                        value={name}
                        onChange={(e) => { setName(e.target.value); setError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                        onFocus={() => setInputFocused(true)}
                        onBlur={() => setInputFocused(false)}
                        autoFocus
                        className="w-full text-xl font-semibold bg-transparent"
                        style={{ color: theme.text, outline: 'none', border: 'none' }}
                      />
                      {/* Focus glow — grows from the center instead of a static line, so
                          typing reads as a live conversation with the field, not a form. */}
                      <motion.div
                        className="absolute -bottom-1 left-0 right-0 origin-center rounded-full"
                        style={{ height: 2, background: theme.accent }}
                        initial={false}
                        animate={{ scaleX: inputFocused ? 1 : 0, opacity: inputFocused ? 1 : 0 }}
                        transition={{ duration: 0.28, ease: ease.emphasized }}
                      />
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: theme.border, marginBottom: 16 }} />

                {/* Instant "this is really you" feedback, before the next screen even says it. */}
                <AnimatePresence mode="wait">
                  {name.trim().length >= 2 && !error && (
                    <motion.p
                      key="live-greeting"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="text-sm font-semibold mb-2"
                      style={{ color: theme.accentText }}>
                      Salut, {name.trim()}! Arată bine.
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Hint text */}
                <p className="text-xs" style={{ color: theme.text3 }}>
                  Numele tău va apărea în aplicație. Îl poți schimba oricând.
                </p>

                {error && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: theme.danger }}>
                    <AlertTriangle size={14} aria-hidden="true" />{error}
                  </motion.p>
                )}
              </motion.div>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                onClick={handleNameSubmit}
                
                whileTap={{ scale: 0.97 }}
                className="w-full py-4 rounded-[var(--r-md)] font-bold text-white flex items-center justify-center gap-2 transition-opacity focus-ring"
                style={{
                  background: theme.accent,
                  boxShadow: 'var(--elev-2)',
                  opacity: name.trim().length < 2 ? 0.45 : 1,
                }}>
                Intră în aplicație <ArrowRight size={18} />
              </motion.button>
            </motion.div>
          )}

          {/* ── Step 2: Theme ────────────────────────────────── */}

        </AnimatePresence>
      </div>
    </div>
  );
}
