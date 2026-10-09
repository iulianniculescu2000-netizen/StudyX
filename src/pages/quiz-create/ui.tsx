import { memo } from 'react';
import { Check, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Theme } from '../../theme/themes';

interface SortableQuestionTabProps {
  id: string;
  index: number;
  isActive: boolean;
  isValid: boolean;
  onClick: () => void;
  theme: Theme;
}

function SortableQuestionTabComponent({ id, index, isActive, isValid, onClick, theme }: SortableQuestionTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex-shrink-0 relative group"
    >
      <button
        onClick={onClick}
        aria-label={`Întrebarea ${index + 1}`}
        aria-current={isActive ? 'true' : undefined}
        className="w-9 h-9 rounded-xl text-sm font-medium transition-[background-color,border-color,color,opacity,transform]"
        style={{
          background: isActive ? `${theme.accent}20` : isValid ? `${theme.success}15` : theme.surface,
          border: `1px solid ${isActive ? theme.accent + '40' : 'transparent'}`,
          color: isActive ? theme.accent : isValid ? theme.success : theme.text3,
        }}
      >
        {index + 1}
      </button>
      <div
        {...attributes}
        {...listeners}
        className="absolute -top-1.5 -right-1.5 p-1 rounded-md cursor-[var(--cursor-grab,grab)] active:cursor-[var(--cursor-grabbing,grabbing)] opacity-0 group-hover:opacity-100 transition-[background-color,border-color,color,opacity,transform] touch-none"
        style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text3, zIndex: 10 }}
        title="Trage pentru a reordona"
        aria-label={`Reordonează întrebarea ${index + 1}`}
      >
        <GripVertical size={11} />
      </div>
    </div>
  );
}

export const SortableQuestionTab = memo(SortableQuestionTabComponent);

interface ToggleProps {
  value: boolean;
  onChange: () => void;
  label: string;
  theme: Theme;
}

export function Toggle({ value, onChange, label, theme }: ToggleProps) {
  return (
    <button
      onClick={onChange}
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm transition-[background-color,border-color,color,opacity,transform]"
      style={{
        background: value ? `${theme.accent}20` : theme.surface2,
        border: `1px solid ${value ? theme.accent + '40' : theme.border}`,
        color: value ? theme.accent : theme.text3,
      }}
    >
      <div
        className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
        style={{ borderColor: value ? theme.accent : theme.border2, background: value ? theme.accent : 'transparent' }}
      >
        {value && <Check size={9} className="text-white" />}
      </div>
      {label}
    </button>
  );
}

interface PanelProps {
  children: React.ReactNode;
  theme: Theme;
  style?: React.CSSProperties;
}

export function Panel({ children, theme, style }: PanelProps) {
  return (
    <div
      className="rounded-2xl p-5 transition-[background-color,border-color,color,opacity,transform] input-focus-draw"
      style={{ background: theme.surface, border: `1px solid ${theme.border}`, ...style }}
    >
      {children}
    </div>
  );
}

interface LabelProps {
  children: React.ReactNode;
  theme: Theme;
}

export function Label({ children, theme }: LabelProps) {
  return (
    <label className="text-sm font-medium" style={{ color: theme.text2 }}>
      {children}
    </label>
  );
}
