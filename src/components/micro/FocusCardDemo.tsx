import { Check, RotateCcw, Target } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { fraction, useCountTo, useSceneTime } from '../film/useTimeline';
import MicroDemo from './MicroDemo';

const DURATION = 11_000;
const MARKS = [0, 3600, 7200] as const;
const CAPTIONS = [
  'Subiectele care merită atenție azi, din răspunsurile tale.',
  'Exersează pornește o sesiune din întrebările tale.',
  'La final vezi cât s-a mișcat stăpânirea subiectului.',
] as const;
const TRANSCRIPT = 'Cardul Pentru tine arată Aritmii, cu 10 greșeli din 12 răspunsuri și stăpânire 21%, și Insuficiență cardiacă, neatinsă de 10 zile. Apeși Exersează și rezolvi grile din întrebările tale. La final, stăpânirea la Aritmii urcă de la 21% la 50%, adică 29 de puncte.';

/** O etapă se vede între `from` și `to`, cu intrare și ieșire scurte, derivate din ceas. */
function useStageOpacity(from: number, to: number) {
  const { elapsedMs } = useSceneTime();
  const fadeIn = fraction(elapsedMs, from, 280);
  const fadeOut = to >= DURATION ? 1 : 1 - fraction(elapsedMs, to - 280, 280);
  return Math.min(fadeIn, fadeOut);
}

function Row({ icon, title, meta, action, accent, emphasis = 0 }: { icon: 'weak' | 'stale'; title: string; meta: string; action: string; accent: boolean; emphasis?: number }) {
  const theme = useTheme();
  const Icon = icon === 'weak' ? Target : RotateCcw;
  const tone = icon === 'weak' ? theme.danger : theme.accentText;
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ borderTop: icon === 'stale' ? `1px solid ${theme.border}` : undefined }}>
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: `${tone}18`, color: tone }}>
        <Icon size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold" style={{ color: theme.text }}>{title}</div>
        <div className="truncate text-[11px]" style={{ color: theme.text3 }}>{meta}</div>
      </div>
      <span
        className="flex-shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold"
        style={{
          background: accent ? theme.accent : theme.fillSubtle,
          color: accent ? '#fff' : theme.accentText,
          transform: `scale(${1 + emphasis * 0.08})`,
          outline: emphasis > 0 ? `${Math.round(emphasis * 4)}px solid ${theme.accent}33` : undefined,
        }}
      >
        {action}
      </span>
    </div>
  );
}

function StageCard() {
  const theme = useTheme();
  const { elapsedMs } = useSceneTime();
  const opacity = useStageOpacity(MARKS[0], MARKS[1]);
  const press = fraction(elapsedMs, 2600, 700);
  return (
    <div className="absolute inset-0 flex flex-col justify-center px-3" style={{ opacity }}>
      <div className="mb-1.5 px-1 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: theme.text3 }}>Pentru tine</div>
      <div className="overflow-hidden rounded-[var(--r-md)]" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
        <Row icon="weak" title="Aritmii" meta="10 greșeli din 12 răspunsuri · stăpânire 21%" action="Exersează" accent emphasis={Math.sin(press * Math.PI)} />
        <Row icon="stale" title="Insuficiență cardiacă" meta="Nu l-ai mai atins de 10 zile · stăpânire 86%" action="Exersează" accent={false} />
      </div>
    </div>
  );
}

function StageQuiz() {
  const theme = useTheme();
  const { elapsedMs } = useSceneTime();
  const opacity = useStageOpacity(MARKS[1], MARKS[2]);
  const picked = elapsedMs >= 5400;
  const options = ['Amiodaronă intravenos', 'Cardioversie electrică sincronizată', 'Adenozină în bolus rapid'];
  return (
    <div className="absolute inset-0 flex flex-col justify-center px-4" style={{ opacity }}>
      <div className="mb-2 text-[12px] font-semibold leading-snug" style={{ color: theme.text }}>Tahicardie regulată, QRS larg, hipotensiv. Prima conduită?</div>
      <div className="space-y-1.5">
        {options.map((text, index) => {
          const right = index === 1 && picked;
          return (
            <div
              key={text}
              className="flex items-center gap-2 rounded-[var(--r-sm)] px-2.5 py-1.5 text-[11.5px]"
              style={{ background: right ? `${theme.success}1c` : theme.surface, border: `1px solid ${right ? theme.success : theme.border}`, color: right ? theme.success : theme.text2 }}
            >
              <span className="font-semibold">{'ABC'[index]}</span>
              <span className="min-w-0 flex-1 truncate">{text}</span>
              {right && <Check size={13} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StageProgress() {
  const theme = useTheme();
  const { elapsedMs } = useSceneTime();
  const opacity = useStageOpacity(MARKS[2], DURATION);
  const value = useCountTo(21, 50, MARKS[2] + 500, 1800);
  const gain = fraction(elapsedMs, MARKS[2] + 2300, 400);
  return (
    <div className="absolute inset-0 flex flex-col justify-center px-4" style={{ opacity }}>
      <div className="text-[11px] font-medium" style={{ color: theme.text3 }}>Stăpânirea subiectului</div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[14px] font-semibold" style={{ color: theme.text }}>Aritmii</span>
        <span className="tabular-nums" style={{ color: theme.text }}>
          <span className="text-[12px]" style={{ color: theme.text3 }}>21% → </span>
          <span className="text-[19px] font-semibold">{value}%</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: theme.fillSubtle }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: theme.success }} />
      </div>
      <div className="mt-2 text-[11.5px]" style={{ color: theme.success, opacity: gain }}>+29 puncte față de începutul sesiunii.</div>
    </div>
  );
}

/** „Pentru tine” în 11 secunde: cardul, o sesiune de exersare și progresul de la final. */
export default function FocusCardDemo() {
  return (
    <MicroDemo label="Demonstrație: cardul Pentru tine" transcript={TRANSCRIPT} durationMs={DURATION} marks={MARKS} captions={CAPTIONS}>
      <StageCard />
      <StageQuiz />
      <StageProgress />
    </MicroDemo>
  );
}
