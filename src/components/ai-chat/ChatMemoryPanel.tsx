import { useState } from 'react';
import { Brain, Pin, PinOff, Plus, Trash2, Check, X, Pencil } from 'lucide-react';
import ThemedSelect from '../ThemedSelect';
import { useTheme } from '../../theme/ThemeContext';
import {
  MEMORY_KINDS,
  MEMORY_KIND_LABEL,
  addMemoryManually,
  clearMemories,
  deleteMemory,
  isMemoryEnabled,
  loadMemories,
  setMemoryEnabled,
  updateMemory,
  type MemoryItem,
  type MemoryKind,
} from '../../ai/chatMemory';

/**
 * "What the assistant remembers about you" — the durable facts the chat picked up
 * from conversations. Everything is visible and editable here: pin what must never
 * be forgotten, fix what was misunderstood, delete what should not be kept, or
 * switch conversational memory off entirely.
 */
export default function ChatMemoryPanel({ profileId }: { profileId: string | null }) {
  const theme = useTheme();
  const [enabled, setEnabled] = useState(isMemoryEnabled);
  const [items, setItems] = useState<MemoryItem[]>(() => (profileId ? loadMemories(profileId) : []));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [newText, setNewText] = useState('');
  const [newKind, setNewKind] = useState<MemoryKind>('fact');
  const [confirmClear, setConfirmClear] = useState(false);

  if (!profileId) return null;

  const sorted = [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);

  const toggleEnabled = () => {
    const next = !enabled;
    setMemoryEnabled(next);
    setEnabled(next);
  };

  const startEdit = (item: MemoryItem) => {
    setEditingId(item.id);
    setEditText(item.text);
  };

  const saveEdit = () => {
    if (!editingId || !editText.trim()) return;
    setItems(updateMemory(profileId, editingId, { text: editText }));
    setEditingId(null);
  };

  const addNew = () => {
    if (newText.trim().length < 8) return;
    setItems(addMemoryManually(profileId, newKind, newText));
    setNewText('');
  };

  const iconButton = 'press-feedback flex h-7 w-7 items-center justify-center rounded-lg';

  return (
    <div
      className="mb-6 rounded-[var(--r-xl)] border p-4"
      style={{ borderColor: theme.border, background: 'var(--fill-subtle)' }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2" style={{ color: theme.text }}>
          <Brain size={14} />
          <span className="text-[11px] font-black uppercase tracking-[0.12em]">Memoria conversațiilor ({items.length})</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Memorie conversațională"
          onClick={toggleEnabled}
          className="press-feedback relative h-6 w-11 rounded-full"
          style={{ background: enabled ? theme.accent : theme.surface2, border: `1px solid ${theme.border}` }}
        >
          <span
            className="absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm"
            style={{ width: 18, height: 18, left: enabled ? 22 : 2, transition: 'left 0.2s var(--ease-out-soft)' }}
          />
        </button>
      </div>

      <p className="mb-3 text-[12px] leading-relaxed" style={{ color: theme.text3 }}>
        {enabled
          ? 'Asistentul reține din conversații ce e util pentru studiu (obiective, cum înveți, ce ți se pare greu) și le folosește ca să răspundă mai personal. Datele rămân pe dispozitiv; fragmentele relevante sunt trimise furnizorului AI în promptul unui răspuns.'
          : 'Memoria este oprită: asistentul nu mai reține nimic nou și nu folosește ce știe deja. Intrările de mai jos rămân salvate.'}
      </p>

      {sorted.length === 0 ? (
        <p className="mb-3 text-[12px] leading-relaxed" style={{ color: theme.text3 }}>
          Încă nu am reținut nimic. Vorbește cu asistentul despre examenul tău sau despre cum înveți și apar aici.
        </p>
      ) : (
        <ul className="mb-3 space-y-2">
          {sorted.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl p-3"
              style={{ background: theme.surface, border: `1px solid ${item.pinned ? theme.accent : theme.border}` }}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: theme.text3 }}>
                  {MEMORY_KIND_LABEL[item.kind]}
                </span>
                <div className="flex items-center gap-1">
                  {editingId === item.id ? (
                    <>
                      <button type="button" aria-label="Salvează" className={iconButton} style={{ color: theme.success }} onClick={saveEdit}><Check size={14} /></button>
                      <button type="button" aria-label="Anulează" className={iconButton} style={{ color: theme.text3 }} onClick={() => setEditingId(null)}><X size={14} /></button>
                    </>
                  ) : (
                    <>
                      <button type="button" aria-label={item.pinned ? 'Nu mai fixa' : 'Fixează'} title={item.pinned ? 'Nu mai fixa' : 'Fixează (nu se uită niciodată)'} className={iconButton} style={{ color: item.pinned ? theme.accent : theme.text3 }} onClick={() => setItems(updateMemory(profileId, item.id, { pinned: !item.pinned }))}>
                        {item.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                      </button>
                      <button type="button" aria-label="Editează" className={iconButton} style={{ color: theme.text3 }} onClick={() => startEdit(item)}><Pencil size={13} /></button>
                      <button type="button" aria-label="Șterge" className={iconButton} style={{ color: theme.danger }} onClick={() => setItems(deleteMemory(profileId, item.id))}><Trash2 size={13} /></button>
                    </>
                  )}
                </div>
              </div>
              {editingId === item.id ? (
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  maxLength={220}
                  rows={2}
                  className="w-full resize-none rounded-xl p-2 text-[13px] outline-none"
                  style={{ background: theme.surface2, color: theme.text, border: `1px solid ${theme.border}` }}
                />
              ) : (
                <p className="text-[13px] leading-relaxed" style={{ color: theme.text }}>{item.text}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[150px] flex-shrink-0">
          <ThemedSelect
            size="sm"
            value={newKind}
            onChange={(value) => setNewKind(value as MemoryKind)}
            options={MEMORY_KINDS.map((kind) => ({ value: kind, label: MEMORY_KIND_LABEL[kind] }))}
          />
        </div>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addNew(); }}
          maxLength={220}
          placeholder={"Adaugă ceva ce ar trebui să știe (ex. „Am examenul în iulie”)"}
          className="min-w-[180px] flex-1 rounded-xl px-3 py-2 text-[12px] outline-none"
          style={{ background: theme.surface, color: theme.text, border: `1px solid ${theme.border}` }}
        />
        <button
          type="button"
          onClick={addNew}
          disabled={newText.trim().length < 8}
          aria-label="Adaugă"
          className="press-feedback flex items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-black uppercase disabled:opacity-40"
          style={{ background: theme.accent, color: '#fff' }}
        >
          <Plus size={12} /> Adaugă
        </button>
      </div>

      {items.length > 0 && (
        <div className="mt-3 flex justify-end">
          {confirmClear ? (
            <div className="flex items-center gap-2 text-[11px]" style={{ color: theme.text2 }}>
              Ștergi toată memoria?
              <button type="button" className="press-feedback rounded-lg px-2.5 py-1 font-black uppercase" style={{ color: theme.danger, background: `${theme.danger}12`, border: `1px solid ${theme.danger}30` }} onClick={() => { clearMemories(profileId); setItems([]); setConfirmClear(false); }}>Da, șterge</button>
              <button type="button" className="press-feedback rounded-lg px-2.5 py-1 font-black uppercase" style={{ color: theme.text3 }} onClick={() => setConfirmClear(false)}>Nu</button>
            </div>
          ) : (
            <button type="button" className="press-feedback flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase" style={{ color: theme.danger, background: `${theme.danger}12`, border: `1px solid ${theme.danger}30` }} onClick={() => setConfirmClear(true)}>
              <Trash2 size={11} /> Șterge tot
            </button>
          )}
        </div>
      )}
    </div>
  );
}
