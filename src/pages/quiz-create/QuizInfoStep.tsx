import { motion } from 'framer-motion';
import { Check, Scale, Tag, X } from 'lucide-react';
import type { Folder, QuizColor } from '../../types';
import type { Theme } from '../../theme/themes';
import { CATEGORIES, COLORS, EMOJIS } from './helpers';
import { Label, Panel, Toggle } from './ui';
import HelpTip from '../../components/ui/HelpTip';
import FolderTargetPicker from './FolderTargetPicker';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { dur, ease, press } from '../../theme/motion';

interface QuizInfoStepProps {
  canProceed: boolean;
  category: string;
  color: QuizColor;
  description: string;
  emoji: string;
  folders: Folder[];
  penaltyMode: boolean;
  selectedFolderId: string;
  shakeFields: string[];
  shuffleAnswers: boolean;
  shuffleQuestions: boolean;
  tagInput: string;
  tags: string[];
  theme: Theme;
  title: string;
  onAddTag: () => void;
  onCategoryChange: (category: string) => void;
  onColorChange: (color: QuizColor) => void;
  onContinue: () => void;
  onDescriptionChange: (value: string) => void;
  onEmojiChange: (emoji: string) => void;
  onFolderChange: (folderId: string) => void;
  onPenaltyModeToggle: () => void;
  onRemoveTag: (tag: string) => void;
  onShuffleAnswersToggle: () => void;
  onShuffleQuestionsToggle: () => void;
  onTagInputChange: (value: string) => void;
  onTitleChange: (value: string) => void;
}

export function QuizInfoStep({
  canProceed,
  category,
  color,
  description,
  emoji,
  folders,
  penaltyMode,
  selectedFolderId,
  shakeFields,
  shuffleAnswers,
  shuffleQuestions,
  tagInput,
  tags,
  theme,
  title,
  onAddTag,
  onCategoryChange,
  onColorChange,
  onContinue,
  onDescriptionChange,
  onEmojiChange,
  onFolderChange,
  onPenaltyModeToggle,
  onRemoveTag,
  onShuffleAnswersToggle,
  onShuffleQuestionsToggle,
  onTagInputChange,
  onTitleChange,
}: QuizInfoStepProps) {
  const { t, calmMotion } = useAdaptiveMotion();
  return (
    <motion.div
      key="info"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={t.page}
      className="space-y-4"
    >
      <Panel theme={theme}>
        <Label theme={theme}>Emoji</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {EMOJIS.map((item) => (
            <button
              key={item}
              onClick={() => onEmojiChange(item)}
              aria-label={`Alege emoji ${item}`}
              aria-pressed={emoji === item}
              className="w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-[background-color,border-color,color,opacity,transform]"
              style={{
                background: emoji === item ? `${theme.accent}20` : theme.surface2,
                border: `1px solid ${emoji === item ? `${theme.accent}40` : 'transparent'}`,
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </Panel>

      <Panel theme={theme}>
        <Label theme={theme}>Culoare temă</Label>
        <div className="flex gap-2 mt-2">
          {COLORS.map((item) => (
            <button
              key={item.id}
              onClick={() => onColorChange(item.id)}
              aria-label={item.label}
              aria-pressed={color === item.id}
              className="w-10 h-10 rounded-xl transition-[background-color,border-color,color,opacity,transform] flex items-center justify-center"
              style={{
                background: item.bg,
                outline: color === item.id ? `2px solid ${theme.text}` : 'none',
                outlineOffset: '2px',
              }}
            >
              {color === item.id && <Check size={14} className="text-white" />}
            </button>
          ))}
        </div>
      </Panel>

      <motion.div
        data-tutorial="create-title"
        animate={shakeFields.includes('title') ? { x: [0, -10, 10, -8, 8, -4, 0] } : { x: 0 }}
        transition={calmMotion ? { duration: dur.instant } : { duration: dur.slow, ease: ease.standard }}
      >
        <Panel theme={theme} style={{ border: shakeFields.includes('title') ? `1px solid ${theme.danger}` : undefined }}>
          <Label theme={theme}>Titlu *</Label>
          <input
            type="text"
            placeholder="ex: Capitalele Europei"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            className="input-bare mt-1 w-full text-lg font-medium"
            style={{ color: theme.text, outline: 'none', border: 'none' }}
          />
        </Panel>
      </motion.div>

      <motion.div
        animate={shakeFields.includes('desc') ? { x: [0, -10, 10, -8, 8, -4, 0] } : { x: 0 }}
        transition={calmMotion ? { duration: dur.instant } : { duration: dur.slow, ease: ease.standard }}
      >
        <Panel theme={theme} style={{ border: shakeFields.includes('desc') ? `1px solid ${theme.danger}` : undefined }}>
          <Label theme={theme}>Descriere (opțional)</Label>
          <textarea
            placeholder="Descrie pe scurt conținutul grilei..."
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            rows={3}
            className="input-bare mt-1 w-full resize-none text-sm"
            style={{ color: theme.text, outline: 'none', border: 'none' }}
          />
        </Panel>
      </motion.div>

      <Panel theme={theme}>
        <Label theme={theme}>Categorie</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              onClick={() => onCategoryChange(item)}
              className="px-3 py-1.5 rounded-full text-sm transition-[background-color,border-color,color,opacity,transform]"
              style={{
                background: category === item ? `${theme.accent}20` : theme.surface2,
                border: `1px solid ${category === item ? `${theme.accent}40` : theme.border}`,
                color: category === item ? theme.accent : theme.text2,
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </Panel>

      <Panel theme={theme}>
        <Label theme={theme}>Folder țintă</Label>
        <FolderTargetPicker
          folders={folders}
          value={selectedFolderId}
          theme={theme}
          onChange={onFolderChange}
        />
      </Panel>

      <Panel theme={theme}>
        <Label theme={theme}>Etichete opționale</Label>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: `${theme.accent}18`, color: theme.accentText, border: `1px solid ${theme.accent}30` }}
            >
              {tag}
              <button onClick={() => onRemoveTag(tag)} aria-label={`Elimină eticheta ${tag}`}>
                <X size={10} />
              </button>
            </span>
          ))}
          <div
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs"
            style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}
          >
            <Tag size={10} style={{ color: theme.text3 }} />
            <input
              type="text"
              placeholder="Adaugă etichetă..."
              value={tagInput}
              onChange={(event) => onTagInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault();
                  onAddTag();
                }
              }}
              className="input-bare w-28"
              style={{ color: theme.text, border: 'none' }}
            />
          </div>
        </div>
      </Panel>

      <div data-tutorial="create-options">
      <Panel theme={theme}>
        <Label theme={theme}>Opțiuni grilă</Label>
        <div className="flex gap-2 mt-2 flex-wrap">
          <Toggle
            value={shuffleQuestions}
            onChange={onShuffleQuestionsToggle}
            theme={theme}
            label="Amestecă întrebările"
          />
          <Toggle
            value={shuffleAnswers}
            onChange={onShuffleAnswersToggle}
            theme={theme}
            label="Amestecă răspunsurile"
          />
        </div>
        <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
          <div className="mb-2 flex items-center gap-1.5 text-xs" style={{ color: theme.text3 }}>Notare medicală <HelpTip id="create-penalty" size={16} /></div>
          <button
            onClick={onPenaltyModeToggle}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm transition-[background-color,border-color,color,opacity,transform]"
            style={{
              background: penaltyMode ? `${theme.danger}1f` : theme.surface2,
              border: `1px solid ${penaltyMode ? `${theme.danger}66` : theme.border}`,
              color: penaltyMode ? '#ef4444' : theme.text3,
            }}
          >
            <Scale size={13} />
            Mod Rezidențiat
            {penaltyMode && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                style={{ background: `${theme.danger}26`, color: theme.danger }}
              >
                -0.25/greșit
              </span>
            )}
          </button>
          {penaltyMode && (
            <p className="text-xs mt-1.5" style={{ color: theme.text3 }}>
              Răspuns corect: +1 punct. Opțiune greșită selectată: -0.25 puncte. Scorul net nu poate coborî sub 0.
            </p>
          )}
        </div>
      </Panel>
      </div>

      <motion.button
        onClick={onContinue}
        whileTap={calmMotion ? undefined : press.whileTap}
        className="w-full py-3.5 rounded-2xl font-semibold text-white"
        style={{
          background: theme.accent,
          opacity: canProceed ? 1 : 0.6,
        }}
      >
        Continuă și adaugă întrebări
      </motion.button>
      {!canProceed && (
        <p role="status" className="text-center text-xs" style={{ color: theme.text3 }}>Completează titlul pentru a continua.</p>
      )}
    </motion.div>
  );
}
