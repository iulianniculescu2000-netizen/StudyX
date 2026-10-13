import { BookOpen, Bookmark } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { fraction, useSceneTime, useTimeline } from '../film/useTimeline';
import MicroDemo from './MicroDemo';
import { Stage } from './stage';

const DURATION = 11_000;
const MARKS = [0, 3400, 6600] as const;
const CAPTIONS = [
  'După verificare citești explicația.',
  'Vezi în carte caută fragmentul abia când apeși.',
  'Se deschide fragmentul din cartea ta.',
] as const;
const TRANSCRIPT = 'După ce verifici răspunsul, sub explicație apare butonul Vezi în carte, dacă ai documente gata în bibliotecă. Apeși, aplicația caută un fragment potrivit, apoi îl deschide într-o fereastră, cu sursa lui. Dacă nu găsește nimic potrivit, îți spune asta.';

function Chip({ pressed, loading }: { pressed: number; loading: boolean }) {
  const theme = useTheme();
  return (
    <span
      className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold"
      style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.accentText, transform: `scale(${1 + pressed * 0.08})`, transformOrigin: 'left center' }}
    >
      <BookOpen size={12} aria-hidden="true" /> {loading ? 'Caut în bibliotecă…' : 'Vezi în carte'}
    </span>
  );
}

function ExplanationStage() {
  const theme = useTheme();
  const { elapsedMs } = useSceneTime();
  const press = Math.sin(fraction(elapsedMs, 2500, 600) * Math.PI);
  return (
    <Stage from={MARKS[0]} to={MARKS[1]} total={DURATION}>
      <div className="rounded-[var(--r-md)] p-3" style={{ background: `${theme.accent}0c`, border: `1px solid ${theme.accent}25` }}>
        <p className="m-0 text-[12px] leading-snug" style={{ color: theme.text2 }}>
          <span className="font-semibold" style={{ color: theme.accentText }}>Explicație: </span>
          Instabilitatea hemodinamică impune șoc electric sincronizat, nu tratament medicamentos.
        </p>
        <Chip pressed={press} loading={false} />
      </div>
    </Stage>
  );
}

function SearchStage() {
  const theme = useTheme();
  const dots = useTimeline([3900, 4400, 4900]);
  return (
    <Stage from={MARKS[1]} to={MARKS[2]} total={DURATION}>
      <div className="rounded-[var(--r-md)] p-3" style={{ background: `${theme.accent}0c`, border: `1px solid ${theme.accent}25` }}>
        <p className="m-0 text-[12px]" style={{ color: theme.text2 }}>Caut un fragment potrivit{'.'.repeat(dots)}</p>
        <Chip pressed={0} loading />
      </div>
    </Stage>
  );
}

function FragmentStage() {
  const theme = useTheme();
  return (
    <Stage from={MARKS[2]} to={DURATION} total={DURATION}>
      <div className="rounded-[var(--r-md)] p-3" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
        <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: theme.text }}>
          <BookOpen size={13} style={{ color: theme.accentText }} aria-hidden="true" /> Manualul tău · Aritmii
          <span className="rounded-full px-2 py-0.5 text-[9.5px]" style={{ background: `${theme.accent}18`, color: theme.accentText }}>Document relevant</span>
        </div>
        <div className="mt-2 rounded-[var(--r-sm)] px-2.5 py-2 text-[11.5px] leading-snug" style={{ background: theme.surface2, color: theme.text2 }}>
          <div className="mb-1 flex items-center gap-1 text-[9.5px] font-medium uppercase tracking-wide" style={{ color: theme.accentText }}>
            <Bookmark size={10} aria-hidden="true" /> Fragment extras din bibliografie
          </div>
          Tahicardia cu complexe largi și instabilitate hemodinamică se tratează prin cardioversie electrică sincronizată.
        </div>
      </div>
    </Stage>
  );
}

/** „Vezi în carte” în 11 secunde: explicația, căutarea la cerere și fragmentul deschis. */
export default function SourceDemo() {
  return (
    <MicroDemo label="Demonstrație: Vezi în carte" transcript={TRANSCRIPT} durationMs={DURATION} marks={MARKS} captions={CAPTIONS}>
      <ExplanationStage />
      <SearchStage />
      <FragmentStage />
    </MicroDemo>
  );
}
