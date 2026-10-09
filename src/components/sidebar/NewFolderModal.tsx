import { useId, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import ThemedSelect from '../ThemedSelect';
import { suggestFolderAppearance } from '../../lib/folderAppearance';
import type { QuizColor } from '../../types';
import { FOLDER_COLORS, FOLDER_EMOJIS } from './constants';

function buildFolderPath(folders: Array<{ id: string; name: string; parentId?: string | null }>, folderId: string) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  let current = byId.get(folderId);
  const guard = new Set<string>();

  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return names.join(' / ');
}

// Folder creation modal
export default function NewFolderModal({
  folders,
  initialParentId = null,
  onClose,
  onAdd,
}: {
  folders: Array<{ id: string; name: string; emoji: string; parentId?: string | null }>;
  initialParentId?: string | null;
  onClose: () => void;
  onAdd: (name: string, emoji: string, color: QuizColor, parentId?: string | null) => void;
}) {
  const theme = useTheme();
  const { t } = useAdaptiveMotion();
  const dialogRef = useFocusTrap(true, onClose);
  const titleId = useId();
  // A drag that starts inside the panel (selecting the typed name) and ends on the backdrop is not a click on it.
  const pressStartedOnBackdrop = useRef(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('\u{1F4C1}');
  const [color, setColor] = useState<QuizColor>('blue');
  const [parentId, setParentId] = useState<string>(initialParentId ?? '__root__');
  // Until the user picks an icon/color themselves, mirror a name-aware suggestion.
  const [appearanceTouched, setAppearanceTouched] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!appearanceTouched && value.trim()) {
      const suggestion = suggestFolderAppearance(value);
      setEmoji(suggestion.emoji);
      setColor(suggestion.color);
    }
  };

  // Always show the active emoji in the grid so a smart suggestion (e.g. ❤️) is highlighted.
  const emojiOptions = Array.from(new Set([emoji, ...FOLDER_EMOJIS]));

  const handleCreate = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), emoji, color, parentId === '__root__' ? null : parentId);
    onClose();
  };

  const canCreate = name.trim().length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => { pressStartedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && pressStartedOnBackdrop.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // Dim only: the panel inside already blurs its own backdrop. A second, nested
        // blur on this full-screen layer was re-rendered every frame of the open animation.
        background: 'var(--overlay)',
      }}
    >
      <motion.div
        initial={{ scale: 0.985, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.985, opacity: 0, y: 8 }}
        transition={t.modal}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="premium-modal"
        style={{
          borderRadius: 'var(--r-xl)',
          maxWidth: 420,
          width: '92%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 28px 18px', borderBottom: `1px solid ${theme.border}` }}>
          <div>
            <h3 id={titleId} style={{ margin: 0, fontSize: 18, fontWeight: 800, color: theme.text }}>Folder nou</h3>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: theme.text3 }}>Organizează-ți grilele în foldere</p>
          </div>
          <button 
            onClick={onClose}
            aria-label="Închide dialogul"
            className="press-feedback icon-pop"
            style={{ color: theme.text3, background: theme.surface2, border: 'none', cursor: 'pointer', padding: 8, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-7 pt-5 custom-scrollbar" style={{ minHeight: 0 }}>
          {/* Emoji picker */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Pictograma</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {emojiOptions.map((e) => (
                <button key={e} onClick={() => { setEmoji(e); setAppearanceTouched(true); }}
                  aria-label={`Alege pictograma ${e}`}
                  className="press-feedback"
                  style={{
                    width: 38, height: 38, borderRadius: 11, fontSize: 19,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: emoji === e ? `${theme.accent}22` : theme.surface2,
                    border: `1.5px solid ${emoji === e ? theme.accent + '55' : 'transparent'}`,
                    cursor: 'pointer', transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Culoare</div>
            <div style={{ display: 'flex', gap: 12, paddingLeft: 4 }}>
              {FOLDER_COLORS.map((c) => (
                <button key={c.id} onClick={() => { setColor(c.id); setAppearanceTouched(true); }}
                  aria-label={`Alege culoarea ${c.id}`}
                  className="press-feedback"
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: c.bg, border: 'none', cursor: 'pointer',
                    outline: color === c.id ? `3px solid ${c.bg}` : 'none',
                    outlineOffset: 3,
                    transform: color === c.id ? 'scale(1.1)' : 'scale(1)',
                    transition: 'transform var(--dur-base) var(--ease-emphasized), outline-color var(--dur-base) var(--ease-emphasized)',
                    boxShadow: color === c.id ? 'var(--elev-1)' : 'none',
                  }} />
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Nume folder</div>
            <input autoFocus data-autofocus value={name} onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Ex: Anatomie, Cardiologie..."
              className="focus-ring-premium"
              style={{
                width: '100%', padding: '14px 18px', borderRadius: 16, background: theme.surface2, border: `1px solid ${theme.border}`,
                color: theme.text, outline: 'none', fontSize: 14, fontWeight: 600,
              }} />
          </div>

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>În interiorul</div>
            <ThemedSelect
              value={parentId}
              onChange={setParentId}
              options={[
                { value: '__root__', label: 'Folder principal' },
                ...folders.map((folder) => ({
                  value: folder.id,
                  label: `${folder.emoji} ${buildFolderPath(folders, folder.id)}`,
                })),
              ]}
            />
          </div>

          <button onClick={handleCreate} disabled={!canCreate}
            className={`glow-pulse press-feedback ${canCreate ? 'accent-shadow-hover' : ''}`}
            style={{
              width: '100%', padding: '16px', borderRadius: 18, border: 'none', fontWeight: 900, fontSize: 14,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              cursor: canCreate ? 'pointer' : 'not-allowed', opacity: canCreate ? 1 : 0.5,
              background: theme.accent, color: '#fff',
              boxShadow: `0 12px 30px ${theme.accent}30`,
            }}>Creează folder</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
