import ThemeModeSwitcher from '../components/ThemeModeSwitcher';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, Plus, X, Sparkles } from 'lucide-react';
import { useUserStore, type Profile } from '../store/userStore';
import { useTheme } from '../theme/ThemeContext';
import type { Theme } from '../theme/themes';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { dur, ease, spring } from '../theme/motion';

interface Props {
  onAddNew: () => void;
}

export default function ProfileSelect({ onAddNew }: Props) {
  const { profiles, switchProfile, removeProfile } = useUserStore();
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Auto-select first profile on Enter if only one
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.target === e.currentTarget && profiles.length === 1 && !selectedId) {
      handleSelect(profiles[0].id);
    }
  };

  const handleSelect = (id: string) => {
    if (selectedId) return;
    if (confirmRemoveId === id) {
      setConfirmRemoveId(null);
      return;
    }
    setSelectedId(id);
    setTimeout(() => switchProfile(id), 380);
  };

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmRemoveId !== id) {
      setConfirmRemoveId(id);
      return;
    }
    setConfirmRemoveId(null);
    setRemovingId(id);
    setTimeout(() => removeProfile(id), 280);
  };

  // Săgețile stânga/dreapta mută focusul între profile (și „Profil nou”).
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const items = Array.from(row.querySelectorAll<HTMLElement>('[data-profile-item]'));
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (index === -1) return;
      event.preventDefault();
      const next = items[(index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
      next?.focus();
    };
    row.addEventListener('keydown', onKey);
    return () => row.removeEventListener('keydown', onKey);
  }, []);

  const orbMotion = (animate: { x: number[]; y: number[] }, duration: number, delay = 0) =>
    calmMotion
      ? {}
      : { animate, transition: { duration, repeat: Infinity, ease: 'easeInOut' as const, delay } };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden select-none"
      style={{ background: theme.bg }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* In the frameless Electron window the minimize/maximize/close buttons float at the top-right: sit to their left. */}
      <div className={`absolute top-5 z-20 ${window.electronAPI ? 'right-[156px]' : 'right-5'}`}>
        <ThemeModeSwitcher variant="compact" />
      </div>
      {/* Ambient orbs (statice sub calmMotion) */}
      <motion.div className="absolute rounded-full pointer-events-none"
        style={{ width: 700, height: 700, top: '-20%', left: '-15%', background: `radial-gradient(circle, ${theme.orb1}, transparent 65%)`, filter: 'blur(90px)', opacity: 0.7 }}
        {...orbMotion({ x: [0, 30, 0], y: [0, -20, 0] }, 16)}
      />
      <motion.div className="absolute rounded-full pointer-events-none"
        style={{ width: 600, height: 600, bottom: '-18%', right: '-12%', background: `radial-gradient(circle, ${theme.orb2}, transparent 65%)`, filter: 'blur(90px)', opacity: 0.6 }}
        {...orbMotion({ x: [0, -22, 0], y: [0, 22, 0] }, 19, 4)}
      />

      <div className="relative z-10 flex flex-col items-center px-8">

        {/* Logo */}
        <motion.div
          initial={calmMotion ? false : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur.slow, ease: ease.emphasized }}
          className="mb-14 text-center"
        >
          <motion.div
            initial={calmMotion ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={spring.panel}
            className="w-14 h-14 rounded-[var(--r-md)] mx-auto mb-5 flex items-center justify-center text-2xl"
            style={{
              background: theme.accent,
              boxShadow: 'var(--elev-2)',
            }}>
            <BookOpen size={28} color="#fff" aria-hidden="true" />
          </motion.div>
          <h1 className="text-3xl font-bold tracking-tight mb-1.5" style={{ color: theme.text }}>
            StudyX
          </h1>
          <p className="text-sm" style={{ color: theme.text3 }}>Selectează profilul tău</p>
        </motion.div>

        {/* Profiles row */}
        <div ref={rowRef} role="group" aria-label="Profiluri" className="flex items-start gap-8 mb-14 flex-wrap justify-center">
          {profiles.map((profile, i) => (
            <ProfileAvatar
              key={profile.id}
              profile={profile}
              index={i}
              isHovered={hovered === profile.id}
              isSelected={selectedId === profile.id}
              isRemoving={removingId === profile.id}
              isConfirmingRemove={confirmRemoveId === profile.id}
              onHover={(id) => {
                setHovered(id);
                if (id === null) setConfirmRemoveId(null);
              }}
              onSelect={handleSelect}
              onRemove={handleRemove}
              theme={theme}
              calmMotion={calmMotion}
            />
          ))}

          {/* Add new profile */}
          <motion.div
            initial={calmMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: calmMotion ? 0 : Math.min(profiles.length, 8) * 0.04, duration: dur.slow, ease: ease.emphasized }}
            className="flex flex-col items-center gap-3"
            onMouseEnter={() => setHovered('__new__')}
            onMouseLeave={() => setHovered(null)}
          >
            <button
              type="button"
              data-profile-item
              aria-label="Adaugă un profil nou"
              onClick={onAddNew}
              onFocus={() => setHovered('__new__')}
              onBlur={() => setHovered(null)}
              className="focus-ring flex flex-col items-center gap-3 rounded-[var(--r-lg)] p-1"
            >
              <motion.div
                animate={{ y: hovered === '__new__' && !calmMotion ? -3 : 0 }}
                transition={{ duration: dur.fast, ease: ease.standard }}
                className="w-[72px] h-[72px] rounded-full flex items-center justify-center"
                style={{
                  background: theme.surface,
                  border: `2px dashed ${hovered === '__new__' ? theme.accent : theme.border2}`,
                  color: hovered === '__new__' ? theme.accent : theme.text3,
                  transition: 'border-color 0.2s, color 0.2s',
                }}>
                <Plus size={26} strokeWidth={1.5} aria-hidden="true" />
              </motion.div>
              <span
                className="text-xs font-medium text-center"
                style={{ color: theme.text2, opacity: hovered === '__new__' ? 1 : 0.7 }}>
                Profil nou
              </span>
            </button>
          </motion.div>
        </div>

        {/* Bottom hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: calmMotion ? 0 : 0.5 }}
          className="flex items-center gap-1.5 text-xs"
          style={{ color: theme.text3 }}>
          <Sparkles size={11} aria-hidden="true" />
          <span>Alege un profil pentru a intra · săgețile mută selecția</span>
        </motion.div>
      </div>
    </div>
  );
}

function ProfileAvatar({ profile, index, isHovered, isSelected, isRemoving, isConfirmingRemove, onHover, onSelect, onRemove, theme, calmMotion }: {
  profile: Profile;
  index: number;
  isHovered: boolean;
  isSelected: boolean;
  isRemoving: boolean;
  isConfirmingRemove: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onRemove: (e: React.MouseEvent, id: string) => void;
  theme: Theme;
  calmMotion: boolean;
}) {
  const accentColor = theme.accent;

  return (
    <motion.div
      initial={calmMotion ? false : { opacity: 0, y: 16 }}
      animate={{
        opacity: isRemoving ? 0 : 1,
        y: isRemoving ? -16 : 0,
        scale: isRemoving ? 0.9 : 1,
      }}
      transition={{ delay: calmMotion ? 0 : Math.min(index, 8) * 0.04, duration: isRemoving ? dur.fast : dur.slow, ease: ease.emphasized }}
      className="flex flex-col items-center relative"
      onMouseEnter={() => onHover(profile.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(profile.id)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHover(null);
      }}
    >
      <button
        type="button"
        data-profile-item
        aria-label={`Intră în profilul ${profile.username}`}
        onClick={() => onSelect(profile.id)}
        className="focus-ring flex flex-col items-center gap-3 rounded-[var(--r-lg)] p-1 cursor-pointer"
      >
        {/* Avatar */}
        <motion.div
          animate={{
            scale: isSelected ? 1.04 : isHovered ? 1.02 : 1,
            y: isHovered && !isSelected && !calmMotion ? -3 : 0,
          }}
          transition={{ duration: dur.fast, ease: ease.standard }}
          className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center"
          style={{
            background: profile.gradient,
            boxShadow: 'var(--elev-1)',
          }}>
          <span className="text-2xl font-black text-white select-none"
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            {profile.username.charAt(0).toUpperCase()}
          </span>

          {/* Theme ring */}
          <div className="absolute inset-0 rounded-full"
            style={{
              border: `2px solid ${accentColor}`,
              opacity: isHovered ? 0.55 : 0.2,
              transition: 'opacity 0.2s',
            }} />

          {/* Selected pulse ring */}
          <AnimatePresence>
            {isSelected && !calmMotion && (
              <motion.div
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ duration: dur.slow, ease: ease.standard }}
                className="absolute inset-0 rounded-full"
                style={{ background: accentColor }}
              />
            )}
          </AnimatePresence>
        </motion.div>

        {/* Name */}
        <span
          className="inline-block text-sm font-semibold text-center max-w-[84px] truncate"
          style={{ color: theme.text, opacity: isHovered ? 1 : 0.7, transition: 'opacity 0.18s' }}>
          {profile.username}
        </span>

        {/* Theme accent line */}
        <div
          className="h-0.5 rounded-full"
          style={{ background: accentColor, width: 28, transform: `scaleX(${isHovered ? 1 : 0.57})`, opacity: isHovered ? 1 : 0.4, transition: 'opacity 0.2s, transform 0.2s' }}
        />
      </button>

      {/* Remove button */}
      <AnimatePresence>
        {(isHovered || isConfirmingRemove) && !isSelected && (
          <motion.button
            type="button"
            data-profile-item
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: dur.fast, ease: ease.snap }}
            onClick={(e) => onRemove(e, profile.id)}
            title={isConfirmingRemove ? 'Confirmă: grilele, notițele și statisticile acestui profil se șterg definitiv' : 'Șterge profilul'}
            aria-label={isConfirmingRemove ? `Confirmă ștergerea profilului ${profile.username}: toate datele lui se șterg definitiv` : `Șterge profilul ${profile.username}`}
            className="focus-ring absolute -top-2 z-20 flex items-center justify-center rounded-full"
            style={{
              right: isConfirmingRemove ? -12 : -6,
              height: 20,
              minWidth: isConfirmingRemove ? undefined : 20,
              padding: isConfirmingRemove ? '0 10px' : 0,
              background: theme.danger,
              color: 'white',
              boxShadow: 'var(--elev-1)',
              fontSize: 10,
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}>
            {isConfirmingRemove ? 'Șterge tot?' : <X size={10} strokeWidth={3} aria-hidden="true" />}
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
