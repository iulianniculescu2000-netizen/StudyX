import { Check } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { fraction, useSceneTime, useTyped } from '../film/useTimeline';
import MicroDemo from './MicroDemo';
import { Stage } from './stage';

const DURATION = 12_000;
const MARKS = [0, 3600, 8200] as const;
const CAPTIONS = [
  'Ceri în română, cu cuvintele tale.',
  'Cartea de opțiuni te lasă să alegi subiectul, nivelul, numărul și folderul.',
  'Generarea pornește doar după confirmarea ta.',
] as const;
const TRANSCRIPT = 'Scrii în chat: fă-mi 30 de grile despre artrita reumatoidă. Apare o carte de opțiuni cu subiectul, nivelul, numărul de grile și folderul. Apeși Generează 30 de grile, iar la final chatul spune că sunt gata și îți oferă butonul Rezolvă acum.';
const REQUEST = 'fă-mi 30 de grile despre artrita reumatoidă';

function Field({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] font-medium uppercase tracking-wide" style={{ color: theme.text3 }}>{label}</div>
      <div className="truncate rounded-[var(--r-sm)] px-2 py-1 text-[11.5px]" style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}>{value}</div>
    </div>
  );
}

function RequestStage() {
  const theme = useTheme();
  const typed = useTyped(REQUEST, 400, false, 60);
  return (
    <Stage from={MARKS[0]} to={MARKS[1]} total={DURATION}>
      <div className="ml-auto max-w-[88%] rounded-[var(--r-md)] px-3 py-2 text-[12.5px] text-white" style={{ background: theme.accent }}>
        {typed}<span aria-hidden="true">|</span>
      </div>
    </Stage>
  );
}

function CardStage() {
  const theme = useTheme();
  const { elapsedMs } = useSceneTime();
  const press = Math.sin(fraction(elapsedMs, 7300, 700) * Math.PI);
  return (
    <Stage from={MARKS[1]} to={MARKS[2]} total={DURATION}>
      <div className="rounded-[var(--r-md)] p-2.5" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
          <Field label="Subiect" value="artrita reumatoidă" />
          <Field label="Nivel" value="Automat" />
          <Field label="Câte grile" value="30" />
          <Field label="Se salvează în" value="Automat, pe specialitate" />
        </div>
        <div
          className="mt-2.5 inline-block rounded-full px-3.5 py-1 text-[11.5px] font-semibold text-white"
          style={{ background: theme.accent, transform: `scale(${1 + press * 0.06})`, transformOrigin: 'left center' }}
        >
          Generează 30 de grile
        </div>
      </div>
    </Stage>
  );
}

function DoneStage() {
  const theme = useTheme();
  return (
    <Stage from={MARKS[2]} to={DURATION} total={DURATION}>
      <div className="rounded-[var(--r-md)] p-3" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
        <div className="flex items-start gap-2 text-[12px]" style={{ color: theme.text2 }}>
          <Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: theme.success }} aria-hidden="true" />
          <span>Gata: 30 de grile despre „artrita reumatoidă”, automat, pe specialitate.</span>
        </div>
        <div className="mt-2.5 inline-block rounded-full px-3.5 py-1 text-[11.5px] font-semibold text-white" style={{ background: theme.accent }}>Rezolvă acum</div>
      </div>
    </Stage>
  );
}

/** O cerere de grile din chat, în 12 secunde: mesajul, cartea de opțiuni și rezultatul. */
export default function ChatRequestDemo() {
  return (
    <MicroDemo label="Demonstrație: cerere de grile în chat" transcript={TRANSCRIPT} durationMs={DURATION} marks={MARKS} captions={CAPTIONS} height={164}>
      <RequestStage />
      <CardStage />
      <DoneStage />
    </MicroDemo>
  );
}
