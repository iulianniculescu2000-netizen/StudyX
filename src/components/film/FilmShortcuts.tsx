import { ChevronUp, Keyboard } from 'lucide-react';
import { STAGE } from './stage';

const SHORTCUTS = [
  { keys: ['←', '→'], label: 'Schimbă scena' },
  { keys: ['1–7'], label: 'Alege o scenă' },
  { keys: ['Spațiu'], label: 'Pauză / continuă' },
  { keys: ['R'], label: 'Reia de la început' },
  { keys: ['Esc'], label: 'Închide filmul' },
];

export default function FilmShortcuts() {
  return <details className="group relative mx-auto mt-3 w-fit">
    <summary className="focus-ring flex cursor-pointer list-none items-center justify-center gap-2 rounded-full px-3 py-1 text-[10px] font-medium hover:text-white [&::-webkit-details-marker]:hidden"
      style={{ color: STAGE.text3 }}>
      <Keyboard size={13} aria-hidden="true" /> Comenzi rapide
      <ChevronUp size={11} aria-hidden="true" className="group-open:rotate-180" />
    </summary>
    <div className="absolute bottom-full left-1/2 z-10 mb-3 w-[260px] max-w-[80vw] -translate-x-1/2 rounded-[var(--r-lg)] border p-4"
      style={{ background: '#102036', borderColor: STAGE.line, boxShadow: 'var(--elev-3)' }}>
      <p className="mb-3 text-xs font-semibold" style={{ color: STAGE.text }}>Filmul, în ritmul tău</p>
      <dl className="space-y-3">{SHORTCUTS.map(({ keys, label }) => <div key={label} className="flex items-center justify-between gap-3">
        <dt className="text-[11px]" style={{ color: STAGE.text2 }}>{label}</dt>
        <dd className="flex gap-1">{keys.map((key) => <kbd key={key} className="min-w-6 rounded-md border px-1.5 py-1 text-center font-sans text-[10px]"
          style={{ background: STAGE.panelStrong, borderColor: STAGE.line, color: STAGE.text }}>{key}</kbd>)}</dd>
      </div>)}</dl>
    </div>
  </details>;
}
