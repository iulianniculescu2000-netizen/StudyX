import { Check, Repeat2 } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { fraction, useSceneTime, useTimeline } from '../film/useTimeline';
import MicroDemo from './MicroDemo';
import { Stage } from './stage';

const DURATION = 12_000;
const MARKS = [0, 3800, 8200] as const;
const CAPTIONS = [
  'Greșelile tale, grupate pe disciplină.',
  'Le repeți într-un test scurt, când apeși tu.',
  'După trei răspunsuri corecte la rând, greșeala se închide.',
] as const;
const TRANSCRIPT = 'Caietul de erori grupează greșelile pe disciplină, de exemplu Cardiologie, cu trei greșeli deschise. Apeși Repetă și pornești un test scurt. După trei răspunsuri corecte la rând la aceeași întrebare, greșeala se închide și dispare din lista curentă.';
const QUESTION = 'Prima conduită în tahicardia cu QRS larg și hipotensiune?';

function Row({ text, wrong }: { text: string; wrong: string }) {
  const theme = useTheme();
  return (
    <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: `1px solid ${theme.border}` }}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium" style={{ color: theme.text }}>{text}</div>
        <div className="text-[10.5px]" style={{ color: theme.text3 }}>{wrong}</div>
      </div>
    </div>
  );
}

function ListStage() {
  const theme = useTheme();
  const { elapsedMs } = useSceneTime();
  const press = Math.sin(fraction(elapsedMs, 2700, 700) * Math.PI);
  return (
    <Stage from={MARKS[0]} to={MARKS[1]} total={DURATION}>
      <div className="overflow-hidden rounded-[var(--r-md)]" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[12.5px] font-semibold" style={{ color: theme.text }}>Cardiologie · 3 greșeli</span>
          <span
            className="rounded-full px-3 py-1 text-[11px] font-semibold text-white"
            style={{ background: theme.accent, transform: `scale(${1 + press * 0.08})`, outline: press > 0 ? `${Math.round(press * 4)}px solid ${theme.accent}33` : undefined }}
          >
            Repetă 3
          </span>
        </div>
        <Row text={QUESTION} wrong="greșită de 3 ori" />
        <Row text="Criteriul de diagnostic al fibrilației atriale" wrong="greșită de 2 ori" />
      </div>
    </Stage>
  );
}

function PracticeStage() {
  const theme = useTheme();
  const filled = useTimeline([5200, 6400, 7600]);
  return (
    <Stage from={MARKS[1]} to={MARKS[2]} total={DURATION}>
      <div className="mb-2 flex items-center gap-1.5 text-[11px]" style={{ color: theme.text3 }}>
        <Repeat2 size={13} aria-hidden="true" /> Test scurt din greșelile tale
      </div>
      <div className="mb-3 text-[12.5px] font-semibold leading-snug" style={{ color: theme.text }}>{QUESTION}</div>
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="h-2.5 w-2.5 rounded-full" style={{ background: dot < filled ? theme.success : theme.fillSubtle }} />
        ))}
        <span className="text-[11px]" style={{ color: theme.text3 }}>{filled} din 3 răspunsuri corecte la rând</span>
      </div>
    </Stage>
  );
}

function ClosedStage() {
  const theme = useTheme();
  return (
    <Stage from={MARKS[2]} to={DURATION} total={DURATION}>
      <div className="flex items-center gap-3 rounded-[var(--r-md)] px-3 py-3" style={{ background: `${theme.success}14`, border: `1px solid ${theme.success}55` }}>
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full" style={{ background: theme.success, color: '#fff' }}><Check size={16} /></span>
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold" style={{ color: theme.text }}>{QUESTION}</div>
          <div className="text-[11px]" style={{ color: theme.text3 }}>Greșeală închisă. Cardiologie are acum 2 greșeli deschise.</div>
        </div>
      </div>
    </Stage>
  );
}

/** Caietul de erori în 12 secunde: lista, testul scurt și închiderea unei greșeli. */
export default function ErrorsDemo() {
  return (
    <MicroDemo label="Demonstrație: Caietul de erori" transcript={TRANSCRIPT} durationMs={DURATION} marks={MARKS} captions={CAPTIONS}>
      <ListStage />
      <PracticeStage />
      <ClosedStage />
    </MicroDemo>
  );
}
